from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="donchian",
    name="Donchian Channels",
    inputs=("high","low"),
    params=dict(length=20),
    outputs=("high","low","mid"),
    description="Högsta high och lägsta low över N dagar; mitt = (high+low)/2."
)

def compute(df: pd.DataFrame, length: int = 20) -> pd.DataFrame:
    h = pd.to_numeric(df["high"], errors="coerce").rolling(length, min_periods=length).max()
    l = pd.to_numeric(df["low"], errors="coerce").rolling(length, min_periods=length).min()
    mid = (h + l) / 2.0
    return pd.DataFrame({f"DonchianHigh{length}": h, f"DonchianLow{length}": l, f"DonchianMid{length}": mid})
