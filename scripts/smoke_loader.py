from quantkit.data.eodhd_loader import load_bars
for sym in ["AAPL.US", "ABB.ST"]:
    df_eod = load_bars(sym, interval="EOD", debug=True)
    df_intra = load_bars(sym, interval="5m", debug=True)
    print(sym, "EOD rows:", len(df_eod), "Intra rows:", len(df_intra))
