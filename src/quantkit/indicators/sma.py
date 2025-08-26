from __future__ import annotations
import pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="sma",
    name="Simple Moving Average",
    inputs=("close",),
    params=dict(length=20, column="close"),
    outputs=("value",),
    description="Glidande medelvärde utan viktning (SMA)."
)

# Alias-bundling: (alias_id, alias_params, alias_name, alias_desc)
ALIASES = [
    ("sma20",  {"length": 20},  "SMA20",  "Alias för sma(length=20)."),
    ("sma50",  {"length": 50},  "SMA50",  "Alias för sma(length=50)."),
    ("sma200", {"length": 200}, "SMA200", "Alias för sma(length=200)."),
]

def compute(df: pd.DataFrame, length: int = 20, column: str = "close") -> pd.Series:
    s = pd.to_numeric(df[column], errors="coerce")
    return s.rolling(length, min_periods=length).mean().rename(f"SMA{length}")
