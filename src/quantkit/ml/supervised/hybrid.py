from __future__ import annotations
from pathlib import Path
import joblib
import typer
import numpy as np
import pandas as pd
import xgboost as xgb
from .features import FeatureConfig, build_ml_table

app = typer.Typer(add_completion=False)

@app.command()
def train(
    parquet: str = "storage/snapshots/breadth/symbols/latest.parquet",
    horizon: int = 5,
    label: str = "class",            # kör klassificering på hybrid
    lstm_embed: str = "storage/signals/lstm_embed.parquet",
    out_model: str = "models/hybrid_xgb.pkl",
):
    # Tabulära features
    cfg = FeatureConfig(Path(parquet), horizon=horizon, label_type=label)
    df, feat_cols, _ = build_ml_table(cfg)

    # Läs embeddings (matcha på Ts+Symbol)
    emb = pd.read_parquet(lstm_embed)
    cols_emb = [c for c in emb.columns if c.startswith("emb")]
    use = ["Ts","Symbol"] + cols_emb
    emb = emb[use]
    m = df.merge(emb, on=["Ts","Symbol"], how="left")

    # Bygg X = [tabular + emb]
    X = np.hstack([m[feat_cols].to_numpy(np.float32), m[cols_emb].fillna(0).to_numpy(np.float32)])
    y = m["y"].to_numpy()

    if label == "class":
        model = xgb.XGBClassifier(
            max_depth=5, n_estimators=600, learning_rate=0.05,
            subsample=0.9, colsample_bytree=0.9, reg_lambda=1.0,
            tree_method="hist", random_state=1337, n_jobs=0, eval_metric="auc"
        )
    else:
        model = xgb.XGBRegressor(
            max_depth=5, n_estimators=600, learning_rate=0.05,
            subsample=0.9, colsample_bytree=0.9, reg_lambda=1.0,
            tree_method="hist", random_state=1337, n_jobs=0, eval_metric="rmse"
        )
    model.fit(X, y)

    joblib.dump({"model": model, "meta":{
        "features": feat_cols, "emb_cols": cols_emb, "horizon": horizon, "label": label
    }}, out_model)
    print(f"✓ Saved HYBRID -> {out_model}")

if __name__ == "__main__":
    app()
