# Day 2 Production Monitoring – Reference

> **Status:** APPROVED ✅  
> **Last verified:** 2025-01-XX  
> **Workflow:** `.github/workflows/day2-monitoring.yml`  
> **Script:** `scripts/monitoring/day2_check.py`

---

## Overview

Day 2 monitoring validates that the production API is healthy and functional after deployment. It performs:

1. **Health checks** – `/health` and `/api/health` endpoints respond with 200 OK
2. **OHLCV fetch** – `/chart/ohlcv` returns valid candle data for test symbol
3. **Pytest parity** – Indicator parity tests pass (via pytest markers)
4. **Pytest critical** – All non-slow tests pass

---

## Workflow Configuration

### Runner Labels

The workflow requires a **self-hosted Windows runner** with access to the local FastAPI server.

```yaml
runs-on: [self-hosted, Windows, X64, quantlab-local]
```

If your runner has different labels, update the `runs-on` field accordingly.

### Required Secrets

| Secret Name | Purpose | Required |
|------------|---------|----------|
| `PROD_API_BASE_URL` | Production API base URL (canonical) | ✅ |
| `STAGING_API_BASE_URL` | Staging API base URL | Optional |

**Legacy secrets** (deprecated, will show warning):
- `PROD_BASE_URL` → use `PROD_API_BASE_URL` instead
- `STAGING_BASE_URL` → use `STAGING_API_BASE_URL` instead

### Trigger Options

```yaml
on:
  workflow_dispatch:           # Manual trigger via GitHub UI
  schedule:
    - cron: '30 6 * * *'      # Daily at 06:30 UTC
```

**Manual trigger:** Go to Actions → "Day 2 Production Monitoring" → "Run workflow"

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DAY2_DEBUG` | `""` | Set to `1` to enable verbose diagnostics |
| `OHLCV_SYMBOL` | `ABB.ST` | Symbol for OHLCV test |
| `OHLCV_BAR` | `D` | Bar size (`D` or `W`) |
| `OHLCV_LIMIT` | `100` | Number of candles to fetch |

---

## Check Statuses

| Status | Meaning | Action |
|--------|---------|--------|
| `PASS` | Check succeeded | Continue |
| `SKIP` | Check skipped (e.g., no tests found) | Investigate, but not failure |
| `FAIL` | Check failed | Review logs, fix issue |

**Overall Result:**
- `APPROVED` – All checks PASS or SKIP
- `ROLLBACK` – Any check failed

---

## Pytest Exit Codes

The script handles pytest exit codes correctly:

| Exit Code | Meaning | Treated As |
|-----------|---------|------------|
| 0 | All tests passed | PASS |
| 1 | Some tests failed | FAIL |
| 5 | No tests collected | SKIP (not failure) |
| Others | Internal/usage error | FAIL |

---

## Troubleshooting

### Common Issues

**1. "Could not find BASE_URL"**
- Ensure `PROD_API_BASE_URL` secret is set in GitHub repo settings
- Check the workflow passes the secret: `BASE_URL: ${{ secrets.PROD_API_BASE_URL }}`

**2. "Test path does not exist"**
- Ensure `tests/` directory exists in repo root
- Check that parity test files match expected patterns (`test*parity*.py`)

**3. "exit 5 (no tests collected)"**
- This is treated as SKIP, not failure
- Verify pytest markers exist: `@pytest.mark.parity` or `@pytest.mark.indicators`

**4. Encoding errors on Windows**
- The script sets `PYTHONUTF8=1` and `PYTHONIOENCODING=utf-8`
- If issues persist, check PowerShell encoding: `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`

### Enable Debug Mode

Set `DAY2_DEBUG=1` in workflow environment to see verbose diagnostics:

```yaml
env:
  DAY2_DEBUG: "1"
```

---

## Output Files

The script generates reports in `docs/verification/`:

- `DAY2_REPORT.json` – Machine-readable full results
- `DAY2_REPORT.md` – Human-readable summary

---

## Local Testing

To run Day 2 checks locally:

```powershell
# 1. Start the API server
cd c:\Users\Viktor Brorsson\Desktop\quantlab
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. In another terminal, run the check
$env:BASE_URL = "http://127.0.0.1:8000"
.\.venv\Scripts\python.exe scripts\monitoring\day2_check.py
```

---

## Related Files

- [day2-monitoring.yml](/.github/workflows/day2-monitoring.yml) – GitHub Actions workflow
- [day2_check.py](/scripts/monitoring/day2_check.py) – Check script
- [DAY3.md](./DAY3.md) – Day 3 release gate (if exists)
