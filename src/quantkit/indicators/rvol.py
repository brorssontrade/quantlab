from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="rvol",
    name="Relative Volume (RVOL)",
    inputs=("volume",),
    params=dict(length=20),
    outputs=("rvol",),
    description="Dagens volym relativt snittet på N dagar."
)

def compute(df: pd.DataFrame, length: int = 20) -> pd.DataFrame:
    v = pd.to_numeric(df["volume"], errors="coerce").fillna(0.0)
    ma = v.rolling(int(length), min_periods=int(length)).mean().replace(0, pd.NA)
    r = v / ma
    return pd.DataFrame({"rvol": r})
