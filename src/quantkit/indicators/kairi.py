from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="kairi",
    name="Kairi Relative Index (KRI)",
    inputs=("close",),
    params=dict(length=14),
    outputs=("kairi", "sma"),
    description="KRI = (Close - SMA(N))/SMA(N) * 100. Ledande index, ofta mindre falska divergenser än RSI."
)

def compute(df: pd.DataFrame, length: int = 14) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    ma = c.rolling(length, min_periods=length).mean()
    kri = ((c - ma) / (ma.replace(0, pd.NA))) * 100.0
    return pd.DataFrame({"kairi": kri, "sma": ma}, index=c.index)
