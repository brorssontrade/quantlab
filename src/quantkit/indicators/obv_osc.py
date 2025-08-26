from __future__ import annotations
import numpy as np
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="obv_osc",
    name="On-Balance Volume Oscillator",
    inputs=("close", "volume"),
    params=dict(length=20),
    outputs=("obv", "obv_osc"),
    description="OBV-oscillator: OBV minus EMA(OBV, N). Enkel zero-line tolkning & divergenser."
)

def compute(df: pd.DataFrame, length: int = 20) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    v = pd.to_numeric(df["volume"], errors="coerce").fillna(0.0)
    ch = c.diff()
    step = np.sign(ch.fillna(0.0)) * v
    obv = step.cumsum()
    obv_ema = pd.Series(obv, index=c.index).ewm(span=max(1, int(length)), adjust=False).mean()
    obv_osc = pd.Series(obv, index=c.index) - obv_ema
    return pd.DataFrame({"obv": obv, "obv_osc": obv_osc}, index=c.index)
