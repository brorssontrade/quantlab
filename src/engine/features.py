import numpy as np
import pandas as pd

def _ema(s: pd.Series, span: int) -> pd.Series:
    return s.ewm(span=span, adjust=False, min_periods=span).mean()

def _sma(s: pd.Series, window: int) -> pd.Series:
    return s.rolling(window, min_periods=window).mean()

def add_common(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    # tidsflagga
    if "ts" in out.columns:
        out["second_hour"] = (pd.to_datetime(out["ts"]).dt.hour == 2).astype(int)

    close = out["close"].astype(float)
    high  = out["high"].astype(float)
    low   = out["low"].astype(float)
    vol   = out.get("volume", pd.Series(index=out.index, dtype=float)).astype(float).fillna(0.0)

    # EMAs / SMAs
    out["ema_fast"] = _ema(close, 20)
    out["ema_slow"] = _ema(close, 50)
    out["ema5"]  = _ema(close, 5)
    out["ema12"] = _ema(close, 12)
    out["ema26"] = _ema(close, 26)
    out["ema63"] = _ema(close, 63)

    out["sma20"]  = _sma(close, 20)
    out["sma50"]  = _sma(close, 50)
    out["sma200"] = _sma(close, 200)

    # RSI
    def rsi(series: pd.Series, length: int) -> pd.Series:
        delta = series.diff()
        up   = delta.clip(lower=0).ewm(alpha=1/length, adjust=False).mean()
        down = (-delta.clip(upper=0)).ewm(alpha=1/length, adjust=False).mean()
        rs = up / (down + 1e-12)
        return 100 - 100/(1 + rs)

    out["rsi14"] = rsi(close, 14)
    out["rsi2"]  = rsi(close, 2)
    out["rsi"]   = out["rsi14"]

    # True Range & ATR
    tr = pd.concat([
        (high - low),
        (high - close.shift()).abs(),
        (low  - close.shift()).abs()
    ], axis=1).max(axis=1)
    out["atr14"] = tr.ewm(alpha=1/14, adjust=False).mean()
    out["atr5"]  = tr.ewm(alpha=1/5,  adjust=False).mean()
    out["atr"]   = out["atr14"]

    # +DM/-DM → DI/ADX
    up_move   = high.diff()
    down_move = -low.diff()
    plus_dm  = np.where((up_move > down_move) & (up_move > 0),  up_move,  0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    plus_dm  = pd.Series(plus_dm, index=out.index)
    minus_dm = pd.Series(minus_dm, index=out.index)

    tr14      = tr.ewm(alpha=1/14, adjust=False).mean()
    plus_dm14 = plus_dm.ewm(alpha=1/14, adjust=False).mean()
    minus_dm14= minus_dm.ewm(alpha=1/14, adjust=False).mean()

    plus_di14  = 100 * (plus_dm14 / (tr14 + 1e-12))
    minus_di14 = 100 * (minus_dm14 / (tr14 + 1e-12))
    dx         = ((plus_di14 - minus_di14).abs() / (plus_di14 + minus_di14 + 1e-12)) * 100
    adx14      = dx.ewm(alpha=1/14, adjust=False).mean()

    out["plus_di14"]  = plus_di14
    out["minus_di14"] = minus_di14
    out["adx14"]      = adx14

    # MACD
    macd   = _ema(close, 12) - _ema(close, 26)
    signal = _ema(macd, 9)
    out["macd"]        = macd
    out["macd_signal"] = signal
    out["macd_hist"]   = macd - signal

    # Bollinger 20, 2 std
    basis = _sma(close, 20)
    st    = close.rolling(20, min_periods=20).std()
    out["bb_basis20"]   = basis
    out["bb_upper20_2"] = basis + 2*st
    out["bb_lower20_2"] = basis - 2*st

    # Donchian 20
    hh = high.rolling(20, min_periods=20).max()
    ll = low.rolling(20, min_periods=20).min()
    out["donchianhigh20"] = hh
    out["donchianlow20"]  = ll
    out["donchianmid20"]  = (hh + ll)/2

    # Keltner (EMA20 ± 2*ATR20)
    atr20 = tr.ewm(alpha=1/20, adjust=False).mean()
    mid   = _ema(close, 20)
    out["keltner_mid_ema20"] = mid
    out["keltner_upper"]     = mid + 2*atr20
    out["keltner_lower"]     = mid - 2*atr20

    # Stochastic
    low14  = low.rolling(14,  min_periods=14).min()
    high14 = high.rolling(14, min_periods=14).max()
    k = 100 * (close - low14) / (high14 - low14 + 1e-12)
    out["stochk14"] = k
    out["stochd3"]  = k.rolling(3, min_periods=3).mean()

    # CCI(20)
    tp     = (high + low + close) / 3
    sma_tp = tp.rolling(20, min_periods=20).mean()
    mad    = (tp - sma_tp).abs().rolling(20, min_periods=20).mean()
    out["cci20"] = (tp - sma_tp) / (0.015 * (mad + 1e-12))

    # Williams %R(14)
    out["willr14"] = -100 * (high14 - close) / (high14 - low14 + 1e-12)

    # ADR(20)
    out["adr20"] = (high - low).rolling(20, min_periods=20).mean()

    # Up/Down volume ratio 20
    up   = close.diff() > 0
    down = close.diff() < 0
    upv  = (vol.where(up,   0.0)).rolling(20, min_periods=20).sum()
    dnv  = (vol.where(down, 0.0)).rolling(20, min_periods=20).sum()
    out["updownvolratio20"] = upv / (dnv + 1e-12)

    # VWMA20
    out["vwma20"] = (close * vol).rolling(20, min_periods=20).sum() / (vol.rolling(20, min_periods=20).sum() + 1e-12)

    # IBS (0..1)
    out["ibs"] = (close - low) / (high - low + 1e-12)

    return out

