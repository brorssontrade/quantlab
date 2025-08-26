# src/quantkit/backtest/evaluate.py
from __future__ import annotations
import numpy as np
import pandas as pd

def perf_stats(equity: pd.Series, rf: float = 0.0, freq: str = "D") -> dict:
    equity = equity.dropna().astype(float)
    returns = equity.pct_change().dropna()

    f = freq.upper()
    if f.startswith("D"):
        ann = 252
    elif f.startswith("H"):
        ann = int(252 * 6.5)
    elif f.startswith("W"):
        ann = 52
    elif f.startswith("M"):
        ann = 12
    else:
        ann = 252

    if len(equity) < 2:
        return {"CAGR": 0.0, "Vol": 0.0, "Sharpe": 0.0, "Sortino": 0.0, "MaxDrawdown": 0.0}

    cagr = (equity.iloc[-1] / equity.iloc[0]) ** (ann / max(len(returns), 1)) - 1
    vol = returns.std(ddof=1) * np.sqrt(ann)
    mu = returns.mean()
    sharpe = ((mu - rf / ann) / (returns.std(ddof=1) + 1e-12)) * np.sqrt(ann)
    downside = returns[returns < 0].std(ddof=1) * np.sqrt(ann)
    sortino = ((mu - rf / ann) / (downside + 1e-12)) * np.sqrt(ann)
    roll_max = equity.cummax()
    dd = equity / roll_max - 1.0
    mdd = dd.min()
    return {
        "CAGR": float(cagr),
        "Vol": float(vol),
        "Sharpe": float(sharpe),
        "Sortino": float(sortino),
        "MaxDrawdown": float(mdd),
    }
