from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.stc import compute as stc_compute

DEFAULTS = dict(sma_len=200, rvol_len=20, rvol_min=1.1, stc_len=10, fast=23, slow=50, enter=25.0, exit=75.0, max_bars=30)

def _rvol(v, n): v=pd.to_numeric(v, errors="coerce").fillna(0.0); return v/(v.rolling(n).mean()+1e-12)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = pd.to_numeric(df["close"], errors="coerce")
    sma200 = c.rolling(p["sma_len"]).mean()
    rvol = _rvol(df["volume"], p["rvol_len"])
    stc = stc_compute(df, length=p["stc_len"], fast=p["fast"], slow=p["slow"])["stc"]

    entry = (c > sma200) & (rvol >= p["rvol_min"]) & (stc.shift(1) <= p["enter"]) & (stc > p["enter"])
    exit_rule = (stc < p["exit"]) | (c < sma200)

    meta = dict(side="long", max_bars=p["max_bars"])
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="swe_stc_trend",
    name="SWE – STC Trend",
    direction="long",
    defaults=DEFAULTS,
    description="SMA200-filter, RVOL-filter; inträde när STC bryter upp över nivå (25), exit < 75 eller under SMA200.",
    generate=_generate,
)
