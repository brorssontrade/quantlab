from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="bb_kc",
    name="BB/KC Squeeze (LB)",
    inputs=("high", "low", "close"),
    params=dict(length=20, mult=2.0, use_true_range=True),
    outputs=("bb_basis","bb_upper","bb_lower","kc_mid","kc_upper","kc_lower","bb_inside_kc","bb_outside_kc"),
    description="Squeeze när BB-band ligger innanför Keltner; 'release' när de går utanför."
)

def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()

def _atr(h: pd.Series, l: pd.Series, c: pd.Series, n: int) -> pd.Series:
    prev_c = c.shift(1)
    tr = pd.concat([h-l, (h-prev_c).abs(), (l-prev_c).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1/n, adjust=False).mean()

def compute(df: pd.DataFrame, length: int = 20, mult: float = 2.0, use_true_range: bool = True) -> pd.DataFrame:
    h = pd.to_numeric(df["high"],  errors="coerce")
    l = pd.to_numeric(df["low"],   errors="coerce")
    c = pd.to_numeric(df["close"], errors="coerce")

    # BB
    bb_basis = c.rolling(length, min_periods=length).mean()
    bb_stdev = c.rolling(length, min_periods=length).std()
    bb_upper = bb_basis + mult * bb_stdev
    bb_lower = bb_basis - mult * bb_stdev

    # KC
    kc_mid = _ema(c, length)
    rng = _atr(h, l, c, length) if use_true_range else (h - l)
    rng_ma = _ema(rng, length)
    kc_upper = kc_mid + mult * rng_ma
    kc_lower = kc_mid - mult * rng_ma

    inside = (bb_upper < kc_upper) & (bb_lower > kc_lower)
    outside = (bb_upper > kc_upper) & (bb_lower < kc_lower)

    return pd.DataFrame({
        "bb_basis": bb_basis, "bb_upper": bb_upper, "bb_lower": bb_lower,
        "kc_mid": kc_mid, "kc_upper": kc_upper, "kc_lower": kc_lower,
        "bb_inside_kc": inside.astype(int), "bb_outside_kc": outside.astype(int)
    }, index=df.index)
