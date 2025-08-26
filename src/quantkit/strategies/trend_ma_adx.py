from __future__ import annotations
import pandas as pd
from quantkit.indicators import adx as _adx_ind  # om du exponerar kortnamn
from .base import StrategySpec

DEFAULTS = dict(
    fast=20, slow=50, adx_len=14, adx_min=20.0,
    sl_atr_mult=2.0, atr_len=14,
    side="long", tp_pct=None, max_bars=None
)

def _ema(s: pd.Series, n: int) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").ewm(span=int(n), adjust=False).mean()

def _atr(df: pd.DataFrame, n: int) -> pd.Series:
    h = pd.to_numeric(df["high"], errors="coerce")
    l = pd.to_numeric(df["low"],  errors="coerce")
    c = pd.to_numeric(df["close"], errors="coerce")
    tr = pd.concat([(h-l), (h-c.shift()).abs(), (l-c.shift()).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1/int(n), adjust=False).mean()

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = df["close"]
    ema_f = _ema(c, p["fast"])
    ema_s = _ema(c, p["slow"])
    adx = _adx_ind(df["high"], df["low"], df["close"], p["adx_len"])

    long_cross = (ema_f > ema_s) & (ema_f.shift(1) <= ema_s.shift(1))
    entry = long_cross & (adx > p["adx_min"])
    # exit: motsatt kors +/eller trendtapp
    exit_rule = ((ema_f < ema_s) & (ema_f.shift(1) >= ema_s.shift(1))) | (adx < p["adx_min"] - 5)

    meta = dict(
        sl_pct=None,  # vi proxar ATR i motorn via max_bars/tp eller externa stops senare
        tp_pct=p["tp_pct"],
        max_bars=p["max_bars"],
        side=p["side"],
        note="Rekommenderad risk: använd ATR-baserat stopp i motor (ex: 2x ATR)."
    )
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="trend_ma_adx",
    name="EMA20/50 + ADX",
    direction="long",
    defaults=DEFAULTS,
    description="Klassisk svensk aktie-trendföljare: EMA20/50-korsning filtrerad av ADX>20.",
    generate=_generate
)
