from __future__ import annotations
import numpy as np
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="si_bands",
    name="RSI/MFI with Volatility Bands",
    inputs=("high", "low", "close", "volume"),
    params=dict(length=14, mult=2.0, mode="mfi"),  # mode: "mfi" eller "rsi"
    outputs=("index_val", "bb_basis", "bb_upper", "bb_lower"),
    description="RSI eller MFI beräknas på HLC3 och kapslas i Bollinger-band; används för överköpt/översålt."
)

def _rsi(x: pd.Series, n: int) -> pd.Series:
    x = pd.to_numeric(x, errors="coerce")
    d = x.diff()
    up = d.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean()
    rs = up / (dn + 1e-12)
    return 100 - 100/(1+rs)

def _mfi(h: pd.Series, l: pd.Series, c: pd.Series, v: pd.Series, n: int) -> pd.Series:
    tp = (pd.to_numeric(h, errors="coerce")
          + pd.to_numeric(l, errors="coerce")
          + pd.to_numeric(c, errors="coerce")) / 3.0
    ch = tp.diff()
    pos_flow = (v * tp.where(ch > 0, 0.0)).rolling(n, min_periods=n).sum()
    neg_flow = (v * tp.where(ch < 0, 0.0)).rolling(n, min_periods=n).sum()
    mfr = pos_flow / (neg_flow + 1e-12)
    return 100 - 100/(1 + mfr)

def compute(df: pd.DataFrame, length: int = 14, mult: float = 2.0, mode: str = "mfi") -> pd.DataFrame:
    h, l, c, v = df["high"], df["low"], df["close"], df.get("volume", pd.Series(index=df.index, dtype=float))
    hlc3 = (pd.to_numeric(h, errors="coerce") + pd.to_numeric(l, errors="coerce") + pd.to_numeric(c, errors="coerce"))/3.0

    if str(mode).lower() == "rsi":
        idx = _rsi(hlc3, length)
    else:
        idx = _mfi(h, l, c, pd.to_numeric(v, errors="coerce").fillna(0.0), length)

    basis = idx.rolling(length, min_periods=length).mean()
    dev   = idx.rolling(length, min_periods=length).std(ddof=0) * float(mult)
    upper = basis + dev
    lower = basis - dev
    return pd.DataFrame({"index_val": idx, "bb_basis": basis, "bb_upper": upper, "bb_lower": lower}, index=df.index)
