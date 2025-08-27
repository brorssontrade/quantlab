from __future__ import annotations

import argparse
import csv
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

try:
    import yaml  # type: ignore
except Exception as e:
    yaml = None

from quantkit.data.eodhd_loader import load_bars
from quantkit.data.market_hours import (
    is_market_open,
    next_open_close_utc,
    filter_open_symbols,
    session_bounds_utc,
)
# cache-utils används bara för att räkna "nya rader" före/efter vid intraday
try:
    from quantkit.data.cache import read_cache  # type: ignore
except Exception:
    read_cache = None  # mjuk fallback


# -------------------------------------------------------------------
# Hjälpfunktioner
# -------------------------------------------------------------------

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)

def _ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def _read_text(p: Path) -> Optional[str]:
    try:
        return p.read_text(encoding="utf-8").strip()
    except Exception:
        return None

def _write_text(p: Path, s: str) -> None:
    _ensure_dir(p.parent)
    p.write_text(s, encoding="utf-8")

def _market_local_date(symbol: str) -> str:
    """Använd lokal handelsdag för stämpling (YYYY-MM-DD)."""
    open_utc, _ = session_bounds_utc(symbol, _now_utc())
    # Ta "öppningens" lokala datum (robustare än bara now.tz)
    # open_utc är i UTC; day-of-session i lokal tid är redan bakat i session_bounds_utc.
    # Här räcker det att vi tar datumdelen i UTC för konsekvent stämpel.
    return open_utc.date().isoformat()

def _stamp_path(symbol: str) -> Path:
    safe = symbol.replace("/", "_")
    return Path("data/stamps/eod") / f"{safe}.stamp"

def _eod_already_done_today(symbol: str) -> bool:
    p = _stamp_path(symbol)
    today = _market_local_date(symbol)
    prev = _read_text(p)
    return prev == today

def _mark_eod_done_today(symbol: str) -> None:
    p = _stamp_path(symbol)
    today = _market_local_date(symbol)
    _write_text(p, today)

def _iter_strings(obj) -> Iterable[str]:
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _iter_strings(v)
    elif isinstance(obj, (list, tuple, set)):
        for v in obj:
            yield from _iter_strings(v)

def _looks_like_symbol(s: str) -> bool:
    s = s.strip().upper()
    return "." in s and len(s) >= 4  # bred heuristik: "ABB.ST", "AAPL.US", etc.

def load_watchlist(path: Path) -> List[str]:
    if not path.exists():
        raise FileNotFoundError(f"Watchlist saknas: {path}")

    if yaml:
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                syms = [str(x).strip() for x in data if isinstance(x, (str, int))]
                return [s for s in syms if _looks_like_symbol(s)]
            elif isinstance(data, dict):
                syms = [s for s in _iter_strings(data) if _looks_like_symbol(s)]
                # unika & stabil ordning
                seen, out = set(), []
                for s in syms:
                    u = s.upper()
                    if u not in seen:
                        seen.add(u)
                        out.append(u)
                return out
        except Exception:
            pass

    # Fallback: rad-separerad text
    syms = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if _looks_like_symbol(line):
            syms.append(line)
    return syms


@dataclass
class SyncStats:
    symbol: str
    interval: str
    rows_before: Optional[int]
    rows_after: Optional[int]
    new_rows: Optional[int]
    ok: bool
    error: Optional[str]
    duration_sec: float


def _read_cached_rows(symbol: str, interval: str) -> Tuple[Optional[int], Optional[datetime]]:
    """Läs cache (om implementerad) för att kunna räkna nya rader.
    Returnerar (antal_rader, max_ts) eller (None, None) om ej möjligt."""
    if read_cache is None:
        return None, None
    try:
        df = read_cache(symbol, interval)
        if df is None or getattr(df, "empty", True):
            return 0, None
        ts = df["ts"] if "ts" in df.columns else None
        last_ts = ts.max() if ts is not None else None
        return len(df), last_ts
    except Exception:
        return None, None


def sync_pass(
    *,
    symbols: List[str],
    intervals: List[str],
    eod_days: int,
    intra_days: int,
    respect_hours: bool,
    verbose: bool,
) -> List[SyncStats]:
    """Kör en synk-pass för givna symboler och intervall."""
    t0 = time.time()
    stats: List[SyncStats] = []

    # 1) EOD körs högst 1 gång per lokal handelsdag & symbol
    if "EOD" in [s.upper() for s in intervals]:
        for sym in symbols:
            if _eod_already_done_today(sym):
                if verbose:
                    print(f"↷ [EOD] {sym}: redan gjort idag – hoppar.")
                continue
            before_n, _ = _read_cached_rows(sym, "EOD")
            t1 = time.time()
            ok, err = True, None
            after_n, new_n = None, None
            try:
                df = load_bars(sym, interval="EOD", days=eod_days, debug=verbose)
                after_n = len(df) if df is not None else 0
                if before_n is not None and after_n is not None:
                    new_n = max(0, after_n - before_n)
                _mark_eod_done_today(sym)
                if verbose:
                    print(f"✔ [EOD] {sym}: rows {before_n} → {after_n} (+{new_n or 0})")
            except Exception as e:
                ok, err = False, str(e)
                if verbose:
                    print(f"✖ [EOD] {sym}: {e}")
            stats.append(
                SyncStats(
                    symbol=sym,
                    interval="EOD",
                    rows_before=before_n,
                    rows_after=after_n,
                    new_rows=new_n,
                    ok=ok,
                    error=err,
                    duration_sec=time.time() - t1,
                )
            )

    # 2) Intraday – respektera handelstider om så begärts
    intr_intervals = [i for i in intervals if i.upper() != "EOD"]
    if intr_intervals:
        syms_intra = symbols
        if respect_hours:
            syms_intra = filter_open_symbols(symbols)
            if verbose:
                shut = [s for s in symbols if s not in syms_intra]
                if shut:
                    print(f"⏸ Stängda marknader (hoppar intraday): {', '.join(shut)}")
        for sym in syms_intra:
            for itv in intr_intervals:
                before_n, last_ts = _read_cached_rows(sym, itv)
                t1 = time.time()
                ok, err = True, None
                after_n, new_n = None, None
                try:
                    df = load_bars(sym, interval=itv, days=intra_days, debug=verbose, cached=True)
                    after_n = len(df) if df is not None else 0
                    if before_n is not None and after_n is not None:
                        if last_ts is not None and df is not None and "ts" in df.columns:
                            new_n = int((df["ts"] > last_ts).sum())
                        else:
                            new_n = max(0, after_n - before_n)
                    if verbose:
                        print(f"✔ [{itv}] {sym}: rows {before_n} → {after_n} (+{new_n or 0})")
                except Exception as e:
                    ok, err = False, str(e)
                    if verbose:
                        print(f"✖ [{itv}] {sym}: {e}")
                stats.append(
                    SyncStats(
                        symbol=sym,
                        interval=itv,
                        rows_before=before_n,
                        rows_after=after_n,
                        new_rows=new_n,
                        ok=ok,
                        error=err,
                        duration_sec=time.time() - t1,
                    )
                )

    if verbose:
        dt = time.time() - t0
        print(f"✓ Sync-pass klart på {dt:.1f}s")
    return stats


def write_report(stats: List[SyncStats]) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = Path("reports/sync/logs")
    _ensure_dir(out_dir)
    out = out_dir / f"{ts}.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["symbol", "interval", "rows_before", "rows_after", "new_rows", "ok", "error", "duration_sec"])
        for s in stats:
            w.writerow([s.symbol, s.interval, s.rows_before, s.rows_after, s.new_rows, s.ok, s.error or "", f"{s.duration_sec:.3f}"])
    return out


# -------------------------------------------------------------------
# CLI
# -------------------------------------------------------------------

def cmd_sync(args: argparse.Namespace) -> int:
    wl_path = Path(args.watchlist)
    try:
        symbols = load_watchlist(wl_path)
    except Exception as e:
        print(f"Fel vid läsning av watchlist: {e}", file=sys.stderr)
        return 2

    if not symbols:
        print("Inga symboler hittades i watchlist.", file=sys.stderr)
        return 2

    intervals = [s.strip() for s in args.intervals.split(",") if s.strip()]
    verbose = not args.quiet

    if args.loop_minutes and args.loop_minutes > 0:
        if verbose:
            print(f"▶ Startar sync-loop var {args.loop_minutes} min. Respect-hours={args.respect_hours}.")
        try:
            while True:
                stats = sync_pass(
                    symbols=symbols,
                    intervals=intervals,
                    eod_days=args.eod_days,
                    intra_days=args.intra_days,
                    respect_hours=args.respect_hours,
                    verbose=verbose,
                )
                rep = write_report(stats)
                if verbose:
                    ok = sum(1 for s in stats if s.ok)
                    new_total = sum(int(s.new_rows or 0) for s in stats)
                    print(f"📝 Logg → {rep}")
                    print(f"✔ OK: {ok}/{len(stats)} | Nya rader: +{new_total}")
                time.sleep(args.loop_minutes * 60)
        except KeyboardInterrupt:
            if verbose:
                print("\n⏹ Avslutat på begäran (Ctrl+C).")
            return 0
    else:
        stats = sync_pass(
            symbols=symbols,
            intervals=intervals,
            eod_days=args.eod_days,
            intra_days=args.intra_days,
            respect_hours=args.respect_hours,
            verbose=verbose,
        )
        rep = write_report(stats)
        if verbose:
            ok = sum(1 for s in stats if s.ok)
            new_total = sum(int(s.new_rows or 0) for s in stats)
            print(f"📝 Logg → {rep}")
            print(f"✔ OK: {ok}/{len(stats)} | Nya rader: +{new_total}")
        return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="quantkit.data", description="Data sync utilities")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sync", help="Synka EOD + intraday-data från watchlist")
    s.add_argument("--watchlist", default="watchlist.yaml", help="Sökväg till watchlist (yaml eller txt)")
    s.add_argument("--intervals", default="EOD,5m", help="Komma-separerade intervall, t.ex. EOD,5m")
    s.add_argument("--eod-days", type=int, default=9000, help="Historik för EOD")
    s.add_argument("--intra-days", type=int, default=10, help="Historik-fönster för intraday")
    s.add_argument("--respect-hours", action="store_true", default=True, help="Hämta intraday endast när marknaden är öppen (default)")
    s.add_argument("--no-respect-hours", dest="respect_hours", action="store_false", help="Ignorera handelstider för intraday")
    s.add_argument("--loop-minutes", type=int, default=0, help="Om >0, kör i loop med detta intervall (minuter)")
    s.add_argument("--quiet", action="store_true", help="Mindre utskrift")
    s.set_defaults(func=cmd_sync)

    return p


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
