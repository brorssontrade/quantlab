from __future__ import annotations
import numpy as np
import pandas as pd
from .base import StrategySpec

DEFAULTS = dict(length=16, w=-4.6, ema_len=50, side="long", sl_pct=12.0, tp_pct=None, max_bars=20)

def _frama(df: pd.DataFrame, length: int, w: float) -> pd.Series:
    h = pd.to_numeric(df["high"], errors="coerce")
    l = pd.to_numeric(df["low"],  errors="coerce")
    src = (h + l) / 2.0
    n3 = (h.rolling(length).max() - l.rolling(length).min()) / length
    hd2 = h.rolling(length//2).max()
    ld2 = l.rolling(length//2).min()
    n2 = (hd2 - ld2) / (length/2)
    n1 = (hd2.shift(length//2) - ld2.shift(length//2)) / (length/2)
    dimen = np.where((n1>0)&(n2>0)&(n3>0), (np.log(n1+n2) - np.log(n3)) / np.log(2), 0.0)
    alpha = np.exp(w*(dimen-1))
    sc = np.clip(alpha, 0.01, 1.0)
    frama = pd.Series(index=src.index, dtype=float)
    prev = np.nan
    for i, (px, a) in enumerate(zip(src, sc)):
        prev = (px if np.isnan(prev) else (px*a + prev*(1-a)))
        frama.iat[i] = prev
    return frama

def _ema(s: pd.Series, n: int) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").ewm(span=int(n), adjust=False).mean()

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    fr = _frama(df, int(p["length"]), float(p["w"]))
    trend = _ema(pd.to_numeric(df["close"], errors="coerce"), p["ema_len"])

    cross_up   = (fr > trend) & (fr.shift(1) <= trend.shift(1))
    cross_down = (fr < trend) & (fr.shift(1) >= trend.shift(1))

    side = str(p["side"]).lower()
    if side == "short":
        entry, exit_rule, meta_side = cross_down, cross_up, "short"
    else:
        entry, exit_rule, meta_side = cross_up, cross_down, "long"

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=meta_side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="frama_cross",
    name="FRAMA vs EMA Cross",
    direction="both",
    defaults=DEFAULTS,
    description="Adaptiv FRAMA korsar EMA → trendbyte (long/short).",
    generate=_generate
)
