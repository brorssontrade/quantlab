# src/quantkit/data/eodhd_loader.py
from __future__ import annotations
from pathlib import Path
from typing import Literal
import pandas as pd
from .eodhd_client import http_get

DATA_DIR = Path("data/cache/eodhd").resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)

Interval = Literal["1m","5m","15m","30m","60m","1h","EOD"]

def _path(symbol: str, interval: str) -> Path:
    fname = f"{symbol.replace('/','_').replace(':','_')}.{interval}.parquet"
    return DATA_DIR / fname

def _parse(rows) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["ts","open","high","low","close","volume"])
    df = pd.DataFrame(rows)
    if "datetime" in df.columns and "ts" not in df.columns:
        df = df.rename(columns={"datetime":"ts"})
    if "date" in df.columns and "ts" not in df.columns:
        df = df.rename(columns={"date":"ts"})
    for c in ["open","high","low","close","volume"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
        elif c.capitalize() in df.columns:
            df[c] = pd.to_numeric(df[c.capitalize()], errors="coerce")
    df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
    df = df.dropna(subset=["ts"]).sort_values("ts")
    return df[["ts","open","high","low","close","volume"]]

def load_intraday(symbol: str, interval: Interval = "5m",
                  days: int = 30, bootstrap_days: int = 500) -> pd.DataFrame:
    p = _path(symbol, interval)
    cached = pd.read_parquet(p) if p.exists() else pd.DataFrame()
    if cached.empty:
        from_date = (pd.Timestamp.utcnow() - pd.Timedelta(days=bootstrap_days)).date().isoformat()
    else:
        from_date = cached["ts"].max().date().isoformat()
    rows = http_get(f"intraday/{symbol}", dict(interval=interval, from_=from_date))
    fresh = _parse(rows)
    out = fresh if cached.empty else pd.concat([cached, fresh]).drop_duplicates("ts").sort_values("ts")
    if days and days > 0:
        cutoff = pd.Timestamp.utcnow().tz_localize("UTC") - pd.Timedelta(days=days)
        out = out[out["ts"] >= cutoff]
    out.to_parquet(p, index=False)
    return out

def load_eod(symbol: str, years: int = 5) -> pd.DataFrame:
    p = _path(symbol, "EOD")
    cached = pd.read_parquet(p) if p.exists() else pd.DataFrame()
    if cached.empty:
        from_date = (pd.Timestamp.utcnow() - pd.DateOffset(years=years)).date().isoformat()
    else:
        from_date = cached["ts"].max().date().isoformat()
    rows = http_get(f"eod/{symbol}", dict(from_=from_date))
    fresh = _parse(rows)
    out = fresh if cached.empty else pd.concat([cached, fresh]).drop_duplicates("ts").sort_values("ts")
    out.to_parquet(p, index=False)
    return out

def load_bars(symbol: str, *, interval: str = "5m", days: int = 30) -> pd.DataFrame:
    """Kompatibel wrapper som din CLI importerar."""
    if interval.upper() == "EOD":
        # ungefärlig år-från-dagar
        yrs = max(1, int((days or 252)/252))
        return load_eod(symbol, years=yrs)
    return load_intraday(symbol, interval=interval, days=days)
