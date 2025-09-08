# src/quantkit/data/eodhd_client.py
from __future__ import annotations

from typing import Literal, Dict, Tuple
from pathlib import Path
import os
import pathlib as p
import pandas as pd
import numpy as np
import requests
from urllib.parse import quote

# optional dependency for YAML mapping
try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover
    yaml = None

from ..env import get_eodhd_api_key
from ..paths import CACHE_EODHD_DIR
from .cache import parquet_read, parquet_write, has_file

BASE = "https://eodhd.com/api"

# ---- Index mapping helpers ---------------------------------------------------

_INDEX_SENTINELS = {"DJUSTC", "SPLRCT"}  # kända indexkoder utan caret

def load_index_map(path: str | p.Path = "config/ticker_index_map.yml") -> Dict[str, str]:
    """
    Läs YAML-map med indexsymboler. Returnerar {input_symbol: eodhd_symbol}.
    Stödjer både rot-nyckel 'map' och direkt nyckel->värde.
    """
    path = p.Path(path)
    if not path.exists() or yaml is None:
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    m = data.get("map", data) or {}
    return {str(k): str(v) for k, v in m.items()}

def is_index_symbol(sym: str, mapping: Dict[str, str]) -> bool:
    """
    Heuristik för att känna igen index:
    - börjar med '^'
    - slutar med '.INDX'
    - explicit i mapping
    - kända sentinel-koder (t.ex. 'DJUSTC', 'SPLRCT')
    """
    return sym.startswith("^") or sym.endswith(".INDX") or sym in mapping or sym in _INDEX_SENTINELS

def resolve_symbol_for_eodhd(
    sym: str,
    *,
    index_handling: str = "map",   # 'map' | 'skip' | 'keep'
    index_map: Dict[str, str] | None = None
) -> Tuple[str | None, bool]:
    """
    Returnerar (symbol_att_anropa, is_index). Om 'skip' och index -> (None, True).
    'map': använd mapping eller best-effort .INDX.
    'keep': behåll symbolen, men om caret och inget suffix -> addera .INDX.
    """
    index_map = index_map or {}
    is_idx = is_index_symbol(sym, index_map)

    if not is_idx:
        return sym, False

    handling = (index_handling or "map").lower()
    if handling == "skip":
        return None, True

    if handling == "keep":
        if sym.endswith(".INDX"):
            return sym, True
        # behåll men bästa gissning om caret
        return (index_map.get(sym) or (f"{sym}.INDX" if sym.startswith("^") else sym)), True

    # default 'map'
    mapped = index_map.get(sym)
    if mapped:
        return mapped, True
    if sym.startswith("^") and not sym.endswith(".INDX"):
        return f"{sym}.INDX", True
    return sym, True

def _index_handling_defaults() -> tuple[str, str]:
    """Plocka defaults från env."""
    return (
        (os.getenv("INDEX_HANDLING") or "map"),
        (os.getenv("INDEX_MAP_PATH") or "config/ticker_index_map.yml"),
    )

# ---- Cache & parsing ---------------------------------------------------------

def _cache_path(symbol: str, timeframe: str) -> Path:
    # cachea på normaliserad symbol
    tf = timeframe.replace("/", "_")
    return CACHE_EODHD_DIR / f"{symbol}__{tf}.parquet"

def _parse_ts_col(df: pd.DataFrame, ts_key: str) -> pd.Series:
    s = df[ts_key]
    # EODHD: intraday => "timestamp" (oftast UNIX sek/ms), daily => "date" (ISO)
    if ts_key == "timestamp":
        if pd.api.types.is_numeric_dtype(s):
            vmax = pd.to_numeric(s, errors="coerce").astype("float64").abs().max()
            unit = "ms" if (pd.notna(vmax) and vmax > 1e12) else "s"
            return pd.to_datetime(s, unit=unit, utc=True, errors="coerce")
        return pd.to_datetime(s, utc=True, errors="coerce")
    else:  # "date"
        return pd.to_datetime(s, utc=True, errors="coerce")

def _to_timeseries_df(data: list[dict]) -> pd.DataFrame:
    """Normalisera EODHD-svar → kolumner: ts (UTC), open, high, low, close, volume."""
    if not data:
        return pd.DataFrame(columns=["ts", "open", "high", "low", "close", "volume"])
    df = pd.DataFrame(data)
    ts_key = "timestamp" if "timestamp" in df.columns else ("date" if "date" in df.columns else None)
    if ts_key is None:
        return pd.DataFrame(columns=["ts", "open", "high", "low", "close", "volume"])
    df["ts"] = _parse_ts_col(df, ts_key)
    cols = ["open", "high", "low", "close", "volume"]
    keep = ["ts"] + [c for c in cols if c in df.columns]
    df = df[keep].copy()
    for c in cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df.dropna(subset=["ts"]).sort_values("ts").reset_index(drop=True)

# ---- Public API --------------------------------------------------------------

def fetch_timeseries(
    symbol: str,
    timeframe: Literal["5m", "1h", "1d"] = "5m",
    api_key: str = "",
    force: bool = False,
    *,
    index_handling: str | None = None,
    index_map_path: str | None = None,
) -> pd.DataFrame:
    """
    Returnerar alltid DF med 'ts'(UTC), open/high/low/close/volume (några kan saknas beroende på källan).
    Cache: storage/cache/eodhd/<normalized_symbol>__<tf>.parquet

    index_handling: 'map' (default), 'skip', 'keep'
    index_map_path: sökväg till YAML med mapping
    """
    # --- symbol-normalisering för index ---
    ih, imp = _index_handling_defaults()
    index_handling = (index_handling or ih).lower()
    index_map_path = (index_map_path or imp)
    idx_map = load_index_map(index_map_path)

    normalized, is_idx = resolve_symbol_for_eodhd(symbol, index_handling=index_handling, index_map=idx_map)
    if normalized is None and is_idx:
        # avbryt tyst (tom df) om man valt skip
        return pd.DataFrame(columns=["ts", "open", "high", "low", "close", "volume"])
    symbol = normalized

    path = _cache_path(symbol, timeframe)
    key = (api_key or get_eodhd_api_key() or "").strip()

    if has_file(path) and not force:
        try:
            df = parquet_read(path)
            if "ts" in df:
                df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
            return df
        except Exception:
            pass  # läs om från nät

    # --- bygg URL efter normalisering ---
    if timeframe == "1d":
        url = f"{BASE}/eod/{quote(symbol, safe='')}"
        params = {"fmt": "json", "api_token": key, "period": "d"}
    else:
        interval = "5m" if timeframe == "5m" else "1h"
        url = f"{BASE}/intraday/{quote(symbol, safe='')}"
        params = {"fmt": "json", "api_token": key, "interval": interval}

    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, list):
        data = []

    df = _to_timeseries_df(data)
    if df.empty:
        # Tom data är ett giltigt läge (t.ex. INDEX_HANDLING=skip)
        return df

    parquet_write(df, path)
    return df
