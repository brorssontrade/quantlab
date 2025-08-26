from __future__ import annotations
import numpy as np, pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="tdi", name="Traders Dynamic Index",
    inputs=("close",), params=dict(length_rsi=13, length_band=34, rsi_price=2, rsi_trade=7),
    outputs=("green","red","upper","lower","orange"),
    description="TDI: RSI (grön), trade-signal (röd), volatilitetsband (blå), baslinje (orange)."
)

def _rsi(s, n):
    s = pd.to_numeric(s, errors="coerce")
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean()
    rs = up / (dn + 1e-12)
    return 100 - 100/(1+rs)

def compute(df: pd.DataFrame, length_rsi:int=13, length_band:int=34, rsi_price:int=2, rsi_trade:int=7) -> pd.DataFrame:
    r = _rsi(df["close"], length_rsi)
    orange = r.rolling(length_band).mean()          # MBL
    offs = 1.6185 * r.rolling(length_band).std()
    upper = orange + offs
    lower = orange - offs
    green = r.rolling(rsi_price).mean()
    red   = r.rolling(rsi_trade).mean()
    return pd.DataFrame({"green":green, "red":red, "upper":upper, "lower":lower, "orange":orange})
