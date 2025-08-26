from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="willr",
    name="Williams %R",
    inputs=("high","low","close"),
    params=dict(length=14),
    outputs=("willr",),
    description="%R = -100 * (Hmax - C)/(Hmax - Lmin) över N dagar."
)

def compute(df: pd.DataFrame, length: int = 14) -> pd.Series:
    h = pd.to_numeric(df["high"], errors="coerce")
    l = pd.to_numeric(df["low"], errors="coerce")
    c = pd.to_numeric(df["close"], errors="coerce")
    hmax = h.rolling(length, min_periods=length).max()
    lmin = l.rolling(length, min_periods=length).min()
    willr = -100 * (hmax - c) / ((hmax - lmin).replace(0, pd.NA))
    willr.name = f"WillR{length}"
    return willr
