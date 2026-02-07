#!/usr/bin/env python3
"""
Fetch EODHD fixtures for TV parity testing.
Creates JSON fixtures in the same format as META.US.1d.json.

AUDIT-02 fixtures:
- META.US 1H   (intraday, regular session)
- META.US 5m   (intraday, regular session)
- SPY.US 5m    (intraday for VWAP, regular session)
- BTC-USD.CC   1D (crypto, 24/7)
- EURUSD.FOREX 1D (forex, 24/7)

Usage:
    cd quantlab
    $env:EODHD_API_KEY = "your-key"
    python scripts/fetch_parity_fixtures.py
"""

import os
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
import requests

EODHD_API_KEY = os.getenv("EODHD_API_KEY") or os.getenv("EODHD_TOKEN")
if not EODHD_API_KEY:
    print("ERROR: Set EODHD_API_KEY environment variable")
    sys.exit(1)

BASE_URL = "https://eodhd.com/api"
FIXTURE_DIR = Path(__file__).parent.parent / "quantlab-ui/src/features/chartsPro/indicators/__fixtures__"

# Fixture configurations
FIXTURES = {
    # AUDIT-02a: META 1H
    "META.US.1H": {
        "symbol": "META.US",
        "endpoint": "intraday",
        "interval": "1h",
        "meta": {
            "name": "Meta Platforms Inc",
            "exchange": "NASDAQ",
            "currency": "USD",
            "timezone": "America/New_York",
            "session": "regular",
            "notes": "1H bars, regular session only (09:30-16:00 ET), for TV parity AUDIT-02a"
        }
    },
    # AUDIT-02b: META 5m
    "META.US.5m": {
        "symbol": "META.US",
        "endpoint": "intraday",
        "interval": "5m",
        "meta": {
            "name": "Meta Platforms Inc",
            "exchange": "NASDAQ",
            "currency": "USD",
            "timezone": "America/New_York",
            "session": "regular",
            "notes": "5m bars, regular session only (09:30-16:00 ET), for TV parity AUDIT-02b"
        }
    },
    # SPY 5m for VWAP baseline
    "SPY.US.5m": {
        "symbol": "SPY.US",
        "endpoint": "intraday",
        "interval": "5m",
        "meta": {
            "name": "SPDR S&P 500 ETF Trust",
            "exchange": "AMEX",
            "currency": "USD",
            "timezone": "America/New_York",
            "session": "regular",
            "notes": "5m bars, regular session for VWAP parity testing"
        }
    },
    # AUDIT-02c: BTCUSD 1D
    "BTC-USD.CC.1D": {
        "symbol": "BTC-USD.CC",
        "endpoint": "eod",
        "interval": "d",
        "meta": {
            "name": "Bitcoin / US Dollar",
            "exchange": "CC",
            "currency": "USD",
            "timezone": "UTC",
            "session": "24/7",
            "notes": "Daily bars, 24/7 crypto market, for TV parity AUDIT-02c"
        }
    },
    # AUDIT-02d: EURUSD 1D
    "EURUSD.FOREX.1D": {
        "symbol": "EURUSD.FOREX",
        "endpoint": "eod",
        "interval": "d",
        "meta": {
            "name": "Euro / US Dollar",
            "exchange": "FOREX",
            "currency": "USD",
            "timezone": "UTC",
            "session": "forex",
            "notes": "Daily bars, forex market (Sun 5pm - Fri 5pm ET), for TV parity AUDIT-02d"
        }
    },
}


def fetch_eod(symbol: str, from_date: str = "2023-01-01") -> list[dict]:
    """Fetch daily OHLCV data from EODHD."""
    url = f"{BASE_URL}/eod/{symbol}"
    params = {
        "api_token": EODHD_API_KEY,
        "fmt": "json",
        "period": "d",
        "from": from_date
    }
    print(f"  Fetching EOD {symbol} from {from_date}...")
    r = requests.get(url, params=params, timeout=30)
    r.raise_for_status()
    data = r.json()
    
    if not isinstance(data, list):
        print(f"  WARNING: Unexpected response type: {type(data)}")
        return []
    
    bars = []
    for row in data:
        # EODHD daily returns "date" as YYYY-MM-DD, convert to UTC midnight timestamp
        dt = datetime.strptime(row["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        bars.append({
            "time": int(dt.timestamp()),
            "open": float(row.get("open") or row.get("Open") or 0),
            "high": float(row.get("high") or row.get("High") or 0),
            "low": float(row.get("low") or row.get("Low") or 0),
            "close": float(row.get("close") or row.get("Close") or 0),
            "volume": int(row.get("volume") or row.get("Volume") or 0)
        })
    
    return sorted(bars, key=lambda b: b["time"])


def fetch_intraday(symbol: str, interval: str = "5m") -> list[dict]:
    """Fetch intraday OHLCV data from EODHD."""
    url = f"{BASE_URL}/intraday/{symbol}"
    params = {
        "api_token": EODHD_API_KEY,
        "fmt": "json",
        "interval": interval,
        # EODHD: range can be 'd' (1 day), 'wk' (1 week), 'yr1' (1 year)
        # For warmup, we need at least 50-100 bars
        # 5m: 78 bars/day → need ~2-3 days
        # 1h: 6.5 bars/day → need ~15-20 days
    }
    
    # Intraday API doesn't support 'from' param, uses 'range' instead
    # Range options: 'd', 'wk', 'yr1' (or numeric days like '5d', '30d')
    if interval == "1h":
        params["range"] = "120d"  # ~780 bars for 1h (120 trading days)
    else:
        params["range"] = "30d"   # ~2340 bars for 5m (30 trading days)
    
    print(f"  Fetching {interval} intraday {symbol} (range={params['range']})...")
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    
    if not isinstance(data, list):
        print(f"  WARNING: Unexpected response type: {type(data)}")
        return []
    
    bars = []
    for row in data:
        # EODHD intraday returns both "timestamp" (Unix) and "datetime" (string)
        # Prefer timestamp field as it's already in UTC
        ts = row.get("timestamp")
        if ts is None:
            # Fallback: parse datetime string  
            dt_str = row.get("datetime")
            if dt_str:
                # Format: "2025-10-13 13:30:00" (UTC)
                dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                ts = int(dt.timestamp())
            else:
                continue
        else:
            ts = int(ts)
        
        # Helper to safely get float values (handle None)
        def safe_float(v, default=0.0):
            return float(v) if v is not None else default
        
        def safe_int(v, default=0):
            return int(v) if v is not None else default
            
        bars.append({
            "time": ts,
            "open": safe_float(row.get("open")),
            "high": safe_float(row.get("high")),
            "low": safe_float(row.get("low")),
            "close": safe_float(row.get("close")),
            "volume": safe_int(row.get("volume"))
        })
    
    return sorted(bars, key=lambda b: b["time"])


def filter_regular_session(bars: list[dict], timezone_str: str = "America/New_York") -> list[dict]:
    """
    Filter intraday bars to regular trading session only (09:30 - 16:00 ET).
    
    This matches TradingView's default 'Regular' session for US equities.
    Returns bars where bar START time is within 09:30-15:55 (last bar starts 15:55 for 5m).
    """
    from zoneinfo import ZoneInfo
    tz = ZoneInfo(timezone_str)
    
    SESSION_START = 9 * 60 + 30   # 09:30 = 570 minutes from midnight
    SESSION_END = 16 * 60         # 16:00 = 960 minutes from midnight
    
    filtered = []
    for bar in bars:
        dt = datetime.fromtimestamp(bar["time"], tz=tz)
        minutes = dt.hour * 60 + dt.minute
        
        # Include if bar starts within trading hours (9:30 AM to 4:00 PM ET)
        if SESSION_START <= minutes < SESSION_END:
            # Also skip weekends
            if dt.weekday() < 5:  # Mon-Fri
                filtered.append(bar)
    
    return filtered


def save_fixture(key: str, bars: list[dict], config: dict):
    """Save bars to fixture JSON file."""
    # Determine filename from key
    # META.US.1H -> META.US.1h.json
    filename = key.replace(".CC", "").replace(".FOREX", "") + ".json"
    # Normalize case: 1H -> 1h, 1D -> 1d
    filename = filename.lower()
    
    filepath = FIXTURE_DIR / filename
    
    # Build meta section
    meta = {
        "symbol": config["symbol"],
        **config["meta"],
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "adjusted": False,
        "source": "EODHD (real historical data for parity tests)"
    }
    
    # Find date range
    if bars:
        first_bar = datetime.fromtimestamp(bars[0]["time"], tz=timezone.utc)
        last_bar = datetime.fromtimestamp(bars[-1]["time"], tz=timezone.utc)
        meta["dateRange"] = {
            "start": first_bar.strftime("%Y-%m-%d"),
            "end": last_bar.strftime("%Y-%m-%d")
        }
        meta["barCount"] = len(bars)
    
    fixture = {
        "meta": meta,
        "bars": bars
    }
    
    # Write JSON
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(fixture, f, indent=2)
    
    print(f"  ✓ Saved {filepath.name}: {len(bars)} bars")
    return filepath


def main():
    print("=" * 60)
    print("EODHD Parity Fixture Fetcher")
    print("=" * 60)
    
    results = {}
    
    for key, config in FIXTURES.items():
        print(f"\n[{key}]")
        try:
            if config["endpoint"] == "eod":
                bars = fetch_eod(config["symbol"], from_date="2023-01-01")
            else:
                bars = fetch_intraday(config["symbol"], config["interval"])
                
                # Filter to regular session for US equities
                if config["meta"].get("session") == "regular":
                    print(f"  Filtering to regular session...")
                    original_count = len(bars)
                    bars = filter_regular_session(bars, config["meta"]["timezone"])
                    print(f"  Filtered: {original_count} -> {len(bars)} bars")
            
            if bars:
                filepath = save_fixture(key, bars, config)
                results[key] = {"status": "ok", "bars": len(bars), "file": str(filepath)}
            else:
                print(f"  ✗ No data returned")
                results[key] = {"status": "empty"}
                
        except requests.RequestException as e:
            print(f"  ✗ Fetch error: {e}")
            results[key] = {"status": "error", "message": str(e)}
        except Exception as e:
            print(f"  ✗ Error: {e}")
            results[key] = {"status": "error", "message": str(e)}
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for key, res in results.items():
        if res["status"] == "ok":
            print(f"  ✓ {key}: {res['bars']} bars")
        else:
            print(f"  ✗ {key}: {res['status']} - {res.get('message', '')}")
    
    return all(r["status"] == "ok" for r in results.values())


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
