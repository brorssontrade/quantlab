from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

DEFAULTS = dict(use_ema=False,
                lengths=(8,13,41,200,243,300,500,700),
                side="long", sl_pct=None, tp_pct=None, max_bars=None)

def _xo(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a > b) & (a.shift(1) <= b.shift(1))
def _xu(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a < b) & (a.shift(1) >= b.shift(1))

def _generate(df: pd.DataFrame, params: dict):
    p = {**(DEFAULTS), **(params or {})}
    ma = icompute("ma8x", df, use_ema=p["use_ema"], lengths=p["lengths"])

    fast_mean = pd.concat([ma["ma1"], ma["ma2"], ma["ma3"]], axis=1).mean(axis=1)
    slow_mean = pd.concat([ma["ma4"], ma["ma5"], ma["ma6"], ma["ma7"], ma["ma8"]], axis=1).mean(axis=1)

    long_entry  = _xo(fast_mean, slow_mean)
    long_exit   = _xu(fast_mean, slow_mean)
    short_entry = _xu(fast_mean, slow_mean)
    short_exit  = _xo(fast_mean, slow_mean)

    side = str(p.get("side","long")).lower()
    entry, exit_rule = (long_entry, long_exit) if side=="long" else (short_entry, short_exit)
    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="ma8x_cross",
    name="8x MA crossover (fast-pack vs slow-pack)",
    direction="long",
    defaults=DEFAULTS,
    description="Snittet av MA1-3 korsar MA4-8 (EMA/SMA). Enkel trendföljare.",
    generate=_generate
)
