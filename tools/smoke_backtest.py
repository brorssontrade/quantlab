from pathlib import Path
import pandas as pd
from quantkit.data.yf_loader import load_bars_or_synth
from quantkit.strategies.registry import REGISTRY
from quantkit.backtest.engine2 import run_signals
from quantkit.reporting.ts_report import build_report, TradeLike

sym = "AAPL"; days = 1200

bars = load_bars_or_synth(sym, days=days, interval="1d")
print("Bars:", len(bars))
if bars.empty:
    raise SystemExit("Tomma bars – kan inte köra.")

spec = REGISTRY["luke"]
out = spec(bars.copy())
print("Strategy:", out.name, "| side:", out.side)

rr = run_signals(
    bars=bars, entry=out.entry, exit_rule=out.exit_rule,
    side="long", sl_pct=out.sl_pct, tp_pct=out.tp_pct, max_bars=out.max_bars,
    fee_bps=0.10, slippage_bps=0.15, commission_plan="small", qty=1.0,
    init_capital=100_000.0,
)
print("Equity points:", len(rr.equity), "| Trades:", len(rr.trades))

out_dir = Path("reports")/sym/"manual"
out_dir.mkdir(parents=True, exist_ok=True)

trades_like = [
    TradeLike(
        entry_ts=pd.Timestamp(r.entry_ts),
        exit_ts=pd.Timestamp(r.exit_ts),
        entry_px=float(r.entry_px),
        exit_px=float(r.exit_px),
        reason=str(r.reason),
        bars_held=int(r.bars_held),
    )
    for r in rr.trades.itertuples(index=False)
]

def colsum(df: pd.DataFrame, col: str) -> float:
    return float(df[col].sum()) if col in df.columns else 0.0

html = build_report(
    bars=bars.set_index(pd.to_datetime(bars["ts"])),
    equity=rr.equity, trades_like=trades_like,
    symbol=sym, run_id="manual", out_dir=out_dir,
    commission_total=colsum(rr.trades, "commission"),
    bps_fees_total=colsum(rr.trades, "cost_bps"),
    slippage_total=colsum(rr.trades, "slippage_bps"),
    strategy_name=out.name, strategy_params=out.params, init_capital=100_000.0,
)
print("WROTE", html)
