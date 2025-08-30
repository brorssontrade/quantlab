# src/quantkit/snapshots/breadth_snapshot.py
from __future__ import annotations
import os
from pathlib import Path
import typing as T

import pandas as pd
import typer
import yaml

DATA_ROOT = Path("storage")
PARQ_A_DIR = DATA_ROOT / "parquet"
PARQ_B_DIR = DATA_ROOT / "cache" / "eodhd"

S3_BUCKET = os.getenv("S3_BUCKET", "").strip()
S3_PREFIX = os.getenv("S3_PREFIX", f"s3://{S3_BUCKET}" if S3_BUCKET else "").rstrip("/")

app = typer.Typer(add_completion=False, help="Build breadth snapshots (by_symbol + agg).")

def _s3_opts() -> dict:
    opts: dict = {}
    region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
    if region:
        opts.setdefault("client_kwargs", {})["region_name"] = region
    if os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"):
        opts["key"] = os.getenv("AWS_ACCESS_KEY_ID")
        opts["secret"] = os.getenv("AWS_SECRET_ACCESS_KEY")
    return opts

def _read_watchlist_codes(path: str = "watchlist.yaml") -> list[str]:
    p = Path(path)
    if not p.exists():
        return []
    try:
        doc = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:
        return []
    items = doc.get("items", []) or doc.get("tickers", [])
    out: list[str] = []
    for it in items:
        code = it if isinstance(it, str) else (it or {}).get("code")
        if code:
            out.append(str(code).strip())
    return out

def _exchange_for(sym: str) -> str:
    if sym.endswith(".US"): return "US"
    if sym.endswith(".ST"): return "ST"
    return "OTHER"

def _path_candidates_local(symbol: str, interval: str) -> list[Path]:
    return [
        PARQ_A_DIR / symbol / f"{interval}.parquet",
        PARQ_B_DIR / f"{symbol}__{interval}.parquet",
    ]

def _path_candidates_s3(symbol: str, interval: str) -> list[str]:
    if not S3_PREFIX:
        return []
    return [
        f"{S3_PREFIX}/parquet/{symbol}/{interval}.parquet",
        f"{S3_PREFIX}/cache/eodhd/{symbol}__{interval}.parquet",
    ]

def _read_parquet_uri(uri: str) -> pd.DataFrame | None:
    try:
        storage_options = _s3_opts() if uri.startswith("s3://") else None
        df = pd.read_parquet(uri, storage_options=storage_options)
    except Exception:
        return None
    if "ts" in df.columns:
        df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
    for c in ("open","high","low","close","volume"):
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df.sort_values("ts").reset_index(drop=True)

def _read_parquet_if_exists(symbol: str, interval: str) -> pd.DataFrame | None:
    for u in _path_candidates_s3(symbol, interval):
        df = _read_parquet_uri(u)
        if df is not None: return df
    for p in _path_candidates_local(symbol, interval):
        if p.exists():
            df = _read_parquet_uri(str(p))
            if df is not None: return df
    return None

def _last_close(intra: pd.DataFrame | None, eod: pd.DataFrame | None) -> float | None:
    if isinstance(intra, pd.DataFrame) and "close" in intra.columns and not intra.empty:
        v = intra["close"].iloc[-1]
        return None if pd.isna(v) else float(v)
    if isinstance(eod, pd.DataFrame) and "close" in eod.columns and not eod.empty:
        v = eod["close"].iloc[-1]
        return None if pd.isna(v) else float(v)
    return None

def _prev_close(eod: pd.DataFrame | None) -> float | None:
    if eod is None or eod.empty or "close" not in eod.columns: return None
    c = eod["close"].dropna()
    if len(c) < 2: return None
    return float(c.iloc[-2])

def _pct(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b == 0: return None
    return (a / b - 1.0) * 100.0

def _hi_lo_52w(eod: pd.DataFrame | None) -> tuple[float | None, float | None]:
    if eod is None or eod.empty or "close" not in eod.columns:
        return None, None
    tail = pd.to_numeric(eod["close"], errors="coerce").dropna().tail(252)
    if tail.empty: return None, None
    return float(tail.max()), float(tail.min())

@app.command()
def build(
    tickers: str | None = typer.Option(None, "--tickers", "-t", help="Komma-separerat; default = watchlist.yaml"),
    out_sym: str | None = typer.Option(None, "--out-sym", help="Mål för per-symbol snapshot (parquet)"),
    out_agg: str | None = typer.Option(None, "--out-agg", help="Mål för aggregerad snapshot (parquet)"),
):
    # resolve outputs
    if out_sym is None:
        local = DATA_ROOT / "snapshots" / "breadth" / "by_symbol.parquet"
        local.parent.mkdir(parents=True, exist_ok=True)
        out_sym = f"{S3_PREFIX}/snapshots/breadth/by_symbol.parquet" if S3_PREFIX else str(local)
    if out_agg is None:
        local = DATA_ROOT / "snapshots" / "breadth" / "agg.parquet"
        local.parent.mkdir(parents=True, exist_ok=True)
        out_agg = f"{S3_PREFIX}/snapshots/breadth/agg.parquet" if S3_PREFIX else str(local)

    # resolve tickers
    syms = [s.strip() for s in (tickers or "") .split(",") if s.strip()]
    if not syms:
        syms = _read_watchlist_codes()
    if not syms:
        typer.echo("❌ Inga tickers (watchlist.yaml saknas?)")
        raise typer.Exit(1)

    # compute rows
    rows: list[dict] = []
    for sym in syms:
        intra = _read_parquet_if_exists(sym, "5m")
        eod   = _read_parquet_if_exists(sym, "EOD")
        last  = _last_close(intra, eod)
        prev  = _prev_close(eod)
        chg   = _pct(last, prev)
        hi52, lo52 = _hi_lo_52w(eod)
        new_hi = bool(last is not None and hi52 is not None and last >= hi52)
        new_lo = bool(last is not None and lo52 is not None and last <= lo52)

        rows.append({
            "Symbol": sym,
            "Exchange": _exchange_for(sym),
            "Last": last,
            "PrevClose": prev,
            "Pct": chg,
            "NewHigh52w": new_hi,
            "NewLow52w": new_lo,
        })

    by_symbol = pd.DataFrame(rows)

    # aggregate
    def _agg(g: pd.DataFrame) -> dict:
        p = pd.to_numeric(g["Pct"], errors="coerce")
        adv = int((p > 0).sum()); dec = int((p < 0).sum()); total = len(g)
        unch = max(total - adv - dec, 0)
        adr = (adv / max(dec, 1)) if (adv or dec) else None
        nh = int(g["NewHigh52w"].fillna(False).sum()); nl = int(g["NewLow52w"].fillna(False).sum())
        return {"Group": g.name, "Adv": adv, "Dec": dec, "Unch": unch, "Total": total, "ADR": adr, "NewHighs": nh, "NewLows": nl}

    agg = pd.concat([
        by_symbol.assign(Group="ALL").groupby("Group").apply(_agg).apply(pd.Series),
        by_symbol.groupby("Exchange").apply(_agg).apply(pd.Series)
    ], ignore_index=True)

    # write
    sym_opts = _s3_opts() if str(out_sym).startswith("s3://") else None
    agg_opts = _s3_opts() if str(out_agg).startswith("s3://") else None
    by_symbol.to_parquet(out_sym, index=False, storage_options=sym_opts)
    agg.to_parquet(out_agg, index=False, storage_options=agg_opts)

    typer.echo(f"✅ Wrote {len(by_symbol)} rows → {out_sym}")
    typer.echo(f"✅ Wrote {len(agg)} rows → {out_agg}")

if __name__ == "__main__":
    app()
