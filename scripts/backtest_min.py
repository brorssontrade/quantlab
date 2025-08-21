# scripts/backtest_min.py
import argparse
import json
import sys, pathlib
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta

import duckdb
import numpy as np
import pandas as pd

# gör sys.path säker även vid filkörning (python -m scripts.backtest_min)
sys.path.insert(0, str(pathlib.Path(__file__).resolve()).rsplit("\\scripts\\", 1)[0])
from engine.features import add_common

REPORTS_DIR = pathlib.Path("reports")
PARQUET_GLOB = "./storage/parquet/raw_1h/**"
BARS_PER_DAY = 7
DAYS_PER_YEAR = 252
BARS_PER_YEAR = BARS_PER_DAY * DAYS_PER_YEAR


def load_bars(db_path: str, symbol: str, days: int) -> pd.DataFrame:
    """Läs direkt från partitionerad Parquet via DuckDB och parametrisera med tidsstämplar."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    con = duckdb.connect(database=":memory:")
    q = """
        SELECT ts, open, high, low, close, volume
        FROM read_parquet($parquet)
        WHERE symbol = $sym AND ts >= $since
        ORDER BY ts
    """
    df = con.execute(q, {"parquet": PARQUET_GLOB, "sym": symbol, "since": since}).df()
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    return df


# ----------------- strategier -----------------

def simple_entry(df: pd.DataFrame) -> pd.DataFrame:
    """
    Enkel demo: andra timmen + EMA(fast) > EMA(slow) + RSI>55.
    Agera på NÄSTA bars open (delay).
    """
    out = df.copy()

    out["enter"] = (
        out["second_hour"].fillna(False).astype(bool)
        & (out["ema_fast"] > out["ema_slow"])
        & (out["rsi"] > 55)
    )
    out["exit_sig"] = (out["ema_fast"] < out["ema_slow"])

    # säkerställ bool-typer först
    out["enter"]    = out["enter"].astype("boolean")
    out["exit_sig"] = out["exit_sig"].astype("boolean")

    # agera på NÄSTA bars open (delay), och gjut till Python-bool
    out["enter_at"] = out["enter"].shift(1).fillna(False).astype(bool)
    out["exit_at"]  = out["exit_sig"].shift(1).fillna(False).astype(bool)
    # ATR till nästa bar används för SL/TP
    out["atr14_prev"] = out.get("atr14", np.nan).shift(1)
    return out


def baseline_entry(
    df: pd.DataFrame,
    adx_min: float = 20.0,
    rsi2_max: float = 10.0,
    rsi14_exit: float = 60.0,
    use_second_hour: bool = False,
    debug: bool = False,
) -> pd.DataFrame:
    """
    Entry:  (optional) second_hour AND ema_12 > ema_26 AND adx14 > adx_min AND rsi2 < rsi2_max
    Exit:   rsi14 > rsi14_exit OR close < ema_26
    Delay:  agera på NÄSTA bars open. SL/TP i backtest-loopen.
    """
    out = df.copy()

    # säkra nödvändiga kolumner
    need = ["ema_12", "ema_26", "adx14", "rsi2", "rsi14", "atr14", "close", "second_hour"]
    for c in need:
        if c not in out.columns:
            out[c] = np.nan if c != "second_hour" else False

    cond1 = (out["ema_12"] > out["ema_26"])
    cond2 = (out["adx14"] > adx_min)
    cond3 = (out["rsi2"]  < rsi2_max)
    cond4 = out["second_hour"].fillna(False).astype(bool)

    entry_core = cond1 & cond2 & cond3
    entry_all  = (cond4 & entry_core) if use_second_hour else entry_core

    out["enter"]    = entry_all
    out["exit_sig"] = (out["rsi14"] > rsi14_exit) | (out["close"] < out["ema_26"])

    out["enter"]    = out["enter"].astype("boolean")
    out["exit_sig"] = out["exit_sig"].astype("boolean")
    out["enter_at"] = out["enter"].shift(1).fillna(False).astype(bool)
    out["exit_at"]  = out["exit_sig"].shift(1).fillna(False).astype(bool)

    out["atr14_prev"] = out["atr14"].shift(1)

    if debug:
        print(
            "[baseline debug]",
            "cond1 ema12>ema26:", int(cond1.fillna(False).sum()),
            "cond2 adx>", adx_min, ":", int(cond2.fillna(False).sum()),
            "cond3 rsi2<", rsi2_max, ":", int(cond3.fillna(False).sum()),
            "second_hour:", int(cond4.sum()),
            "enter_at:", int(out["enter_at"].sum()),
        )
    return out


# ----------------- backtest med intra-bar SL/TP -----------------

@dataclass
class Trade:
    entry_ts: pd.Timestamp
    entry_px: float
    exit_ts: pd.Timestamp
    exit_px: float


def run_backtest(
    df: pd.DataFrame,
    strategy: str,
    sl_atr: float,
    tp_atr: float,
    fee_bps: float,
    adx_min: float = 20.0,
    rsi2_max: float = 10.0,
    rsi14_exit: float = 60.0,
    use_second_hour: bool = False,
    debug: bool = False,
) -> tuple[pd.DataFrame, list[Trade]]:
    if strategy == "simple":
        sig = simple_entry(df)
    else:
        sig = baseline_entry(
            df,
            adx_min=adx_min,
            rsi2_max=rsi2_max,
            rsi14_exit=rsi14_exit,
            use_second_hour=use_second_hour,
            debug=debug,
        )

    # Säkerställ kolumner
    for c in ["open", "high", "low", "close", "ts", "enter_at", "exit_at", "atr14_prev"]:
        if c not in sig.columns:
            raise ValueError(f"Saknar kolumn: {c}")

    ts = sig["ts"].to_list()
    o = sig["open"].to_numpy(float)
    h = sig["high"].to_numpy(float)
    l = sig["low"].to_numpy(float)
    c = sig["close"].to_numpy(float)
    enter_at = sig["enter_at"].to_numpy(bool)
    exit_at  = sig["exit_at"].to_numpy(bool)
    atrp = sig["atr14_prev"].to_numpy(float)

    fee = float(fee_bps)
    capital = 1.0
    in_pos = False
    entry_px = np.nan
    sl = np.nan
    tp = np.nan
    trades: list[Trade] = []
    equity = np.empty(len(sig), dtype=float)

    for i in range(len(sig)):
        # mark-to-market
        equity[i] = capital if not in_pos else capital * (c[i] / entry_px)

        # 1) Exit vid OPEN
        if in_pos and exit_at[i]:
            exit_px = o[i]
            capital *= exit_px / entry_px
            capital *= (1.0 - fee)
            trades.append(Trade(ts[i], entry_px, ts[i], exit_px))
            in_pos = False
            entry_px = sl = tp = np.nan
            equity[i] = capital
            continue

        # 2) Intrabar SL/TP
        if in_pos:
            hit_sl = l[i] <= sl if np.isfinite(sl) else False
            hit_tp = h[i] >= tp if np.isfinite(tp) else False
            exit_px = sl if hit_sl else (tp if hit_tp else None)
            if exit_px is not None:
                capital *= exit_px / entry_px
                capital *= (1.0 - fee)
                trades.append(Trade(ts[i], entry_px, ts[i], exit_px))
                in_pos = False
                entry_px = sl = tp = np.nan
                equity[i] = capital
                continue

        # 3) Entry vid OPEN
        if (not in_pos) and enter_at[i] and np.isfinite(atrp[i]):
            entry_px = o[i]
            capital *= (1.0 - fee)
            sl = entry_px - sl_atr * atrp[i]
            tp = entry_px + tp_atr * atrp[i]
            in_pos = True
            equity[i] = capital * (c[i] / entry_px)

    # stäng ev. kvarvarande trade på sista close
    if in_pos:
        capital *= c[-1] / entry_px
        capital *= (1.0 - fee)
        trades.append(Trade(ts[-1], entry_px, ts[-1], c[-1]))
        equity[-1] = capital

    eq = pd.DataFrame({"ts": sig["ts"], "equity": equity})
    return eq, trades


# ----------------- KPI-beräkningar & IO -----------------

def max_drawdown(series: pd.Series) -> float:
    run_max = series.cummax()
    dd = series / run_max - 1.0
    return float(dd.min()) if len(dd) else 0.0

def sortino_from_returns(ret: pd.Series) -> float:
    if ret is None or ret.empty:
        return 0.0
    neg = ret[ret < 0]
    dd = neg.std(ddof=1)
    return float((ret.mean() * np.sqrt(BARS_PER_YEAR) / dd)) if (dd and dd > 0) else 0.0

def kpis_from_equity(eq: pd.DataFrame) -> dict:
    if eq.empty:
        return {"CAGR": 0.0, "Sharpe": 0.0, "Sortino": 0.0, "MaxDD": 0.0, "HitRate": 0.0, "Trades": 0}

    eq = eq.dropna()
    ret = eq["equity"].pct_change().dropna()
    mu = ret.mean()
    sd = ret.std(ddof=1)
    sharpe  = (mu * np.sqrt(BARS_PER_YEAR) / sd) if sd and sd > 0 else 0.0
    sortino = sortino_from_returns(ret)

    t0 = eq["ts"].iloc[0]; t1 = eq["ts"].iloc[-1]
    years = max((t1 - t0).total_seconds() / (365.25 * 24 * 3600), 1e-9)
    cagr = eq["equity"].iloc[-1] ** (1 / years) - 1
    mdd  = max_drawdown(eq["equity"])

    return {"CAGR": float(cagr), "Sharpe": float(sharpe), "Sortino": float(sortino), "MaxDD": float(mdd)}

def _safe_float(x, default=0.0):
    try:
        if x is None:
            return default
        xf = float(x)
        if np.isnan(xf) or np.isinf(xf):
            return default
        return xf
    except Exception:
        return default

def write_reports(symbol: str, eq: pd.DataFrame, trades: list[Trade], kpi: dict):
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    eq_out = REPORTS_DIR / f"{symbol}_equity.csv"
    tr_out = REPORTS_DIR / f"{symbol}_trades.csv"
    m_out  = REPORTS_DIR / f"{symbol}_metrics.json"

    eq.to_csv(eq_out, index=False)

    if trades:
        tdf = pd.DataFrame([{
            "entry_ts": t.entry_ts, "entry_px": _safe_float(t.entry_px),
            "exit_ts":  t.exit_ts,  "exit_px":  _safe_float(t.exit_px),
            "ret": _safe_float(t.exit_px / t.entry_px - 1.0)
        } for t in trades])
    else:
        tdf = pd.DataFrame(columns=["entry_ts", "entry_px", "exit_ts", "exit_px", "ret"])
    tdf.to_csv(tr_out, index=False)

    # --- extra PnL-statistik & hitrate ---
    if len(tdf):
        hit = float((tdf["ret"] > 0).mean())
        pnl_mean   = _safe_float(tdf["ret"].mean())
        pnl_median = _safe_float(tdf["ret"].median())
        pnl_std    = _safe_float(tdf["ret"].std(ddof=1)) if len(tdf) > 1 else 0.0
        pnl_q25    = _safe_float(tdf["ret"].quantile(0.25))
        pnl_q75    = _safe_float(tdf["ret"].quantile(0.75))
        avg_win    = _safe_float(tdf.loc[tdf["ret"] > 0, "ret"].mean()) if (tdf["ret"] > 0).any() else 0.0
        avg_los    = _safe_float(tdf.loc[tdf["ret"] <= 0, "ret"].mean()) if (tdf["ret"] <= 0).any() else 0.0
        expectancy = _safe_float(hit * avg_win + (1.0 - hit) * avg_los)
    else:
        hit = 0.0; pnl_mean = pnl_median = pnl_std = pnl_q25 = pnl_q75 = avg_win = avg_los = expectancy = 0.0

    kpi = dict(kpi)
    kpi["Trades"]     = int(len(trades))
    kpi["HitRate"]    = hit
    kpi["PnL_mean"]   = pnl_mean
    kpi["PnL_median"] = pnl_median
    kpi["PnL_std"]    = pnl_std
    kpi["PnL_q25"]    = pnl_q25
    kpi["PnL_q75"]    = pnl_q75
    kpi["AvgWin"]     = avg_win
    kpi["AvgLoss"]    = avg_los
    kpi["Expectancy"] = expectancy

    # json utan NaN/np.float64
    kpi_clean = {k: _safe_float(v) if isinstance(v, (int, float, np.floating)) else v for k, v in kpi.items()}

    with open(m_out, "w", encoding="utf-8") as f:
        json.dump(kpi_clean, f, ensure_ascii=False, allow_nan=False)

    show = {k: kpi_clean[k] for k in ["CAGR","Sharpe","Sortino","MaxDD","Trades","HitRate"] if k in kpi_clean}
    print("RESULTAT:", show)
    print(f"Sparade: {eq_out}, {tr_out}, {m_out}")

# ----------------- CLI -----------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", required=True)
    ap.add_argument("--days", type=int, default=180)
    ap.add_argument("--db", default="./db/quant.duckdb")  # kvar för symmetri
    ap.add_argument("--strategy", choices=["simple", "baseline"], default="baseline")

    # baseline-parametrar
    ap.add_argument("--adx_min", type=float, default=20.0)
    ap.add_argument("--rsi2_max", type=float, default=10.0)
    ap.add_argument("--rsi14_exit", type=float, default=60.0)
    ap.add_argument("--use_second_hour", action="store_true")
    ap.add_argument("--debug", action="store_true")

    # risk/avgifter
    ap.add_argument("--sl_atr", type=float, default=1.5, help="SL = sl_atr * ATR14 (föregående bar)")
    ap.add_argument("--tp_atr", type=float, default=2.5, help="TP = tp_atr * ATR14 (föregående bar)")
    ap.add_argument("--fee_bps", type=float, default=0.0005, help="avgift per sida (0.0005 = 5 bps)")
    args = ap.parse_args()

    bars = load_bars(args.db, args.symbol, args.days)
    if bars.empty:
        print("Inga barer att backtesta.")
        return

    # bygg alla features
    feats = add_common(bars)

    # kör backtest med vald strategi
    eq, trades = run_backtest(
        feats,
        strategy=args.strategy,
        sl_atr=args.sl_atr,
        tp_atr=args.tp_atr,
        fee_bps=args.fee_bps,
        adx_min=args.adx_min,
        rsi2_max=args.rsi2_max,
        rsi14_exit=args.rsi14_exit,
        use_second_hour=args.use_second_hour,
        debug=args.debug,
    )
    kpi = kpis_from_equity(eq)
    write_reports(args.symbol, eq, trades, kpi)


if __name__ == "__main__":
    main()
