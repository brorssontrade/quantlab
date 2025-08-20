import argparse, duckdb, pandas as pd
from engine.features import add_common

from datetime import datetime, timezone, timedelta
import duckdb
import pandas as pd

def load_bars(db, symbol, days):
    con = duckdb.connect(db)
    q = """
    SELECT * FROM bars_all
    WHERE symbol = ? AND ts >= ?
    ORDER BY ts
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return con.execute(q, [symbol, cutoff]).df()


def simple_rule(df):
    df = df.copy()
    df["enter"] = df["second_hour"] & (df["ema_fast"] > df["ema_slow"]) & (df["rsi"] > 55)
    df["enter_at"] = df["enter"].shift(1).fillna(False)  # agera på nästa bar open (delay)
    return df

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", required=True)
    ap.add_argument("--days", type=int, default=120)
    ap.add_argument("--db", default="./db/quant.duckdb")
    args = ap.parse_args()

    bars = load_bars(args.db, args.symbol, args.days)
    if bars.empty:
        print("Inga bars.")
        return

    feats = add_common(bars, symbol=args.symbol)
    sig = simple_rule(feats)

    print(sig.tail(5)[["ts","open","high","low","close","ema_fast","ema_slow","rsi","second_hour","enter","enter_at"]])
    out = sig[["ts","symbol","close","ema_fast","ema_slow","rsi","atr","second_hour","enter","enter_at"]]
    out.to_csv(f"./reports/{args.symbol}_signals.csv", index=False)
    print(f"Sparade signaler: ./reports/{args.symbol}_signals.csv")

if __name__ == "__main__":
    main()
