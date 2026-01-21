# App Walkthrough Report

> **Version:** See `git log -1 --format="%h %ci" -- docs/APP_WALKTHROUGH_REPORT.md`  
> **Branch:** feat/chartspro-cp4-buildgreen  
> **API Status:** ✅ Running (http://127.0.0.1:8000)

---

## Status Definitions

| Status | Criteria |
|--------|----------|
| ✅ **PASS** | Renders and works in mock/offline mode without extra config |
| ⚠️ **WARN** | Requires API keys/backend/data/config, but UI renders and shows clear empty states |
| ❌ **FAIL** | Crashes or missing fundamental functionality |

---

## Summary

| Tab | Status | Notes |
|-----|--------|-------|
| Dashboard | ✅ PASS | Sample data, static metrics |
| Charts | ✅ PASS | Full charting with indicators + **AlertsPanel** |
| Fundamentals | ⚠️ WARN | Needs EODHD key for live data |
| Assistant | ⚠️ WARN | Requires Ollama/LLM backend |
| Library | ✅ PASS | Static reference data |
| Optimize | ⚠️ WARN | Requires strategy registry |
| Report | ⚠️ WARN | Requires run_id from optimize |
| Signals | ⚠️ WARN | Requires workdir from optimize |
| Live | ⚠️ WARN | Requires workdir + scheduler |
| Journal | ✅ PASS | Trade logging works |
| Breadth | ⚠️ WARN | Requires breadth snapshot data |
| Movers | ⚠️ WARN | Requires movers API data |
| Hotlists | ⚠️ WARN | Requires hotlist data |
| Post | ✅ PASS | Simple notification sender |
| Pipeline | ⚠️ WARN | Requires pipeline config |

> **Note (Day 8):** The standalone Alerts tab was **removed**. Alerts functionality is now integrated into ChartsPro via `AlertsPanel` component in the sidebar.

**Overall: 6 PASS / 9 WARN / 0 FAIL (15 tabs)**

---

## Quick Reference: WARN Tab Dependencies

| Tab | Dependencies | Expected Empty State |
|-----|--------------|---------------------|
| Fundamentals | `EODHD_API_KEY`, Backend | "No metrics loaded" |
| Assistant | Ollama or LLM API | Setup instructions shown |
| Optimize | Backend, Strategy registry | Form displays, no runs table |
| Report | Valid `run_id` | "Choose a run and click Load" |
| Signals | `workdir` from optimize | "No rows" |
| Live | `workdir`, Scheduler | Form displays, empty jobs table |
| Breadth | Breadth snapshot job | "No data loaded yet" |
| Movers | `EODHD_API_KEY`, Market hours | "No movers loaded" |
| Hotlists | Hotlist data files | "No items loaded" |
| Pipeline | Pipeline config | Simple trigger, no data display |

> **Note:** The Alerts tab is no longer in this table—alerts are now in ChartsPro sidebar.

---

## Detailed Page Analysis

### 1. Dashboard

**Status:** ✅ PASS

**Purpose:** Overview landing page showing key metrics and system health.

**Input/Output:**
- Input: API base URL (stored in localStorage)
- Output: Strategy count, effective cost (bps), live job count, sample equity chart

**UI Elements:**
- 3 stat cards: Strategies, Effective cost (bps), Live jobs
- Sample equity area chart
- Health badge in header (auto-refreshes every 5s)

**Empty States:** Shows "0" for empty metrics, sample equity is static placeholder.

**Known Risks:**
- Strategies list may be empty if no strategies registered
- Sample equity is hardcoded, not real data

**Fix/Enhancement Backlog:**
- [ ] Replace sample equity with real portfolio equity
- [ ] Add quick-action buttons for common tasks
- [ ] Add "Last updated" timestamp

---

### 2. Charts (ChartsProTab)

**Status:** ✅ PASS

**Purpose:** Professional candlestick charting with technical indicators, drawings, and multi-symbol comparison.

**Input/Output:**
- Input: Symbol, timeframe (D/1h/15m/5m), theme
- Output: OHLCV candlestick chart, volume, indicators, drawings

**UI Elements:**
- Symbol selector with search
- Timeframe dropdown
- Theme toggle (light/dark)
- Indicator panel (SMA/EMA configurable)
- Object tree for drawings
- Export buttons (PNG/CSV)
- Compare mode for multiple symbols

**Empty States:** "Loading..." spinner, then "No data" message if API fails.

**Known Risks:**
- Requires EODHD_API_KEY for live data
- Large date ranges may be slow
- Mock mode available for testing

**Fix/Enhancement Backlog:**
- [ ] Add more indicator types (RSI, MACD, BB)
- [ ] Persist drawings to backend
- [ ] Add annotation tools

---

### 3. Fundamentals (FundamentalsTab)

**Status:** ⚠️ WARN

**Purpose:** Display fundamental metrics, scorecard, and historical score tracking for symbols.

**Input/Output:**
- Input: Symbol(s), date range
- Output: Metrics table, scorecard with category breakdown, score history chart

**UI Elements:**
- Symbol input with add/remove pills
- Fetch button
- Metrics grid (P/E, ROE, etc.)
- Scorecard with category scores
- Score label (BUY/HOLD/SELL)
- Historical score chart

**Empty States:** "No metrics loaded" message, scorecard shows "N/A" for missing data.

**Dependencies:**
- [ ] `EODHD_API_KEY` environment variable set
- [ ] Backend running on port 8000

**Expected Empty State:** "No metrics loaded – enter a symbol and click Fetch"

**Known Risks:**
- Requires EODHD API for fundamentals data
- Some symbols may have incomplete metrics
- Score history requires background job to populate

**How to Make PASS:**
```powershell
# 1. Set API key
$env:EODHD_API_KEY = "your-key"

# 2. Start backend
python -m uvicorn app.main:app --port 8000 --reload

# 3. In UI: Enter symbol (e.g., "AAPL.US"), click "Fetch"
```

**Fix/Enhancement Backlog:**
- [ ] Add peer comparison feature
- [ ] Export scorecard as PDF
- [ ] Add metric tooltips explaining calculations

---

### 4. Assistant (AssistantTab)

**Status:** ⚠️ WARN

**Purpose:** AI-powered analysis assistant for daily wrap-ups and recommendations.

**Input/Output:**
- Input: Question text, context sources (report/signals/journal/fundamentals/chart), run_id, symbol
- Output: AI-generated analysis and recommendation

**UI Elements:**
- Question input field
- Quick action buttons ("Daily wrap-up", "Signals snapshot", "Fundamental check")
- Context checkboxes
- Health status badge
- Setup instructions for local/remote LLM

**Empty States:** Shows setup instructions if LLM not configured.

**Known Risks:**
- **Requires Ollama or remote LLM API** to function
- Slow response times with large context
- May timeout on complex queries

**How to Make PASS:**
```powershell
# Option 1: Local Ollama
ollama pull llama3.1:8b
ollama serve  # Starts on http://127.0.0.1:11434

# Option 2: Set environment variables for remote LLM
$env:LLM_API_URL = "https://api.openai.com/v1/chat/completions"
$env:LLM_API_KEY = "your-api-key"
```

**Fix/Enhancement Backlog:**
- [ ] Add streaming responses
- [ ] Cache common queries
- [ ] Add conversation history

---

### 5. Library (LibraryTab)

**Status:** ✅ PASS

**Purpose:** Reference documentation for strategies, indicators, and fundamental metrics.

**Input/Output:**
- Input: Section toggle (strategies/indicators), search query
- Output: Filtered list of library items with details

**UI Elements:**
- Section toggle buttons
- Search input
- Item cards with name, summary, tags, strengths, watch-outs
- Metric detail panel

**Empty States:** "Inga poster matchade sökningen" (Swedish)

**Known Risks:** None - static reference data.

**Language:** Swedish labels. Consider standardizing to English.

**Fix/Enhancement Backlog:**
- [ ] Standardize to English UI text
- [ ] Add "Copy code" buttons for strategy examples
- [ ] Link to backtest results for each strategy

---

### 6. Optimize

**Status:** ⚠️ WARN

**Purpose:** Run Optuna hyperparameter optimization for trading strategies.

**Input/Output:**
- Input: Strategy, symbol(s), date range, n_trials, cost parameters
- Output: Run ID, workdir path, optimization status

**UI Elements:**
- Strategy dropdown
- Symbol input (single or CSV)
- Date range pickers
- Cost parameters (commission, slippage)
- Run button
- Recent runs table with status

**Empty States:** Runs table shows "No runs yet" until first optimization.

**Known Risks:**
- **Requires registered strategies** in backend
- Long-running jobs may timeout
- Depends on OHLCV data availability

**How to Make PASS:**
```powershell
# 1. Ensure strategies are registered
# Check src/quantkit/strategies/registry.py has at least one strategy

# 2. Start backend with EODHD key
$env:EODHD_API_KEY = "your-key"
python -m uvicorn app.main:app --port 8000 --reload

# 3. Run a simple optimization from UI:
#    - Select a strategy (e.g., "SMA Crossover")
#    - Enter symbol: ABB.ST
#    - Set n_trials: 10
#    - Click "Run"
```

**Fix/Enhancement Backlog:**
- [ ] Add progress indicator for running jobs
- [ ] Add job cancellation
- [ ] Show optimization progress chart

---

### 7. Report

**Status:** ⚠️ WARN

**Purpose:** Display backtest report results from optimization runs.

**Input/Output:**
- Input: Run ID
- Output: Metrics, equity curve, drawdown, trades table

**UI Elements:**
- Run ID input
- Load button
- Metrics grid
- Performance summary table
- Equity curve chart
- Drawdown chart
- Rolling sharpe chart
- Trades table

**Empty States:** "Choose a run and click Load" message.

**Known Risks:**
- **Requires valid run_id** from completed optimization
- Large trade lists may be slow to render

**How to Make PASS:**
```powershell
# 1. First run an optimization (see Optimize tab)
# 2. Copy the run_id from the Optimize tab's "Recent runs" table
# 3. Paste into Report tab's "Run ID" field
# 4. Click "Load"

# Or use API directly:
curl http://127.0.0.1:8000/runs
# Find a run_id from the list
```

**Fix/Enhancement Backlog:**
- [ ] Add export to PDF/Excel
- [ ] Add trade-by-trade chart overlay
- [ ] Compare multiple runs

---

### 8. Signals

**Status:** ⚠️ WARN

**Purpose:** View and manage trading signals from strategy outputs.

**Input/Output:**
- Input: Workdir path, threshold, top N
- Output: Signal table with symbol, score, signal value

**UI Elements:**
- Workdir input
- Threshold/Top inputs
- Create latest button
- View top-N button
- Signals table

**Empty States:** "No rows" message with instructions.

**Known Risks:**
- **Requires workdir** from completed optimization
- Signal files may be missing

**How to Make PASS:**
```powershell
# 1. First run an optimization (see Optimize tab)
# 2. Copy the workdir path from the optimization result
#    Example: reports/ABB.ST_20250115_123456
# 3. Paste into Signals tab's "Workdir" field
# 4. Click "Create latest" to generate signals
# 5. Click "View top-N" to display results
```

**Fix/Enhancement Backlog:**
- [ ] Auto-detect workdir from recent runs
- [ ] Add signal history tracking
- [ ] Add alert creation from signals

---

### 9. Alerts (DEPRECATED – see ChartsPro)

> ⚠️ **Day 8 Breaking Change:** The standalone Alerts tab was removed from App.tsx.
> Alerts functionality is now integrated into ChartsPro via the `AlertsPanel` component.

**Former Status:** ✅ PASS (now N/A)

**Purpose:** Create and manage price alerts with visual drawing tools.

**Migration:**
- Alerts are now managed in the ChartsPro sidebar via `AlertsPanel.tsx`
- Features: Create from hline/trendline, enable/disable, delete
- Backend endpoints unchanged: `/alerts` CRUD still works
- Notifier integration: `trigger_alert()` calls `notify_signal()` with BUY/SELL

**New Location:** `quantlab-ui/src/features/chartsPro/components/AlertsPanel.tsx`

**Playwright Test:** `tests/chartsPro.alerts.flow.spec.ts` (7 tests)

---

### 10. Live

**Status:** ⚠️ WARN

**Purpose:** Schedule and manage live trading jobs.

**Input/Output:**
- Input: Strategy, schedule (cron), workdir, threshold, notification settings
- Output: Live job list with status

**UI Elements:**
- Schedule input (cron format)
- Threshold/Top inputs
- Notification toggles (Slack/Telegram)
- Preview next runs button
- Start job button
- Live jobs table

**Empty States:** Empty jobs table.

**Known Risks:**
- **Requires workdir** from optimization
- **Requires scheduler** to be running
- Cron parsing may be confusing

**How to Make PASS:**
```powershell
# 1. Ensure backend is running with scheduler enabled
$env:EODHD_API_KEY = "your-key"
python -m uvicorn app.main:app --port 8000 --reload

# 2. First run an optimization and get workdir path
# 3. In Live tab:
#    - Enter workdir path
#    - Set schedule: "0 9 * * 1-5" (9 AM weekdays)
#    - Click "Preview" to see next run times
#    - Click "Start job"

# Optional: Configure notifications
$env:SLACK_WEBHOOK_URL = "https://hooks.slack.com/..."
$env:TELEGRAM_BOT_TOKEN = "your-bot-token"
$env:TELEGRAM_CHAT_ID = "your-chat-id"
```

**Fix/Enhancement Backlog:**
- [ ] Add schedule builder UI
- [ ] Add job logs viewer
- [ ] Add dry-run mode

---

### 11. Journal (JournalView)

**Status:** ✅ PASS

**Purpose:** Manual trade logging and position tracking.

**Input/Output:**
- Input: Trade details (symbol, side, qty, price, time)
- Output: Trades list, open positions, summary stats

**UI Elements:**
- Summary cards (trades, win rate, PnL, open positions)
- Equity curve
- Trade entry form
- Open positions table
- Trades history table

**Empty States:** "No trades logged yet" / "No open positions"

**Known Risks:** Manual data entry may have errors.

**Fix/Enhancement Backlog:**
- [ ] Import from broker CSV
- [ ] Auto-close positions
- [ ] PnL attribution by strategy

---

### 12. Breadth

**Status:** ⚠️ WARN

**Purpose:** Display market breadth indicators snapshot.

**Input/Output:**
- Input: Fetch button
- Output: JSON breadth data

**UI Elements:**
- Fetch button
- JSON display (pre-formatted)

**Empty States:** "No data loaded yet"

**Known Risks:**
- **Requires breadth snapshot job** to populate data
- Raw JSON display is not user-friendly

**How to Make PASS:**
```powershell
# 1. Run the breadth snapshot script manually
python scripts/run_breadth_snapshot.py

# Or set up GitHub Action (breadth_snapshot.yml) to run on schedule

# 2. Verify data exists:
ls storage/breadth_snapshot*.json

# 3. Click "Fetch" in the Breadth tab
```

**Fix/Enhancement Backlog:**
- [ ] Add visual gauges for breadth metrics
- [ ] Add historical breadth chart
- [ ] Add market regime indicator

---

### 13. Movers

**Status:** ⚠️ WARN

**Purpose:** Show top gainers/losers in the market.

**Input/Output:**
- Input: Top N, period (1d, etc.)
- Output: Movers table

**UI Elements:**
- Top/Period inputs
- Fetch button
- Movers table (dynamic columns)

**Empty States:** "No movers loaded"

**Known Risks:**
- **Requires movers API** to return data
- May need market hours to show meaningful data

**How to Make PASS:**
```powershell
# 1. Ensure backend is running with EODHD key
$env:EODHD_API_KEY = "your-key"
python -m uvicorn app.main:app --port 8000 --reload

# 2. Verify API returns data:
curl "http://127.0.0.1:8000/api/movers?top=10&period=1d"

# 3. In UI: Set Top N to 10, Period to "1d", click "Fetch"

# Note: Market must be open for meaningful movers data
```

**Fix/Enhancement Backlog:**
- [ ] Add mini-charts for each mover
- [ ] Add sector breakdown
- [ ] Add watchlist integration

---

### 14. Hotlists

**Status:** ⚠️ WARN

**Purpose:** Display predefined watchlists (gainers, losers, volume, etc.).

**Input/Output:**
- Input: Hotlist name
- Output: Items table

**UI Elements:**
- Name input
- Fetch button
- Items table

**Empty States:** "No items loaded"

**Known Risks:**
- **Requires hotlist data** from backend
- Hotlist names must match backend config

**How to Make PASS:**
```powershell
# 1. Run the hotlists batch script
.\run_hotlists.bat

# Or manually:
$env:PYTHONPATH = "$PWD\src"
python scripts/run_hotlists.py

# 2. Available hotlist names (check config/watchlist.yml):
#    - gainers
#    - losers
#    - volume
#    - momentum

# 3. In UI: Enter hotlist name, click "Fetch"
```

**Fix/Enhancement Backlog:**
- [ ] Add hotlist dropdown selector
- [ ] Add real-time refresh
- [ ] Add to watchlist button

---

### 15. Post

**Status:** ✅ PASS

**Purpose:** Send notifications to configured channels (Slack/Telegram).

**Input/Output:**
- Input: Message text
- Output: Send confirmation

**UI Elements:**
- Message input
- Send button
- Help text

**Empty States:** N/A - always shows form.

**Known Risks:**
- Requires Slack/Telegram configuration
- No message history

**Fix/Enhancement Backlog:**
- [ ] Add channel selector
- [ ] Add message templates
- [ ] Add send history

---

### 16. Pipeline

**Status:** ⚠️ WARN

**Purpose:** Trigger daily multi-strategy pipeline.

**Input/Output:**
- Input: Run button
- Output: Pipeline trigger confirmation

**UI Elements:**
- Run daily button
- Description text

**Empty States:** N/A - simple trigger.

**Known Risks:**
- **Requires pipeline configuration**
- Long-running job with no progress feedback

**How to Make PASS:**
```powershell
# 1. Ensure pipeline is configured in config/settings.yml
# Example configuration:
# pipeline:
#   strategies: ["SMA Crossover", "RSI Mean Reversion"]
#   symbols: ["ABB.ST", "VOLV-B.ST"]
#   output_dir: "reports/pipeline"

# 2. Ensure backend is running
python -m uvicorn app.main:app --port 8000 --reload

# 3. Click "Run daily" in the Pipeline tab
# 4. Check backend logs for progress

# Alternative: Run via CLI
python scripts/run_pipeline.py
```

**Fix/Enhancement Backlog:**
- [ ] Add pipeline status tracking
- [ ] Add step-by-step progress
- [ ] Add pipeline configuration UI

---

## Language Consistency

**Current state:** Mixed Swedish/English

| Component | Language | Notes |
|-----------|----------|-------|
| App.tsx | English | Main UI labels |
| Library | Swedish | "Strategier", "Indikatorer", "Sök" |
| Fundamentals | English | Mostly |
| Toast messages | Mixed | Some Swedish |

**Recommendation:** Standardize to **English** for broader accessibility, or implement i18n.

---

## Recommendations

### High Priority
1. **Add empty state guidance** - Help users understand what data/config is needed
2. **Add loading states** - Show progress for long operations
3. **Fix language consistency** - Standardize to English

### Medium Priority
1. **Add error recovery** - Retry buttons, clear error messages
2. **Add data freshness indicators** - Show when data was last updated
3. **Improve mobile responsiveness** - Some tables overflow

### Low Priority
1. **Add keyboard shortcuts** - Common actions
2. **Add theming** - Beyond light/dark
3. **Add onboarding tour** - First-time user guidance
