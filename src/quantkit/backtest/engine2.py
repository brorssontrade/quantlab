from __future__ import annotations
from dataclasses import dataclass
from typing import Optional
import numpy as np
import pandas as pd

@dataclass
class CommissionPlan:
    name: str
    rate: float | None = None
    min_fee: float | None = None
    fallback_per_fill: float = 0.0
    @staticmethod
    def from_name(name: str, fallback: float = 0.0) -> "CommissionPlan":
        name = (name or "none").lower()
        if name == "mini":   return CommissionPlan("mini",   rate=0.0025,  min_fee=1.0,  fallback_per_fill=fallback)
        if name == "small":  return CommissionPlan("small",  rate=0.0015,  min_fee=39.0, fallback_per_fill=fallback)
        if name == "medium": return CommissionPlan("medium", rate=0.00069, min_fee=69.0, fallback_per_fill=fallback)
        return CommissionPlan("none", rate=None, min_fee=None, fallback_per_fill=fallback)
    def per_fill(self, notional: float) -> float:
        if self.rate is None or self.min_fee is None:
            return float(self.fallback_per_fill)
        return max(float(notional) * float(self.rate), float(self.min_fee))

@dataclass
class RunResult:
    equity: pd.Series
    trades: pd.DataFrame

def run_signals(
    bars: pd.DataFrame,
    entry: pd.Series,
    exit_rule: pd.Series,
    *,
    side: str = "long",
    sl_pct: Optional[float] = None,
    tp_pct: Optional[float] = None,
    max_bars: Optional[int] = None,
    fee_bps: float = 0.0,
    slippage_bps: float = 0.0,
    commission_plan: str | None = None,
    commission_per_fill_fixed: float = 0.0,
    qty: float = 1.0,
    init_capital: float = 100_000.0,
) -> RunResult:
    if side != "long":
        raise NotImplementedError("Short-stöd kommer senare.")

    df = bars.copy().reset_index(drop=True)
    ts = pd.to_datetime(df["ts"])
    o = df["open"].astype(float).to_numpy()
    h = df["high"].astype(float).to_numpy()
    l = df["low"].astype(float).to_numpy()
    c = df["close"].astype(float).to_numpy()

    # Align signalerna på tidsstämpeln
    idx = ts
    ent = pd.Series(entry).reindex(idx, fill_value=False).to_numpy(dtype=bool)
    exr = pd.Series(exit_rule).reindex(idx, fill_value=False).to_numpy(dtype=bool)

    def _bps_cost(notional: float, bps: float) -> float:
        return float(notional) * (float(bps) / 10_000.0)

    plan = CommissionPlan.from_name(commission_plan or "none", fallback=commission_per_fill_fixed)

    cash = float(init_capital)
    pos = 0.0
    entry_px = np.nan
    entry_i = -1
    eq = []
    trades = []

    for i in range(len(df)):
        # Entry (nästa bar open)
        if pos == 0.0 and i > 0 and ent[i - 1]:
            fill_px = float(o[i]) if np.isfinite(o[i]) else float(c[i])
            notional = abs(qty) * fill_px
            cb = _bps_cost(notional, fee_bps)
            sb = _bps_cost(notional, slippage_bps)
            cm = plan.per_fill(notional)
            cash -= notional + cb + sb + cm
            pos = qty
            entry_px = fill_px
            entry_i = i
            eq.append(cash + pos * c[i])
            continue

        # Exit?
        if pos != 0.0:
            stop_hit = take_hit = False
            exit_px = None
            j = i
            if sl_pct is not None and np.isfinite(entry_px):
                stop_px = entry_px * (1 - float(sl_pct) / 100.0)
                stop_hit = l[i] <= stop_px
            if tp_pct is not None and np.isfinite(entry_px):
                take_px = entry_px * (1 + float(tp_pct) / 100.0)
                take_hit = h[i] >= take_px

            reason = None
            if stop_hit:
                exit_px = float(entry_px * (1 - float(sl_pct) / 100.0)); reason = "SL"
            elif take_hit:
                exit_px = float(entry_px * (1 + float(tp_pct) / 100.0)); reason = "TP"
            elif i > 0 and exr[i - 1]:
                exit_px = float(o[i]) if np.isfinite(o[i]) else float(c[i]); reason = "RULE"
            elif max_bars is not None and entry_i >= 0 and (i - entry_i) >= int(max_bars):
                exit_px = float(o[i]) if np.isfinite(o[i]) else float(c[i]); reason = "TIME"

            if exit_px is not None:
                notional = abs(pos) * exit_px
                cb = _bps_cost(notional, fee_bps)
                sb = _bps_cost(notional, slippage_bps)
                cm = plan.per_fill(notional)
                cash += notional - cb - sb - cm

                ret = (exit_px / entry_px) - 1.0 if entry_px > 0 else 0.0
                pnl = ret * qty * entry_px
                span = slice(entry_i, j + 1)
                max_up = float(np.nanmax(h[span])) if entry_i >= 0 else exit_px
                max_dn = float(np.nanmin(l[span])) if entry_i >= 0 else exit_px
                mfe = (max_up / entry_px) - 1.0 if entry_px > 0 else 0.0
                mae = (max_dn / entry_px) - 1.0 if entry_px > 0 else 0.0

                trades.append(dict(
                    entry_ts=ts.iloc[entry_i], exit_ts=ts.iloc[j],
                    entry_px=float(entry_px), exit_px=float(exit_px),
                    bars_held=int(j - entry_i), reason=str(reason),
                    ret=float(ret), pnl=float(pnl),
                    mfe=float(mfe), mae=float(mae),
                    cost_bps=float(_bps_cost(abs(qty) * entry_px, fee_bps) + cb),
                    slippage_bps=float(_bps_cost(abs(qty) * entry_px, slippage_bps) + sb),
                    commission=float(plan.per_fill(abs(qty) * entry_px) + cm),
                ))
                pos = 0.0
                entry_px = np.nan
                entry_i = -1

        eq.append(cash + pos * c[i])

    equity = pd.Series(eq, index=ts, name="equity")
    trades_df = pd.DataFrame(trades)
    return RunResult(equity=equity, trades=trades_df)


# exempel: src/quantkit/engine.py (eller var du har din strategi)
from quantkit.notify import notify_signal

def on_signal(symbol: str, side: str, price: float, ts_iso: str, strategy: str, chart_url: str | None = None):
    # ... din ordinarie logik (loggning, order, persistence) ...
    notify_signal(
        symbol=symbol,
        side=side,                 # "BUY", "SELL", "EXIT" osv
        price=price,
        ts_iso=ts_iso,             # ex: pd.Timestamp.utcnow().isoformat()
        strategy=strategy,         # "RSI-2", "Breakout-ATR", etc
        note="Köpsignal enligt regel X",
        chart_url=chart_url,
    )
