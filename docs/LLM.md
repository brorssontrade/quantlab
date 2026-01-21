# QuantLab – LLM Context Document

> **Single source of truth for AI assistants and new developers**  
> **Version:** See `git log -1 --format="%h %ci" -- docs/LLM.md`  
> **Branch:** feat/chartspro-cp4-buildgreen

---

## 0. Read This First

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **This file (LLM.md)** | High-level architecture & quick start | Always start here |
| [APP_WALKTHROUGH_REPORT.md](./APP_WALKTHROUGH_REPORT.md) | UI page analysis (16 tabs) | Understanding frontend |
| [FILE_INDEX.md](./FILE_INDEX.md) | File structure reference (~300 files) | Finding code |
| [LLM_TASKS.md](./LLM_TASKS.md) | Task backlog & done log | What's been done/planned |

### Deep-Dive Documents

| Topic | Document | Content |
|-------|----------|---------|
| ChartsPro QA | [docs/chartspro/QA_CHARTSPRO.md](./chartspro/QA_CHARTSPRO.md) | `window.__lwcharts` contract, CP2-CP10, QA primitives |
| Windows Dev | [docs/dev/WINDOWS_DEV.md](./dev/WINDOWS_DEV.md) | PYTHONPATH, uvicorn reload, watchfiles pitfalls |
| CI/Monitoring | [docs/ops/MONITORING.md](./ops/MONITORING.md) | Day 2/Day 3 checks, env vars, runbooks |
| Known Issues | [docs/roadmap/KNOWN_ISSUES.md](./roadmap/KNOWN_ISSUES.md) | Bugs, workarounds, roadmap |

---

## 1. Product Overview

**QuantLab** is a quantitative trading research platform with:

- **Backend:** FastAPI (Python 3.11+) serving data, optimization, alerts, and LLM assistant
- **Frontend:** React + TypeScript (Vite) with professional charting via lightweight-charts
- **Data:** EODHD API for OHLCV + fundamentals, DuckDB for local storage
- **Orchestration:** APScheduler for scheduled jobs, Optuna for hyperparameter optimization

### Core Use Cases

1. **Backtest strategies** – Run Optuna optimization on trading strategies
2. **Monitor alerts** – Price alerts with visual drawing tools
3. **Analyze fundamentals** – Score symbols based on financial metrics
4. **Track trades** – Manual journal + automated signal generation

---

## 2. UI Map (15 Tabs)

### Status Definitions

| Status | Meaning |
|--------|----------|
| ✅ **PASS** | Renders and works in mock/offline mode without extra config |
| ⚠️ **WARN** | Requires API keys/backend/data/config, but UI renders and shows clear empty states |
| ❌ **FAIL** | Crashes or missing fundamental functionality |

| # | Tab | Component | Status | Notes |
|---|-----|-----------|--------|-------|
| 1 | Dashboard | `DashboardTab` | ✅ PASS | Market overview |
| 2 | Charts | `ChartsProTab` | ✅ PASS | TradingView-style charts + **AlertsPanel** |
| 3 | Breadth | `BreadthTab` | ✅ PASS | Market breadth analysis |
| 4 | Fundamentals | `FundamentalsTab` | ⚠️ WARN | Needs EODHD key for live data |
| 5 | Screener | `ScreenerTab` | ⚠️ WARN | Requires data |
| 6 | Optimize | `OptimizeTab` | ⚠️ WARN | Needs strategy config |
| 7 | Trade | `TradeTab` | ⚠️ WARN | Needs positions |
| 8 | Live | `LiveTab` | ⚠️ WARN | Needs scheduler |
| 9 | Assistant | `AssistantTab` | ⚠️ WARN | Needs Ollama |
| 10 | Settings | `SettingsTab` | ✅ PASS | Configuration |
| 11 | Library | `LibraryTab` | ✅ PASS | Reference docs |
| 12 | Manage | `ManageTab` | ⚠️ WARN | Admin functions |
| 13 | Journal | `JournalTab` | ✅ PASS | Trade journal |
| 14 | Features | `FeaturesTab` | ✅ PASS | Feature flags |
| 15 | Symbols | `SymbolsTab` | ⚠️ WARN | Symbol management |

> **Note:** The Alerts tab was **removed** in Day 8. Alerts functionality is now integrated into ChartsPro via `AlertsPanel` component.

> See **Status Definitions** above for criteria.  
> See [APP_WALKTHROUGH_REPORT.md](./APP_WALKTHROUGH_REPORT.md) for details, dependencies, and "How to Make PASS" steps.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Vite)                          │
│  quantlab-ui/src/App.tsx → 16 tabs (Dashboard, Charts, etc.)    │
│  └── features/ (chartsPro, fundamentals, alerts, assistant)     │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI)                           │
│  app/main.py + app/routers/ (system, fundamentals, alerts)      │
│  └── Services: scheduler, alerts_service, fundamentals_service  │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌────────────┐      ┌────────────┐      ┌────────────┐
   │  EODHD API │      │  SQLite    │      │  Parquet   │
   │  (live)    │      │  (alerts)  │      │  (cache)   │
   └────────────┘      └────────────┘      └────────────┘
```

---

### Key Directories

| Path | Purpose |
|------|---------|
| `app/` | FastAPI backend (main.py, routers/, services) |
| `quantlab-ui/` | React frontend (Vite + TypeScript) |
| `quantlab-ui/src/features/` | Feature modules (chartsPro, alerts, etc.) |
| `engine/` | Backtest engine (features, metrics, walkforward) |
| `scripts/` | CLI tools and monitoring scripts |
| `config/` | YAML configs (settings, tickers, watchlists) |
| `docs/` | Documentation (this file, ADRs, verification) |

---

## 4. Run Locally

### Backend
```powershell
cd quantlab
$env:EODHD_API_KEY = "your-key"
$env:PYTHONPATH = "$PWD\src"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend
```powershell
cd quantlab/quantlab-ui
npm install
npm run dev      # Development (port 5173)
npm run build    # Production build
npm run preview  # Serve production (port 4173)
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EODHD_API_KEY` | Yes | EODHD data API key |
| `PYTHONPATH` | Yes | Include `./src` |
| `OLLAMA_HOST` | No | Local LLM endpoint (default: `http://127.0.0.1:11434`) |
| `LLM_MODEL` | No | Model name (default: `llama3.1:8b`) |
| `SLACK_WEBHOOK_URL` | No | Slack incoming webhook for notifications |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token for notifications |
| `TELEGRAM_CHAT_ID` | No | Telegram chat ID for notifications |

> **Windows users:** See [WINDOWS_DEV.md](./dev/WINDOWS_DEV.md) for platform-specific guidance.

---

## 4.1 Notifications Architecture

The notification system lives in `src/quantkit/alerts/` and provides unified outbound messaging.

### Module Structure

```
src/quantkit/alerts/
├── __init__.py      # Public API exports
├── notify.py        # Unified router with severity + dedupe
├── slack.py         # Slack webhook sender
├── telegram.py      # Telegram Bot API sender
└── service.py       # Legacy alert runner (uses notify)
```

### Usage

```python
from quantkit.alerts import notify, notify_signal, NotificationLevel

# Simple notification (routes to Slack only for INFO)
notify("Server started", NotificationLevel.INFO)

# Error notification (routes to both Slack + Telegram)
notify("Database connection failed", NotificationLevel.ERROR)

# Trading signal with auto-deduplication
notify_signal("AAPL", "EMA_CROSS", "BUY", bar_time="2024-01-01T10:00", price=150.25)
# Message: "🟢 BUY AAPL @ 150.25 (EMA_CROSS) [2024-01-01T10:00]"
```

### Routing Rules

| Level | Default Channels | Use Case |
|-------|------------------|----------|
| INFO | slack | General info, startup |
| WARN | slack | Warnings, degraded state |
| ERROR | slack, telegram | Critical errors |
| SIGNAL | slack, telegram | BUY/SELL trading signals |

### Deduplication

- **In-memory cache** with 1-hour TTL
- **Signal key format:** `{SYMBOL}:{STRATEGY}:{SIGNAL}:{BAR_TIME}`
- Same key within TTL → notification blocked (returns `False`)
- Use `skip_dedupe=True` to bypass

### CI-Safety

- Missing env vars → returns `False`, no crash
- Request errors → caught, logged, returns `False`
- All functions return `bool` for success/failure

---

## 5. Quality Gates (CI)

### Workflows

| Workflow | File | Purpose | Trigger |
|----------|------|---------|---------|
| CI | `ci.yml` | Lint, type check, tests | push, PR |
| Day 5 Core Flows | `day5-coreflows.yml` | Contract + build + E2E | push, PR |
| Docs Gate | `docs-gate.yml` | Ensure docs stay current | push, PR |
| Day 2 Monitoring | `day2-monitoring.yml` | Post-release validation | manual/schedule |
| Day 3 Quality Gate | `day3-monitoring.yml` | Ongoing health checks | manual/after Day 2 |

### Gate Structure (Day 5)

```
Day 5 Core Flows Gate
├── backend-contract    # pytest tests/test_api_contract.py
├── frontend-build      # npm run build + tsc --noEmit
└── ui-core-flows       # playwright tests/core.flows.spec.ts
    ├── ChartsPro happy path
    ├── Fundamentals empty state
    └── Alerts create stub
```

### Running Locally

```powershell
# Backend contract tests
pytest tests/test_api_contract.py -v

# Frontend build check
cd quantlab-ui && npm run build

# UI core flow tests
cd quantlab-ui && npx playwright test tests/core.flows.spec.ts

# Day 2 check
python scripts/monitoring/day2_check.py

# Day 3 check (with UI smoke)
$env:RUN_UI_SMOKE = "1"
python scripts/monitoring/day3_check.py
```

> See [MONITORING.md](./ops/MONITORING.md) for detailed runbooks.

---

## 6. Deep Dives

### ChartsPro QA Contract

The charting module exposes `window.__lwcharts` for deterministic testing:

```typescript
// Core API (always available)
window.__lwcharts.set({ symbol: 'AAPL.US', timeframe: '1d' });
window.__lwcharts.dump();  // Returns full chart state

// QA primitives (with ?mock=1)
window.__lwcharts._qaApplyHover({ where: 'mid' });
window.__lwcharts._qaForceDataMode('demo');
window.__lwcharts._qaLegendHover('base');
```

Full documentation: [QA_CHARTSPRO.md](./chartspro/QA_CHARTSPRO.md)

### Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Basic health check |
| `/api/health` | GET | API health with timestamp |
| `/chart/ohlcv` | GET | OHLCV candles |
| `/api/fundamentals/{symbol}` | GET | Fundamentals scorecard |
| `/api/alerts` | GET/POST | Alert CRUD |
| `/optimize` | POST | Start optimization |

### Testing

```powershell
# Backend tests
pytest tests/ -v

# Frontend E2E tests
cd quantlab-ui
npx playwright test

# Single spec
npx playwright test tests/chartsPro.cp2.spec.ts --project=chromium
```

---

## 7. Contributing

### Definition of Done

A feature is "done" when:

- [ ] Code compiles without errors
- [ ] Tests pass (pytest + Playwright where applicable)
- [ ] `docs/LLM.md` updated if architecture changed
- [ ] `docs/LLM_TASKS.md` updated with task status
- [ ] `docs/FILE_INDEX.md` updated if files added/moved
- [ ] PR reviewed and approved

### Commit Convention

```
type(scope): description

Types: feat, fix, docs, style, refactor, test, chore
Scope: backend, frontend, engine, ci, docs
```

### PR Checklist

Use the PR template at `.github/pull_request_template.md`

---

## 8. Regression Fixes

### Fixed: Day 15 – ChartsPro Workspace Centered/Constrained (Dec 2024)

**Symptom:** After responsive CSS token updates, ChartsPro workspace displayed with large dead side margins and appeared "locked" to narrow centered container instead of filling available viewport width.

**Root Cause:** [App.tsx](../quantlab-ui/src/App.tsx) line 499 had global `max-w-7xl mx-auto` wrapper applied to ALL TabsContent:
```tsx
// BEFORE (line 499) - WRONG
<div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden p-4">
```

This constrained every tab—including Charts which should fill viewport—to 80-char width, centered on screen.

**Solution:** Per-tab max-width strategy:
1. Removed global `max-w-7xl mx-auto p-4` from wrapper → `flex min-h-0 w-full flex-1 flex-col overflow-hidden`
2. Applied `className="mx-auto w-full max-w-7xl space-y-4 p-4"` individually to bounded tabs (Dashboard, Fundamentals, Assistant, Library, Optimize, Report, Signals, Live, Breadth, Movers, Hotlists, Post, Journal, Pipeline)
3. Charts tab: `className="flex min-h-0 flex-1 flex-col overflow-hidden"` (full-width, no max-width)

**Result:**
- ✅ ChartsPro now fills available viewport width in workspace mode
- ✅ Other tabs remain bounded for readability (max-w-7xl centered)
- ✅ 50 backend tests pass
- ✅ Responsive breakpoints test passes (desktop, tablet landscape, tablet portrait)
- ✅ npm run build succeeds with no TypeScript errors

**Files Changed:** [App.tsx](../quantlab-ui/src/App.tsx) (line 499 wrapper + 14 TabsContent elements)

---

## Related Documents

| Document | Path |
|----------|------|
| App Walkthrough | [APP_WALKTHROUGH_REPORT.md](./APP_WALKTHROUGH_REPORT.md) |
| File Index | [FILE_INDEX.md](./FILE_INDEX.md) |
| Task Tracking | [LLM_TASKS.md](./LLM_TASKS.md) |
| ChartsPro QA | [chartspro/QA_CHARTSPRO.md](./chartspro/QA_CHARTSPRO.md) |
| Windows Dev | [dev/WINDOWS_DEV.md](./dev/WINDOWS_DEV.md) |
| Monitoring | [ops/MONITORING.md](./ops/MONITORING.md) |
| Known Issues | [roadmap/KNOWN_ISSUES.md](./roadmap/KNOWN_ISSUES.md) |
| Day 2 Verification | [verification/DAY2.md](./verification/DAY2.md) |
| Day 3 Verification | [verification/DAY3.md](./verification/DAY3.md) |

