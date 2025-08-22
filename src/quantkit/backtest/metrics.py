from __future__ import annotations
import numpy as np
import pandas as pd

def sharpe(returns, rf=0.0, periods: int = 252) -> float:
    s = pd.Series(returns)
    if s.empty:
        return 0.0
    std = float(s.std())
    if std == 0.0:
        return 0.0
    mean_excess = float(s.mean()) - rf / periods
    return (mean_excess / (std + 1e-12)) * np.sqrt(periods)

def max_drawdown(equity_curve) -> float:
    s = pd.Series(equity_curve)
    if s.empty:
        return 0.0
    peak = s.cummax()
    dd = (s - peak) / peak.replace(0, np.nan)
    dd = dd.replace([np.inf, -np.inf], np.nan).fillna(0.0)
    return float(dd.min())

def turnover(prev_w, w=None) -> float:
    """
    Två lägen:
      - turnover(prev, curr): L1-förändring sum(|curr-prev|)
      - turnover(weights_df_or_series): medel absolut diff över tiden
    """
    if w is not None:
        a = np.asarray(prev_w, dtype=float)
        b = np.asarray(w, dtype=float)
        if a.shape != b.shape:
            a = np.resize(a, b.shape)
        return float(np.sum(np.abs(b - a)))

    # Single-arg-läge
    if isinstance(prev_w, pd.DataFrame):
        if prev_w.shape[0] < 2:
            return 0.0
        diffs = prev_w.diff().abs().sum(axis=1).dropna()
        return float(diffs.mean())
    s = pd.Series(prev_w)
    if s.size < 2:
        return 0.0
    return float(s.diff().abs().dropna().mean())
