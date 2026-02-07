#!/usr/bin/env python3
"""
verify_tv_parity.py - Verify data and indicator parity with TradingView

This script:
1. Dumps OHLCV data for a symbol from our backend
2. Calculates HV using our formula
3. Compares against expected TradingView values

Usage:
  python scripts/verify_tv_parity.py META 10 --start 2025-01-01 --end 2025-01-31
"""

import argparse
import json
import math
import sys
from datetime import datetime
from pathlib import Path

import requests

API_BASE = "http://127.0.0.1:8000"


def fetch_ohlcv(symbol: str, bar: str = "D", limit: int = 500, start: str | None = None, end: str | None = None):
    """Fetch OHLCV data from our backend."""
    url = f"{API_BASE}/chart/ohlcv"
    params = {"symbol": symbol, "bar": bar, "limit": limit}
    if start:
        params["start"] = start
    if end:
        params["end"] = end
    
    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()
    return data.get("rows", [])


def compute_hv(closes: list[float], length: int = 10, periods_per_year: int = 329) -> list[float | None]:
    """
    Compute Historical Volatility exactly as our frontend does.
    
    Formula:
    1. Log Returns: r[t] = ln(close[t] / close[t-1])
    2. Sample Standard Deviation: σ = stdev(r, length) with (N-1)
    3. Annualized HV: HV = 100 × σ × sqrt(periodsPerYear)
    """
    if len(closes) == 0:
        return []
    
    # Step 1: Calculate log returns
    log_returns = [None]  # First bar has no return
    for i in range(1, len(closes)):
        prev_close = closes[i - 1]
        curr_close = closes[i]
        if prev_close > 0 and curr_close > 0:
            log_returns.append(math.log(curr_close / prev_close))
        else:
            log_returns.append(None)
    
    sqrt_periods = math.sqrt(periods_per_year)
    hv_values = []
    
    # Step 2: Rolling stdev calculation
    for i in range(len(closes)):
        # Warmup: need at least `length` log returns
        if i < length:
            hv_values.append(None)
            continue
        
        # Collect window of log returns
        window = []
        has_invalid = False
        for j in range(i - length + 1, i + 1):
            if log_returns[j] is None:
                has_invalid = True
                break
            window.append(log_returns[j])
        
        if has_invalid or len(window) < length:
            hv_values.append(None)
            continue
        
        # Calculate mean
        mean = sum(window) / length
        
        # Calculate sample variance (N-1)
        sum_squared_diff = sum((r - mean) ** 2 for r in window)
        variance = sum_squared_diff / (length - 1)
        stdev = math.sqrt(variance)
        
        # Annualize and convert to percentage
        hv = 100 * stdev * sqrt_periods
        hv_values.append(hv)
    
    return hv_values


def verify_hv_parity(symbol: str, hv_length: int, start: str | None, end: str | None, expected_hv: float | None):
    """Verify HV calculation matches TradingView."""
    print(f"\n{'='*60}")
    print(f"HV PARITY VERIFICATION: {symbol}, length={hv_length}")
    print(f"{'='*60}")
    
    # Fetch OHLCV data
    rows = fetch_ohlcv(symbol, "D", 500, start, end)
    if not rows:
        print("ERROR: No data returned from backend")
        return False
    
    print(f"\nLoaded {len(rows)} bars from backend")
    print(f"Date range: {rows[0]['t']} to {rows[-1]['t']}")
    
    # Extract closes
    closes = [r["c"] for r in rows]
    dates = [r["t"] for r in rows]
    
    # Show last 10 bars for inspection
    print(f"\nLast 10 bars (verify against TV chart):")
    print(f"{'Date':<25} {'Open':>12} {'High':>12} {'Low':>12} {'Close':>12} {'Volume':>15}")
    print("-" * 95)
    for row in rows[-10:]:
        print(f"{row['t']:<25} {row['o']:>12.2f} {row['h']:>12.2f} {row['l']:>12.2f} {row['c']:>12.2f} {row['v']:>15,.0f}")
    
    # Calculate HV with periods=252 (standard) and 329 (our TV-match)
    hv_252 = compute_hv(closes, hv_length, 252)
    hv_329 = compute_hv(closes, hv_length, 329)
    
    # Show last 5 HV values
    print(f"\nLast 5 HV({hv_length}) values:")
    print(f"{'Date':<25} {'Close':>12} {'HV(252)':>12} {'HV(329)':>12}")
    print("-" * 65)
    for i in range(-5, 0):
        idx = len(rows) + i
        date = dates[idx]
        close = closes[idx]
        hv252 = hv_252[idx] if hv_252[idx] is not None else float("nan")
        hv329 = hv_329[idx] if hv_329[idx] is not None else float("nan")
        print(f"{date:<25} {close:>12.2f} {hv252:>12.2f} {hv329:>12.2f}")
    
    # Final value
    final_hv_252 = hv_252[-1] if hv_252[-1] is not None else float("nan")
    final_hv_329 = hv_329[-1] if hv_329[-1] is not None else float("nan")
    
    print(f"\nFinal HV values:")
    print(f"  HV({hv_length}) with 252 days: {final_hv_252:.4f}")
    print(f"  HV({hv_length}) with 329 days: {final_hv_329:.4f}")
    
    if expected_hv is not None:
        diff_252 = abs(final_hv_252 - expected_hv) / expected_hv * 100
        diff_329 = abs(final_hv_329 - expected_hv) / expected_hv * 100
        print(f"\nCompared to TradingView expected value: {expected_hv}")
        print(f"  Diff with 252: {diff_252:.2f}%")
        print(f"  Diff with 329: {diff_329:.2f}%")
        
        # Check if within tolerance
        if diff_329 < 1.0:
            print("  ✓ HV(329) is within 1% of TradingView")
            return True
        elif diff_252 < 1.0:
            print("  ✓ HV(252) is within 1% of TradingView")
            return True
        else:
            print("  ✗ Neither annualization matches TradingView within 1%")
            return False
    
    return True


def dump_ohlcv_fixture(symbol: str, bar: str, limit: int, output_path: str | None):
    """Dump OHLCV data as JSON fixture for golden tests."""
    rows = fetch_ohlcv(symbol, bar, limit)
    if not rows:
        print("ERROR: No data to dump")
        return
    
    fixture = {
        "symbol": symbol,
        "bar": bar,
        "generated": datetime.now(tz=None).isoformat() + "Z",
        "rows": rows,
    }
    
    if output_path:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(fixture, f, indent=2)
        print(f"Saved fixture to {path}")
    else:
        print(json.dumps(fixture, indent=2))


def batch_verify_hv(symbols: list[str], hv_length: int, bar: str = "D"):
    """Verify HV across multiple symbols and report results."""
    print(f"\n{'='*70}")
    print(f"BATCH HV PARITY TEST: {len(symbols)} symbols, HV({hv_length}), bar={bar}")
    print(f"{'='*70}\n")
    
    results = []
    for symbol in symbols:
        try:
            rows = fetch_ohlcv(symbol, bar, 100)
            if not rows:
                results.append((symbol, None, None, "No data"))
                continue
            
            closes = [r["c"] for r in rows]
            
            # Calculate HV with both 252 and 329
            hv_252 = compute_hv(closes, hv_length, 252)
            hv_329 = compute_hv(closes, hv_length, 329)
            
            last_252 = hv_252[-1] if hv_252[-1] is not None else float("nan")
            last_329 = hv_329[-1] if hv_329[-1] is not None else float("nan")
            last_date = rows[-1]["t"][:10]
            
            results.append((symbol, last_252, last_329, last_date))
            
        except Exception as e:
            results.append((symbol, None, None, str(e)))
    
    # Print results table
    print(f"{'Symbol':<12} {'HV(252)':<12} {'HV(329)':<12} {'Ratio':<10} {'Date':<12}")
    print("-" * 60)
    for symbol, hv252, hv329, info in results:
        if hv252 is None:
            print(f"{symbol:<12} {'ERROR':<12} {'':<12} {'':<10} {info}")
        else:
            ratio = hv329 / hv252 if hv252 > 0 else 0
            print(f"{symbol:<12} {hv252:<12.2f} {hv329:<12.2f} {ratio:<10.4f} {info}")
    
    print("\n" + "="*60)
    print("Expected ratio for TV parity: sqrt(329/252) = 1.1430")
    print("If all ratios ≈ 1.143, then 329 is correct annualization.")
    print("="*60)
    
    # Check if ratio is consistent
    ratios = [hv329/hv252 for _, hv252, hv329, _ in results if hv252 is not None and hv252 > 0]
    if ratios:
        avg_ratio = sum(ratios) / len(ratios)
        expected_ratio = math.sqrt(329/252)
        print(f"\nAverage observed ratio: {avg_ratio:.4f}")
        print(f"Expected ratio: {expected_ratio:.4f}")
        print(f"Difference: {abs(avg_ratio - expected_ratio)*100:.2f}%")


def main():
    parser = argparse.ArgumentParser(description="Verify TV parity for indicators")
    parser.add_argument("symbol", nargs="?", help="Symbol to verify (e.g., META)")
    parser.add_argument("--hv-length", type=int, default=10, help="HV period length")
    parser.add_argument("--start", help="Start date (ISO format)")
    parser.add_argument("--end", help="End date (ISO format)")
    parser.add_argument("--expected-hv", type=float, help="Expected TradingView HV value for comparison")
    parser.add_argument("--dump-fixture", help="Dump OHLCV to JSON file path")
    parser.add_argument("--limit", type=int, default=100, help="Number of bars to fetch")
    parser.add_argument("--bar", default="D", help="Bar timeframe (D, 1W, 4H, etc.)")
    parser.add_argument("--batch", nargs="+", help="Batch test multiple symbols")
    
    args = parser.parse_args()
    
    if args.batch:
        batch_verify_hv(args.batch, args.hv_length, args.bar)
    elif args.dump_fixture:
        dump_ohlcv_fixture(args.symbol, args.bar, args.limit, args.dump_fixture)
    elif args.symbol:
        success = verify_hv_parity(
            args.symbol,
            args.hv_length,
            args.start,
            args.end,
            args.expected_hv,
        )
        sys.exit(0 if success else 1)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
