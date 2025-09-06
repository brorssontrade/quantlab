from __future__ import annotations
import optuna
from ..config import Settings
from ..data.repository import get_timeseries
from ..strategies.ema_cross import EmaCross
from ..backtest.engine import backtest_prices

def optimize_ema(symbol: str, timeframe: str, settings: Settings, n_trials: int = 50) -> dict:
    df = get_timeseries(symbol, timeframe, settings)
    prices = df['close']
    def objective(trial: optuna.Trial) -> float:
        fast = trial.suggest_int('fast', 3, 30)
        slow = trial.suggest_int('slow', fast + 5, 120)
        strat = EmaCross(fast=fast, slow=slow)
        sig = strat.generate(df)
        res = backtest_prices(sig, prices)
        return res.metrics['sharpe']
    study = optuna.create_study(direction='maximize')
    study.optimize(objective, n_trials=n_trials)
    return study.best_params | {'best_value': study.best_value}
