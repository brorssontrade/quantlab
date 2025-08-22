from dataclasses import dataclass
import numpy as np
from quantkit.backtest.metrics import sharpe, max_drawdown, turnover

@dataclass
class CostModel:
    pct_fee: float = 0.0005  # 5 bps
    slippage_bps: float = 1.0

    def cost(self, notional_turnover: float) -> float:
        return notional_turnover * (self.pct_fee + self.slippage_bps/10000.0)

@dataclass
class BacktestResult:
    equity: np.ndarray
    returns: np.ndarray
    stats: dict

class BacktestEngine:
    def __init__(self, cost_model: CostModel | None = None):
        self.cost_model = cost_model or CostModel()

    def run(self, prices: np.ndarray, weights: np.ndarray, cash: float = 1.0) -> BacktestResult:
        # Minimal referens-implementering (dagliga priser, full invest)
        n, t = weights.shape[0], prices.shape[1]
        equity = [cash]
        prev_w = np.zeros(n)
        for k in range(1, t):
            w = weights[:, k]
            ret = np.dot(w, prices[:, k] / prices[:, k-1] - 1.0)
            # kostnad på turnover
            notional_turn = turnover(prev_w, w) * equity[-1]
            fee = self.cost_model.cost(notional_turn)
            new_eq = equity[-1] * (1.0 + ret) - fee
            equity.append(new_eq)
            prev_w = w
        equity = np.array(equity)
        rets = np.diff(equity) / equity[:-1]
        stats = {
            "sharpe": sharpe(rets),
            "max_drawdown": max_drawdown(equity),
            "final_equity": float(equity[-1]),
        }
        return BacktestResult(equity, rets, stats)
