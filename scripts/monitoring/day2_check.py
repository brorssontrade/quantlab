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
# Configuration
# ============================================================================

# API_BASE_URL: Backend FastAPI (health, OHLCV endpoints) - port 8000
# UI_BASE_URL: Frontend Vite (for future UI smoke tests) - port 5173
#
# Secrets mapping:
#   PROD_API_BASE_URL -> e.g. http://127.0.0.1:8000 (backend)
#   PROD_UI_BASE_URL  -> e.g. http://127.0.0.1:5173 (frontend)
#   STAGING_API_BASE_URL / STAGING_UI_BASE_URL for staging
#
# Day2 checks currently only use API; UI checks can be added later.

API_BASE_URL = os.getenv("PROD_API_BASE_URL") or os.getenv("STAGING_API_BASE_URL")

# Fallback to old variable names for backwards compatibility
if not API_BASE_URL:
    API_BASE_URL = os.getenv("PROD_BASE_URL") or os.getenv("STAGING_BASE_URL")

if not API_BASE_URL:
    print("ERROR: API_BASE_URL environment variable not set.", file=sys.stderr)
    print("Set PROD_API_BASE_URL or STAGING_API_BASE_URL (or legacy PROD_BASE_URL/STAGING_BASE_URL).", file=sys.stderr)
    print("GitHub Secrets must include the appropriate URL for the FastAPI backend (port 8000).", file=sys.stderr)
    sys.exit(1)

TIMEOUT_SEC = 30
# Repo-root-anchored paths (works whether script runs locally or in CI)
REPO_ROOT = Path(__file__).parent.parent.parent
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
        log(f"✓ {endpoint} → {resp.status_code}", "PASS")
        return {"status": "PASS", "code": resp.status_code, "data": data}
    except Exception as exc:
        log(f"✗ {endpoint} → {exc}", "FAIL")
        return {"status": "FAIL", "error": str(exc)}


def check_ohlcv_fetch(symbol: str = "ABB.ST", timeframes: list[str] | None = None) -> dict[str, Any]:
    """Fetch OHLCV for one symbol across multiple timeframes."""
    if timeframes is None:
        timeframes = ["daily", "weekly"]
    
    log(f"Fetching OHLCV: {symbol} @ {timeframes}")
    results = []
    
    for tf in timeframes:
        url = f"{API_BASE_URL}/api/ohlcv"
        params = {"symbol": symbol, "bar": tf, "start_date": "2024-01-01", "end_date": "2024-12-31"}
        try:
            resp = requests.get(url, params=params, timeout=TIMEOUT_SEC)
            resp.raise_for_status()
            data = resp.json()
            rows = len(data) if isinstance(data, list) else 0
            log(f"✓ {symbol}@{tf} → {rows} rows", "PASS")
            results.append({"timeframe": tf, "status": "PASS", "rows": rows})
        except Exception as exc:
            log(f"✗ {symbol}@{tf} → {exc}", "FAIL")
            results.append({"timeframe": tf, "status": "FAIL", "error": str(exc)})
    
    overall = "PASS" if all(r["status"] == "PASS" for r in results) else "FAIL"
    return {"status": overall, "symbol": symbol, "results": results}


def run_pytest_suite(suite: str, markers: str | None = None) -> dict[str, Any]:
    """Run pytest suite and return results."""
    log(f"Running pytest suite: {suite}")
    cmd = ["pytest", suite, "-q", "--disable-warnings", "--tb=short"]
    if markers:
        cmd.extend(["-m", markers])
    
    # Set PYTHONPATH to repo root for proper imports
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT)
    
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
        log(f"{'✓' if passed else '✗'} pytest {suite} → exit {result.returncode}", "PASS" if passed else "FAIL")
        return {
            "status": "PASS" if passed else "FAIL",
            "exit_code": result.returncode,
            "stdout": result.stdout[-2000:],  # Last 2000 chars
            "stderr": result.stderr[-1000:],
        }
    except Exception as exc:
        log(f"✗ pytest {suite} → {exc}", "FAIL")
        return {"status": "FAIL", "error": str(exc)}


# ============================================================================
# Main Check Runner
# ============================================================================


def run_day2_checks() -> dict[str, Any]:
    """Execute all Day 2 checks and aggregate results."""
    log("=== Day 2 Production Monitoring Start ===")
    log(f"Target: {BASE_URL}")
    
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
        "base_url": BASE_URL,
        "duration_sec": round(elapsed, 2),
        "overall_status": overall_status,
        "checks": checks,
    }


def write_reports(results: dict[str, Any]) -> None:
    """Write JSON and Markdown reports."""
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    
    # JSON report (machine-readable)
    with REPORT_JSON.open("w") as f:
        json.dump(results, f, indent=2)
    log(f"✓ JSON report written: {REPORT_JSON}")
    
    # Markdown report (human-readable)
    overall = results["overall_status"]
    icon = "✅" if overall == "APPROVED" else "❌"
    
    md_lines = [
        f"# Day 2 Production Monitoring Report — {icon} {overall}",
        "",
        f"**Timestamp:** {results['timestamp']}  ",
        f"**Target:** {results['base_url']}  ",
        f"**Duration:** {results['duration_sec']}s  ",
        "",
        "## Checks Summary",
        "",
    ]
    
    for name, check in results["checks"].items():
        status_icon = "✅" if check.get("status") == "PASS" else "❌"
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
    
    with REPORT_MD.open("w") as f:
        f.write("\n".join(md_lines))
    log(f"✓ Markdown report written: {REPORT_MD}")


# ============================================================================
# Entry Point
# ============================================================================


def main() -> int:
    """Main entry point; returns 0 for PASS, 1 for FAIL."""
    log(f"Repo root: {REPO_ROOT}")
    log(f"Report dir: {REPORT_DIR}")
    
    results = run_day2_checks()
    write_reports(results)
    
    exit_code = 0 if results["overall_status"] == "APPROVED" else 1
    log(f"Exiting with code {exit_code}")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
