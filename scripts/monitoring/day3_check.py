#!/usr/bin/env python3
"""
Day 3 Release Quality Gate for PR8 Consolidation

Builds on Day 2 and adds production-readiness checks:
- Data freshness (OHLCV last candle >= recent trading day)
- Performance thresholds (latency p50/p95/max)
- Optional UI smoke tests (Playwright)

Environment variables:
  - DAY3_DEBUG=1 : Enable verbose diagnostics
  - DAY3_SKIP_UI=1 : Skip UI smoke tests
  - DAY3_LATENCY_WARN_MS=500 : Warning threshold (ms)
  - DAY3_LATENCY_FAIL_MS=2000 : Fail threshold (ms)
  - DAY3_FRESHNESS_MAX_DAYS=3 : Max days since last candle (accounts for weekends)

Exit codes:
- 0: All checks PASS
- 1: One or more checks FAIL
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from typing import Any, Literal

import requests

# ============================================================================
# Windows Console Encoding Fix
# ============================================================================
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

# ============================================================================
# Configuration
# ============================================================================

DEBUG = os.environ.get("DAY3_DEBUG", "").lower() in ("1", "true", "yes")
SKIP_UI = os.environ.get("DAY3_SKIP_UI", "").lower() in ("1", "true", "yes")

# Latency thresholds (ms)
LATENCY_WARN_MS = int(os.environ.get("DAY3_LATENCY_WARN_MS", "500"))
LATENCY_FAIL_MS = int(os.environ.get("DAY3_LATENCY_FAIL_MS", "2000"))

# Freshness threshold (days) - 3 accounts for weekends
FRESHNESS_MAX_DAYS = int(os.environ.get("DAY3_FRESHNESS_MAX_DAYS", "3"))

TIMEOUT_SEC = 30


def resolve_api_url() -> tuple[str, str]:
    """Resolve API URL with deterministic priority. Returns (url, source_env_var)."""
    candidates = [
        ("PROD_API_BASE_URL", os.getenv("PROD_API_BASE_URL")),
        ("STAGING_API_BASE_URL", os.getenv("STAGING_API_BASE_URL")),
        ("PROD_BASE_URL", os.getenv("PROD_BASE_URL")),  # Legacy
        ("STAGING_BASE_URL", os.getenv("STAGING_BASE_URL")),  # Legacy
    ]
    
    for env_name, value in candidates:
        if value:
            # Warn about legacy env vars
            if env_name in ("PROD_BASE_URL", "STAGING_BASE_URL"):
                print(f"[DEPRECATION] {env_name} is deprecated. Use PROD_API_BASE_URL or STAGING_API_BASE_URL instead.", file=sys.stderr)
            return value.rstrip("/"), env_name
    
    return "", ""


API_BASE_URL, API_URL_SOURCE = resolve_api_url()

if not API_BASE_URL:
    print("ERROR: No API URL environment variable is set.", file=sys.stderr)
    print("Set PROD_API_BASE_URL or STAGING_API_BASE_URL in GitHub Secrets.", file=sys.stderr)
    sys.exit(1)

# Repo root
if os.environ.get("GITHUB_WORKSPACE"):
    REPO_ROOT = Path(os.environ["GITHUB_WORKSPACE"])
else:
    REPO_ROOT = Path(__file__).parent.parent.parent

REPORT_DIR = REPO_ROOT / "docs" / "verification"
REPORT_JSON = REPORT_DIR / "DAY3_REPORT.json"
REPORT_MD = REPORT_DIR / "DAY3_REPORT.md"

# ============================================================================
# Helpers
# ============================================================================


def log(msg: str, level: str = "INFO") -> None:
    """Print timestamped log message."""
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] [{level}] {msg}", flush=True)


def debug(msg: str) -> None:
    """Print debug message (only if DAY3_DEBUG=1)."""
    if DEBUG:
        log(f"[DEBUG] {msg}", "DEBUG")


# ============================================================================
# Performance Gate
# ============================================================================


def measure_latency(url: str, iterations: int = 5) -> dict[str, Any]:
    """Measure endpoint latency over multiple iterations."""
    latencies = []
    errors = []
    
    for i in range(iterations):
        start = time.perf_counter()
        try:
            resp = requests.get(url, timeout=TIMEOUT_SEC)
            elapsed_ms = (time.perf_counter() - start) * 1000
            latencies.append(elapsed_ms)
            resp.raise_for_status()
        except Exception as exc:
            elapsed_ms = (time.perf_counter() - start) * 1000
            errors.append(f"iter{i}: {exc}")
    
    if not latencies:
        return {
            "status": "FAIL",
            "error": f"All {iterations} requests failed: {errors}",
            "p50_ms": None,
            "p95_ms": None,
            "max_ms": None,
        }
    
    latencies.sort()
    p50 = latencies[len(latencies) // 2]
    p95 = latencies[int(len(latencies) * 0.95)] if len(latencies) >= 2 else latencies[-1]
    max_lat = latencies[-1]
    
    # Determine status based on thresholds
    if max_lat > LATENCY_FAIL_MS:
        status = "FAIL"
    elif max_lat > LATENCY_WARN_MS:
        status = "WARN"
    else:
        status = "PASS"
    
    return {
        "status": status,
        "p50_ms": round(p50, 1),
        "p95_ms": round(p95, 1),
        "max_ms": round(max_lat, 1),
        "iterations": len(latencies),
        "errors": errors if errors else None,
    }


def check_performance() -> dict[str, Any]:
    """Run performance checks on key endpoints."""
    log("Running performance checks...")
    
    endpoints = [
        "/health",
        "/api/health",
        "/chart/ohlcv?symbol=ABB.ST&bar=D&limit=10",
    ]
    
    results = {}
    overall_status = "PASS"
    
    for endpoint in endpoints:
        url = f"{API_BASE_URL}{endpoint}"
        log(f"  Measuring: {endpoint}")
        result = measure_latency(url)
        results[endpoint] = result
        
        if result["status"] == "FAIL":
            overall_status = "FAIL"
            log(f"    [FAIL] max={result.get('max_ms')}ms > {LATENCY_FAIL_MS}ms threshold", "FAIL")
        elif result["status"] == "WARN":
            if overall_status != "FAIL":
                overall_status = "WARN"
            log(f"    [WARN] max={result.get('max_ms')}ms > {LATENCY_WARN_MS}ms warn threshold", "WARN")
        else:
            log(f"    [OK] p50={result.get('p50_ms')}ms, max={result.get('max_ms')}ms", "PASS")
    
    return {"status": overall_status, "endpoints": results}


# ============================================================================
# Data Freshness Gate
# ============================================================================


def get_last_trading_day() -> date:
    """Get the last expected trading day (skip weekends)."""
    today = datetime.now(timezone.utc).date()
    
    # Go back from today to find last trading day
    check_date = today
    while check_date.weekday() >= 5:  # Saturday=5, Sunday=6
        check_date -= timedelta(days=1)
    
    return check_date


def check_data_freshness(symbol: str = "ABB.ST") -> dict[str, Any]:
    """Check that OHLCV data is fresh (recent candles exist)."""
    log(f"Checking data freshness for {symbol}...")
    
    url = f"{API_BASE_URL}/chart/ohlcv"
    params = {
        "symbol": symbol,
        "bar": "D",
        "limit": 5,  # Just need recent candles
    }
    
    try:
        resp = requests.get(url, params=params, timeout=TIMEOUT_SEC)
        resp.raise_for_status()
        data = resp.json()
        
        # Get candles from response
        candles = data.get("rows") or data.get("candles") or []
        if not candles:
            return {
                "status": "FAIL",
                "error": f"No candles returned for {symbol}",
                "symbol": symbol,
            }
        
        # Parse last candle timestamp
        last_candle = candles[-1]  # Assuming sorted ascending
        
        # Handle different timestamp formats
        ts_field = last_candle.get("t") or last_candle.get("timestamp") or last_candle.get("date")
        if not ts_field:
            return {
                "status": "FAIL",
                "error": "Cannot determine candle timestamp field",
                "symbol": symbol,
            }
        
        # Parse timestamp
        if isinstance(ts_field, (int, float)):
            # Unix timestamp (ms or s)
            if ts_field > 1e12:
                last_date = datetime.fromtimestamp(ts_field / 1000, tz=timezone.utc).date()
            else:
                last_date = datetime.fromtimestamp(ts_field, tz=timezone.utc).date()
        else:
            # ISO string
            last_date = datetime.fromisoformat(str(ts_field).replace("Z", "+00:00")).date()
        
        # Check freshness
        last_trading_day = get_last_trading_day()
        days_stale = (last_trading_day - last_date).days
        
        debug(f"Last candle date: {last_date}")
        debug(f"Last trading day: {last_trading_day}")
        debug(f"Days stale: {days_stale}")
        
        if days_stale > FRESHNESS_MAX_DAYS:
            log(f"  [FAIL] Data is {days_stale} days stale (max: {FRESHNESS_MAX_DAYS})", "FAIL")
            return {
                "status": "FAIL",
                "error": f"Data is {days_stale} days stale",
                "symbol": symbol,
                "last_candle_date": str(last_date),
                "last_trading_day": str(last_trading_day),
                "days_stale": days_stale,
            }
        
        log(f"  [OK] Last candle: {last_date} ({days_stale} days ago)", "PASS")
        return {
            "status": "PASS",
            "symbol": symbol,
            "last_candle_date": str(last_date),
            "last_trading_day": str(last_trading_day),
            "days_stale": days_stale,
        }
        
    except Exception as exc:
        log(f"  [FAIL] {exc}", "FAIL")
        return {
            "status": "FAIL",
            "error": str(exc),
            "symbol": symbol,
        }


# ============================================================================
# UI Smoke Tests (Optional)
# ============================================================================


def check_ui_smoke() -> dict[str, Any]:
    """Run minimal Playwright UI smoke tests."""
    if SKIP_UI:
        log("UI smoke tests skipped (DAY3_SKIP_UI=1)")
        return {"status": "SKIP", "reason": "DAY3_SKIP_UI=1"}
    
    log("Running UI smoke tests...")
    
    # Check if Playwright tests exist
    ui_dir = REPO_ROOT / "quantlab-ui"
    
    if not ui_dir.exists():
        log("  [SKIP] quantlab-ui/ directory not found")
        return {"status": "SKIP", "reason": "quantlab-ui/ not found"}
    
    # Check for Day 3 smoke test file (preferred) or fallback
    test_patterns = [
        "tests/day3.smoke.spec.ts",  # Day 3 dedicated smoke tests
        "tests/smoke.spec.ts",
        "tests/chartsPro.cp2.spec.ts",  # Fallback to existing test
    ]
    
    test_file = None
    for pattern in test_patterns:
        candidate = ui_dir / pattern
        if candidate.exists():
            test_file = candidate
            break
    
    if not test_file:
        log("  [SKIP] No smoke test file found")
        return {"status": "SKIP", "reason": "No smoke test file found"}
    
    log(f"  Using test file: {test_file.name}")
    
    # Run Playwright with minimal scope
    try:
        cmd = [
            "npx", "playwright", "test",
            str(test_file.relative_to(ui_dir)),
            "--project=chromium",
            "--reporter=line",
            "--timeout=30000",
        ]
        
        debug(f"Running: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=ui_dir,
        )
        
        if result.returncode == 0:
            log("  [OK] UI smoke tests passed", "PASS")
            return {"status": "PASS", "test_file": str(test_file.name)}
        else:
            log(f"  [FAIL] UI tests failed (exit {result.returncode})", "FAIL")
            return {
                "status": "FAIL",
                "exit_code": result.returncode,
                "stdout": result.stdout[-1000:],
                "stderr": result.stderr[-500:],
            }
            
    except subprocess.TimeoutExpired:
        log("  [FAIL] UI tests timed out", "FAIL")
        return {"status": "FAIL", "error": "Timeout (120s)"}
    except Exception as exc:
        log(f"  [SKIP] Could not run Playwright: {exc}")
        return {"status": "SKIP", "reason": str(exc)}


# ============================================================================
# Main Check Runner
# ============================================================================


def run_day3_checks() -> dict[str, Any]:
    """Execute all Day 3 quality gate checks."""
    log("=== Day 3 Release Quality Gate Start ===")
    log(f"Target: {API_BASE_URL} (from {API_URL_SOURCE})")
    
    start_time = time.time()
    timestamp = datetime.now(timezone.utc).isoformat()
    
    checks = {}
    
    # A) Data Freshness Gate
    checks["data_freshness"] = check_data_freshness()
    
    # B) Performance Gate
    checks["performance"] = check_performance()
    
    # C) UI Smoke Tests (optional)
    checks["ui_smoke"] = check_ui_smoke()
    
    elapsed = time.time() - start_time
    
    # Determine overall status (SKIP doesn't count as failure)
    statuses = [c.get("status") for c in checks.values()]
    if any(s == "FAIL" for s in statuses):
        overall_status = "FAIL"
    elif any(s == "WARN" for s in statuses):
        overall_status = "WARN"
    else:
        overall_status = "PASS"
    
    log(f"=== Day 3 Quality Gate Complete: {overall_status} ({elapsed:.1f}s) ===")
    
    return {
        "timestamp": timestamp,
        "base_url": API_BASE_URL,
        "duration_sec": round(elapsed, 2),
        "overall_status": overall_status,
        "checks": checks,
        "config": {
            "latency_warn_ms": LATENCY_WARN_MS,
            "latency_fail_ms": LATENCY_FAIL_MS,
            "freshness_max_days": FRESHNESS_MAX_DAYS,
            "skip_ui": SKIP_UI,
            "debug": DEBUG,
        },
    }


def write_reports(results: dict[str, Any]) -> None:
    """Write JSON and Markdown reports."""
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    
    # JSON report
    with REPORT_JSON.open("w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    log(f"JSON report: {REPORT_JSON}")
    
    # Markdown report
    overall = results["overall_status"]
    icon = "[PASS]" if overall == "PASS" else ("[WARN]" if overall == "WARN" else "[FAIL]")
    
    md_lines = [
        f"# Day 3 Release Quality Gate - {icon} {overall}",
        "",
        f"**Timestamp:** {results['timestamp']}  ",
        f"**Target:** {results['base_url']}  ",
        f"**Duration:** {results['duration_sec']}s  ",
        "",
        "## Configuration",
        "",
        f"- Latency warn threshold: {results['config']['latency_warn_ms']}ms",
        f"- Latency fail threshold: {results['config']['latency_fail_ms']}ms",
        f"- Freshness max days: {results['config']['freshness_max_days']}",
        f"- UI tests: {'skipped' if results['config']['skip_ui'] else 'enabled'}",
        "",
        "## Checks Summary",
        "",
    ]
    
    for name, check in results["checks"].items():
        status = check.get("status", "UNKNOWN")
        status_icon = {"PASS": "[PASS]", "WARN": "[WARN]", "FAIL": "[FAIL]", "SKIP": "[SKIP]"}.get(status, "[?]")
        md_lines.append(f"### {name}: {status_icon} {status}")
        md_lines.append("")
        
        if name == "data_freshness":
            if check.get("last_candle_date"):
                md_lines.append(f"- Last candle: {check['last_candle_date']}")
                md_lines.append(f"- Days stale: {check.get('days_stale', '?')}")
        
        if name == "performance":
            endpoints = check.get("endpoints", {})
            for ep, perf in endpoints.items():
                md_lines.append(f"- `{ep}`: p50={perf.get('p50_ms')}ms, max={perf.get('max_ms')}ms")
        
        if "error" in check:
            md_lines.append(f"- Error: `{check['error']}`")
        if "reason" in check:
            md_lines.append(f"- Reason: {check['reason']}")
        
        md_lines.append("")
    
    md_lines.extend([
        "## Final Status",
        "",
        f"**{overall}**",
        "",
        "---",
        f"Report generated: {results['timestamp']}",
    ])
    
    with REPORT_MD.open("w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))
    log(f"Markdown report: {REPORT_MD}")


def main() -> int:
    """Main entry point."""
    log(f"Day 3 Quality Gate - Repo: {REPO_ROOT}")
    
    results = None
    try:
        results = run_day3_checks()
    except Exception as exc:
        log(f"FATAL: {exc}", "ERROR")
        results = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "base_url": API_BASE_URL,
            "duration_sec": 0,
            "overall_status": "FAIL",
            "checks": {"fatal_error": {"status": "FAIL", "error": str(exc)}},
            "config": {},
        }
    finally:
        if results:
            write_reports(results)
    
    # PASS/WARN = exit 0, FAIL = exit 1
    exit_code = 0 if results["overall_status"] in ("PASS", "WARN") else 1
    log(f"Exit code: {exit_code}")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
