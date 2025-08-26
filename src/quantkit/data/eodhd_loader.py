from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Iterable

import pandas as pd
import requests

from .cache import read_cache, write_cache, merge_bars

# ---------------------------------------------------------------------
# EODHD loader
#
# Mål:
# - Hämta maximal historik FÖRSTA gången (per symbol/interval)
# - Därefter endast delta/inkrementella hämtningar
# - Cacha lokalt via cache-modulen (Parquet)
# - Robust mot temporära HTTP-fel (retry/backoff) + enkel debug-utskrift
# ---------------------------------------------------------------------

BASE = "https://eodhd.com/api"

# Hur mycket historik ska hämtas första gången?
# EOD:   ~9000 dagar ~ 24.6 år (styr via env EODHD_EOD_DAYS)
# Intra: 10 dagar (styr via env EODHD_INTRA_DAYS)
EOD_BACKFILL_DAYS = int(os.getenv("EODHD_EOD_DAYS", "9000"))
INTRA_BACKFILL_DAYS = int(os.getenv("EODHD_INTRA_DAYS", "10"))

# Minimal paus mellan requests för att inte slå i rate limits
REQUEST_SLEEP_SEC = float(os.getenv("EODHD_REQ_SLEEP", "0.2"))

# ---------------------------------------------------------------------
# Utils
# ---------------------------------------------------------------------


def _api_key() -> str:
    k = os.getenv("EODHD_API_KEY", "").strip()
    if k:
        return k

    # Backup: secrets/eodhd_key.txt
    p = Path("secrets/eodhd_key.txt")
    if p.exists():
        t = p.read_text(encoding="utf-8").strip()
        if t:
            return t

    raise RuntimeError(
        "EODHD_API_KEY saknas. Sätt t.ex. $env:EODHD_API_KEY = '<din_token>' "
        "eller lägg nyckeln i secrets/eodhd_key.txt"
    )


def _req(url: str, *, retries: int = 3, debug: bool = False) -> list[dict]:
    last_exc: Exception | None = None
    for i in range(retries):
        if debug:
            print("GET", url)
        try:
            r = requests.get(url, timeout=30)
            if debug:
                print("STATUS", r.status_code)
            if r.ok:
                try:
                    js = r.json()
                except Exception as e:
                    raise RuntimeError(f"JSON parse-fel: {e}. Body head: {r.text[:200]}")
                time.sleep(REQUEST_SLEEP_SEC)
                return js if isinstance(js, list) else []
            else:
                last_exc = RuntimeError(f"EODHD error {r.status_code}: {r.text[:300]}")
        except Exception as e:
            last_exc = e
        # backoff
        time.sleep(0.7 * (i + 1))
    assert last_exc is not None
    raise last_exc


def _norm_df(data: Iterable[dict]) -> pd.DataFrame:
    df = pd.DataFrame(list(data) if data else [])
    if df.empty:
        return df

    df.rename(columns=str.lower, inplace=True)

    # Tidsstämpel -> "ts"
    if "timestamp" in df.columns:
        df["ts"] = pd.to_datetime(df["timestamp"], unit="s", utc=True, errors="coerce")
    elif "datetime" in df.columns:
        df["ts"] = pd.to_datetime(df["datetime"], utc=True, errors="coerce")
    else:
        # EOD: "date"
        df["ts"] = pd.to_datetime(df.get("date"), utc=True, errors="coerce")

    # Volume alias
    if "volume" not in df.columns and "vol" in df.columns:
        df["volume"] = pd.to_numeric(df["vol"], errors="coerce")

    have = [c for c in ("ts", "open", "high", "low", "close", "volume") if c in df.columns]
    out = df[have].dropna(subset=["ts"]).sort_values("ts").reset_index(drop=True)

    for c in ("open", "high", "low", "close", "volume"):
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce")

    return out


def _date_range_days(days: int) -> tuple[str, str]:
    end = pd.Timestamp.utcnow().normalize()
    start = end - pd.Timedelta(days=days + 5)  # liten buffert
    return start.date().isoformat(), end.date().isoformat()


def _unix_range_days(days: int) -> tuple[int, int]:
    now = int(time.time())
    start = int((pd.Timestamp.utcnow() - pd.Timedelta(days=days + 5)).timestamp())
    return start, now


# ---------------------------------------------------------------------
# EOD (daglig)
# ---------------------------------------------------------------------


def _fetch_eod(symbol: str, start: str, end: str, *, debug: bool = False) -> pd.DataFrame:
    url = f"{BASE}/eod/{symbol}?from={start}&to={end}&order=a&fmt=json&api_token={_api_key()}"
    data = _req(url, debug=debug)
    return _norm_df(data)


def load_eod(symbol: str, *, days: int | None = None, debug: bool = False) -> pd.DataFrame:
    """
    Laddar EOD-data till cache och returnerar allt som finns i cachen.
    - Finns ingen cache: backfillar ~9000 dagar (eller 'days' om angivet).
    - Finns cache: hämtar endast nya rader (sista ts + 1 dag .. idag).
    """
    cache = read_cache(symbol, "EOD")
    if cache is None or cache.empty or "ts" not in cache.columns:
        # Backfill första gången
        d = days if days is not None else EOD_BACKFILL_DAYS
        start, end = _date_range_days(d)
        fresh = _fetch_eod(symbol, start, end, debug=debug)
        if not fresh.empty:
            write_cache(symbol, "EOD", fresh)
        return fresh

    # Delta
    last_ts = pd.to_datetime(cache["ts"]).dropna().max()
    start = (last_ts + pd.Timedelta(days=1)).date().isoformat()
    end = pd.Timestamp.utcnow().date().isoformat()
    if start > end:
        # redan uppdaterad
        return cache
    fresh = _fetch_eod(symbol, start, end, debug=debug)
    merged = merge_bars(cache, fresh) if not fresh.empty else cache
    write_cache(symbol, "EOD", merged)
    return merged


# ---------------------------------------------------------------------
# Intraday
# ---------------------------------------------------------------------


def _fetch_intraday(symbol: str, interval: str, unix_from: int, unix_to: int, *, debug: bool = False) -> pd.DataFrame:
    url = (
        f"{BASE}/intraday/{symbol}?interval={interval}&from={unix_from}&to={unix_to}"
        f"&fmt=json&api_token={_api_key()}"
    )
    data = _req(url, debug=debug)
    return _norm_df(data)


def load_intraday(symbol: str, *, interval: str = "5m", days: int | None = None, debug: bool = False) -> pd.DataFrame:
    """
    Laddar intraday-data till cache och returnerar allt som finns i cachen.
    - Finns ingen cache: backfillar 'INTRA_BACKFILL_DAYS' (eller 'days' om angivet)
    - Finns cache: hämtar endast delta från sista ts + 1s
    """
    interval = interval.lower()
    cache = read_cache(symbol, interval)

    unix_to = int(time.time())

    if cache is None or cache.empty or "ts" not in cache.columns:
        d = days if days is not None else INTRA_BACKFILL_DAYS
        unix_from, _ = _unix_range_days(d)
        fresh = _fetch_intraday(symbol, interval, unix_from, unix_to, debug=debug)
        if not fresh.empty:
            write_cache(symbol, interval, fresh)
        return fresh

    last_ts = pd.to_datetime(cache["ts"]).dropna().max()
    unix_from = int((last_ts.to_pydatetime().timestamp())) + 1

    fresh = _fetch_intraday(symbol, interval, unix_from, unix_to, debug=debug)
    merged = merge_bars(cache, fresh) if not fresh.empty else cache
    write_cache(symbol, interval, merged)
    return merged


# ---------------------------------------------------------------------
# Wrapper
# ---------------------------------------------------------------------


def load_bars(
    symbol: str,
    *,
    interval: str = "EOD",
    days: int | None = None,
    debug: bool = False,
) -> pd.DataFrame:
    """
    Extern API:
    - interval="EOD"           → daglig data (backfill första gången)
    - interval="1m|5m|15m|1h"  → intraday (backfill första gången)
    - days=None                → använd globala defaults (EOD 9000 / intra 10)
    """
    if interval.upper() == "EOD":
        return load_eod(symbol, days=days, debug=debug)
    else:
        return load_intraday(symbol, interval=interval, days=days, debug=debug)
