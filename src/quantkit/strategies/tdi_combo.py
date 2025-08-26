from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

# mode: scalp / active / moderate (enligt din beskrivning)
DEFAULTS = dict(mode="active", lengthrsi=13, lengthband=34, lengthrsipl=2, lengthtradesl=7,
                sl_pct=8.0, tp_pct=None, max_bars=30)

def _cross_over(a: pd.Series, b: pd.Series|float) -> pd.Series:
    b = (a*0 + b) if not isinstance(b, pd.Series) else b
    return (a > b) & (a.shift(1) <= b.shift(1))

def _cross_under(a: pd.Series, b: pd.Series|float) -> pd.Series:
    b = (a*0 + b) if not isinstance(b, pd.Series) else b
    return (a < b) & (a.shift(1) >= b.shift(1))

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    tdi = icompute("tdi", df, lengthrsi=p["lengthrsi"], lengthband=p["lengthband"],
                   lengthrsipl=p["lengthrsipl"], lengthtradesl=p["lengthtradesl"])
    g, r, up, dn, mid, orange = tdi["green"], tdi["red"], tdi["up"], tdi["dn"], tdi["mid"], tdi["orange"]

    m = str(p.get("mode","active")).lower()
    base_entry = _cross_over(g, r)

    if m == "scalp":
        entry = base_entry
    elif m == "moderate":
        entry = base_entry & (g > orange) & (g > 50)
    else:  # "active"
        entry = base_entry & (g > orange)

    # Exit: grönt korsar ned rött, eller faller tillbaka ned från band (konservativt)
    exit_rule = _cross_under(g, r) | _cross_under(g, mid)

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side="long", mode=m)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="tdi_combo",
    name="TDI Combo (scalp/active/moderate) – long",
    direction="long",
    defaults=DEFAULTS,
    description="TDI: scalp=grön korsar upp röd; active=även över orange; moderate=över röd+orange+50. Exit: grön korsar ned röd/mitten.",
    generate=_generate
)
