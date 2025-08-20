import pandas as pd
import numpy as np


# === Hjälpare ===


def _roundtrip_cost(bps: float) -> float:
# bps = basis points (2.5 bps = 0.025%)
return bps / 10000.0




def backtest_long_only(bars: pd.DataFrame,
signals: pd.DataFrame,
params: dict,
delay_minutes: int = 20,
fee_bps: float = 2.0,
slippage_bps: float = 3.0,
tp_pct: float | None = None,
sl_pct: float | None = None,
size_mode: str = "all_in"):
"""Event‑driven BT på 1h‑bars med latency: agera **på nästa bar open** efter entry/exit.
Stop/Take testas *inom* bar via OHLC. Om både träffas i samma bar antar vi konservativt att stop slår först.
"""
idx = bars.index
o, h, l, c = [bars[k].values for k in ("open", "high", "low", "close")]


entry_sig = signals["entry"].astype(bool).values
exit_rule = signals.get("exit", pd.Series(False, index=idx)).astype(bool).values


in_pos = False
entry_px = np.nan
entry_i = -1
trades = []
cost = _roundtrip_cost(fee_bps + slippage_bps)


for i in range(len(idx)):
# ENTRY
if (not in_pos) and entry_sig[i]:
j = i + 1 if i + 1 < len(idx) else i
in_pos = True
entry_i = j
entry_px = o[j] if not np.isnan(o[j]) else c[j]
continue


# EXIT
if in_pos:
stop_px = entry_px * (1 - (sl_pct or 0)/100.0) if sl_pct else None
take_px = entry_px * (1 + (tp_pct or 0)/100.0) if tp_pct else None


# intrabar stop/take
bar_stop = (stop_px is not None) and (l[i] <= stop_px)
bar_take = (take_px is not None) and (h[i] >= take_px)


do_exit = exit_rule[i] or bar_stop or bar_take or (i == len(idx) - 1)
return df.loc[act_idx]