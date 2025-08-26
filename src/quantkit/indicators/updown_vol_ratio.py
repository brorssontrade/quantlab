from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="udvr",
    name="Up/Down Volume Ratio",
    inputs=("close","volume"),
    params=dict(length=20),
    outputs=("ratio",),
    description="(Sum vol på uppdagar) / (Sum vol på neddagar) över N dagar."
)

def compute(df: pd.DataFrame, length: int = 20) -> pd.Series:
    c = pd.to_numeric(df["close"], errors="coerce")
    v = pd.to_numeric(df["volume"], errors="coerce")
    up = (c.diff() > 0).astype(int)
    down = (c.diff() < 0).astype(int)
    up_vol = (v * up).rolling(length, min_periods=1).sum()
    dn_vol = (v * down).rolling(length, min_periods=1).sum()
    ratio = up_vol / (dn_vol + 1e-12)
    ratio.name = f"UpDownVolRatio{length}"
    return ratio
