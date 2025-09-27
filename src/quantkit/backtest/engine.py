from __future__ import annotations
from pathlib import Path
import typer, numpy as np, pandas as pd
from .metrics import cagr, sharpe, max_drawdown, turnover

app = typer.Typer(add_completion=False)

def _read_prices(prices_path: str)->pd.DataFrame:
    df = pd.read_parquet(prices_path)
    df["Ts"] = pd.to_datetime(df["Ts"], utc=True).dt.tz_localize(None)
    df = df.sort_values(["Symbol","Ts"])
    if not {"Ts","Symbol","Price"}.issubset(df.columns):
        raise ValueError("Prices saknar Ts/Symbol/Price")
    return df[["Ts","Symbol","Price"]]

def _read_signals(signals_path: str, threshold: float|None=None)->pd.DataFrame:
    df = pd.read_parquet(signals_path)
    df["Ts"] = pd.to_datetime(df["Ts"], utc=True).dt.tz_localize(None)
    df = df.sort_values(["Symbol","Ts"])
    if "Signal" not in df.columns and "Score" in df.columns:
        thr = 0.0 if threshold is None else float(threshold)
        df["Signal"] = np.where(df["Score"]>thr,1,np.where(df["Score"]<-thr,-1,0)).astype(int)
    if "Signal" not in df.columns: raise ValueError("Signals saknar 'Signal' (eller 'Score').")
    return df[["Ts","Symbol","Signal"]]

@app.command()
def run(
    signals: str = typer.Option(...),
    prices: str = typer.Option("storage/snapshots/breadth/symbols/latest.parquet"),
    cost_bps: float = typer.Option(2.0),
    score_threshold: float = typer.Option(0.0),
    out: str = typer.Option("storage/backtests/equity.parquet"),
):
    px = _read_prices(prices)
    sg = _read_signals(signals, threshold=score_threshold)
    df = px.merge(sg, on=["Ts","Symbol"], how="inner")
    df["SignalNext"] = df.groupby("Symbol")["Signal"].shift(1).fillna(0)
    df["Ret1D"] = df.groupby("Symbol")["Price"].pct_change().fillna(0.0)
    df["Pos"] = df["SignalNext"].clip(-1,1)
    df["PosPrev"] = df.groupby("Symbol")["Pos"].shift(1).fillna(0)
    df["Turn"] = (df["Pos"]-df["PosPrev"]).abs()
    cost = (cost_bps/10000.0)*df["Turn"]
    df["SymPnL"] = df["PosPrev"]*df["Ret1D"] - cost
    sym_daily = df.pivot_table(index="Ts", columns="Symbol", values="SymPnL", aggfunc="sum")
    daily_ret = sym_daily.mean(axis=1).fillna(0.0)
    equity = (1.0+daily_ret).cumprod()
    stats = {
        "CAGR": cagr(equity,"D"),
        "Sharpe": sharpe(daily_ret,"D"),
        "MaxDD": max_drawdown(equity),
        "Turnover": turnover(df.pivot_table(index="Ts", columns="Symbol", values="Pos")),
    }
    print("Results:")
    for k,v in stats.items(): print(f"  {k:8s}: {v:.4f}")
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({"Ts": equity.index, "Equity": equity.values, "Ret": daily_ret.values}).to_parquet(out, index=False)
    print(f"✓ Wrote backtest -> {out}")

if __name__ == "__main__":
    app()
