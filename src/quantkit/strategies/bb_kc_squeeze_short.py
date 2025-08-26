from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

DEFAULTS = dict(length=20, mult=2.0, use_true_range=True, sl_pct=5.0, tp_pct=10.0, max_bars=20)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    kk = icompute("bb_kc", df, length=p["length"], mult=p["mult"], use_true_range=p["use_true_range"])
    inside_prev = kk["bb_inside_kc"].shift(1) == 1
    release_dn  = inside_prev & ((df["low"] < kk["kc_lower"]) & (kk["bb_lower"] < kk["kc_lower"]))
    exit_rule   = (df["close"] > kk["kc_mid"])   # täck när åter över KC-mitt
    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side="short")
    return {"entry": release_dn.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="bb_kc_squeeze_short",
    name="BB/KC Squeeze – short",
    direction="short",
    defaults=DEFAULTS,
    description="Short vid 'squeeze release' nedåt: BB var inne i KC, pris bryter under KC-lower. Exit över KC-mitt/TP/SL.",
    generate=_generate
)
