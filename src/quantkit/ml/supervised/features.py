from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional, List, Tuple
import numpy as np
import pandas as pd


@dataclass
class FeatureConfig:
    parquet_path: Path = Path("storage/snapshots/breadth/symbols/latest.parquet")
    symbols: Optional[Iterable[str]] = None
    exchanges: Optional[Iterable[str]] = None
    start: Optional[str] = None
    end: Optional[str] = None
    horizon: int = 5             # dagar fram
    label_type: str = "class"    # "class" eller "reg"
    neutral_band: float = 0.0    # klass: neutral zon runt 0 (t.ex. 0.001 = ±0.1%)
    for_inference: bool = False  # True = droppa inte tail/neutral (för live/inferens)


def _clean_frame(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["Ts"] = pd.to_datetime(df["Ts"], utc=True).dt.tz_localize(None)
    df.sort_values(["Symbol", "Ts"], inplace=True)
    if "State" in df.columns:
        df["StateBin"] = (df["State"].astype(str).str.lower().eq("adv")).astype(float)
    else:
        df["StateBin"] = np.nan
    if "ChangePct" not in df.columns and "Price" in df.columns:
        df["ChangePct"] = df.groupby("Symbol")["Price"].pct_change() * 100.0
    return df


def _make_label_and_features(
    df: pd.DataFrame, horizon: int, label_type: str, neutral_band: float, for_inference: bool
) -> Tuple[pd.DataFrame, List[str], str]:
    feat_cols = [c for c in ["RSI14", "MA20Pct", "MA50Pct", "MA200Pct", "ChangePct", "StateBin"] if c in df.columns]

    if "Price" in df.columns:
        df["Ret1D"] = df.groupby("Symbol")["Price"].pct_change().fillna(0.0)
        df["LogRet1D"] = np.log1p(df["Ret1D"])
        feat_cols += ["Ret1D", "LogRet1D"]

    if "Price" not in df.columns:
        raise ValueError("Price saknas i input, kan inte skapa label.")
    fwd = df.groupby("Symbol")["Price"].shift(-horizon) / df["Price"] - 1.0
    df["ForwardRet"] = fwd

    if label_type == "class":
        up = df["ForwardRet"] > neutral_band
        dn = df["ForwardRet"] < -neutral_band
        df["y"] = np.where(up, 1, np.where(dn, 0, np.nan))
        target_name = "y"
    else:
        df["y"] = df["ForwardRet"]
        target_name = "y"

    # FFILL features per symbol, inga cross-symbol läckage
    if feat_cols:
        df[feat_cols] = df.groupby("Symbol")[feat_cols].transform(lambda g: g.ffill())
        df[feat_cols] = df[feat_cols].replace([np.inf, -np.inf], np.nan).fillna(0.0)

    # Träning: droppa sista horizon (saknar framtida ret) + neutrala (klass)
    if not for_inference:
        def _drop_tail(g: pd.DataFrame) -> pd.DataFrame:
            return g.iloc[:-horizon] if len(g) > horizon else g.iloc[0:0]
        df = df.groupby("Symbol", group_keys=False).apply(_drop_tail)
        if label_type == "class":
            df = df.dropna(subset=["y"])

    df.sort_values(["Symbol", "Ts"], inplace=True)
    return df, feat_cols, target_name


def build_ml_table(cfg: FeatureConfig) -> Tuple[pd.DataFrame, List[str], str]:
    p = Path(cfg.parquet_path)
    df = pd.read_parquet(p)
    df = _clean_frame(df)

    if cfg.symbols:
        wanted = set([str(s).strip() for s in cfg.symbols if s])
        df = df[df["Symbol"].isin(wanted)]
    if cfg.exchanges:
        df = df[df["Exchange"].isin(cfg.exchanges)]
    if cfg.start:
        df = df[df["Ts"] >= pd.to_datetime(cfg.start)]
    if cfg.end:
        df = df[df["Ts"] <= pd.to_datetime(cfg.end)]

    df, feat_cols, target_name = _make_label_and_features(
        df, cfg.horizon, cfg.label_type, cfg.neutral_band, cfg.for_inference
    )
    return df, feat_cols, target_name
