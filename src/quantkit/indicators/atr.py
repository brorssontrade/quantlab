from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="atr",
    name="Average True Range",
    inputs=("high","low","close"),
    params=dict(length=14),
    outputs=("atr",),
    description="Volatilitetsmått: glidande medelvärde av True Range."
)

def compute(df: pd.DataFrame, length: int = 14) -> pd.Series:
    h = pd.to_numeric(df["high"], errors="coerce")
    l = pd.to_numeric(df["low"], errors="coerce")
    c = pd.to_numeric(df["close"], errors="coerce")
    prev_c = c.shift(1)
    tr = pd.concat([h-l, (h-prev_c).abs(), (l-prev_c).abs()], axis=1).max(axis=1)
    out = tr.ewm(alpha=1/length, adjust=False).mean()
    out.name = f"ATR{length}"
    return out
