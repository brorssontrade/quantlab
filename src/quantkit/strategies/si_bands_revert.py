from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

DEFAULTS = dict(length=14, mult=2.0, mode="mfi", side="long", sl_pct=None, tp_pct=None, max_bars=20)

def _xo(a: pd.Series, b: pd.Series|float) -> pd.Series:
    b = (a*0 + b) if not isinstance(b, pd.Series) else b
    return (a > b) & (a.shift(1) <= b.shift(1))
def _xu(a: pd.Series, b: pd.Series|float) -> pd.Series:
    b = (a*0 + b) if not isinstance(b, pd.Series) else b
    return (a < b) & (a.shift(1) >= b.shift(1))

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    ib = icompute("si_bands", df, length=p["length"], mult=p["mult"], mode=p["mode"])
    s, u, l, m = ib["index_val"], ib["bb_upper"], ib["bb_lower"], ib["bb_basis"]

    long_entry  = _xo(s, l)
    long_exit   = _xu(s, m) | (s > u)

    short_entry = _xu(s, u)
    short_exit  = _xo(s, m) | (s < l)

    side = str(p.get("side", "long")).lower()
    entry, exit_rule = (long_entry, long_exit) if side == "long" else (short_entry, short_exit)
    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="si_bands_revert",
    name="RSI/MFI + BB (mean-revert)",
    direction="long",
    defaults=DEFAULTS,
    description="Entré när RSI/MFI korsar upp (ned) genom nedre(övre) bandet; exit vid basis-korsning eller motband.",
    generate=_generate
)
