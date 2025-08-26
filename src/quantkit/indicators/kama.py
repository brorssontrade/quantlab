from __future__ import annotations
import numpy as np
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="kama",
    name="Kaufman Adaptive Moving Average",
    inputs=("close",),
    params=dict(length=10, fast=0.666, slow=0.0645),
    outputs=("kama",),
    description="Kaufman AMA (adaptiv jämfört med trend/range)."
)

def compute(df: pd.DataFrame, length: int = 10, fast: float = 0.666, slow: float = 0.0645) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    diff = c.diff().abs()
    signal = (c - c.shift(int(length))).abs()
    noise = diff.rolling(int(length), min_periods=int(length)).sum()
    er = (signal / noise).fillna(0.0).clip(lower=0, upper=1)
    sc = (er * (fast - slow) + slow) ** 2
    kama = pd.Series(index=c.index, dtype=float)
    prev = np.nan
    for i, (px, a) in enumerate(zip(c, sc)):
        prev = (px if np.isnan(prev) else prev + a * (px - prev))
        kama.iat[i] = prev
    return pd.DataFrame({"kama": kama})
