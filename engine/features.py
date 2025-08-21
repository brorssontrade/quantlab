# engine/features.py
from __future__ import annotations
import numpy as np
import pandas as pd

STO_TZ = "Europe/Stockholm"

# ---------- helpers ----------
def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()

def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False, min_periods=n).mean()

def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    delta = close.diff()
    up = delta.clip(lower=0.0)
    down = (-delta).clip(lower=0.0)
    avg_gain = up.ewm(alpha=1/n, adjust=False, min_periods=n).mean()
    avg_loss = down.ewm(alpha=1/n, adjust=False, min_periods=n).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    out = 100 - (100 / (1 + rs))
    return out

def true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    prev_close = close.shift(1)
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    return pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

def atr(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    tr = true_range(high, low, close)
    return tr.ewm(alpha=1/n, adjust=False, min_periods=n).mean()

def macd_lines(close: pd.Series, fast: int = 12, slow: int = 26, signal_n: int = 9):
    macd = ema(close, fast) - ema(close, slow)
    signal = macd.ewm(span=signal_n, adjust=False, min_periods=signal_n).mean()
    hist = macd - signal
    return macd, signal, hist

def adx(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14):
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

def donchian(high: pd.Series, low: pd.Series, n: int = 20):
    dc_h = high.rolling(n, min_periods=n).max()
    dc_l = low.rolling(n, min_periods=n).min()
    dc_m = (dc_h + dc_l) / 2.0
    return dc_h, dc_l, dc_m

def vwma(close: pd.Series, volume: pd.Series, n: int = 20):
    num = (close * volume).rolling(n, min_periods=n).sum()
    den = volume.rolling(n, min_periods=n).sum()
    return num / den.replace(0, np.nan)

def stochastic_k(close: pd.Series, high: pd.Series, low: pd.Series, n: int = 14):
    ll = low.rolling(n, min_periods=n).min()
    hh = high.rolling(n, min_periods=n).max()
    k = 100 * (close - ll) / (hh - ll).replace(0, np.nan)
    return k

def cci(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 20):
    tp = (high + low + close) / 3.0
    sma_tp = sma(tp, n)
    md = (tp - sma_tp).abs().rolling(n, min_periods=n).mean()
    return (tp - sma_tp) / (0.015 * md.replace(0, np.nan))

def williams_r(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14):
    hh = high.rolling(n, min_periods=n).max()
    ll = low.rolling(n, min_periods=n).min()
    return -100 * (hh - close) / (hh - ll).replace(0, np.nan)

# ---------- main feature builder ----------
def add_common(
    df: pd.DataFrame,
    ema_fast_n: int = 20,
    ema_slow_n: int = 50,
    rsi_n: int = 14,
    atr_n: int = 14,
    **_
) -> pd.DataFrame:
    out = df.copy()

    # Tidsstämpel och sortering
    if "ts" in out.columns:
        out["ts"] = pd.to_datetime(out["ts"], utc=True, errors="coerce").dt.tz_convert(STO_TZ)
        out = out.sort_values("ts").reset_index(drop=True)

    # Bas-MAs (dina tidigare)
    out["ema_fast"] = ema(out["close"], ema_fast_n)
    out["ema_slow"] = ema(out["close"], ema_slow_n)
    out["rsi"] = rsi(out["close"], rsi_n)
    out["atr"] = atr(out["high"], out["low"], out["close"], atr_n)

    # Andra timmen per handelsdag (Stockholmstid)
    ts_local = out["ts"].dt.tz_convert(STO_TZ)
    day_id = ts_local.dt.date.ne(ts_local.dt.date.shift()).cumsum()
    out["second_hour"] = ts_local.groupby(day_id).cumcount().eq(1)

    # ----- Nya önskade indikatorer -----
    # ATR
    out["atr14"] = atr(out["high"], out["low"], out["close"], 14)
    out["atr5"]  = atr(out["high"], out["low"], out["close"], 5)

    # RSI
    out["rsi14"] = rsi(out["close"], 14)
    out["rsi2"]  = rsi(out["close"], 2)

    # MACD
    macd_line, macd_sig, macd_hist = macd_lines(out["close"], 12, 26, 9)
    out["macd"] = macd_line
    out["macd_signal"] = macd_sig
    out["macd_hist"] = macd_hist

    # ADX (+DI/-DI)
    adx14, plus_di14, minus_di14 = adx(out["high"], out["low"], out["close"], 14)
    out["adx14"] = adx14
    out["plus_di14"] = plus_di14
    out["minus_di14"] = minus_di14

    # ADR20 (genomsnittlig range i aktuell timeframe)
    out["adr20"] = (out["high"] - out["low"]).rolling(20, min_periods=20).mean()

    # Up/Down Volume Ratio 20
    prev_c = out["close"].shift(1)
    up_mask = out["close"] > prev_c
    down_mask = out["close"] < prev_c
    up_vol = out["volume"].where(up_mask, 0).rolling(20, min_periods=20).sum()
    down_vol = out["volume"].where(down_mask, 0).rolling(20, min_periods=20).sum()
    out["updownvolratio20"] = up_vol / down_vol.replace(0, np.nan)

    # Donchian 20
    dc_h, dc_l, dc_m = donchian(out["high"], out["low"], 20)
    out["donchianhigh20"] = dc_h
    out["donchianlow20"]  = dc_l
    out["donchianmid20"]  = dc_m

    # IBS
    rng = (out["high"] - out["low"])
    out["ibs"] = ((out["close"] - out["low"]) / rng.replace(0, np.nan)).clip(0, 1)

    # VWMA20
    out["vwma20"] = vwma(out["close"], out["volume"], 20)

    # Bollinger 20, k=2
    basis20 = sma(out["close"], 20)
    std20 = out["close"].rolling(20, min_periods=20).std(ddof=0)
    out["bb_basis20"]   = basis20
    out["bb_upper20_2"] = basis20 + 2 * std20
    out["bb_lower20_2"] = basis20 - 2 * std20

    # Keltner (EMA20 av Typical Price; ± 2*ATR14)
    tp = (out["high"] + out["low"] + out["close"]) / 3.0
    kmid = ema(tp, 20)
    out["keltner_mid_ema20"] = kmid
    out["keltner_upper"] = kmid + 2 * out["atr14"]
    out["keltner_lower"] = kmid - 2 * out["atr14"]

    # Stochastic & derivat
    out["stochk14"] = stochastic_k(out["close"], out["high"], out["low"], 14)
    out["stochd3"]  = sma(out["stochk14"], 3)

    # CCI20 & Williams %R(14)
    out["cci20"]  = cci(out["high"], out["low"], out["close"], 20)
    out["willr14"] = williams_r(out["high"], out["low"], out["close"], 14)

    # SMAs
    out["sma20"]  = sma(out["close"], 20)
    out["sma50"]  = sma(out["close"], 50)
    out["sma200"] = sma(out["close"], 200)

    # EMAs (5/12/26/63)
    out["ema5"]  = ema(out["close"], 5)
    out["ema12"] = ema(out["close"], 12)
    out["ema26"] = ema(out["close"], 26)
    out["ema63"] = ema(out["close"], 63)

    # --- alias för robusthet ---
    out["rsi14"] = out.get("rsi14", out.get("rsi"))
    out["ema_12"] = out.get("ema_12", out.get("ema12", out.get("ema_fast")))
    out["ema_26"] = out.get("ema_26", out.get("ema26", out.get("ema_slow")))
    out["adx14"] = out.get("adx14", out.get("adx"))
    out["atr14"] = out.get("atr14", out.get("atr"))

    return out
