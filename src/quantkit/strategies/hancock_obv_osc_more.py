# src/quantkit/strategies/hancock_obv_osc_more.py
from __future__ import annotations
import numpy as np
import pandas as pd
from .base import StrategySpec

DEFAULTS = dict(
    # Volymfilter
    use_vol_filter=True, vol_len=50, vol_mult=2.5,

    # Oscillator (OBV - MA(OBV))
    use_osc=True, osc_len=50, osc_type="wma",   # "sma","ema","wma","hma","vwma","rma","alma"
    alma_offset=0.85, alma_sigma=10,

    # Kanaler
    ch_len=125, ch_fast_pct=35,

    # Trailing (approx per-position)
    trail_on=True, leverage=5.0, stop_pct=10.0, trail_thr_pct=10.0, trail_min_pct=20.0,

    # Övrigt
    side="both", sl_pct=None, tp_pct=None, max_bars=0
)

def _sma(x: pd.Series, n: int) -> pd.Series:
    return x.rolling(n, min_periods=n).mean()

def _ema(x: pd.Series, n: int) -> pd.Series:
    return x.ewm(span=n, adjust=False).mean()

def _wma(x: pd.Series, n: int) -> pd.Series:
    w = np.arange(1, n+1)
    return x.rolling(n, min_periods=n).apply(lambda a: np.dot(a, w)/w.sum(), raw=True)

def _rma(x: pd.Series, n: int) -> pd.Series:
    alpha = 1.0/n
    return x.ewm(alpha=alpha, adjust=False).mean()

def _hma(x: pd.Series, n: int) -> pd.Series:
    # Hull MA via WMA
    n = max(int(n),1)
    wma = lambda s, m: s.rolling(m, min_periods=m).apply(
        lambda a: np.dot(a, np.arange(1, m+1))/((m*(m+1))/2), raw=True)
    w_fast = wma(x, max(n//2,1))
    w_slow = wma(x, n)
    hull = 2*w_fast - w_slow
    m = max(int(np.sqrt(n)), 1)
    return wma(hull, m)

def _vwma(x: pd.Series, n: int, vol: pd.Series) -> pd.Series:
    num = (x*vol).rolling(n, min_periods=n).sum()
    den = vol.rolling(n, min_periods=n).sum()
    return num/den

def _alma(x: pd.Series, n: int, offset: float, sigma: float) -> pd.Series:
    n = max(int(n),1)
    m = offset * (n - 1)
    s = n / sigma
    def _roll(a):
        idx = np.arange(len(a))
        w = np.exp(-((idx - m)**2) / (2*s*s))
        return np.dot(a, w)/w.sum()
    return x.rolling(n, min_periods=n).apply(_roll, raw=True)

def _ma(x: pd.Series, n: int, kind: str, vol: pd.Series|None, alma_offset: float, alma_sigma: int) -> pd.Series:
    kind = (kind or "sma").lower()
    if kind == "ema":  return _ema(x, n)
    if kind == "wma":  return _wma(x, n)
    if kind == "rma":  return _rma(x, n)
    if kind == "hma":  return _hma(x, n)
    if kind == "vwma": return _vwma(x, n, vol if vol is not None else pd.Series(0.0, index=x.index))
    if kind == "alma": return _alma(x, n, alma_offset, alma_sigma)
    return _sma(x, n)

def _obv(close: pd.Series, vol: pd.Series,
         use_filter: bool, flen: int, fmult: float) -> pd.Series:
    c = pd.to_numeric(close, errors="coerce")
    v = pd.to_numeric(vol,   errors="coerce").fillna(0.0)
    # threshold ≈ |avg(volume,len) - stdev(volume,len) * mult|
    thr = (v.rolling(flen).mean() - v.rolling(flen).std()*float(fmult)).abs()
    sign = np.sign(c.diff().fillna(0.0))
    out = np.zeros(len(c), dtype=float)
    for i in range(1, len(c)):
        allow = (not use_filter) or (v.iat[i] >= (thr.iat[i] if not np.isnan(thr.iat[i]) else 0.0))
        out[i] = out[i-1] + (sign[i]*v.iat[i] if allow else 0.0)
    return pd.Series(out, index=c.index)

def _donch(s: pd.Series, n: int):
    top = s.rolling(n, min_periods=n).max()
    bot = s.rolling(n, min_periods=n).min()
    mid = (top+bot)/2.0
    return top, mid, bot

def _cross_up(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a > b) & (a.shift(1) <= b.shift(1))

def _cross_down(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a < b) & (a.shift(1) >= b.shift(1))

def _since_entry_high(close_high: pd.Series, entry: pd.Series) -> pd.Series:
    grp = entry.cumsum()
    return close_high.groupby(grp, dropna=False).cummax()

def _since_entry_low(close_low: pd.Series, entry: pd.Series) -> pd.Series:
    grp = entry.cumsum()
    # högsta av (-low) = min low; ta minus igen
    m = (-close_low).groupby(grp, dropna=False).cummax()
    return -m

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    h = pd.to_numeric(df["high"],   errors="coerce")
    l = pd.to_numeric(df["low"],    errors="coerce")
    c = pd.to_numeric(df["close"],  errors="coerce")
    v = pd.to_numeric(df["volume"], errors="coerce").fillna(0.0)

    # OBV & oscillator
    obv = _obv(c, v, bool(p["use_vol_filter"]), int(p["vol_len"]), float(p["vol_mult"]))
    obv_ma = _ma(obv, int(p["osc_len"]), str(p["osc_type"]), v,
                 float(p["alma_offset"]), int(p["alma_sigma"])) if p["use_osc"] else pd.Series(0.0, index=c.index)
    obv_osc = (obv - obv_ma) if p["use_osc"] else obv

    # Kanaler: pris & OBV
    slow_len = int(p["ch_len"])
    fast_len = max(int(slow_len * float(p["ch_fast_pct"]) / 100.0), 1)

    slow_top_p, _, slow_bot_p = _donch(h, slow_len)
    fast_top_p, _, fast_bot_p = _donch(h, fast_len)   # pris: top/bot via high-baserad Donchian

    slow_top_o, _, slow_bot_o = _donch(obv_osc, slow_len)
    fast_top_o, _, fast_bot_o = _donch(obv_osc, fast_len)

    # Inträde/exit (som i Hancock-andan)
    enter_long_price  = _cross_up(h, slow_top_p.shift(1))
    enter_short_price = _cross_down(l, slow_bot_p.shift(1))
    exit_long_price   = _cross_down(l, fast_bot_p.shift(1))
    exit_short_price  = _cross_up(h, fast_top_p.shift(1))

    enter_long_obv  = (obv_osc > slow_top_o.shift(1)) & (obv_osc > 0 if p["use_osc"] else True)
    enter_short_obv = (obv_osc < slow_bot_o.shift(1)) & (obv_osc < 0 if p["use_osc"] else True)
    exit_long_obv   = obv_osc < fast_bot_o.shift(1)
    exit_short_obv  = obv_osc > fast_top_o.shift(1)

    enter_long  = (enter_long_price  & enter_long_obv).fillna(False)
    enter_short = (enter_short_price & enter_short_obv).fillna(False)

    # Trailing (approx per position; funkar bäst när entries inte överlappar)
    if p["trail_on"]:
        # Long trail: aktivera efter att ny HH passerat tröskel, stoppa på minsta retrace-nivå
        since_high = _since_entry_high(h, enter_long)
        thr_long   = c + (c/float(p["leverage"])) * (float(p["trail_thr_pct"])/100.0)
        trail_on_l = since_high > thr_long
        trail_stop_l = since_high - (since_high/float(p["leverage"])) * (float(p["trail_min_pct"])/100.0)
        trail_exit_l = trail_on_l & (c < trail_stop_l)

        # Short trail
        since_low  = _since_entry_low(l, enter_short)
        thr_short  = c - (c/float(p["leverage"])) * (float(p["trail_thr_pct"])/100.0)
        trail_on_s = since_low < thr_short
        trail_stop_s = since_low + (since_low/float(p["leverage"])) * (float(p["trail_min_pct"])/100.0)
        trail_exit_s = trail_on_s & (c > trail_stop_s)
    else:
        trail_exit_l = pd.Series(False, index=c.index)
        trail_exit_s = pd.Series(False, index=c.index)

    side = str(p["side"]).lower()
    if side == "short":
        entry = enter_short
        exit_rule = (exit_short_price & exit_short_obv) | trail_exit_s
        meta_side = "short"
    elif side == "long":
        entry = enter_long
        exit_rule = (exit_long_price & exit_long_obv) | trail_exit_l
        meta_side = "long"
    else:
        # default: both → välj long (aktier)
        entry = enter_long
        exit_rule = (exit_long_price & exit_long_obv) | trail_exit_l
        meta_side = "long"

    meta = dict(
        sl_pct=p["sl_pct"] if p["sl_pct"] is not None else float(p["stop_pct"]),
        tp_pct=p["tp_pct"], max_bars=int(p["max_bars"]), side=meta_side
    )
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="hancock_obv_osc_more",
    name="Hancock Filtered OBV OSC (kanaler+ALMA+trail)",
    direction="both",
    defaults=DEFAULTS,
    description="OBV med volymfilter → oscillator (valbar MA inkl. ALMA); pris/OBV-kanaler; approx trailing-stop.",
    generate=_generate
)
