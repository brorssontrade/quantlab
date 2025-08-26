# src/quantkit/strategies/scalper.py
from __future__ import annotations
import math
import numpy as np
import pandas as pd
from .base import StrategySpec

DEFAULTS = dict(
    length=20,         # Donchian-fönster
    factor=15,         # ATR-fönster i "scalper_line"
    sl_pct=8.0,
    tp_pct=None,
    max_bars=10,
    side="long",       # "long" | "short"
)

def _atr(df: pd.DataFrame, n: int) -> pd.Series:
    h = pd.to_numeric(df["high"], errors="coerce")
    l = pd.to_numeric(df["low"],  errors="coerce")
    c = pd.to_numeric(df["close"], errors="coerce")
    tr = pd.concat([(h-l), (h-c.shift()).abs(), (l-c.shift()).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1/max(int(n),1), adjust=False).mean()

def _avg(s: pd.Series, n: int) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").rolling(max(int(n),1), min_periods=max(int(n),1)).mean()

def _donch(h: pd.Series, l: pd.Series, n: int):
    n = max(int(n),1)
    hi = h.rolling(n, min_periods=n).max()
    lo = l.rolling(n, min_periods=n).min()
    mid = (hi + lo) / 2.0
    return hi, lo, mid

def _cross_up(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a > b) & (a.shift(1) <= b.shift(1))

def _cross_down(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a < b) & (a.shift(1) >= b.shift(1))

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = pd.to_numeric(df["close"], errors="coerce")
    h = pd.to_numeric(df["high"],  errors="coerce")
    l = pd.to_numeric(df["low"],   errors="coerce")

    # LazyBear "scalper line"
    scalper_line = _avg(c, p["factor"]) - math.log(math.pi * _atr(df, p["factor"]))
    hi, lo, mid = _donch(h, l, p["length"])

    side = str(p.get("side", "long")).lower()

    # I Pine-exemplet var "short1=cross(high, highest(length))" och "long1=cross(low, lowest(length))".
    # Vi speglar logiken: entry vid **breakout** av kanalens kant (cross()) och exit mot scalper_line/andra kanten.
    if side == "short":
        entry = _cross_up(h, hi)        # nytt högsta => korta (kontra-scalpern)
        exit_rule = (c < scalper_line) | _cross_down(c, mid)  # ut vid svaghet (under scalper_line) / åter in
        meta_side = "short"
    else:
        entry = _cross_down(l, lo)      # nytt lägsta => long
        exit_rule = (c > scalper_line) | _cross_up(c, mid)    # ut vid styrka / åter in
        meta_side = "long"

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=meta_side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

# En gemensam "scalper" + två alias med fast side
STRATEGY = StrategySpec(
    id="scalper",
    name="Scalper's Channel",
    direction="both",
    defaults=DEFAULTS,
    description="Scalper-kanal (LazyBear): entry vid kanal-break (cross), exit mot scalper-line/åter-in.",
    generate=_generate
)

def _gen_side(df: pd.DataFrame, params: dict, side: str):
    p = {**DEFAULTS, **(params or {}), "side": side}
    return _generate(df, p)

SCALPER_LONG = StrategySpec(
    id="scalper_long",
    name="Scalper (Long)",
    direction="long",
    defaults={**DEFAULTS, "side":"long"},
    description="Scalper (long alias).",
    generate=lambda df, params=None: _gen_side(df, params or {}, "long")
)

SCALPER_SHORT = StrategySpec(
    id="scalper_short",
    name="Scalper (Short)",
    direction="short",
    defaults={**DEFAULTS, "side":"short"},
    description="Scalper (short alias).",
    generate=lambda df, params=None: _gen_side(df, params or {}, "short")
)
