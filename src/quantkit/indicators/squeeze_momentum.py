from __future__ import annotations
import numpy as np, pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="sqz_mom", name="Squeeze Momentum",
    inputs=("high","low","close"), params=dict(length=20, mult=2.0),
    outputs=("mom","sqz_on","sqz_off"),
    description="BB-inne-i-KC squeeze + enkel momentum (linreg)."
)

def compute(df: pd.DataFrame, length:int=20, mult:float=2.0) -> pd.DataFrame:
    h = pd.to_numeric(df["high"], errors="coerce"); l = pd.to_numeric(df["low"], errors="coerce"); c = pd.to_numeric(df["close"], errors="coerce")

    basis = c.rolling(length).mean()
    dev = mult * c.rolling(length).std()
    bb_u, bb_l = basis+dev, basis-dev

    tr = pd.concat([h-l, (h-c.shift()).abs(), (l-c.shift()).abs()], axis=1).max(axis=1)
    rangema = tr.ewm(span=length, adjust=False).mean()
    kc_u, kc_l = basis + rangema*mult, basis - rangema*mult

    sqz_on  = (bb_u < kc_u) & (bb_l > kc_l)
    sqz_off = (bb_u > kc_u) & (bb_l < kc_l)

    # momentum via enkel linreg-slope på 'c'
    x = np.arange(length)
    def _slope(s):
        if s.isna().any(): return np.nan
        A = np.vstack([x, np.ones(len(x))]).T
        m, _ = np.linalg.lstsq(A, s.values, rcond=None)[0]
        return m
    mom = c.rolling(length).apply(_slope, raw=False)
    return pd.DataFrame({"mom":mom, "sqz_on":sqz_on, "sqz_off":sqz_off})
