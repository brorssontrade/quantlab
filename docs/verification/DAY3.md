# Day 3 Release Quality Gate – Reference

> **Status:** NEW  
> **Workflow:** `.github/workflows/day3-monitoring.yml`  
> **Script:** `scripts/monitoring/day3_check.py`

---

## Overview

Day 3 quality gate validates release-readiness after Day 2 monitoring passes. It performs:

1. **Data Freshness** – OHLCV candles are recent (within last N trading days)
2. **Performance Gate** – API latency within defined thresholds (p95 < warn, max < fail)
3. **UI Smoke Tests** – Optional Playwright tests for frontend health

---

## Prerequisites

- Day 2 monitoring must have passed (APPROVED status)
- API server must be running and accessible
- For UI tests: Playwright must be installed (optional)

---

## Workflow Configuration

### Trigger Options

**1. Manual trigger:**
```
Actions → "Day 3 Release Quality Gate" → "Run workflow"
```

**2. Automatic after Day 2:**
The workflow automatically triggers when Day 2 completes successfully:
```yaml
workflow_run:
  workflows: ["Day 2 Production Monitoring"]
  types: [completed]
```

### Input Parameters

| Input | Default | Description |
|-------|---------|-------------|
| `skip_ui_tests` | `false` | Skip Playwright UI tests |
| `latency_warn_ms` | `500` | p95 latency warning threshold |
| `latency_fail_ms` | `2000` | Max latency failure threshold |

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DAY3_DEBUG` | `0` | Set to `1` for verbose output |
| `DAY3_SKIP_UI` | `false` | Skip UI smoke tests |
| `DAY3_LATENCY_WARN_MS` | `500` | p95 latency warning (ms) |
| `DAY3_LATENCY_FAIL_MS` | `2000` | Max latency failure (ms) |
| `DAY3_FRESHNESS_MAX_DAYS` | `3` | Max days since last candle |

---

## Check Details

### A) Data Freshness Check

Validates that OHLCV data is recent enough:

```
✅ PASS: Last candle date >= (today - DAY3_FRESHNESS_MAX_DAYS)
⚠️ WARN: Data is stale but within grace period (e.g., weekend)
❌ FAIL: Data is too old (> DAY3_FRESHNESS_MAX_DAYS)
```

**Weekend handling:** The check accounts for weekends. Data from Friday is valid on Saturday/Sunday.

### B) Performance Gate

Tests latency for key endpoints:
- `/health`
- `/api/health`
- `/chart/ohlcv`

**Metrics collected:**
- p50 (median)
- p95 (95th percentile)
- max (worst case)

**Thresholds:**
```
✅ PASS: p95 < warn_ms AND max < fail_ms
⚠️ WARN: p95 >= warn_ms BUT max < fail_ms
❌ FAIL: max >= fail_ms
```

### C) UI Smoke Tests (Optional)

If Playwright is installed and `DAY3_SKIP_UI=false`:
- Loads frontend URL
- Checks for critical elements
- Reports any JavaScript errors

**Skip with:** `DAY3_SKIP_UI=1` or workflow input `skip_ui_tests: true`

---

## Check Statuses

| Status | Meaning | Exit Code |
|--------|---------|-----------|
| `PASS` | All checks passed | 0 |
| `WARN` | Passed with warnings | 0 |
| `FAIL` | One or more checks failed | 1 |

---

## Output Files

Generated in `docs/verification/`:

- `DAY3_REPORT.json` – Machine-readable full results
- `DAY3_REPORT.md` – Human-readable summary

---

## Local Testing

```powershell
# 1. Ensure API is running
# 2. Run Day 3 checks

$env:BASE_URL = "http://127.0.0.1:8000"
$env:DAY3_DEBUG = "1"  # Optional: verbose output
$env:DAY3_SKIP_UI = "1"  # Skip UI tests locally

.\.venv\Scripts\python.exe scripts\monitoring\day3_check.py
```

---

## Troubleshooting

### "Data freshness FAIL"
- Check if market data is being updated
- Verify OHLCV endpoint returns recent data
- On weekends, Friday's data should be accepted

### "Performance FAIL"
- Check API server load
- Review latency thresholds (may need adjustment)
- Check network connectivity to API

### "UI smoke test FAIL"
- Ensure frontend is running
- Check browser console for errors
- Try with `DAY3_SKIP_UI=1` to isolate issue

---

## Related Files

- [day3-monitoring.yml](/.github/workflows/day3-monitoring.yml) – GitHub Actions workflow
- [day3_check.py](/scripts/monitoring/day3_check.py) – Check script
- [DAY2.md](./DAY2.md) – Day 2 monitoring reference
