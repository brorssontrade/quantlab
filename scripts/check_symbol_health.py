#!/usr/bin/env python3
"""
Symbol Health Check Script

Verifies that all configured symbols return valid OHLCV data from the backend API.
Useful for:
- Diagnosing data issues after changes
- Verifying API key works for all markets
- Ensuring ingestion pipeline is healthy

Usage:
    python scripts/check_symbol_health.py
    python scripts/check_symbol_health.py --symbols AAPL.US MSFT.US
    python scripts/check_symbol_health.py --file config/tickers.txt
"""

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:
    print("❌ requests not installed. Run: pip install requests")
    sys.exit(1)


# Default API endpoint
DEFAULT_API_BASE = "http://127.0.0.1:8000"
DEFAULT_TICKERS_FILE = "config/tickers.txt"


def check_symbol(symbol: str, api_base: str, bar: str = "D", limit: int = 100) -> dict[str, Any]:
    """
    Check if a symbol returns valid OHLCV data.
    
    Returns dict with:
        - symbol: str
        - ok: bool
        - rows: int (if ok)
        - source: str (if ok)
        - fallback: bool (if ok)
        - error: str (if not ok)
        - latency_ms: float
    """
    url = f"{api_base}/chart/ohlcv"
    params = {"symbol": symbol, "bar": bar, "limit": limit}
    
    start = time.time()
    try:
        resp = requests.get(url, params=params, timeout=15)
        latency_ms = (time.time() - start) * 1000
        
        if resp.status_code == 404:
            return {
                "symbol": symbol,
                "ok": False,
                "error": f"404 - No data for symbol",
                "latency_ms": latency_ms,
            }
        
        if resp.status_code != 200:
            return {
                "symbol": symbol,
                "ok": False,
                "error": f"HTTP {resp.status_code}: {resp.text[:100]}",
                "latency_ms": latency_ms,
            }
        
        data = resp.json()
        rows = data.get("rows", [])
        meta = data.get("meta", {})
        
        if not rows:
            return {
                "symbol": symbol,
                "ok": False,
                "error": "Empty rows array",
                "latency_ms": latency_ms,
            }
        
        return {
            "symbol": symbol,
            "ok": True,
            "rows": len(rows),
            "source": meta.get("source", "unknown"),
            "fallback": meta.get("fallback", False),
            "first_date": rows[0].get("t", "?")[:10] if rows else "?",
            "last_date": rows[-1].get("t", "?")[:10] if rows else "?",
            "latency_ms": latency_ms,
        }
        
    except requests.Timeout:
        return {
            "symbol": symbol,
            "ok": False,
            "error": "Timeout (15s)",
            "latency_ms": 15000,
        }
    except requests.RequestException as e:
        return {
            "symbol": symbol,
            "ok": False,
            "error": f"Request failed: {e}",
            "latency_ms": (time.time() - start) * 1000,
        }
    except json.JSONDecodeError:
        return {
            "symbol": symbol,
            "ok": False,
            "error": "Invalid JSON response",
            "latency_ms": (time.time() - start) * 1000,
        }


def load_symbols_from_file(filepath: str) -> list[str]:
    """Load symbols from a text file (one per line)."""
    path = Path(filepath)
    if not path.exists():
        print(f"❌ File not found: {filepath}")
        return []
    
    symbols = []
    for line in path.read_text().strip().split("\n"):
        line = line.strip()
        if line and not line.startswith("#"):
            symbols.append(line)
    
    return symbols


def print_result(result: dict[str, Any]) -> None:
    """Pretty print a single check result."""
    symbol = result["symbol"]
    if result["ok"]:
        rows = result["rows"]
        source = result["source"]
        fallback = " (FALLBACK)" if result.get("fallback") else ""
        dates = f"{result.get('first_date', '?')} → {result.get('last_date', '?')}"
        latency = result["latency_ms"]
        print(f"  ✅ {symbol:20s} | {rows:5d} rows | {source:8s}{fallback} | {dates} | {latency:.0f}ms")
    else:
        error = result["error"]
        print(f"  ❌ {symbol:20s} | {error}")


def main():
    parser = argparse.ArgumentParser(description="Check symbol health against the backend API")
    parser.add_argument("--api", default=DEFAULT_API_BASE, help=f"API base URL (default: {DEFAULT_API_BASE})")
    parser.add_argument("--file", default=None, help="Path to tickers file (one symbol per line)")
    parser.add_argument("--symbols", nargs="*", default=None, help="Specific symbols to check")
    parser.add_argument("--bar", default="D", help="Bar size: D, 1h, 5m, etc. (default: D)")
    parser.add_argument("--limit", type=int, default=100, help="Number of bars to request (default: 100)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    
    args = parser.parse_args()
    
    # Determine symbols to check
    if args.symbols:
        symbols = args.symbols
    elif args.file:
        symbols = load_symbols_from_file(args.file)
    else:
        # Default to config/tickers.txt
        default_file = Path(__file__).parent.parent / DEFAULT_TICKERS_FILE
        if default_file.exists():
            symbols = load_symbols_from_file(str(default_file))
        else:
            print(f"❌ No symbols specified and default file not found: {default_file}")
            print("Usage: python scripts/check_symbol_health.py --symbols AAPL.US MSFT.US")
            sys.exit(1)
    
    if not symbols:
        print("❌ No symbols to check")
        sys.exit(1)
    
    # Check API health first
    print(f"\n🔍 Checking API health at {args.api}...")
    try:
        resp = requests.get(f"{args.api}/health", timeout=5)
        if resp.status_code == 200:
            print(f"  ✅ API is online\n")
        else:
            print(f"  ⚠️  API returned {resp.status_code}\n")
    except requests.RequestException as e:
        print(f"  ❌ API is offline: {e}")
        print("    Make sure the backend is running:")
        print("    python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload")
        sys.exit(1)
    
    # Check each symbol
    print(f"📊 Checking {len(symbols)} symbols (bar={args.bar}, limit={args.limit})...\n")
    
    results = []
    ok_count = 0
    fail_count = 0
    
    for symbol in symbols:
        result = check_symbol(symbol, args.api, args.bar, args.limit)
        results.append(result)
        
        if result["ok"]:
            ok_count += 1
        else:
            fail_count += 1
        
        if not args.json:
            print_result(result)
    
    # Summary
    if args.json:
        print(json.dumps({"results": results, "ok": ok_count, "failed": fail_count}, indent=2))
    else:
        print(f"\n{'─' * 60}")
        print(f"📈 Summary: {ok_count} passed, {fail_count} failed out of {len(symbols)} symbols")
        
        if fail_count > 0:
            print(f"\n❌ Failed symbols:")
            for r in results:
                if not r["ok"]:
                    print(f"   - {r['symbol']}: {r['error']}")
            sys.exit(1)
        else:
            print("✅ All symbols healthy!")
            sys.exit(0)


if __name__ == "__main__":
    main()
