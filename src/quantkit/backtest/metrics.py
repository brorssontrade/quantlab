from __future__ import annotations
import numpy as np
import pandas as pd


def annual_factor(freq: str = "D") -> float:
    return 252.0 if freq.upper().startswith("D") else 52.0


def cagr(equity: pd.Series, freq: str = "D") -> float:
    if len(equity) < 2:
        return 0.0
    af = annual_factor(freq)
    total = equity.iloc[-1] / equity.iloc[0] - 1.0
    years = len(equity) / af
    return (1.0 + total) ** (1.0 / max(years, 1e-9)) - 1.0


def sharpe(returns: pd.Series, freq: str = "D") -> float:
    af = annual_factor(freq)
    mu, sd = returns.mean(), returns.std(ddof=0)
    if sd == 0 or np.isnan(sd):
        return 0.0
    return float((mu / sd) * np.sqrt(af))


def max_drawdown(equity: pd.Series) -> float:
    roll_max = equity.cummax()
    dd = equity / roll_max - 1.0
    return float(dd.min())


def turnover(positions: pd.DataFrame) -> float:
    delta = positions.diff().abs()
    return float(delta.mean().mean())
