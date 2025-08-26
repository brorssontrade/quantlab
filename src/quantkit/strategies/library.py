from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, Literal
import numpy as np
import pandas as pd
from .indicators import rsi, adx, sma, percent_change, lowest, highest

Side = Literal["long","short"]

@dataclass
class StratOut:
    name: str
    params: dict
    entry: pd.Series      # bool, index ts
    exit_rule: pd.Series  # bool, index ts
    sl_pct: Optional[float] = None
    tp_pct: Optional[float] = None
    max_bars: Optional[int] = None
    side: Side = "long"

def _idx(df: pd.DataFrame) -> pd.Index:
    return pd.to_datetime(df["ts"]) if "ts" in df else df.index

# --- Luke Skywalker (long) ---
def luke(df: pd.DataFrame) -> StratOut:
    c, h, l = df["close"].astype(float), df["high"].astype(float), df["low"].astype(float)
    rsi2 = rsi(c, 2)
    adx10 = adx(h, l, c, 10)
    rng = (h - l).replace(0, np.nan)
    prox = (c - l) / rng
    entry = (rsi2 < 10) & (adx10 > 20) & (prox < 0.15) & (c > sma(c, 200))
    # Exit: close > föregående bars high
    exit_rule = c > h.shift(1)
    ix = _idx(df)
    return StratOut(
        name="Luke Skywalker",
        params=dict(rsi_len=2, rsi_th=10, adx_len=10, adx_min=20, prox_th=0.15, sma_len=200,
                    exit="close > prior high"),
        entry=pd.Series(entry.values, index=ix).fillna(False),
        exit_rule=pd.Series(exit_rule.values, index=ix).fillna(False),
        sl_pct=10.0, tp_pct=None, max_bars=10, side="long"
    )

# --- Darth Vader (long) ---
def darth(df: pd.DataFrame) -> StratOut:
    c = df["close"].astype(float)
    ent = (c == lowest(c, 14)) & (percent_change(c, 1) == lowest(percent_change(c, 1), 4)) & (c > sma(c, 200))
    rsi2 = rsi(c, 2)
    exit_rule = rsi2 > 65
    ix = _idx(df)
    return StratOut(
        name="Darth Vader",
        params=dict(lowclose=14, pctchangeday=4, sma_len=200, exit_rsi=65),
        entry=pd.Series(ent.values, index=ix).fillna(False),
        exit_rule=pd.Series(exit_rule.values, index=ix).fillna(False),
        sl_pct=15.0, tp_pct=None, max_bars=14, side="long"
    )

# --- Obi-Wan (long) ---
def obi(df: pd.DataFrame) -> StratOut:
    c = df["close"].astype(float)
    rsi2 = rsi(c, 2)
    entry = (c > sma(c, 250)) & (rsi2 < 20)
    exit_rule = rsi2 >= 75
    ix = _idx(df)
    return StratOut(
        name="Obi-Wan",
        params=dict(length=250, rsi_buy=20, exit_rsi=75),
        entry=pd.Series(entry.values, index=ix).fillna(False),
        exit_rule=pd.Series(exit_rule.values, index=ix).fillna(False),
        sl_pct=10.0, tp_pct=None, max_bars=15, side="long"
    )

# --- R2-D2 (short) – signaler (motor för short kommer senare) ---
def r2d2(df: pd.DataFrame) -> StratOut:
    c = df["close"].astype(float)
    up2 = (c > c.shift(1)) & (c.shift(1) > c.shift(2))
    pc1 = percent_change(c, 1)
    entry = (c < sma(c, 200)) & up2 & (pc1 == highest(pc1, 2))
    exit_rule = c.shift(1) < sma(c.shift(1), 8)
    ix = _idx(df)
    return StratOut(
        name="R2-D2 (short)",
        params=dict(sma_len=200, exit_len=8),
        entry=pd.Series(entry.values, index=ix).fillna(False),
        exit_rule=pd.Series(exit_rule.values, index=ix).fillna(False),
        sl_pct=10.0, tp_pct=None, max_bars=15, side="short"
    )
