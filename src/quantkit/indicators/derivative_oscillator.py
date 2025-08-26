from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="do_lb",
    name="Derivative Oscillator (Constance Brown, LB)",
    inputs=("close",),
    params=dict(length=14, ema1=5, ema2=3, p=9),
    outputs=("do",),
    description="RSI(length) dubbelslätad med EMA(ema1) och EMA(ema2), minus SMA(p) av den slätade RSI. Histogramvärde."
)

def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()

def _rsi(c: pd.Series, n: int) -> pd.Series:
    c = pd.to_numeric(c, errors="coerce")
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean()
    rs = up / (dn + 1e-12)
    return 100 - 100/(1+rs)

def compute(df: pd.DataFrame, length: int = 14, ema1: int = 5, ema2: int = 3, p: int = 9) -> pd.DataFrame:
    r = _rsi(df["close"], length)
    s1 = _ema(_ema(r, ema1), ema2)
    sig = s1.rolling(p, min_periods=p).mean()
    do = s1 - sig
    return pd.DataFrame({"do": do}, index=df.index)
