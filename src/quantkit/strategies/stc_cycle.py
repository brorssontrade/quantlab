from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

DEFAULTS = dict(length=10, fastLength=23, slowLength=50, factor=0.5, trigger=50.0,
                side="long", sl_pct=None, tp_pct=None, max_bars=None)

def _cross_up(a: pd.Series, b: float) -> pd.Series:
    return (a > b) & (a.shift(1) <= b)
def _cross_dn(a: pd.Series, b: float) -> pd.Series:
    return (a < b) & (a.shift(1) >= b)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    stc = icompute("stc", df, length=p["length"], fastLength=p["fastLength"], slowLength=p["slowLength"], factor=p["factor"])["stc"]
    ema_fast = df["close"].ewm(span=int(p["fastLength"]), adjust=False).mean()
    ema_slow = df["close"].ewm(span=int(p["slowLength"]), adjust=False).mean()
    trend_ok = ema_fast > ema_slow

    long_entry  = _cross_up(stc, float(p["trigger"])) & trend_ok
    long_exit   = _cross_dn(stc, float(p["trigger"]))

    short_entry = _cross_dn(stc, float(p["trigger"])) & (~trend_ok)
    short_exit  = _cross_up(stc, float(p["trigger"]))

    side = str(p.get("side","long")).lower()
    entry, exit_rule = (long_entry, long_exit) if side=="long" else (short_entry, short_exit)

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="stc_cycle",
    name="Schaff Trend Cycle – trigger",
    direction="long",
    defaults=DEFAULTS,
    description="STC korsning runt trigger (50 default) + trend via EMA(fast)>EMA(slow). Side=short stöds.",
    generate=_generate
)
