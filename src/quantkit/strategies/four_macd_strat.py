from __future__ import annotations
import pandas as pd
from .base import StrategySpec

DEFAULTS = dict(mult_b=4.3, mult_y=1.4, sl_pct=10.0, tp_pct=None, max_bars=15, side="long")

def _ema(s: pd.Series, n: int) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").ewm(span=int(n), adjust=False).mean()

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = pd.to_numeric(df["close"], errors="coerce")
    ema5=_ema(c,5); ema8=_ema(c,8); ema10=_ema(c,10); ema14=_ema(c,14); ema16=_ema(c,16); ema17=_ema(c,17)

    e17_14 = ema17-ema14
    e17_8  = ema17-ema8
    e10_16 = ema10-ema16
    e5_10  = ema5-ema10

    macd_blue   = p["mult_b"]*(e17_14 - _ema(e17_14,5))
    macd_red    = e17_8 - _ema(e17_8,5)
    macd_yellow = p["mult_y"]*(e10_16 - _ema(e10_16,5))
    macd_green  = e5_10 - _ema(e5_10,5)

    # Idé: long när green korsar över 0 och red under 0 (rotation upp). Exit när green < 0 eller red > 0.
    cross_up   = (macd_green > 0) & (macd_green.shift(1) <= 0)
    cross_down = (macd_green < 0) & (macd_green.shift(1) >= 0)

    side = str(p.get("side","long")).lower()
    if side == "short":
        entry = (macd_green < 0) & (macd_red > 0) & cross_down
        exit_rule = (macd_green > 0) | (macd_red < 0)
        meta_side = "short"
    else:
        entry = (macd_green > 0) & (macd_red < 0) & cross_up
        exit_rule = (macd_green < 0) | (macd_red > 0)
        meta_side = "long"

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=meta_side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="four_macd",
    name="4-MACD Rotation",
    direction="both",
    defaults=DEFAULTS,
    description="Grön>0 och Röd<0 (upp-rotation). Spegelvänd för short.",
    generate=_generate
)
