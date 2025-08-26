from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="bb",
    name="Bollinger Bands",
    inputs=("close",),
    params=dict(length=20, stdev=2.0),
    outputs=("basis","upper","lower"),
    description="SMA(N) ± K * std(N)."
)

def compute(df: pd.DataFrame, length: int = 20, stdev: float = 2.0) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    basis = c.rolling(length, min_periods=length).mean()
    dev = c.rolling(length, min_periods=length).std(ddof=0)
    upper = basis + stdev * dev
    lower = basis - stdev * dev
    return pd.DataFrame({f"BB_basis{length}": basis, f"BB_upper{length}_{int(stdev)}": upper, f"BB_lower{length}_{int(stdev)}": lower})
