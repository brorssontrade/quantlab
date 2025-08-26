from __future__ import annotations
import pandas as pd
from .base import StrategySpec

DEFAULTS = dict(
    length=20, mult=2.0, ema_len=20, atr_len=10, atr_mult=1.5,
    side="long", sl_pct=10.0, tp_pct=None, max_bars=15
)

def _sma(s: pd.Series, n: int) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").rolling(int(n), min_periods=int(n)).mean()

def _ema(s: pd.Series, n: int) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").ewm(span=int(n), adjust=False).mean()

def _atr(df: pd.DataFrame, n: int) -> pd.Series:
    h = pd.to_numeric(df["high"], errors="coerce")
    l = pd.to_numeric(df["low"], errors="coerce")
    c = pd.to_numeric(df["close"], errors="coerce")
    tr = pd.concat([(h-l),(h-c.shift()).abs(),(l-c.shift()).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1/int(n), adjust=False).mean()

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = pd.to_numeric(df["close"], errors="coerce")

    # Bollinger på CLOSE
    basis = _sma(c, p["length"])
    dev   = (c - basis).rolling(int(p["length"]), min_periods=int(p["length"])).std()
    bb_u, bb_l = basis + p["mult"]*dev, basis - p["mult"]*dev

    # Keltner (EMA + ATR)
    mid = _ema(c, p["ema_len"])
    atr = _atr(df, p["atr_len"])
    kc_u, kc_l = mid + p["atr_mult"]*atr, mid - p["atr_mult"]*atr

    # Squeeze "på" = BB innanför KC; release = BB börjar lämna KC
    sq_on  = (bb_u < kc_u) & (bb_l > kc_l)
    sq_rel = (bb_u > kc_u) & (bb_l < kc_l)

    # Enkelt trendfilter via ema
    trend_up   = c > mid
    trend_down = c < mid

    side = str(p["side"]).lower()
    if side == "short":
        # kort: vänta squeeze_on → release, och bekräfta med trend_down
        entry = sq_on.shift(1, fill_value=False) & sq_rel & trend_down
        exit_rule = trend_up | (~sq_on & ~sq_rel & (c > basis))
        meta_side = "short"
    else:
        entry = sq_on.shift(1, fill_value=False) & sq_rel & trend_up
        exit_rule = trend_down | (~sq_on & ~sq_rel & (c < basis))
        meta_side = "long"

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=meta_side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="bbkc_squeeze",
    name="BB/KC Squeeze Release",
    direction="both",
    defaults=DEFAULTS,
    description="Köp/sälj när Bollinger lämnar Keltner efter squeeze; enkelt EMA-trendfilter.",
    generate=_generate
)
