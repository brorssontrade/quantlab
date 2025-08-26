from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="adr",
    name="Average Daily Range",
    inputs=("high","low"),
    params=dict(length=20),
    outputs=("adr",),
    description="Genomsnitt av (High-Low) över N dagar."
)

def compute(df: pd.DataFrame, length: int = 20) -> pd.Series:
    rng = (pd.to_numeric(df["high"], errors="coerce") - pd.to_numeric(df["low"], errors="coerce")).abs()
    out = rng.rolling(length, min_periods=length).mean()
    out.name = f"ADR{length}"
    return out
