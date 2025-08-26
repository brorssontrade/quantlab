from __future__ import annotations
import numpy as np, pandas as pd
from .base import StrategySpec

DEFAULTS = dict(
    use_vol_filter=True, vol_len=50, vol_mult=2.5,
    use_osc=True, osc_len=50, osc_type="WMA",     # SMA/EMA/WMA/HMA/VWMA/RMA/ALMA
    ch_len=125, ch_fast_pct=35,
    side="long", max_bars=20,
)

def _ma(x, n, kind):
    kind = str(kind).upper()
    if kind=="SMA":  return x.rolling(n, min_periods=n).mean()
    if kind=="EMA":  return x.ewm(span=n, adjust=False).mean()
    if kind=="WMA":  return x.rolling(n, min_periods=n).apply(lambda s: np.average(s, weights=np.arange(1,len(s)+1)), raw=True)
    if kind=="HMA":
        w = 2*x.rolling(int(np.sqrt(n)), min_periods=int(np.sqrt(n))).mean() - x.rolling(n, min_periods=n).mean()
        return w.rolling(int(np.sqrt(n)), min_periods=int(np.sqrt(n))).mean()
    if kind=="VWMA": # enkel fallback
        return (x * 1.0).rolling(n, min_periods=n).mean()
    if kind=="RMA":  return x.ewm(alpha=1.0/n, adjust=False).mean()
    if kind=="ALMA":
        m, s = 0.85, 10.0
        w = np.exp(-((np.arange(n)-m*(n-1))**2)/(2*(s**2)))
        return x.rolling(n, min_periods=n).apply(lambda s: np.dot(s,w)/w.sum(), raw=True)
    return x.rolling(n, min_periods=n).mean()

def _obv(close, vol):
    ch = close.diff()
    step = np.where(ch>0, vol, np.where(ch<0, -vol, 0.0))
    return pd.Series(step, index=close.index).cumsum()

def _donchian(x, n):
    top = x.rolling(n, min_periods=n).max()
    bot = x.rolling(n, min_periods=n).min()
    return top, (top+bot)/2.0, bot

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = pd.to_numeric(df["close"], errors="coerce")
    v = pd.to_numeric(df["volume"], errors="coerce").fillna(0.0)

    if p["use_vol_filter"]:
        thr = (v.rolling(p["vol_len"]).mean() - v.rolling(p["vol_len"]).std()*p["vol_mult"]).abs()
        v_eff = pd.Series(np.where(v < thr, 0.0, v), index=v.index)
    else:
        v_eff = v

    obv = _obv(c, v_eff)
    sig = _ma(obv, p["osc_len"], p["osc_type"]) if p["use_osc"] else pd.Series(0.0, index=obv.index)
    osc = obv - sig

    st,_,sb = _donchian(c, p["ch_len"])
    ft,_,fb = _donchian(c, max(2, int(p["ch_len"]*p["ch_fast_pct"]/100)))
    sot,_,sob = _donchian(osc, p["ch_len"])
    fot,_,fob = _donchian(osc, max(2, int(p["ch_len"]*p["ch_fast_pct"]/100)))

    enter_long  = (c > st.shift(1)) & (osc > sot.shift(1)) & (osc > 0 if p["use_osc"] else True)
    exit_long   = (c < fb.shift(1)) | (osc < fob.shift(1))

    enter_short = (c < sb.shift(1)) & (osc < sob.shift(1)) & (osc < 0 if p["use_osc"] else True)
    exit_short  = (c > ft.shift(1)) | (osc > fot.shift(1))

    side = str(p.get("side","long")).lower()
    entry = enter_short if side=="short" else enter_long
    exit_rule = exit_short if side=="short" else exit_long

    meta = dict(side=side, sl_pct=None, tp_pct=None, max_bars=p["max_bars"])
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="hancock_obv_osc",
    name="Hancock Filtered OBV OSC (port nära Pine)",
    direction="long",
    defaults=DEFAULTS,
    description="OBV + volymfilter + Donchian på pris & OBV; oscillator med valbar MA (SMA/EMA/WMA/HMA/VWMA/RMA/ALMA).",
    generate=_generate,
)
