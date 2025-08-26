from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

# Standard GMMA-längder
SHORTS = (3,5,8,10,12,15)
LONGS  = (30,35,40,45,50,60)

INDICATOR = IndicatorSpec(
    id="gmma",
    name="Guppy Multiple Moving Averages",
    inputs=("close",),
    params=dict(),
    outputs=tuple([f"s{i}" for i in SHORTS] + [f"l{i}" for i in LONGS]),
    description="GMMA: sex korta + sex långa EMA för trend/pullback-analys."
)

def compute(df: pd.DataFrame) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    out = {}
    for n in SHORTS:
        out[f"s{n}"] = c.ewm(span=n, adjust=False).mean()
    for n in LONGS:
        out[f"l{n}"] = c.ewm(span=n, adjust=False).mean()
    return pd.DataFrame(out)
