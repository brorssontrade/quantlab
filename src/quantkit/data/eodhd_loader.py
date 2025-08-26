from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Tuple, List, Dict

import pandas as pd
import requests
from zoneinfo import ZoneInfo

from .cache import read_cache, write_cache, merge_bars

# Försök ladda .env om paketet finns (frivilligt)
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass


BASE = "https://eodhd.com/api"


# ---------- Hjälpare ----------

def _key() -> str:
    """
    Hämta EODHD_API_KEY från miljövariabler.
    Fallback: secrets/eodhd_key.txt om du vill slippa env i dev.
    """
    k = os.getenv("EODHD_API_KEY", "").strip()
    if k:
        return k
    p = Path("secrets/eodhd_key.txt")
    if p.exists():
        t = p.read_text(encoding="utf-8").strip()
        if t:
            return t
    raise RuntimeError("EODHD_API_KEY saknas. Sätt t.ex. $env:EODHD_API_KEY = '<din_token>' "
                       "eller lägg nyckeln i secrets/eodhd_key.txt")


def _mask_token(url: str) -> str:
    """Maska api_token i loggutskrifter."""
    if "api_token=" not in url:
        return url
    try:
        head, tail = url.split("api_token=", 1)
        token = tail.split("&", 1)[0]
        masked = "••••" if token else ""
        rest = "" if "&" not in tail else "&" + tail.split("&", 1)[1]
        return f"{head}api_token={masked}{rest}"
    except Exception:
        return url


def _req(url: str, debug: bool = False) -> List[Dict]:
    if debug:
        print("GET", _mask_token(url))
    r = requests.get(url, timeout=30)
    if debug:
        print("STATUS", r.status_code)
    if not r.ok:
        raise RuntimeError(f"EODHD error {r.status_code}: {r.text[:300]}")
    try:
        return r.json()
    except Exception as e:
        raise RuntimeError(f"JSON parse-fel: {e}. Body head: {r.text[:200]}")


def _date_range_days(days: int) -> Tuple[str, str]:
    """Returnera (start_iso, end_iso) med litet överhäng."""
    end = pd.Timestamp.utcnow().normalize()
    start = end - pd.Timedelta(days=days + 5)
    return start.date().isoformat(), end.date().isoformat()


def _unix_range_days(days: int) -> Tuple[int, int]:
    now = int(time.time())
    start = int((pd.Timestamp.utcnow() - pd.Timedelta(days=days + 5)).timestamp())
    return start, now


def _to_df(data: List[Dict]) -> pd.DataFrame:
    """Normalisera EODHD JSON till kolumner: ts, open, high, low, close, volume (ts i UTC)."""
    df = pd.DataFrame(data or [])
    if df.empty:
        return df
    df.rename(columns=str.lower, inplace=True)

    # tidsstämpel → "ts"
    if "timestamp" in df.columns:
        df["ts"] = pd.to_datetime(df["timestamp"], unit="s", utc=True, errors="coerce")
    elif "datetime" in df.columns:
        df["ts"] = pd.to_datetime(df["datetime"], utc=True, errors="coerce")
    else:
        # EOD har "date"
        df["ts"] = pd.to_datetime(df.get("date"), utc=True, errors="coerce")

    # volume alias
    if "volume" not in df.columns and "vol" in df.columns:
        df["volume"] = pd.to_numeric(df["vol"], errors="coerce")

    cols = [c for c in ["ts", "open", "high", "low", "close", "volume"] if c in df.columns]
    out = df[cols].dropna(subset=["ts"]).sort_values("ts").reset_index(drop=True)
    for c in ("open", "high", "low", "close", "volume"):
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce")
    return out


# ---------- Marknadstider (enkel gating) ----------

def _guess_market(symbol: str) -> tuple[str, Tuple[int, int], Tuple[int, int]]:
    """
    Returnerar (tz, (open_hour, open_min), (close_hour, close_min))
    Stöd: .US (NYSE/Nasdaq), .ST (Stockholm). Övriga -> 'UTC' = alltid öppet.
    """
    if symbol.endswith(".US"):
        return "America/New_York", (9, 30), (16, 0)
    if symbol.endswith(".ST"):
        return "Europe/Stockholm", (9, 0), (17, 30)
    return "UTC", (0, 0), (23, 59)


def _market_is_open(symbol: str, now_utc: pd.Timestamp | None = None) -> bool:
    tz, (oh, om), (ch, cm) = _guess_market(symbol)
    now_utc = now_utc or pd.Timestamp.utcnow().tz_localize("UTC")
    now_local = now_utc.tz_convert(ZoneInfo(tz))
    if tz != "UTC":
        if now_local.weekday() > 4:  # mån=0..sön=6
            return False
    tod = now_local.time()
    open_ok = (tod >= pd.Timestamp(hour=oh, minute=om).time())
    close_ok = (tod < pd.Timestamp(hour=ch, minute=cm).time())
    return open_ok and close_ok


# ---------- EOD (daglig) ----------

def _fetch_eod_between(symbol: str, start_iso: str, end_iso: str, debug: bool = False) -> pd.DataFrame:
    url = f"{BASE}/eod/{symbol}?from={start_iso}&to={end_iso}&order=a&fmt=json&api_token={_key()}"
    data = _req(url, debug=debug)
    return _to_df(data)


def load_eod(
    symbol: str,
    *,
    days: int = 750,
    start: str | None = None,
    end: str | None = None,
    debug: bool = False
) -> pd.DataFrame:
    """
    Direkt EOD-hämtning (utan disk-cache) för ett intervall eller 'days' bakåt.
    Wrappern load_bars använder istället ensure_eod_history för cache + delta.
    """
    if not start or not end:
        start, end = _date_range_days(days)
    df = _fetch_eod_between(symbol, start, end, debug=debug)
    if df.empty and debug:
        print(f"[EOD] {symbol}: tomt svar")
    return df


def ensure_eod_history(symbol: str, *, days: int, debug: bool = False) -> pd.DataFrame:
    """
    Backfilla EOD-historik till minst 'days' och skriv till cache (interval='EOD').
    Vid senare körningar hämtas endast delta och cachen trimmas till fönstret.
    """
    cached = read_cache(symbol, "EOD")
    today_iso = pd.Timestamp.utcnow().normalize().date().isoformat()

    if cached is None or cached.empty:
        start_iso, _ = _date_range_days(days)
        fresh = _fetch_eod_between(symbol, start_iso, today_iso, debug=debug)
        merged = merge_bars(None, fresh)
        if merged is not None and not merged.empty:
            write_cache(symbol, "EOD", merged)
            if debug:
                print(f"✔ {symbol} EOD: {len(merged)} rader (full backfill)")
        return merged if merged is not None else pd.DataFrame()

    # delta framåt
    last_ts = pd.to_datetime(cached["ts"], utc=True, errors="coerce").max()
    since = (last_ts + pd.Timedelta(days=1)).date().isoformat()
    latest = _fetch_eod_between(symbol, since, today_iso, debug=debug)
    merged = merge_bars(cached, latest)

    if merged is not None and not merged.empty:
        window_start = pd.Timestamp.utcnow() - pd.Timedelta(days=days + 5)
        merged = merged[merged["ts"] >= window_start.tz_localize("UTC")]
        write_cache(symbol, "EOD", merged)
        if debug:
            print(f"✔ {symbol} EOD: {len(merged)} rader")
    return merged if merged is not None else cached


# ---------- Intraday (UNIX from/to) ----------

def load_intraday(symbol: str, interval: str, days: int, debug: bool = False) -> pd.DataFrame:
    """
    Icke-cachad enkelhämtning (sällan använd direkt – använd load_intraday_cached).
    """
    frm, to = _unix_range_days(days)
    url = f"{BASE}/intraday/{symbol}?interval={interval}&from={frm}&to={to}&fmt=json&api_token={_key()}"
    data = _req(url, debug=debug)
    return _to_df(data)


def load_intraday_cached(
    symbol: str,
    *,
    interval: str = "5m",
    days: int = 30,
    debug: bool = False,
    respect_market_hours: bool | None = None
) -> pd.DataFrame:
    """
    Cachead intraday-hämtning:
      - Första körning: backfill upp till 'days' (så långt EODHD tillåter)
      - Senare körningar: endast delta (från sista ts + 1s → nu)
      - Marknadsgating: på som default. Styr med env QK_GATE_BY_MARKET_HOURS=0 för att stänga av.
    """
    if respect_market_hours is None:
        respect_market_hours = os.getenv("QK_GATE_BY_MARKET_HOURS", "1") != "0"

    # Om vi inte vill slå mot API när marknaden är stängd
    if respect_market_hours and not _market_is_open(symbol):
        cached = read_cache(symbol, interval)
        if cached is None:
            return pd.DataFrame(columns=["ts", "open", "high", "low", "close", "volume"])
        window_start = pd.Timestamp.utcnow() - pd.Timedelta(days=days + 5)
        cached["ts"] = pd.to_datetime(cached["ts"], utc=True, errors="coerce")
        out = cached[cached["ts"] >= window_start.tz_localize("UTC")].reset_index(drop=True)
        if debug:
            print(f"⏸ {symbol} {interval}: market closed – använder cache ({len(out)} rader)")
        return out

    cached = read_cache(symbol, interval)
    window_start = pd.Timestamp.utcnow() - pd.Timedelta(days=days + 5)
    now_unix = int(pd.Timestamp.utcnow().timestamp())

    if cached is not None and not cached.empty and "ts" in cached.columns:
        last_ts = pd.to_datetime(cached["ts"], utc=True, errors="coerce").max()
        unix_from = int(max(last_ts + pd.Timedelta(seconds=1), window_start).timestamp())
        if debug:
            start_dt = pd.to_datetime(unix_from, unit="s", utc=True)
            print(f"Δ {symbol} {interval}: from={start_dt} → now")
    else:
        unix_from = int(window_start.timestamp())
        if debug:
            print(f"⇣ {symbol} {interval}: initial backfill {days}d")

    url = (
        f"{BASE}/intraday/{symbol}?interval={interval}"
        f"&from={unix_from}&to={now_unix}&fmt=json&api_token={_key()}"
    )
    data = _req(url, debug=debug)
    new = _to_df(data)
    merged = merge_bars(cached, new) if new is not None else cached
    if merged is None:
        merged = pd.DataFrame(columns=["ts", "open", "high", "low", "close", "volume"])

    # trimma till fönstret
    if not merged.empty:
        merged["ts"] = pd.to_datetime(merged["ts"], utc=True, errors="coerce")
        merged = merged[merged["ts"] >= window_start.tz_localize("UTC")].reset_index(drop=True)

    write_cache(symbol, interval, merged)
    if debug:
        print(f"✔ {symbol} {interval}: {len(merged)} rader")
    return merged


# ---------- Enhetlig wrapper ----------

def load_bars(
    symbol: str,
    *,
    interval: str = "EOD",
    days: int = 750,
    debug: bool = False,
    cached: bool = True,
    respect_market_hours: bool | None = None
) -> pd.DataFrame:
    """
    Enhetlig ingång:
      - EOD: ensure_eod_history (full historik en gång, sedan delta)
      - Intraday: cache + delta + marknadsgating (om aktiverad)
    """
    if interval.upper() == "EOD":
        return ensure_eod_history(symbol, days=days, debug=debug)

    if cached:
        return load_intraday_cached(
            symbol,
            interval=interval.lower(),
            days=days,
            debug=debug,
            respect_market_hours=respect_market_hours,
        )

    # Ocachead intraday (direkt)
    return load_intraday(symbol, interval=interval.lower(), days=days, debug=debug)
