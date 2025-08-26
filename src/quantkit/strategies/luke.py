from __future__ import annotations
import pandas as pd

from quantkit.indicators import rsi, sma
from quantkit.indicators.registry import compute, normalize_ohlcv
from .base import StrategySpec

DEFAULTS = dict(
    sl_pct=10.0, tp_pct=None, max_bars=10,
    rsi_len=2, rsi_th=10.0,
    adx_len=10, adx_min=20.0,
    prox_th=0.15,
    sma_len=200,
)

def generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    df = normalize_ohlcv(df)
    c, h, l = df["close"], df["high"], df["low"]

    rsi2 = rsi(c, int(p["rsi_len"]))
    adxv = compute("adx", df, length=int(p["adx_len"]))  # använder din indikator-modul
    rng  = (h - l).replace(0, pd.NA)
    prox = (c - l) / rng

    entry = (rsi2 < p["rsi_th"]) & (adxv > p["adx_min"]) & (prox < p["prox_th"]) & (c > sma(c, int(p["sma_len"])))
    exit_rule = c > h.shift(1)

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side="long")
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="luke",
    name="Luke Skywalker",
    direction="long",
    defaults=DEFAULTS,
    description="RSI(2)<10, ADX(10)>20, proximity<0.15, filter SMA200; exit när close > föregående high.",
    generate=generate,
)
