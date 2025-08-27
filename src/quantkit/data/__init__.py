from __future__ import annotations
from pathlib import Path
import io, os, pandas as pd, requests
from .eodhd_loader import load_bars
from .market_hours import is_market_open, next_open_close_utc

__all__ = ["load_bars","is_market_open","next_open_close_utc","load_cached_csv"]

def _cache_filename(symbol: str, interval: str) -> str:
    return f"{symbol.replace('/', '_')}__{interval}.csv"

def load_cached_csv(symbol: str, interval: str, *, prefer_remote: bool = True) -> pd.DataFrame:
    fn = _cache_filename(symbol, interval)
    if prefer_remote:
        base = os.getenv("QK_DATA_BASE", "").strip()
        if not base:
            repo = os.getenv("GITHUB_REPOSITORY", "").strip()
            branch = os.getenv("QK_DATA_BRANCH", "data").strip() or "data"
            if repo:
                base = f"https://raw.githubusercontent.com/{repo}/{branch}/data/cache/eodhd"
        if base:
            try:
                r = requests.get(f"{base}/{fn}", timeout=20, headers={"User-Agent":"quantkit/loader"})
                if r.ok and r.text.strip():
                    return pd.read_csv(io.StringIO(r.text), parse_dates=["ts"])
            except Exception:
                pass
    p = Path("data/cache/eodhd") / fn
    if p.exists():
        return pd.read_csv(p, parse_dates=["ts"])
    return pd.DataFrame(columns=["ts","open","high","low","close","volume"])
