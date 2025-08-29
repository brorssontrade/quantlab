# src/quantkit/apps/hotlists.py
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Optional, Tuple

import pandas as pd
import streamlit as st
import yaml

TITLE = "🔥 Hot Lists"

DATA_ROOT = Path("storage")
PARQ_A_DIR = DATA_ROOT / "parquet"          # storage/parquet/<SYM>/{5m,EOD}.parquet
PARQ_B_DIR = DATA_ROOT / "cache" / "eodhd"  # storage/cache/eodhd/<SYM>__{5m,EOD}.parquet

# --- S3-konfig ---
S3_BUCKET = os.getenv("S3_BUCKET", "").strip()
S3_PREFIX = os.getenv("S3_PREFIX", f"s3://{S3_BUCKET}" if S3_BUCKET else "").rstrip("/")


def _s3_opts() -> dict:
    opts: dict = {}
    region = os.getenv("AWS_REGION")
    if region:
        opts.setdefault("client_kwargs", {})["region_name"] = region
    if os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"):
        opts["key"] = os.getenv("AWS_ACCESS_KEY_ID")
        opts["secret"] = os.getenv("AWS_SECRET_ACCESS_KEY")
    return opts


# ----------------------- helpers -----------------------

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
    if sym.endswith(".US"):
        return "US"
    if sym.endswith(".ST"):
        return "ST"
    return "OTHER"


def _tz_for(sym: str) -> str:
    ex = _exchange_for(sym)
    if ex == "US":
        return "America/New_York"
    if ex == "ST":
        return "Europe/Stockholm"
    return "UTC"


def _path_candidates_local(symbol: str, interval: str) -> list[Path]:
    a = PARQ_A_DIR / symbol / f"{interval}.parquet"
    b = PARQ_B_DIR / f"{symbol}__{interval}.parquet"
    return [a, b]


def _path_candidates_s3(symbol: str, interval: str) -> list[str]:
    if not S3_PREFIX:
        return []
    return [
        f"{S3_PREFIX}/parquet/{symbol}/{interval}.parquet",
        f"{S3_PREFIX}/cache/eodhd/{symbol}__{interval}.parquet",
    ]


def _read_parquet_uri(uri: str) -> Optional[pd.DataFrame]:
    try:
        storage_options = _s3_opts() if uri.startswith("s3://") else None
        df = pd.read_parquet(uri, storage_options=storage_options)
    except Exception:
        return None
    if "ts" in df.columns:
        df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
    for c in ("open", "high", "low", "close", "volume"):
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df.sort_values("ts").reset_index(drop=True)


def _read_parquet_if_exists(symbol: str, interval: str) -> Optional[pd.DataFrame]:
    for uri in _path_candidates_s3(symbol, interval):
        df = _read_parquet_uri(uri)
        if df is not None:
            return df
    for p in _path_candidates_local(symbol, interval):
        if p.exists():
            df = _read_parquet_uri(str(p))
            if df is not None:
                return df
    return None


def _last_safe(series: pd.Series) -> Optional[float]:
    if series is None or series.empty:
        return None
    v = series.iloc[-1]
    return None if pd.isna(v) else float(v)


def _pct(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None or b is None or b == 0:
        return None
    return (a / b - 1.0) * 100.0


def _session_slice_local(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    """Senaste handelsdag (lokal tidzon)."""
    if df is None or df.empty or "ts" not in df.columns:
        return df.iloc[0:0]
    tz = _tz_for(symbol)
    local = df["ts"].dt.tz_convert(tz)
    last_day = local.dt.date.max()
    return df.loc[local.dt.date == last_day]


def _n_days_ret(eod: pd.DataFrame, n: int) -> Optional[float]:
    if eod is None or eod.empty or "close" not in eod.columns:
        return None
    closes = eod["close"].dropna()
    if len(closes) <= n:
        return None
    last = float(closes.iloc[-1])
    prev = float(closes.iloc[-1 - n])
    return _pct(last, prev)


def _rise_minutes_pct(intra5: pd.DataFrame, minutes: int) -> Optional[float]:
    if intra5 is None or intra5.empty:
        return None
    last_ts = intra5["ts"].iloc[-1]
    cutoff = last_ts - pd.Timedelta(minutes=minutes)
    prev = intra5.loc[intra5["ts"] <= cutoff, "close"]
    if prev.empty:
        return None
    ref = float(prev.iloc[-1])
    last = float(intra5["close"].iloc[-1])
    return _pct(last, ref)


def _today_pct_vs_open(intra5: pd.DataFrame, symbol: str) -> Optional[float]:
    sess = _session_slice_local(intra5, symbol)
    if sess.empty:
        return None
    o = float(sess["open"].iloc[0])
    last = float(sess["close"].iloc[-1])
    return _pct(last, o)


def _today_range_pct(intra5: pd.DataFrame, symbol: str) -> Optional[float]:
    sess = _session_slice_local(intra5, symbol)
    if sess.empty:
        return None
    hi = float(sess["high"].max())
    lo = float(sess["low"].min())
    o = float(sess["open"].iloc[0])
    if o == 0:
        return None
    return ((hi - lo) / o) * 100.0


def _gap_pct(symbol: str, intra5: pd.DataFrame, eod: pd.DataFrame) -> Optional[float]:
    if eod is None or eod.empty or intra5 is None or intra5.empty:
        return None
    eodc = eod["close"].dropna()
    if len(eodc) < 2:
        return None
    prev_close = float(eodc.iloc[-2])
    sess = _session_slice_local(intra5, symbol)
    if sess.empty or "open" not in sess.columns:
        return None
    day_open = float(sess["open"].iloc[0])
    return _pct(day_open, prev_close)


def _sma(series: pd.Series, n: int) -> Optional[float]:
    if series is None:
        return None
    s = pd.to_numeric(series, errors="coerce").dropna().tail(n)
    if len(s) < n:
        return None
    return float(s.mean())


def _rsi14(eod: pd.DataFrame) -> Optional[float]:
    if eod is None or eod.empty or "close" not in eod.columns:
        return None
    c = pd.to_numeric(eod["close"], errors="coerce").dropna()
    if len(c) < 15:
        return None
    diff = c.diff()
    gain = diff.clip(lower=0.0)
    loss = -diff.clip(upper=0.0)
    avg_gain = gain.rolling(14).mean()
    avg_loss = loss.rolling(14).mean()
    rs = avg_gain / avg_loss.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))
    val = rsi.iloc[-1]
    return None if pd.isna(val) else float(val)


def _atr14(eod: pd.DataFrame) -> Tuple[Optional[float], Optional[float]]:
    """Returnerar ATR och ATR%."""
    cols_ok = all(c in (eod.columns if eod is not None else []) for c in ("high", "low", "close"))
    if not cols_ok:
        return None, None
    df = eod[["high", "low", "close"]].dropna().copy()
    if len(df) < 15:
        return None, None
    prev_close = df["close"].shift(1)
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - prev_close).abs(),
        (df["low"] - prev_close).abs(),
    ], axis=1).max(axis=1)
    atr = tr.rolling(14).mean().iloc[-1]
    last_close = df["close"].iloc[-1]
    atrpct = (atr / last_close) * 100.0 if last_close else None
    return float(atr), (None if atrpct is None or pd.isna(atrpct) else float(atrpct))


def _roll_52w_metrics(eod: pd.DataFrame) -> tuple[Optional[float], Optional[float]]:
    if eod is None or eod.empty or "close" not in eod.columns:
        return None, None
    tail = eod["close"].dropna().tail(252)
    if tail.empty:
        return None, None
    return float(tail.max()), float(tail.min())


def _assemble_row(symbol: str) -> dict:
    ex = _exchange_for(symbol)

    intra = _read_parquet_if_exists(symbol, "5m")
    eod = _read_parquet_if_exists(symbol, "EOD")

    last = _last_safe(intra["close"]) if isinstance(intra, pd.DataFrame) and "close" in intra else None
    if last is None:
        last = _last_safe(eod["close"]) if isinstance(eod, pd.DataFrame) and "close" in eod else None

    tz = _tz_for(symbol)
    last_ts_local = None
    if isinstance(intra, pd.DataFrame) and not intra.empty:
        last_ts_local = intra["ts"].iloc[-1].tz_convert(tz).strftime("%Y-%m-%d %H:%M")
    elif isinstance(eod, pd.DataFrame) and not eod.empty:
        last_ts_local = eod["ts"].iloc[-1].tz_convert(tz).strftime("%Y-%m-%d %H:%M")

    sess = _session_slice_local(intra, symbol) if isinstance(intra, pd.DataFrame) else None
    day_open = _last_safe(sess["open"]) if isinstance(sess, pd.DataFrame) and not sess.empty else None
    day_high = None if sess is None or sess.empty else float(sess["high"].max())
    day_low = None if sess is None or sess.empty else float(sess["low"].min())
    day_close = last if sess is not None and not sess.empty else None
    vol_tot = None if sess is None or sess.empty or "volume" not in sess.columns else float(sess["volume"].sum())

    prev_close = None
    if isinstance(eod, pd.DataFrame) and not eod.empty and "close" in eod.columns and len(eod["close"].dropna()) >= 2:
        prev_close = float(eod["close"].dropna().iloc[-2])
    netchg = None if last is None or prev_close is None else last - prev_close
    netpct = _pct(last, prev_close)

    # Nya intradag / idag-mått
    rise5 = _rise_minutes_pct(intra, 5)
    rise15 = _rise_minutes_pct(intra, 15)
    rise60 = _rise_minutes_pct(intra, 60)
    today_pct = _today_pct_vs_open(intra, symbol)
    today_rng = _today_range_pct(intra, symbol)

    # Fler EOD-returer
    ret1 = _n_days_ret(eod, 1)
    ret5 = _n_days_ret(eod, 5)
    ret10 = _n_days_ret(eod, 10)
    ret20 = _n_days_ret(eod, 20)
    ret30 = _n_days_ret(eod, 30)
    ret60 = _n_days_ret(eod, 60)

    # Gap
    gap = _gap_pct(symbol, intra, eod)

    # 52w
    hi52, lo52 = _roll_52w_metrics(eod)
    above52 = None if hi52 is None or last is None or last <= hi52 else _pct(last, hi52)
    below52 = None if lo52 is None or last is None or last >= lo52 else _pct(last, lo52)
    near_hi = None if hi52 is None or last is None else _pct(last, hi52)
    near_lo = None if lo52 is None or last is None else _pct(last, lo52)

    # MA-distanser
    ma20 = _sma(eod["close"] if isinstance(eod, pd.DataFrame) else None, 20)
    ma50 = _sma(eod["close"] if isinstance(eod, pd.DataFrame) else None, 50)
    ma200 = _sma(eod["close"] if isinstance(eod, pd.DataFrame) else None, 200)
    ma20pct = _pct(last, ma20) if ma20 else None
    ma50pct = _pct(last, ma50) if ma50 else None
    ma200pct = _pct(last, ma200) if ma200 else None

    # RSI / ATR
    rsi14 = _rsi14(eod)
    _, atrpct = _atr14(eod)

    return {
        "Symbol": symbol,
        "Exchange": ex,
        "Last": last,
        "LastTs": last_ts_local,
        "NetChg": netchg,
        "NetPct": netpct,
        "Open": day_open,
        "High": day_high,
        "Low": day_low,
        "Close": day_close,
        "VolTot": vol_tot,
        "Trades": "-",
        "Rise5mPct": rise5,
        "Rise15mPct": rise15,
        "Rise30mPct": _rise_minutes_pct(intra, 30),
        "Rise60mPct": rise60,
        "TodayPct": today_pct,
        "TodayRangePct": today_rng,
        "GapPct": gap,
        "Ret1D": ret1,
        "Ret5D": ret5,
        "Ret10D": ret10,
        "Ret20D": ret20,
        "Ret30D": ret30,
        "Ret60D": ret60,
        "Above52wPct": above52,
        "Below52wPct": below52,
        "Near52wHighPct": near_hi,
        "Near52wLowPct": near_lo,
        "MA20Pct": ma20pct,
        "MA50Pct": ma50pct,
        "MA200Pct": ma200pct,
        "RSI14": rsi14,
        "ATRpct": atrpct,
        "_has_intra": intra is not None,
        "_has_eod": eod is not None,
    }


# ----------------------- UI -----------------------

ACTIVITIES = {
    # Intraday momentum
    "Rapidly Rising (5m %)": ("Rise5mPct", True),
    "Rapidly Falling (5m %)": ("Rise5mPct", False),
    "Rapidly Rising (15m %)": ("Rise15mPct", True),
    "Rapidly Falling (15m %)": ("Rise15mPct", False),
    "Rapidly Rising (30m %)": ("Rise30mPct", True),
    "Rapidly Falling (30m %)": ("Rise30mPct", False),
    "Rapidly Rising (60m %)": ("Rise60mPct", True),
    "Rapidly Falling (60m %)": ("Rise60mPct", False),

    # Dagens utveckling
    "Today % vs Open": ("TodayPct", True),
    "Range Today %": ("TodayRangePct", True),

    # Klassiska returer
    "% Gainers (1 Day)": ("Ret1D", True),
    "% Losers (1 Day)": ("Ret1D", False),
    "% Gainers (5 Days)": ("Ret5D", True),
    "% Losers (5 Days)": ("Ret5D", False),
    "% Gainers (10 Days)": ("Ret10D", True),
    "% Losers (10 Days)": ("Ret10D", False),
    "% Gainers (20 Days)": ("Ret20D", True),
    "% Losers (20 Days)": ("Ret20D", False),
    "% Gainers (30 Days)": ("Ret30D", True),
    "% Losers (30 Days)": ("Ret30D", False),
    "% Gainers (60 Days)": ("Ret60D", True),
    "% Losers (60 Days)": ("Ret60D", False),

    # Gap
    "Gap Up % (vs prev close)": ("GapPct", True),
    "Gap Down % (vs prev close)": ("GapPct", False),

    # 52w
    "Break Above 52w High %": ("Above52wPct", True),
    "Break Below 52w Low %": ("Below52wPct", False),
    "Approaching 52w High %": ("Near52wHighPct", True),
    "Approaching 52w Low %": ("Near52wLowPct", False),

    # Trend/volatilitet
    "Above MA20 %": ("MA20Pct", True),
    "Below MA20 %": ("MA20Pct", False),
    "Above MA50 %": ("MA50Pct", True),
    "Below MA50 %": ("MA50Pct", False),
    "Above MA200 %": ("MA200Pct", True),
    "Below MA200 %": ("MA200Pct", False),
    "RSI(14) Highest": ("RSI14", True),
    "RSI(14) Lowest": ("RSI14", False),
    "ATR% (14) Highest": ("ATRpct", True),
    "ATR% (14) Lowest": ("ATRpct", False),
}

st.set_page_config(page_title="Hot Lists", layout="wide")

# Sidebar
st.sidebar.subheader("Uppdatering")
every = st.sidebar.number_input("Auto-refresh (sek)", min_value=10, max_value=600, value=60, step=5)
st.sidebar.caption("Sidan laddas om automatiskt.")

st.title(TITLE)
src_label = "S3 (EOD/5m)" if S3_PREFIX else "lokala Parquet (EOD/5m)"
st.caption(f"Datakälla: {src_label} uppdaterade via dina GitHub Actions eller lokala körningar.")

ex_choice = st.sidebar.selectbox("Exchange", ["ALL", "US", "ST"], index=0)

all_syms = _read_watchlist_codes()
if not all_syms:
    st.warning("Hittade ingen `watchlist.yaml`. Lägg in dina tickers där.")
    st.stop()

if ex_choice != "ALL":
    all_syms = [s for s in all_syms if _exchange_for(s) == ex_choice]

pick = st.sidebar.multiselect("Tickers (valfritt)", options=all_syms, default=[])
syms = pick if pick else all_syms

act_label = st.sidebar.selectbox("Activity", list(ACTIVITIES.keys()), index=0)
metric, desc_order = ACTIVITIES[act_label]
topn = int(st.sidebar.slider("Results", min_value=10, max_value=200, value=60, step=5))

# ----------------------- data build -----------------------

rows = []
missing = 0
for s in syms:
    row = _assemble_row(s)
    if not row["_has_intra"] and not row["_has_eod"]:
        missing += 1
    rows.append(row)

if missing:
    st.caption(f"Obs: saknar data för **{missing}** tickers (visar `None`). Fyll på via CLI eller låt Actions tugga.")

df = pd.DataFrame(rows)
if df.empty:
    st.info("Ingen symbol matchade filtret.")
    st.stop()

# rank & sortering på vald aktivitet
sort_series = pd.to_numeric(df[metric], errors="coerce") if metric in df.columns else pd.Series([None]*len(df))
df = df.assign(_rank_metric=sort_series)
df = df.sort_values("_rank_metric", ascending=not desc_order, na_position="last").head(topn)

# Kolumnordning: rank + aktivitet direkt efter Symbol
df.insert(0, "#", range(1, len(df) + 1))
col_order = [
    "#", "Symbol", metric, "Exchange", "Last", "LastTs", "NetChg", "NetPct",
    "Open", "High", "Low", "Close", "VolTot", "Trades",
    "Rise5mPct", "Rise15mPct", "Rise30mPct", "Rise60mPct",
    "TodayPct", "TodayRangePct",
    "GapPct",
    "Ret1D", "Ret5D", "Ret10D", "Ret20D", "Ret30D", "Ret60D",
    "Above52wPct", "Below52wPct", "Near52wHighPct", "Near52wLowPct",
    "MA20Pct", "MA50Pct", "MA200Pct",
    "RSI14", "ATRpct",
]
col_order = [c for c in col_order if c in df.columns]
df = df[col_order]

# Gör kolumnnamn unika för Styler.map
df = df.loc[:, ~pd.Index(df.columns).duplicated()].reset_index(drop=True)

# styling/format
pct_cols = [c for c in df.columns if c.endswith("Pct") or c.startswith("Ret")]
chg_cols = [c for c in ["NetChg"] if c in df.columns]
num_cols = [c for c in ["Last", "Open", "High", "Low", "Close"] if c in df.columns]
vol_cols = [c for c in ["VolTot"] if c in df.columns]

def _color_posneg(v):
    try:
        x = float(v)
    except Exception:
        return ""
    if pd.isna(x):
        return ""
    if x > 0:
        return "color: #0a7d32; font-weight: 600;"
    if x < 0:
        return "color: #c92a2a; font-weight: 600;"
    return ""

styler = df.style
if pct_cols:
    styler = styler.map(_color_posneg, subset=pd.IndexSlice[:, pct_cols])
if chg_cols:
    styler = styler.map(_color_posneg, subset=pd.IndexSlice[:, chg_cols])

fmt_map = {}
for c in pct_cols:
    fmt_map[c] = "{:+.2f}%"
for c in chg_cols:
    fmt_map[c] = "{:+,.2f}"
for c in num_cols:
    fmt_map[c] = "{:,.2f}"
for c in vol_cols:
    fmt_map[c] = "{:,.0f}"
styler = styler.format(fmt_map, na_rep="None")

st.subheader(act_label)
st.dataframe(styler, height=650, width="stretch")
st.caption("Tips: EU-volym kan vara 0 i realtid med vissa källor. 52w baseras på ~252 EOD-dagar.")

# Auto-refresh
if every and every > 0:
    time.sleep(float(every))
    st.rerun()
