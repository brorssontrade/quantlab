from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

DEFAULTS = dict(length=20, filterp=10, side="long", sl_pct=None, tp_pct=None, max_bars=None)

def _flip_up(bw: pd.Series) -> pd.Series:
    return (bw > 0) & (bw.shift(1) <= 0)
def _flip_dn(bw: pd.Series) -> pd.Series:
    return (bw < 0) & (bw.shift(1) >= 0)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    ama = icompute("ama_wave", df, length=p["length"], filterp=p["filterp"])
    bw = pd.to_numeric(ama["bw"], errors="coerce")

    long_entry  = _flip_up(bw)
    long_exit   = _flip_dn(bw) | (bw == 0)
    short_entry = _flip_dn(bw)
    short_exit  = _flip_up(bw) | (bw == 0)

    side = str(p.get("side","long")).lower()
    entry, exit_rule = (long_entry, long_exit) if side=="long" else (short_entry, short_exit)
    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="ama_wave",
    name="Kaufman AMA Binary Wave",
    direction="long",
    defaults=DEFAULTS,
    description="Brytningar i binär våg: >0 = long, <0 = short. Enkel trend/flip strategi.",
    generate=_generate
)
