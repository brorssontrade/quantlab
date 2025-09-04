# src/quantkit/cli.py
from __future__ import annotations
import argparse

def _add_common_opts(p: argparse.ArgumentParser) -> None:
    p.add_argument("--tickers-file", default="config/tickers.txt")
    p.add_argument("--force", action="store_true", help="Ignorera cache och hämta på nytt")
    p.add_argument("--api-key", default=None)

def _cmd_snapshot_hotlists(args: argparse.Namespace) -> None:
    # Importera först när kommandot körs (så trasiga moduler inte spökar)
    from .snapshots.hotlists_snapshot import build_hotlists_snapshot
    build_hotlists_snapshot(
        timeframe=args.timeframe,
        tickers_file=args.tickers_file,
        api_key=args.api_key,
        force=args.force,
    )

def _cmd_snapshot_signals(args: argparse.Namespace) -> None:
    from .snapshots.signals_snapshot import build_signals_snapshot
    build_signals_snapshot(
        tickers_file=args.tickers_file,
        api_key=args.api_key,
        force=args.force,
    )

def _cmd_snapshot_movers(args: argparse.Namespace) -> None:
    from .snapshots.movers_snapshot import build_movers_snapshot
    build_movers_snapshot(
        tickers_file=args.tickers_file,
        api_key=args.api_key,
        force=args.force,
    )

def main() -> None:
    parser = argparse.ArgumentParser("quantkit")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("snapshot-hotlists")
    _add_common_opts(p1)
    p1.add_argument("--timeframe", choices=["5m","1h","1d"], default="1d")
    p1.set_defaults(func=_cmd_snapshot_hotlists)

    p2 = sub.add_parser("snapshot-signals")
    _add_common_opts(p2)
    p2.set_defaults(func=_cmd_snapshot_signals)

    p3 = sub.add_parser("snapshot-movers")
    _add_common_opts(p3)
    p3.set_defaults(func=_cmd_snapshot_movers)

    args = parser.parse_args()
    args.func(args)
