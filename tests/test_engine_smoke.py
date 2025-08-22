from quantkit.backtest.engine import BacktestEngine
import numpy as np

def test_smoke():
    prices = np.array([[100, 101, 102]], dtype=float)
    weights = np.ones((1, 3))
    res = BacktestEngine().run(prices, weights)
    assert res.equity[-1] > 0
    assert "sharpe" in res.stats
