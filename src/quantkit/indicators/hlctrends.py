from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="hlctrends",
    name="HLC Trends (EMA High/Low/Close)",
    inputs=("high","low","close"),
    params=dict(length=20),
    outputs=("ema_h","ema_l","ema_c","trend_up","trend_val"),
    description="Enkla trendlinjer: EMA(high), EMA(low), EMA(close). trend_up = ema_c > (ema_h+ema_l)/2."
)

def _ema(s: pd.Series, n: int) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").ewm(span=n, adjust=False).mean()

def compute(df: pd.DataFrame, length: int = 20) -> pd.DataFrame:
    eh = _ema(df["high"], length)
    el = _ema(df["low"],  length)
    ec = _ema(df["close"], length)
    mid = (eh + el) / 2.0
    trend_val = ec - mid
    trend_up  = (trend_val > 0).astype(bool)
    return pd.DataFrame({"ema_h": eh, "ema_l": el, "ema_c": ec,
                         "trend_up": trend_up, "trend_val": trend_val}, index=df.index)
