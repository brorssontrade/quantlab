from __future__ import annotations
import numpy as np
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="ifisher_rsi",
    name="Inverse Fisher on RSI",
    inputs=("close",),
    params=dict(length=9, signal=3),
    outputs=("if_rsi","signal"),
    description="Inverse Fisher Transform på RSI för tydliga 0..1 signaler."
)

def _rsi(s: pd.Series, n: int) -> pd.Series:
    s = pd.to_numeric(s, errors="coerce")
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean()
    rs = up / (dn + 1e-12)
    return 100 - 100/(1+rs)

def compute(df: pd.DataFrame, length: int = 9, signal: int = 3) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    r = _rsi(c, int(length))
    # skala ungefär som vanliga IFT-RSI implementationer
    x = 0.1*(r - 50.0)
    e2x = np.exp(2*x)
    if_rsi = (e2x - 1) / (e2x + 1)
    sig = pd.Series(if_rsi, index=c.index).ewm(span=int(signal), adjust=False).mean()
    return pd.DataFrame({"if_rsi": if_rsi, "signal": sig})
