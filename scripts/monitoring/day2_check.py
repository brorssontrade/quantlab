#!/usr/bin/env python3
"""
Day 2 Production Monitoring Script for PR8 Consolidation

Runs automated checks against production (or staging) environment:
- Health endpoint verification
- Sample OHLCV data fetch (multi-symbol, multi-timeframe)
- Pytest smoke tests (parity/adapters + critical path)
- Generates machine-readable + human-readable reports

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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import requests

# ============================================================================
# Windows Console Encoding Fix
# ============================================================================
# Reconfigure stdout/stderr for UTF-8 to avoid UnicodeEncodeError on Windows
# when printing Unicode characters (checkmarks, etc.) to cp1252 console
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    # Python < 3.7 fallback
    pass

# ============================================================================
# Configuration
# ============================================================================

# API_BASE_URL: Backend FastAPI (health, OHLCV endpoints) - port 8000
# UI_BASE_URL: Frontend Vite (for future UI smoke tests) - port 5173
#
# Secrets mapping (priority order):
#   1. PROD_API_BASE_URL / STAGING_API_BASE_URL (preferred)
#   2. PROD_BASE_URL / STAGING_BASE_URL (legacy fallback)
#
# Day2 checks currently only use API; UI checks can be added later.


def resolve_api_url() -> tuple[str, str]:
    """Resolve API URL with deterministic priority. Returns (url, source_env_var)."""
    # Priority 1: New-style API secrets
    candidates = [
        ("PROD_API_BASE_URL", os.getenv("PROD_API_BASE_URL")),
        ("STAGING_API_BASE_URL", os.getenv("STAGING_API_BASE_URL")),
        # Priority 2: Legacy secrets (backwards compat)
        ("PROD_BASE_URL", os.getenv("PROD_BASE_URL")),
        ("STAGING_BASE_URL", os.getenv("STAGING_BASE_URL")),
    ]
    
    for env_name, value in candidates:
        if value:
            return value.rstrip("/"), env_name
    
    return "", ""


def validate_api_url(url: str, source: str) -> None:
    """Validate that URL looks like an API endpoint, not UI."""
    # Reject common UI ports
    ui_ports = ["5173", "5174", "3000", "4200"]  # Vite, CRA, Angular defaults
    for port in ui_ports:
        if f":{port}" in url:
            print(f"ERROR: Configuration error!", file=sys.stderr)
            print(f"  Source: {source} = {url}", file=sys.stderr)
            print(f"  Port {port} looks like a UI/frontend port.", file=sys.stderr)
            print(f"  Day2 API checks need the FastAPI backend (typically port 8000).", file=sys.stderr)
            print(f"  Fix: Set {source} to http://127.0.0.1:8000 (or your API port).", file=sys.stderr)
            sys.exit(1)


API_BASE_URL, API_URL_SOURCE = resolve_api_url()

if not API_BASE_URL:
    print("ERROR: No API URL environment variable is set.", file=sys.stderr)
    print("Priority order checked:", file=sys.stderr)
    print("  1. PROD_API_BASE_URL (preferred)", file=sys.stderr)
    print("  2. STAGING_API_BASE_URL", file=sys.stderr)
    print("  3. PROD_BASE_URL (legacy)", file=sys.stderr)
    print("  4. STAGING_BASE_URL (legacy)", file=sys.stderr)
    print("Set one of these in GitHub Secrets → FastAPI backend URL (port 8000).", file=sys.stderr)
    sys.exit(1)

# Validate URL doesn't point to UI port
validate_api_url(API_BASE_URL, API_URL_SOURCE)

# Log resolved URL (mask middle for security)
def _mask_url(url: str) -> str:
    """Mask URL for logging (show scheme + port only)."""
    if "://" in url:
        scheme, rest = url.split("://", 1)
        if ":" in rest:
            host_part, port_part = rest.rsplit(":", 1)
            return f"{scheme}://*****:{port_part}"
    return "*****"

print(f"[CONFIG] API_BASE_URL resolved from: {API_URL_SOURCE}", flush=True)
print(f"[CONFIG] Target: {_mask_url(API_BASE_URL)}", flush=True)

TIMEOUT_SEC = 30

# Repo root: prefer GITHUB_WORKSPACE (set by Actions), fallback to __file__ for local runs
if os.environ.get("GITHUB_WORKSPACE"):
    REPO_ROOT = Path(os.environ["GITHUB_WORKSPACE"])
    print(f"[CONFIG] REPO_ROOT from GITHUB_WORKSPACE: {REPO_ROOT}", flush=True)
else:
    REPO_ROOT = Path(__file__).parent.parent.parent
    print(f"[CONFIG] REPO_ROOT from __file__: {REPO_ROOT}", flush=True)

REPORT_DIR = REPO_ROOT / "docs" / "verification"
REPORT_JSON = REPORT_DIR / "DAY2_REPORT.json"
REPORT_MD = REPORT_DIR / "DAY2_REPORT.md"

# ============================================================================
# Helpers
# ============================================================================


def log(msg: str, level: Literal["INFO", "ERROR", "PASS", "FAIL"] = "INFO") -> None:
    """Print timestamped log message."""
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[{ts}] [{level}] {msg}", flush=True)


def check_health(endpoint: str) -> dict[str, Any]:
    """Check health endpoint and return result."""
    url = f"{API_BASE_URL}{endpoint}"
    log(f"Checking {url}")
    try:
        resp = requests.get(url, timeout=TIMEOUT_SEC)
        resp.raise_for_status()
        data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        log(f"[OK] {endpoint} -> {resp.status_code}", "PASS")
        return {"status": "PASS", "code": resp.status_code, "data": data}
    except Exception as exc:
        log(f"[FAIL] {endpoint} -> {exc}", "FAIL")
        return {"status": "FAIL", "error": str(exc)}


def check_ohlcv_fetch(symbol: str = "ABB.ST", timeframes: list[str] | None = None) -> dict[str, Any]:
    """Fetch OHLCV for one symbol across multiple timeframes.
    
    Uses /chart/ohlcv endpoint with params:
      - symbol: ticker symbol (e.g. ABB.ST)
      - bar: D (daily), W (weekly), 1h, 15m, 5m
      - start: ISO timestamp (optional)
      - end: ISO timestamp (optional)
      - limit: max candles (default 2000)
    """
    if timeframes is None:
        # Map friendly names to API bar values
        timeframes = ["D", "W"]  # D=daily, W=weekly
    
    log(f"Fetching OHLCV: {symbol} @ {timeframes}")
    results = []
    
    for tf in timeframes:
        # Correct endpoint: /chart/ohlcv (not /api/ohlcv)
        url = f"{API_BASE_URL}/chart/ohlcv"
        params = {
            "symbol": symbol,
            "bar": tf,  # D, W, 1h, 15m, 5m
            "start": "2024-01-01T00:00:00",
            "end": "2024-12-31T23:59:59",
            "limit": 500,
        }
        try:
            resp = requests.get(url, params=params, timeout=TIMEOUT_SEC)
            resp.raise_for_status()
            data = resp.json()
            # Response is ChartOHLCVResponse with 'candles' list
            candles = data.get("candles", []) if isinstance(data, dict) else data
            rows = len(candles) if isinstance(candles, list) else 0
            log(f"[OK] {symbol}@{tf} -> {rows} candles", "PASS")
            results.append({"timeframe": tf, "status": "PASS", "rows": rows})
        except Exception as exc:
            log(f"[FAIL] {symbol}@{tf} -> {exc}", "FAIL")
            results.append({"timeframe": tf, "status": "FAIL", "error": str(exc)})
    
    overall = "PASS" if all(r["status"] == "PASS" for r in results) else "FAIL"
    return {"status": overall, "symbol": symbol, "results": results}


def run_pytest_suite(suite: str, markers: str | None = None) -> dict[str, Any]:
    """Run pytest suite and return results."""
    log(f"Running pytest suite: {suite}")
    
    # Set PYTHONPATH to repo root for proper imports
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT)
    env["PYTHONUTF8"] = "1"  # Force UTF-8 on Windows
    
    # First, run collection diagnostics
    log(f"[DIAG] Python: {sys.executable}")
    log(f"[DIAG] REPO_ROOT: {REPO_ROOT}")
    
    # Check if test file/dir exists
    test_path = REPO_ROOT / suite
    if not test_path.exists():
        log(f"[FAIL] Test path does not exist: {test_path}", "FAIL")
        return {"status": "FAIL", "error": f"Test path not found: {suite}"}
    
    # Run pytest with python -m to ensure correct environment
    cmd = [sys.executable, "-m", "pytest", suite, "-q", "--disable-warnings", "--tb=short"]
    if markers:
        cmd.extend(["-m", markers])
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
            cwd=REPO_ROOT,
            env=env,
        )
        passed = result.returncode == 0
        log(f"{'[OK]' if passed else '[FAIL]'} pytest {suite} -> exit {result.returncode}", "PASS" if passed else "FAIL")
        
        # Log stderr if there was an error (collection issues, import errors)
        if result.returncode != 0 and result.stderr:
            log(f"[DIAG] stderr: {result.stderr[:500]}", "ERROR")
        
        return {
            "status": "PASS" if passed else "FAIL",
            "exit_code": result.returncode,
            "stdout": result.stdout[-2000:],  # Last 2000 chars
            "stderr": result.stderr[-1000:],
        }
    except Exception as exc:
        log(f"[FAIL] pytest {suite} -> {exc}", "FAIL")
        return {"status": "FAIL", "error": str(exc)}


# ============================================================================
# Main Check Runner
# ============================================================================


def run_day2_checks() -> dict[str, Any]:
    """Execute all Day 2 checks and aggregate results."""
    log("=== Day 2 Production Monitoring Start ===")
    log(f"Target: {API_BASE_URL}")
    
    start_time = time.time()
    timestamp = datetime.now(timezone.utc).isoformat()
    
    checks = {
        "health": check_health("/health"),
        "api_health": check_health("/api/health"),
        "ohlcv_fetch": check_ohlcv_fetch("ABB.ST", ["daily", "weekly"]),
        "pytest_parity": run_pytest_suite("tests/test_indicators_parity.py"),
        "pytest_critical": run_pytest_suite("tests/", markers="not slow"),
    }
    
    elapsed = time.time() - start_time
    
    # Determine overall status
    all_pass = all(check.get("status") == "PASS" for check in checks.values())
    overall_status = "APPROVED" if all_pass else "ROLLBACK"
    
    log(f"=== Day 2 Monitoring Complete: {overall_status} ({elapsed:.1f}s) ===")
    
    return {
        "timestamp": timestamp,
        "base_url": API_BASE_URL,
        "duration_sec": round(elapsed, 2),
        "overall_status": overall_status,
        "checks": checks,
    }


def write_reports(results: dict[str, Any]) -> None:
    """Write JSON and Markdown reports."""
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    
    # JSON report (machine-readable)
    with REPORT_JSON.open("w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    log(f"[OK] JSON report written: {REPORT_JSON}")
    
    # Markdown report (human-readable)
    overall = results["overall_status"]
    icon = "[PASS]" if overall == "APPROVED" else "[FAIL]"
    
    md_lines = [
        f"# Day 2 Production Monitoring Report - {icon} {overall}",
        "",
        f"**Timestamp:** {results['timestamp']}  ",
        f"**Target:** {results['base_url']}  ",
        f"**Duration:** {results['duration_sec']}s  ",
        "",
        "## Checks Summary",
        "",
    ]
    
    for name, check in results["checks"].items():
        status_icon = "[PASS]" if check.get("status") == "PASS" else "[FAIL]"
        md_lines.append(f"- **{name}:** {status_icon} {check.get('status', 'UNKNOWN')}")
        if "error" in check:
            md_lines.append(f"  - Error: `{check['error']}`")
        if "rows" in check:
            md_lines.append(f"  - Rows fetched: {check['rows']}")
        if "exit_code" in check:
            md_lines.append(f"  - Exit code: {check['exit_code']}")
    
    md_lines.extend([
        "",
        "## Final Status",
        "",
        f"**{overall}** — {'All checks passed; ready for production.' if overall == 'APPROVED' else 'One or more checks failed; ROLLBACK recommended.'}",
        "",
        "---",
        "",
        f"Report generated: {results['timestamp']}  ",
        f"Full details: [DAY2_REPORT.json]({REPORT_JSON.name})",
    ])
    
    with REPORT_MD.open("w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))
    log(f"[OK] Markdown report written: {REPORT_MD}")


# ============================================================================
# Entry Point
# ============================================================================


def main() -> int:
    """Main entry point; returns 0 for PASS, 1 for FAIL."""
    log(f"Repo root: {REPO_ROOT}")
    log(f"Report dir: {REPORT_DIR}")
    
    results = None
    try:
        results = run_day2_checks()
    except Exception as exc:
        # Ensure we always produce a report even on unexpected errors
        log(f"FATAL: Unexpected error during checks: {exc}", "ERROR")
        results = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "base_url": API_BASE_URL,
            "duration_sec": 0,
            "overall_status": "ROLLBACK",
            "checks": {"fatal_error": {"status": "FAIL", "error": str(exc)}},
        }
    finally:
        if results:
            write_reports(results)
    
    exit_code = 0 if results["overall_status"] == "APPROVED" else 1
    log(f"Exiting with code {exit_code}")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
