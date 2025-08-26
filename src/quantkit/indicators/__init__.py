from __future__ import annotations
import pandas as pd
from .registry import ensure_populated, list_indicators, compute, write_html_catalog, normalize_ohlcv

# (valfria helper för strategier)
def rsi(series: pd.Series, length: int = 14) -> pd.Series:
    s = pd.to_numeric(series, errors="coerce")
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1/length, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1/length, adjust=False).mean()
    rs = up / (dn + 1e-12)
    return (100 - 100/(1 + rs)).rename(f"RSI{length}")
