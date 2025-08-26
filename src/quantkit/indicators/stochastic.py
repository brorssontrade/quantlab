from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="stoch",
    name="Stochastic Oscillator",
    inputs=("high","low","close"),
    params=dict(k_len=14, d_len=3),
    outputs=("k","d"),
    description="%K = (close - minL)/(maxH - minL)*100; %D = SMA(%K, d_len)."
)

def compute(df: pd.DataFrame, k_len: int = 14, d_len: int = 3) -> pd.DataFrame:
    h = pd.to_numeric(df["high"], errors="coerce")
    l = pd.to_numeric(df["low"], errors="coerce")
    c = pd.to_numeric(df["close"], errors="coerce")
    lowest = l.rolling(k_len, min_periods=k_len).min()
    highest = h.rolling(k_len, min_periods=k_len).max()
    k = (c - lowest) / ((highest - lowest).replace(0, pd.NA)) * 100.0
    d = k.rolling(d_len, min_periods=d_len).mean()
    return pd.DataFrame({f"StochK{k_len}": k, f"StochD{d_len}": d})
