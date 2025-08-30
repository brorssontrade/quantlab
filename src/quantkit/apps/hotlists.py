# src/quantkit/apps/hotlists.py
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional, Tuple, List

import pandas as pd
import streamlit as st
import yaml
import time

TITLE = "🔥 Hot Lists"

DATA_ROOT = Path("storage")
PARQ_A_DIR = DATA_ROOT / "parquet"          # storage/parquet/<SYM>/{5m,EOD}.parquet
PARQ_B_DIR = DATA_ROOT / "cache" / "eodhd"  # storage/cache/eodhd/<SYM>__{5m,EOD}.parquet

# --- S3 ---
S3_BUCKET = os.getenv("S3_BUCKET", "").strip()
S3_PREFIX = os.getenv("S3_PREFIX", f"s3://{S3_BUCKET}" if S3_BUCKET else "").rstrip("/")

def _s3_opts() -> dict:
    opts: dict = {}
    region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
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
    if a is None or b is None or not b:
        return None
    return (a / b - 1.0) * 100.0

def _session_slice_local(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    if df is None or not isinstance(df, pd.DataFrame) or df.empty or "ts" not in df.columns:
        return pd.DataFrame(columns=["ts","open","high","low","close","volume"]).iloc[0:0]
    tz = _tz_for(symbol)
    local = df["ts"].dt.tz_convert(tz)
    last_day = local.dt.date.max()
    return df[local.dt.date == last_day]

def _today_pct_vs_open(intra5: pd.DataFrame | None, symbol: str) -> Optional[float]:
    sess = _session_slice_local(intra5, symbol)
    if sess.empty:
        return None
    o = float(sess["open"].iloc[0])
    last = float(sess["close"].iloc[-1])
    return _pct(last, o)

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

    # Intraday / idag-mått
    rise5  = _rise_minutes_pct(intra, 5)
    rise15 = _rise_minutes_pct(intra, 15)
    rise30 = _rise_minutes_pct(intra, 30)
    rise60 = _rise_minutes_pct(intra, 60)

    from_open = _pct(last, day_open) if (last is not None and day_open is not None) else None
    range_pct = None
    range_pos = None
    if day_high is not None and day_low is not None and day_open is not None and day_high > day_low:
        range_pct = ((day_high - day_low) / day_open) * 100.0
        if last is not None:
            range_pos = ((last - day_low) / (day_high - day_low)) * 100.0  # 0=low, 100=high

    # 30d snittvolym (EOD) vs dagens volym
    vol_surge = None
    if vol_tot is not None and isinstance(eod, pd.DataFrame) and "volume" in eod.columns:
        avg30 = eod["volume"].dropna().tail(30).mean()
        if avg30 and avg30 > 0:
            vol_surge = (vol_tot / avg30) * 100.0

    # Fler EOD-returer
    def _n_days_ret(eod: pd.DataFrame, n: int) -> Optional[float]:
        if eod is None or eod.empty or "close" not in eod.columns: return None
        closes = eod["close"].dropna()
        if len(closes) <= n: return None
        last_ = float(closes.iloc[-1]); prev_ = float(closes.iloc[-1 - n])
        return _pct(last_, prev_)

    ret1  = _n_days_ret(eod, 1)
    ret5  = _n_days_ret(eod, 5)
    ret10 = _n_days_ret(eod, 10)
    ret20 = _n_days_ret(eod, 20)
    ret30 = _n_days_ret(eod, 30)
    ret60 = _n_days_ret(eod, 60)

    # Gap & trend/volatilitet
    gap = _gap_pct(symbol, intra, eod)
    ma20 = _sma(eod["close"] if isinstance(eod, pd.DataFrame) else None, 20)
    ma50 = _sma(eod["close"] if isinstance(eod, pd.DataFrame) else None, 50)
    ma200 = _sma(eod["close"] if isinstance(eod, pd.DataFrame) else None, 200)
    ma20pct = _pct(last, ma20) if ma20 else None
    ma50pct = _pct(last, ma50) if ma50 else None
    ma200pct = _pct(last, ma200) if ma200 else None
    rsi14 = _rsi14(eod)
    _, atrpct = _atr14(eod)

    return {
        "Symbol": symbol,
        "Exchange": ex,
        "Last": last,
        "LastTs": last_ts_local,

        "NetChg": netchg,
        "NetPct": netpct,

        "Open": day_open, "High": day_high, "Low": day_low, "Close": day_close,
        "VolTot": vol_tot, "Trades": "-",

        "Rise5mPct": rise5, "Rise15mPct": rise15, "Rise30mPct": rise30, "Rise60mPct": rise60,
        "FromOpenPct": from_open, "RangePct": range_pct, "RangePosPct": range_pos, "VolSurgePct": vol_surge,

        "GapPct": gap,

        "Ret1D": ret1, "Ret5D": ret5, "Ret10D": ret10, "Ret20D": ret20, "Ret30D": ret30, "Ret60D": ret60,

        "MA20Pct": ma20pct, "MA50Pct": ma50pct, "MA200Pct": ma200pct,
        "RSI14": rsi14, "ATRpct": atrpct,
    }

# ----------------------- UI -----------------------
ACTIVITIES = {
    "Rapidly Rising (5m %)": ("Rise5mPct", True),
    "Rapidly Falling (5m %)": ("Rise5mPct", False),
    "Rapidly Rising (15m %)": ("Rise15mPct", True),
    "Rapidly Falling (15m %)": ("Rise15mPct", False),
    "Rapidly Rising (30m %)": ("Rise30mPct", True),
    "Rapidly Falling (30m %)": ("Rise30mPct", False),
    "Rapidly Rising (60m %)": ("Rise60mPct", True),
    "Rapidly Falling (60m %)": ("Rise60mPct", False),
    "Today % vs Open": ("FromOpenPct", True),
    "Range Today % (wide first)": ("RangePct", True),
    "Near High (RangePos %)": ("RangePosPct", True),
    "Near Low (RangePos %)": ("RangePosPct", False),
    "Volume Surge % (vs 30d avg)": ("VolSurgePct", True),
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
    "Gap Up % (vs prev close)": ("GapPct", True),
    "Gap Down % (vs prev close)": ("GapPct", False),
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

# SIDEBAR
st.sidebar.subheader("Uppdatering")
every = st.sidebar.number_input("Auto-refresh (sek)", min_value=0, max_value=600, value=30, step=5)
if every:
    st.autorefresh(interval=int(every) * 1000, key="hotlists_autorefresh")

st.title(TITLE)
src_label = "S3 snapshots" if S3_PREFIX else "lokala snapshots"
st.caption(f"Primärt läses snapshot. Om saknas → fallback till Parquet per symbol.")

ex_choice = st.sidebar.selectbox("Exchange", ["ALL", "US", "ST"], index=0)

# ---- SNAPSHOT FIRST ----
def _snapshot_candidates() -> List[str]:
    c = []
    if S3_PREFIX:
        c.append(f"{S3_PREFIX}/snapshots/hotlists/latest.parquet")
    c.append(str(DATA_ROOT / "snapshots" / "hotlists" / "latest.parquet"))
    return c

@st.cache_data(ttl=30, show_spinner=False)
def _load_snapshot() -> Optional[pd.DataFrame]:
    for u in _snapshot_candidates():
        try:
            df = pd.read_parquet(u, storage_options=_s3_opts() if u.startswith("s3://") else None)
            if df is not None and not df.empty:
                return df
        except Exception:
            pass
    return None

snap = _load_snapshot()
if snap is not None:
    df = snap.copy()
    # backcompat: se till att kolumner finns
    if ex_choice != "ALL" and "Exchange" in df.columns:
        df = df[df["Exchange"] == ex_choice]

    all_syms = df["Symbol"].tolist() if "Symbol" in df.columns else []
    pick = st.sidebar.multiselect("Tickers (valfritt)", options=all_syms, default=[])
    if pick:
        df = df[df["Symbol"].isin(pick)]

    act_label = st.sidebar.selectbox("Activity", list(ACTIVITIES.keys()), index=0)
    metric, desc_order = ACTIVITIES[act_label]
    topn = int(st.sidebar.slider("Results", min_value=10, max_value=200, value=60, step=5))

    if metric not in df.columns:
        st.error(f"Snapshot saknar kolumnen `{metric}`. Uppdatera hotlists_snapshot.py.")
        st.stop()

    # rank & sort
    sort_series = pd.to_numeric(df[metric], errors="coerce")
    df = df.assign(_rank_metric=sort_series)
    df = df.sort_values("_rank_metric", ascending=not desc_order, na_position="last").head(topn)

    # kolumnordning
    df.insert(0, "#", range(1, len(df) + 1))
    col_order = [
        "#", "Symbol", metric, "Exchange", "Last", "LastTs", "NetChg", "NetPct",
        "FromOpenPct", "RangePct", "RangePosPct", "VolSurgePct",
        "Open", "High", "Low", "Close", "VolTot", "Trades",
        "Rise5mPct", "Rise15mPct", "Rise30mPct", "Rise60mPct",
        "GapPct",
        "Ret1D", "Ret5D", "Ret10D", "Ret20D", "Ret30D", "Ret60D",
        "MA20Pct", "MA50Pct", "MA200Pct",
        "RSI14", "ATRpct",
    ]
    col_order = [c for c in col_order if c in df.columns]
    df = df[col_order]
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
        if x > 0: return "color: #0a7d32; font-weight: 600;"
        if x < 0: return "color: #c92a2a; font-weight: 600;"
        return ""

    styler = df.style
    if pct_cols: styler = styler.map(_color_posneg, subset=pd.IndexSlice[:, pct_cols])
    if chg_cols: styler = styler.map(_color_posneg, subset=pd.IndexSlice[:, chg_cols])

    fmt_map = {}
    for c in pct_cols: fmt_map[c] = "{:+.2f}%"
    for c in chg_cols: fmt_map[c] = "{:+,.2f}"
    for c in num_cols: fmt_map[c] = "{:,.2f}"
    for c in vol_cols: fmt_map[c] = "{:,.0f}"
    styler = styler.format(fmt_map, na_rep="None")

    st.subheader(act_label + " — snapshot")
    st.dataframe(styler, height=650, use_container_width=True)
    st.caption("Källa: Hot Lists snapshot. (Uppdateras av workflow.)")
    st.stop()

# ---- FALLBACK (långsamt), men cachad ----
st.warning("Ingen Hot Lists-snapshot hittad – visar fallback (kan gå långsammare).")

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

@st.cache_data(ttl=60, show_spinner=True)
def _compute_rows_cached(symbols: List[str]) -> pd.DataFrame:
    rows = []
    for s in symbols:
        rows.append(_assemble_row(s))
    return pd.DataFrame(rows)

df = _compute_rows_cached(syms)
if df.empty:
    st.info("Ingen symbol matchade filtret.")
    st.stop()

sort_series = pd.to_numeric(df[metric], errors="coerce") if metric in df.columns else pd.Series([None]*len(df))
df = df.assign(_rank_metric=sort_series)
df = df.sort_values("_rank_metric", ascending=not desc_order, na_position="last").head(topn)

df.insert(0, "#", range(1, len(df) + 1))
col_order = [
    "#", "Symbol", metric, "Exchange", "Last", "LastTs", "NetChg", "NetPct",
    "FromOpenPct", "RangePct", "RangePosPct", "VolSurgePct",
    "Open", "High", "Low", "Close", "VolTot", "Trades",
    "Rise5mPct", "Rise15mPct", "Rise30mPct", "Rise60mPct",
    "GapPct",
    "Ret1D", "Ret5D", "Ret10D", "Ret20D", "Ret30D", "Ret60D",
    "MA20Pct", "MA50Pct", "MA200Pct",
    "RSI14", "ATRpct",
]
col_order = [c for c in col_order if c in df.columns]
df = df[col_order]
df = df.loc[:, ~pd.Index(df.columns).duplicated()].reset_index(drop=True)

pct_cols = [c for c in df.columns if c.endswith("Pct") or c.startswith("Ret")]
chg_cols = [c for c in ["NetChg"] if c in df.columns]
num_cols = [c for c in ["Last", "Open", "High", "Low", "Close"] if c in df.columns]
vol_cols = [c for c in ["VolTot"] if c in df.columns]

def _color_posneg(v):
    try:
        x = float(v)
    except Exception:
        return ""
    if pd.isna(x): return ""
    if x > 0: return "color: #0a7d32; font-weight: 600;"
    if x < 0: return "color: #c92a2a; font-weight: 600;"
    return ""

styler = df.style
if pct_cols: styler = styler.map(_color_posneg, subset=pd.IndexSlice[:, pct_cols])
if chg_cols: styler = styler.map(_color_posneg, subset=pd.IndexSlice[:, chg_cols])

fmt_map = {}
for c in pct_cols: fmt_map[c] = "{:+.2f}%"
for c in chg_cols: fmt_map[c] = "{:+,.2f}"
for c in num_cols: fmt_map[c] = "{:,.2f}"
for c in vol_cols: fmt_map[c] = "{:,.0f}"
styler = styler.format(fmt_map, na_rep="None")

st.subheader(act_label + " — fallback")
st.dataframe(styler, height=650, use_container_width=True)
st.caption("Tips: Skapa snapshot-workflow för omedelbar laddning i appen.")
