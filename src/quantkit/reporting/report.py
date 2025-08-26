# src/quantkit/reporting/report.py
from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt


# ---------- Hjälpare ----------

def _ensure_dt(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, utc=True, errors="coerce")


def _yearly_slices(idx: pd.DatetimeIndex) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    """Lista av (year_start, year_end_exclusive) för alla år i serien."""
    years = sorted(set(idx.year))
    out = []
    for y in years:
        start = pd.Timestamp(year=y, month=1, day=1, tz="UTC")
        end   = pd.Timestamp(year=y+1, month=1, day=1, tz="UTC")
        out.append((start, end))
    return out


def _profit_factor(pcts: Iterable[float]) -> float:
    pcts = np.array(list(pcts), dtype=float)
    gains = pcts[pcts > 0].sum()
    losses = -pcts[pcts < 0].sum()
    return float(gains / losses) if losses > 0 else np.inf if gains > 0 else 0.0


# ---------- TradeFrame (från din Trade-lista + OHLC, inkl. MFE/MAE & efficiency) ----------

def trades_to_frame(
    bars: pd.DataFrame,
    trades: list,
) -> pd.DataFrame:
    """
    Bygger en tabell lik din TradeStation "Trade List".

    Kolumner:
      entry_ts, exit_ts, entry_px, exit_px, reason, bars_held,
      pnl_abs, pnl_pct, mfe_pct, mae_pct, efficiency_pct
    """
    if not trades:
        return pd.DataFrame(
            columns=[
                "entry_ts","exit_ts","entry_px","exit_px","reason","bars_held",
                "pnl_abs","pnl_pct","mfe_pct","mae_pct","efficiency_pct"
            ]
        )

    bars = bars.copy()
    bars["ts"] = _ensure_dt(bars["ts"])
    bars = bars.dropna(subset=["open","high","low","close","ts"])

    # indexera på ts för slices
    bars = bars.set_index("ts").sort_index()

    rows = []
    for t in trades:
        entry_ts = pd.Timestamp(t.entry_ts).tz_convert("UTC") if pd.Timestamp(t.entry_ts).tzinfo else pd.Timestamp(t.entry_ts, tz="UTC")
        exit_ts  = pd.Timestamp(t.exit_ts ).tz_convert("UTC") if pd.Timestamp(t.exit_ts ).tzinfo else pd.Timestamp(t.exit_ts , tz="UTC")
        entry_px = float(t.entry_px)
        exit_px  = float(t.exit_px)
        pnl_abs  = exit_px - entry_px
        pnl_pct  = pnl_abs / entry_px if entry_px else 0.0

        # MFE/MAE under tradens livslängd
        sl = bars.loc[(bars.index >= entry_ts) & (bars.index <= exit_ts)]
        if sl.empty:
            mfe_pct = 0.0
            mae_pct = 0.0
            efficiency_pct = pnl_pct * 100.0
        else:
            high = float(np.nanmax(sl["high"].values))
            low  = float(np.nanmin(sl["low"].values))
            mfe_pct = (high - entry_px) / entry_px if entry_px else 0.0
            mae_pct = (low  - entry_px) / entry_px if entry_px else 0.0
            # "Total Efficiency" approx: faktisk utfall / möjlig range
            rng = (high - low)
            efficiency_pct = ((exit_px - entry_px) / rng * 100.0) if rng > 0 else (pnl_pct * 100.0)

        rows.append(
            dict(
                entry_ts=entry_ts,
                exit_ts=exit_ts,
                entry_px=entry_px,
                exit_px=exit_px,
                reason=str(t.reason),
                bars_held=int(t.bars_held),
                pnl_abs=float(pnl_abs),
                pnl_pct=float(pnl_pct),
                mfe_pct=float(mfe_pct),
                mae_pct=float(mae_pct),
                efficiency_pct=float(efficiency_pct),
            )
        )

    return pd.DataFrame(rows).sort_values("entry_ts").reset_index(drop=True)


# ---------- Periodiska avkastningar ----------

def periodical_returns_annual(
    equity: pd.Series,  # index=ts (UTC), värde = kapital (t.ex. 1.0 start)
    trades_df: pd.DataFrame,
    start_capital: float = 100_000.0,
) -> pd.DataFrame:
    """
    Årlig tabell: Net Profit ($), % Gain, Profit Factor, #Trades, % Profitable
    + en rad 'Last 12 Months' högst upp.
    """
    equity = equity.dropna()
    equity.index = _ensure_dt(equity.index)

    # --- "Last 12 Months" ---
    last_end = equity.index.max()
    last_start = last_end - pd.DateOffset(years=1)
    eq_l12 = equity[(equity.index > last_start)]
    if len(eq_l12) >= 2:
        l12_np = (eq_l12.iloc[-1] - eq_l12.iloc[0]) * start_capital
        l12_pg = (eq_l12.iloc[-1] / eq_l12.iloc[0] - 1.0) * 100.0
    else:
        l12_np = 0.0
        l12_pg = 0.0

    tr_l12 = trades_df[(trades_df["exit_ts"] > last_start)]
    l12_pf = _profit_factor(tr_l12["pnl_pct"]) if len(tr_l12) else 0.0
    l12_n  = int(len(tr_l12))
    l12_pp = float((tr_l12["pnl_pct"] > 0).mean() * 100.0) if len(tr_l12) else 0.0

    rows = [dict(Period="Last 12 Months", Net_Profit=l12_np, Perc_Gain=l12_pg,
                 Profit_Factor=l12_pf, Trades=l12_n, Perc_Profitable=l12_pp)]

    # --- per år ---
    for (ys, ye) in _yearly_slices(equity.index):
        eq = equity[(equity.index >= ys) & (equity.index < ye)]
        if len(eq) < 2:
            continue
        net_profit = (eq.iloc[-1] - eq.iloc[0]) * start_capital
        perc_gain  = (eq.iloc[-1] / eq.iloc[0] - 1.0) * 100.0

        tr = trades_df[(trades_df["exit_ts"] >= ys) & (trades_df["exit_ts"] < ye)]
        pf = _profit_factor(tr["pnl_pct"]) if len(tr) else 0.0
        n  = int(len(tr))
        pp = float((tr["pnl_pct"] > 0).mean() * 100.0) if len(tr) else 0.0

        rows.append(dict(
            Period=str(ys.date()), Net_Profit=net_profit, Perc_Gain=perc_gain,
            Profit_Factor=pf, Trades=n, Perc_Profitable=pp
        ))

    out = pd.DataFrame(rows)
    # samma kolumnnamn som i dina skärmdumpar
    out.rename(columns={
        "Net_Profit": "Net Profit",
        "Perc_Gain": "% Gain",
        "Profit_Factor": "Profit Factor",
        "Trades": "# Trades",
        "Perc_Profitable": "% Profitable",
    }, inplace=True)
    return out


def periodical_returns_rolling(
    equity: pd.Series,
    trades_df: pd.DataFrame,
    window_years: int = 1,
    start_capital: float = 100_000.0,
) -> pd.DataFrame:
    """
    En “Rolling Period Analysis” med års-fönster för stora brytdatum (1 jan).
    """
    equity = equity.dropna()
    equity.index = _ensure_dt(equity.index)
    if equity.empty:
        return pd.DataFrame(columns=["Period","Net Profit","% Gain","Profit Factor","# Trades","% Profitable"])

    first_year = int(equity.index.min().year)
    last_year  = int(equity.index.max().year)

    rows = []
    for y in range(first_year, last_year + 1):
        start = pd.Timestamp(year=y, month=1, day=1, tz="UTC")
        end   = start + pd.DateOffset(years=window_years)
        eq = equity[(equity.index >= start) & (equity.index < end)]
        if len(eq) < 2:
            continue
        net_profit = (eq.iloc[-1] - eq.iloc[0]) * start_capital
        perc_gain  = (eq.iloc[-1] / eq.iloc[0] - 1.0) * 100.0

        tr = trades_df[(trades_df["exit_ts"] >= start) & (trades_df["exit_ts"] < end)]
        pf = _profit_factor(tr["pnl_pct"]) if len(tr) else 0.0
        n  = int(len(tr))
        pp = float((tr["pnl_pct"] > 0).mean() * 100.0) if len(tr) else 0.0

        period_lbl = f"{start.date()} - {min(end, equity.index.max()).date()}"
        rows.append(dict(
            Period=period_lbl, **{
                "Net Profit": net_profit, "% Gain": perc_gain,
                "Profit Factor": pf, "# Trades": n, "% Profitable": pp
            }
        ))

    return pd.DataFrame(rows)


# ---------- Performance-summering & “Trade Analysis” ----------

def performance_summary(equity: pd.Series, trades_df: pd.DataFrame) -> dict:
    equity = equity.dropna().astype(float)
    if len(equity) < 2:
        return dict(
            Total_Net_Profit=0.0, Gross_Profit=0.0, Gross_Loss=0.0, Profit_Factor=0.0,
            Num_Trades=0, Perc_Profitable=0.0, Avg_Trade=0.0, Sharpe=0.0
        )
    rets = equity.pct_change().dropna()
    gross_profit = float(trades_df.loc[trades_df["pnl_pct"] > 0, "pnl_pct"].sum())
    gross_loss   = float(-trades_df.loc[trades_df["pnl_pct"] < 0, "pnl_pct"].sum())
    pf = (gross_profit / gross_loss) if gross_loss > 0 else np.inf if gross_profit > 0 else 0.0
    total_net = float((equity.iloc[-1] - equity.iloc[0]) / equity.iloc[0])

    return dict(
        Total_Net_Profit=total_net,
        Gross_Profit=gross_profit,
        Gross_Loss=-gross_loss,
        Profit_Factor=float(pf),
        Num_Trades=int(len(trades_df)),
        Perc_Profitable=float((trades_df["pnl_pct"] > 0).mean() * 100.0) if len(trades_df) else 0.0,
        Avg_Trade=float(trades_df["pnl_pct"].mean()) if len(trades_df) else 0.0,
        Sharpe=float(rets.mean() / (rets.std() + 1e-12) * np.sqrt(len(rets))),
    )


def trade_analysis(trades_df: pd.DataFrame) -> dict:
    """
    “Trade Analysis” i enklare form: medel & std för vinnare/förlorare,
    run-up/drawdown (MFE/MAE) och lite tidsdata.
    """
    if trades_df.empty:
        return dict(
            Total_Trades=0, Winners=0, Losers=0,
            Avg_Trade_Net_Profit=0.0,
            Avg_Winner=0.0, Avg_Loser=0.0,
            Std_Trade=0.0,
            Avg_Runup=0.0, Avg_Drawdown=0.0,
            Avg_Bars_Held=0.0
        )
    winners = trades_df[trades_df["pnl_pct"] > 0]
    losers  = trades_df[trades_df["pnl_pct"] <= 0]
    return dict(
        Total_Trades=int(len(trades_df)),
        Winners=int(len(winners)),
        Losers=int(len(losers)),
        Avg_Trade_Net_Profit=float(trades_df["pnl_pct"].mean()),
        Avg_Winner=float(winners["pnl_pct"].mean()) if len(winners) else 0.0,
        Avg_Loser=float(losers["pnl_pct"].mean()) if len(losers) else 0.0,
        Std_Trade=float(trades_df["pnl_pct"].std() or 0.0),
        Avg_Runup=float(trades_df["mfe_pct"].mean() if "mfe_pct" in trades_df else 0.0),
        Avg_Drawdown=float(trades_df["mae_pct"].mean() if "mae_pct" in trades_df else 0.0),
        Avg_Bars_Held=float(trades_df["bars_held"].mean() if "bars_held" in trades_df else 0.0),
    )


# ---------- Figurer ----------

def plot_equity(equity: pd.Series, out_png: Path) -> None:
    equity = equity.dropna()
    plt.figure(figsize=(12, 4))
    plt.plot(equity.index, equity.values)
    plt.title("Equity Curve")
    plt.xlabel("Tid")
    plt.ylabel("Kapital (indexerad)")
    plt.tight_layout()
    out_png.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_png, dpi=140)
    plt.close()


def plot_efficiency(trades_df: pd.DataFrame, out_png: Path) -> None:
    if trades_df.empty or "efficiency_pct" not in trades_df:
        return
    plt.figure(figsize=(12, 4))
    plt.scatter(range(1, len(trades_df) + 1), trades_df["efficiency_pct"].values, s=12)
    plt.axhline(0.0, linestyle="--", linewidth=0.8)
    plt.title("Total Efficiency per Trade")
    plt.xlabel("Trade Number")
    plt.ylabel("Efficiency (%)")
    plt.tight_layout()
    out_png.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_png, dpi=140)
    plt.close()


# ---------- Huvud: bygg en komplett rapportmapp ----------

def write_full_report(
    bars: pd.DataFrame,
    equity_df: pd.DataFrame,
    trades: list,
    symbol: str,
    run_dir: Path,
    start_capital: float = 100_000.0,
) -> dict:
    """
    Skapar:
      - trades.csv
      - equity.csv
      - performance_summary.json
      - trade_analysis.json
      - periodical_annual.csv
      - periodical_rolling.csv
      - plots/equity.png
      - plots/efficiency.png
    Returnerar en liten sammanfattnings-dict.
    """
    run_dir.mkdir(parents=True, exist_ok=True)
    plots_dir = run_dir / "plots"
    plots_dir.mkdir(exist_ok=True)

    # data
    equity = equity_df.set_index(pd.to_datetime(equity_df["ts"], utc=True))["equity"].astype(float)
    trades_df = trades_to_frame(bars, trades)

    # tabeller
    annual   = periodical_returns_annual(equity, trades_df, start_capital)
    rolling  = periodical_returns_rolling(equity, trades_df, window_years=1, start_capital=start_capital)

    # summeringar
    perf = performance_summary(equity, trades_df)
    ta   = trade_analysis(trades_df)

    # skriv
    equity_df.to_csv(run_dir / "equity.csv", index=False)
    trades_df.to_csv(run_dir / "trades.csv", index=False)
    annual.to_csv(run_dir / "periodical_annual.csv", index=False)
    rolling.to_csv(run_dir / "periodical_rolling.csv", index=False)
    (run_dir / "performance_summary.json").write_text(json.dumps(perf, indent=2))
    (run_dir / "trade_analysis.json").write_text(json.dumps(ta, indent=2))

    # figurer
    plot_equity(equity, plots_dir / "equity.png")
    plot_efficiency(trades_df, plots_dir / "efficiency.png")

    return dict(
        symbol=symbol,
        run_dir=str(run_dir),
        n_trades=int(len(trades_df)),
        last_equity=float(equity.iloc[-1]) if len(equity) else 1.0,
        profit_factor=float(perf.get("Profit_Factor", 0.0)),
    )

