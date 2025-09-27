from __future__ import annotations
from pathlib import Path
import typer
import numpy as np
import pandas as pd
from .metrics import cagr, sharpe, max_drawdown, turnover

app = typer.Typer(add_completion=False)


def _read_prices(prices_path: str) -> pd.DataFrame:
    df = pd.read_parquet(prices_path)
    df["Ts"] = pd.to_datetime(df["Ts"], utc=True).dt.tz_localize(None)
    df = df.sort_values(["Symbol", "Ts"])
    need = ["Ts", "Symbol", "Price"]
    miss = [c for c in need if c not in df.columns]
    if miss:
        raise ValueError(f"Prices saknar kolumner: {miss}")
    return df[need]


def _read_signals(signals_path: str, threshold: float | None = None) -> pd.DataFrame:
    df = pd.read_parquet(signals_path)
    df["Ts"] = pd.to_datetime(df["Ts"], utc=True).dt.tz_localize(None)
    df = df.sort_values(["Symbol", "Ts"])
    if "Signal" not in df.columns:
        if "Score" in df.columns:
            thr = 0.0 if threshold is None else float(threshold)
            df["Signal"] = np.where(df["Score"] > thr, 1, np.where(df["Score"] < -thr, -1, 0)).astype(int)
        else:
            raise ValueError("Signals saknar 'Signal' och 'Score'.")
    return df[["Ts", "Symbol", "Signal"]]


@app.command()
def run(
    signals: str = typer.Option(..., help="Parquet med Ts,Symbol,Signal (eller Score)"),
    prices: str = typer.Option("storage/snapshots/breadth/symbols/latest.parquet"),
    cost_bps: float = typer.Option(2.0, help="Transaktionskostnad i bps per abs(dPos)"),
    score_threshold: float = typer.Option(0.0, help="Om Score -> Signal mapping behövs"),
    out: str = typer.Option("storage/backtests/equity.parquet"),
):
    """
    Next-bar backtest (lika vikt):
      PnL_t = Pos_{t-1} * Ret_t - cost_{t-1}
    """
    px = _read_prices(prices)
    sg = _read_signals(signals, threshold=score_threshold)
    df = px.merge(sg, on=["Ts", "Symbol"], how="inner").sort_values(["Symbol", "Ts"])

    # Ret_t = (P_t / P_{t-1} - 1)
    df["Ret1D"] = df.groupby("Symbol")["Price"].pct_change().fillna(0.0)

    # Position som gäller för Ret_t är signalen beslutad på t-1:
    df["PosPrev"] = df.groupby("Symbol")["Signal"].shift(1).fillna(0).clip(-1, 1)

    # Omsättning (för kostnad) = ändring i PosPrev vid t-1:
    df["PosPrevPrev"] = df.groupby("Symbol")["PosPrev"].shift(1).fillna(0)
    df["Turn"] = (df["PosPrev"] - df["PosPrevPrev"]).abs()

    # Kostnad i andel: bps -> andel
    cost = (cost_bps / 10000.0) * df["Turn"]

    # PnL per symbol per dag
    df["SymPnL"] = df["PosPrev"] * df["Ret1D"] - cost

    # Aggregera lika vikt över symboler
    sym_daily = df.pivot_table(index="Ts", columns="Symbol", values="SymPnL", aggfunc="sum")
    daily_ret = sym_daily.mean(axis=1).fillna(0.0)
    equity = (1.0 + daily_ret).cumprod()

    res = {
        "CAGR": cagr(equity, "D"),
        "Sharpe": sharpe(daily_ret, "D"),
        "MaxDD": max_drawdown(equity),
        "Turnover": turnover(df.pivot_table(index="Ts", columns="Symbol", values="PosPrev")),
    }
    print("Results:")
    for k, v in res.items():
        print(f"  {k:8s}: {v:.4f}")

    outp = Path(out); outp.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({"Ts": equity.index, "Equity": equity.values, "Ret": daily_ret.values}).to_parquet(outp, index=False)
    print(f"✓ Wrote backtest -> {outp}")


if __name__ == "__main__":
    app()
