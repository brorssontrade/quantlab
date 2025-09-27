from __future__ import annotations
from pathlib import Path
import joblib, typer, numpy as np, pandas as pd  # type: ignore
from .features import FeatureConfig, build_ml_table

app = typer.Typer(add_completion=False)


@app.command()
def from_oof(
    oof_parquet: str = typer.Option(..., help="OOF-prediktioner från trainer.py"),
    threshold: float = typer.Option(0.0, help="Tröskel för att sätta ±1 signal från Score"),
    out: str = typer.Option("storage/signals/signals_oof.parquet"),
):
    df = pd.read_parquet(oof_parquet)
    if "Score" not in df.columns:
        raise ValueError("OOF-fil saknar 'Score'.")
    score = df["Score"].to_numpy()
    sig = np.where(score > threshold, 1, np.where(score < -threshold, -1, 0))
    out_df = df[["Ts", "Symbol", "Exchange", "Price"]].copy()
    out_df["Score"] = score
    out_df["Signal"] = sig.astype(int)
    outp = Path(out); outp.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_parquet(outp, index=False)
    print(f"✓ Wrote signals (OOF) -> {outp}")


@app.command()
def live(
    model_pkl: str = typer.Option(...),
    parquet: str = typer.Option("storage/snapshots/breadth/symbols/latest.parquet"),
    horizon: int = typer.Option(5),
    label: str = typer.Option("class"),
    threshold: float = typer.Option(0.0),
    out: str = typer.Option("storage/signals/signals_live.parquet"),
):
    bundle = joblib.load(model_pkl)
    model = bundle["model"]; meta = bundle["meta"]
    feat_cols = meta["features"]

    cfg = FeatureConfig(
        parquet_path=Path(parquet),
        horizon=horizon,
        label_type=label,
        neutral_band=meta.get("neutral_band", 0.0),
        for_inference=True,   # behåll ALLA rader vid inferens
    )
    df, feat_cols_chk, _ = build_ml_table(cfg)
    if feat_cols != feat_cols_chk:
        raise ValueError(f"Features mismatch.\nModel: {feat_cols}\nData:  {feat_cols_chk}")

    X = df[feat_cols].to_numpy(dtype=np.float32)
    if label == "class":
        score = model.predict_proba(X)[:, 1] * 2 - 1.0
    else:
        score = model.predict(X)

    sig = np.where(score > threshold, 1, np.where(score < -threshold, -1, 0))
    out_df = df[["Ts", "Symbol", "Exchange", "Price"]].copy()
    out_df["Score"] = score
    out_df["Signal"] = sig.astype(int)
    outp = Path(out); outp.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_parquet(outp, index=False)
    print(f"✓ Wrote signals (LIVE) -> {outp}")


if __name__ == "__main__":
    app()
