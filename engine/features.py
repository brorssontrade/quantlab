# engine/features.py
from __future__ import annotations
import pandas as pd
import numpy as np

def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False, min_periods=n).mean()

def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    delta = close.diff()
    up = delta.clip(lower=0.0)
    down = (-delta).clip(lower=0.0)
    avg_gain = up.ewm(alpha=1 / n, min_periods=n, adjust=False).mean()
    avg_loss = down.ewm(alpha=1 / n, min_periods=n, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))

def atr(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, min_periods=n, adjust=False).mean()

def add_common(
    df: pd.DataFrame,
    ema_fast_n: int = 20,
    ema_slow_n: int = 50,
    rsi_n: int = 14,
    atr_n: int = 14,
) -> pd.DataFrame:
    out = df.copy()

    # Se till att vi har en tz-aware tidskolumn i Stockholmstid
    if "ts" in out.columns:
        out["ts"] = pd.to_datetime(out["ts"], utc=True).dt.tz_convert("Europe/Stockholm")
        out = out.sort_values("ts").reset_index(drop=True)

    # Indikatorer
    out["ema_fast"] = ema(out["close"], ema_fast_n)
    out["ema_slow"] = ema(out["close"], ema_slow_n)
    out["rsi"] = rsi(out["close"], rsi_n)
    out["atr"] = atr(out["high"], out["low"], out["close"], atr_n)

    # "Andra timmen" per handelsdag (i Stockholmstid)
    ts_local = out["ts"].dt.tz_convert("Europe/Stockholm")
    day = ts_local.dt.date
    grp = day.ne(day.shift()).cumsum()      # group-id per dag
    idx_in_day = ts_local.groupby(grp).cumcount()
    out["second_hour"] = idx_in_day.eq(1)

    return out
