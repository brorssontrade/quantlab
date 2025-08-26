from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="zlema",
    name="Zero-lag EMA (approx)",
    inputs=("close",),
    params=dict(length=10, slow=30),
    outputs=("zlema","ema_fast","ema_slow"),
    description="ZLEMA ≈ EMA + (EMA-EMA(EMA)). Används som snabb EMA mot en långsammare EMA."
)

def compute(df: pd.DataFrame, length: int = 10, slow: int = 30) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    ema1 = c.ewm(span=length, adjust=False).mean()
    ema2 = ema1.ewm(span=length, adjust=False).mean()
    zle  = ema1 + (ema1 - ema2)
    ema_slow = c.ewm(span=slow, adjust=False).mean()
    return pd.DataFrame({"zlema": zle, "ema_fast": ema1, "ema_slow": ema_slow}, index=df.index)
