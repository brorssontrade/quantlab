from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="cci",
    name="Commodity Channel Index",
    inputs=("high","low","close"),
    params=dict(length=20, c=0.015),
    outputs=("cci",),
    description="CCI = (TP - SMA(TP,N)) / (c * MAD). TP=(H+L+C)/3."
)

def compute(df: pd.DataFrame, length: int = 20, c: float = 0.015) -> pd.Series:
    h = pd.to_numeric(df["high"], errors="coerce")
    l = pd.to_numeric(df["low"], errors="coerce")
    cl = pd.to_numeric(df["close"], errors="coerce")
    tp = (h + l + cl) / 3.0
    sma_tp = tp.rolling(length, min_periods=length).mean()
    mad = (tp - sma_tp).abs().rolling(length, min_periods=length).mean()
    cci = (tp - sma_tp) / (c * mad + 1e-12)
    cci.name = f"CCI{length}"
    return cci
