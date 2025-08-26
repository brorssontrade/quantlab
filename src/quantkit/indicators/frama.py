from __future__ import annotations
import numpy as np
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="frama",
    name="Fractal Adaptive Moving Average (FRAMA)",
    inputs=("high","low","close"),
    params=dict(length=16, w=-4.6),
    outputs=("frama", "alpha", "dimension"),
    description="FRAMA enligt LazyBear: dimension -> alpha = exp(w*(D-1)); frama = alpha*src + (1-alpha)*frama_prev."
)

def compute(df: pd.DataFrame, length: int = 16, w: float = -4.6) -> pd.DataFrame:
    if length < 4: length = 4
    half = max(2, int(round(length/2)))
    h = pd.to_numeric(df["high"], errors="coerce")
    l = pd.to_numeric(df["low"], errors="coerce")
    src = (h + l) / 2.0

    n3 = (h.rolling(length, min_periods=length).max() - l.rolling(length, min_periods=length).min()) / float(length)
    hd2 = h.rolling(half, min_periods=half).max()
    ld2 = l.rolling(half, min_periods=half).min()
    n2 = (hd2 - ld2) / float(half)
    n1 = (hd2.shift(half) - ld2.shift(half)) / float(half)

    with np.errstate(divide="ignore", invalid="ignore"):
        dim = np.where((n1 > 0) & (n2 > 0) & (n3 > 0),
                       (np.log(n1 + n2) - np.log(n3)) / np.log(2.0),
                       0.0)
    dim = pd.Series(dim, index=src.index)
    alpha = np.exp(w * (dim - 1.0))
    alpha = pd.Series(alpha, index=src.index).clip(0.01, 1.0)

    fr = np.empty(len(src)); fr[:] = np.nan
    for i in range(len(src)):
        x = src.iat[i]
        a = alpha.iat[i] if not np.isnan(alpha.iat[i]) else (alpha.iat[i-1] if i>0 else 0.5)
        if i < 2*length or np.isnan(a) or np.isnan(x):
            fr[i] = x
        else:
            fr[i] = a * x + (1.0 - a) * fr[i-1]
    frama = pd.Series(fr, index=src.index)
    return pd.DataFrame({"frama": frama, "alpha": alpha, "dimension": dim}, index=src.index)
