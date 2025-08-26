from __future__ import annotations
import pandas as pd
from quantkit.indicators.registry import compute as icomp
from .base import StrategySpec

DEFAULTS = dict(
    pull_len=5, exit_len=30,
    side="long", sl_pct=12.0, tp_pct=None, max_bars=20
)

SHORTS = (3,5,8,10,12,15)
LONGS  = (30,35,40,45,50,60)

def _median_short(df_gmma: pd.DataFrame) -> pd.Series:
    shorts = [df_gmma[f"s{n}"] for n in SHORTS if f"s{n}" in df_gmma]
    return pd.concat(shorts, axis=1).median(axis=1)

def _all_short_above_long(df_gmma: pd.DataFrame) -> pd.Series:
    smax = pd.concat([df_gmma[f"s{n}"] for n in SHORTS if f"s{n}" in df_gmma], axis=1).min(axis=1)
    lmin = pd.concat([df_gmma[f"l{n}"] for n in LONGS if f"l{n}" in df_gmma], axis=1).max(axis=1)
    return smax > lmin

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    g = icomp("gmma", df)
    c = df["close"]

    trend_up = _all_short_above_long(g)
    s_med = _median_short(g)

    # entry: rekyl ned under korta-median, sedan återtag (cross up)
    pull = (c < s_med.rolling(int(p["pull_len"]), min_periods=1).min())
    cross_up = (c > s_med) & (c.shift(1) <= s_med.shift(1))
    entry = trend_up & pull.shift(1, fill_value=False) & cross_up

    # exit: stängning under EMA ~30 (approx via l30 i GMMA) eller trendbrott
    exit_line = g["l30"] if "l30" in g else s_med.rolling(int(p["exit_len"]), min_periods=1).mean()
    exit_rule = (c < exit_line) | (~trend_up)

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side="long")
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="guppy_pullback",
    name="GMMA Pullback",
    direction="long",
    defaults=DEFAULTS,
    description="Alla korta GMMA över långa → köp rekyl och sälj vid trendbrott.",
    generate=_generate
)
