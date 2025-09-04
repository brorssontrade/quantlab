import os, pandas as pd

def build_movers_snapshot(hotlists_path="storage/snapshots/hotlists/latest.parquet",
                          out="storage/snapshots/movers/latest.parquet"):
    if not os.path.exists(hotlists_path):
        return pd.DataFrame(), out
    df = pd.read_parquet(hotlists_path)
    use = "Rise5mPct" if "Rise5mPct" in df else ("NetPct" if "NetPct" in df else None)
    if not use:
        return pd.DataFrame(), out

    cols = [c for c in ["Symbol","Exchange","Last",use,"VolTot","LastTs","SnapshotAt"] if c in df.columns]
    top = df.sort_values(use, ascending=False)[cols].head(50).copy()
    bot = df.sort_values(use, ascending=True)[cols].head(50).copy()
    top["Side"] = "Top"
    bot["Side"] = "Bottom"
    outdf = pd.concat([top, bot], ignore_index=True)
    outdf.rename(columns={use:"Metric"}, inplace=True)
    outdf.to_parquet(out, index=False)
    return outdf, out

if __name__ == "__main__":
    df, path = build_movers_snapshot()
    print(f"OK movers → {path} rows={len(df)}")
