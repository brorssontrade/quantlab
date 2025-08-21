# scripts/live_alerts.py
import argparse
import os
import json
import pathlib
import sys
from datetime import datetime, timezone
import numpy as np
import pandas as pd
import requests
import duckdb

# yfinance (endast om --source yahoo)
try:
    import yfinance as yf
except Exception:
    yf = None

# gör sys.path fungerande vid "python -m scripts.live_alerts"
sys.path.insert(0, str(pathlib.Path(__file__).resolve()).rsplit("\\scripts\\", 1)[0])
from engine.features import add_common   # era indikatorer
from scripts.backtest_min import REPORTS_DIR  # återanvänd rapport-mappen

DB_PATH = pathlib.Path("./db/quant.duckdb")
STATE_DIR = pathlib.Path("./state")
STATE_DIR.mkdir(parents=True, exist_ok=True)
STATE_FILE = STATE_DIR / "live_alerts_state.json"


# ----------------------- utils -----------------------

def _utc_now_floor_hour():
    now = datetime.now(timezone.utc)
    return now.replace(minute=0, second=0, microsecond=0)

def load_state():
    if STATE_FILE.exists():
        try:
            return json.load(open(STATE_FILE, "r", encoding="utf-8"))
        except Exception:
            return {}
    return {}

def save_state(s: dict):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(s, f, ensure_ascii=False, allow_nan=False)

def to_bool(x):
    return str(x).lower() in ("1","true","yes","y","on")

def read_optuna_best(symbol: str) -> dict | None:
    p = REPORTS_DIR / f"{symbol}_optuna_best.json"
    if not p.exists():
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def _fmt2(x, n=2):
    try:
        return f"{float(x):.{n}f}"
    except Exception:
        return "n/a"


# ------------------ DuckDB I/O ------------------

def ensure_tables(con):
    con.execute("""
        CREATE TABLE IF NOT EXISTS bars_1m (
            symbol VARCHAR,
            ts TIMESTAMP,            -- UTC
            open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE,
            volume DOUBLE
        );
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS bars_1h (
            symbol VARCHAR,
            ts TIMESTAMP,            -- UTC, timstängning (t.ex. 10:00, 11:00)
            open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE,
            volume DOUBLE
        );
    """)

def upsert_1m(con, df: pd.DataFrame, symbol: str):
    if df is None or df.empty:
        return 0
    df = df.copy()
    df["symbol"] = symbol
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    con.register("tmp_in_1m", df)
    con.execute("BEGIN")
    try:
        con.execute("""
            CREATE TEMP TABLE _tmp1m AS
            SELECT symbol, ts, open, high, low, close, volume FROM tmp_in_1m;
        """)
        con.execute("""
            DELETE FROM bars_1m
            USING _tmp1m t
            WHERE bars_1m.symbol = t.symbol AND bars_1m.ts = t.ts;
        """)
        con.execute("INSERT INTO bars_1m SELECT * FROM _tmp1m;")
        con.execute("COMMIT")
    except Exception as e:
        con.execute("ROLLBACK")
        raise e
    finally:
        con.unregister("tmp_in_1m")
    return len(df)

def aggregate_new_hours(con, symbol: str) -> int:
    """
    Skapar nya 1h-baren för alla timmar som är fullständigt stängda
    och ännu inte finns i bars_1h.
    """
    now_floor = _utc_now_floor_hour()
    df_1m = con.execute("""
        WITH latest AS (
            SELECT * FROM bars_1m
            WHERE symbol = ?
              AND ts >= (SELECT COALESCE(MAX(ts), TIMESTAMP '1970-01-01') - INTERVAL 12 HOUR FROM bars_1m WHERE symbol=?)
        )
        SELECT symbol, ts, open, high, low, close, volume FROM latest ORDER BY ts
    """, [symbol, symbol]).df()

    if df_1m.empty:
        return 0

    df_1m["ts"] = pd.to_datetime(df_1m["ts"], utc=True)
    df_1m["bucket"] = df_1m["ts"].dt.floor("H")
    df_closed = df_1m[df_1m["bucket"] < now_floor]
    if df_closed.empty:
        return 0

    agg = df_closed.groupby(["symbol", "bucket"]).agg(
        open=("open", "first"),
        high=("high", "max"),
        low=("low", "min"),
        close=("close", "last"),
        volume=("volume", "sum"),
    ).reset_index().rename(columns={"bucket":"ts"})

    con.register("tmp_agg1h", agg)
    df_new = con.execute("""
        SELECT a.*
        FROM tmp_agg1h a
        LEFT JOIN bars_1h b
          ON a.symbol = b.symbol AND a.ts = b.ts
        WHERE b.symbol IS NULL
        ORDER BY a.ts
    """).df()
    con.unregister("tmp_agg1h")

    if df_new.empty:
        return 0

    con.register("tmp_new1h", df_new)
    con.execute("INSERT INTO bars_1h SELECT * FROM tmp_new1h;")
    con.unregister("tmp_new1h")
    return len(df_new)

def load_1h_for_features(con, symbol: str, hours_back: int = 400) -> pd.DataFrame:
    df = con.execute("""
        SELECT symbol, ts, open, high, low, close, volume
        FROM bars_1h WHERE symbol = ?
        ORDER BY ts DESC
        LIMIT ?
    """, [symbol, hours_back]).df()
    if df.empty:
        return df
    df = df.sort_values("ts").reset_index(drop=True)
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    return df


# ------------------ Data fetch (Yahoo) ------------------

def _yf_pick_period_for_minutes(minutes: int) -> str:
    """Yahoo 1m supports up to ~7d window. Choose a safe period."""
    if minutes <= 390:      # ~1 trading day
        return "1d"
    elif minutes <= 1950:   # ~5 trading days
        return "5d"
    else:
        return "7d"

def _flatten_col(col):
    """Hjälper till att göra om MultiIndex-kolumner till enkla strängar."""
    if isinstance(col, tuple):
        for x in reversed(col):
            if isinstance(x, str) and x.strip():
                return x
        return str(col[-1])
    return col

def _normalize_yf_df(df: pd.DataFrame) -> pd.DataFrame:
    """Return DataFrame med: ts, open, high, low, close, volume (UTC). Robust mot MultiIndex."""
    if df is None or df.empty:
        return pd.DataFrame(columns=["ts","open","high","low","close","volume"])

    # Flatten ALLTID MultiIndex om det finns
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [_flatten_col(c) for c in df.columns]

    # Säkerställ tidskolumn
    if isinstance(df.index, pd.DatetimeIndex):
        ts = pd.to_datetime(df.index, utc=True)
        df = df.reset_index(drop=True)
    else:
        for cname in ("Datetime", "Date", "datetime", "date"):
            if cname in df.columns:
                ts = pd.to_datetime(df[cname], utc=True)
                break
        else:
            ts = pd.to_datetime(df.iloc[:, 0], utc=True)

    # Mappa kolumnnamn flexibelt
    def _pick(name):
        for k in (name, name.capitalize(), name.upper()):
            if k in df.columns:
                return k
        if name == "close":
            if "Adj Close" in df.columns:
                return "Adj Close"
            if "adj close" in df.columns:
                return "adj close"
        return None

    oc = _pick("open"); hc = _pick("high"); lc = _pick("low"); cc = _pick("close"); vc = _pick("volume")
    out = pd.DataFrame({
        "ts": ts,
        "open": df[oc] if oc else np.nan,
        "high": df[hc] if hc else np.nan,
        "low":  df[lc] if lc else np.nan,
        "close":df[cc] if cc else np.nan,
        "volume":df[vc] if vc else 0.0,
    })

    out = out.dropna(subset=["open","high","low","close"])
    out["ts"] = pd.to_datetime(out["ts"], utc=True)
    out = out.sort_values("ts").drop_duplicates("ts")
    return out

def fetch_1m_yahoo(symbol: str, minutes: int = 390) -> pd.DataFrame:
    """
    Hämtar ~senaste N minuter (begränsat av Yahoo period-regler), interval=1m.
    Faller tillbaka till 5m om 1m är tomt/otillgängligt.
    """
    if yf is None:
        return pd.DataFrame(columns=["ts","open","high","low","close","volume"])

    per = _yf_pick_period_for_minutes(int(minutes))
    df = yf.download(tickers=symbol, interval="1m", period=per, progress=False, prepost=False)
    d1 = _normalize_yf_df(df)
    if not d1.empty:
        cutoff = pd.Timestamp.utcnow().tz_localize("UTC") - pd.Timedelta(minutes=minutes)
        return d1[d1["ts"] >= cutoff]

    # Fallback 5m
    df5 = yf.download(tickers=symbol, interval="5m", period=per, progress=False, prepost=False)
    d5 = _normalize_yf_df(df5)
    if not d5.empty:
        cutoff = pd.Timestamp.utcnow().tz_localize("UTC") - pd.Timedelta(minutes=minutes*2)
        return d5[d5["ts"] >= cutoff]

    return pd.DataFrame(columns=["ts","open","high","low","close","volume"])


# ------------------ 1m -> 1h backfill helpers ------------------

def resample_1m_to_1h(df_1m: pd.DataFrame) -> pd.DataFrame:
    if df_1m is None or df_1m.empty:
        return pd.DataFrame(columns=["ts","open","high","low","close","volume"])
    df = df_1m.copy()
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    df = df.set_index("ts")
    agg = {"open":"first","high":"max","low":"min","close":"last","volume":"sum"}
    h = df.resample("60T", label="right", closed="right").agg(agg).dropna()
    return h.reset_index()

def upsert_1h(db_path: str, symbol: str, df_1h: pd.DataFrame):
    if df_1h is None or df_1h.empty:
        return
    con = duckdb.connect(db_path, read_only=False)
    con.execute("""
        CREATE TABLE IF NOT EXISTS bars_1h (
          ts TIMESTAMP,
          symbol VARCHAR,
          open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE, volume DOUBLE
        )
    """)
    tmin = df_1h["ts"].min()
    tmax = df_1h["ts"].max()
    con.execute("DELETE FROM bars_1h WHERE symbol = ? AND ts BETWEEN ? AND ?", [symbol, tmin, tmax])
    con.register("tmp_1h", df_1h.assign(symbol=symbol))
    con.execute("INSERT INTO bars_1h SELECT ts, symbol, open, high, low, close, volume FROM tmp_1h")
    con.close()

def backfill_1h_if_missing(db_path: str, symbol: str, minutes_fetch: int = 390) -> bool:
    """
    Försök hämta 1m (ev. 5m fallback) från Yahoo, resampla till 1h, och upserta.
    Returnerar True om rader skrevs.
    """
    df_1m = fetch_1m_yahoo(symbol, minutes=minutes_fetch)
    if df_1m.empty:
        print(f"[{symbol}] 1m tomt (Yahoo) – marknad stängd eller fel symbol?")
        return False
    df_1h = resample_1m_to_1h(df_1m)
    if df_1h.empty:
        print(f"[{symbol}] resample 1m→1h gav tomt – hoppar")
        return False
    upsert_1h(str(DB_PATH), symbol, df_1h)
    print(f"[{symbol}] backfilled {len(df_1h)}×1h från Yahoo")
    return True


# ------------------ Signal + Alerts ------------------

def last_entry_signal(feats: pd.DataFrame, adx_min: float, rsi2_max: float) -> tuple[bool, dict]:
    """
    Baseline-entry: ema12 > ema26, adx > adx_min, rsi2 < rsi2_max på SENASTE stängda timmen.
    Returnerar (is_signal, debug_info)
    """
    if feats is None or feats.empty:
        return False, {}
    row = feats.iloc[-1]
    debug = {}
    for k in ("ema12","ema26","adx","rsi2","rsi14"):
        if k in feats.columns:
            try:
                debug[k] = float(row.get(k, np.nan))
            except Exception:
                debug[k] = np.nan
    c1 = (row.get("ema12", np.nan) > row.get("ema26", np.nan))
    c2 = (row.get("adx", np.nan)   > adx_min)
    c3 = (row.get("rsi2", np.nan)  < rsi2_max)
    ok = bool(c1 and c2 and c3)
    debug.update({"cond1_ema12_gt_ema26": bool(c1), "cond2_adx": bool(c2), "cond3_rsi2": bool(c3)})
    return ok, debug

def send_slack(webhook: str, text: str):
    try:
        requests.post(webhook, json={"text": text}, timeout=10)
    except Exception as e:
        print(f"[warn] Slack post misslyckades: {e}")

def send_telegram(bot_token: str, chat_id: str, text: str):
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    try:
        requests.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"}, timeout=10)
    except Exception as e:
        print(f"[warn] Telegram post misslyckades: {e}")

def send_webhook(url: str, payload: dict):
    try:
        requests.post(url, json=payload, timeout=10)
    except Exception as e:
        print(f"[warn] Webhook post misslyckades: {e}")


# ------------------ Main (en körning) ------------------

def run_once(symbols: list[str],
             source: str,
             minutes_fetch: int,
             hours_back: int,
             use_optuna_best: bool,
             adx_min: float, rsi2_max: float, rsi14_exit: float,
             slack_webhook: str | None,
             tg_token: str | None, tg_chat: str | None,
             generic_webhook: str | None):
    con = duckdb.connect(str(DB_PATH))
    ensure_tables(con)

    state = load_state()

    for symbol in symbols:
        # 1) Om vi kör live mot Yahoo: hämta 1m och upserta det
        if source == "yahoo":
            df_new_1m = fetch_1m_yahoo(symbol, minutes=minutes_fetch)
            if not df_new_1m.empty:
                inserted = upsert_1m(con, df_new_1m, symbol)
                if inserted:
                    print(f"[{symbol}] upsertade {inserted} × 1m")

            # 2) Aggregera ev. nya stängda timmar från 1m
            created = aggregate_new_hours(con, symbol)
            if created:
                print(f"[{symbol}] skapade {created} nya 1h-barrer")

        # 3) Ladda 1h
        df_1h = load_1h_for_features(con, symbol, hours_back=hours_back)

        # 3b) Om tomt – gör en direkt backfill 1m→1h och ladda om
        if df_1h.empty and source == "yahoo":
            ok = backfill_1h_if_missing(str(DB_PATH), symbol, minutes_fetch or 390)
            if ok:
                df_1h = load_1h_for_features(con, symbol, hours_back=hours_back)

        if df_1h.empty:
            if source == "yahoo":
                print(f"[{symbol}] kunde inte backfilla 1h – hoppar")
            else:
                print(f"[{symbol}] saknar 1h-data – kör en gång med --source yahoo för init. Hoppar.")
            continue

        # 4) Lägg på indikatorer
        feats = add_common(df_1h)

        # 5) Parametrar: Optuna best > CLI
        pbest = read_optuna_best(symbol) if use_optuna_best else None
        padx  = float(pbest.get("adx_min", adx_min)) if pbest else adx_min
        prsi2 = float(pbest.get("rsi2_max", rsi2_max)) if pbest else rsi2_max
        prsi14x = float(pbest.get("rsi14_exit", rsi14_exit)) if pbest else rsi14_exit

        # 6) Senaste stängda timmens signal
        is_sig, dbg = last_entry_signal(feats, adx_min=padx, rsi2_max=prsi2)
        last_ts = pd.to_datetime(feats["ts"].iloc[-1], utc=True)
        last_key = f"{symbol}_{last_ts.isoformat()}"

        if is_sig:
            if state.get(last_key, False):
                print(f"[{symbol}] signal {last_ts} redan skickad")
            else:
                msg = (
                    f"🔔 <b>{symbol}</b> ENTRY-signal (1h)\n"
                    f"tid: {last_ts.isoformat()}\n"
                    f"ema12>ema26={dbg.get('cond1_ema12_gt_ema26')}, "
                    f"adx>{padx}={dbg.get('cond2_adx')}, "
                    f"rsi2<{prsi2}={dbg.get('cond3_rsi2')}\n"
                    f"ADX={_fmt2(dbg.get('adx'))}  RSI2={_fmt2(dbg.get('rsi2'))}  "
                    f"EMA12={_fmt2(dbg.get('ema12'),4)}  EMA26={_fmt2(dbg.get('ema26'),4)}\n"
                    f"params: adx_min={padx}, rsi2_max={prsi2}, rsi14_exit={prsi14x}"
                )
                if slack_webhook:
                    send_slack(slack_webhook, msg.replace("<b>","*").replace("</b>","*"))
                if tg_token and tg_chat:
                    send_telegram(tg_token, tg_chat, msg)
                if generic_webhook:
                    send_webhook(generic_webhook, {
                        "symbol": symbol,
                        "ts": last_ts.isoformat(),
                        "signal": "entry",
                        "params": {"adx_min": padx, "rsi2_max": prsi2, "rsi14_exit": prsi14x},
                        "debug": dbg
                    })
                state[last_key] = True
                print(f"[{symbol}] skickade larm för {last_ts}")
        else:
            print(f"[{symbol}] ingen signal på {last_ts}")

    save_state(state)
    con.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", required=True, help="kommaseparerad lista, ex: ABB.ST,ERIC-B.ST")
    ap.add_argument("--source", default="none", choices=["none","yahoo"], help="datakälla för 1m (none=yahoo av)")
    ap.add_argument("--minutes_fetch", type=int, default=120)
    ap.add_argument("--hours_back", type=int, default=400)

    ap.add_argument("--use_optuna_best", action="store_true", help="hämta parametrar från reports/<sym>_optuna_best.json")
    ap.add_argument("--adx_min", type=float, default=20.0)
    ap.add_argument("--rsi2_max", type=float, default=12.0)
    ap.add_argument("--rsi14_exit", type=float, default=60.0)

    ap.add_argument("--slack_webhook", default=os.getenv("SLACK_WEBHOOK_URL"))
    ap.add_argument("--tg_token", default=os.getenv("TELEGRAM_BOT_TOKEN"))
    ap.add_argument("--tg_chat",  default=os.getenv("TELEGRAM_CHAT_ID"))
    ap.add_argument("--webhook",  default=os.getenv("ALERT_WEBHOOK_URL"))
    args = ap.parse_args()

    symbols = [s.strip() for s in args.symbols.split(",") if s.strip()]
    run_once(
        symbols=symbols,
        source=args.source,
        minutes_fetch=args.minutes_fetch,
        hours_back=args.hours_back,
        use_optuna_best=args.use_optuna_best,
        adx_min=args.adx_min, rsi2_max=args.rsi2_max, rsi14_exit=args.rsi14_exit,
        slack_webhook=args.slack_webhook,
        tg_token=args.tg_token, tg_chat=args.tg_chat,
        generic_webhook=args.webhook
    )


if __name__ == "__main__":
    main()
