from __future__ import annotations
import pandas as pd
from quantkit.indicators import rsi, sma
from .base import StrategySpec

DEFAULTS = dict(sl_pct=10.0, tp_pct=None, max_bars=15, length=250, rsi_buy=20.0, exit_rsi=75.0)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = df["close"]; rsi2 = rsi(c, 2)
    entry = (c > sma(c, p["length"])) & (rsi2 < p["rsi_buy"])
    exit_rule = (rsi2 >= p["exit_rsi"])
    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side="long")
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="obi",
    name="Obi-Wan Kenobi",
    direction="long",
    defaults=DEFAULTS,
    description="Pris > SMA(Length) och RSI2 < RSIBuyLevel. Exit: RSI2>=75; stop 10%, tidsstopp 15 bars.",
    generate=_generate
)
