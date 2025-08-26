from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

DEFAULTS = dict(length=10, slow=30, side="long", sl_pct=None, tp_pct=None, max_bars=None)

def _xo(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a > b) & (a.shift(1) <= b.shift(1))
def _xu(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a < b) & (a.shift(1) >= b.shift(1))

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    z = icompute("zlema", df, length=p["length"], slow=p["slow"])
    zle, slow = z["zlema"], z["ema_slow"]

    long_entry  = _xo(zle, slow)
    long_exit   = _xu(zle, slow)
    short_entry = _xu(zle, slow)
    short_exit  = _xo(zle, slow)

    side = str(p.get("side","long")).lower()
    entry, exit_rule = (long_entry, long_exit) if side=="long" else (short_entry, short_exit)
    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="zlema_cross",
    name="Zero-lag EMA crossover",
    direction="long",
    defaults=DEFAULTS,
    description="ZLEMA (snabb) mot lång EMA. Klassisk korsningsstrategi.",
    generate=_generate
)
