# QuantLab – File Index

> **Purpose:** Map every significant file/folder to its purpose  
> **Version:** See `git log -1 --format="%h %ci" -- docs/FILE_INDEX.md`  
> **Total Files:** ~300+

---

## Root Directory

| Path | Type | Purpose |
|------|------|---------|
| `pyproject.toml` | Config | Python project config (Poetry/PEP 517) |
| `requirements.txt` | Config | Python dependencies |
| `.gitignore` | Config | Git ignore rules |
| `streamlit_app.py` | Script | Legacy Streamlit dashboard |
| `watchlist.yaml` | Config | Symbol watchlist definitions |
| `run_hotlists.bat` | Script | Windows batch for hotlists |

---

## `app/` – FastAPI Backend

| Path | Purpose | Dependencies |
|------|---------|--------------|
| `app/__init__.py` | Package marker | - |
| `app/main.py` | **Main FastAPI app** (routes, lifecycle) | All routers, services |
| `app/config.py` | Settings management (Pydantic) | pydantic-settings |
| `app/db.py` | Database session management | sqlmodel, sqlite |
| `app/models.py` | SQLModel database models | sqlmodel |
| `app/scheduler.py` | APScheduler job management | apscheduler |
| `app/services.py` | Business logic services | quantkit |
| `app/alerts_service.py` | Alert evaluation logic | models, db |
| `app/assistant.py` | LLM assistant router | httpx, ollama |
| `app/fundamentals_service.py` | Fundamentals scoring | quantkit |
| `app/fundamentals_tasks.py` | Background tasks for fundamentals | pandas |

### `app/routers/` – API Route Modules

| Path | Purpose | Endpoints |
|------|---------|-----------|
| `routers/__init__.py` | Package marker | - |
| `routers/system.py` | System health, meta | /health, /api/health |
| `routers/fundamentals.py` | Fundamentals API | /api/fundamentals/* |
| `routers/alerts.py` | Alerts CRUD | /api/alerts/* |
| `routers/drawings.py` | **T-013: ChartsPro drawings CRUD** | /api/drawings/{symbol}/{tf} |

### `app/utils/` – Backend Utilities

| Path | Purpose |
|------|---------|
| `utils/lazy.py` | Lazy imports for heavy modules |

---

## `quantlab-ui/` – React Frontend

### Root Config

| Path | Purpose |
|------|---------|
| `package.json` | NPM dependencies & scripts |
| `tsconfig.json` | TypeScript config |
| `vite.config.ts` | Vite bundler config |
| `tailwind.config.js` | Tailwind CSS config |
| `playwright.config.ts` | Playwright test config |
| `eslint.config.js` | ESLint config |

### `src/` – Source Code

| Path | Purpose |
|------|---------|
| `src/main.tsx` | React entry point |
| `src/App.tsx` | **Main app component** (15 tabs – alerts removed Day 8) |
| `src/index.css` | Global styles |

### `src/components/` – Shared Components

| Path | Purpose |
|------|---------|
| `components/SearchableSelect.tsx` | Searchable dropdown |
| `components/ui/` | shadcn/ui components (button, input, textarea, etc.) |
| `components/ui/textarea.tsx` | **TV-20.4: Multiline text input for TextModal** |

### `src/features/` – Feature Modules

| Path | Purpose | Key Exports |
|------|---------|-------------|
| `features/chartsPro/` | Professional charting | ChartsProTab |
| `features/chartsPro/ChartsProTab.tsx` | Main charts component | - |
| `features/chartsPro/ChartsProTab.tsx` | **TV-18.1: Modal state (modalOpen, modalKind) managed here, passed to ChartViewport** | - |
| `features/chartsPro/ChartsProTab.tsx` | **TV-39: TVLayoutShell integrated as root CSS Grid container (header, leftToolbar, main, rightPanel, bottomBar slots)** | - |
| `features/chartsPro/components/` | Chart subcomponents | ChartViewport, TopBar, LeftToolbar, Toolbar, **RightPanel** |
| `features/chartsPro/components/TVLayoutShell/` | **TV-39: TradingView "Supercharts" layout shell (CSS Grid, TV_LAYOUT constants, dump().ui.layout contract)** | TVLayoutShell.tsx, useTVLayout, TV_LAYOUT |
| `features/chartsPro/components/TVLayoutShell/TVRightRail.tsx` | **TV-39: Slim vertical icon rail (40-44px) for panel toggles (Watchlist/Alerts/Objects)** | TVRightRail, RailButton |
| `features/chartspro/components/TopBar/` | **TV-1+: TopBar (symbol/timeframe/type), TV-10.2: Settings overlay, TV-12: Layout Manager** | TopBar.tsx, PrimaryControls.tsx, SettingsPanel.tsx, LayoutManager.tsx |
| `features/chartspro/components/TopBar/TVCompactHeader.tsx` | **TV-39: TradingView-style compact single-row header (48-52px), replaces multi-row TopBar (~170px)** | TVCompactHeader, SymbolChip, TimeframeDropdown, ChartTypeDropdown, SimpleDropdown, CompactButton |
| `features/chartsPro/components/TopBar/SettingsPanel.tsx` | **TV-10.2: Settings gear panel (appearance + scales, localStorage cp.settings.*)** | SettingsPanel, ChartSettings, DEFAULT_SETTINGS |
| `features/chartsPro/components/TopBar/LayoutManager.tsx` | **TV-12.1-12.4: Layout save/load/delete manager (overlay panel, localStorage cp.layouts.*, JSON schema)** | LayoutManager, SavedLayout, LayoutManagerState |
| `features/chartsPro/components/Modal/` | **TV-18.1+: Modal infrastructure (central portal for indicators, alerts, text edit, settings)** | ModalPortal, IndicatorsModal, TextModal, SettingsDialog |
| `features/chartsPro/components/Modal/ModalPortal.tsx` | **TV-18.1: Central modal component (portal, Esc + click-outside, focus trap, data-testid)** | ModalPortal |
| `features/chartsPro/components/Modal/IndicatorsModal.tsx` | **TV-18.2: Indicators picker modal (search + add, TradingView-style)** | IndicatorsModal |
| `features/chartsPro/components/Modal/TextModal.tsx` | **TV-20.3: Text annotation modal (edit content, Enter=save, data-testid)** | TextModal |
| `features/chartsPro/components/Modal/SettingsDialog.tsx` | **TV-23.1: Chart settings dialog (tabs: Appearance/Layout/Advanced, pending changes, localStorage)** | SettingsDialog |
| `features/chartsPro/state/settings.ts` | **TV-23.1: Settings Zustand store (ChartSettings, pendingSettings, localStorage cp.settings)** | useSettingsStore, DEFAULT_SETTINGS |
| `features/chartsPro/components/LeftToolbar/` | **Day 7+: Left toolbar (7 tools, keyboard shortcuts, persistence, TV-3.9: responsive mobile pill)** | LeftToolbar.tsx, MobilePill.tsx, ToolButton.tsx |
| `features/chartsPro/components/FloatingToolbar/` | **TV-30.1+30.2a: Floating quick-edit toolbar (appears when drawing selected, portal-based, stroke/fill opacity sliders)** | FloatingToolbar.tsx, index.ts |
| `features/chartsPro/components/BottomBar/` | **TV-9: Bottom bar (quick ranges, scale toggles, UTC clock, persistence)** | BottomBar.tsx, useBottomBarState |
| `features/chartsPro/components/RightPanel/TabsPanel.tsx` | **Day 8+: RightPanel tabs (Indicators/Objects/Alerts, persistence)** | TabsPanel |
| `features/chartsPro/components/RightPanel/IndicatorsTab.tsx` | **TV-18.2: Simplified to list view only (installed indicators management), overlay removed** | IndicatorsTab |
| `features/chartsPro/components/RightPanel/ObjectsTab.tsx` | **Day 8+: Wrapper for ObjectTree (TV-5 modularization)** | ObjectsTab |
| `features/chartsPro/components/RightPanel/AlertsTab.tsx` | **TV-8: TradingView-style Alerts tab (sticky header, list, create form, sorting, theme tokens)** | AlertsTab |
| `features/chartsPro/components/AlertMarkersLayer.tsx` | **TV-8.2: Alert markers in chart (dashed lines + bell icons at prices)** | AlertMarkersLayer |
| `features/chartsPro/components/ChartViewport.tsx` | dump().ui includes `alerts` (count), `indicators` (count, names[], addOpen), **`settings` (ChartSettings | null)**, **`modal` (TV-18.1: { open, kind })** | ChartViewport |
| `features/chartsPro/components/ChartViewport.tsx` | Main chart renderer (lightweight-charts) | ChartViewport |
| `features/chartsPro/utils/applyChartSettings.ts` | **TV-10.3: Adapter mapping `ChartSettings` → lwcharts options; snapshot exposure** | applyChartLevelSettings, applySeriesSettings, createAppliedSnapshot |
| `features/chartsPro/utils/rangePresets.ts` | **TV-37.1+37.2: Range preset utilities (calculateRangePreset, applyRangePreset, calculateBackfillNeeded, createDataBounds)** | RangePresetKey, calculateRangePreset, applyRangePreset, calculateBackfillNeeded |
| `features/chartsPro/components/DrawingLayer.tsx` | **TV-20.2/20.3/24: Drawing interactions (Rectangle, Text, Ray, ExtendedLine, Shift+H/L for hide/lock)** | DrawingLayer |
| `features/chartsPro/components/OverlayCanvas.tsx` | **TV-24.P0: Overlay canvas layer (ADR: no clearRect, render responsibility belongs to DrawingLayer)** | OverlayCanvasLayer |
| `features/chartsPro/components/AlertsPanel.tsx` | **Day 8: Alerts panel in ChartsPro sidebar** | AlertsPanel |
| `features/chartsPro/mocks/ohlcv.ts` | **TV-37.2D: Mock OHLCV data for tests (1m/5m/15m/1h/4h/D/1W configs, AAPL/META full coverage)** | getMockOhlcv, getMockOhlcvRaw, listMockKeys |
| `features/chartsPro/runtime/heikinAshi.ts` | **TV-21.1: Heikin Ashi OHLC transform (pure util, unit-testable)** | transformOhlcToHeikinAshi, transformToHeikinAshi |
| `features/chartsPro/runtime/renko.ts` | **TV-21.4+TV-22.0d1: Renko brick generation + shared validation (pure util, unit-testable)** | transformOhlcToRenko, renkoToLwCandlestick, calculateAtr, suggestBoxSize, **normalizeRenkoSettings**, **validateRenkoField**, **DEFAULT_RENKO_SETTINGS** |
| `features/chartsPro/runtime/renko.test.ts` | **TV-22.0d1: Unit tests for Renko validation (19 tests)** | - |
| `features/chartsPro/runtime/abcd.ts` | **TV-31: ABCD pattern utilities (solveD, solveKFromDraggedD, isOnABDirectionLine, computeABCDHandles)** | solveD, solveKFromDraggedD |
| `features/chartsPro/runtime/headAndShoulders.ts` | **TV-32: H&S pattern utilities (isPatternInverse, computeHeadAndShouldersHandles)** | isPatternInverse, computeHeadAndShouldersHandles |
| `features/chartsPro/runtime/elliottWave.ts` | **TV-33: Elliott Wave utilities (getImpulseDirection, computeElliottWaveHandles)** | getImpulseDirection, computeElliottWaveHandles |
| `features/chartsPro/components/Modal/RenkoSettingsModal.tsx` | **TV-22.0b+d2: Renko settings modal (string-draft, inline validation, Reset, Save disabled)** | RenkoSettingsModal |
| `features/chartsPro/components/TopBar/ChartTypeSelector.tsx` | **TV-10.1+TV-21+TV-22.0b: Chart type dropdown + gear button for renko settings** | ChartTypeSelector, onRenkoSettingsClick |
| `tests/chartsPro.cp18.spec.ts` | **TV-18.2: Indicators modal tests (4 cases: open, Esc, X, add indicator)** |
| `tests/chartsPro.cp20.spec.ts` | **TV-20: Drawing tools tests (96 cases: ToolGroups, Rectangle, Text, select/move/delete, hotkey guardrail, TV-20.14: Drawing Controls)** |
| `tests/chartsPro.cp21.spec.ts` | **TV-21+TV-22.0b/d2: Chart types + Renko settings modal tests (53 cases: Heikin Ashi, Bars, Hollow Candles, Renko unit+integration, modal UX hardening)** |
| `tests/chartsPro.cp23.spec.ts` | **TV-23.1+23.2: Settings dialog tests (16 cases: open/close, tabs, cancel/save/reset, controls, appearance application)** |
| `tests/chartsPro.cp24.spec.ts` | **TV-24: Ray + Extended Line drawing tools tests (10 cases: create, auto-select, multiple rays, delete, visibility, P0 regression)** |
| `tests/chartsPro.cp25.spec.ts` | **TV-25: Circle + Ellipse + Triangle shape tests (22 cases: create via hotkey, auto-select, dump() contract, delete, P0 visibility, structure verification)** |
| `tests/chartsPro.cp26.spec.ts` | **TV-26: Callout annotation tests (8 cases: create via K hotkey, QA API, dump() contract, delete, P0 visibility, anchor/box structure)** |
| `tests/chartsPro.cp27.spec.ts` | **TV-27: Note annotation tests (8 cases: create via M hotkey, QA API, dump() contract, cancel removes, delete, P0 visibility, structure verification, multiple notes)** |
| `tests/chartsPro.cp28.spec.ts` | **TV-28: Fibonacci Extension & Fan tests (16 cases: fibExtension 3-click, fibFan drag, levels/ratios, handlesPx, delete, hotkey integration)** |
| `tests/chartsPro.cp29.spec.ts` | **TV-29: Channel tools tests (8 cases: channel, flatTopChannel, flatBottomChannel, handlesPx, delete, visibility)** |
| `tests/chartsPro.cp30.spec.ts` | **TV-30.1+30.2a: Floating toolbar tests (29 cases: visibility, UI elements, lock/delete actions, dump contract, fill color shapes, stroke/fill opacity sliders, real mouse click regression)** |
| `tests/chartsPro.cp31.spec.ts` | **TV-31: ABCD pattern tests (13 cases: hotkey, 3-click creation, handlesPx, drag A/B/C/D, k changes, delete, lock, hide, z-order)** |
| `tests/chartsPro.cp32.spec.ts` | **TV-32: Head & Shoulders tests (14 cases: hotkey, 5-click creation, inverse detection, handlesPx, drag points, delete, lock, hide, z-order)** |
| `tests/chartsPro.cp33.spec.ts` | **TV-33: Elliott Wave tests (13 cases: hotkey, 6-click creation, direction detection, handlesPx, drag points, delete, lock, hide, z-order)** |
| `tests/chartsPro.cp34.spec.ts` | **TV-34: Scale interaction tests (23 cases, 3 skipped: chart zoom/pan, barSpacing, timeScale, priceScale, setScale QA API, wheel zoom)** |
| `tests/chartsPro.cp36.visualQA.spec.ts` | **TV-36: Visual QA tests (11 cases: screenshot compare, layout validation, drawing visibility, annotation placement, crosshair styling)** |
| `tests/chartsPro.cp013.spec.ts` | **T-013: Backend persistence tests (4 cases: hline, elliottWave, z-order, locked state reload)** |
| `tests/chartsPro.cp37.rangePresets.spec.ts` | **TV-37.1: Range preset tests (15 cases: selection, validity, UI state, rapid clicks, dump contract)** |
| `tests/chartsPro.cp37.scaleToggles.spec.ts` | **TV-37.2: Scale toggle tests (17 cases: auto, log/%, ADJ, dump contract, persistence, regression)** |
| `tests/chartsPro.cp37.density.spec.ts` | **TV-37.2D: Data density tests (16 cases: ohlcv diagnostics, range widths, backfill, anchoring, timeframe density validation)** |
| `tests/chartsPro.cp37.drift.spec.ts` | **TV-37: State drift tests (4 cases: autoScale/scaleMode survives chartType/symbol changes)** |
| `tests/chartsPro.cp37.timeframes.spec.ts` | **TV-37.4: Timeframe switcher tests (21 cases: ready/non-ready TFs, QA API set, keyboard nav, persistence, tooltips)** |
| `tests/chartsPro.tvUi.indicators.tab.spec.ts` | **TV-7/TV-18.2: Indicators tab tests (updated for modal, 12 cases)** |
| `tests/chartsPro.tvUi.bottomBar.spec.ts` | **TV-9: BottomBar tests (13 cases, functional + responsive + deterministic, repeat-each=10, 130 runs, zero flakes)** |
| `tests/chartsPro.tvUi.alerts.tab.spec.ts` | **TV-8: Alerts tab tests (12 cases, form/create/delete/sorting/determinism coverage)** |
| `tests/chartsPro.tvUi.alerts.markers.spec.ts` | **TV-8.2: Alert markers tests (12 cases, repeat-each=10, 120 runs, zero flakes)** |
| `features/chartsPro/components/OhlcStrip.tsx` | **Day 9: TradingView-style OHLC display** | OhlcStrip |
| `features/chartsPro/components/ContextMenu.tsx` | **Day 9+10: Right-click context menu (12 actions)** | ContextMenu, DEFAULT_CHART_ACTIONS |
| `features/chartsPro/components/LastPriceLine.tsx` | **Day 9+10: Last price line with countdown (integrated)** | LastPriceLine |
| `features/chartsPro/components/CrosshairOverlay.tsx` | **Day 10: Testable crosshair pills** | CrosshairOverlay |
| `features/chartsPro/components/Watermark.tsx` | **Day 10: Symbol watermark** | Watermark |
| `features/chartsPro/hooks/` | Custom hooks | useOhlcv, useIndicators |
| `features/chartsPro/state/` | State management | controls, drawings |
| `features/chartsPro/state/drawings.ts` | **T-013: Drawings state (Zustand, localStorage + backend sync, debounced autosave, hydration)** | useDrawings, hydrateFromBackend |
| `features/chartsPro/api/drawingsApi.ts` | **T-013: Backend API client (CRUD, serialization, payloadToDrawing, drawingToPayload)** | fetchDrawings, saveDrawings, deleteDrawing |
| `features/chartsPro/types.ts` | **TV-7+TV-20+TV-24: Type definitions, DrawingKind (hline, vline, trend, channel, pitchfork, rectangle, text, priceRange, dateRange, dateAndPriceRange, fibRetracement, ray, extendedLine), IndicatorInstance** | DrawingKind, Drawing, Pitchfork, Channel, TextDrawing, Ray, ExtendedLine, IndicatorInstance |
| `features/chartsPro/indicators/` | Technical indicators | SMA, EMA |
| `features/chartsPro/theme.ts` | Chart theming (TradingView-style colors Day 10) | - |
| `features/fundamentals/` | Fundamentals tab | FundamentalsTab |
| `features/fundamentals/FundamentalsTab.tsx` | Main component | - |
| `features/alerts/` | Alerts management (standalone – **deprecated Day 8**) | AlertsTab |
| `features/alerts/AlertsTab.tsx` | Legacy component (not used in App.tsx) | - |
| `features/assistant/` | LLM assistant | AssistantTab |
| `features/assistant/AssistantTab.tsx` | Main component | - |
| `features/library/` | Reference library | LibraryTab |
| `features/library/LibraryTab.tsx` | Main component | - |
| `features/library/libraryData.ts` | Static library data | STRATEGY_LIBRARY |

### `src/lib/` – External Libraries

| Path | Purpose |
|------|---------|
| `lib/lightweightCharts.ts` | lightweight-charts re-export |

### `tests/` – Playwright E2E Tests

| Path | Purpose |
|------|---------|
| `tests/helpers.ts` | Test utilities |
| `tests/app.tabs.smoke.spec.ts` | **Day 4: All 15 tabs smoke test** (updated Day 8) |
| `tests/core.flows.spec.ts` | **Day 5: Core flows (ChartsPro, Fundamentals, Alerts)** |
| `tests/chartsPro.alerts.flow.spec.ts` | **Day 8: AlertsPanel integration tests (7 tests)** |
| `tests/chartsPro.tvUi.topbar.spec.ts` | **Day 6: TopBar UI tests (responsive, controls)** |
| `tests/chartsPro.tvUi.topbar.actions.spec.ts` | **TV-12: TopBar action buttons + RightPanel state (12 tests; 1 skipped for UI bug)** |
| `tests/chartsPro.tvUi.symbolSearch.spec.ts` | **Day 6: SymbolSearch autocomplete + persistence (15 tests)** |
| `tests/chartsPro.tvUi.leftToolbar.spec.ts` | **Day 7: LeftToolbar baseline tests (3 tests)** |
| `tests/chartsPro.tvUi.leftToolbar.shortcuts.spec.ts` | **Day 7+: Keyboard shortcuts tests (6 tests, Esc/H/V/T/C/R/N)** |
| `tests/chartsPro.tvUi.leftToolbar.persistence.spec.ts` | **Day 7+: Tool persistence tests (5 tests, repeat-each=10)** |
| `tests/chartsPro.tvUi.leftToolbar.responsive.spec.ts` | **TV-3.10: Responsive LeftToolbar viewport tests (14 tests: desktop/tablet/mobile breakpoints)** |
| `tests/chartsPro.tvUi.layoutManager.spec.ts` | **TV-12.1-12.6: Layout Save/Load/Delete manager tests (5 tests: save/load/delete/persist, repeat-each=3 stable)** |
| `tests/tv13-6b-layout-audit.spec.ts` | **TV-13.6b: Dead-space audit + invariant test (3 tests: layout measurements, inspector row2 collapse, 0px gap invariant)** |
| `tests/chartsPro.tvUi.rightPanel.tabs.spec.ts` | **Day 8: RightPanel tabs tests (17 test cases, repeat-each=10, 170 runs)** |
| `tests/chartsPro.tvUi.settingsPanel.spec.ts` | **TV-10.2: Settings panel tests (9 cases, open/close/Esc/click-outside/persistence, repeat-each=10, 90 runs, zero flakes)** |
| `tests/chartsPro.tvUi.settings.apply.spec.ts` | **TV-10.3: Apply settings to rendering (8 tests, repeat-each=10, deterministic)** |
| `tests/chartsPro.tvParity.spec.ts` | **Day 9: TradingView parity tests (35 tests)** |
| `tests/chartsPro.objects.alerts.spec.ts` | **Day 10: Objects + Alerts contract tests (9 tests)** |
| `tests/chartsPro.cp2.spec.ts` | CP2 feature tests |
| `tests/chartsPro.cp7.spec.ts` | CP7 feature tests |
| `tests/chartsPro.*.spec.ts` | Various chart tests |

---

## `src/quantkit/` – Python Library

### Core Modules

| Path | Purpose |
|------|---------|
| `quantkit/__init__.py` | Package marker |
| `quantkit/env.py` | Environment variable helpers |
| `quantkit/paths.py` | Path utilities |

### `quantkit/data/` – Data Fetching

| Path | Purpose |
|------|---------|
| `data/eodhd_client.py` | EODHD API client |
| `data/alphavantage_client.py` | Alpha Vantage client |

### `quantkit/indicators/` – Technical Indicators

| Path | Purpose |
|------|---------|
| `indicators/__init__.py` | Package marker |
| `indicators/registry.py` | Indicator registry |

### `quantkit/strategies/` – Trading Strategies

| Path | Purpose |
|------|---------|
| `strategies/__init__.py` | Package marker |
| `strategies/registry.py` | Strategy registry |

### `quantkit/fundamentals/` – Fundamentals Analysis

| Path | Purpose |
|------|---------|
| `fundamentals/storage.py` | Metrics storage |
| `fundamentals/scoring.py` | Score calculation |

### `quantkit/alerts/` – Notifications (Day 7)

| Path | Purpose |
|------|---------|
| `alerts/__init__.py` | Public API exports |
| `alerts/notify.py` | **Unified router**: level, channels, dedupe |
| `alerts/slack.py` | Slack webhook sender (CI-safe) |
| `alerts/telegram.py` | Telegram Bot API sender (CI-safe) |
| `alerts/service.py` | Legacy alert runner |

### `quantkit/reporting/` – Report Generation

| Path | Purpose |
|------|---------|
| `reporting/ts_report.py` | Time series report builder |

### `quantkit/io/` – I/O Utilities

| Path | Purpose |
|------|---------|
| `io/parquet_optional.py` | Optional parquet loading |

### `quantkit/snapshots/` – Snapshot Generation

| Path | Purpose |
|------|---------|
| `snapshots/breadth_snapshot.py` | Breadth indicator snapshot |

---

## `engine/` – Backtest Engine

| Path | Purpose | Key Functions |
|------|---------|---------------|
| `engine/__init__.py` | Package marker | - |
| `engine/features.py` | Feature engineering | compute_features() |
| `engine/metrics.py` | Performance metrics | sharpe(), max_dd() |
| `engine/strategy.py` | Strategy base class | Strategy |
| `engine/walkforward.py` | Walk-forward optimization | WalkForward |
| `engine/optimize.py` | Optuna integration | run_optuna() |
| `engine/ingest.py` | Data ingestion | ingest_symbol() |
| `engine/resample.py` | OHLCV resampling | resample() |
| `engine/rules.py` | Trading rules | - |
| `engine/calendar.py` | Trading calendar | is_trading_day() |

---

## `scripts/` – CLI & Automation

### `scripts/monitoring/` – Day 2/3 Monitoring

| Path | Purpose |
|------|---------|
| `monitoring/day2_check.py` | Day 2 production checks |
| `monitoring/day3_check.py` | Day 3 quality gate |

### Other Scripts

| Path | Purpose |
|------|---------|
| `scripts/backtest_min.py` | Minimal backtest runner |
| `scripts/check_db.py` | Database health check |
| `scripts/init_duckdb.py` | Initialize DuckDB |
| `scripts/optimize_baseline.py` | Baseline optimization |
| `scripts/plot_symbol.py` | Symbol chart plotter |

---

## `config/` – Configuration Files

| Path | Purpose |
|------|---------|
| `config/settings.yml` | Main app settings |
| `config/watchlist.yml` | Watchlist definitions |
| `config/ticker_index_map.yml` | Ticker to index mapping |
| `config/tickers.txt` | Symbol list (daily) |
| `config/tickers_intraday_se.txt` | Swedish intraday tickers |
| `config/tickers_intraday_us.txt` | US intraday tickers |

---

## `docs/` – Documentation

### Root Documentation

| Path | Purpose |
|------|---------|
| `docs/LLM.md` | **Main LLM context doc (hub)** |
| `docs/LLM_TASKS.md` | Task backlog & history |
| `docs/FILE_INDEX.md` | This file |
| `docs/APP_WALKTHROUGH_REPORT.md` | UI page analysis (16 tabs) |

### `docs/chartspro/` – ChartsPro Deep Dives

| Path | Purpose |
|------|---------|
| `docs/chartspro/QA_CHARTSPRO.md` | `window.__lwcharts` contract, CP2-CP10, QA primitives |

### `docs/dev/` – Development Guides

| Path | Purpose |
|------|---------|
| `docs/dev/WINDOWS_DEV.md` | Windows-specific dev pitfalls, PYTHONPATH, uvicorn |

### `docs/ops/` – Operations & Monitoring

| Path | Purpose |
|------|---------|
| `docs/ops/MONITORING.md` | Day 2/3 monitoring, CI runbooks |

### `docs/roadmap/` – Planning & Issues

| Path | Purpose |
|------|---------|
| `docs/roadmap/KNOWN_ISSUES.md` | Known bugs, workarounds, roadmap |

### `docs/verification/` – Verification Reports

| Path | Purpose |
|------|---------|
| `docs/verification/BASELINE.md` | Initial baseline state |
| `docs/verification/DAY2.md` | Day 2 monitoring details |
| `docs/verification/DAY3.md` | Day 3 quality gate details |
| `docs/verification/DAY2_REPORT.json` | Day 2 JSON output |
| `docs/verification/DAY2_REPORT.md` | Day 2 markdown report |

### `docs/adr/` – Architecture Decision Records

| Path | Purpose |
|------|---------|
| `docs/adr/ADR-001-snapshot-first-and-canonical-schema.md` | Snapshot schema decision |

---

## `.github/` – GitHub Configuration

### Workflows

| Path | Purpose | Trigger |
|------|---------|---------|
| `.github/workflows/ci.yml` | Main CI pipeline | push, PR |
| `.github/workflows/day5-coreflows.yml` | **Day 5: Contract + Build + E2E** | push, PR |
| `.github/workflows/day2-monitoring.yml` | Day 2 checks | schedule, manual |
| `.github/workflows/day3-monitoring.yml` | Day 3 quality gate | after Day 2, manual |
| `.github/workflows/docs-gate.yml` | Docs update enforcement | PR |
| `.github/workflows/data_eod.yml` | EOD data sync | schedule |
| `.github/workflows/breadth_snapshot.yml` | Breadth snapshot | schedule |
| `.github/workflows/live.yml` | Live job runner | schedule |

### Templates & Config

| Path | Purpose |
|------|---------|
| `.github/pull_request_template.md` | PR checklist template |
| `.github/copilot-instructions.md` | AI assistant instructions |

---

## `quantlab-ui/tests/` – Playwright E2E Tests

| Path | Purpose |
|------|---------|
| `tests/helpers.ts` | Test utilities |
| `tests/day3.smoke.spec.ts` | Day 3 UI smoke tests |
| `tests/chartsPro.cp2.spec.ts` | CP2 feature tests |
| `tests/chartsPro.cp7.spec.ts` | CP7 feature tests |
| `tests/chartsPro.*.spec.ts` | Various chart tests |
| `tests/chartsPro.legendParity.spec.ts` | Legend UI parity tests |
| `tests/chartsPro.offlineOnline.spec.ts` | Offline/online mode tests |

---

## `quantlab-ui/docs/` – Frontend Docs (Legacy)

| Path | Purpose | Note |
|------|---------|------|
| `quantlab-ui/docs/QA_CHARTSPRO.md` | ChartsPro QA contract | Moved to `docs/chartspro/` |
| `quantlab-ui/docs/INSPECTOR.md` | Inspector panel docs | |
| `quantlab-ui/docs/SPRINT5_LEGEND.md` | Legend overlay docs | |

---

## `tests/` – Backend Tests (pytest)

| Path | Purpose |
|------|---------|
| `tests/test_api_contract.py` | **Day 5: API schema contract tests** |
| `tests/test_notifications.py` | **Day 7: Notification tests (27 tests)** |
| `tests/test_cli_basic.py` | CLI smoke tests |
| `tests/test_costs.py` | Cost calculation tests |
| `tests/test_features.py` | Feature engineering tests |
| `tests/test_*.py` | Other pytest test files |

---

## Data Directories (git-ignored)

| Path | Purpose |
|------|---------|
| `storage/` | Local data storage |
| `storage/eodhd_cache/` | EODHD parquet cache |
| `data/` | Working data files |
| `reports/` | Generated reports |
| `logs/` | Application logs |
| `.venv/` | Python virtual environment |

---

## Dependency Graph (High Level)

```
App.tsx (frontend)
    └── features/*Tab.tsx
        └── hooks/useOhlcv
            └── /chart/ohlcv (API)
                └── app/main.py
                    └── quantkit/data/eodhd_client.py
                        └── EODHD API (external)

Scheduler
    └── app/scheduler.py
        └── app/alerts_service.py
            └── app/models.py (Alert)
                └── DuckDB
```

---

## Notes

### Adding New Files
1. Create file in appropriate directory
2. Update this index
3. Update `docs/LLM.md` if architecture changes
4. Log in `docs/LLM_TASKS.md`

### Renaming/Moving Files
1. Update all imports
2. Update this index
3. Update `docs/LLM.md` references
4. Run tests to catch broken imports

---

## QA API: dump().objects Contract (TV-20)

Drawing objects exposed via `window.__lwcharts.dump().objects`:

| type | points | extra fields |
|------|--------|--------------|
| `hline` | `[{ price }]` | - |
| `vline` | `[{ timeMs }]` | - |
| `trend` | `[p1, p2]` | - |
| `rectangle` | `[p1, p2]` | `p1, p2` |
| `text` | `[{ timeMs, price }]` | `content, anchor` |
| `channel` | `[p1, p2, p3]` | `p1, p2, p3` |
| `pitchfork` | `[p1, p2, p3]` | `p1, p2, p3` |
| `priceRange` | `[p1, p2]` | `deltaPrice, deltaPercent` |
| `dateRange` | `[p1, p2]` | `deltaMs, deltaDays` |
| `dateAndPriceRange` | `[p1, p2]` | `deltaPrice, deltaPercent, deltaMs, deltaDays` |
| `fibRetracement` | `[p1, p2]` | `levels: [{ratio, price}, ...]` |
