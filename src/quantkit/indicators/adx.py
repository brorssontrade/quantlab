from __future__ import annotations
import numpy as np
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="adx",
    name="Average Directional Index",
    inputs=("high","low","close"),
    params=dict(length=14),
    outputs=("adx",),
    description="Trendstyrka (Wilder). ADX>20 brukar tolkas som trend."
)

def _true_range(h: pd.Series, l: pd.Series, c: pd.Series) -> pd.Series:
    prev_c = c.shift(1)
    tr = pd.concat([
        h - l,
        (h - prev_c).abs(),
        (l - prev_c).abs()
    ], axis=1).max(axis=1)
    return tr

def compute(df: pd.DataFrame, length: int = 14) -> pd.Series:
    h = pd.to_numeric(df["high"], errors="coerce")
    l = pd.to_numeric(df["low"], errors="coerce")
    c = pd.to_numeric(df["close"], errors="coerce")
    up_move = h.diff()
    dn_move = -l.diff()
    plus_dm  = np.where((up_move > dn_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((dn_move > up_move) & (dn_move > 0), dn_move, 0.0)
    tr = _true_range(h, l, c)
    tr_ema = tr.ewm(alpha=1/length, adjust=False).mean()
    plus_di  = 100 * (pd.Series(plus_dm, index=h.index).ewm(alpha=1/length, adjust=False).mean() / (tr_ema + 1e-12))
    minus_di = 100 * (pd.Series(minus_dm, index=h.index).ewm(alpha=1/length, adjust=False).mean() / (tr_ema + 1e-12))
    dx = (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-12) * 100
    adx = dx.ewm(alpha=1/length, adjust=False).mean()
    adx.name = f"ADX{length}"
    return adx
