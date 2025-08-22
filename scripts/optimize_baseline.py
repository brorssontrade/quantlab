# scripts/optimize_baseline.py
import argparse
import json
import math
import sys, pathlib
import os
from datetime import datetime, timezone, timedelta

import numpy as np
import pandas as pd

# gör sys.path säker även vid filkörning (python -m scripts.optimize_baseline)
sys.path.insert(0, str(pathlib.Path(__file__).resolve()).rsplit("\\scripts\\", 1)[0])

from engine.features import add_common
from scripts.backtest_min import (
    load_bars,
    run_backtest,
    kpis_from_equity,
    REPORTS_DIR,
)

# ---- försök importera Optuna, annars None ----
try:
    import optuna
except Exception:
    optuna = None


# -------------------- utils --------------------

def to_json_safe(x):
    """Gör värden JSON/CSV-säkra: numpy→float/int, NaN→None."""
    if isinstance(x, (np.floating,)):
        v = float(x)
        return None if not math.isfinite(v) else v
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, float):
        return None if not math.isfinite(x) else x
    return x

def save_json_safe(path: pathlib.Path, data: dict):
    clean = {k: to_json_safe(v) for k, v in data.items()}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, allow_nan=False)

# --- extra: strikt casting till "rena" python-värden, NaN/inf -> default (0.0) ---
def _to_py(v, default=0.0):
    if v is None:
        return default
    try:
        f = float(v)
        if np.isnan(f) or np.isinf(f):
            return default
        return f
    except Exception:
        # bool/str ok
        return v


def split_walkforward_months(ts: pd.Series, train_m: int, test_m: int):
    """
    Skapa (train_start, train_end, test_start, test_end)-fönster i månader.
    Stegar framåt med test_m per fönster.
    """
    ts = pd.to_datetime(ts, utc=True).sort_values()
    if ts.empty:
        return []

    out = []
    first = ts.iloc[0]
    last = ts.iloc[-1]

    train_start = first
    while True:
        train_end = train_start + pd.DateOffset(months=train_m)
        test_start = train_end
        test_end = test_start + pd.DateOffset(months=test_m)

        if test_end > last:
            break

        out.append((train_start, train_end, test_start, test_end))
        # rulla vidare ett testfönster
        train_start = train_start + pd.DateOffset(months=test_m)

    return out


def eval_params_one_window(
    feats: pd.DataFrame,
    test_start: pd.Timestamp,
    test_end: pd.Timestamp,
    params: dict,
    fee_bps: float = 0.0005,
) -> tuple[pd.DataFrame, list]:
    """
    Kör backtest på enbart testfönstret (för att undvika carry-in).
    Vi förlitar oss på att 'feats' redan har indikatorer.
    """
    df_split = feats[(feats["ts"] >= test_start) & (feats["ts"] < test_end)].copy()
    if df_split.empty:
        return pd.DataFrame(columns=["ts", "equity"]), []

    eq, trades = run_backtest(
        df_split,
        strategy="baseline",
        sl_atr=float(params["sl_atr"]),
        tp_atr=float(params["tp_atr"]),
        fee_bps=float(fee_bps),
        adx_min=float(params["adx_min"]),
        rsi2_max=float(params["rsi2_max"]),
        rsi14_exit=float(params["rsi14_exit"]),
        use_second_hour=bool(params.get("use_second_hour", False)),
        debug=False,
    )
    return eq, trades


def aggregate_oos_metrics(
    eqs: list[pd.DataFrame],
    windows: list[tuple[pd.Timestamp, pd.Timestamp]],
    trades_lists: list[list]
) -> dict:
    """
    Bygger OOS-mått från testfönster.
    - Sharpe och Sortino via sammanslagna per-bar-returer (√N-skala)
    - CAGR geometriskt över total testtid
    - MaxDD på hopkedjad (rebasad) equity
    - Trades & HitRate från trades
    """
    if not eqs:
        return {"CAGR": 0.0, "Sharpe": 0.0, "Sortino": 0.0, "MaxDD": 0.0, "Trades": 0, "HitRate": 0.0}

    all_rets = []
    total_years = 0.0
    total_end_cap = 1.0
    dd_list = []

    trades_total = 0
    wins_total = 0

    for eq, (t_start, t_end), trades in zip(eqs, windows, trades_lists):
        if eq is None or eq.empty:
            continue

        eq = eq.dropna().reset_index(drop=True)
        base = float(eq["equity"].iloc[0])
        if not np.isfinite(base) or base <= 0:
            continue

        eq_rebased = eq["equity"] / base

        # per-bar returer
        rets = eq_rebased.pct_change().dropna()
        if not rets.empty:
            all_rets.append(rets)

        # kedja kapital
        end_cap = float(eq_rebased.iloc[-1])
        if np.isfinite(end_cap) and end_cap > 0:
            total_end_cap *= end_cap

        # år i fönstret
        years = max((t_end - t_start).total_seconds() / (365.25 * 24 * 3600), 1e-9)
        total_years += years

        # maxdd för fönstret
        run_max = eq_rebased.cummax()
        dd = (eq_rebased / run_max - 1.0).min()
        if np.isfinite(dd):
            dd_list.append(float(dd))

        # trades & hitrate
        if trades:
            trades_total += len(trades)
            for t in trades:
                try:
                    r = (t.exit_px / t.entry_px) - 1.0
                except Exception:
                    r = 0.0
                if r > 0:
                    wins_total += 1

    # Sharpe/Sortino på hopslagna returer (samma timeframe → √N-skala räcker)
    if not all_rets:
        sharpe = 0.0
        sortino = 0.0
    else:
        rets_all = pd.concat(all_rets, ignore_index=True)
        mu = float(rets_all.mean())
        sd = float(rets_all.std(ddof=1))
        sharpe = float((mu * np.sqrt(len(rets_all))) / sd) if (sd and sd > 0) else 0.0
        neg = rets_all[rets_all < 0]
        ddv = float(neg.std(ddof=1)) if len(neg) else 0.0
        sortino = float((mu * np.sqrt(len(rets_all))) / ddv) if ddv > 0 else 0.0

    cagr = float(total_end_cap ** (1.0 / total_years) - 1.0) if (total_years > 0 and total_end_cap > 0) else 0.0
    maxdd = float(min(dd_list)) if dd_list else 0.0
    hit   = float(wins_total / trades_total) if trades_total > 0 else 0.0

    return {
        "CAGR": cagr,
        "Sharpe": sharpe,
        "Sortino": sortino,
        "MaxDD": maxdd,
        "Trades": int(trades_total),
        "HitRate": hit
    }


def eval_params_oos(
    feats: pd.DataFrame,
    windows: list[tuple[pd.Timestamp, pd.Timestamp]],
    params: dict,
    purge_bars: int = 0,
    fee_bps: float = 0.0005,
):
    eqs = []
    trades_lists = []
    eff_windows = []

    ts = feats["ts"].reset_index(drop=True)

    for (train_start, train_end, test_start, test_end) in windows:
        # purge: skjut test_start framåt X bars
        test_mask = (ts >= test_start)
        if purge_bars > 0:
            # hitta index för första testbar och flytta fram
            idx = int(np.argmax(test_mask.values)) if test_mask.any() else None
            if idx is None or (idx == 0 and not test_mask.iloc[0]):
                continue
            idx_eff = min(idx + purge_bars, len(ts) - 1)
            test_start_eff = ts.iloc[idx_eff]
        else:
            test_start_eff = test_start

        eq, trades = eval_params_one_window(feats, test_start_eff, test_end, params, fee_bps=fee_bps)
        if eq is None or eq.empty:
            continue

        eqs.append(eq)
        trades_lists.append(trades)
        eff_windows.append((test_start_eff, test_end))

    return aggregate_oos_metrics(eqs, eff_windows, trades_lists)


# -------------------- objectives --------------------

def objective_factory(
    symbol: str,
    feats: pd.DataFrame,
    min_trades: int,
    mdd_floor: float,
    use_second_hour_opt: bool,
    wf_windows: list | None,
    purge_bars: int,
):
    """
    Om wf_windows är None -> in-sample (hela perioden).
    Annars -> walk-forward på windows.
    """
    def obj(trial):
        adx_min     = trial.suggest_float("adx_min", 10.0, 30.0)
        rsi2_max    = trial.suggest_float("rsi2_max", 5.0, 25.0)
        rsi14_exit  = trial.suggest_float("rsi14_exit", 50.0, 70.0)
        sl_atr      = trial.suggest_float("sl_atr", 0.8, 2.5)
        tp_atr      = trial.suggest_float("tp_atr", 1.2, 4.0)
        use2h       = trial.suggest_categorical("use_second_hour", [True, False]) if use_second_hour_opt else False

        params = dict(
            adx_min=adx_min,
            rsi2_max=rsi2_max,
            rsi14_exit=rsi14_exit,
            sl_atr=sl_atr,
            tp_atr=tp_atr,
            use_second_hour=use2h,
        )

        if wf_windows:
            kpi = eval_params_oos(feats, wf_windows, params, purge_bars=purge_bars)
        else:
            eq, trades = run_backtest(
                feats, "baseline",
                sl_atr=sl_atr, tp_atr=tp_atr, fee_bps=0.0005,
                adx_min=adx_min, rsi2_max=rsi2_max, rsi14_exit=rsi14_exit,
                use_second_hour=use2h, debug=False
            )
            kpi = kpis_from_equity(eq)  # förväntas innehålla Sortino
            # trades/hitrate även IS
            if trades:
                rets = [(t.exit_px / t.entry_px) - 1.0 for t in trades]
                hit = float(np.mean([r > 0 for r in rets])) if len(rets) else 0.0
                kpi["Trades"] = int(len(trades))
                kpi["HitRate"] = hit
            else:
                kpi["Trades"] = 0
                kpi["HitRate"] = 0.0

        trades_n = int(kpi.get("Trades", 0))
        mdd = float(kpi.get("MaxDD", 0.0))
        sharpe = float(kpi.get("Sharpe", 0.0))

        # min affärer?
        if trades_n < min_trades:
            val = -10.0 + (trades_n * 0.1)
        else:
            penalty = 0.0
            if mdd < mdd_floor:
                penalty -= (abs(mdd) - abs(mdd_floor)) * 2.0
            val = sharpe + penalty

        # spara lite nyckeltal i trial
        trial.set_user_attr("Trades", trades_n)
        trial.set_user_attr("CAGR", float(kpi.get("CAGR", 0.0)))
        trial.set_user_attr("MaxDD", mdd)
        trial.set_user_attr("Sharpe", sharpe)
        trial.set_user_attr("Sortino", float(kpi.get("Sortino", 0.0)))
        trial.set_user_attr("HitRate", float(kpi.get("HitRate", 0.0)))

        return float(val)

    return obj


def small_grid_search(
    feats: pd.DataFrame,
    min_trades: int,
    mdd_floor: float,
    use_second_hour_opt: bool,
    symbol: str,
    wf_windows: list | None,
    purge_bars: int,
):
    grid_adx = [12, 15, 20, 25, 30]
    grid_rsi2 = [5, 10, 15, 20]
    grid_rsi14x = [55, 60, 65]
    grid_sl = [1.0, 1.5, 2.0]
    grid_tp = [1.8, 2.5, 3.0]
    grid_use2h = [False, True] if use_second_hour_opt else [False]

    rows = []
    for adx_min in grid_adx:
        for rsi2_max in grid_rsi2:
            for rsi14_exit in grid_rsi14x:
                for sl_atr in grid_sl:
                    for tp_atr in grid_tp:
                        for use2h in grid_use2h:
                            params = dict(
                                adx_min=adx_min, rsi2_max=rsi2_max, rsi14_exit=rsi14_exit,
                                sl_atr=sl_atr, tp_atr=tp_atr, use_second_hour=use2h
                            )
                            if wf_windows:
                                kpi = eval_params_oos(feats, wf_windows, params, purge_bars=purge_bars)
                                trades_n = int(kpi.get("Trades", 0))
                                hit = float(kpi.get("HitRate", 0.0))
                                sortino = float(kpi.get("Sortino", 0.0))
                            else:
                                eq, trades = run_backtest(
                                    feats, "baseline",
                                    sl_atr=sl_atr, tp_atr=tp_atr, fee_bps=0.0005,
                                    adx_min=adx_min, rsi2_max=rsi2_max,
                                    rsi14_exit=rsi14_exit, use_second_hour=use2h
                                )
                                kpi = kpis_from_equity(eq)
                                trades_n = len(trades)
                                if trades_n:
                                    rets = [(t.exit_px / t.entry_px) - 1.0 for t in trades]
                                    hit = float(np.mean([r > 0 for r in rets]))
                                else:
                                    hit = 0.0
                                sortino = float(kpi.get("Sortino", 0.0))

                            mdd = float(kpi.get("MaxDD", 0.0))
                            sharpe = float(kpi.get("Sharpe", 0.0))
                            if trades_n < min_trades:
                                score = -10.0 + (trades_n * 0.1)
                            else:
                                penalty = 0.0
                                if mdd < mdd_floor:
                                    penalty -= (abs(mdd) - abs(mdd_floor)) * 2.0
                                score = sharpe + penalty

                            rows.append({
                                "value": score,
                                "adx_min": adx_min, "rsi2_max": rsi2_max, "rsi14_exit": rsi14_exit,
                                "sl_atr": sl_atr, "tp_atr": tp_atr, "use_second_hour": use2h,
                                "Sharpe": sharpe, "Sortino": sortino, "CAGR": float(kpi.get("CAGR", 0.0)),
                                "MaxDD": mdd, "Trades": int(trades_n), "HitRate": hit,
                            })

    df = pd.DataFrame(rows).sort_values("value", ascending=False)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out_csv = REPORTS_DIR / f"{symbol}_optuna_trials.csv"
    df.to_csv(out_csv, index=False)

    best = df.iloc[0].to_dict() if len(df) else {}
    save_json_safe(REPORTS_DIR / f"{symbol}_optuna_best.json", best)
    print(f"[grid] wrote {out_csv}")
    if best:
        print("[grid BEST]:", best)


# -------------------- CLI --------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol")
    ap.add_argument("--days", type=int, default=180)
    ap.add_argument("--n_trials", type=int, default=60)
    ap.add_argument("--min_trades", type=int, default=10)
    ap.add_argument("--mdd_floor", type=float, default=-0.20, help="acceptera minst -20% innan penalty")
    ap.add_argument("--use_second_hour_opt", action="store_true", help="låter Optuna/Grid toggla second_hour")
    ap.add_argument("--oos_walkforward", type=str, default=None,
                    help='walk-forward i månader "train,test", ex. "12,3". Omitted = in-sample.')
    ap.add_argument("--purge_bars", type=int, default=0, help="antal bars att hoppa över i början av varje testfönster")
    args = ap.parse_args()

    bars = load_bars("./db/quant.duckdb", args.symbol, args.days)
    if bars.empty:
        print("Inga barer.")
        return
    feats = add_common(bars)

    wf_windows = None
    if args.oos_walkforward:
        try:
            tr_m, te_m = [int(x.strip()) for x in args.oos_walkforward.split(",")]
            wf_candidates = split_walkforward_months(feats["ts"], tr_m, te_m)
            if wf_candidates:
                # spara bara (test_start, test_end) för utvärdering
                wf_windows = [(tr_s, tr_e, te_s, te_e) for (tr_s, tr_e, te_s, te_e) in wf_candidates]
            else:
                print("[warn] fick inga WF-fönster – kör in-sample i stället.")
                wf_windows = None
        except Exception as e:
            print(f"[warn] ogiltig --oos_walkforward: {e} (kör in-sample)")

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    if optuna is None:
        print("[warn] Optuna saknas, kör liten grid-sökning i stället…")
        small_grid_search(
            feats, args.min_trades, args.mdd_floor, args.use_second_hour_opt,
            args.symbol, wf_windows=wf_windows, purge_bars=args.purge_bars
        )
        return

    study = optuna.create_study(direction="maximize", study_name=f"baseline_{args.symbol}")
    study.optimize(
        objective_factory(
            symbol=args.symbol,
            feats=feats,
            min_trades=args.min_trades,
            mdd_floor=args.mdd_floor,
            use_second_hour_opt=args.use_second_hour_opt,
            wf_windows=wf_windows,
            purge_bars=args.purge_bars,
        ),
        n_trials=args.n_trials
    )

    # -------------------- efter-optimize: skriv trials + räkna om BEST KPI --------------------

    # dumpa trials
    rows = []
    for t in study.trials:
        p = t.params
        rows.append({
            "value": to_json_safe(t.value),
            "adx_min": to_json_safe(p.get("adx_min")),
            "rsi2_max": to_json_safe(p.get("rsi2_max")),
            "rsi14_exit": to_json_safe(p.get("rsi14_exit")),
            "sl_atr": to_json_safe(p.get("sl_atr")),
            "tp_atr": to_json_safe(p.get("tp_atr")),
            "use_second_hour": p.get("use_second_hour"),
            "Sharpe": to_json_safe(t.user_attrs.get("Sharpe")),
            "Sortino": to_json_safe(t.user_attrs.get("Sortino")),
            "CAGR": to_json_safe(t.user_attrs.get("CAGR")),
            "MaxDD": to_json_safe(t.user_attrs.get("MaxDD")),
            "Trades": to_json_safe(t.user_attrs.get("Trades")),
            "HitRate": to_json_safe(t.user_attrs.get("HitRate")),
        })
    df = pd.DataFrame(rows).sort_values("value", ascending=False)
    out_csv = REPORTS_DIR / f"{args.symbol}_optuna_trials.csv"
    df.to_csv(out_csv, index=False)

    # hämta bästa trial och beräkna KPI (WF/IS) en gång till för ren rapport
    bt = study.best_trial
    best_params = bt.params

    if wf_windows:
        kpis_best = eval_params_oos(feats, wf_windows, best_params, purge_bars=args.purge_bars)
    else:
        eq_best, trades_best = run_backtest(
            feats, "baseline",
            sl_atr=float(best_params["sl_atr"]),
            tp_atr=float(best_params["tp_atr"]),
            fee_bps=0.0005,
            adx_min=float(best_params["adx_min"]),
            rsi2_max=float(best_params["rsi2_max"]),
            rsi14_exit=float(best_params["rsi14_exit"]),
            use_second_hour=bool(best_params.get("use_second_hour", False)),
            debug=False
        )
        kpis_best = kpis_from_equity(eq_best)  # innehåller Sortino
        if trades_best:
            rets = [(t.exit_px / t.entry_px) - 1.0 for t in trades_best]
            hit = float(np.mean([r > 0 for r in rets])) if len(rets) else 0.0
            kpis_best["Trades"] = int(len(trades_best))
            kpis_best["HitRate"] = hit
        else:
            kpis_best["Trades"] = 0
            kpis_best["HitRate"] = 0.0

    wf_str = args.oos_walkforward if args.oos_walkforward else None

    best = {
        "value": _to_py(bt.value),
        "adx_min": _to_py(best_params.get("adx_min")),
        "rsi2_max": _to_py(best_params.get("rsi2_max")),
        "rsi14_exit": _to_py(best_params.get("rsi14_exit")),
        "sl_atr": _to_py(best_params.get("sl_atr")),
        "tp_atr": _to_py(best_params.get("tp_atr")),
        "use_second_hour": bool(best_params.get("use_second_hour", False)),
        # KPI
        "CAGR":   _to_py(kpis_best.get("CAGR", 0.0)),
        "Sharpe": _to_py(kpis_best.get("Sharpe", 0.0)),
        "Sortino": _to_py(kpis_best.get("Sortino", 0.0)),
        "MaxDD":  _to_py(kpis_best.get("MaxDD", 0.0)),
        "Trades": int(kpis_best.get("Trades", 0)),
        "HitRate": _to_py(kpis_best.get("HitRate", 0.0)),
        # WF-meta
        "oos_walkforward": wf_str,   # "12,3" eller None
        "purge_bars": int(args.purge_bars or 0),
    }

    # skriv JSON
    best_path = REPORTS_DIR / f"{args.symbol}_optuna_best.json"
    with open(best_path, "w", encoding="utf-8") as f:
        json.dump(best, f, ensure_ascii=False, allow_nan=False)

    print("[OPTUNA BEST]:", best)
    print(f"[optuna] wrote {out_csv}")


if __name__ == "__main__":
    main()
