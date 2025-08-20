# cli_live.py
import argparse, os
import pandas as pd
import yfinance as yf

def _flatten_ohlcv(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        lv0 = [str(x).lower() for x in df.columns.get_level_values(0)]
        lv1 = [str(x).lower() for x in df.columns.get_level_values(1)]
        ohlcv = {"open","high","low","close","adj close","volume"}

        # OHLCV i nivå 0?
        if len(set(lv0) & ohlcv) >= 3:
            tickers = list(dict.fromkeys(df.columns.get_level_values(1)))  # unika, bevara ordning
            tgt = symbol.upper()
            if tgt in df.columns.get_level_values(1):
                df = df.xs(tgt, axis=1, level=1, drop_level=True)
            elif len(tickers) == 1:
                df = df.droplevel(1, axis=1)
            else:
                df = df.xs(tickers[0], axis=1, level=1, drop_level=True)
        # OHLCV i nivå 1?
        elif len(set(lv1) & ohlcv) >= 3:
            tickers = list(dict.fromkeys(df.columns.get_level_values(0)))
            tgt = symbol.upper()
            if tgt in df.columns.get_level_values(0):
                df = df.xs(tgt, axis=1, level=0, drop_level=True)
            elif len(tickers) == 1:
                df = df.droplevel(0, axis=1)
            else:
                df = df.xs(tickers[0], axis=1, level=0, drop_level=True)
        # annars: lämna som är (vi försöker ändå nedan)

    # Döpa om till standard
    rename_map = {
        "Open":"open","High":"high","Low":"low","Close":"close",
        "Adj Close":"adj_close","Volume":"volume"
    }
    df = df.rename(columns=rename_map)

    # Ta bara de vi behöver om de finns
    keep = [c for c in ["open","high","low","close","volume"] if c in df.columns]
    df = df[keep].copy()

    # Numeriskt
    for c in keep:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    return df

def fetch_yf(symbol: str, interval: str, days: int) -> pd.DataFrame:
    yf_interval = {"1h":"1h","1m":"1m"}[interval]
    period = f"{min(days,7)}d" if interval == "1m" else f"{days}d"

    df = yf.download(
        tickers=symbol,
        interval=yf_interval,
        period=period,
        auto_adjust=False,
        progress=False,
        prepost=False,
        threads=True,
    )
    if df is None or df.empty:
        return pd.DataFrame()

    # Platta ut och standardisera kolumner
    df = _flatten_ohlcv(df, symbol)

    if df.empty:
        return pd.DataFrame()

    # Gör index tz-aware i UTC
    idx = df.index
    try:
        if getattr(idx, "tz", None) is None:
            df.index = idx.tz_localize("UTC")
        else:
            df.index = idx.tz_convert("UTC")
    except Exception:
        pass

    df["symbol"] = symbol.upper()
    df["ts"] = df.index
    return df.reset_index(drop=True)[["ts","symbol","open","high","low","close","volume"]]

def save_parquet(df: pd.DataFrame, interval: str, symbol: str) -> tuple[str,int]:
    folder = f"./storage/parquet/raw_{interval}"
    os.makedirs(folder, exist_ok=True)
    out = os.path.join(folder, f"{symbol.upper()}.parquet")
    df.to_parquet(out, index=False)
    return out, len(df)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", required=True)
    ap.add_argument("--interval", choices=["1h","1m"], default="1h")
    ap.add_argument("--days", type=int, default=60)
    args = ap.parse_args()

    print(f"Hämtar {args.symbol} {args.interval} ~{args.days} dagar via Yahoo Finance…")
    df = fetch_yf(args.symbol, args.interval, args.days)
    if df.empty:
        print("Ingen data från yfinance.")
        return
    path, n = save_parquet(df, args.interval, args.symbol)
    print(f"Skrev {n} rader till {path}")

if __name__ == "__main__":
    main()
