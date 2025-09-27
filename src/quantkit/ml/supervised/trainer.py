from __future__ import annotations
from pathlib import Path
from typing import Optional, List
import os, json, time
import joblib, typer, optuna
import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import roc_auc_score, f1_score, accuracy_score, mean_squared_error

from .features import FeatureConfig, build_ml_table

app = typer.Typer(add_completion=False)
RNG = 1337


def _read_symbols_file(path: Optional[str]) -> Optional[List[str]]:
    if not path:
        return None
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(p)
    return [line.strip() for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


def _ts_splits(n_splits: int, n_samples: int):
    tss = TimeSeriesSplit(n_splits=n_splits)
    return list(tss.split(np.arange(n_samples)))


def _xgb_objective(trial, X: np.ndarray, y: np.ndarray, splits, task: str):
    import xgboost as xgb
    params = dict(
        max_depth=trial.suggest_int("max_depth", 3, 7),
        learning_rate=trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
        subsample=trial.suggest_float("subsample", 0.6, 1.0),
        colsample_bytree=trial.suggest_float("colsample_bytree", 0.6, 1.0),
        reg_lambda=trial.suggest_float("reg_lambda", 1e-3, 10.0, log=True),
        reg_alpha=trial.suggest_float("reg_alpha", 1e-3, 3.0, log=True),
        n_estimators=trial.suggest_int("n_estimators", 200, 1200, log=True),
        random_state=RNG,
        tree_method="hist",
        n_jobs=os.cpu_count() or 4,
    )
    metrics = []
    for tr_idx, va_idx in splits:
        Xtr, Xva = X[tr_idx], X[va_idx]
        ytr, yva = y[tr_idx], y[va_idx]
        if task == "class":
            model = xgb.XGBClassifier(**params, eval_metric="auc", enable_categorical=False, early_stopping_rounds=50)
            model.fit(Xtr, ytr, eval_set=[(Xva, yva)], verbose=False)
            proba = model.predict_proba(Xva)[:, 1]
            m = roc_auc_score(yva, proba)
        else:
            model = xgb.XGBRegressor(**params, eval_metric="rmse", enable_categorical=False, early_stopping_rounds=50)
            model.fit(Xtr, ytr, eval_set=[(Xva, yva)], verbose=False)
            pred = model.predict(Xva)
            m = -mean_squared_error(yva, pred, squared=False)  # max
        metrics.append(m)
    return float(np.mean(metrics))


@app.command()
def train(
    parquet: str = typer.Option("storage/snapshots/breadth/symbols/latest.parquet"),
    symbols_file: Optional[str] = typer.Option(None, help="En symbol per rad (valfritt)"),
    horizon: int = typer.Option(5),
    label: str = typer.Option("class", help="class|reg"),
    neutral_band: float = typer.Option(0.0),
    n_splits: int = typer.Option(5),
    n_trials: int = typer.Option(30),
    out_model: str = typer.Option("models/xgb_us_5d.pkl"),
    out_oof: Optional[str] = typer.Option("storage/signals/oof_xgb.parquet"),
):
    """
    Tränar XGBoost (klass/reg) med Optuna + TimeSeries CV.
    Sparar:
      - modell (.pkl) inkl. metadata (features, horizon, etc.)
      - OOF-prediktioner (parquet) för backtest utan läckage
    """
    symbols = _read_symbols_file(symbols_file)

    cfg = FeatureConfig(
        parquet_path=Path(parquet),
        symbols=symbols,
        horizon=horizon,
        label_type=label,
        neutral_band=neutral_band,
        for_inference=False,
    )
    df, feat_cols, target_name = build_ml_table(cfg)
    X = df[feat_cols].to_numpy(dtype=np.float32)
    y = df[target_name].to_numpy()

    splits = _ts_splits(n_splits, len(df))
    study = optuna.create_study(direction="maximize")
    study.optimize(lambda tr: _xgb_objective(tr, X, y, splits, label), n_trials=n_trials, show_progress_bar=False)
    best_params = study.best_params

    import xgboost as xgb
    oof_pred, oof_proba = np.zeros(len(df)), np.zeros(len(df))
    for tr_idx, va_idx in splits:
        if label == "class":
            model = xgb.XGBClassifier(**best_params, eval_metric="auc", enable_categorical=False,
                                      random_state=RNG, tree_method="hist", n_jobs=os.cpu_count() or 4)
            model.fit(X[tr_idx], y[tr_idx], eval_set=[(X[va_idx], y[va_idx])], verbose=False)
            proba = model.predict_proba(X[va_idx])[:, 1]
            oof_proba[va_idx] = proba
            oof_pred[va_idx] = (proba > 0.5).astype(int)
        else:
            model = xgb.XGBRegressor(**best_params, eval_metric="rmse", enable_categorical=False,
                                     random_state=RNG, tree_method="hist", n_jobs=os.cpu_count() or 4)
            model.fit(X[tr_idx], y[tr_idx], eval_set=[(X[va_idx], y[va_idx])], verbose=False)
            pred = model.predict(X[va_idx])
            oof_pred[va_idx] = pred

    if label == "class":
        auc = roc_auc_score(y, oof_proba)
        f1 = f1_score(y.astype(int), (oof_proba > 0.5).astype(int))
        acc = accuracy_score(y.astype(int), (oof_proba > 0.5).astype(int))
        print(f"OOF AUC={auc:.3f}  F1={f1:.3f}  ACC={acc:.3f}")
    else:
        rmse = mean_squared_error(y, oof_pred, squared=False)
        print(f"OOF RMSE={rmse:.6f}")

    if out_oof:
        outp = Path(out_oof); outp.parent.mkdir(parents=True, exist_ok=True)
        out_df = df[["Ts", "Symbol", "Exchange", "Price", "ForwardRet"]].copy()
        if label == "class":
            out_df["Proba"] = oof_proba
            out_df["Pred"] = (oof_proba > 0.5).astype(int)
            out_df["Score"] = out_df["Proba"] * 2 - 1.0  # [-1,1]
        else:
            out_df["Pred"] = oof_pred
            out_df["Score"] = out_df["Pred"]
        out_df.to_parquet(outp, index=False)
        print(f"✓ Wrote OOF predictions -> {outp}")

    # Final modell på ALL data
    if label == "class":
        final_model = xgb.XGBClassifier(**best_params, eval_metric="auc", enable_categorical=False,
                                        random_state=RNG, tree_method="hist", n_jobs=os.cpu_count() or 4)
    else:
        final_model = xgb.XGBRegressor(**best_params, eval_metric="rmse", enable_categorical=False,
                                       random_state=RNG, tree_method="hist", n_jobs=os.cpu_count() or 4)
    final_model.fit(X, y, verbose=False)

    meta = {
        "created_at": int(time.time()),
        "model_type": f"xgb_{label}",
        "features": feat_cols,
        "horizon": horizon,
        "label_type": label,
        "neutral_band": neutral_band,
        "best_params": best_params,
        "parquet": str(Path(parquet)),
    }
    out_model = Path(out_model); out_model.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": final_model, "meta": meta}, out_model)
    print(f"✓ Saved model -> {out_model}")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    app()
