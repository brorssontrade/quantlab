from __future__ import annotations
import pandas as pd
from quantkit.indicators import rsi, sma
from quantkit.indicators.registry import compute
from .base import StrategySpec

DEFAULTS = dict(sl_pct=15.0, tp_pct=None, max_bars=14, lowclose=14, pctchangeday=4, exit_rsi=65.0)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = df["close"]
    pc1 = compute("percent_change", df[["close"]].rename(columns={"close":"Close"}), periods=1) if "percent_change" in () else c.pct_change()
    # Lowest helpers
    lc = c.rolling(p["lowclose"], min_periods=p["lowclose"]).min()
    pc_low = pc1.rolling(p["pctchangeday"], min_periods=p["pctchangeday"]).min()
    entry = (c == lc) & (pc1 == pc_low) & (c > sma(c, 200))
    rsi2 = rsi(c, 2)
    exit_rule = (rsi2 > p["exit_rsi"])
    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side="long")
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="darth",
    name="Darth Vader",
    direction="long",
    defaults=DEFAULTS,
    description="Entry: close på lägsta (L=14) OCH 1-dag pctchange på lägsta (P=4) OCH pris > SMA200. Exit: RSI2>65; stop 15%, tidsstopp 14 bars.",
    generate=_generate
)
