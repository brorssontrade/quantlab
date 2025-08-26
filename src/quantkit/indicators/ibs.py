from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="ibs",
    name="Internal Bar Strength",
    inputs=("close","low","high"),
    params={},
    outputs=("ibs",),
    description="(Close-Low)/(High-Low), 0..1; lägre = närmare dagslägsta."
)

def compute(df: pd.DataFrame) -> pd.Series:
    c = pd.to_numeric(df["close"], errors="coerce")
    l = pd.to_numeric(df["low"], errors="coerce")
    h = pd.to_numeric(df["high"], errors="coerce")
    rng = (h - l).replace(0, pd.NA)
    ibs = (c - l) / rng
    ibs.name = "IBS"
    return ibs
