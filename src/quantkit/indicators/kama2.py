from __future__ import annotations
import numpy as np
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="kama2",
    name="Kaufman Adaptive Moving Average (LazyBear)",
    inputs=("close",),
    params=dict(amaLength=10, fastend=0.666, slowend=0.0645),
    outputs=("kama", "smooth"),
    description="KAMA: smooth=(ER*(fast-slow)+slow)^2; kama_t = kama_{t-1} + smooth*(price - kama_{t-1})."
)

def compute(df: pd.DataFrame, amaLength: int = 10, fastend: float = 0.666, slowend: float = 0.0645) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    diff = (c - c.shift(1)).abs()
    signal = (c - c.shift(amaLength)).abs()
    noise = diff.rolling(amaLength, min_periods=amaLength).sum()
    er = np.where(noise.fillna(0) != 0, (signal / noise).fillna(0), 1.0)
    smooth = (er * (fastend - slowend) + slowend) ** 2
    smooth = pd.Series(smooth, index=c.index)

    out = np.empty(len(c)); out[:] = np.nan
    for i in range(len(c)):
        x = c.iat[i]
        if i == 0 or np.isnan(x):
            out[i] = x
        else:
            sc = smooth.iat[i] if not np.isnan(smooth.iat[i]) else smooth.iat[i-1]
            prev = out[i-1] if not np.isnan(out[i-1]) else x
            out[i] = prev + sc * (x - prev)
    kama = pd.Series(out, index=c.index)
    return pd.DataFrame({"kama": kama, "smooth": smooth}, index=c.index)
