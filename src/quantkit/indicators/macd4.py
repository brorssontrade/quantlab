from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="macd4",
    name="4MACD (LB)",
    inputs=("close",),
    params=dict(mult_b=4.3, mult_y=1.4),
    outputs=("MACDBlue","MACDRed","MACDYellow","MACDGreen"),
    description="Fyra MACD-liknande histogram enligt LazyBear: Blue/Red/Yellow/Green."
)

def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()

def compute(df: pd.DataFrame, mult_b: float = 4.3, mult_y: float = 1.4) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    ema5, ema8, ema10, ema14, ema16, ema17 = _ema(c,5), _ema(c,8), _ema(c,10), _ema(c,14), _ema(c,16), _ema(c,17)

    ema17_14 = ema17 - ema14
    ema17_8  = ema17 - ema8
    ema10_16 = ema10 - ema16
    ema5_10  = ema5  - ema10

    MACDBlue   = mult_b * (ema17_14 - _ema(ema17_14, 5))
    MACDRed    = (ema17_8   - _ema(ema17_8,   5))
    MACDYellow = mult_y * (ema10_16 - _ema(ema10_16, 5))
    MACDGreen  = (ema5_10   - _ema(ema5_10,   5))

    return pd.DataFrame({
        "MACDBlue": MACDBlue,
        "MACDRed": MACDRed,
        "MACDYellow": MACDYellow,
        "MACDGreen": MACDGreen
    }, index=df.index)
