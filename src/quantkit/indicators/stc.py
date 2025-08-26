from __future__ import annotations
import numpy as np, pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="stc", name="Schaff Trend Cycle",
    inputs=("close",), params=dict(length=10, fast=23, slow=50, smooth=0.5),
    outputs=("stc",), description="STC via MACD + dubbel stochastic smoothing."
)

def compute(df: pd.DataFrame, length:int=10, fast:int=23, slow:int=50, smooth:float=0.5) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    fastMA = c.ewm(span=fast, adjust=False).mean()
    slowMA = c.ewm(span=slow, adjust=False).mean()
    macd = fastMA - slowMA

    v1 = macd.rolling(length).min()
    v2 = macd.rolling(length).max() - v1
    f1 = np.where(v2>0, (macd - v1)/v2 * 100.0, np.nan)
    pf = pd.Series(f1, index=c.index).ewm(alpha=smooth, adjust=False).mean()

    v3 = pf.rolling(length).min()
    v4 = pf.rolling(length).max() - v3
    f2 = np.where(v4>0, (pf - v3)/v4 * 100.0, np.nan)
    pff = pd.Series(f2, index=c.index).ewm(alpha=smooth, adjust=False).mean()
    return pd.DataFrame({"stc": pff})
