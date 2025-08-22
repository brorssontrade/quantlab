import numpy as np

def sharpe(returns, rf=0.0, periods=252):
    r = np.asarray(returns, dtype=float)
    if r.size == 0: return 0.0
    mu, sigma = r.mean()*periods, r.std(ddof=1)*np.sqrt(periods)
    return 0.0 if sigma == 0 else (mu - rf)/sigma

def max_drawdown(equity_curve):
    ec = np.asarray(equity_curve, dtype=float)
    peak = np.maximum.accumulate(ec)
    dd = (ec - peak) / peak
    return float(dd.min()) if ec.size else 0.0

def turnover(weights_t_minus_1, weights_t):
    a = np.asarray(weights_t_minus_1, dtype=float)
    b = np.asarray(weights_t, dtype=float)
    return float(np.abs(a - b).sum()/2.0)
