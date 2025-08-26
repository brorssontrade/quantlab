from __future__ import annotations
import pandas as pd
from quantkit.indicators.registry import compute as icomp
from .base import StrategySpec

DEFAULTS = dict(
    chan_len=10, avg_len=21, os=-60.0, ob=60.0,
    side="long", sl_pct=10.0, tp_pct=None, max_bars=15
)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    wt = icomp("wavetrend", df, chan_len=p["chan_len"], avg_len=p["avg_len"], ob_level=p["ob"], os_level=p["os"])
    wt1, wt2 = wt["wt1"], wt["wt2"]

    cross_up   = (wt1 > wt2) & (wt1.shift(1) <= wt2.shift(1))
    cross_down = (wt1 < wt2) & (wt1.shift(1) >= wt2.shift(1))

    if str(p["side"]).lower() == "short":
        entry = cross_down & (wt1 > p["ob"])
        exit_rule = cross_up
        side = "short"
    else:
        entry = cross_up & (wt1 < p["os"])
        exit_rule = cross_down
        side = "long"

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="wavetrend_cross",
    name="WaveTrend Cross (OS/OB)",
    direction="both",
    defaults=DEFAULTS,
    description="WT1/WT2 korsningar från översålt/överköpt. Fungerar long/short.",
    generate=_generate
)
