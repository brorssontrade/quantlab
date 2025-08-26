from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="trixrb",
    name="Trix Ribbon",
    inputs=("close",),
    params=dict(lengths=(4,6,9,12)),
    outputs=("trix4","trix6","trix9","trix12","trix_mean"),
    description="TRIX för flera längder (default 4/6/9/12). TRIX = d/dt av triple-EMA. Positivt => momentum upp."
)

def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()

def _trix(c: pd.Series, n: int) -> pd.Series:
    c = pd.to_numeric(c, errors="coerce")
    t = _ema(_ema(_ema(c, n), n), n)
    return t.pct_change() * 100.0

def compute(df: pd.DataFrame, lengths=(4,6,9,12)) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    L = list(lengths)
    cols = {}
    for n in L:
        cols[f"trix{n}"] = _trix(c, int(n))
    out = pd.DataFrame(cols, index=df.index)
    out["trix_mean"] = out.mean(axis=1)
    # Säkerställ att outputs alltid finns (även om lengths ändras)
    for k in ("trix4","trix6","trix9","trix12"):
        if k not in out.columns:
            out[k] = pd.NA
    return out
