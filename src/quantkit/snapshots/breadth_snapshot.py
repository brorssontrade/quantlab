import os, pandas as pd

def build_breadth_snapshot(hotlists_path="storage/snapshots/hotlists/latest.parquet",
                           out="storage/snapshots/breadth/latest.parquet"):
    if not os.path.exists(hotlists_path):
        return pd.DataFrame(), out
    df = pd.read_parquet(hotlists_path)
    if "Exchange" not in df or "NetPct" not in df:
        return pd.DataFrame(), out

    g = df.groupby("Exchange", dropna=True)
    agg = g["NetPct"].agg(
        Advancing = lambda s: (s > 0).sum(),
        Declining = lambda s: (s < 0).sum(),
        Unchanged = lambda s: (s == 0).sum(),
    )
    agg["Total"]  = agg.sum(axis=1)
    agg["PctAdv"] = (agg["Advancing"] / agg["Total"] * 100.0).round(2)
    agg["PctDec"] = (agg["Declining"] / agg["Total"] * 100.0).round(2)
    agg["Ts"] = df.get("SnapshotAt", pd.Timestamp.utcnow().tz_localize("UTC")).iloc[0]
    agg = agg.reset_index()

    agg.to_parquet(out, index=False)
    return agg, out

if __name__ == "__main__":
    df, path = build_breadth_snapshot()
    print(f"OK breadth → {path} rows={len(df)}")
