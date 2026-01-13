# engine/features.py
"""
Feature engineering pipeline for OHLCV data.

All 11 classic indicators (RSI, ATR, SMA, EMA, MACD, ADX, Donchian, VWMA, Stochastic, CCI, Williams %R)
have been migrated to quantkit canonical implementations (PR4.1-PR4.5).

Call add_common() to get all standard features.
Deprecated engine indicator functions are retained for backwards compatibility but MUST NOT be imported directly.
Use indicator_adapters instead: from engine.indicator_adapters import <adapter>

Canonical reference: src/quantkit/indicators/
"""
from __future__ import annotations
import numpy as np
import pandas as pd

# Quantkit adapters for migrated indicators (PR4.1, PR4.2, PR4.3, PR4.4, PR4.5)
from engine.indicator_adapters import (
    rsi_adapter, atr_adapter, sma_adapter, ema_adapter, macd_adapter,
    adx_adapter, donchian_adapter, vwma_adapter, cci_adapter,
    williams_r_adapter, stochastic_adapter
)

STO_TZ = "Europe/Stockholm"

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

    # Bas-MAs (dina tidigare) — now using quantkit adapters
    out["ema_fast"] = ema_adapter(out["close"], ema_fast_n)
    out["ema_slow"] = ema_adapter(out["close"], ema_slow_n)
    out["rsi"] = rsi_adapter(out["close"], rsi_n)
    out["atr"] = atr_adapter(out["high"], out["low"], out["close"], atr_n)

    # Andra timmen per handelsdag (Stockholmstid)
    ts_local = out["ts"].dt.tz_convert(STO_TZ)
    day_id = ts_local.dt.date.ne(ts_local.dt.date.shift()).cumsum()
    out["second_hour"] = ts_local.groupby(day_id).cumcount().eq(1)

    # ----- Nya önskade indikatorer -----
    # ATR
    out["atr14"] = atr_adapter(out["high"], out["low"], out["close"], 14)
    out["atr5"]  = atr_adapter(out["high"], out["low"], out["close"], 5)

    # RSI
    out["rsi14"] = rsi_adapter(out["close"], 14)
    out["rsi2"]  = rsi_adapter(out["close"], 2)

    # MACD
    macd_line, macd_sig, macd_hist = macd_adapter(out["close"], 12, 26, 9)
    out["macd"] = macd_line
    out["macd_signal"] = macd_sig
    out["macd_hist"] = macd_hist

    # ADX (+DI/-DI)
    adx14, plus_di14, minus_di14 = adx_adapter(out["high"], out["low"], out["close"], 14)
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
    dc_h, dc_l, dc_m = donchian_adapter(out["high"], out["low"], 20)
    out["donchianhigh20"] = dc_h
    out["donchianlow20"]  = dc_l
    out["donchianmid20"]  = dc_m

    # IBS
    rng = (out["high"] - out["low"])
    out["ibs"] = ((out["close"] - out["low"]) / rng.replace(0, np.nan)).clip(0, 1)

    # VWMA20
    out["vwma20"] = vwma_adapter(out["close"], out["volume"], 20)

    # Bollinger 20, k=2
    basis20 = sma_adapter(out["close"], 20)
    std20 = out["close"].rolling(20, min_periods=20).std(ddof=0)
    out["bb_basis20"]   = basis20
    out["bb_upper20_2"] = basis20 + 2 * std20
    out["bb_lower20_2"] = basis20 - 2 * std20

    # Keltner (EMA20 av Typical Price; ± 2*ATR14)
    tp = (out["high"] + out["low"] + out["close"]) / 3.0
    kmid = ema_adapter(tp, 20)
    out["keltner_mid_ema20"] = kmid
    out["keltner_upper"] = kmid + 2 * out["atr14"]
    out["keltner_lower"] = kmid - 2 * out["atr14"]

    # Stochastic & derivat
    out["stochk14"] = stochastic_adapter(out["close"], out["high"], out["low"], 14)
    out["stochd3"]  = sma_adapter(out["stochk14"], 3)

    # CCI20 & Williams %R(14)
    out["cci20"]  = cci_adapter(out["high"], out["low"], out["close"], 20)
    out["willr14"] = williams_r_adapter(out["high"], out["low"], out["close"], 14)

    # SMAs
    out["sma20"]  = sma_adapter(out["close"], 20)
    out["sma50"]  = sma_adapter(out["close"], 50)
    out["sma200"] = sma_adapter(out["close"], 200)

    # EMAs (5/12/26/63)
    out["ema5"]  = ema_adapter(out["close"], 5)
    out["ema12"] = ema_adapter(out["close"], 12)
    out["ema26"] = ema_adapter(out["close"], 26)
    out["ema63"] = ema_adapter(out["close"], 63)

    # --- alias för robusthet ---
    out["rsi14"] = out.get("rsi14", out.get("rsi"))
    out["ema_12"] = out.get("ema_12", out.get("ema12", out.get("ema_fast")))
    out["ema_26"] = out.get("ema_26", out.get("ema26", out.get("ema_slow")))
    out["adx14"] = out.get("adx14", out.get("adx"))
    out["atr14"] = out.get("atr14", out.get("atr"))

    return out
