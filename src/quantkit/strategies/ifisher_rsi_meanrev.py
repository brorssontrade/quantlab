from __future__ import annotations
import pandas as pd
from quantkit.indicators.registry import compute as icomp
from .base import StrategySpec

DEFAULTS = dict(
    if_len=9, if_sig=3, ma_len=200,
    side="long", sl_pct=10.0, tp_pct=None, max_bars=10
)

def _sma(s: pd.Series, n: int) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").rolling(int(n), min_periods=int(n)).mean()

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = df["close"]
    ifr = icomp("ifisher_rsi", df, length=p["if_len"], signal=p["if_sig"])
    z, sig = ifr["if_rsi"], ifr["signal"]
    ma = _sma(c, p["ma_len"])

    cross_up   = (z > sig) & (z.shift(1) <= sig.shift(1))
    cross_down = (z < sig) & (z.shift(1) >= sig.shift(1))

    entry = cross_up & (c > ma)  # bara köpa i övergripande upptrend
    exit_rule = cross_down

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side="long")
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="ifisher_rsi_meanrev",
    name="IFT-RSI Mean Reversion (SMA200-filter)",
    direction="long",
    defaults=DEFAULTS,
    description="Köp när IFT-RSI korsar upp sin signal och kursen ligger över SMA200.",
    generate=_generate
)
