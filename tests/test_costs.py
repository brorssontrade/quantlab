# tests/test_costs.py
import pandas as pd
from quantkit.backtest.costs import apply_costs


def test_apply_costs_roundtrip_sum():
    orders = pd.DataFrame({"price": [100.0, 110.0], "qty": [1.0, 1.0]})
    # 10 bps = 0.1% per sida => 0.1 + 0.11 = 0.21 i total kostnad
    fees = apply_costs(orders, bps=10.0)
    assert round(fees.sum(), 6) == 0.21

