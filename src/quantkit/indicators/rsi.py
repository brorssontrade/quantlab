from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="rsi",
    name="Relative Strength Index",
    inputs=("close",),
    params=dict(length=14),
    outputs=("value",),
    description="RSI enligt Wilder. 0–100; <30 ofta översåld, >70 överköpt."
)

def compute(df: pd.DataFrame, length: int = 14) -> pd.Series:
    c = pd.to_numeric(df["close"], errors="coerce")
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1/length, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1/length, adjust=False).mean()
    rs = up / (dn + 1e-12)
    rsi = 100 - 100/(1 + rs)
    return pd.Series(rsi, index=df.index, name=f"RSI{length}")
