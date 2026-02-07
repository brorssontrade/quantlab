#!/usr/bin/env python3
"""
debug_klinger.py - Debug Klinger Oscillator calculation for TradingView parity

Computes Klinger step-by-step and compares against expected TV values.
"""

import argparse
import math
import requests

API_BASE = "http://127.0.0.1:8000"


def fetch_ohlcv(symbol: str, bar: str = "D", limit: int = 100):
    """Fetch OHLCV data from our backend."""
    url = f"{API_BASE}/chart/ohlcv"
    params = {"symbol": symbol, "bar": bar, "limit": limit}
    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()
    return data.get("rows", [])


def normalize_bar(bar):
    """Normalize bar data to standard keys."""
    return {
        "time": bar.get("t") or bar.get("time") or bar.get("date"),
        "open": bar.get("o") or bar.get("open"),
        "high": bar.get("h") or bar.get("high"),
        "low": bar.get("l") or bar.get("low"),
        "close": bar.get("c") or bar.get("close"),
        "volume": bar.get("v") or bar.get("volume") or 0,
    }


def ema(values: list, period: int) -> list:
    """Compute EMA from values list."""
    if not values:
        return []
    
    alpha = 2 / (period + 1)
    result = [values[0]]
    
    for i in range(1, len(values)):
        result.append(alpha * values[i] + (1 - alpha) * result[-1])
    
    return result


def compute_klinger_debug(data: list, fast_len: int = 34, slow_len: int = 55, signal_len: int = 13):
    """
    Compute Klinger Oscillator with full debugging output.
    
    Returns intermediate values for analysis.
    """
    if len(data) < 2:
        return None
    
    results = []
    
    # Initialize
    prev_hlc = data[0]["high"] + data[0]["low"] + data[0]["close"]
    prev_trend = 1
    prev_dm = data[0]["high"] - data[0]["low"]
    cm = prev_dm
    
    vf_list = [0]  # First bar VF is 0
    
    for i in range(1, len(data)):
        bar = data[i]
        hlc = bar["high"] + bar["low"] + bar["close"]
        
        # Trend determination
        trend = 1 if hlc > prev_hlc else -1
        
        # Daily movement
        dm = bar["high"] - bar["low"]
        
        # Cumulative movement
        if trend == prev_trend:
            cm = cm + dm
        else:
            cm = prev_dm + dm
        
        # Volume Force calculation
        volume = bar["volume"] or 0
        
        if cm != 0:
            ratio = dm / cm
            # Formula variant 1: abs(2 * (dm/cm - 1)) * 100
            temp_with_abs_100 = abs(2 * (ratio - 1))
            vf_abs_100 = volume * temp_with_abs_100 * trend * 100
            
            # Formula variant 2: abs(2 * (dm/cm - 1)) without *100
            vf_abs_no100 = volume * temp_with_abs_100 * trend
            
            # Formula variant 3: 2 * (dm/cm - 1) without abs, with *100
            temp_no_abs = 2 * (ratio - 1)
            vf_no_abs_100 = volume * temp_no_abs * trend * 100
            
            # Formula variant 4: 2 * (dm/cm - 1) without abs, without *100
            vf_no_abs_no100 = volume * temp_no_abs * trend
            
            # Formula variant 5: 2 * dm/cm - 1 (different grouping) * 100
            temp_alt = (2 * ratio) - 1
            vf_alt_100 = volume * temp_alt * trend * 100
            
            # Formula variant 6: |2*(dm/cm)-1| (abs around entire thing) * 100
            temp_alt_abs = abs((2 * ratio) - 1)
            vf_alt_abs = volume * temp_alt_abs * trend * 100
        else:
            vf_abs_100 = volume * (-2) * trend * 100
            vf_abs_no100 = volume * (-2) * trend
            vf_no_abs_100 = volume * (-2) * trend * 100
            vf_no_abs_no100 = volume * (-2) * trend
            vf_alt_100 = volume * (-1) * trend * 100
            vf_alt_abs = volume * 1 * trend * 100
        
        # Store result
        results.append({
            "i": i,
            "date": bar["time"],
            "hlc": hlc,
            "prev_hlc": prev_hlc,
            "trend": trend,
            "dm": dm,
            "cm": cm,
            "ratio": dm / cm if cm != 0 else 0,
            "volume": volume,
            "vf_abs_100": vf_abs_100,
            "vf_abs_no100": vf_abs_no100,
            "vf_no_abs_100": vf_no_abs_100,
            "vf_no_abs_no100": vf_no_abs_no100,
            "vf_alt_100": vf_alt_100,
            "vf_alt_abs": vf_alt_abs,
        })
        
        vf_list.append(vf_abs_100)  # Using default formula
        
        # Update for next iteration
        prev_hlc = hlc
        prev_trend = trend
        prev_dm = dm
    
    return results, vf_list


def main():
    parser = argparse.ArgumentParser(description="Debug Klinger Oscillator")
    parser.add_argument("symbol", default="META", nargs="?", help="Symbol to analyze")
    parser.add_argument("--limit", type=int, default=100, help="Number of bars")
    parser.add_argument("--show-all", action="store_true", help="Show all bars")
    args = parser.parse_args()
    
    print(f"Fetching {args.symbol} OHLCV data...")
    try:
        data = fetch_ohlcv(args.symbol, "D", args.limit)
    except Exception as e:
        print(f"Error fetching data: {e}")
        print("Make sure the backend is running on port 8000")
        return
    
    if not data:
        print("No data returned")
        return
    
    print(f"Got {len(data)} bars")
    
    # Normalize data
    data = [normalize_bar(bar) for bar in data]
    print()
    
    # Show sample OHLCV data
    print("=== Sample OHLCV (last 5 bars) ===")
    for bar in data[-5:]:
        print(f"  {bar['time']}: O={bar['open']:.2f} H={bar['high']:.2f} L={bar['low']:.2f} C={bar['close']:.2f} V={bar['volume']:,.0f}")
    print()
    
    # Debug Klinger calculation
    results, vf_list = compute_klinger_debug(data)
    
    if not results:
        print("Not enough data for Klinger calculation")
        return
    
    # Show last 10 intermediate values
    print("=== Klinger Debug (last 10 bars) ===")
    print(f"{'Bar':>4} | {'Date':>12} | {'Trend':>5} | {'DM':>10} | {'CM':>14} | {'DM/CM':>8} | {'Volume':>14} | {'VF (abs*100)':>16} | {'VF (abs)':>14} | {'VF (no abs*100)':>16}")
    print("-" * 160)
    
    display_results = results if args.show_all else results[-10:]
    for r in display_results:
        print(f"{r['i']:>4} | {str(r['date'])[:12]:>12} | {r['trend']:>5} | {r['dm']:>10.2f} | {r['cm']:>14.2f} | {r['ratio']:>8.4f} | {r['volume']:>14,.0f} | {r['vf_abs_100']:>16,.0f} | {r['vf_abs_no100']:>14,.0f} | {r['vf_no_abs_100']:>16,.0f}")
    
    print()
    
    # Compute final KO with different formulas
    print("=== KO/Signal with different VF formulas (last bar) ===")
    
    for desc, vf_key in [
        ("abs(2*(dm/cm-1)) * 100", "vf_abs_100"),
        ("abs(2*(dm/cm-1))", "vf_abs_no100"),
        ("2*(dm/cm-1) * 100", "vf_no_abs_100"),
        ("2*(dm/cm-1)", "vf_no_abs_no100"),
        ("(2*dm/cm - 1) * 100", "vf_alt_100"),
        ("|2*dm/cm - 1| * 100", "vf_alt_abs"),
    ]:
        vf_values = [0] + [r[vf_key] for r in results]
        
        ema34 = ema(vf_values, 34)
        ema55 = ema(vf_values, 55)
        
        ko_values = [e34 - e55 for e34, e55 in zip(ema34, ema55)]
        signal_values = ema(ko_values, 13)
        
        last_ko = ko_values[-1] if ko_values else 0
        last_signal = signal_values[-1] if signal_values else 0
        
        print(f"  {desc:30} => KO={last_ko:>16,.2f}  Signal={last_signal:>16,.2f}")
    
    print()
    print("TradingView META.US 1D reference (from user):")
    print("  KO ~232,700 (232.7K)")
    print("  Signal ~1,030,000 (1.03M)")
    print()
    print("Compare the formulas above to find which matches TV scale.")


if __name__ == "__main__":
    main()
