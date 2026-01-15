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
from datetime import datetime, timedelta, timezone
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


def check_ohlcv_fetch(symbol: str | None = None, timeframes: list[str] | None = None) -> dict[str, Any]:
    """Fetch OHLCV for one symbol across multiple timeframes.
    
    Uses /chart/ohlcv endpoint with params:
      - symbol: ticker symbol (e.g. ABB.ST)
      - bar: D (daily), W (weekly), 1h, 15m, 5m
      - start: ISO timestamp (optional)
      - end: ISO timestamp (optional)
      - limit: max candles (default 2000)
    
    Environment variables:
      - DAY2_SAMPLE_SYMBOL: Symbol to test (default: ABB.ST - Swedish stock)
      - DAY2_LOOKBACK_DAYS: Days to look back (default: 90)
    """
    # Configurable via env vars - default to Swedish stock that should exist
    if symbol is None:
        symbol = os.environ.get("DAY2_SAMPLE_SYMBOL", "ABB.ST")
    
    lookback_days = int(os.environ.get("DAY2_LOOKBACK_DAYS", "90"))
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=lookback_days)
    
    if timeframes is None:
        timeframes = ["D"]  # D=daily (most reliable)
    
    log(f"Fetching OHLCV: {symbol} @ {timeframes} (last {lookback_days} days)")
    results = []
    
    for tf in timeframes:
        url = f"{API_BASE_URL}/chart/ohlcv"
        params = {
            "symbol": symbol,
            "bar": tf,
            "start": start_date.strftime("%Y-%m-%dT00:00:00"),
            "end": end_date.strftime("%Y-%m-%dT23:59:59"),
            "limit": 500,
        }
        log(f"[DIAG] OHLCV request: {url}")
        log(f"[DIAG] OHLCV params: {params}")
        
        try:
            resp = requests.get(url, params=params, timeout=TIMEOUT_SEC)
            log(f"[DIAG] HTTP status: {resp.status_code}")
            resp.raise_for_status()
            
            data = resp.json()
            
            # Support both 'candles' and 'rows' keys in response
            # Backend may return {rows: [...]} or {candles: [...]} or [...]
            candles = None
            data_key = None
            if isinstance(data, dict):
                if data.get("candles"):
                    candles = data["candles"]
                    data_key = "candles"
                elif data.get("rows"):
                    candles = data["rows"]
                    data_key = "rows"
                else:
                    candles = []
                    data_key = "<missing>"
            elif isinstance(data, list):
                candles = data
                data_key = "<root-array>"
            else:
                candles = []
                data_key = "<unknown-type>"
            
            rows = len(candles) if isinstance(candles, list) else 0
            log(f"[DIAG] Response data_key={data_key}, row_count={rows}")
            
            # FAIL if 0 candles - data pipeline not working
            if rows == 0:
                # Log response body for debugging (capped)
                body_preview = str(data)[:500] if data else "<empty>"
                log(f"[DIAG] Response body (0 candles): {body_preview}", "ERROR")
                log(f"[FAIL] {symbol}@{tf} -> 0 candles (expected data for last {lookback_days} days)", "FAIL")
                results.append({
                    "timeframe": tf, 
                    "status": "FAIL", 
                    "rows": 0,
                    "error": f"No candles returned for {symbol} in last {lookback_days} days",
                    "response_preview": body_preview,
                })
            else:
                log(f"[OK] {symbol}@{tf} -> {rows} candles (from '{data_key}')", "PASS")
                results.append({"timeframe": tf, "status": "PASS", "rows": rows})
        except requests.exceptions.HTTPError as exc:
            body_preview = exc.response.text[:500] if exc.response else "<no response>"
            log(f"[DIAG] HTTP error response: {body_preview}", "ERROR")
            log(f"[FAIL] {symbol}@{tf} -> {exc}", "FAIL")
            results.append({"timeframe": tf, "status": "FAIL", "error": str(exc), "response_preview": body_preview})
        except Exception as exc:
            log(f"[FAIL] {symbol}@{tf} -> {exc}", "FAIL")
            results.append({"timeframe": tf, "status": "FAIL", "error": str(exc)})
    
    overall = "PASS" if all(r["status"] == "PASS" for r in results) else "FAIL"
    return {"status": overall, "symbol": symbol, "results": results}


def run_pytest_suite(suite: str, markers: str | None = None) -> dict[str, Any]:
    """Run pytest suite and return results."""
    log(f"Running pytest suite: {suite}")
    
    # Set PYTHONPATH to repo root AND src/ for proper imports
    # quantkit is under src/quantkit/, so src/ must be on path
    env = os.environ.copy()
    src_path = str(REPO_ROOT / "src")
    existing_path = env.get("PYTHONPATH", "")
    if existing_path:
        env["PYTHONPATH"] = f"{src_path}{os.pathsep}{REPO_ROOT}{os.pathsep}{existing_path}"
    else:
        env["PYTHONPATH"] = f"{src_path}{os.pathsep}{REPO_ROOT}"
    env["PYTHONUTF8"] = "1"  # Force UTF-8 on Windows
    
    # First, run collection diagnostics
    log(f"[DIAG] Python: {sys.executable}")
    log(f"[DIAG] REPO_ROOT: {REPO_ROOT}")
    log(f"[DIAG] PYTHONPATH: {env['PYTHONPATH']}")
    
    # Check if test file/dir exists
    test_path = REPO_ROOT / suite
    if not test_path.exists():
        log(f"[FAIL] Test path does not exist: {test_path}", "FAIL")
        return {"status": "FAIL", "error": f"Test path not found: {suite}", "stderr": ""}
    
    # First run --collect-only to see what pytest finds
    collect_cmd = [sys.executable, "-m", "pytest", suite, "--collect-only", "-q"]
    if markers:
        collect_cmd.extend(["-m", markers])
    
    log(f"[DIAG] Running collect: {' '.join(collect_cmd)}")
    try:
        collect_result = subprocess.run(
            collect_cmd,
            capture_output=True,
            text=True,
            timeout=60,
            cwd=REPO_ROOT,
            env=env,
        )
        log(f"[DIAG] collect-only exit: {collect_result.returncode}")
        if collect_result.stdout:
            log(f"[DIAG] collected: {collect_result.stdout[:500]}")
        if collect_result.returncode != 0 and collect_result.stderr:
            log(f"[DIAG] collect stderr: {collect_result.stderr[:500]}", "ERROR")
    except Exception as exc:
        log(f"[DIAG] collect-only failed: {exc}", "ERROR")
    
    # Run pytest with python -m to ensure correct environment
    cmd = [sys.executable, "-m", "pytest", suite, "-q", "--disable-warnings", "--tb=short"]
    if markers:
        cmd.extend(["-m", markers])
    
    log(f"[DIAG] Running: {' '.join(cmd)}")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
            cwd=REPO_ROOT,
            env=env,
        )
        
        # Pytest exit codes:
        # 0 = all tests passed
        # 1 = some tests failed
        # 2 = user interrupted
        # 3 = internal error
        # 4 = usage error
        # 5 = no tests collected (treat as SKIP, not FAIL)
        if result.returncode == 0:
            status = "PASS"
            log(f"[OK] pytest {suite} -> exit 0 (all passed)", "PASS")
        elif result.returncode == 5:
            status = "SKIP"
            log(f"[SKIP] pytest {suite} -> exit 5 (no tests collected for marker)", "WARN")
        else:
            status = "FAIL"
            log(f"[FAIL] pytest {suite} -> exit {result.returncode}", "FAIL")
        
        # Always log stdout/stderr for debugging
        if result.stdout:
            log(f"[DIAG] stdout (last 500): {result.stdout[-500:]}")
        if result.stderr:
            log(f"[DIAG] stderr (last 500): {result.stderr[-500:]}", "ERROR")
        
        return {
            "status": status,
            "exit_code": result.returncode,
            "stdout": result.stdout[-2000:],  # Last 2000 chars
            "stderr": result.stderr[-1000:],
        }
    except Exception as exc:
        log(f"[FAIL] pytest {suite} -> {exc}", "FAIL")
        return {"status": "FAIL", "error": str(exc), "stderr": ""}


# ============================================================================
# Main Check Runner
# ============================================================================


def find_parity_tests() -> str | None:
    """Auto-detect parity test file via glob search."""
    log("[DIAG] Searching for parity test files...")
    
    # Helper to filter out .venv and other non-repo paths
    def is_repo_test(p: Path) -> bool:
        """Return True if path is a real repo test (not in .venv, node_modules, etc)."""
        parts = p.relative_to(REPO_ROOT).parts
        exclude_dirs = {'.venv', 'venv', 'node_modules', '.git', '__pycache__', 'site-packages'}
        return not any(part in exclude_dirs for part in parts)
    
    # First, list ALL test files for diagnostics (excluding .venv)
    log("[DIAG] All Python test files in repo (excluding .venv):")
    all_tests_raw = list(REPO_ROOT.glob("**/test*.py")) + list(REPO_ROOT.glob("**/*_test.py"))
    all_tests = [t for t in all_tests_raw if is_repo_test(t)]
    for tf in all_tests[:20]:  # Show first 20
        log(f"[DIAG]   - {tf.relative_to(REPO_ROOT)}")
    if len(all_tests) > 20:
        log(f"[DIAG]   ... and {len(all_tests) - 20} more")
    if not all_tests:
        log("[DIAG]   (no test files found)")
    
    # Search patterns in priority order (include repo root)
    patterns = [
        "test*parity*.py",           # repo root
        "test*indicator*.py",        # repo root
        "tests/test*parity*.py",     # tests/ folder
        "tests/test*indicator*.py",  # tests/ folder
        "**/test*parity*.py",        # anywhere
        "**/test*indicator*.py",     # anywhere
    ]
    
    for pattern in patterns:
        matches_raw = list(REPO_ROOT.glob(pattern))
        matches = [m for m in matches_raw if is_repo_test(m)]
        if matches:
            log(f"[DIAG] Pattern '{pattern}' found {len(matches)} files:")
            for m in matches[:5]:  # Show first 5
                log(f"[DIAG]   - {m.relative_to(REPO_ROOT)}")
            # Return first match
            return str(matches[0].relative_to(REPO_ROOT))
    
    log("[DIAG] No parity/indicator test files found via glob")
    
    # Last resort: check if ANY tests exist and use keyword filter
    if all_tests:
        log("[DIAG] Will use pytest keyword filter instead")
    
    return None


def run_day2_checks() -> dict[str, Any]:
    """Execute all Day 2 checks and aggregate results."""
    log("=== Day 2 Production Monitoring Start ===")
    log(f"Target: {API_BASE_URL}")
    
    start_time = time.time()
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # Core health checks
    checks = {
        "health": check_health("/health"),
        "api_health": check_health("/api/health"),
        "ohlcv_fetch": check_ohlcv_fetch(),  # Uses env vars for config
    }
    
    # Auto-detect parity tests
    parity_test = find_parity_tests()
    if parity_test:
        log(f"[INFO] Running parity test: {parity_test}")
        checks["pytest_parity"] = run_pytest_suite(parity_test)
    else:
        log("[WARN] No parity test file found - running pytest with keyword filter")
        # Fallback: use keyword matching
        checks["pytest_parity"] = run_pytest_suite("tests/", markers="parity or indicators")
    
    # Run critical tests (skip slow ones)
    tests_dir = REPO_ROOT / "tests"
    if tests_dir.exists():
        checks["pytest_critical"] = run_pytest_suite("tests/", markers="not slow")
    else:
        log("[WARN] tests/ directory not found - skipping pytest_critical")
        checks["pytest_critical"] = {"status": "SKIP", "error": "tests/ directory not found"}
    
    elapsed = time.time() - start_time
    
    # Determine overall status (SKIP doesn't count as failure)
    all_pass = all(
        check.get("status") in ("PASS", "SKIP") 
        for check in checks.values()
    )
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
