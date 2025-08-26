from __future__ import annotations
import numpy as np
import pandas as pd
from .base import StrategySpec

DEFAULTS = dict(
    # volymfilter
    use_vol_filter=True, vol_len=50, vol_mult=2.5,
    # oscillator
    use_osc=True, osc_len=50, osc_type="wma",   # "sma","ema","wma","rma","hma","vwma"
    # kanaler
    ch_len=125, ch_fast_pct=35,
    # trailing (approx per-position; kräver att signalerna inte överlappar)
    trail_on=True, leverage=5.0, stop_pct=10.0, trail_thr_pct=10.0, trail_min_pct=20.0,
    # allmänt
    side="both", sl_pct=None, tp_pct=None, max_bars=0
)

def _ma(s: pd.Series, n: int, kind: str, vol: pd.Series | None = None) -> pd.Series:
    s = pd.to_numeric(s, errors="coerce")
    n = max(int(n), 1)
    k = (kind or "sma").lower()
    if k == "ema":
        return s.ewm(span=n, adjust=False).mean()
    if k == "wma":
        w = np.arange(1, n+1)
        return s.rolling(n, min_periods=n).apply(lambda x: np.dot(x, w)/w.sum(), raw=True)
    if k == "rma":  # Wilder
        alpha = 1.0/n
        return s.ewm(alpha=alpha, adjust=False).mean()
    if k == "hma":  # Hull (built from WMA)
        wma = lambda x, m: x.rolling(m, min_periods=m).apply(
            lambda a: np.dot(a, np.arange(1, m+1))/((m*(m+1))/2), raw=True)
        wma_fast = wma(s, max(n//2,1)); wma_slow = wma(s, n)
        hull = 2*wma_fast - wma_slow
        m = max(int(np.sqrt(n)), 1)
        return wma(hull, m)
    if k == "vwma" and vol is not None:
        v = pd.to_numeric(vol, errors="coerce").fillna(0.0)
        return (s*v).rolling(n, min_periods=n).sum() / v.rolling(n, min_periods=n).sum()
    # default SMA
    return s.rolling(n, min_periods=n).mean()

def _obv_series(close: pd.Series, vol: pd.Series,
                use_filter: bool, flen: int, fmult: float) -> pd.Series:
    c = pd.to_numeric(close, errors="coerce")
    v = pd.to_numeric(vol,   errors="coerce").fillna(0.0)
    thr = (v.rolling(flen).mean() - v.rolling(flen).std()*float(fmult)).abs()
    sign = np.sign(c.diff().fillna(0.0))
    obv = np.zeros(len(c), dtype=float)
    for i in range(1, len(c)):
        allow = (not use_filter) or (v.iat[i] >= (thr.iat[i] if not np.isnan(thr.iat[i]) else 0.0))
        obv[i] = obv[i-1] + (sign[i]*v.iat[i] if allow else 0.0)
    return pd.Series(obv, index=c.index)

def _donch(s: pd.Series, n: int):
    top = s.rolling(n, min_periods=n).max()
    bot = s.rolling(n, min_periods=n).min()
    mid = (top+bot)/2.0
    return top, mid, bot

def _since_entry_running(series_high: pd.Series, entry: pd.Series) -> pd.Series:
    # enkel ”per-position” HIGHEST sedan senaste entry (approx)
    grp = entry.cumsum()
    return series_high.groupby(grp, dropna=False).cummax()

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    h = pd.to_numeric(df["high"],   errors="coerce")
    l = pd.to_numeric(df["low"],    errors="coerce")
    c = pd.to_numeric(df["close"],  errors="coerce")
    v = pd.to_numeric(df["volume"], errors="coerce").fillna(0.0)

    # OBV + oscillator
    obv = _obv_series(c, v, p["use_vol_filter"], int(p["vol_len"]), float(p["vol_mult"]))
    obv_osc = obv - _ma(obv, int(p["osc_len"]), str(p["osc_type"]), v if p["osc_type"]=="vwma" else None) if p["use_osc"] else obv

    slow_top_p, slow_mid_p, slow_bot_p = _donch(h, int(p["ch_len"]))
    fast_len = max(int(int(p["ch_len"])*float(p["ch_fast_pct"])/100.0), 1)
    fast_top_p, fast_mid_p, fast_bot_p = _donch(h, fast_len)  # pris: använder high/low via high-kanal för top/bot-check

    slow_top_o, _, slow_bot_o = _donch(obv_osc, int(p["ch_len"]))
    fast_top_o, _, fast_bot_o = _donch(obv_osc, fast_len)

    enter_long_price  = h > slow_top_p.shift(1)
    enter_short_price = l < slow_bot_p.shift(1)
    exit_long_price   = l < fast_bot_p.shift(1)
    exit_short_price  = h > fast_top_p.shift(1)

    enter_long_obv  = (obv_osc > slow_top_o.shift(1)) & (obv_osc > 0 if p["use_osc"] else True)
    enter_short_obv = (obv_osc < slow_bot_o.shift(1)) & (obv_osc < 0 if p["use_osc"] else True)
    exit_long_obv   = obv_osc < fast_bot_o.shift(1)
    exit_short_obv  = obv_osc > fast_top_o.shift(1)

    enter_long  = (enter_long_price  & enter_long_obv).fillna(False)
    enter_short = (enter_short_price & enter_short_obv).fillna(False)

    # Trailing (approx): stoppa long om close faller under dynamisk trail efter att ha passerat tröskel
    if p["trail_on"]:
        # Long
        long_since_entry_high = _since_entry_running(h, enter_long)
        long_thr = c + (c/float(p["leverage"])) * (float(p["trail_thr_pct"])/100.0)
        # aktivera trail först när high > threshold
        trail_active = long_since_entry_high > long_thr
        long_trail_stop = long_since_entry_high - (long_since_entry_high/float(p["leverage"])) * (float(p["trail_min_pct"])/100.0)
        long_trail_exit = trail_active & (c < long_trail_stop)

        # Short
        short_since_entry_low = _since_entry_running(-l, enter_short)  # trick: högsta av (-low) = lägsta low
        short_thr = c - (c/float(p["leverage"])) * (float(p["trail_thr_pct"])/100.0)
        trail_active_s = (-short_since_entry_low) < short_thr
        short_trail_stop = (-short_since_entry_low) + ((-short_since_entry_low)/float(p["leverage"])) * (float(p["trail_min_pct"])/100.0)
        short_trail_exit = trail_active_s & (c > short_trail_stop)
    else:
        long_trail_exit = pd.Series(False, index=c.index)
        short_trail_exit = pd.Series(False, index=c.index)

    side = str(p["side"]).lower()
    if side == "long":
        entry = enter_long
        exit_rule = (exit_long_price & exit_long_obv) | long_trail_exit
        meta_side = "long"
    elif side == "short":
        entry = enter_short
        exit_rule = (exit_short_price & exit_short_obv) | short_trail_exit
        meta_side = "short"
    else:
        # default: long (väljs ofta i aktier)
        entry = enter_long
        exit_rule = (exit_long_price & exit_long_obv) | long_trail_exit
        meta_side = "long"

    meta = dict(
        sl_pct=p["sl_pct"] if p["sl_pct"] is not None else float(p["stop_pct"]),
        tp_pct=p["tp_pct"], max_bars=int(p["max_bars"]), side=meta_side
    )
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="hancock_obv_osc",
    name="Hancock Filtered OBV OSC (kanaler + trail)",
    direction="both",
    defaults=DEFAULTS,
    description="OBV med volymfilter → oscillator; pris/obv-brott av Donchian-kanaler; enkel trail-stop.",
    generate=_generate
)
