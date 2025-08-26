from pathlib import Path
import pandas as pd
from quantkit.data.yf_loader import load_bars_or_synth
from quantkit.strategies.registry import REGISTRY
from quantkit.backtest.engine2 import run_signals
from quantkit.reporting.ts_report import build_report

sym = "AAPL"; days = 1200
spec = REGISTRY["luke"]

bars = load_bars_or_synth(sym, days=days, interval="1d")
sig  = spec.fn(bars.copy(), params={})

res = run_signals(
    bars, sig["entry"], sig["exit"],
    side="long",
    sl_pct=sig["meta"].get("sl_pct"),
    tp_pct=sig["meta"].get("tp_pct"),
    max_bars=sig["meta"].get("max_bars"),
    fee_bps=0.10,
    slippage_bps=0.15,
    commission_plan="small",
    qty=1.0
)

out = Path("reports")/sym/"manual"
out.mkdir(parents=True, exist_ok=True)

html = build_report(
    bars=bars.set_index(pd.to_datetime(bars["ts"])),
    equity=res.equity,
    trades_like=res.trades.to_dict("records"),
    symbol=sym, run_id="manual", out_dir=out,
    commission_total=float(res.trades.get("commission",0).sum()),
    bps_fees_total=float(res.trades.get("cost_bps",0).sum()),
    slippage_total=float(res.trades.get("slippage_bps",0).sum()),
    strategy_name=spec.name, strategy_params=sig["meta"], init_capital=100_000.0,
)
print("WROTE", html)
