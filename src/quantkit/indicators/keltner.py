from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="keltner",
    name="Keltner Channels",
    inputs=("high","low","close"),
    params=dict(length_ema=20, atr_len=10, atr_mult=2.0),
    outputs=("mid","upper","lower"),
    description="Mitt = EMA(N). Band = mitt ± M * ATR(atr_len)."
)

def compute(df: pd.DataFrame, length_ema: int = 20, atr_len: int = 10, atr_mult: float = 2.0) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    mid = c.ewm(span=length_ema, adjust=False).mean()
    # ATR(atr_len)
    h = pd.to_numeric(df["high"], errors="coerce"); l = pd.to_numeric(df["low"], errors="coerce")
    prev_c = c.shift(1)
    tr = pd.concat([h-l, (h-prev_c).abs(), (l-prev_c).abs()], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1/atr_len, adjust=False).mean()
    upper = mid + atr_mult * atr
    lower = mid - atr_mult * atr
    return pd.DataFrame({f"Keltner_mid_EMA{length_ema}": mid, "Keltner_upper": upper, "Keltner_lower": lower})
