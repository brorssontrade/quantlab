from __future__ import annotations
import numpy as np, pandas as pd
from .base import StrategySpec

DEFAULTS = dict(
    use_ema=False,
    lens=(8,13,41,200,243,300,500,700),
    fast_n=3, slow_n=3,
    rvol_len=20, rvol_min=1.2,
    max_bars=20,
)

def _ma(s, n, ema):
    return s.ewm(span=n, adjust=False).mean() if ema else s.rolling(n, min_periods=n).mean()

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = pd.to_numeric(df["close"], errors="coerce")
    v = pd.to_numeric(df["volume"], errors="coerce").fillna(0.0)

    mas = [_ma(c, int(n), bool(p["use_ema"])).rename(f"ma{n}") for n in p["lens"]]
    fast = pd.concat(mas[:p["fast_n"]], axis=1).mean(axis=1)
    slow = pd.concat(mas[-p["slow_n"]:], axis=1).mean(axis=1)
    rvol = v / (v.rolling(p["rvol_len"]).mean() + 1e-12)

    cross_up   = (fast.shift(1) <= slow.shift(1)) & (fast > slow)
    cross_down = (fast.shift(1) >= slow.shift(1)) & (fast < slow)

    entry = cross_up & (rvol >= p["rvol_min"])
    exit_rule = cross_down | (rvol < 0.7)

    meta = dict(side="long", max_bars=p["max_bars"], rvol_min=p["rvol_min"], lens=p["lens"], use_ema=p["use_ema"])
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="eight_ma_cluster",
    name="8xMA Cluster (fast vs slow) + RVOL",
    direction="long",
    defaults=DEFAULTS,
    description="Snabba MA-kluster korsar långsamma; kräver relativ volym.",
    generate=_generate,
)
