from __future__ import annotations
import numpy as np
import pandas as pd

def sma(s: pd.Series, length: int) -> pd.Series:
    return pd.Series(s.astype(float)).rolling(length, min_periods=length).mean()

def percent_change(s: pd.Series, periods: int = 1) -> pd.Series:
    return pd.Series(s.astype(float)).pct_change(periods=periods)

def lowest(s: pd.Series, length: int) -> pd.Series:
    return pd.Series(s.astype(float)).rolling(length, min_periods=length).min()

def highest(s: pd.Series, length: int) -> pd.Series:
    return pd.Series(s.astype(float)).rolling(length, min_periods=length).max()

def rsi(close: pd.Series, length: int = 14) -> pd.Series:
    c = pd.Series(close.astype(float))
    delta = c.diff()
    up = delta.clip(lower=0).ewm(alpha=1/length, adjust=False).mean()
    dn = (-delta.clip(upper=0)).ewm(alpha=1/length, adjust=False).mean()
    rs = up / (dn + 1e-12)
    return 100 - (100 / (1 + rs))

def _true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    h = pd.Series(high.astype(float))
    l = pd.Series(low.astype(float))
    c = pd.Series(close.astype(float))
    tr = pd.concat([(h - l), (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    return tr

def adx(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
    h = pd.Series(high.astype(float))
    l = pd.Series(low.astype(float))
    c = pd.Series(close.astype(float))

    up_move = h.diff()
    dn_move = -l.diff()

    plus_dm = pd.Series(np.where((up_move > dn_move) & (up_move > 0), up_move, 0.0), index=h.index)
    minus_dm = pd.Series(np.where((dn_move > up_move) & (dn_move > 0), dn_move, 0.0), index=h.index)

    tr14 = _true_range(h, l, c).ewm(alpha=1/length, adjust=False).mean()
    plus_dm14 = plus_dm.ewm(alpha=1/length, adjust=False).mean()
    minus_dm14 = minus_dm.ewm(alpha=1/length, adjust=False).mean()

    plus_di = 100 * (plus_dm14 / (tr14 + 1e-12))
    minus_di = 100 * (minus_dm14 / (tr14 + 1e-12))

    dx = ((plus_di - minus_di).abs() / (plus_di + minus_di + 1e-12)) * 100
    return dx.ewm(alpha=1/length, adjust=False).mean()
