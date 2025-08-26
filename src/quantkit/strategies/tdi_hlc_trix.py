from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

DEFAULTS = dict(
    # TDI
    lengthrsi=13, lengthband=34, lengthrsipl=2, lengthtradesl=7,
    # HLC
    hlc_len=20,
    # Trix
    trix_lengths=(4,6,9,12),
    # Trade
    side="long", sl_pct=8.0, tp_pct=None, max_bars=30
)

def _cross_over(a: pd.Series, b: pd.Series|float) -> pd.Series:
    b = (a*0 + b) if not isinstance(b, pd.Series) else b
    return (a > b) & (a.shift(1) <= b.shift(1))

def _cross_under(a: pd.Series, b: pd.Series|float) -> pd.Series:
    b = (a*0 + b) if not isinstance(b, pd.Series) else b
    return (a < b) & (a.shift(1) >= b.shift(1))

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}

    tdi = icompute("tdi", df,
        lengthrsi=p["lengthrsi"], lengthband=p["lengthband"],
        lengthrsipl=p["lengthrsipl"], lengthtradesl=p["lengthtradesl"]
    )
    g, r, orange = tdi["green"], tdi["red"], tdi["orange"]

    hlc = icompute("hlctrends", df, length=p["hlc_len"])
    trend_up = hlc["trend_up"]

    trix = icompute("trixrb", df, lengths=p["trix_lengths"])
    mom_pos = (trix["trix_mean"] > 0)

    # Long
    long_entry = _cross_over(g, r) & (g > orange) & trend_up & mom_pos
    long_exit  = _cross_under(g, r) | (~mom_pos)

    # Short (spegel)
    short_entry = _cross_under(g, r) & (g < orange) & (~trend_up) & (~mom_pos)
    short_exit  = _cross_over(g, r) | mom_pos

    side = str(p.get("side","long")).lower()
    if side == "short":
        entry, exit_rule = short_entry, short_exit
    else:
        entry, exit_rule = long_entry, long_exit

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="tdi_hlc_trix",
    name="TDI + HLCTrends + Trix Ribbon",
    direction="long",  # meta['side'] kan sättas till 'short' vid körning
    defaults=DEFAULTS,
    description=("Kombostrategi: TDI (grön>röd & över orange), HLC-trend upp, Trix-momentum > 0 (long). "
                 "Motsatt logik för short om side='short'."),
    generate=_generate
)
