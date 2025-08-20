# scripts/plot_symbol.py
import os, argparse, duckdb, pandas as pd
import matplotlib.pyplot as plt

DB_PATH = "./db/quant.duckdb"
OUT_DIR = "./reports"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", required=True)
    ap.add_argument("--days", type=int, default=60)
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    con = duckdb.connect(DB_PATH)

    # OBS: parameterbindning bara för symbol; days sätts in som heltal i INTERVAL-strängen
    query = f"""
        SELECT ts, close
        FROM bars_all
        WHERE upper(symbol) = upper(?)
          AND ts >= now() - INTERVAL '{int(args.days)}' DAY
        ORDER BY ts
    """
    df = con.execute(query, [args.symbol]).df()

    if df.empty:
        print(f"Ingen data för {args.symbol} senaste {args.days} dagarna.")
        return

    df = df.set_index("ts").sort_index()
    df["sma20"] = df["close"].rolling(20, min_periods=1).mean()
    df["sma50"] = df["close"].rolling(50, min_periods=1).mean()

    plt.figure(figsize=(10,5))
    df["close"].plot(label="Close")
    df["sma20"].plot(label="SMA20")
    df["sma50"].plot(label="SMA50")
    plt.legend()
    plt.title(f"{args.symbol} — Close (senaste {args.days} d)")
    plt.grid(True)
    plt.tight_layout()

    out_path = os.path.join(OUT_DIR, f"{args.symbol}_close_{args.days}d.png")
    plt.savefig(out_path, dpi=120)
    print(f"Sparade graf: {out_path}")

if __name__ == "__main__":
    main()
