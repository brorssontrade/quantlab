from __future__ import annotations
import pandas as pd
from .base import StrategySpec
from quantkit.indicators.registry import compute as icompute

DEFAULTS = dict(length=14, amaLength=10, fastend=0.666, slowend=0.0645, ema_ref=10,
                side="long", sl_pct=None, tp_pct=None, max_bars=None)

def _bull_signals(df: pd.DataFrame, p: dict):
    ema_ref = df["close"].ewm(span=int(p["ema_ref"]), adjust=False).mean()
    kama = icompute("kama2", df, amaLength=p["amaLength"], fastend=p["fastend"], slowend=p["slowend"])["kama"]
    arsi = icompute("arsi_ma", df, length=p["length"])["arsi"]
    vidy = icompute("vidya", df, length=p["length"])["vidya"]

    s1 = (kama > ema_ref)
    s2 = (arsi > arsi.shift(1))
    s3 = (vidy > vidy.shift(1))
    return s1, s2, s3

def _generate(df: pd.DataFrame, params: dict):
    p = {**DEFAULTS, **(params or {})}
    s1, s2, s3 = _bull_signals(df, p)

    long_entry  = (s1 & s2) | (s1 & s3) | (s2 & s3)          # minst 2 av 3 bullish
    long_exit   = (~s1 & ~s2) | (~s1 & ~s3) | (~s2 & ~s3)    # minst 2 av 3 bearish

    short_entry = (~s1 & ~s2) | (~s1 & ~s3) | (~s2 & ~s3)
    short_exit  = (s1 & s2) | (s1 & s3) | (s2 & s3)

    side = str(p.get("side", "long")).lower()
    entry, exit_rule = (long_entry, long_exit) if side=="long" else (short_entry, short_exit)

    meta = dict(sl_pct=p["sl_pct"], tp_pct=p["tp_pct"], max_bars=p["max_bars"], side=side)
    return {"entry": entry.fillna(False), "exit": exit_rule.fillna(False), "meta": meta}

STRATEGY = StrategySpec(
    id="ama_combo",
    name="Adaptive MAs (KAMA+ARSI+VIDYA) – konsensus",
    direction="long",
    defaults=DEFAULTS,
    description="Minst 2/3 av (KAMA>EMAref, ARSI stiger, VIDYA stiger) => long; spegelvänt för short.",
    generate=_generate
)
