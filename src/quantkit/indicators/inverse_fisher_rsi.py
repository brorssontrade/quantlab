from __future__ import annotations
import numpy as np, pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="if_rsi", name="Inverse Fisher on RSI",
    inputs=("close",), params=dict(length=14, alpha=0.1),
    outputs=("if_rsi","rsi"),
    description="RSI normaliseras och körs genom Inverse Fisher Transform."
)

def _rsi(s, n):
    s = pd.to_numeric(s, errors="coerce")
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean()
    rs = up / (dn + 1e-12)
    return 100 - 100 / (1 + rs)

def compute(df: pd.DataFrame, length: int = 14, alpha: float = 0.1) -> pd.DataFrame:
    r = _rsi(df["close"], int(length))
    x = alpha * (r - 50.0)            # normalisera runt 0
    ift = (np.exp(2*x) - 1) / (np.exp(2*x) + 1)
    return pd.DataFrame({"if_rsi": ift, "rsi": r})
