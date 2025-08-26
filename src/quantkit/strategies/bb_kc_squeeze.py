from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

DEFAULTS = dict(length=20, mult=2.0, use_true_range=True, sl_pct=5.0, tp_pct=10.0, max_bars=20)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    kk = icompute("bb_kc", df, length=p["length"], mult=p["mult"], use_true_range=p["use_true_range"])

    inside_prev = kk["bb_inside_kc"].shift(1) == 1
    release_up  = (inside_prev) & ( (df["high"] > kk["kc_upper"]) & (kk["bb_upper"] > kk["kc_upper"]) )
    # Exit om momentum viker ned under KC-mitt (konservativt)
    exit_rule = (df["close"] < kk["kc_mid"])

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side="long")
    return {"entry": release_up.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="bb_kc_squeeze",
    name="BB/KC Squeeze (LB) – long",
    direction="long",
    defaults=DEFAULTS,
    description="Handla bara när 'squeeze' släpper: BB var inne i KC och pris bryter upp över KC-övre. Exit under KC-mitt eller TP/SL.",
    generate=_generate
)
