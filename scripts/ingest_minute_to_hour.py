# scripts/ingest_minute_to_hour.py
import sys
import argparse, os
from datetime import datetime
import pandas as pd
import yfinance as yf
import yaml

# Tvinga UTF-8 ut (för Windows-runners/Actions)
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

STO_TZ = "Europe/Stockholm"

def pick_yf_interval(days: int):
    # 1m ≲ 7 d, 5m ≲ 60 d, annars 60m
    if days <= 7:
        return "1m", f"{days}d"
    elif days <= 60:
        return "5m", f"{days}d"
    else:
        return "60m", f"{min(days, 180)}d"

def fetch_yf_intraday(symbol: str, days: int) -> pd.DataFrame:
    interval, period = pick_yf_interval(days)
    df = yf.download(
        symbol,
        interval=interval,
        period=period,
        auto_adjust=False,
        prepost=False,
        progress=False,
        threads=False,
    )
    if df is None or df.empty:
        return pd.DataFrame()

    # Tidszon -> Stockholm
    idx = pd.to_datetime(df.index, utc=True).tz_convert(STO_TZ)
    df.index = idx

    # Platta ev. MultiIndex och normalisera kolumnnamn
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0].lower() for c in df.columns]
    else:
        df.columns = [str(c).lower() for c in df.columns]

    need = ["open", "high", "low", "close", "volume"]
    for c in need:
        if c not in df.columns:
            df[c] = pd.NA

    # Säkra numeriska typer
    for c in need:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    return df[need]

def resample_to_hour(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    """Resampla till 1h. För .ST använder vi offset=30min för 17:30-close."""
    if df.empty:
        return df
    is_sto = symbol.upper().endswith(".ST")
    offset = "30min" if is_sto else "0min"

    # Robust resample via DataFrame.agg
    h = (
        df.resample("60min", label="right", closed="right", offset=offset)
          .agg({"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"})
          .dropna(subset=["open", "high", "low", "close"])
    )

    # Filtrera öppettider
    if is_sto:
        t1 = datetime.strptime("09:30", "%H:%M").time()
        t2 = datetime.strptime("17:30", "%H:%M").time()
        mask = (h.index.time >= t1) & (h.index.time <= t2)
    else:
        ny = h.index.tz_convert("America/New_York")
        t1 = datetime.strptime("09:30", "%H:%M").time()
        t2 = datetime.strptime("16:00", "%H:%M").time()
        mask = (ny.time >= t1) & (ny.time <= t2)
    h = h[mask].copy()

    h["symbol"] = symbol
    h["ts"] = h.index
    return h[["ts", "symbol", "open", "high", "low", "close", "volume"]]

def save_partitioned_hourly(df: pd.DataFrame, root="./storage/parquet/raw_1h"):
    if df.empty:
        return 0
    df = df.copy()
    df["date"] = df["ts"].dt.tz_convert(STO_TZ).dt.date
    n = 0
    for (symbol, date), g in df.groupby(["symbol", "date"]):
        outdir = os.path.join(root, f"symbol={symbol}", f"date={date}")
        os.makedirs(outdir, exist_ok=True)
        g.drop(columns=["date"]).to_parquet(os.path.join(outdir, "part.parquet"), index=False)
        n += len(g)
    return n

def run_one(symbol: str, days: int):
    # ASCII i loggen för att undvika UnicodeEncodeError i vissa miljöer
    print(f"Hämtar {symbol} ~{days} dagar (1m/5m->1h)...")
    raw = fetch_yf_intraday(symbol, days)
    if raw.empty:
        print("Ingen data från yfinance.")
        return 0
    h = resample_to_hour(raw, symbol)
    rows = save_partitioned_hourly(h)
    print(f"Skrev {rows} rader 1h -> storage/parquet/raw_1h/symbol={symbol}/date=...")
    return rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol")
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--watchlist", default="config/watchlist.yml")
    args = ap.parse_args()

    if args.symbol:
        symbols = [args.symbol]
    else:
        symbols = []
        if os.path.exists(args.watchlist):
            with open(args.watchlist, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f) or {}
            symbols = list(cfg.get("tickers", []))
        if not symbols:
            print("Ingen symbol angiven och watchlist tom – avslutar.")
            return

    total = 0
    for s in symbols:
        total += run_one(s, args.days)
    print(f"Totalt skrivna rader: {total}")

if __name__ == "__main__":
    main()
