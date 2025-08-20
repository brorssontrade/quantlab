import numpy as np
import pandas as pd


def equity_curve_from_positions(bars: pd.DataFrame, positions: pd.Series) -> pd.Series:
ret = bars["close"].pct_change().fillna(0.0)
strat_ret = ret * positions.shift().fillna(0) # avkastning när vi är inne
eq = (1 + strat_ret).cumprod()
return eq


def sharpe(returns: pd.Series, rf: float = 0.0, periods_per_year: int = 252*7):
# För 1h-bars: ca 7 bars/dag * 252 handelsdagar
excess = returns - rf/periods_per_year
return np.sqrt(periods_per_year) * excess.mean() / (excess.std(ddof=1) + 1e-9)


def max_drawdown(equity: pd.Series):
rollmax = equity.cummax()
dd = equity/rollmax - 1.0
return dd.min()