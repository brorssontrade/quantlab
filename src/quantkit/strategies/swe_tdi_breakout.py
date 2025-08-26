from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.tdi import compute as tdi_compute

DEFAULTS = dict(sma_len=200, rvol_len=20, rvol_min=1.15, max_bars=25)

def _rvol(v, n): v=pd.to_numeric(v, errors="coerce").fillna(0.0); return v/(v.rolling(n).mean()+1e-12)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = pd.to_numeric(df["close"], errors="coerce")
    sma200 = c.rolling(p["sma_len"]).mean()
    rvol = _rvol(df["volume"], p["rvol_len"])
    t = tdi_compute(df)
    green, red, orange = t["green"], t["red"], t["orange"]

    # Long: Green korsar upp över red och båda över orange (overall trend)
    cross_up = (green.shift(1) <= red.shift(1)) & (green > red)
    entry = (c > sma200) & (rvol >= p["rvol_min"]) & cross_up & (green > orange) & (red > orange)
    exit_rule = (green < red) | (c < sma200)

    meta = dict(side="long", max_bars=p["max_bars"])
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="swe_tdi_breakout",
    name="SWE – TDI Breakout",
    direction="long",
    defaults=DEFAULTS,
    description="TDI green>red med båda över orange + SMA200 + RVOL.",
    generate=_generate,
)
