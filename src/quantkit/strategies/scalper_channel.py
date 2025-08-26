from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

DEFAULTS = dict(length=20, factor=15, sl_pct=1.0, tp_pct=1.0, max_bars=10)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    sc = icompute("scalper_channel", df, length=p["length"], factor=p["factor"])
    hi_prev = sc["hi"].shift(1)
    lo_prev = sc["lo"].shift(1)

    low = df["low"]; close = df["close"]

    # LazyBear-script tar counter-trend: long när low sticker under N-lägsta, short när high bryter N-högsta.
    entry = (low < lo_prev)
    # Exit: när priset återtar över scalper_line (eller tp/sl/max_bars)
    exit_rule = (close > sc["scalper_line"])

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side="long")
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="scalper",
    name="Scalper's Channel (LB) – long",
    direction="long",
    defaults=DEFAULTS,
    description="Kontra: köp när Low understicker N-lägsta; exit när close återtar över scalper-linjen. Symmetrisk TP/SL (default 1%).",
    generate=_generate
)
