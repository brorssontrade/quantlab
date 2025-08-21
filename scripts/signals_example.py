# scripts/signals_example.py
import argparse
import duckdb
import pandas as pd
from pathlib import Path

from engine.features import add_common  # tar bara (df), ingen "symbol="

REPORTS_DIR = Path("reports")

def load_bars(symbol: str, days: int) -> pd.DataFrame:
    # Läs direkt från partitionerade parquet-filer (oberoende av DB-skapade views)
    q = f"""
    SELECT ts, symbol, open, high, low, close, volume
    FROM read_parquet('./storage/parquet/raw_1h/**')
    WHERE symbol = ?
      AND ts >= now() - INTERVAL {int(days)} DAY
    ORDER BY ts
    """
    con = duckdb.connect()
    return con.execute(q, [symbol]).df()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", required=True)
    ap.add_argument("--days", type=int, default=120)
    args = ap.parse_args()

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    bars = load_bars(args.symbol, args.days)
    if bars.empty:
        print(f"[signals] No bars for {args.symbol}")
        return

    # Lägg på indikatorer (utan symbol-param)
    df = add_common(bars)

    # Exempelsignal: RSI14>55 & EMA12>EMA26 & (om kolumnen finns) andra timmen
    need_cols = {"rsi14", "ema12", "ema26"}
    if not need_cols.issubset(df.columns):
        missing = need_cols - set(df.columns)
        raise RuntimeError(f"Missing expected columns from features: {missing}")

    second_ok = df["second_hour"] if "second_hour" in df.columns else True
    df["enter"] = (df["rsi14"] > 55) & (df["ema12"] > df["ema26"]) & second_ok
    # agera på nästa bar open (delay)
    df["enter_at"] = df["enter"].shift(1).fillna(False)

    # Skriv enkel signalfil
    out_cols = [c for c in ["ts","symbol","open","high","low","close","volume",
                            "rsi14","ema12","ema26","enter","enter_at"] if c in df.columns]
    out_path = REPORTS_DIR / f"{args.symbol}_signals.csv"
    df[out_cols].to_csv(out_path, index=False)
    print(f"[signals] Wrote {out_path}")

if __name__ == "__main__":
    main()
