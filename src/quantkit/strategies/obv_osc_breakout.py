from __future__ import annotations
import pandas as pd
from .base import StrategySpec

DEFAULTS = dict(length=50, dc_len=100, side="both", sl_pct=10.0, tp_pct=None, max_bars=20)

def _obv(close: pd.Series, vol: pd.Series) -> pd.Series:
    c = pd.to_numeric(close, errors="coerce")
    v = pd.to_numeric(vol,   errors="coerce").fillna(0.0)
    delta = c.diff()
    signed = v.where(delta > 0, 0).where(delta < 0, -v)
    return signed.cumsum()

def _ema(s: pd.Series, n: int) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").ewm(span=int(n), adjust=False).mean()

def _donch(s: pd.Series, n: int):
    top = s.rolling(int(n), min_periods=int(n)).max()
    bot = s.rolling(int(n), min_periods=int(n)).min()
    mid = (top+bot)/2.0
    return top, mid, bot

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = df["close"]; v = df["volume"]

    os = _obv(c, v)
    obv_osc = os - _ema(os, p["length"])

    top_p, _, bot_p = _donch(pd.to_numeric(df["high"], errors="coerce"), p["dc_len"])
    top_o, _, bot_o = _donch(obv_osc, p["dc_len"])

    enter_long  = (pd.to_numeric(df["high"], errors="coerce") > top_p.shift(1)) & (obv_osc > top_o.shift(1)) & (obv_osc > 0)
    exit_long   = (pd.to_numeric(df["low"],  errors="coerce") < bot_p.shift(1))  | (obv_osc < 0)

    enter_short = (pd.to_numeric(df["low"],  errors="coerce") < bot_p.shift(1))  & (obv_osc < bot_o.shift(1)) & (obv_osc < 0)
    exit_short  = (pd.to_numeric(df["high"], errors="coerce") > top_p.shift(1))  | (obv_osc > 0)

    side = str(p["side"]).lower()
    if side == "short":
        entry, exit_rule, meta_side = enter_short, exit_short, "short"
    elif side == "long":
        entry, exit_rule, meta_side = enter_long,  exit_long,  "long"
    else:
        # default till long (CLI: välj side via params om du vill)
        entry, exit_rule, meta_side = enter_long, exit_long, "long"

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=meta_side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="obv_osc_breakout",
    name="OBV Osc Breakout",
    direction="both",
    defaults=DEFAULTS,
    description="Pris + OBV-oscillator bryter Donchian-kanaler; volym bekräftar breakout.",
    generate=_generate
)
