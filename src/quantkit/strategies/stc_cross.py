from __future__ import annotations
import pandas as pd
from .base import StrategySpec

DEFAULTS = dict(length=10, fast=23, slow=50, enter_level=25.0, exit_level=50.0, side="long",
                sl_pct=10.0, tp_pct=None, max_bars=12, ma200_filter=True)

def _ema(s: pd.Series, n: int) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").ewm(span=int(n), adjust=False).mean()

def _stc(c: pd.Series, length: int, fast: int, slow: int) -> pd.Series:
    macd = _ema(c, fast) - _ema(c, slow)
    v1 = macd.rolling(length).min()
    v2 = macd.rolling(length).max() - v1
    f1 = (100 * (macd - v1) / (v2.replace(0, pd.NA))).fillna(method="ffill")
    pf = f1.ewm(alpha=0.5, adjust=False).mean()
    v3 = pf.rolling(length).min()
    v4 = pf.rolling(length).max() - v3
    f2 = (100 * (pf - v3) / (v4.replace(0, pd.NA))).fillna(method="ffill")
    return f2.ewm(alpha=0.5, adjust=False).mean()

def _sma(s: pd.Series, n: int) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").rolling(int(n), min_periods=int(n)).mean()

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = pd.to_numeric(df["close"], errors="coerce")
    stc = _stc(c, p["length"], p["fast"], p["slow"])
    ma200 = _sma(c, 200)

    up   = (stc > p["enter_level"]) & (stc.shift(1) <= p["enter_level"])
    down = (stc < (100 - p["enter_level"])) & (stc.shift(1) >= (100 - p["enter_level"]))

    side = str(p["side"]).lower()
    if side == "short":
        entry = down & (~p["ma200_filter"] | (c < ma200))
        exit_rule = (stc > p["exit_level"])
        meta_side = "short"
    else:
        entry = up & (~p["ma200_filter"] | (c > ma200))
        exit_rule = (stc < p["exit_level"])
        meta_side = "long"

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=meta_side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="stc_cross",
    name="Schaff Trend Cycle Cross",
    direction="both",
    defaults=DEFAULTS,
    description="STC korsar upp/ned för entries; valfritt SMA200-filter.",
    generate=_generate
)
