# src/quantkit/reporting/ts_report.py
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Any
import io, base64
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from quantkit.backtest.evaluate import perf_stats

@dataclass
class TradeLike:
    entry_ts: pd.Timestamp
    exit_ts: pd.Timestamp
    entry_px: float
    exit_px: float
    reason: str
    bars_held: int

# --- lägg till dessa helpers nära toppen (efter imports) ---

def _drawdown(equity: pd.Series) -> pd.Series:
    eq = equity.dropna().astype(float)
    if eq.empty: 
        return pd.Series(dtype=float)
    peak = eq.cummax()
    dd = (eq / peak) - 1.0
    dd.name = "Drawdown"
    return dd

def _rolling_sharpe(equity: pd.Series, window: int = 63) -> pd.Series:
    # approx – oavsett frekvens
    eq = equity.dropna().astype(float)
    rets = eq.pct_change().dropna()
    if len(rets) < 2:
        return pd.Series(dtype=float, name="RollingSharpe")
    rs = (rets.rolling(window).mean() / (rets.rolling(window).std() + 1e-12)) * (len(rets) ** 0.5 / (window ** 0.5))
    rs.name = "RollingSharpe"
    return rs

def plot_drawdown(equity: pd.Series, title: str) -> str:
    dd = _drawdown(equity)
    fig, ax = plt.subplots(figsize=(10,3))
    if len(dd):
        ax.fill_between(dd.index, dd.values*100.0, 0, step="pre", alpha=0.35)
    ax.set_title(title); ax.set_ylabel("Drawdown (%)"); ax.grid(True, alpha=0.25)
    return _b64_png(fig)

def plot_rolling_sharpe(equity: pd.Series, title: str, window: int = 63) -> str:
    rs = _rolling_sharpe(equity, window=window)
    fig, ax = plt.subplots(figsize=(10,3))
    if len(rs):
        ax.plot(rs.index, rs.values)
    ax.set_title(title); ax.set_ylabel("Sharpe (rolling)"); ax.grid(True, alpha=0.25)
    return _b64_png(fig)

def plot_trade_hist(trades: pd.DataFrame, title: str) -> str:
    fig, ax = plt.subplots(figsize=(10,3))
    if len(trades):
        ax.hist(trades["pnl"].astype(float), bins=30)
    ax.set_title(title); ax.set_xlabel("Trade PnL"); ax.set_ylabel("Count"); ax.grid(True, alpha=0.25)
    return _b64_png(fig)


# ---------- hjälp ----------
def _b64_png(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=140)
    plt.close(fig)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

def _money(x: float) -> str:
    return f"${x:,.0f}" if np.isfinite(x) else "$0"

def _pct(x: float) -> str:
    return f"{x*100:.2f}%"

def _is_dict(x: Any) -> bool:
    return isinstance(x, dict)

def _get(t: Any, key: str, default: Any = None) -> Any:
    """Säker hämtning oavsett om t är dataclass/objekt eller dict."""
    if _is_dict(t):
        return t.get(key, default)
    return getattr(t, key, default)

def _bar_at_or_before(bars: pd.DataFrame, ts: pd.Timestamp) -> pd.Series:
    """Returnera baren vid ts, annars närmast innan (fallback)."""
    try:
        return bars.loc[ts]
    except KeyError:
        i = bars.index.searchsorted(ts, side="right") - 1
        i = max(0, min(i, len(bars) - 1))
        return bars.iloc[i]

# ---------- trade-deriverade tabeller ----------
# ... (imports och övrigt som du har) ...

def make_trade_df(bars: pd.DataFrame, trades: Iterable[TradeLike], qty: float = 1.0) -> pd.DataFrame:
    if not isinstance(bars.index, pd.DatetimeIndex):
        bars = bars.set_index(pd.to_datetime(bars["ts"]))

    def _get(obj, key: str, default=None):
        # Klarar dataclass/objekt/dict
        if isinstance(obj, dict):
            return obj.get(key, default)
        if hasattr(obj, key):
            return getattr(obj, key)
        return default

    rows = []
    for t in trades:
        entry_ts = pd.Timestamp(_get(t, "entry_ts"))
        exit_ts  = pd.Timestamp(_get(t, "exit_ts"))
        entry_px = float(_get(t, "entry_px", 0.0))
        exit_px  = float(_get(t, "exit_px", 0.0))
        reason   = str(_get(t, "reason", "Exit"))
        bars_held= int(_get(t, "bars_held", 0))

        span = bars.loc[entry_ts: exit_ts]
        high = float(span["high"].max()) if len(span) else entry_px
        low  = float(span["low"].min()) if len(span) else entry_px
        mfe = (high / entry_px) - 1.0
        mae = (low / entry_px) - 1.0
        ret = (exit_px / entry_px) - 1.0 if entry_px > 0 else 0.0
        pnl = ret * qty * entry_px

        ebar = bars.loc[entry_ts] if entry_ts in bars.index else bars.iloc[0]
        xbar = bars.loc[exit_ts]  if exit_ts  in bars.index else bars.iloc[-1]
        e_rng = (float(ebar["high"]) - float(ebar["low"])) or float("nan")
        x_rng = (float(xbar["high"]) - float(xbar["low"])) or float("nan")
        entry_eff = (entry_px - float(ebar["low"])) / (e_rng + 1e-12)
        exit_eff  = (exit_px  - float(xbar["low"])) / (x_rng + 1e-12)

        # total efficiency approx
        if ret >= 0 and mfe > 0:
            eff = ret / mfe
        elif ret < 0 and mae < 0:
            eff = ret / mae
        else:
            eff = 0.0

        rows.append(dict(
            entry_ts=entry_ts, exit_ts=exit_ts, entry_px=entry_px, exit_px=exit_px,
            reason=reason, bars_held=bars_held, ret=float(ret), pnl=float(pnl),
            mfe=float(mfe), mae=float(mae), efficiency=float(eff),
            entry_eff=float(entry_eff), exit_eff=float(exit_eff),
        ))

    df = pd.DataFrame(rows)
    if not len(df):
        return pd.DataFrame(columns=[
            "entry_ts","exit_ts","entry_px","exit_px","reason","bars_held",
            "ret","pnl","mfe","mae","efficiency","entry_eff","exit_eff"
        ])
    return df.sort_values("entry_ts").reset_index(drop=True)


def performance_summary(trades: pd.DataFrame, equity: pd.Series,
                        commission_total: float = 0.0,
                        bps_fees_total: float = 0.0,
                        slippage_total: float = 0.0) -> dict:
    gp = float(trades.loc[trades["pnl"] > 0, "pnl"].sum())
    gl = float(trades.loc[trades["pnl"] < 0, "pnl"].sum())
    total = gp + gl
    pf = (gp / abs(gl)) if gl < 0 else (np.inf if gp > 0 else 0.0)
    n = int(len(trades))
    win = int((trades["pnl"] > 0).sum()); lose = int((trades["pnl"] < 0).sum())
    pct_prof = (win / n) if n else 0.0
    largest_win = float(trades["pnl"].max()) if n else 0.0
    largest_lose = float(trades["pnl"].min()) if n else 0.0
    lw_pct_of_gp = (largest_win / gp) if gp > 0 else 0.0
    ll_pct_of_gl = (largest_lose / gl) if gl < 0 else 0.0
    ps = perf_stats(equity, rf=0.0, freq="D")
    return {
        "Total Net Profit": total,
        "Gross Profit": gp,
        "Gross Loss": gl,
        "Profit Factor": pf,
        "Total Number of Trades": n,
        "Percent Profitable": pct_prof,
        "Winning Trades": win,
        "Losing Trades": lose,
        "Largest Winning Trade": largest_win,
        "Largest Losing Trade": largest_lose,
        "Largest Winner as % of Gross Profit": lw_pct_of_gp,
        "Largest Loser as % of Gross Loss": ll_pct_of_gl,
        "Sharpe Ratio": ps["Sharpe"],
        "Sortino Ratio": ps["Sortino"],
        "Max Drawdown": ps["MaxDrawdown"],
        "CAGR": ps["CAGR"],
        "Volatility (ann.)": ps["Vol"],
        "Total Commission": commission_total,
        "Total BPS Fees": bps_fees_total,
        "Total Slippage": slippage_total,
    }

def trade_analysis(trades: pd.DataFrame) -> dict:
    if not len(trades): return {}
    winners = trades[trades["pnl"] > 0]; losers = trades[trades["pnl"] < 0]
    def _avg_std(s: pd.Series) -> tuple[float,float]:
        return float(s.mean()) if len(s) else 0.0, float(s.std(ddof=1)) if len(s) > 1 else 0.0
    avg_pnl, std_pnl = _avg_std(trades["pnl"])
    avg_win, std_win = _avg_std(winners["pnl"])
    avg_lose, std_lose = _avg_std(losers["pnl"])
    return {
        "Total Number of Trades": int(len(trades)),
        "Avg. Trade Net Profit": avg_pnl,
        "Avg. Winning Trade": avg_win,
        "Avg. Losing Trade": avg_lose,
        "Std. of Avg. Trade": std_pnl,
        "Coeff. of Variation": (std_pnl / (abs(avg_pnl) + 1e-12)),
        "Avg. Bars in Trades": float(trades["bars_held"].mean()),
    }

def periodical_returns(equity: pd.Series, trades: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Bygger års-tabell och en enkel "rolling" tabell.
    TÅL att trades är tomt.
    """
    eq = equity.dropna().sort_index()
    if eq.empty:
        empty = pd.DataFrame(columns=["Period","Net Profit","% Gain","Profit Factor","# Trades","% Profitable"])
        return empty, empty

    daily = eq.resample("D").last().ffill()
    yearly = daily.resample("YE").last()
    years = yearly.index.year.astype(int)
    years_list = list(years)
    yr_ret = yearly.pct_change().fillna(0.0)

    # Om trades saknas – bygg tabell med nollor men %Gain från equity
    if trades is None or trades.empty:
        tbl = pd.DataFrame({
            "Period": years.to_list(),
            "Net Profit": [0.0] * len(years),
            "% Gain": yr_ret.values,
            "Profit Factor": [0.0] * len(years),
            "# Trades": [0] * len(years),
            "% Profitable": [0.0] * len(years),
        })
        # Rolling: kumulativ %Gain från equity, övrigt noll
        roll_rows = []
        start_val = float(yearly.iloc[0])
        for i, _y in enumerate(years_list):
            end_val = float(yearly.iloc[i])
            ret = (end_val / start_val) - 1.0 if start_val > 0 else 0.0
            roll_rows.append(dict(
                Period=f"{years_list[0]}-01-01 - {_y}-01-01",
                **{"Net Profit": 0.0, "% Gain": ret, "Profit Factor": 0.0, "# Trades": 0, "% Profitable": 0.0}
            ))
        return tbl, pd.DataFrame(roll_rows)

    # Trades finns -> räkna per år
    t = trades.copy()
    t["year"] = pd.to_datetime(t["exit_ts"]).dt.year

    gp = t.groupby("year")["pnl"].apply(lambda s: float(s[s > 0].sum()))
    gl = t.groupby("year")["pnl"].apply(lambda s: float(s[s < 0].sum()))
    ntr = t.groupby("year")["pnl"].size()
    pctp = t.groupby("year")["pnl"].apply(lambda s: float((s > 0).mean()))
    pf = gp / (gl.abs().replace(0, np.nan))

    # Reindexa till alla år i equity
    gp = gp.reindex(years, fill_value=0.0)
    gl = gl.reindex(years, fill_value=0.0)
    ntr = ntr.reindex(years, fill_value=0).astype(int)
    pctp = pctp.reindex(years, fill_value=0.0)
    pf = pf.reindex(years, fill_value=np.nan).fillna(0.0)

    tbl = pd.DataFrame({
        "Period": years.to_list(),
        "Net Profit": (gp + gl).values,
        "% Gain": yr_ret.values,
        "Profit Factor": pf.values,
        "# Trades": ntr.values,
        "% Profitable": pctp.values,
    })

    # Rolling: från första året till år y
    roll_rows = []
    for i, y in enumerate(years):
        start_val = float(yearly.iloc[0]); end_val = float(yearly.iloc[i])
        ret = (end_val / start_val) - 1.0 if start_val > 0 else 0.0
        g = t[(t["year"] >= years_list[0]) & (t["year"] <= y)]
        gp_r = float(g.loc[g["pnl"] > 0, "pnl"].sum())
        gl_r = float(g.loc[g["pnl"] < 0, "pnl"].sum())
        pf_r = (gp_r / abs(gl_r)) if gl_r < 0 else (np.inf if gp_r > 0 else 0.0)
        roll_rows.append(dict(Period=f"{years_list[0]}-01-01 - {y}-01-01",
                              **{"Net Profit": gp_r + gl_r, "% Gain": ret,
                                 "Profit Factor": pf_r, "# Trades": int(len(g)),
                                 "% Profitable": float((g['pnl'] > 0).mean()) if len(g) else 0.0}))
    return tbl, pd.DataFrame(roll_rows)


# ---------- figurer ----------
def plot_equity(equity: pd.Series, title: str) -> str:
    fig, ax = plt.subplots(figsize=(10, 3))
    equity = equity.dropna()
    ax.plot(equity.index, equity.values)
    ax.set_title(title); ax.set_ylabel("Equity"); ax.grid(True, alpha=0.25)
    return _b64_png(fig)

def plot_equity_by_trade(equity: pd.Series, trades: pd.DataFrame, title: str) -> str:
    if not len(trades):
        fig, ax = plt.subplots(figsize=(10,3)); ax.plot([],[]); ax.set_title(title); return _b64_png(fig)
    eq_on_exit = equity.reindex(pd.to_datetime(trades["exit_ts"])).ffill()
    y = eq_on_exit.values; x = np.arange(1, len(y)+1)
    fig, ax = plt.subplots(figsize=(10,3))
    ax.plot(x, y); ax.scatter(x, y, s=12)
    ax.set_xlabel("Trade Number"); ax.set_ylabel("Equity"); ax.set_title(title); ax.grid(True, alpha=0.25)
    return _b64_png(fig)

def plot_efficiency(trades: pd.DataFrame, title: str) -> str:
    fig, ax = plt.subplots(figsize=(10,3))
    if len(trades):
        ax.scatter(np.arange(1, len(trades)+1), trades["efficiency"]*100.0, s=10)
        ax.axhline((trades["efficiency"].mean()*100.0), linestyle="--")
    ax.set_title(title); ax.set_xlabel("Trade #"); ax.set_ylabel("Efficiency (%)"); ax.grid(True, alpha=0.25)
    return _b64_png(fig)

# ---------- HTML ----------
def _df_html(df: pd.DataFrame) -> str:
    return df.to_html(index=False, border=0, classes="table", float_format=lambda x: f"{x:,.2f}")

def _format_summary(d: dict) -> pd.DataFrame:
    rows = []
    for k, v in d.items():
        if k in ("Total Commission","Total BPS Fees","Total Slippage"):
            rows.append({"Metric": k, "Value": _money(float(v))})
        elif "Percent" in k:
            rows.append({"Metric": k, "Value": _pct(float(v))})
        elif "Ratio" in k or "CAGR" in k or "Volatility" in k:
            rows.append({"Metric": k, "Value": f"{float(v):.2f}"})
        elif "Profit" in k or "Loss" in k or "Drawdown" in k or "Largest" in k:
            rows.append({"Metric": k, "Value": _money(float(v))})
        else:
            rows.append({"Metric": k, "Value": f"{float(v):,.2f}"})
    return pd.DataFrame(rows)

def _format_trade_list(trades: pd.DataFrame) -> pd.DataFrame:
    if not len(trades):
        return pd.DataFrame(columns=["#","Type","Date/Time","Signal","Price","Profit/Loss","% Profit","Run-up","Drawdown","Efficiency"])
    rows = []; cum_pnl = 0.0
    for i, r in trades.iterrows():
        rows.append({"#":int(i+1),"Type":"Buy","Date/Time":pd.to_datetime(r["entry_ts"]).strftime("%Y-%m-%d"),
                     "Signal":"Buy","Price":r["entry_px"],"Profit/Loss":"","% Profit":"","Run-up":"","Drawdown":"","Efficiency":""})
        cum_pnl += float(r["pnl"])
        rows.append({"#":"","Type":"Sell","Date/Time":pd.to_datetime(r["exit_ts"]).strftime("%Y-%m-%d"),
                     "Signal":r.get("reason","Exit"),"Price":r["exit_px"],"Profit/Loss":r["pnl"],
                     "% Profit":r["ret"]*100.0,"Run-up":r["mfe"]*100.0,"Drawdown":r["mae"]*100.0,"Efficiency":r["efficiency"]*100.0})
    df = pd.DataFrame(rows)
    for col in ["Price","Profit/Loss"]:
        df[col] = df[col].apply(lambda x: "" if x=="" else f"{x:,.2f}")
    for col in ["% Profit","Run-up","Drawdown","Efficiency"]:
        df[col] = df[col].apply(lambda x: "" if x=="" else f"{x:,.2f}%")
    return df

HTML_TEMPLATE = """<!doctype html>
<html lang="sv">
<head><meta charset="utf-8"><title>TS-lik rapport – {symbol} ({run_id})</title>
<style>
body {{ font-family: Segoe UI, Arial, sans-serif; margin:16px; color:#111 }}
h2 {{ margin-top: 28px; }}
.table {{ border-collapse: collapse; width:100%; font-size:13px }}
.table th, .table td {{ border-bottom:1px solid #ddd; padding:6px 8px; text-align:right }}
.table th:first-child, .table td:first-child {{ text-align:left }}
.grid {{ display:grid; grid-template-columns:1fr 1fr; gap:16px }}
.grid3 {{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px }}
.small {{ color:#555 }}
img {{ max-width:100% }}
</style>
</head>
<body>
<h1>TradeStation-lik rapport – {symbol} <span class="small">({run_id})</span></h1> 
{kpi_html}

<div class="grid">
  <div>
    <h2>Performance Summary</h2>
    {summary_html}
  </div>
  <div>
    <h2>Trade Analysis</h2>
    {ta_html}
  </div>
</div>

<h2>Mark-To-Market Period Analysis (Annual)</h2>
{period_html}

<h2>Mark-To-Market Rolling Period Analysis</h2>
{rolling_html}

<h2>Trade List</h2>
{tradelist_html}

<div class="grid">
  <div>
    <h2>Performance Graphs – Equity (Date)</h2>
    <img src="{equity_png}" alt="Equity curve"/>
  </div>
  <div>
    <h2>Performance Graphs – Equity (Trade #)</h2>
    <img src="{equity_trade_png}" alt="Equity vs trades"/>
  </div>
</div>

<div class="grid3">
  <div>
    <h2>Drawdown</h2>
    <img src="{dd_png}" alt="Drawdown"/>
  </div>
  <div>
    <h2>Rolling Sharpe</h2>
    <img src="{rs_png}" alt="Rolling Sharpe"/>
  </div>
  <div>
    <h2>Trade PnL Histogram</h2>
    <img src="{hist_png}" alt="Trade Histogram"/>
  </div>
</div>

<div class="grid">
  <div>
    <h2>Trade Graphs – Total Efficiency</h2>
    <img src="{eff_png}" alt="Efficiency scatter"/>
  </div>
  <div>
    <h2>Settings</h2>
    <table class="table">
    <tr><th>Key</th><th>Value</th></tr>
    <tr><td>Strategy</td><td>{strategy_name}</td></tr>
    <tr><td>Strategy Params</td><td>{strategy_params}</td></tr>
    <tr><td>Initial Capital</td><td>{init_capital}</td></tr>
    <tr><td>Commission</td><td>{commission_note}</td></tr>
    <tr><td>BPS Fees</td><td>{bps_note}</td></tr>
    <tr><td>Slippage</td><td>{slip_note}</td></tr>
    <tr><td>Timezone</td><td>{tz}</td></tr>
    <tr><td>Report Path</td><td>{out_dir}</td></tr>
    </table>
  </div>
</div>

<p class="small">Not: Effektivitets- och periodberäkningar är öppna approximationer för att efterlikna TradeStation.</p>
</body></html>
"""


def kpi_panel(summary: dict[str, float], trades: pd.DataFrame, equity: pd.Series) -> str:
    # Win rate i summary är redan ett tal 0..1
    win_rate = float(summary.get("Percent Profitable", 0.0))
    pf = float(summary.get("Profit Factor", 0.0))
    # Genomsnittlig trade i % från trade-df (fallback 0 om tomt)
    avg_trade = float(trades["ret"].mean()) if len(trades) else 0.0
    # MDD i % från equity (peak-relativ)
    mdd = float(_drawdown(equity).min()) if len(equity) else 0.0
    # CAGR: försök hämta; om inte finns, visa 0
    cagr = float(summary.get("CAGR", summary.get("CAGR %", 0.0)))

    def fmt_pct(x: float) -> str:
        return "–" if not np.isfinite(x) else f"{x*100:.2f}%"
    def fmt_num(x: float) -> str:
        return "–" if not np.isfinite(x) else f"{x:,.2f}"

    return f"""
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:12px 0;">
      <div><b>Win Rate</b><br>{fmt_pct(win_rate)}</div>
      <div><b>Profit Factor</b><br>{fmt_num(pf)}</div>
      <div><b>Avg Trade</b><br>{fmt_pct(avg_trade)}</div>
      <div><b>MDD</b><br>{fmt_pct(mdd)}</div>
      <div><b>CAGR</b><br>{fmt_pct(cagr)}</div>
    </div>"""


def build_report(bars: pd.DataFrame, equity: pd.Series, trades_like: Iterable[TradeLike | dict], *,
                 symbol: str, run_id: str, out_dir: Path, tz: str = "Europe/Stockholm",
                 commission_total: float = 0.0, bps_fees_total: float = 0.0, slippage_total: float = 0.0,
                 strategy_name: str = "", strategy_params: dict | None = None,
                 init_capital: float = 100_000.0) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    bars_idx = bars if isinstance(bars.index, pd.DatetimeIndex) else bars.set_index(pd.to_datetime(bars["ts"]))
    trades_df = make_trade_df(bars_idx, trades_like)
    trades_df.to_csv(out_dir / "trades.csv", index=False)
    summary = performance_summary(trades_df, equity, commission_total, bps_fees_total, slippage_total)
    kpi_html = kpi_panel(summary, trades_df, equity)
    ta = trade_analysis(trades_df)
    period_tbl, rolling_tbl = periodical_returns(equity, trades_df)
    eq_png = plot_equity(equity, title=f"Equity – {symbol}")
    eq_trade_png = plot_equity_by_trade(equity, trades_df, title="Equity vs Trade Number")
    eff_png = plot_efficiency(trades_df, title="Total Efficiency – per trade")





    # NYTT: drawdown/rolling sharpe/histogram
    dd_png = plot_drawdown(equity, title="Max to Min (peak-relative)")
    rs_png = plot_rolling_sharpe(equity, title="Rolling Sharpe (~63)")
    hist_png = plot_trade_hist(trades_df, title="Trade PnL Distribution")

    html = HTML_TEMPLATE.format(
        symbol=symbol, run_id=run_id, tz=tz, out_dir=str(out_dir.resolve()),
        strategy_name=strategy_name, strategy_params=str(strategy_params or {}),
        init_capital=_money(init_capital),
        commission_note=_money(commission_total),
        bps_note=_money(bps_fees_total),
        slip_note=_money(slippage_total),
        kpi_html=kpi_html,
        summary_html=_df_html(_format_summary(summary)),
        ta_html=_df_html(pd.DataFrame(list(ta.items()), columns=["Metric","Value"])),
        period_html=_df_html(period_tbl), rolling_html=_df_html(rolling_tbl),
        tradelist_html=_df_html(_format_trade_list(trades_df)),
        equity_png=eq_png, equity_trade_png=eq_trade_png, eff_png=eff_png,
        dd_png=dd_png, rs_png=rs_png, hist_png=hist_png,
    )

    out = out_dir / "report.html"
    out.write_text(html, encoding="utf-8")
    return out

