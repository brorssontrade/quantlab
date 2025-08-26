from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="ma8x",
    name="8x Moving Averages",
    inputs=("close",),
    params=dict(
        use_ema=False,
        lengths=(8, 13, 41, 200, 243, 300, 500, 700)
    ),
    outputs=("ma1","ma2","ma3","ma4","ma5","ma6","ma7","ma8"),
    description="Generisk 8x MA-plottare (SMA/EMA) med valfria längder."
)

def _ma(s: pd.Series, n: int, ema: bool) -> pd.Series:
    s = pd.to_numeric(s, errors="coerce")
    return s.ewm(span=n, adjust=False).mean() if ema else s.rolling(n, min_periods=n).mean()

def compute(df: pd.DataFrame, use_ema: bool = False, lengths=(8,13,41,200,243,300,500,700)) -> pd.DataFrame:
    c = df["close"]
    L = list(lengths)[:8] + [None]*max(0, 8-len(lengths))
    out = {}
    for i, n in enumerate(L, start=1):
        out[f"ma{i}"] = _ma(c, int(n), use_ema) if n and int(n) > 0 else pd.Series(pd.NA, index=c.index)
    return pd.DataFrame(out, index=df.index)
