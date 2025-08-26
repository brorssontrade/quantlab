from __future__ import annotations
from pathlib import Path
import pandas as pd

CACHE_ROOT = Path("storage/cache/eodhd")

def cache_path(symbol: str, interval: str) -> Path:
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    safe = symbol.replace("/", "_").replace(":", "_")
    return CACHE_ROOT / f"{safe}__{interval}.parquet"

def read_cache(symbol: str, interval: str) -> pd.DataFrame | None:
    p = cache_path(symbol, interval)
    if not p.exists():
        return None
    try:
        df = pd.read_parquet(p)
        # säkerställ ts som datetime
        if "ts" in df.columns:
            df["ts"] = pd.to_datetime(df["ts"], utc=True)
        return df
    except Exception:
        return None

def write_cache(symbol: str, interval: str, df: pd.DataFrame) -> None:
    if df is None or df.empty:
        return
    p = cache_path(symbol, interval)
    # Skriv ordnat och utan dubbletter
    df2 = df.copy()
    if "ts" in df2.columns:
        df2 = df2.drop_duplicates(subset=["ts"]).sort_values("ts")
    df2.to_parquet(p, index=False)

def merge_bars(old: pd.DataFrame | None, new: pd.DataFrame) -> pd.DataFrame:
    if old is None or old.empty:
        return new
    df = pd.concat([old, new], ignore_index=True)
    if "ts" in df.columns:
        df = df.drop_duplicates(subset=["ts"]).sort_values("ts")
    return df
