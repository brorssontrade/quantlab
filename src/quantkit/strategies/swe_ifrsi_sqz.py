from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators import sma  # om du har sma-indikatorn exporterad
from quantkit.indicators.registry import compute as ind_compute

DEFAULTS = dict(
    sma_len=200, rvol_len=20, rvol_min=1.2,
    if_len=14, if_alpha=0.1, sqz_len=20, sqz_mult=2.0,
    max_bars=20,
)

def _rvol(v: pd.Series, n:int) -> pd.Series:
    v = pd.to_numeric(v, errors="coerce").fillna(0.0)
    return v / (v.rolling(n).mean() + 1e-12)

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    c = df["close"]; v = df["volume"]
    sma200 = pd.to_numeric(c, errors="coerce").rolling(p["sma_len"]).mean()
    rvol = _rvol(v, p["rvol_len"])

    # indikatorer via registry
    from quantkit.indicators.inverse_fisher_rsi import compute as ifr
    from quantkit.indicators.squeeze_momentum   import compute as sqz
    if_df  = ifr(df, length=p["if_len"], alpha=p["if_alpha"])
    sq_df  = sqz(df, length=p["sqz_len"], mult=p["sqz_mult"])

    long_trend = c > sma200
    release_up = sq_df["sqz_off"] & (sq_df["mom"] > 0)
    if_cross   = (if_df["if_rsi"].shift(1) <= 0) & (if_df["if_rsi"] > 0)

    entry = long_trend & release_up & if_cross & (rvol >= p["rvol_min"])
    exit_rule = (if_df["if_rsi"] < 0) | (c < sma200)

    meta = dict(side="long", max_bars=p["max_bars"], rvol_min=p["rvol_min"])
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="swe_ifrsi_sqz",
    name="SWE – IFT(RSI) + Squeeze release + SMA200 + RVOL",
    direction="long",
    defaults=DEFAULTS,
    description="Trendfilter SMA200, RVOL>=1.2, squeeze release upp + IFT(RSI) korsar över 0.",
    generate=_generate,
)
