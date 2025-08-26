from __future__ import annotations
import numpy as np
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="vidya",
    name="VIDYA (Chande)",
    inputs=("close",),
    params=dict(length=14),
    outputs=("vidya", "cmo", "alpha"),
    description="VIDYA med CMO: vidya_t = price*alpha*cmo + vidya_{t-1}*(1-alpha*cmo)."
)

def _cmo(x: pd.Series, n: int) -> pd.Series:
    mom = x.diff()
    up = mom.clip(lower=0).rolling(n, min_periods=n).sum()
    dn = (-mom.clip(upper=0)).rolling(n, min_periods=n).sum()
    return (up - dn) / (up + dn + 1e-12)

def compute(df: pd.DataFrame, length: int = 14) -> pd.DataFrame:
    src = pd.to_numeric(df["close"], errors="coerce")
    cmo = _cmo(src, length).abs()
    alpha = 2.0 / (length + 1.0)

    out = np.empty(len(src)); out[:] = np.nan
    for i in range(len(src)):
        cm = cmo.iat[i] if not np.isnan(cmo.iat[i]) else 0.0
        prev = out[i-1] if i>0 else src.iat[i]
        x = src.iat[i]
        sc = alpha * cm
        out[i] = x * sc + (prev if not np.isnan(prev) else x) * (1.0 - sc)
    vid = pd.Series(out, index=src.index)
    return pd.DataFrame({"vidya": vid, "cmo": cmo, "alpha": alpha}, index=src.index)
