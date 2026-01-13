"""
Indicator adapters: wrapper functions for quantkit canonical implementations.

These adapters are the public API post-PR8 for engine/features.py. 

Instead of importing individual quantkit indicator functions, we implement adapters
directly that call quantkit.compute() or directly use the quantkit logic in __init__.py.

Migration: PR4.1 (RSI), PR4.2 (ATR), PR4.3 (SMA/EMA), PR4.4 (MACD/ADX), PR4.5 (Donchian/VWMA/Stochastic/CCI/Williams %R)
Deleted from engine/features.py: PR8
"""

from __future__ import annotations
import numpy as np
import pandas as pd


# Canonical implementations (from engine.features.py deprecated section, now adapters)
def true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    """True Range helper used by ATR and other indicators."""
    prev_close = close.shift(1)
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    return pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)


def sma_adapter(s: pd.Series, n: int) -> pd.Series:
    """SMA(n) — Simple Moving Average."""
    return s.rolling(n, min_periods=n).mean()


def ema_adapter(s: pd.Series, n: int) -> pd.Series:
    """EMA(n) — Exponential Moving Average."""
    return s.ewm(span=n, adjust=False, min_periods=n).mean()


def rsi_adapter(close: pd.Series, n: int = 14) -> pd.Series:
    """RSI(n) — Relative Strength Index."""
    delta = close.diff()
    up = delta.clip(lower=0.0)
    down = (-delta).clip(lower=0.0)
    avg_gain = up.ewm(alpha=1/n, adjust=False, min_periods=n).mean()
    avg_loss = down.ewm(alpha=1/n, adjust=False, min_periods=n).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    out = 100 - (100 / (1 + rs))
    return out


def atr_adapter(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    """ATR(n) — Average True Range."""
    tr = true_range(high, low, close)
    return tr.ewm(alpha=1/n, adjust=False, min_periods=n).mean()


def macd_adapter(close: pd.Series, fast: int = 12, slow: int = 26, signal_n: int = 9) -> tuple:
    """MACD — Moving Average Convergence Divergence. Returns (macd_line, signal, histogram)."""
    macd = ema_adapter(close, fast) - ema_adapter(close, slow)
    signal = macd.ewm(span=signal_n, adjust=False, min_periods=signal_n).mean()
    hist = macd - signal
    return macd, signal, hist


def adx_adapter(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> tuple:
    """ADX(n) — Average Directional Index. Returns (adx, plus_di, minus_di)."""
    up_move = high.diff()
    down_move = (-low.diff())
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    plus_dm = pd.Series(plus_dm, index=high.index)
    minus_dm = pd.Series(minus_dm, index=high.index)

    tr = true_range(high, low, close)
    atr_n = tr.ewm(alpha=1/n, adjust=False, min_periods=n).mean()
    plus_di = 100 * (plus_dm.ewm(alpha=1/n, adjust=False, min_periods=n).mean() / atr_n.replace(0, np.nan))
    minus_di = 100 * (minus_dm.ewm(alpha=1/n, adjust=False, min_periods=n).mean() / atr_n.replace(0, np.nan))
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    adx = dx.ewm(alpha=1/n, adjust=False, min_periods=n).mean()
    return adx, plus_di, minus_di


def donchian_adapter(high: pd.Series, low: pd.Series, n: int = 20) -> tuple:
    """Donchian Channel(n). Returns (high, low, mid)."""
    dc_h = high.rolling(n, min_periods=n).max()
    dc_l = low.rolling(n, min_periods=n).min()
    dc_m = (dc_h + dc_l) / 2.0
    return dc_h, dc_l, dc_m


def vwma_adapter(close: pd.Series, volume: pd.Series, n: int = 20) -> pd.Series:
    """VWMA(n) — Volume Weighted Moving Average."""
    num = (close * volume).rolling(n, min_periods=n).sum()
    den = volume.rolling(n, min_periods=n).sum()
    return num / den.replace(0, np.nan)


def stochastic_adapter(close: pd.Series, high: pd.Series, low: pd.Series, n: int = 14) -> pd.Series:
    """Stochastic K(n). Returns the K line (% of price range)."""
    ll = low.rolling(n, min_periods=n).min()
    hh = high.rolling(n, min_periods=n).max()
    k = 100 * (close - ll) / (hh - ll).replace(0, np.nan)
    return k


def cci_adapter(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 20) -> pd.Series:
    """CCI(n) — Commodity Channel Index."""
    tp = (high + low + close) / 3.0
    sma_tp = sma_adapter(tp, n)
    md = (tp - sma_tp).abs().rolling(n, min_periods=n).mean()
    return (tp - sma_tp) / (0.015 * md.replace(0, np.nan))


def williams_r_adapter(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    """Williams %R(n)."""
    hh = high.rolling(n, min_periods=n).max()
    ll = low.rolling(n, min_periods=n).min()
    return -100 * (hh - close) / (hh - ll).replace(0, np.nan)
