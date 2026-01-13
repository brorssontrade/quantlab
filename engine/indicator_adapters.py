"""
Indicator adapters: wrapper functions for quantkit canonical implementations.

This module provides engine-compatible function signatures that map to the quantkit
canonical implementations in src/quantkit/indicators/.

These adapters are the public API post-PR8. All indicator logic has been migrated to
quantkit as of PR4.1-PR4.5, and engine/features.py has been deprecated.

Canonical reference: src/quantkit/indicators/
Migration: PR4.1 (RSI), PR4.2 (ATR), PR4.3 (SMA/EMA), PR4.4 (MACD/ADX), PR4.5 (Donchian/VWMA/Stochastic/CCI/Williams %R)
Deleted from engine/features.py: PR8
"""

from __future__ import annotations
import pandas as pd
from src.quantkit.indicators import (
    rsi as quantkit_rsi,
    atr as quantkit_atr,
    sma as quantkit_sma,
    ema as quantkit_ema,
    macd as quantkit_macd,
    adx as quantkit_adx,
    donchian as quantkit_donchian,
    vwma as quantkit_vwma,
    stochastic as quantkit_stochastic,
    cci as quantkit_cci,
    willr as quantkit_willr,
)


def rsi_adapter(close: pd.Series, n: int = 14) -> pd.Series:
    """RSI(n) — Relative Strength Index. Quantkit canonical: src/quantkit/indicators/rsi.py"""
    return quantkit_rsi(close, n)


def atr_adapter(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    """ATR(n) — Average True Range. Quantkit canonical: src/quantkit/indicators/atr.py"""
    return quantkit_atr(high, low, close, n)


def sma_adapter(s: pd.Series, n: int) -> pd.Series:
    """SMA(n) — Simple Moving Average. Quantkit canonical: src/quantkit/indicators/sma.py"""
    return quantkit_sma(s, n)


def ema_adapter(s: pd.Series, n: int) -> pd.Series:
    """EMA(n) — Exponential Moving Average. Quantkit canonical: src/quantkit/indicators/ema.py"""
    return quantkit_ema(s, n)


def macd_adapter(close: pd.Series, fast: int = 12, slow: int = 26, signal_n: int = 9) -> tuple:
    """MACD — Moving Average Convergence Divergence. Returns (macd_line, signal, histogram).
    Quantkit canonical: src/quantkit/indicators/macd.py"""
    result = quantkit_macd(close, fast, slow, signal_n)
    # quantkit_macd returns a DataFrame, extract MACD, Signal, Histogram
    if isinstance(result, pd.DataFrame):
        return result['MACD'], result['Signal'], result['Histogram']
    # Fallback: assume tuple return
    return result


def adx_adapter(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> tuple:
    """ADX(n) — Average Directional Index. Returns (adx, plus_di, minus_di).
    Quantkit canonical: src/quantkit/indicators/adx.py"""
    result = quantkit_adx(high, low, close, n)
    # quantkit_adx returns a DataFrame, extract ADX, +DI, -DI
    if isinstance(result, pd.DataFrame):
        return result['ADX'], result['+DI'], result['-DI']
    # Fallback: assume tuple return
    return result


def donchian_adapter(high: pd.Series, low: pd.Series, n: int = 20) -> tuple:
    """Donchian Channel(n). Returns (high, low, mid).
    Quantkit canonical: src/quantkit/indicators/donchian.py"""
    result = quantkit_donchian(high, low, n)
    # quantkit_donchian returns a DataFrame, extract High, Low, Mid
    if isinstance(result, pd.DataFrame):
        return result['High'], result['Low'], result['Mid']
    # Fallback: assume tuple return
    return result


def vwma_adapter(close: pd.Series, volume: pd.Series, n: int = 20) -> pd.Series:
    """VWMA(n) — Volume Weighted Moving Average. Quantkit canonical: src/quantkit/indicators/vwma.py"""
    return quantkit_vwma(close, volume, n)


def stochastic_adapter(close: pd.Series, high: pd.Series, low: pd.Series, n: int = 14) -> pd.Series:
    """Stochastic K(n). Returns the K line (% of price range).
    Quantkit canonical: src/quantkit/indicators/stochastic.py"""
    result = quantkit_stochastic(close, high, low, n)
    # quantkit_stochastic returns K series or DataFrame with K,D columns
    if isinstance(result, pd.DataFrame):
        return result['K']
    # Fallback: assume Series return
    return result


def cci_adapter(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 20) -> pd.Series:
    """CCI(n) — Commodity Channel Index. Quantkit canonical: src/quantkit/indicators/cci.py"""
    return quantkit_cci(high, low, close, n)


def williams_r_adapter(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    """Williams %R(n). Quantkit canonical: src/quantkit/indicators/willr.py"""
    return quantkit_willr(high, low, close, n)
