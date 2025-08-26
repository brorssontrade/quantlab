from __future__ import annotations
import pandas as pd
from .base import StrategySpec

DEFAULTS = dict(length=20, max_bars=10, side="long")

def _cross_over(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a.shift(1) <= b.shift(1)) & (a > b)

def _cross_under(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a.shift(1) >= b.shift(1)) & (a < b)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    length = int(p["length"])
    hi = pd.to_numeric(df["high"], errors="coerce").rolling(length, min_periods=length).max()
    lo = pd.to_numeric(df["low"],  errors="coerce").rolling(length, min_periods=length).min()
    h = pd.to_numeric(df["high"], errors="coerce")
    l = pd.to_numeric(df["low"],  errors="coerce")

    long_entry  = _cross_over(l, lo)     # low korsar upp genom rullande lägsta
    short_entry = _cross_under(h, hi)    # high korsar ner genom rullande högsta

    side = str(p.get("side", "long")).lower()
    entry = short_entry if side == "short" else long_entry
    exit_rule = entry.shift(1).fillna(False)  # enkel exit

    meta = dict(side=side, sl_pct=None, tp_pct=None, max_bars=p["max_bars"], length=length)
    return {"entry": entry.fillna(False), "exit": exit_rule, "meta": meta}

STRATEGY = StrategySpec(
    id="scalper",
    name="Scalper Channel (LB) – side-aware",
    direction="long",
    defaults=DEFAULTS,
    description="Korsar rullande högsta/lägsta. Param side=long/short.",
    generate=_generate,
)
