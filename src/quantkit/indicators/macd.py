from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="macd",
    name="MACD (12,26,9)",
    inputs=("close",),
    params=dict(fast=12, slow=26, signal=9),
    outputs=("macd","signal","hist"),
    description="MACD = EMA(fast) - EMA(slow); signal = EMA(MACD, signal); hist = MACD - signal."
)

def compute(df: pd.DataFrame, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    ema_fast = c.ewm(span=fast, adjust=False).mean()
    ema_slow = c.ewm(span=slow, adjust=False).mean()
    macd = ema_fast - ema_slow
    sig  = macd.ewm(span=signal, adjust=False).mean()
    hist = macd - sig
    return pd.DataFrame({
        "MACD": macd,
        "MACD_signal": sig,
        "MACD_hist": hist
    }, index=df.index)
