# src/quantkit/backtest/generic.py
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, List
import numpy as np
import pandas as pd

@dataclass
class TradeRow:
    entry_ts: pd.Timestamp
    exit_ts: pd.Timestamp
    side: str
    entry_px: float
    exit_px: float
    ret: float
    pnl: float
    bars_held: int
    mfe: float
    mae: float
    commission: float
    slippage: float
    reason: str

@dataclass
class RunResult:
    equity: pd.Series
    trades: pd.DataFrame
    images: dict  # nycklar -> filnamn (fylls av reporting)

def run_signals(
    bars: pd.DataFrame,
    entry: pd.Series,
    exit_rule: pd.Series,
    *,
    side: str = "long",
    sl_pct: Optional[float] = None,
    tp_pct: Optional[float] = None,
    time_stop_days: Optional[int] = None,
    fee_bps: float = 2.0,
    commission_per_fill: float = 0.0,
    slippage_bps: float = 0.0,
) -> RunResult:
    """
    Enkel generisk exekvering:
      - Fyll 'nästa bar open' efter entry/exit-signal.
      - Stop/TP intrabar på high/low. (Stop prioriteras om båda träffas.)
      - Kostnader: bps per fill + ev fast kommission per fill.
      - Equity är 1.0 i start och multipliceras med (1 + ret_net).
    """
    df = bars.dropna(subset=["open","high","low","close"]).reset_index(drop=True).copy()
    ts = pd.to_datetime(df["ts"])
    o, h, l, c = [df[k].astype(float).to_numpy() for k in ("open","high","low","close")]
    entry = entry.reindex(df.index).fillna(False).to_numpy(bool)
    exit_rule = exit_rule.reindex(df.index).fillna(False).to_numpy(bool)
    sgn = 1 if side == "long" else -1

    equity = [1.0]
    eq_ts  = [ts.iloc[0]]
    open_pos = False
    entry_px = np.nan
    entry_i  = -1
    trades: List[TradeRow] = []

    for i in range(1, len(df)):
        # ENTRY
        if (not open_pos) and entry[i-1]:
            j = i
            entry_px = o[j] if np.isfinite(o[j]) else c[j]
            entry_i  = j
            open_pos = True
            eq_ts.append(ts.iloc[j]); equity.append(equity[-1])
            continue

        if not open_pos:
            eq_ts.append(ts.iloc[i]); equity.append(equity[-1]); continue

        # EXIT LOGIK
        stop_px = None; take_px = None
        if sl_pct:
            stop_px = entry_px * (1 - sgn*sl_pct/100.0) if sgn==1 else entry_px * (1 + sl_pct/100.0)
        if tp_pct:
            take_px = entry_px * (1 + sgn*tp_pct/100.0) if sgn==1 else entry_px * (1 - tp_pct/100.0)

        bar_hit_stop = (stop_px is not None) and ((l[i] <= stop_px) if sgn==1 else (h[i] >= stop_px))
        bar_hit_take = (take_px is not None) and ((h[i] >= take_px) if sgn==1 else (l[i] <= take_px))

        time_hit = False
        if time_stop_days:
            # mät i kalenderdagar från entry_ts (robust även om luckor)
            days_held = (ts.iloc[i] - ts.iloc[entry_i]).days
            time_hit = days_held >= int(time_stop_days)

        reason = None; exit_px = None; exit_i = None
        if bar_hit_stop or bar_hit_take:
            if bar_hit_stop:
                exit_px = float(stop_px); reason = "SL"
            else:
                exit_px = float(take_px); reason = "TP"
            exit_i = i
        elif exit_rule[i-1] or time_hit or (i == len(df)-1):
            j = i
            exit_px = o[j] if np.isfinite(o[j]) else c[j]
            reason = "RULE" if exit_rule[i-1] else ("TIME" if time_hit else "EOD")
            exit_i = j

        if exit_px is None:
            # ingen exit denna bar
            eq_ts.append(ts.iloc[i]); equity.append(equity[-1]); continue

        # Avkastning & kostnader (netto i retur)
        ret = sgn * ((exit_px / entry_px) - 1.0)
        bps_cost = (fee_bps + slippage_bps) / 10_000.0
        ret_net = ret - 2*bps_cost  # per sida
        equity.append(equity[-1] * (1.0 + ret_net))
        eq_ts.append(ts.iloc[exit_i])

        # MFE/MAE över holdingspannet
        span = slice(entry_i, exit_i+1)
        mx = np.nanmax(h[span]) if sgn==1 else np.nanmin(l[span])
        mn = np.nanmin(l[span]) if sgn==1 else np.nanmax(h[span])
        mfe = sgn * ((mx / entry_px) - 1.0) if sgn==1 else sgn * ((entry_px / mn) - 1.0)  # procent
        mae = sgn * ((mn / entry_px) - 1.0) if sgn==1 else sgn * ((entry_px / mx) - 1.0)

        trades.append(TradeRow(
            entry_ts=ts.iloc[entry_i], exit_ts=ts.iloc[exit_i], side=side,
            entry_px=float(entry_px), exit_px=float(exit_px),
            ret=float(ret), pnl=float(ret),  # pnl i "ret-enheter" (andel); kan skalas i rapport
            bars_held=int(exit_i - entry_i),
            mfe=float(mfe), mae=float(mae),
            commission=float(2*commission_per_fill),
            slippage=float(2*slippage_bps/10_000.0),
            reason=reason
        ))

        open_pos = False; entry_px=np.nan; entry_i=-1

    eq = pd.Series(equity, index=eq_ts, name="equity")
    trades_df = pd.DataFrame([t.__dict__ for t in trades])
    return RunResult(eq, trades_df, images={})
