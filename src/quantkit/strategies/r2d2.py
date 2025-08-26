from __future__ import annotations
import pandas as pd
from quantkit.indicators import sma
from .base import StrategySpec

DEFAULTS = dict(sl_pct=10.0, tp_pct=None, max_bars=15, exit_period=8)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = df["close"]
    upstreak = (c > c.shift(1)) & (c.shift(1) > c.shift(2))
    pc1 = c.pct_change()
    entry = (c < sma(c, 200)) & upstreak & (pc1 == pc1.rolling(2, min_periods=2).max())
    # exit-rule (kors över EMA/SMA exitperiod) – här enkel SMA
    exit_rule = (c.shift(1) < c.shift(1).rolling(p["exit_period"], min_periods=p["exit_period"]).mean())
    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side="short")
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="r2d2",
    name="R2-D2 (short)",
    direction="short",
    defaults=DEFAULTS,
    description="Short-signal: Pris < SMA200, tvådagars uppstreak, max 1-dags pctchange. Exit: kors ovan exit-SMA; stop 10%, tidsstopp 15 bars.",
    generate=_generate
)
