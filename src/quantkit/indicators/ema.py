from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="ema",
    name="Exponential Moving Average",
    inputs=("close",),
    params=dict(length=20, column="close"),
    outputs=("ema",),
    description="Exponentiellt viktat medelvärde (EMA) över N perioder."
)

def compute(df: pd.DataFrame, length: int = 20, column: str = "close") -> pd.Series:
    s = pd.to_numeric(df[column], errors="coerce")
    out = s.ewm(span=length, adjust=False).mean()
    out.name = f"EMA{length}"
    return out
