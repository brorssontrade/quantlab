from __future__ import annotations
from pathlib import Path
import pandas as pd
import yfinance as yf

from quantkit.indicators.registry import compute, normalize_ohlcv, write_html_catalog as write_ind_docs
from quantkit.strategies import registry as SREG
from quantkit.backtest.engine2 import run_signals
from quantkit.reporting.ts_report import build_report

sym = "AAPL"
df = yf.download(sym, period="1y")
df = df.rename(columns={"Open":"open","High":"high","Low":"low","Close":"close","Volume":"volume"})
bars = normalize_ohlcv(df)

# compute a few indicators
rsi14 = compute("rsi", bars, length=14)
sma50 = compute("sma", bars, length=50)
sma200 = compute("sma", bars, length=200)

# generate signals from luke strategy
SREG.ensure_populated()
sig = SREG.generate("luke", bars)
res = run_signals(
    bars, sig["entry"], sig["exit"], side="long",
    sl_pct=sig["meta"].get("sl_pct"), tp_pct=sig["meta"].get("tp_pct"),
    max_bars=sig["meta"].get("max_bars"),
    fee_bps=0.10, slippage_bps=0.15, commission_plan="small", qty=1.0
)

out = Path("reports")/sym/"demo"; out.mkdir(parents=True, exist_ok=True)
html = build_report(
    bars=bars.set_index(pd.to_datetime(bars["ts"])),
    equity=res.equity,
    trades_like=res.trades.to_dict("records"),
    symbol=sym, run_id="demo", out_dir=out,
    commission_total=float(res.trades.get("commission",0).sum()),
    bps_fees_total=float(res.trades.get("cost_bps",0).sum()),
    slippage_total=float(res.trades.get("slippage_bps",0).sum()),
    strategy_name="Luke Skywalker", strategy_params=sig["meta"], init_capital=100_000.0,
)
print("WROTE", html)
