from __future__ import annotations
import numpy as np
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="scalper_channel",
    name="Scalper's Channel (LB)",
    inputs=("high", "low", "close"),
    params=dict(length=20, factor=15),
    outputs=("scalper_line", "hi", "lo"),
    description="SMA(close,factor) − ln(π * ATR(factor)), samt Donchian hi/lo över 'length'."
)

def _atr(h: pd.Series, l: pd.Series, c: pd.Series, n: int) -> pd.Series:
    prev_c = c.shift(1)
    tr = pd.concat([h-l, (h-prev_c).abs(), (l-prev_c).abs()], axis=1).max(axis=1)
    # Wilder-RMA approx med EWM(alpha=1/n)
    return tr.ewm(alpha=1/n, adjust=False).mean()

def compute(df: pd.DataFrame, length: int = 20, factor: int = 15) -> pd.DataFrame:
    h = pd.to_numeric(df["high"],  errors="coerce")
    l = pd.to_numeric(df["low"],   errors="coerce")
    c = pd.to_numeric(df["close"], errors="coerce")

    sma_c = c.rolling(factor, min_periods=factor).sum() / float(factor)
    atr_f = _atr(h, l, c, factor)
    scalper_line = sma_c - np.log(np.pi * atr_f.replace(0, np.nan))

    hi = h.rolling(length, min_periods=length).max()
    lo = l.rolling(length, min_periods=length).min()

    return pd.DataFrame(
        {"scalper_line": scalper_line, "hi": hi, "lo": lo},
        index=df.index
    )
