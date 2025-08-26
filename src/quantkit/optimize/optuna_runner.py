# src/quantkit/optimize/optuna_runner.py
from __future__ import annotations
from pathlib import Path
import json, math
import numpy as np
import pandas as pd
import optuna

from quantkit.data.eodhd_loader import load_bars
from quantkit.indicators.registry import normalize_ohlcv
from quantkit.strategies import registry as SREG
from quantkit.backtest.engine2 import run_signals


def _suggest_params(trial: optuna.Trial, strategy_id: str, defaults: dict) -> dict:
    """
    Heuristisk parameter-rum. Vi täcker swe_ifrsi_sqz bra; övriga får generiska ramar.
    """
    p = {}

    def _len(name, base, lo=5, hi=300):
        base = int(defaults.get(name, base))
        lo = max(2, min(lo, base // 2 or 2))
        hi = max(base + 2, hi)
        p[name] = trial.suggest_int(name, lo, hi)

    def _flt(name, base, lo, hi, step=None, log=False):
        base = float(defaults.get(name, base))
        if step is None:
            p[name] = trial.suggest_float(name, lo, hi, log=log)
        else:
            p[name] = trial.suggest_float(name, lo, hi, step=step)

    def _cap_int(name, base, lo, hi):
        p[name] = trial.suggest_int(name, lo, hi)

    if strategy_id == "swe_ifrsi_sqz":
        _len("sma_len", defaults.get("sma_len", 200), 50, 400)
        _len("rvol_len", defaults.get("rvol_len", 20), 10, 60)
        _flt("rvol_min", defaults.get("rvol_min", 1.2), 0.5, 2.5, step=0.05)
        _len("if_len", defaults.get("if_len", 14), 5, 40)
        _flt("if_alpha", defaults.get("if_alpha", 0.1), 0.02, 0.4, step=0.01)
        _len("sqz_len", defaults.get("sqz_len", 20), 10, 60)
        _flt("sqz_mult", defaults.get("sqz_mult", 2.0), 0.8, 4.0, step=0.1)
        _cap_int("max_bars", defaults.get("max_bars", 20), 5, 60)
    else:
        # generisk: allt som slutar på "_len" tolkas som längd; vissa nycklar som min/mult/alpha får rimliga ramar
        for k, v in defaults.items():
            if k.endswith("_len") or k.endswith("len"):
                lo = max(2, int(v) // 2 if isinstance(v, (int, float)) else 5)
                hi = max(int(v) + 2, 120)
                p[k] = trial.suggest_int(k, lo, hi)
            elif any(x in k for x in ["mult", "alpha"]):
                p[k] = trial.suggest_float(k, 0.05, 4.0, step=0.05)
            elif "min" in k:
                p[k] = trial.suggest_float(k, 0.5, 2.5, step=0.05)
            elif k == "max_bars":
                p[k] = trial.suggest_int(k, 5, 60)
            # annars låt default vara fast (ingen suggestion)
    return p


def _evaluate(symbol: str, strategy_id: str, params: dict, interval: str, days: int):
    SREG.ensure_populated()
    spec = SREG.get(strategy_id)

    bars_raw = load_bars(symbol, interval=interval, days=days)
    if bars_raw is None or bars_raw.empty:
        return dict(n_trades=0, win_rate=0.0, profit_factor=0.0, expectancy=0.0, cagr=0.0, mdd=0.0, equity=None, trades=pd.DataFrame())

    bars = normalize_ohlcv(bars_raw)
    sig = SREG.generate(strategy_id, bars.copy(), params=params or {})
    entry = sig["entry"].astype(bool)
    exit_rule = sig["exit"].astype(bool)
    meta = dict(sig.get("meta", {}))
    side = (meta.get("side") or spec.direction or "long").lower()

    res = run_signals(
        bars=bars.copy(), entry=entry, exit_rule=exit_rule, side=side,
        sl_pct=meta.get("sl_pct"), tp_pct=meta.get("tp_pct"), max_bars=meta.get("max_bars"),
        fee_bps=0.0, slippage_bps=0.0, commission_plan="none", qty=1.0,
    )

    equity = getattr(res, "equity", None)
    if isinstance(equity, pd.DataFrame) and "equity" in equity:
        equity = equity.set_index(pd.to_datetime(equity.get("ts", equity.index)))["equity"]
    elif not isinstance(equity, pd.Series):
        equity = pd.Series(range(len(bars)), index=pd.to_datetime(bars["ts"]), name="equity").astype(float)
        equity[:] = float(100_000.0)

    trades = getattr(res, "trades", None)
    trades = trades.copy() if isinstance(trades, pd.DataFrame) else pd.DataFrame()

    n_trades = int(len(trades))
    if n_trades > 0:
        pnl = trades["pnl"].astype(float)
        win = float((pnl > 0).mean())
        gp = float(pnl[pnl > 0].sum())
        gl = float(pnl[pnl < 0].sum())
        pf = gp / abs(gl) if gl < 0 else (math.inf if gp > 0 else 0.0)
        if "ret" in trades:
            expectancy = float(trades["ret"].mean())
        else:
            # fallback: pnl relativt startkapital
            expectancy = float(pnl.mean() / 100_000.0)
    else:
        win, pf, expectancy = 0.0, 0.0, 0.0

    # CAGR + MaxDD från equity
    if len(equity) >= 2:
        start_val = float(equity.iloc[0])
        end_val = float(equity.iloc[-1])
        years = max(1e-9, (equity.index[-1] - equity.index[0]).days / 365.25)
        cagr = ((end_val / start_val)**(1/years) - 1.0) if start_val > 0 else 0.0
        roll_max = equity.cummax()
        dd = (equity / roll_max - 1.0).min()
        mdd = float(abs(dd))
    else:
        cagr, mdd = 0.0, 0.0

    return dict(n_trades=n_trades, win_rate=win, profit_factor=pf, expectancy=expectancy, cagr=cagr, mdd=mdd,
                equity=equity, trades=trades)


def run(
    symbol: str,
    strategy: str,
    interval: str = "EOD",
    days: int = 1500,
    n_trials: int = 50,
    objective: str = "pp",          # 'pp' (Percent Profitable), 'pf', 'exp', 'sharpe' (enkel proxy), 'custom'
    min_trades: int = 8,
):
    SREG.ensure_populated()
    spec = SREG.get(strategy)
    defaults = spec.defaults or {}

    out_root = Path("reports/optuna") / f"{symbol}__{strategy}"
    out_root.mkdir(parents=True, exist_ok=True)

    def _score(metrics):
        n = metrics["n_trades"]
        win = metrics["win_rate"]
        pf = metrics["profit_factor"]
        expct = metrics["expectancy"]
        cagr = metrics["cagr"]
        mdd = metrics["mdd"]

        # grundpoäng
        if objective == "pp":
            score = win
            # straffa för få trades och PF<1
            if n < min_trades:
                score -= 0.50 * (min_trades - n) / max(1, min_trades)
            if not math.isinf(pf) and pf < 1.0:
                score -= 0.10 * (1.0 - pf)  # liten knuff mot PF>=1
            # små tie-breakers
            score += 0.01 * np.tanh(expct * 10.0) + 0.001 * math.log1p(n)
            return float(score)
        elif objective == "pf":
            score = (pf if not math.isinf(pf) else 5.0)
            if n < min_trades:
                score *= (n / max(1, min_trades))
            return float(score)
        elif objective == "exp":
            # expectancy per trade, skala efter antal trades
            return float(expct * (n / max(1, min_trades)))
        elif objective == "sharpe":
            # enkel proxy: CAGR / (MDD+eps)
            return float(cagr / (mdd + 1e-6))
        else:
            # Custom: viktning
            return float(0.6*win + 0.3*(0 if math.isinf(pf) else min(pf/3.0, 1.0)) + 0.1*np.tanh(expct*10.0))

    study = optuna.create_study(direction="maximize")

    def _obj(trial: optuna.Trial):
        params = _suggest_params(trial, strategy, defaults)
        metrics = _evaluate(symbol, strategy, params, interval, days)
        score = _score(metrics)

        # logga till trial
        trial.set_user_attr("n_trades", metrics["n_trades"])
        trial.set_user_attr("win_rate", metrics["win_rate"])
        trial.set_user_attr("profit_factor", metrics["profit_factor"])
        trial.set_user_attr("expectancy", metrics["expectancy"])
        trial.set_user_attr("cagr", metrics["cagr"])
        trial.set_user_attr("mdd", metrics["mdd"])
        return score

    study.optimize(_obj, n_trials=n_trials)

    # spara trials.csv
    try:
        df = study.trials_dataframe()
        df.to_csv(out_root / "trials.csv", index=False)
    except Exception:
        pass

    best_params = study.best_trial.params
    best_attrs = study.best_trial.user_attrs
    best_meta = {
        "objective": objective,
        "score": float(study.best_value),
        "interval": interval,
        "days": days,
        "min_trades": min_trades,
        "attrs": best_attrs,
    }

    # harvest → data/optuna/best/<symbol>__<strategy>.json
    best_dir = Path("data/optuna/best"); best_dir.mkdir(parents=True, exist_ok=True)
    outp = best_dir / f"{symbol}__{strategy}.json"
    outp.write_text(json.dumps({"params": best_params, "meta": best_meta}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[optuna] Best → {outp}")
    return str(out_root)

