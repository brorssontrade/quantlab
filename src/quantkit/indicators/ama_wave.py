from __future__ import annotations
import numpy as np
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="ama_wave",
    name="Kaufman AMA Binary Wave",
    inputs=("close",),
    params=dict(length=20, filterp=10),
    outputs=("ama","bw","amalow","amahigh","flt"),
    description="AMA-baserad binär våg: 1=köp, -1=sälj, 0=neutral. Enkelt confirmationsverktyg."
)

def compute(df: pd.DataFrame, length: int = 20, filterp: int = 10) -> pd.DataFrame:
    src = pd.to_numeric(df["close"], errors="coerce")
    d    = (src - src.shift(1)).abs()
    s    = (src - src.shift(length)).abs()
    noise = d.rolling(length, min_periods=length).sum()
    efratio = s / (noise + 1e-12)

    fastsc, slowsc = 0.6022, 0.0645
    smooth = (efratio*fastsc + slowsc)**2

    ama = np.empty(len(src)); ama[:] = np.nan
    amalow = np.empty(len(src)); amahigh = np.empty(len(src))
    for i in range(len(src)):
        if i == 0 or np.isnan(src.iat[i-1]):
            ama[i] = src.iat[i]
            amalow[i] = ama[i]; amahigh[i] = ama[i]
            continue
        prev = ama[i-1]
        sc   = smooth.iat[i] if not np.isnan(smooth.iat[i]) else smooth.iat[i-1]
        ama[i] = prev + sc * (src.iat[i] - prev)
        amalow[i]  = ama[i] if ama[i] < prev else amalow[i-1]
        amahigh[i] = ama[i] if ama[i] > prev else amahigh[i-1]

    ama = pd.Series(ama, index=src.index)
    amalow = pd.Series(amalow, index=src.index)
    amahigh = pd.Series(amahigh, index=src.index)

    flt = (filterp/100.0) * (ama.diff().rolling(length, min_periods=length).std(ddof=0))
    bw = np.where((ama - amalow) > flt, 1, np.where((amahigh - ama) > flt, -1, 0))
    return pd.DataFrame({"ama": ama, "bw": bw, "amalow": amalow, "amahigh": amahigh, "flt": flt}, index=src.index)
