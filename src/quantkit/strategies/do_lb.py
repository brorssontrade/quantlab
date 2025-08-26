from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

DEFAULTS = dict(length=14, ema1=5, ema2=3, p=9, sl_pct=8.0, tp_pct=None, max_bars=30)

def _cross_over(a: pd.Series, b) -> pd.Series:
    b = a*0 + float(b)
    return (a > b) & (a.shift(1) <= b.shift(1))

def _cross_under(a: pd.Series, b) -> pd.Series:
    b = a*0 + float(b)
    return (a < b) & (a.shift(1) >= b.shift(1))

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    do = icompute("do_lb", df, length=p["length"], ema1=p["ema1"], ema2=p["ema2"], p=p["p"])["do"]
    entry = _cross_over(do, 0.0)
    exit_rule = _cross_under(do, 0.0)
    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side="long")
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="do_lb",
    name="Derivative Oscillator – zero cross",
    direction="long",
    defaults=DEFAULTS,
    description="Köp när DO korsar upp genom 0, sälj när DO korsar ned genom 0. (C. Brown / LazyBear).",
    generate=_generate
)
