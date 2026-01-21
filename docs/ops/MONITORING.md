# Monitoring & Operations Guide

> **Purpose:** Day 2/Day 3 monitoring, CI/CD quality gates, and operational runbooks  
> **Last Updated:** 2025-01-15

---

## 1. Overview

QuantLab uses a multi-tier monitoring approach:

| Tier | Name | Purpose | Frequency |
|------|------|---------|-----------|
| Day 1 | Baseline | Establish initial state | Once (setup) |
| Day 2 | Monitoring | Post-release validation | On-demand / PR merge |
| Day 3 | Quality Gate | Ongoing health checks | Scheduled / On-demand |

---

## 2. Day 2 Monitoring

### Purpose
Verify that a new release hasn't broken critical functionality within 24-48 hours of deployment.

### Checks Performed
1. **Backend Health** – `/api/health` returns `{"status": "ok"}`
2. **Backend Smoke** – pytest runs without critical failures
3. **Frontend Build** – `npm run build` completes successfully
4. **Data Freshness** – OHLCV data is recent (< 7 days old)

### Running Day 2 Check
```powershell
cd quantlab
python scripts/monitoring/day2_check.py
```

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `DAY2_DEBUG` | Enable verbose [DIAG] logs | `0` |
| `API_BASE_URL` | Backend URL to test | `http://127.0.0.1:8000` |
| `SKIP_BACKEND_SMOKE` | Skip pytest tests | `0` |
| `SKIP_FRONTEND_BUILD` | Skip npm build | `0` |

### Example with Debug
```powershell
$env:DAY2_DEBUG = "1"
python scripts/monitoring/day2_check.py
```

### CI Workflow
File: `.github/workflows/day2-monitoring.yml`

Triggers:
- Manual dispatch (`workflow_dispatch`)
- After PR merge to `main`

Runner: `[self-hosted, Windows, X64, quantlab-local]`

### Success Criteria
- Exit code 0 = PASS
- Exit code 1 = FAIL
- Exit code 5 = SKIP (pytest no tests collected)

---

## 3. Day 3 Quality Gate

### Purpose
Continuous quality checks ensuring the codebase remains healthy over time.

### Checks Performed
1. **Data Freshness** – All critical symbols have data < max_age days
2. **Performance Thresholds** – Response times within limits
3. **UI Smoke Tests** (optional) – Playwright E2E tests pass

### Running Day 3 Check
```powershell
cd quantlab
python scripts/monitoring/day3_check.py
```

### Configuration
Edit `config/settings.yml` or pass environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATA_MAX_AGE_DAYS` | Max days since last OHLCV update | `7` |
| `API_RESPONSE_THRESHOLD_MS` | Max API response time | `2000` |
| `RUN_UI_SMOKE` | Run Playwright tests | `0` |
| `SMOKE_TEST_FILE` | Which Playwright spec | `day3.smoke.spec.ts` |

### UI Smoke Test
```powershell
$env:RUN_UI_SMOKE = "1"
python scripts/monitoring/day3_check.py
```

This runs:
```powershell
cd quantlab-ui
npx playwright test tests/day3.smoke.spec.ts --project=chromium
```

### CI Workflow
File: `.github/workflows/day3-monitoring.yml`

Triggers:
- Manual dispatch
- Scheduled (cron)

---

## 4. Quality Gate Details

### Data Freshness Check

```python
# Pseudocode
for symbol in CRITICAL_SYMBOLS:
    latest_date = get_latest_ohlcv_date(symbol)
    age_days = (today - latest_date).days
    if age_days > DATA_MAX_AGE_DAYS:
        fail(f"{symbol} data is {age_days} days stale")
```

Critical symbols (configurable):
- `ABB.ST`
- `AAPL.US`
- `VOLV-B.ST`

### Performance Thresholds

| Endpoint | Threshold | Measurement |
|----------|-----------|-------------|
| `GET /health` | < 500ms | Time to first byte |
| `GET /api/health` | < 500ms | Time to first byte |
| `GET /chart/ohlcv` | < 2000ms | Full response |
| `GET /api/fundamentals/{symbol}` | < 3000ms | Full response |

### UI Smoke Test Assertions

File: `quantlab-ui/tests/day3.smoke.spec.ts`

1. **Page loads** – No JS errors in console
2. **API reachable** – Health badge shows "API: ON"
3. **Charts render** – Canvas has non-zero pixels
4. **Tab navigation** – All tabs are clickable

---

## 5. Docs Gate

### Purpose
Ensure documentation stays in sync with code changes.

### Checks Performed
1. **LLM.md exists** – Main context doc present
2. **FILE_INDEX.md updated** – File reference includes new files
3. **LLM_TASKS.md updated** – Task tracking current
4. **No broken links** – Internal doc links resolve

### CI Workflow
File: `.github/workflows/docs-gate.yml`

Triggers:
- On PR to `main`
- Paths: `docs/**`, `app/**`, `quantlab-ui/src/**`

---

## 6. Alert Channels

### Slack Notifications
```yaml
# In workflow
- uses: slackapi/slack-github-action@v1
  with:
    webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
    payload: '{"text": "Day 2 monitoring FAILED"}'
```

### Telegram Notifications
```powershell
$env:TELEGRAM_BOT_TOKEN = "your-token"
$env:TELEGRAM_CHAT_ID = "your-chat-id"
python scripts/monitoring/send_telegram_alert.py "Day 3 check failed"
```

---

## 7. Runbooks

### Backend Not Responding

1. Check if uvicorn is running:
   ```powershell
   Get-Process python | Where-Object { $_.CommandLine -match "uvicorn" }
   ```

2. Check port availability:
   ```powershell
   netstat -ano | findstr :8000
   ```

3. Restart backend:
   ```powershell
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

4. Check logs:
   ```powershell
   Get-Content logs/app.log -Tail 50
   ```

### Data Freshness Failure

1. Check EODHD API key:
   ```powershell
   echo $env:EODHD_API_KEY
   ```

2. Manual data fetch:
   ```powershell
   python -c "from engine.ingest import fetch_ohlcv; print(fetch_ohlcv('ABB.ST', 'D', 10))"
   ```

3. Check cache:
   ```powershell
   ls storage/eodhd_cache/*.parquet | Sort-Object LastWriteTime -Descending | Select-Object -First 5
   ```

4. Force refresh:
   ```powershell
   python scripts/refresh_ohlcv.py --symbol ABB.ST --force
   ```

### UI Tests Failing

1. Run headed to see what's happening:
   ```powershell
   cd quantlab-ui
   npx playwright test tests/day3.smoke.spec.ts --headed
   ```

2. Check Playwright report:
   ```powershell
   npx playwright show-report
   ```

3. Verify frontend builds:
   ```powershell
   npm run build
   npm run preview
   ```

4. Check browser installation:
   ```powershell
   npx playwright install chromium
   ```

---

## 8. Metrics & Reporting

### Day 2 Report
Output: `docs/verification/DAY2_REPORT.json`

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "status": "PASS",
  "checks": {
    "backend_health": "PASS",
    "backend_smoke": "PASS",
    "frontend_build": "PASS",
    "data_freshness": "PASS"
  },
  "duration_seconds": 45.2
}
```

### Day 3 Report
Output: `docs/verification/DAY3_REPORT.json`

```json
{
  "timestamp": "2025-01-15T10:35:00Z",
  "status": "PASS",
  "checks": {
    "data_freshness": {"ABB.ST": 1, "AAPL.US": 0},
    "performance": {"health": 120, "ohlcv": 850},
    "ui_smoke": "PASS"
  }
}
```

---

## 9. Scheduled Jobs

### Cron Schedule (GitHub Actions)

```yaml
on:
  schedule:
    - cron: '0 6 * * *'   # Daily at 06:00 UTC
    - cron: '0 18 * * *'  # Daily at 18:00 UTC
```

### Local Scheduler (APScheduler)

The backend runs scheduled jobs for:
- Alert evaluation (`eval_alerts_job`)
- Data refresh (`refresh_ohlcv_job`)

Configure in `config/settings.yml`:
```yaml
scheduler:
  alert_interval_minutes: 5
  data_refresh_hour: 6
```

---

## 10. Troubleshooting Matrix

| Symptom | Check | Fix |
|---------|-------|-----|
| Day 2 fails on backend_smoke | pytest output | Fix test or skip with `SKIP_BACKEND_SMOKE=1` |
| Day 2 fails on frontend_build | npm errors | Run `npm install` again; check Node version |
| Day 3 data_freshness FAIL | EODHD key valid? | Verify key; check rate limits |
| Day 3 performance FAIL | Backend under load? | Restart; check for N+1 queries |
| UI smoke hangs | Browser issue | `npx playwright install --with-deps` |

---

## Related Documents

- [LLM.md](../LLM.md) – Main project context
- [verification/DAY2.md](../verification/DAY2.md) – Day 2 details
- [verification/DAY3.md](../verification/DAY3.md) – Day 3 details
- [WINDOWS_DEV.md](./WINDOWS_DEV.md) – Windows-specific setup
