from __future__ import annotations
import numpy as np
import pandas as pd


def _as_series(x) -> pd.Series:
    if isinstance(x, pd.DataFrame):
        # ta första kolumnen
        return x.iloc[:, 0]
    return pd.Series(x) if not isinstance(x, pd.Series) else x


def sma(s: pd.Series, length: int) -> pd.Series:
    s = _as_series(s).astype(float)
    return s.rolling(int(length), min_periods=int(length)).mean()


def rsi(s: pd.Series, length: int = 14) -> pd.Series:
    s = _as_series(s).astype(float)
    delta = s.diff()
    up = delta.clip(lower=0).ewm(alpha=1 / length, adjust=False).mean()
    down = (-delta.clip(upper=0)).ewm(alpha=1 / length, adjust=False).mean()
    rs = up / (down + 1e-12)
    return 100 - 100 / (1 + rs)


def _true_range(h, l, c) -> pd.Series:
    h = _as_series(h).astype(float)
    l = _as_series(l).astype(float)
    c = _as_series(c).astype(float)
    tr = pd.concat([(h - l), (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    return tr


def adx(high, low, close, length: int = 14) -> pd.Series:
    high = _as_series(high).astype(float)
    low = _as_series(low).astype(float)
    close = _as_series(close).astype(float)
    up_move = high.diff()
    dn_move = -low.diff()
    plus_dm = np.where((up_move > dn_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((dn_move > up_move) & (dn_move > 0), dn_move, 0.0)
    tr14 = _true_range(high, low, close).ewm(alpha=1 / length, adjust=False).mean()
    plus_di = 100 * (pd.Series(plus_dm, index=high.index).ewm(alpha=1 / length, adjust=False).mean() / (tr14 + 1e-12))
    minus_di = 100 * (pd.Series(minus_dm, index=high.index).ewm(alpha=1 / length, adjust=False).mean() / (tr14 + 1e-12))
    dx = (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-12) * 100
    return dx.ewm(alpha=1 / length, adjust=False).mean()


def percent_change(s: pd.Series, periods: int = 1) -> pd.Series:
    return _as_series(s).astype(float).pct_change(periods)


def lowest(s: pd.Series, window: int) -> pd.Series:
    return _as_series(s).astype(float).rolling(int(window), min_periods=int(window)).min()


def highest(s: pd.Series, window: int) -> pd.Series:
    return _as_series(s).astype(float).rolling(int(window), min_periods=int(window)).max()
