# Known Issues & Roadmap

> **Purpose:** Track known issues, workarounds, and planned improvements  
> **Last Updated:** 2025-01-15

---

## 1. Known Issues

### Critical (P0)

| ID | Issue | Workaround | Status |
|----|-------|------------|--------|
| - | *No critical issues* | - | - |

### High (P1)

| ID | Issue | Workaround | Status |
|----|-------|------------|--------|
| KI-001 | ChartsPro compare > 4 symbols causes layout overflow | Limit to 4 compares | Open |
| KI-002 | Fundamentals tab shows 500 error for symbols without EODHD coverage | Check symbol availability first | Open |
| KI-003 | Assistant tab requires Ollama running locally | Show clear error message | Open |
| KI-004 | pytest collection fails: `ModuleNotFoundError: No module named 'fastapi'/'typer'` | Backend deps missing; run `pip install -e .` or full setup; UI tests unaffected | Open |

### Medium (P2)

| ID | Issue | Workaround | Status |
|----|-------|------------|--------|
| KI-010 | Hot reload sometimes misses file changes on Windows | Restart uvicorn manually | Open |
| KI-011 | Playwright tests flaky on CI due to timing | Increase timeouts; use `waitForFunction` | Mitigated |
| KI-012 | DuckDB concurrent writes can fail | Retry with backoff | Open |
| KI-013 | Large parquet files slow to load on first request | Implement lazy loading | Open |

### Low (P3)

| ID | Issue | Workaround | Status |
|----|-------|------------|--------|
| KI-020 | Dark mode toggle doesn't persist across sessions | Use `localStorage` directly | Open |
| KI-021 | Chart zoom resets on timeframe change | Expected behavior per TV | Won't Fix |
| KI-022 | Tooltip flickers near chart edge | Clamp positioning | Mitigated |

---

## 2. Technical Debt

### Backend

| ID | Description | Impact | Priority |
|----|-------------|--------|----------|
| TD-001 | `app/main.py` is > 1800 lines | Hard to navigate | Medium |
| TD-002 | No type hints in `engine/` modules | IDE autocomplete broken | Low |
| TD-003 | Duplicate OHLCV fetch logic | Maintenance burden | Medium |
| TD-004 | APScheduler jobs not properly isolated | Cascading failures | High |

### Frontend

| ID | Description | Impact | Priority |
|----|-------------|--------|----------|
| TD-010 | ChartViewport.tsx > 3500 lines | Hard to maintain | High |
| TD-011 | Inconsistent error handling across tabs | UX varies | Medium |
| TD-012 | No component tests (only E2E) | Slow feedback loop | Medium |
| TD-013 | Bundle size > 2MB | Slow initial load | Low |

### Infrastructure

| ID | Description | Impact | Priority |
|----|-------------|--------|----------|
| TD-020 | No staging environment | Risky deployments | High |
| TD-021 | Self-hosted runner single point of failure | CI downtime | Medium |
| TD-022 | No automated database backups | Data loss risk | High |

---

## 3. Planned Improvements

### Q1 2025

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| F-001 | Split ChartViewport | Break into smaller components | Planned |
| F-002 | Add component tests | Jest + React Testing Library | Planned |
| F-003 | Staging environment | Separate deployment target | Planned |

### Q2 2025

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| F-010 | Real-time data streaming | WebSocket OHLCV updates | Backlog |
| F-011 | Multi-user support | Auth + user preferences | Backlog |
| F-012 | Strategy marketplace | Share/import strategies | Backlog |

### Backlog (Unscheduled)

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-100 | Mobile responsive UI | Touch-friendly charts | Low |
| F-101 | PDF report export | Generate backtest PDFs | Low |
| F-102 | Discord integration | Alert notifications | Low |
| F-103 | Multi-language support | i18n for UI | Low |

---

## 4. ChartsPro Specific Issues

### CP Feature Gaps

| Feature | TradingView | QuantLab | Gap |
|---------|-------------|----------|-----|
| Drawing tools | Full suite | Basic only | Major |
| Indicators | 100+ built-in | ~10 built-in | Major |
| Multi-pane layouts | Unlimited | 2 panes | Minor |
| Alerts from chart | Full | Partial | Minor |
| Replay mode | Yes | No | Major |

### CP Known Bugs

| ID | Bug | Repro Steps | Status |
|----|-----|-------------|--------|
| CP-001 | Legend drag-drop sometimes drops at wrong position | Drag fast across multiple rows | Open |
| CP-002 | Compare percent mode shows NaN for missing data | Add compare with gaps | Mitigated |
| CP-003 | tvUI suite shows 12 skipped tests (TV-8.2 Alert Markers) due to disabled describe block using wrong preview port and missing gotoChartsPro helper | Run `npm run test:tvui`; alert markers suite is `test.describe.skip` with conditional `test.skip()` when no alerts | Open |
| CP-004 | Inspector doesn't scroll for many objects | Add > 10 overlays | Open |

---

## 5. Workarounds Reference

### EODHD Rate Limits
```python
# If hitting 429 errors, add delay between requests
import time
for symbol in symbols:
    fetch_ohlcv(symbol)
    time.sleep(0.5)  # 500ms delay
```

### DuckDB Lock Errors
```python
# Retry on lock
import duckdb
from tenacity import retry, stop_after_attempt

@retry(stop=stop_after_attempt(3))
def execute_query(sql):
    with duckdb.connect('data/alerts.db') as conn:
        return conn.execute(sql).fetchall()
```

### Playwright Flakiness
```typescript
// Instead of fixed timeout
await page.waitForTimeout(1000);

// Use deterministic wait
await page.waitForFunction(() => 
  (window as any).__lwcharts?.dump?.().render?.pricePoints > 0
);
```

---

## 6. Reporting New Issues

### Template
```markdown
## Issue Title

**Type:** Bug / Feature Request / Technical Debt
**Priority:** P0 / P1 / P2 / P3
**Component:** Backend / Frontend / CI / Docs

### Description
[Clear description of the issue]

### Steps to Reproduce (for bugs)
1. Step 1
2. Step 2
3. ...

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Workaround
[If any]

### Additional Context
[Screenshots, logs, etc.]
```

### Where to Report
- GitHub Issues: For tracked bugs and features
- `docs/roadmap/KNOWN_ISSUES.md`: For documentation
- Slack #quantlab-dev: For quick discussions

---

## Related Documents

- [LLM.md](../LLM.md) – Main project context
- [LLM_TASKS.md](../LLM_TASKS.md) – Task tracking
- [APP_WALKTHROUGH_REPORT.md](../APP_WALKTHROUGH_REPORT.md) – UI status
