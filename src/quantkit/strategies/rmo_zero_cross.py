from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

DEFAULTS = dict(th_up=0.0, th_dn=0.0, side="long", sl_pct=None, tp_pct=None, max_bars=None)

def _xo(a: pd.Series, b: float) -> pd.Series:
    b = a*0 + float(b)
    return (a > b) & (a.shift(1) <= b.shift(1))
def _xu(a: pd.Series, b: float) -> pd.Series:
    b = a*0 + float(b)
    return (a < b) & (a.shift(1) >= b.shift(1))

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    r = icompute("rmo", df)
    R = r["rmo"]

    long_entry  = _xo(R, p["th_up"])
    long_exit   = _xu(R, p["th_dn"])
    short_entry = _xu(R, p["th_dn"])
    short_exit  = _xo(R, p["th_up"])

    side = str(p.get("side","long")).lower()
    entry, exit_rule = (long_entry, long_exit) if side=="long" else (short_entry, short_exit)
    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="rmo_zero",
    name="RMO zero-cross",
    direction="long",
    defaults=DEFAULTS,
    description="Köp när RMO korsar upp över tröskel (default 0), sälj när den korsar ned.",
    generate=_generate
)
