# src/quantkit/snapshots/hotlists_snapshot.py
from __future__ import annotations
from pathlib import Path
from typing import Tuple, Literal
import numpy as np
import pandas as pd

from ..env import get_eodhd_api_key
from ..data.eodhd_client import fetch_timeseries

OUT_PATH_DEFAULT = Path("storage/snapshots/hotlists/latest.parquet")

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

def _pct(a: float, b: float) -> float:
    if b is None or b == 0 or pd.isna(b):
        return np.nan
    return (a / b - 1.0) * 100.0

def _last_n_pct(series: pd.Series, bars: int) -> float:
    if len(series) < bars + 1 or bars <= 0:
        return np.nan
    return _pct(series.iloc[-1], series.iloc[-1 - bars])

def _to_utc(ts_like) -> pd.Timestamp:
    ts = pd.Timestamp(ts_like)
    if ts.tzinfo is None:
        return ts.tz_localize("UTC")
    return ts.tz_convert("UTC")

def _prev_close(symbol: str, api_key: str, force: bool) -> float:
    """Hämta föregående dags close för GapPct."""
    try:
        daily = fetch_timeseries(symbol, timeframe="1d", api_key=api_key, force=force)
        if len(daily) >= 2:
            # Ta näst sista barens close
            return float(daily["close"].iloc[-2])
        elif len(daily) == 1:
            return float(daily["close"].iloc[-1])
    except Exception:
        pass
    return np.nan

def build_hotlists_snapshot(
    timeframe: Literal["5m", "1h", "1d"] = "5m",
    tickers_file: str = "config/tickers.txt",
    api_key: str | None = None,
    out_path: str | Path = OUT_PATH_DEFAULT,
    force: bool = False,
) -> Tuple[pd.DataFrame, Path]:
    api_key = (api_key or get_eodhd_api_key()).strip()
    tickers = _read_tickers(tickers_file)

    rows: list[dict] = []
    now_utc = pd.Timestamp.now(tz="UTC")

    for symbol in tickers:
        try:
            df = fetch_timeseries(symbol, timeframe=timeframe, api_key=api_key, force=force)
            if df.empty or "ts" not in df.columns:
                print(f"[hotlists] skip {symbol}: tomt svar")
                continue

            # Välj SENASTE tillgängliga session i datat
            df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
            session_date = df["ts"].dt.date.max()
            day = df[df["ts"].dt.date == session_date].copy()
            if day.empty:
                print(f"[hotlists] skip {symbol}: inga barer i senaste sessionen")
                continue

            close_series = (df["close"] if "close" in df.columns else df["open"]).astype(float)

            last_ts = _to_utc(day["ts"].iloc[-1])
            last_close = float((day.get("close", day.get("open"))).iloc[-1])
            day_open   = float((day.get("open",  day.get("close"))).iloc[0])
            day_high   = float(day.get("high", day.get("close")).max())
            day_low    = float(day.get("low",  day.get("close")).min())


            # Hämta föregående dags close (1d-serie)
            prev_close = np.nan
            try:
                d1 = fetch_timeseries(symbol, timeframe="1d", api_key=api_key, force=False)
                if not d1.empty:
                    # näst sista raden = föregående session (om sista är idag)
                    if len(d1) >= 2:
                        prev_close = float(d1["close"].iloc[-2])
                    else:
                        prev_close = float(d1["close"].iloc[-1])
            except Exception:
                pass

            gap_pct = np.nan
            if prev_close and prev_close > 0 and not pd.isna(prev_close):
                gap_pct = (day_open / prev_close - 1.0) * 100.0



            # Rise över 1/3/6/12 "bars" inom den sessionens index
            day_idx = day.index
            def rp(n: int) -> float:
                s = close_series.loc[day_idx]
                return _last_n_pct(s, n)

            rise5, rise15, rise30, rise60 = rp(1), rp(3), rp(6), rp(12)

            net_pct = _pct(last_close, day_open)
            range_pct = _pct(day_high, day_low) if day_low != 0 else np.nan
            range_pos_pct = np.nan
            if day_high > day_low:
                range_pos_pct = (last_close - day_low) / (day_high - day_low) * 100.0

            from_open_pct = _pct(last_close, day_open)
            dist_to_high_pct = _pct(day_high, last_close)  # hur långt upp till high
            dist_to_low_pct  = _pct(last_close, day_low)   # hur långt ned till low

            prev_close = _prev_close(symbol, api_key, force=False)
            gap_pct = _pct(day_open, prev_close) if not pd.isna(prev_close) else np.nan

            exchange = symbol.split(".")[-1] if "." in symbol else ""

            rows.append(dict(
                Symbol=symbol,
                Exchange=exchange,
                Last=last_close,
                NetPct=net_pct,
                Rise5mPct=rise5,
                Rise15mPct=rise15,
                Rise30mPct=rise30,
                Rise60mPct=rise60,
                RangePct=range_pct,
                RangePosPct=range_pos_pct,
                FromOpenPct=from_open_pct,
                DistToHighPct=dist_to_high_pct,
                DistToLowPct=dist_to_low_pct,
                GapPct=gap_pct,
                Open=day_open,
                High=day_high,
                Low=day_low,
                VolTot=float(day.get("volume", pd.Series(dtype=float)).sum()) if "volume" in day else 0.0,
                LastTs=last_ts,
                SnapshotAt=now_utc,
            ))
        except Exception as e:
            print(f"[hotlists] skip {symbol}: {e}")

    cols = [
        "Symbol","Exchange","Last","NetPct",
        "Rise5mPct","Rise15mPct","Rise30mPct","Rise60mPct",
        "RangePct","RangePosPct","FromOpenPct","DistToHighPct","DistToLowPct","GapPct",
        "Open","High","Low","VolTot","LastTs","SnapshotAt"
    ]
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if rows:
        df_out = pd.DataFrame(rows)
        for c in cols:
            if c not in df_out.columns:
                df_out[c] = np.nan
        df_out = df_out[cols].sort_values("Rise5mPct", ascending=False).reset_index(drop=True)
    else:
        df_out = pd.DataFrame(columns=cols)

    df_out.to_parquet(out_path, index=False)
    print(f"OK snapshot → {out_path} rows={len(df_out)} cols={len(df_out.columns)}")
    return df_out, out_path

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeframe", choices=["5m","1h","1d"], default="1d")
    ap.add_argument("--out", default="storage/snapshots/hotlists/latest.parquet")
    ap.add_argument("--tickers-file", default="config/tickers.txt")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    df, path = build_hotlists_snapshot(
        timeframe=args.timeframe,
        out_path=args.out,
        tickers_file=args.tickers_file,
        force=args.force,
    )
    print(f"OK snapshot → {path}  rows={len(df)} cols={len(df.columns)}")
