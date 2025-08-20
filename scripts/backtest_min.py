import argparse, duckdb, numpy as np, pandas as pd
from datetime import timezone
import sys, pathlib
# gör sys.path säker även vid filkörning
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from engine.features import add_common

def load_bars(db, symbol, days):
    con = duckdb.connect(db)
    q = """
    SELECT * FROM bars_all
    WHERE symbol=? AND ts >= now() - INTERVAL ? DAY
    ORDER BY ts
    """
    return con.execute(q, [symbol, days]).df()

def simple_entry(df):
    """Samma som signals_example: andra timmen + EMA-faster över EMA-slow + RSI>55.
       Agera på NÄSTA bars open (delay)."""
    out = df.copy()
    out["enter"] = out["second_hour"] & (out["ema_fast"] > out["ema_slow"]) & (out["rsi"] > 55)
    out["enter_at"] = out["enter"].shift(1).fillna(False)  # next bar open
    # enkel exit: om ema_fast < ema_slow
    out["exit_sig"] = (out["ema_fast"] < out["ema_slow"])
    out["exit_at"] = out["exit_sig"].shift(1).fillna(False)  # next bar open
    return out

def run_bt(df, sl_atr=1.5, tp_atr=3.0, fee_bps=3.0):
    """Diskret 0/1 med fill på nästa open; ATR-baserad SL/TP intrabar."""
    cash = 1.0
    equity_curve = []
    in_pos = False
    entry_px = None
    stop = take = None
    entry_ts = None
    trades = []

    # Vi använder barens OPEN som exekveringspris (nästa bar open)
    opens, highs, lows, closes = df["open"].values, df["high"].values, df["low"].values, df["close"].values
    atr = df["atr"].values
    ts = pd.to_datetime(df["ts"]).values

    for i in range(len(df)):
        price_open = opens[i]
        price_high = highs[i]
        price_low  = lows[i]

        if not in_pos:
            if bool(df["enter_at"].iloc[i]) and not np.isnan(atr[i]):
                # köp på open
                entry_px = price_open * (1 + fee_bps/10000.0)
                stop = entry_px - sl_atr * atr[i]
                take = entry_px + tp_atr * atr[i]
                entry_ts = ts[i]
                in_pos = True
        else:
            exited = False
            # intrabar TP/SL
            if price_high >= take:
                exit_px = take * (1 - fee_bps/10000.0)
                exited = True
            elif price_low <= stop:
                exit_px = stop * (1 - fee_bps/10000.0)
                exited = True

            # eller ”signalsexit” på nästa open
            if not exited and bool(df["exit_at"].iloc[i]):
                exit_px = price_open * (1 - fee_bps/10000.0)
                exited = True

            if exited:
                ret = (exit_px / entry_px) - 1.0
                cash *= (1.0 + ret)
                trades.append({
                    "entry_ts": pd.Timestamp(entry_ts).isoformat(),
                    "exit_ts":  pd.Timestamp(ts[i]).isoformat(),
                    "entry_px": float(entry_px),
                    "exit_px":  float(exit_px),
                    "ret":      float(ret)
                })
                in_pos = False
                entry_px = stop = take = entry_ts = None

        equity_curve.append(cash)

    eq = pd.Series(equity_curve, index=pd.to_datetime(df["ts"]))
    return eq, pd.DataFrame(trades)

def metrics(eq, trades: pd.DataFrame):
    if eq.empty:
        return {"CAGR":0,"Sharpe":0,"MaxDD":0,"HitRate":0,"Trades":0}
    start, end = eq.index[0], eq.index[-1]
    years = max((end - start).total_seconds() / (365.25*24*3600), 1e-9)
    cagr = (eq.iloc[-1] / eq.iloc[0]) ** (1/years) - 1

    # Sharpe på trade-returns (enkel approx)
    if len(trades) >= 2:
        r = trades["ret"].values
        ann_factor = np.sqrt(len(r)/years)  # ”per trade” annualisering
        sharpe = (r.mean() / (r.std(ddof=1)+1e-12)) * ann_factor
    else:
        sharpe = 0.0

    # Max drawdown på equity
    rollmax = eq.cummax()
    dd = (eq/rollmax - 1).min()

    hit = float((trades["ret"] > 0).mean()) if len(trades) else 0.0

    return {"CAGR":float(cagr), "Sharpe":float(sharpe), "MaxDD":float(dd), "HitRate":float(hit), "Trades":int(len(trades))}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", required=True)
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--db", default="./db/quant.duckdb")
    ap.add_argument("--sl_atr", type=float, default=1.5)
    ap.add_argument("--tp_atr", type=float, default=3.0)
    ap.add_argument("--fee_bps", type=float, default=3.0)
    args = ap.parse_args()

    bars = load_bars(args.db, args.symbol, args.days)
    if bars.empty:
        print("Inga bars.")
        return

    feats = add_common(bars, symbol=args.symbol)
    sig = simple_entry(feats)
    eq, trades = run_bt(sig, sl_atr=args.sl_atr, tp_atr=args.tp_atr, fee_bps=args.fee_bps)

    m = metrics(eq, trades)
    print("RESULTAT:", m)

    # spara
    eq.to_frame("equity").to_csv(f"./reports/{args.symbol}_equity.csv", index_label="ts")
    trades.to_csv(f"./reports/{args.symbol}_trades.csv", index=False)
    pd.Series(m).to_json(f"./reports/{args.symbol}_metrics.json", indent=2)
    print(f"Sparade: reports/{args.symbol}_equity.csv, _trades.csv, _metrics.json")

if __name__ == "__main__":
    main()
