# src/quantkit/data/eodhd_client.py
from __future__ import annotations
from typing import Literal
from pathlib import Path
import pandas as pd
import numpy as np
import requests

from ..env import get_eodhd_api_key
from ..paths import CACHE_EODHD_DIR
from .cache import parquet_read, parquet_write, has_file

BASE = "https://eodhd.com/api"

def _cache_path(symbol: str, timeframe: str) -> Path:
    tf = timeframe.replace("/", "_")
    return CACHE_EODHD_DIR / f"{symbol}__{tf}.parquet"

def _parse_ts_col(df: pd.DataFrame, ts_key: str) -> pd.Series:
    s = df[ts_key]
    # EODHD: intraday => "timestamp" (vanligen UNIX-sek), daily => "date" (ISO)
    if ts_key == "timestamp":
        if pd.api.types.is_numeric_dtype(s):
            # skilj sek/ms (ms om värdena är väldigt stora)
            vmax = pd.to_numeric(s, errors="coerce").astype("float64").abs().max()
            unit = "ms" if (pd.notna(vmax) and vmax > 1e12) else "s"
            return pd.to_datetime(s, unit=unit, utc=True, errors="coerce")
        # fallback om API skulle ge sträng
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

def fetch_timeseries(
    symbol: str,
    timeframe: Literal["5m", "1h", "1d"] = "5m",
    api_key: str = "",
    force: bool = False,
) -> pd.DataFrame:
    """
    Returnerar alltid DF med 'ts'(UTC), open/high/low/close/volume (några kan saknas beroende på källan).
    Cache: storage/cache/eodhd/<symbol>__<tf>.parquet
    """
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

    if timeframe == "1d":
        url = f"{BASE}/eod/{symbol}?fmt=json&api_token={key}&period=d"
    else:
        interval = "5m" if timeframe == "5m" else "1h"
        url = f"{BASE}/intraday/{symbol}?fmt=json&api_token={key}&interval={interval}"

    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, list):
        data = []

    df = _to_timeseries_df(data)
    if df.empty:
        raise RuntimeError(f"No data from EODHD for {symbol} {timeframe}")

    parquet_write(df, path)
    return df
