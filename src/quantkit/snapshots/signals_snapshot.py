# src/quantkit/snapshots/signals_snapshot.py
from __future__ import annotations
from pathlib import Path
from typing import Tuple
import numpy as np
import pandas as pd

from ..env import get_eodhd_api_key
from ..data.eodhd_client import fetch_timeseries

OUT_PATH_DEFAULT = Path("storage/snapshots/signals/latest.parquet")

def _read_tickers(path: str | Path) -> list[str]:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Hittar inte tickersfil: {p}")
    out: list[str] = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        out.append(line)
    return out

def _rsi14(close: pd.Series) -> pd.Series:
    delta = close.diff()
    gain = (delta.where(delta > 0, 0.0)).rolling(14, min_periods=14).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(14, min_periods=14).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi

def build_signals_snapshot(
    tickers_file: str = "config/tickers.txt",
    out_path: str | Path = OUT_PATH_DEFAULT,
    api_key: str | None = None,
    force: bool = False,
) -> Tuple[pd.DataFrame, Path]:
    api_key = (api_key or get_eodhd_api_key()).strip()
    tickers = _read_tickers(tickers_file)

    rows: list[dict] = []
    now_utc = pd.Timestamp.now(tz="UTC")

    for symbol in tickers:
        try:
            df = fetch_timeseries(symbol, timeframe="1d", api_key=api_key, force=force)
            if df.empty:
                print(f"[signals] skip {symbol}: tom serie")
                continue

            close = df["close"].astype(float)
            ma50 = close.rolling(50).mean()
            ma200 = close.rolling(200).mean()
            rsi = _rsi14(close)

            last = df.iloc[-1]
            price = float(last["close"])
            ma50v = float(ma50.iloc[-1]) if not pd.isna(ma50.iloc[-1]) else np.nan
            ma200v = float(ma200.iloc[-1]) if not pd.isna(ma200.iloc[-1]) else np.nan
            rsi_v = float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else np.nan

            signal = ""
            strength = 0.0

            if not np.isnan(ma50v) and not np.isnan(ma200v):
                prev_ma50 = ma50.iloc[-2] if len(ma50) > 1 else np.nan
                prev_ma200 = ma200.iloc[-2] if len(ma200) > 1 else np.nan

                if not np.isnan(prev_ma50) and not np.isnan(prev_ma200):
                    # gyllene/dödskors
                    if prev_ma50 <= prev_ma200 and ma50v > ma200v:
                        signal = "GoldenCross"
                    elif prev_ma50 >= prev_ma200 and ma50v < ma200v:
                        signal = "DeathCross"

            if not np.isnan(rsi_v):
                if rsi_v < 30:
                    signal = signal + ("|" if signal else "") + "RSI_Oversold"
                    strength += (30 - rsi_v) / 30.0
                elif rsi_v > 70:
                    signal = signal + ("|" if signal else "") + "RSI_Overbought"
                    strength += (rsi_v - 70) / 30.0

            rows.append(dict(
                Ts=pd.Timestamp(last["ts"]).tz_convert("UTC") if pd.Timestamp(last["ts"]).tzinfo else pd.Timestamp(last["ts"]).tz_localize("UTC"),
                Symbol=symbol,
                Price=price,
                RSI14=rsi_v,
                MA50=ma50v,
                MA200=ma200v,
                Signal=signal or "None",
                Strength=float(strength),
                SnapshotAt=now_utc,
            ))
        except Exception as e:
            print(f"[signals] skip {symbol}: {e}")

    cols = ["Ts","Symbol","Signal","Strength","Price","RSI14","MA50","MA200","SnapshotAt"]
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    df_out = pd.DataFrame(rows)[cols] if rows else pd.DataFrame(columns=cols)
    df_out.to_parquet(out_path, index=False)
    print(f"OK signals → {out_path} rows={len(df_out)} cols={len(df_out.columns)}")
    return df_out, out_path


# --- Deriverade fält i snapshot: snabbare app ---
df = df.copy()

for c in ["Price","RSI14","MA50","MA200","Strength"]:
    if c in df.columns:
        df[c] = pd.to_numeric(df[c], errors="coerce")

# % till MAs
if {"Price","MA50"}.issubset(df.columns):
    df["MA50Pct"] = (df["Price"] / df["MA50"] - 1.0) * 100.0
if {"Price","MA200"}.issubset(df.columns):
    df["MA200Pct"] = (df["Price"] / df["MA200"] - 1.0) * 100.0

# MA-regim & bias
if {"MA50","MA200"}.issubset(df.columns):
    df["MARegime"] = (df["MA50"] > df["MA200"]).map({True: "Bullish", False: "Bearish"})
    df["MABiasPct"] = (df["MA50"] - df["MA200"]) / df["Price"] * 100.0

# Stack-status
def _stack_row(r):
    p, m50, m200 = r.get("Price"), r.get("MA50"), r.get("MA200")
    if pd.isna(p) or pd.isna(m50) or pd.isna(m200):
        return None
    if p > m50 > m200:  return "AboveBoth"
    if p < m50 < m200:  return "BelowBoth"
    if p > m50 and p < m200: return "Above50_Below200"
    if p < m50 and p > m200: return "Below50_Above200"
    return "Mixed"

if {"Price","MA50","MA200"}.issubset(df.columns):
    df["MAStack"] = df.apply(_stack_row, axis=1)

# RSI-zon
if "RSI14" in df.columns:
    df["RSIZone"] = pd.cut(
        df["RSI14"],
        bins=[-np.inf, 30, 40, 60, 70, np.inf],
        labels=["Oversold (<30)", "Weak (30-40)", "Neutral (40-60)", "Strong (60-70)", "Overbought (>70)"],
    )

# Setup-etiketter (enkla heuristiker)
def _setup_row(r):
    rsi = r.get("RSI14"); regime = r.get("MARegime"); m200pct = r.get("MA200Pct"); m50pct = r.get("MA50Pct")
    if pd.notna(rsi) and rsi < 30 and regime == "Bullish" and pd.notna(m200pct) and m200pct > 0:
        return "Bullish Pullback (OS + >200)"
    if pd.notna(rsi) and rsi > 70 and regime == "Bearish" and pd.notna(m200pct) and m200pct < 0:
        return "Bearish Rally (OB + <200)"
    if pd.notna(m50pct) and abs(m50pct) <= 1.0:
        return "Near MA50 (≤1%)"
    if pd.notna(m200pct) and abs(m200pct) <= 1.0:
        return "Near MA200 (≤1%)"
    return ""

df["Setup"] = df.apply(_setup_row, axis=1)
