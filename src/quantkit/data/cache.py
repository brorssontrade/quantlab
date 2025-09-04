# src/quantkit/data/cache.py
from __future__ import annotations
from pathlib import Path
import pandas as pd

# Om du vill: centralisera standard-cachekatalogen
try:
    from ..paths import CACHE_EODHD_DIR
except Exception:
    CACHE_EODHD_DIR = Path("storage/cache/eodhd")

def _ensure_parent(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)

def has_file(path: str | Path) -> bool:
    return Path(path).exists()

def parquet_read(path: str | Path) -> pd.DataFrame:
    """Läs Parquet om den finns, annars tom DF (ingen exception)."""
    p = Path(path)
    if not p.exists():
        return pd.DataFrame()
    return pd.read_parquet(p)

def parquet_write(df: pd.DataFrame, path: str | Path) -> None:
    """Skriv Parquet och skapa kataloger vid behov."""
    p = Path(path)
    _ensure_parent(p)
    df.to_parquet(p, index=False)

def cache_path(symbol: str, timeframe: str) -> Path:
    """Standardnamn i cachekatalogen, t.ex. AAPL.US__5m.parquet."""
    return Path(CACHE_EODHD_DIR) / f"{symbol}__{timeframe}.parquet"

def append_unique_on_ts(df_new: pd.DataFrame, path: str | Path, ts_col: str = "ts") -> pd.DataFrame:
    """
    Append df_new till Parquet på 'path', men endast rader med ts > max(ts) i befintlig fil.
    Returnerar DF:en som skrevs (gamla + nya).
    """
    df_old = parquet_read(path)
    if df_old.empty:
        out = df_new.copy()
    else:
        if ts_col in df_old.columns and ts_col in df_new.columns:
            last_ts = pd.to_datetime(df_old[ts_col]).max()
            df_new = df_new[pd.to_datetime(df_new[ts_col]) > last_ts]
        out = pd.concat([df_old, df_new], ignore_index=True) if not df_new.empty else df_old
    parquet_write(out, path)
    return out
