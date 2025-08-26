from __future__ import annotations
import numpy as np
import pandas as pd
from .base import StrategySpec

DEFAULTS = dict(
    use_ema=False,
    # defaultlängder som i indikatorn
    ma1=8,  ma2=13, ma3=41, ma4=200, ma5=243, ma6=300, ma7=500, ma8=700,
    # vilka som räknas som ”snabba” resp ”långsamma” kluster
    fast_ids=(1,2,3), slow_ids=(4,5,6),
    rvol_len=50, rvol_min=1.2,   # RVOL-filter
    ma200_filter=True,           # endast long över SMA200 (om 200 ingår i slow-kluster spelar mindre roll)
    side="long", sl_pct=10.0, tp_pct=None, max_bars=20
)

def _ma(s: pd.Series, n: int, ema: bool) -> pd.Series:
    s = pd.to_numeric(s, errors="coerce")
    n = max(int(n), 1)
    return s.ewm(span=n, adjust=False).mean() if ema else s.rolling(n, min_periods=n).mean()

def _median(vals: list[pd.Series]) -> pd.Series:
    st = pd.concat(vals, axis=1)
    return st.median(axis=1)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = pd.to_numeric(df["close"],  errors="coerce")
    v = pd.to_numeric(df["volume"], errors="coerce").fillna(0.0)

    lens = [p["ma1"],p["ma2"],p["ma3"],p["ma4"],p["ma5"],p["ma6"],p["ma7"],p["ma8"]]
    mas = [ _ma(c, n, bool(p["use_ema"])) for n in lens ]

    # klustermedianer
    f_ids = [i-1 for i in p["fast_ids"]]  # 1-baserat in -> 0-baserat
    s_ids = [i-1 for i in p["slow_ids"]]
    fast_med = _median([mas[i] for i in f_ids])
    slow_med = _median([mas[i] for i in s_ids])

    # RVOL
    rvol = v / v.rolling(int(p["rvol_len"]), min_periods=int(p["rvol_len"])).mean()
    vol_ok = rvol >= float(p["rvol_min"])

    # 200-filter (använder ren SMA200 på close)
    sma200 = c.rolling(200, min_periods=200).mean()
    bull = c > sma200

    cross_up   = (fast_med > slow_med) & (fast_med.shift(1) <= slow_med.shift(1))
    cross_down = (fast_med < slow_med) & (fast_med.shift(1) >= slow_med.shift(1))

    side = str(p["side"]).lower()
    if side == "short":
        entry = cross_down & vol_ok
        exit_rule = cross_up
        meta_side = "short"
    else:
        entry = cross_up & vol_ok & (~p["ma200_filter"] | bull)
        exit_rule = cross_down | (~bull if p["ma200_filter"] else False)
        meta_side = "long"

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=meta_side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="eight_ma_cluster",
    name="8×MA Cluster (RVOL-filter)",
    direction="both",
    defaults=DEFAULTS,
    description="Korsning mellan snabba/långsamma MA-kluster + RVOL-filter. Valfri SMA200-trendspärr.",
    generate=_generate
)
