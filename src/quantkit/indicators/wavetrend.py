from __future__ import annotations
import pandas as pd
import numpy as np
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="wavetrend",
    name="WaveTrend (WT)",
    inputs=("high","low","close"),
    params=dict(chan_len=10, avg_len=21, ob_level=60.0, os_level=-60.0),
    outputs=("wt1","wt2","ob_level","os_level"),
    description="WaveTrend oscillator (WT1/WT2) med standardnivåer ±60."
)

def compute(df: pd.DataFrame, chan_len: int = 10, avg_len: int = 21, ob_level: float = 60.0, os_level: float = -60.0) -> pd.DataFrame:
    h = pd.to_numeric(df["high"], errors="coerce")
    l = pd.to_numeric(df["low"],  errors="coerce")
    c = pd.to_numeric(df["close"], errors="coerce")
    tp = (h + l + c) / 3.0

    esa = tp.ewm(span=int(chan_len), adjust=False).mean()
    d   = (tp - esa).abs().ewm(span=int(chan_len), adjust=False).mean()
    ci  = (tp - esa) / (d + 1e-12)
    tci = ci.ewm(span=int(avg_len), adjust=False).mean()
    wt1 = tci
    wt2 = wt1.rolling(int(avg_len), min_periods=int(avg_len)).mean()

    return pd.DataFrame({
        "wt1": wt1,
        "wt2": wt2,
        "ob_level": float(ob_level),
        "os_level": float(os_level),
    })
