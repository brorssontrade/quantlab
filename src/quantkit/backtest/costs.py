# src/quantkit/backtest/costs.py
from __future__ import annotations
import pandas as pd

def apply_costs(orders: pd.DataFrame, bps: float = 5.0, min_fee: float = 0.0) -> pd.Series:
    """
    Kostnad per order. Kolumner: ['price','qty'] (qty får vara signerad).
    Kostnad = notional * (bps/10000) + min_fee.  bps = per sida.
    """
    notional = (orders["price"].abs() * orders["qty"].abs())
    return notional * (float(bps) / 10_000.0) + float(min_fee)
