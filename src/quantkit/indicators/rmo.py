from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="rmo",
    name="Rahul Mohindar Oscillator",
    inputs=("close",),
    params=dict(),
    outputs=("rmo","swing2","swing3"),
    description="RMO (ema på SwingTrd1) + SwingTrd2/3. Signaler ofta vid RMO-korsning av noll."
)

def _sma2(x: pd.Series) -> pd.Series:
    return x.rolling(2, min_periods=2).mean()

def compute(df: pd.DataFrame) -> pd.DataFrame:
    C = pd.to_numeric(df["close"], errors="coerce")

    ma = C.copy()
    for _ in range(10):
        ma = _sma2(ma)
    denom = (C.rolling(10, min_periods=10).max() - C.rolling(10, min_periods=10).min()).replace(0, 1e-12)
    swing1 = 100 * (C - ma) / denom

    swing2 = swing1.ewm(span=30, adjust=False).mean()
    swing3 = swing2.ewm(span=30, adjust=False).mean()
    rmo    = swing1.ewm(span=81, adjust=False).mean()
    return pd.DataFrame({"rmo": rmo, "swing2": swing2, "swing3": swing3}, index=C.index)
