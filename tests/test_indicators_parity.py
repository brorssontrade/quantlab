# tests/test_indicators_parity.py
"""
Parity tests: verify indicator adapters work correctly.

Test Strategy:
1. Adapters produce stable outputs with deterministic OHLCV
2. add_common() produces all expected columns
3. NaN patterns in warmup periods are consistent

Post-PR8: Adapters are the public API surface for deprecated engine.features indicators.
"""

from __future__ import annotations
import numpy as np
import pandas as pd
import pytest

# Adapter implementations (public API surface, post-PR8)
from engine.indicator_adapters import (
    rsi_adapter as engine_rsi,
    atr_adapter as engine_atr,
    sma_adapter as engine_sma,
    ema_adapter as engine_ema,
    macd_adapter as engine_macd_lines,
    adx_adapter as engine_adx,
    donchian_adapter as engine_donchian,
    vwma_adapter as engine_vwma,
    cci_adapter as engine_cci,
    williams_r_adapter as engine_williams_r,
    stochastic_adapter as engine_stochastic_k,
)
from engine.features import add_common


# ========== Test Fixtures ==========

@pytest.fixture
def golden_ohlcv() -> pd.DataFrame:
    """
    Deterministic OHLCV DataFrame for adapter testing.
    
    100 bars with fixed seed for reproducibility.
    Price starts at 100, random walk with volatility.
    """
    np.random.seed(42)
    n = 100
    returns = np.random.normal(0.001, 0.02, n)
    close = 100 * np.cumprod(1 + returns)
    
    # Generate OHLC from close
    open_ = close * (1 + np.random.normal(0, 0.005, n))
    high = np.maximum(close, open_) * (1 + np.abs(np.random.normal(0, 0.01, n)))
    low = np.minimum(close, open_) * (1 - np.abs(np.random.normal(0, 0.01, n)))
    volume = np.random.uniform(1e6, 5e6, n)
    
    df = pd.DataFrame({
        'open': open_,
        'high': high,
        'low': low,
        'close': close,
        'volume': volume
    })
    
    return df


# ========== Tests: RSI ==========

def test_rsi_parity(golden_ohlcv):
    """RSI adapter produces output with correct NaN pattern."""
    df = golden_ohlcv.copy()
    output = engine_rsi(df['close'], n=14)
    
    assert output.index.equals(df.index), "RSI index mismatch"
    assert output.iloc[:14].isna().all(), "RSI warmup incorrect"
    assert not output.iloc[14:].isna().any(), "RSI has unexpected NaNs"
    assert ((output.iloc[14:] >= 0) & (output.iloc[14:] <= 100)).all(), "RSI out of range"


def test_rsi_multiple_periods(golden_ohlcv):
    """RSI with different periods."""
    df = golden_ohlcv.copy()
    for n in [2, 5, 14, 21]:
        output = engine_rsi(df['close'], n=n)
        assert output.iloc[:n].isna().all(), f"RSI({n}) warmup incorrect"
        assert not output.iloc[n:].isna().any(), f"RSI({n}) has unexpected NaNs"


# ========== Tests: ATR ==========

def test_atr_parity(golden_ohlcv):
    """ATR adapter produces output with correct NaN pattern."""
    df = golden_ohlcv.copy()
    output = engine_atr(df['high'], df['low'], df['close'], n=14)
    
    assert output.index.equals(df.index), "ATR index mismatch"
    assert output.iloc[:13].isna().all(), "ATR warmup incorrect"
    assert not output.iloc[13:].isna().any(), "ATR has unexpected NaNs"
    assert (output.iloc[13:] > 0).all(), "ATR has non-positive values"


def test_atr_multiple_periods(golden_ohlcv):
    """ATR with different periods."""
    df = golden_ohlcv.copy()
    for n in [5, 14, 21]:
        output = engine_atr(df['high'], df['low'], df['close'], n=n)
        assert output.iloc[:n-1].isna().all(), f"ATR({n}) warmup incorrect"
        assert not output.iloc[n-1:].isna().any(), f"ATR({n}) has unexpected NaNs"


# ========== Tests: SMA / EMA ==========

def test_sma_parity(golden_ohlcv):
    """SMA adapter produces output with correct NaN pattern."""
    df = golden_ohlcv.copy()
    output = engine_sma(df['close'], n=20)
    
    assert output.index.equals(df.index), "SMA index mismatch"
    assert output.iloc[:19].isna().all(), "SMA warmup incorrect"
    assert not output.iloc[19:].isna().any(), "SMA has unexpected NaNs"


def test_ema_parity(golden_ohlcv):
    """EMA adapter produces output with correct NaN pattern."""
    df = golden_ohlcv.copy()
    output = engine_ema(df['close'], n=20)
    
    assert output.index.equals(df.index), "EMA index mismatch"
    assert output.iloc[:19].isna().all(), "EMA warmup incorrect"
    assert not output.iloc[19:].isna().any(), "EMA has unexpected NaNs"


def test_sma_multiple_periods(golden_ohlcv):
    """SMA with different periods."""
    df = golden_ohlcv.copy()
    for n in [5, 20, 50]:
        output = engine_sma(df['close'], n=n)
        assert output.iloc[:n-1].isna().all(), f"SMA({n}) warmup incorrect"


def test_ema_multiple_periods(golden_ohlcv):
    """EMA with different periods."""
    df = golden_ohlcv.copy()
    for n in [5, 20, 50]:
        output = engine_ema(df['close'], n=n)
        assert output.iloc[:n-1].isna().all(), f"EMA({n}) warmup incorrect"


# ========== Tests: MACD / ADX ==========

def test_macd_parity(golden_ohlcv):
    """MACD adapter produces three outputs."""
    df = golden_ohlcv.copy()
    macd, signal, hist = engine_macd_lines(df['close'], fast=12, slow=26, signal_n=9)
    
    assert macd.index.equals(df.index), "MACD index mismatch"
    assert signal.index.equals(df.index), "MACD signal index mismatch"
    assert hist.index.equals(df.index), "MACD histogram index mismatch"
    
    # Histogram = macd - signal (identity check)
    np.testing.assert_allclose(hist.values, (macd - signal).values, rtol=1e-9, atol=1e-9, equal_nan=True)


def test_adx_parity(golden_ohlcv):
    """ADX adapter produces three outputs."""
    df = golden_ohlcv.copy()
    adx, plus_di, minus_di = engine_adx(df['high'], df['low'], df['close'], n=14)
    
    assert adx.index.equals(df.index), "ADX index mismatch"
    assert plus_di.index.equals(df.index), "ADX +DI index mismatch"
    assert minus_di.index.equals(df.index), "ADX -DI index mismatch"


# ========== Tests: Donchian, VWMA, CCI, Williams %R ==========

def test_donchian_parity(golden_ohlcv):
    """Donchian adapter produces three outputs."""
    df = golden_ohlcv.copy()
    high, low, mid = engine_donchian(df['high'], df['low'], n=20)
    
    assert high.index.equals(df.index), "Donchian high index mismatch"
    assert low.index.equals(df.index), "Donchian low index mismatch"
    assert mid.index.equals(df.index), "Donchian mid index mismatch"
    
    # Mid = (high + low) / 2 (identity check)
    np.testing.assert_allclose(mid.values, (high + low).values / 2, rtol=1e-9, atol=1e-9, equal_nan=True)


def test_vwma_parity(golden_ohlcv):
    """VWMA adapter produces output with correct NaN pattern."""
    df = golden_ohlcv.copy()
    output = engine_vwma(df['close'], df['volume'], n=20)
    
    assert output.index.equals(df.index), "VWMA index mismatch"
    assert output.iloc[:19].isna().all(), "VWMA warmup incorrect"


def test_cci_parity(golden_ohlcv):
    """CCI adapter produces output with correct NaN pattern."""
    df = golden_ohlcv.copy()
    output = engine_cci(df['high'], df['low'], df['close'], n=20)
    
    assert output.index.equals(df.index), "CCI index mismatch"
    assert output.iloc[:19].isna().all(), "CCI warmup incorrect"


def test_williams_r_parity(golden_ohlcv):
    """Williams %R adapter produces output with correct range."""
    df = golden_ohlcv.copy()
    output = engine_williams_r(df['high'], df['low'], df['close'], n=14)
    
    assert output.index.equals(df.index), "Williams %R index mismatch"
    assert ((output >= -100) & (output <= 0)).all() or output.isna().all(), "Williams %R out of range"


def test_stochastic_k_parity(golden_ohlcv):
    """Stochastic K adapter produces output with correct range."""
    df = golden_ohlcv.copy()
    output = engine_stochastic_k(df['close'], df['high'], df['low'], n=14)
    
    assert output.index.equals(df.index), "Stochastic K index mismatch"
    assert ((output >= 0) & (output <= 100) | output.isna()).all(), "Stochastic K out of range"


# ========== Tests: add_common Integration ==========

def test_add_common_rsi_columns(golden_ohlcv):
    """add_common produces RSI columns."""
    df = golden_ohlcv.copy()
    result = add_common(df)
    
    assert 'rsi' in result.columns, "Missing rsi column"
    assert 'rsi14' in result.columns, "Missing rsi14 column"
    assert 'rsi2' in result.columns, "Missing rsi2 column"


def test_add_common_atr_columns(golden_ohlcv):
    """add_common produces ATR columns."""
    df = golden_ohlcv.copy()
    result = add_common(df)
    
    assert 'atr' in result.columns, "Missing atr column"
    assert 'atr14' in result.columns, "Missing atr14 column"
    assert 'atr5' in result.columns, "Missing atr5 column"


def test_add_common_sma_ema_columns(golden_ohlcv):
    """add_common produces SMA/EMA columns."""
    df = golden_ohlcv.copy()
    result = add_common(df)
    
    for col in ['ema_fast', 'ema_slow', 'sma20', 'sma50', 'sma200', 'ema5', 'ema12', 'ema26', 'ema63']:
        assert col in result.columns, f"Missing {col} column"


def test_add_common_macd_adx_columns(golden_ohlcv):
    """add_common produces MACD/ADX columns."""
    df = golden_ohlcv.copy()
    result = add_common(df)
    
    for col in ['macd', 'macd_signal', 'macd_hist', 'adx14', 'plus_di14', 'minus_di14']:
        assert col in result.columns, f"Missing {col} column"


def test_add_common_donchian_vwma_cci_willr_columns(golden_ohlcv):
    """add_common produces Donchian/VWMA/CCI/Williams %R columns."""
    df = golden_ohlcv.copy()
    result = add_common(df)
    
    for col in ['donchianhigh20', 'donchianlow20', 'donchianmid20', 'vwma20', 'cci20', 'willr14']:
        assert col in result.columns, f"Missing {col} column"


def test_add_common_stochastic_columns(golden_ohlcv):
    """add_common produces Stochastic columns."""
    df = golden_ohlcv.copy()
    result = add_common(df)
    
    for col in ['stochk14', 'stochd3']:
        assert col in result.columns, f"Missing {col} column"


def test_add_common_no_side_effects(golden_ohlcv):
    """add_common doesn't modify input DataFrame."""
    df = golden_ohlcv.copy()
    df_orig = df.copy()
    
    result = add_common(df)
    
    # Check original df unchanged
    pd.testing.assert_frame_equal(df, df_orig)
    
    # Check result has more columns
    assert len(result.columns) > len(df.columns), "add_common should add columns"
