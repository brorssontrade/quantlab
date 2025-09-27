from __future__ import annotations
import numpy as np, pandas as pd

def annual_factor(freq: str="D")->float:
    return 252.0 if freq.upper().startswith("D") else 52.0

def cagr(series: pd.Series, freq: str="D")->float:
    if len(series)<2: return 0.0
    af = annual_factor(freq); years = len(series)/af
    total = series.iloc[-1]/series.iloc[0]-1.0
    return (1.0+total)**(1.0/max(years,1e-9))-1.0

def sharpe(returns: pd.Series, freq: str="D")->float:
    af = annual_factor(freq); mu = returns.mean(); sd = returns.std(ddof=0)
    if sd==0 or np.isnan(sd): return 0.0
    return float((mu/sd)*np.sqrt(af))

def max_drawdown(equity: pd.Series)->float:
    dd = equity/equity.cummax()-1.0
    return float(dd.min())

def turnover(positions: pd.DataFrame)->float:
    delta = positions.diff().abs()
    return float(delta.mean().mean())
