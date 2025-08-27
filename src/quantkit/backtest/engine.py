# src/quantkit/backtest/engine.py
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple, Optional

import numpy as np
import pandas as pd

from .costs import apply_costs


@dataclass
class Trade:
    entry_ts: pd.Timestamp
    exit_ts: pd.Timestamp
    entry_px: float
    exit_px: float
    reason: str
    bars_held: int


def _ema(s: pd.Series, span: int) -> pd.Series:
    return s.ewm(span=span, adjust=False, min_periods=span).mean()


def _ensure_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Beräkna ATR14/RSI2/RSI14/ADX14 om saknas (matchar dina features)."""
    out = df.copy()
    close = out["close"].astype(float)
    high = out["high"].astype(float)
    low = out["low"].astype(float)

    # ATR
    if "atr14" not in out.columns:
        tr = pd.concat(
            [(high - low), (high - close.shift()).abs(), (low - close.shift()).abs()],
            axis=1,
        ).max(axis=1)
        out["atr14"] = tr.ewm(alpha=1 / 14, adjust=False).mean()

    # RSI
    def _rsi(series: pd.Series, length: int) -> pd.Series:
        delta = series.diff()
        up = delta.clip(lower=0).ewm(alpha=1 / length, adjust=False).mean()
        down = (-delta.clip(upper=0)).ewm(alpha=1 / length, adjust=False).mean()
        rs = up / (down + 1e-12)
        return 100 - 100 / (1 + rs)

    if "rsi2" not in out.columns:
        out["rsi2"] = _rsi(close, 2)
    if "rsi14" not in out.columns:
        out["rsi14"] = _rsi(close, 14)

    # ADX14 (Wilder)
    if "adx14" not in out.columns:
        up_move = high.diff()
        down_move = -low.diff()
        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
        plus_dm = pd.Series(plus_dm, index=out.index)
        minus_dm = pd.Series(minus_dm, index=out.index)

        tr = pd.concat(
            [(high - low), (high - close.shift()).abs(), (low - close.shift()).abs()],
            axis=1,
        ).max(axis=1)
        tr14 = tr.ewm(alpha=1 / 14, adjust=False).mean()
        plus_dm14 = plus_dm.ewm(alpha=1 / 14, adjust=False).mean()
        minus_dm14 = minus_dm.ewm(alpha=1 / 14, adjust=False).mean()
        plus_di14 = 100 * (plus_dm14 / (tr14 + 1e-12))
        minus_di14 = 100 * (minus_dm14 / (tr14 + 1e-12))
        dx = ((plus_di14 - minus_di14).abs() / (plus_di14 + minus_di14 + 1e-12)) * 100
        out["adx14"] = dx.ewm(alpha=1 / 14, adjust=False).mean()

    return out


def _baseline_signals(
    df: pd.DataFrame, adx_min: float, rsi2_max: float, rsi14_exit: float, use_second_hour: bool
) -> Tuple[pd.Series, pd.Series]:
    entry = (df["adx14"] >= adx_min) & (df["rsi2"] <= rsi2_max)
    if use_second_hour and "second_hour" in df.columns:
        entry = entry & (df["second_hour"] == 1)
    exit_rule = df["rsi14"] >= rsi14_exit
    return entry.fillna(False), exit_rule.fillna(False)


def run_backtest(
    df: pd.DataFrame,
    strategy: str = "baseline",
    sl_atr: float = 1.5,
    tp_atr: float = 2.5,
    fee_bps: float = 5.0,  # per sida (entry/exit)
    adx_min: float = 15.0,
    rsi2_max: float = 15.0,
    rsi14_exit: float = 60.0,
    use_second_hour: bool = False,
    debug: bool = False,
) -> Tuple[pd.DataFrame, List[Trade]]:
    """
    Enkel event-driven motor …
    """
    if strategy != "baseline":
        raise ValueError("Just nu stöds strategy='baseline' i denna motor.")

    df = _ensure_indicators(df)
    df = df.dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)

    ts = pd.to_datetime(df["ts"])
    o = df["open"].to_numpy(dtype=float)
    h = df["high"].to_numpy(dtype=float)
    l = df["low"].to_numpy(dtype=float)
    c = df["close"].to_numpy(dtype=float)
    atr = df["atr14"].to_numpy(dtype=float)

    entry_sig, exit_rule = _baseline_signals(df, adx_min, rsi2_max, rsi14_exit, use_second_hour)
    entry_sig = entry_sig.to_numpy(dtype=bool)
    exit_rule = exit_rule.to_numpy(dtype=bool)

    equity = [1.0]
    eq_ts = [ts.iloc[0]]
    trades: List[Trade] = []

    in_pos = False
    entry_px = np.nan
    entry_i = -1

    for i in range(1, len(df)):
        if (not in_pos) and entry_sig[i - 1]:
            in_pos = True
            entry_i = i
            entry_px = o[i] if np.isfinite(o[i]) else c[i]
            eq_ts.append(ts.iloc[i])
            equity.append(equity[-1])
            continue

        if in_pos:
            sl = sl_atr * atr[i]
            tp = tp_atr * atr[i]
            stop_px = entry_px - sl if np.isfinite(sl) else None
            take_px = entry_px + tp if np.isfinite(tp) else None

            hit_stop = stop_px is not None and l[i] <= float(stop_px)
            hit_take = take_px is not None and h[i] >= float(take_px)

            reason: Optional[str] = None
            exit_px: Optional[float] = None

            if hit_stop or hit_take:
                if hit_stop:
                    exit_px = float(stop_px)
                    reason = "SL"
                else:
                    exit_px = float(take_px)
                    reason = "TP"
                exit_i = i
            elif exit_rule[i - 1]:
                exit_px = o[i] if np.isfinite(o[i]) else c[i]
                reason = "RULE"
                exit_i = i
            elif i == len(df) - 1:
                exit_px = c[i]
                reason = "EOD"
                exit_i = i
            else:
                eq_ts.append(ts.iloc[i])
                equity.append(equity[-1])
                continue

            orders = pd.DataFrame({"price": [entry_px, exit_px], "qty": [1.0, 1.0]})
            costs = float(apply_costs(orders, bps=float(fee_bps)).sum())

            net_factor = (exit_px - costs) / entry_px
            equity.append(equity[-1] * float(net_factor))
            eq_ts.append(ts.iloc[exit_i])

            trades.append(
                Trade(
                    entry_ts=ts.iloc[entry_i],
                    exit_ts=ts.iloc[exit_i],
                    entry_px=float(entry_px),
                    exit_px=float(exit_px),
                    reason=str(reason),
                    bars_held=int(exit_i - entry_i),
                )
            )
            in_pos = False
            entry_px = np.nan
            entry_i = -1
            continue

        eq_ts.append(ts.iloc[i])
        equity.append(equity[-1])

    eq_df = pd.DataFrame({"ts": eq_ts, "equity": equity})
    return eq_df, trades
