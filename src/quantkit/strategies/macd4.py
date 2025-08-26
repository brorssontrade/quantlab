from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

DEFAULTS = dict(mult_b=4.3, mult_y=1.4, sl_pct=8.0, tp_pct=None, max_bars=30)

def _cross_up(s: pd.Series) -> pd.Series:
    return (s > 0) & (s.shift(1) <= 0)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    m4 = icompute("macd4", df, mult_b=p["mult_b"], mult_y=p["mult_y"])

    green = m4["MACDGreen"]
    red   = m4["MACDRed"]

    # Enkel regel: köp när gröna histogrammet korsar upp genom 0 medan rött är < 0 (tidig bull-impuls).
    entry = _cross_up(green) & (red < 0)

    # Exit när gröna faller under 0 eller rött blir > 0 (momentum tappar).
    exit_rule = (green < 0) | (red > 0)

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side="long")
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="macd4",
    name="4MACD (LB) – long",
    direction="long",
    defaults=DEFAULTS,
    description="Grönt histogram korsar upp >0 medan rött <0 → entry. Exit när grönt<0 eller rött>0. TP valfri, SL 8% default.",
    generate=_generate
)
