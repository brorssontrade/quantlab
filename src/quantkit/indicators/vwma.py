from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="vwma",
    name="Volume Weighted Moving Average",
    inputs=("close","volume"),
    params=dict(length=20),
    outputs=("vwma",),
    description="(Sum (pris*vol) / Sum vol) över N dagar."
)

def compute(df: pd.DataFrame, length: int = 20) -> pd.Series:
    c = pd.to_numeric(df["close"], errors="coerce")
    v = pd.to_numeric(df["volume"], errors="coerce")
    num = (c * v).rolling(length, min_periods=length).sum()
    den = v.rolling(length, min_periods=length).sum()
    vw = num / (den + 1e-12)
    vw.name = f"VWMA{length}"
    return vw
