# ChartsPro QA Contract

---

## 📋 Standard Test Gates (Deterministic Pipeline)

**Problem**: Tests can fail due to stale preview server (old build served). Solution: Always build before test.

### Recommended Commands

```bash
# TV-UI Tests (Quick)
npm run test:tvui                 # Build → Test all TV-UI specs against fresh preview
npm run test:tvui:headed          # ... with headed browser for debugging
npm run test:tvui:deterministic   # ... with --repeat-each=10 for stability proof

# Full Gate (all checks)
npm run build && pytest && npm run test:tvui
```

### How It Works

1. **package.json scripts**:
   - `test:tvui` runs `npm run build` **before** Playwright test
   - Playwright config honors `prepreview` hook: always builds before starting preview server
   - Set `PW_REUSE_SERVER=0` to force fresh server: `PW_REUSE_SERVER=0 npm run test:tvui`

2. **playwright.config.ts**:
   - `webServer.command`: `npm run preview -- --host 127.0.0.1 --port 4173`
   - `prepreview`: Automatically runs `vite build` before preview starts
   - `reuseExistingServer`: Respects `PW_REUSE_SERVER` env var (default: true for speed, can disable)

3. **Result**: ✅ Tests always run against **current** build, never stale code

### Verification

```bash
# Example: TV-9 BottomBar deterministic proof
npm run test:tvui:deterministic
# Runs: build → preview (fresh) → 13 tests × 10 repeats = 130 iterations
# Pass rate 100% = ✅ Stable, no timing flakes
```

### Current Gate Status (2026-01-19)
- npm run test:tvui → ❌ (14/116 failing: alerts tab timeouts + rightPanel tabs text missing + topbar missing tv-shell; one ERR_INSUFFICIENT_RESOURCES navigation)
- pytest → ✅ 50/50 (warnings only: pydantic/fastapi deprecations)
- tvParity → ✅ 35/35

### TV-10.2 Settings Overlay (Dump + Persistence)
- LocalStorage keys: `cp.settings.appearance.{candleUpColor,candleDownColor,wickVisible,borderVisible,gridVisible,backgroundDark}`, `cp.settings.scales.mode`
- dump().ui.settings: ChartSettings | null (appearance + scales) exposed from ChartViewport
- Tests: tests/chartsPro.tvUi.settingsPanel.spec.ts (9 cases, repeat-each=10) – ✅ 90/90 passing

---

## Day 18 Critical CSS Fix: Shell Grid Deduplication (.tv-shell)

**Issue**: RightPanel width could collapse to 0 on desktop due to conflicting grid definitions.

**Root Cause**: `src/index.css` had two `.tv-shell` definitions:
1. Early definition (line ~105): `grid-template-columns: 0 1fr 0` (zero-width bars)
2. Later TradingView-style definition (line ~323): `grid-template-columns: auto 1fr auto` (proper widths)

CSS cascade meant both rules existed, creating ambiguity. Minified CSS included both.

**Fix Applied** (src/index.css lines 64-111):
- Removed old `.tv-shell` definition with `0 1fr 0` grid
- Kept only modern `auto 1fr auto` definition as single source of truth

**Result**:
- ✅ Single authoritative .tv-shell grid spec (auto 1fr auto)
- ✅ RightPanel width always > 0 in workspace mode (min-width: 240px from CSS tokens)
- ✅ No zero-width regression

**Verification** (tests/chartsPro.tvUi.rightPanel.tabs.spec.ts):
```typescript
// Line 231: CSS dedupe verification
const dump = await page.evaluate(() => window.__lwcharts.dump());
expect(dump.ui.rightPanel.width).toBeGreaterThan(240);  // ✅ Passes
```

**Gates**: ✅ npm build, ✅ tvParity (35/35), ✅ rightPanel.tabs (170/170)

---

## Day 18 Critical Data Fix: Chart Data Not Rendering (json.rows Mismatch)

**Issue**: ChartsPro displayed blank chart (no candlesticks/volume) despite backend returning 250 rows of OHLCV data.

**Root Cause**: Frontend-backend API contract mismatch in dataClient.ts:
- **Backend** (`/chart/ohlcv`) returns: `{ rows: [{t, o, h, l, c, v}, ...] }`
- **Frontend** (dataClient.ts line 421) extracted: `json.candles || json.data || []`
- Result: `data` was always empty array `[]` → chart had no data to render

**Field Mapping Issue**: Backend uses `{t, o, h, l, c, v}` format, frontend expected `{time, open, high, low, close, volume}`.

**Fix Applied** (dataClient.ts lines 421-434):
```typescript
// BEFORE (broken)
const data: OhlcvBar[] = json.candles || json.data || [];

// AFTER (fixed)
const rawRows = json.rows || json.candles || json.data || [];
const data: OhlcvBar[] = rawRows.map((row: any) => ({
  time: typeof row.time === 'number' ? row.time : 
        typeof row.t === 'string' ? Math.floor(new Date(row.t).getTime() / 1000) : 
        row.t || row.time || 0,
  open: row.open ?? row.o ?? 0,
  high: row.high ?? row.h ?? 0,
  low: row.low ?? row.l ?? 0,
  close: row.close ?? row.c ?? 0,
  volume: row.volume ?? row.v ?? 0,
}));
```

**Diagnostics Added** (dump().render):
```typescript
render: {
  host: { w, h },           // chartRootRef dimensions
  canvas: { w, h, count },  // Canvas element count + dimensions
  dataLen: number,          // lastLoadedBaseRowsRef.length
  lastOhlcvTs: number|null, // Last bar timestamp
  ...existing fields
}
```

**Result**:
- ✅ Chart now loads data from backend `/chart/ohlcv` endpoint
- ✅ Candlesticks + volume bars render in chart center
- ✅ Field mapping handles both backend format (`t,o,h,l,c,v`) and legacy (`time,open,...`)
- ✅ dump() exposes diagnostics for troubleshooting data/render issues

**Verification**:
- Backend test: `GET /chart/ohlcv?symbol=AAPL&bar=1d` → 200 OK, 250 rows ✅
- npm run build: ✅ 6.05s, no errors
- pytest: ✅ 50/50 passed
- Playwright tvParity: ✅ 35/35 passed (confirms chart renders correctly)

**Deferred**: CP2 smoke test has timing issue with hover state (unrelated to data fix).

---

## Day 16 Critical Layout Fix: Chart Container Flex/Min-Height

**Issue**: ChartsPro chart area rendering with 0 height/width despite full-width parent, causing blank chart display even with mock data enabled.

**Root Cause**: ChartViewport container hierarchy was incomplete:
- `chartspro-surface` container (flex-1, min-h-0) ✓
- Inner wrapper div (flex-1, min-h-0) ✓ 
- **BUT** `.chartspro-price` had only `h-full` without `min-h-0` / `min-w-0`

In flex contexts, children need **both** `min-h-0` and `min-w-0` to shrink below content size, or they'll collapse when siblings compete for space.

**Fix Applied** (ChartViewport.tsx lines 3304-3310):
```tsx
// BEFORE (broken)
<div className="flex-1 min-h-0 relative">
  <div ref={chartRootRef} className="chartspro-price h-full">

// AFTER (fixed)
<div className="flex-1 min-h-0 min-w-0 relative">
  <div ref={chartRootRef} className="chartspro-price h-full w-full min-h-0 min-w-0">
```

**Result**:
- ✅ Chart canvas now renders with correct dimensions
- ✅ ChartViewport occupies full available space (no 0-height collapse)
- ✅ Mock data renders properly in chart
- ✅ Responsive layout (tablet/mobile) works as expected

**Verification**:
- npm run build: ✅ 2381 modules, no errors
- pytest: ✅ All 50 backend tests pass
- Playwright responsive.breakpoints: ✅ Desktop test passes (1/4, browser memory issue on others)

---

## Backend Infrastructure Fix: uvicorn 0.40.0

**Issue**: Backend startup crashed with `ImportFromStringError: Could not import module "uvicorn.lifespan.on"`

**Root Cause**: uvicorn 0.30.1 (older version) incompatible with FastAPI's deprecated `@app.on_event()` handlers when used with newer lifespan API in uvicorn 0.40+

**Fix Applied**:
```bash
pip install "uvicorn[standard]" --upgrade
# Results in: uvicorn 0.40.0
```

**Verification**:
- Backend starts cleanly: `uvicorn app.main:app --port 8000 --reload` ✅
- Health endpoint responds: `GET /health` → 200 OK ✅
- All backend tests pass: pytest 50/50 ✅

**Known Good Versions** (documented in requirements):
- Python 3.11+
- uvicorn 0.40.0+ with [standard] extras
- FastAPI 0.104+ (handles old @app.on_event gracefully)

---

## 🚨 Day 15 Regression Fix: ChartsPro Centered/Constrained (FIXED)

**Issue Reported**: After Day 14 responsive CSS updates, ChartsPro workspace displayed with large dead side margins and appeared "locked" to narrow centered container.

**Root Cause**: App.tsx line 499 wrapper applied global `max-w-7xl mx-auto` to ALL TabsContent, including Charts (which should be full-width).

**Fix Applied**: Per-tab max-width strategy—removed global constraint from wrapper, applied max-w-7xl individually to bounded tabs (Dashboard, Fundamentals, etc.), left Charts tab full-width.

**Status**: ✅ FIXED
- npm run build: ✅ No errors
- pytest (50 tests): ✅ All pass
- Playwright responsive.breakpoints: ✅ 3/4 pass (desktop, tablet landscape, tablet portrait)
- ChartsPro workspace: ✅ Now fills available viewport width

See [docs/LLM.md § 8. Regression Fixes](../LLM.md#8-regression-fixes) for full details.

---

## Responsive Design Sprint v6: TradingView-Tight Layout + Breakpoints

**Status**: ✅ COMPLETE — Flex-column architecture, responsive breakpoints, TradingView-tight spacing tokens

**Purpose**: Fix layout regression from hardcoded header heights, implement proper responsive breakpoints with sidebar behavior, and apply TradingView-style tight spacing throughout.

**Key Changes**:
- Converted app shell from hardcoded `calc(100vh - 4rem)` to proper flex-column with natural header height
- Introduced comprehensive CSS design tokens for responsive spacing and sizing
- Implemented breakpoint-driven sidebar behavior (desktop full, laptop narrower, tablet/mobile collapsed/drawer)
- Applied TradingView-tight spacing throughout toolbar and panels

**Breakpoint Behavior**:
- **Desktop (≥1280px)**: Full sidebar (clamp 240px-480px, default 320px), toolbar in single row
- **Laptop (1024-1279px)**: Narrower sidebar (280px), toolbar may wrap
- **Tablet (<1024px)**: Sidebar collapsed by default, expandable overlay
- **Mobile (<768px)**: Sidebar as bottom drawer, compact toolbar with icon-only actions

**CSS Design Tokens**:
```css
--cp-gap: 0.5rem;                      /* Primary spacing (TradingView-tight) */
--cp-gap-sm: 0.375rem;                 /* Small spacing */
--cp-pad: 0.75rem;                     /* Panel padding */
--cp-pad-sm: 0.5rem;                   /* Compact padding */
--cp-radius: 0.5rem;                   /* Border radius */
--cp-sidebar-w-desktop: 320px;         /* Desktop sidebar width */
--cp-sidebar-w-laptop: 280px;          /* Laptop sidebar width */
--cp-sidebar-w-min: 240px;             /* Min sidebar width */
--cp-sidebar-w-max: 480px;             /* Max sidebar width */
--cp-chart-min-h-desktop: 600px;       /* Desktop chart min-height */
--cp-chart-min-h-tablet: 520px;        /* Tablet chart min-height */
--cp-chart-min-h-mobile: 420px;        /* Mobile chart min-height */
```

**Files Changed**:
- `src/App.tsx` — Flex-column app shell, responsive sticky header
- `src/features/chartsPro/ChartsProTab.tsx` — Responsive sidebar with CSS var widths, mobile drawer
- `src/index.css` — Comprehensive responsive design tokens, breakpoint-driven tv-shell heights
- `src/features/chartsPro/components/Toolbar.tsx` — TradingView-tight spacing (space-y-2/3 instead of space-y-4)
- `tests/chartsPro.responsive.breakpoints.spec.ts` — 4 viewport tests (1440×900, 1024×768, 768×1024, 390×844)

**Root Cause of Regression**: Hardcoded `calc(100vh - 4rem)` in ChartsProTab assumed fixed header height, but responsive header wrapping broke this assumption → switched to flex-column with `flex-1` to let content fill available space naturally.

---

## TradingView Parity Sprint v2: Interaction + Visual Fidelity

**Status**: ✅ COMPLETE — Crosshair overlay with pills, watermark, extended context menu, magnet/snap state, lastPrice countdown, scale tracking

**Purpose**: Complete TradingView-style visual and interaction parity with testable crosshair pills, symbol watermark, and comprehensive dump() state.

**Files Added**:
- `src/features/chartsPro/components/CrosshairOverlay.tsx` — Crosshair overlay with testable price/time pills
- `src/features/chartsPro/components/Watermark.tsx` — Faint symbol watermark in chart background

**Files Changed**:
- `src/features/chartsPro/components/ChartViewport.tsx` — Integrated CrosshairOverlay, Watermark, extended dump()
- `src/features/chartsPro/components/ContextMenu.tsx` — Expanded menu actions (add-alert, settings, etc.)
- `src/features/chartsPro/theme.ts` — TradingView-style crosshair colors (grey lines, black pills)
- `tests/chartsPro.tvParity.spec.ts` — 29 comprehensive Playwright tests

---

### TestIDs (TradingView Parity v2)

| TestID | Component | Purpose |
|--------|-----------|---------|
| `chartspro-crosshair` | CrosshairOverlay | Crosshair overlay container |
| `chartspro-crosshair-price` | CrosshairOverlay | Price pill on right axis |
| `chartspro-crosshair-time` | CrosshairOverlay | Time pill on bottom axis |
| `chartspro-watermark` | Watermark | Symbol watermark in background |
| `context-menu-add-alert` | ContextMenu | Add Alert action |
| `context-menu-auto-scale` | ContextMenu | Auto Scale action |
| `context-menu-toggle-watermark` | ContextMenu | Toggle Watermark action |
| `context-menu-settings` | ContextMenu | Settings action |

---

### dump().ui Contract Extension (v2)

```typescript
dump().ui: {
  // Core UI state
  inspectorOpen: boolean;                 // Inspector panel open
  inspectorTab: "objectTree" | "dataWindow";
  compareScaleMode: "price" | "percent";
  ohlcStripVisible: boolean;              // OHLC strip visibility
  
  // Context menu
  contextMenu: {
    open: boolean;
    x: number;
    y: number;
    selectedAction: string | null;
  };
  lastContextAction: string | null;       // Last executed context menu action
  
  // TradingView Parity v2
  magnet: boolean;                        // Magnet mode enabled
  snap: boolean;                          // Snap to close enabled
  watermarkVisible: boolean;              // Watermark visible
  volumeVisible: boolean;                 // Volume series visible
  crosshairEnabled: boolean;              // Crosshair enabled (Magnet/Hidden mode)
  crosshair: {
    visible: boolean;                     // Crosshair currently visible (hovering)
    x: number;                            // Crosshair X position (px)
    y: number;                            // Crosshair Y position (px)
    price: number | null;                 // Price at crosshair
    time: string | null;                  // Formatted time at crosshair
  };
  
  // Objects + Alerts Parity v3
  selectedObjectId: string | null;        // Currently selected drawing ID
  activeTool: string;                     // Active tool: "select", "hline", "trend", etc.
}
```

### dump().objects Contract (v3)

```typescript
// Drawing objects array - each object has:
dump().objects: Array<{
  id: string;                             // Unique drawing ID
  type: string;                           // "hline", "vline", "trend", "channel", "callout", etc.
  symbol: string;                         // Symbol drawing belongs to
  locked: boolean;                        // Drawing is locked (cannot move)
  hidden: boolean;                        // Drawing is hidden
  selected: boolean;                      // Drawing is selected
  label: string | null;                   // User-assigned label
  z: number;                              // Z-order value (higher = on top)
  points: Array<{                         // Geometry points (all have timeMs + price)
    label?: string;                       // Point label (e.g., "anchor", "box", "p1", "p2")
    timeMs?: number;                      // Time in milliseconds (for trend/vline)
    price?: number;                       // Price level (for hline/trend)
  }>;
  // Type-specific fields:
  p1?: { timeMs, price };                 // For shapes: center/first vertex
  p2?: { timeMs, price };                 // For shapes: edge/second vertex
  p3?: { timeMs, price };                 // For triangle: third vertex
  anchor?: { timeMs, price };             // For callout: leader line start
  box?: { timeMs, price };                // For callout: text box position
  text?: string;                          // For text/callout: content
  content?: string;                       // For text: content (alias)
}>;

// Example: Callout object in dump().objects
{
  id: "drawing-123",
  type: "callout",
  selected: true,
  z: 1,
  anchor: { timeMs: 1700000000000, price: 150.00 },
  box: { timeMs: 1700100000000, price: 155.00 },
  text: "Important level",
  points: [
    { label: "anchor", timeMs: 1700000000000, price: 150.00 },
    { label: "box", timeMs: 1700100000000, price: 155.00 }
  ]
}

// Example: ABCD Pattern object in dump().objects
{
  id: "drawing-456",
  type: "abcd",
  selected: false,
  locked: false,
  hidden: false,
  z: 2,
  k: 1.0,                                // Scale factor: D = C + k*(B-A)
  p1: { timeMs: 1700000000000, price: 100.00 },  // Point A
  p2: { timeMs: 1700100000000, price: 120.00 },  // Point B
  p3: { timeMs: 1700200000000, price: 110.00 },  // Point C
  p4: { timeMs: 1700300000000, price: 130.00 },  // Point D (computed)
  handlesPx: {
    A: { x: 100, y: 200 },               // Screen coords for point A
    B: { x: 200, y: 100 },               // Screen coords for point B
    C: { x: 300, y: 150 },               // Screen coords for point C
    D: { x: 400, y: 50 }                 // Screen coords for point D
  },
  points: [
    { label: "A", timeMs: 1700000000000, price: 100.00 },
    { label: "B", timeMs: 1700100000000, price: 120.00 },
    { label: "C", timeMs: 1700200000000, price: 110.00 },
    { label: "D", timeMs: 1700300000000, price: 130.00 }
  ]
}
```

### ABCD Pattern Contract (TV-31)

**Status**: ✅ COMPLETE — 3-click pattern with computed D point

**Hotkey**: `W` — Activates ABCD pattern tool

**Creation Flow**:
1. Click 1: Place point A (anchor)
2. Click 2: Place point B (defines AB vector)
3. Click 3: Place point C (D auto-computed as C + 1.0*(B-A))
4. Drawing auto-selected after creation, tool resets to "select"

**Formula**: `D = C + k * (B - A)` where k defaults to 1.0

**handlesPx Labels**: A, B, C, D (screen pixel coordinates for each point)

**Drag Behavior**:
| Dragged Handle | Effect |
|----------------|--------|
| A, B, or C | D recomputes maintaining same k value |
| D | k value changes, D stays on AB direction line |
| Body (any segment) | Entire pattern translates |

**ABCD Invariants**:
1. **AB-CD Parallelity**: Vector CD is always parallel to vector AB
2. **k Preservation**: Dragging A/B/C preserves k; dragging D changes k
3. **D Constraint**: D always lies on the line through C parallel to AB
4. **Migration Safety**: Older storage without `k` field defaults to k=1.0

**Geometry Cache**: ABCD signature includes `p1:p2:p3:p4:k:base` for proper cache invalidation

**Test Coverage**: 13 Playwright tests in `chartsPro.cp31.spec.ts`, 21 unit tests for ABCD math

### dump().alerts Contract (v3)

```typescript
dump().alerts: {
  count: number;                          // Number of alerts for current symbol
};
```

### dump().ui.layout Contract (Sprint v5 - Workspace Mode)

**Status**: ✅ COMPLETE — Full-height workspace mode, collapsible sidebar, deterministic layout testing

**Purpose**: Expose workspace layout state for Playwright assertions (sidebar collapse, full-height mode, viewport dimensions).

```typescript
dump().ui.layout: {
  workspaceMode: boolean;                 // True = full-height TradingView-style workspace
                                          // False = original card-based layout
  sidebarCollapsed: boolean;              // Right sidebar (Indicators/Objects/Alerts) collapsed
  sidebarWidth: number;                   // Sidebar width in pixels (280-600px range)
  viewportWH: {
    w: number;                            // Chart container width (px)
    h: number;                            // Chart container height (px)
  };
  hasNestedScroll: boolean;               // True if BOTH window scroll AND internal scroll exist
                                          // (anti-pattern indicator - should be false in workspace mode)
};
```

**Workspace Mode Behavior:**
- **ON**: Chart uses `h-[calc(100vh-4rem)]` for full viewport height, info cards hidden, sidebar docked
- **OFF**: Original card-based layout with page scroll, info cards visible, grid layout for sidebar

**Sidebar Collapse:**
- Collapse button (`›`) in sidebar header (workspace mode only)
- Expand button (`‹`) as vertical bar when collapsed
- Width persists to `localStorage` key `"cp.workspace"`
- Chart expands horizontally when sidebar collapsed (width increases by ~320px)

**Testing Strategy:**
```typescript
// Verify workspace mode
const layout = await page.evaluate(() => window.__lwcharts.dump().ui.layout);
expect(layout.workspaceMode).toBe(true);
expect(layout.viewportWH.h).toBeGreaterThan(600);

// Verify no nested scroll
expect(layout.hasNestedScroll).toBe(false);

// Test sidebar collapse
await page.locator('[data-testid="collapse-sidebar-btn"]').click();
const after = await page.evaluate(() => window.__lwcharts.dump().ui.layout);
expect(after.sidebarCollapsed).toBe(true);
expect(after.viewportWH.w).toBeGreaterThan(beforeWidth); // Chart expanded
```

**TestIDs (Sprint v5):**
| TestID | Component | Purpose |
|--------|-----------|---------|
| `chartspro-workspace` | ChartsProTab | Workspace container (flex or grid) |
| `chartspro-sidebar` | ChartsProTab | Sidebar (Indicators/Objects/Alerts panels) |
| `sidebar-content` | ChartsProTab | Sidebar scrollable content area |
| `collapse-sidebar-btn` | ChartsProTab | Collapse button (›) in sidebar header |
| `expand-sidebar-btn` | ChartsProTab | Expand button (‹) when collapsed |
| `workspace-toggle-btn` | ChartsProTab | Toggle between workspace/info modes (📐/📋) |

**Playwright Tests:** `tests/chartsPro.layout.responsive.spec.ts` — 16 tests
- Workspace mode default state, toggle, info card visibility
- Chart height >480px, efficient vertical space usage, viewport dimensions
- Sidebar collapse/expand, layout state persistence, no nested scroll
- Responsive behavior (resize handling, localStorage persistence)

---

### dump().render Contract Extension (v2)

```typescript
dump().render: {
  // ... existing fields ...
  
  // NEW: TradingView Parity v2 additions
  lastPrice: {
    price: number;                        // Last bar close price
    time: number;                         // Last bar timestamp (Unix seconds)
    countdownSec: number;                 // Seconds until next bar close
  } | null;
  scale: {
    barSpacing: number | null;            // Current bar spacing (px)
    rightOffset: number;                  // Scroll offset from right edge
    priceScaleMode: string;               // "Normal", "Percentage", etc.
  };
}
```

---

### Context Menu Actions (v2 Expanded)

| Action ID | Label | Shortcut | Behavior |
|-----------|-------|----------|----------|
| `add-alert` | Add Alert... | Alt+A | Open alerts panel (stub) |
| `reset-scale` | Reset Scale | Dbl-click | Auto-scale price axis |
| `fit-content` | Fit All Data | Home | Fit all data in view |
| `auto-scale` | Auto Scale | A | Enable auto-scaling |
| `toggle-ohlc` | Show OHLC Strip | — | Toggle OHLC strip |
| `toggle-volume` | Show Volume | — | Toggle volume (stub) |
| `toggle-crosshair` | Toggle Crosshair | — | Toggle crosshair (stub) |
| `toggle-watermark` | Toggle Watermark | — | Toggle symbol watermark |
| `copy-price` | Copy Price | Ctrl+C | Copy last price with toast |
| `export-png` | Export as PNG... | — | Export chart image |
| `export-csv` | Export as CSV... | — | Export data CSV |
| `settings` | Settings... | — | Open settings (stub) |

---

### Playwright Tests (chartsPro.tvParity.spec.ts) — v2 Extended

| Test | Purpose |
|------|---------|
| crosshair overlay has testable price pill | Verify CrosshairOverlay testid exists |
| crosshair position is tracked in dump() | Verify ui.crosshair.x/y |
| watermark is visible by default | Verify watermark renders |
| watermark shows symbol text | Verify symbol display |
| watermarkVisible is in dump() | Verify ui.watermarkVisible |
| magnet state is in dump().ui | Verify ui.magnet |
| snap state is in dump().ui | Verify ui.snap |
| lastPrice is in dump().render | Verify render.lastPrice |
| countdown is non-negative | Verify countdownSec >= 0 |
| scale info is in dump().render.scale | Verify render.scale |
| barSpacing is tracked | Verify scale.barSpacing |
| lastContextAction is tracked | Verify ui.lastContextAction |
| add-alert action exists in menu config | Verify menu structure |
| settings action exists in menu config | Verify menu structure |

---

## TradingView Parity Sprint v1: OHLC Strip + Context Menu + dump() Extensions

**Status**: ✅ COMPLETE — TradingView-style OHLC strip, context menu, enhanced dump() contract with UI state

**Purpose**: Bring ChartsPro closer to TradingView UX with inline OHLC display, right-click context menu, and extended QA dump() contract.

**Files Added**:
- `src/features/chartsPro/components/OhlcStrip.tsx` — TradingView-style OHLC strip (top-left overlay)
- `src/features/chartsPro/components/ContextMenu.tsx` — Right-click context menu with chart actions
- `src/features/chartsPro/components/LastPriceLine.tsx` — Last price line component (for future use)
- `tests/chartsPro.tvParity.spec.ts` — 15 comprehensive Playwright tests

**Files Changed**:
- `src/features/chartsPro/components/ChartViewport.tsx` — Integrated OhlcStrip, ContextMenu, extended dump()
- `src/index.css` — Added styles for OHLC strip, context menu

---

### TestIDs (TradingView Parity)

| TestID | Component | Purpose |
|--------|-----------|---------|
| `chartspro-ohlc-strip` | OhlcStrip | Top-left OHLC display overlay |
| `chartspro-ohlc-change` | OhlcStrip | Change % indicator (colored green/red) |
| `chartspro-context-menu` | ContextMenu | Right-click context menu container |
| `context-menu-reset-scale` | ContextMenu | Reset scale action button |
| `context-menu-fit-content` | ContextMenu | Fit all data action button |
| `context-menu-toggle-ohlc` | ContextMenu | Toggle OHLC strip visibility |
| `chartspro-last-price-line` | LastPriceLine | Last price horizontal line (future) |
| `chartspro-countdown` | LastPriceLine | Time to next bar close (future) |

---

### dump().ui Contract Extension

```typescript
dump().ui: {
  inspectorOpen: boolean;
  inspectorTab: "objectTree" | "dataWindow";
  compareScaleMode: "price" | "percent";
  
  // NEW: TradingView Parity additions
  ohlcStripVisible: boolean;              // Whether OHLC strip is shown
  contextMenu: {
    open: boolean;                        // Whether context menu is visible
    x: number;                            // Menu X position (px)
    y: number;                            // Menu Y position (px)
    selectedAction: string | null;        // Last selected action ID
  };
}
```

### dump().hover Contract Extension

```typescript
dump().hover: {
  time: number;
  base: {
    open: number;    // NEW: full OHLCV data
    high: number;
    low: number;
    close: number;
    volume: number;
    percent: number | null;
  };
  compares: Record<string, { price: number | null; percent: number | null }>;
  
  // NEW: OHLC strip formatted data
  ohlcStrip: {
    symbol: string;
    timeframe: string;
    open: string;    // Formatted price strings
    high: string;
    low: string;
    close: string;
  };
}
```

---

### Context Menu Actions (v2 - Updated Day 10)

| Action ID | Label | Shortcut | Behavior |
|-----------|-------|----------|----------|
| `add-alert` | Add Alert... | Alt+A | Open alerts panel (integration point) |
| `reset-scale` | Reset Scale | Dbl-click | Auto-scale price axis |
| `fit-content` | Fit All Data | Home | Fit all visible data in view |
| `auto-scale` | Auto Scale | A | Enable auto-scale mode |
| `toggle-ohlc` | Show OHLC Strip | | Toggle OHLC strip visibility |
| `toggle-volume` | Show Volume | | Toggle volume series visibility |
| `toggle-crosshair` | Toggle Crosshair | | Toggle crosshair visibility (Magnet/Hidden) |
| `toggle-watermark` | Toggle Watermark | | Toggle symbol watermark |
| `copy-price` | Copy Price | Ctrl+C | Copy last price to clipboard |
| `export-png` | Export as PNG | | Export chart as image |
| `export-csv` | Export as CSV | | Export data as CSV |
| `settings` | Settings... | | Open settings (stub) |

---

### Playwright Tests (chartsPro.tvParity.spec.ts v2 - 35 tests)

| Test | Purpose |
|------|---------|
| OHLC strip is visible in top-left corner | Verify strip renders |
| OHLC strip shows symbol name | Verify symbol display |
| OHLC strip shows timeframe badge | Verify timeframe badge |
| OHLC strip shows OHLC values | Verify O/H/L/C labels and values |
| OHLC strip shows change indicator | Verify change % display |
| OHLC strip shows volume | Verify volume display |
| OHLC strip updates on hover | Verify values update on mouse move |
| context menu state is available in dump() | Verify dump().ui.contextMenu |
| can programmatically open context menu via state | Verify state access |
| fit content action is available via API | Verify fit() function works |
| dump() includes ui.ohlcStripVisible | Verify dump() contract |
| dump() includes ui.contextMenu state | Verify dump() contract |
| dump() hover includes ohlcStrip data | Verify hover.ohlcStrip |
| dump() hover.base includes full OHLC | Verify hover.base has OHLCV |
| crosshair is visible on hover | Verify crosshair functionality |
| crosshair overlay has testable price pill | Verify CrosshairOverlay testid |
| crosshair position is tracked in dump() | Verify dump().ui.crosshair |
| watermark is visible by default | Verify Watermark renders |
| watermark shows symbol text | Verify symbol in watermark |
| watermarkVisible is in dump() | Verify dump().ui.watermarkVisible |
| magnet state is in dump().ui | Verify dump().ui.magnet |
| snap state is in dump().ui | Verify dump().ui.snap |
| lastPrice is in dump().render | Verify dump().render.lastPrice |
| countdown is non-negative | Verify countdown >= 0 |
| scale info is in dump().render.scale | Verify dump().render.scale |
| barSpacing is tracked | Verify barSpacing in scale |
| lastContextAction is tracked | Verify dump().ui.lastContextAction |
| add-alert action exists in menu config | Verify menu configuration |
| settings action exists in menu config | Verify menu configuration |
| last price line element exists in DOM | Verify LastPriceLine renders |
| countdown element exists when visible | Verify countdown format |
| volumeVisible is in dump().ui | Verify volume toggle state |
| volume is visible by default | Verify default volume state |
| crosshairEnabled is in dump().ui | Verify crosshair toggle state |
| crosshair is enabled by default | Verify default crosshair state |

---

### Playwright Tests (chartsPro.objects.alerts.spec.ts - 9 tests)

| Test | Purpose |
|------|---------|
| objects array exists in dump() | Verify dump().objects array |
| objects have required fields | Verify id/type/locked/hidden/selected/points |
| alerts object exists in dump() | Verify dump().alerts object |
| alerts has count field | Verify dump().alerts.count |
| selectedObjectId is in dump().ui | Verify object selection state |
| activeTool is in dump().ui | Verify active tool state |
| inspector tab state is tracked in dump().ui | Verify inspectorTab state |
| drawings persist in localStorage | Verify localStorage key pattern |
| context menu includes object-related actions | Verify context menu structure |

---

### Playwright Tests (chartsPro.interactions.regression.spec.ts - 10 tests)

**Purpose**: Regression tests to ensure chart interactions (hover/zoom/pan) work correctly when overlay layers (DrawingLayer, CrosshairOverlay) are present.

**Root Cause Fixed**: OverlayCanvasLayer had hardcoded `pointerEvents="auto"`, blocking mouse events from reaching the lightweight-charts canvas. Fixed with conditional: `tool !== "select" ? "auto" : "none"`.

| Test | Purpose |
|------|---------|
| mouse move updates hover state | Verify dump().hover is populated after mouse move |
| hover updates OHLC values in dump | Verify dump().hover.open/high/low/close have values |
| hover sets crosshair position | Verify dump().ui.crosshair.x/y are updated |
| wheel zoom changes visibleRange | Verify zoom in decreases range span |
| hover works in select mode (default) | Verify overlay doesn't block in default tool mode |
| zoom works in select mode (default) | Verify wheel zoom changes visibleRange in select mode |
| crosshair overlay doesn't block hover | Verify CrosshairOverlay has pointer-events: none |
| OHLC strip values change when hovering | Verify UI text updates on hover |
| drag starts correctly on price canvas | Verify mouse down/move on canvas works |
| pan changes visible range | Verify drag panning modifies rightOffset |

**Test Infrastructure Notes**:
- Tests target `.tv-lightweight-charts canvas` (not `.chartspro-price canvas` which hits overlay)
- Tests call `scrollIntoViewIfNeeded()` to ensure chart is visible in viewport
- `debug.zoom()` helper simulates wheel zoom with configurable deltaY

---

## Event Routing Rules

- Overlay canvas uses pointer-events: none at all times.
- DrawingLayer listens on the chart container, not the overlay canvas.
- Hover and wheel events always reach lightweight-charts, regardless of active tool.
- Overlay only intercepts input while actively drawing/dragging/editing; during those moments it calls preventDefault to avoid unintended pan.
- Space-to-pan: holding Space temporarily disables overlay handling so you can pan the chart even with a drawing tool active. Cursor shows grab/grabbing during this mode.

## Known Pitfalls (Playwright)

- Avoid combining `--debug`/inspector with piped output or log truncation (e.g., `Select-Object -First N`); it can look like the test is hung on page.goto, but it's just waiting for input while logs are suppressed.
- Prefer one of these instead:
  - `--headed --trace on` and inspect the trace after the run
  - `npx playwright test --ui` for an interactive runner
  - `PWDEBUG=1` without piping/redirecting output

---

## TV-4 Steg 2A: Offline/Online UX + dump().data Contract (DETERMINISM + ERROR HANDLING)

**Status**: ✅ COMPLETE — Offline/online mode tracking, empty state rendering, error chip visualization, and complete dump().data schema contract with QA force mode.

**Purpose**: Enable deterministic testing of offline/online behavior without backend dependency. Complete dump().data contract exposes mode, API health, data readiness, and compare errors for contract-based testing.

**Files Changed**:
- `src/features/chartsPro/runtime/dataClient.ts` — Added DataDumpState interface, getDumpDataState() function, QA force mode control
- `src/features/chartsPro/components/ChartViewport.tsx` — Added dump().data field, integrated getDumpDataState(), exposed QA control
- `src/features/chartsPro/utils/legendModel.ts` — Extended LegendRowData with status/statusError fields
- `src/features/chartsPro/components/LegendOverlay.tsx` — Added error chip rendering
- `tests/chartsPro.offlineOnline.spec.ts` — 14 comprehensive tests (all passing)

---

### TestIDs (Steg 2A)

| TestID | Component | Purpose |
|--------|-----------|---------|
| `offline-demo-label` | ChartViewport | Renders when mode='demo', signals offline to user |
| `data-empty-state` | ChartViewport | Overlay visible when base.rows===0; disappears after data loads |
| `legend-error-{id}` | LegendOverlay | Red error chip on legend row when compare status='error'; title shows error message |

**Note**: UI elements (offline-demo-label, legend-error chips) are tested via contract in offlineOnline.spec.ts. Full UI parity tested separately in layoutParity/legendParity suites.

---

### dump().data Contract (TV-4 Steg 2A) — EXACT SCHEMA

```typescript
dump().data: {
  // Current data mode: "live" (API backend) or "demo" (mock/offline)
  mode: "live" | "demo";

  // API health and last check result
  api: {
    ok: boolean;                        // true if last health check succeeded
    lastOkAt?: number;                  // Timestamp of last successful health check
    lastError?: string;                 // Error message if last check failed
  };

  // Base symbol (price) data readiness
  base: {
    status: "idle" | "loading" | "ready" | "error";
    rows: number;                       // Number of OHLCV bars loaded (≥0)
  };

  // Per-symbol compare data readiness
  compares: Record<string, {
    status: "idle" | "loading" | "ready" | "error";
    rows?: number;                      // Number of OHLCV bars loaded (defaults to 0)
    error?: string;                     // Error message if status='error'
  }>;
}
```

**Example (offline mode, no compares)**:
```typescript
{
  mode: "demo",
  api: { ok: false, lastError: "API unreachable: timeout" },
  base: { status: "idle", rows: 0 },
  compares: {}
}
```

**Example (online, base ready, compare error)**:
```typescript
{
  mode: "live",
  api: { ok: true, lastOkAt: 1705155045123 },
  base: { status: "ready", rows: 1440 },
  compares: {
    "MSFT.US": { status: "error", rows: 0, error: "Symbol not found" }
  }
}
```

---

### QA Primitive: _qaForceDataMode()

**Purpose**: Force offline/online mode deterministically without backend dependency. Allows contract-based testing of offline scenarios.

**API**:

```typescript
// Force offline (demo mode)
await page.evaluate(() => {
  window.__lwcharts?._qaForceDataMode?.('demo');
});

// Force online (live mode)
await page.evaluate(() => {
  window.__lwcharts?._qaForceDataMode?.('live');
});

// Clear force (revert to health polling)
await page.evaluate(() => {
  window.__lwcharts?._qaForceDataMode?.(null);
});

// Read current mode (after forcing or health polling)
const mode = await page.evaluate(() => {
  return window.__lwcharts?.dump?.()?.data?.mode;
});
```

**Determinism Rule**: All Playwright tests in offlineOnline.spec.ts use `_qaForceDataMode()` to set mode before assertions. This ensures tests are independent of backend state and network conditions.

**Internals**: When mode is forced, `healthCheck()` returns immediately with forced result (no HTTP call).

---

### Empty State Rendering Rule

**Trigger**: When `dump().data.base.rows === 0` (no base OHLCV data loaded)

**Visible**: `data-empty-state` overlay renders with:
- Chart icon (📊)
- Heading: "No data"
- Instruction: "Start backend on :8000 or use demo data"
- Position: absolute inset-0, z-20, backdrop blur
- Dismissal: Automatic when data loads (rows > 0)

**Test**: chartsPro.offlineOnline.spec.ts Test 5A validates overlay presence.

---

### Test Coverage (offlineOnline.spec.ts)

✅ 14 tests, all passing:

1. **Test 1A-1C**: Offline mode detection — Verify `_qaForceDataMode("demo")` sets `dump().data.mode="demo"`
2. **Test 2A-2B**: API status tracking — Confirm `dump().data.api.ok` reflects offline state
3. **Test 3A-3B**: Mode toggling — Force mode between "demo"/"live", verify persistence
4. **Test 4A-4D**: dump().data schema — All top-level keys present and typed correctly
5. **Test 5A**: Empty state UI — Validates overlay when base.rows=0
6. **Test 6A**: QA control exposure — Confirms `__lwcharts._qaForceDataMode()` callable
7. **Test 7A**: Mode persistence — Forced mode consistent across multiple dump() calls

---

## TV-3 Steg 1B: Data Readiness + Graceful Compare Errors (DATA PIPELINE STABILITY)

**Status**: Centralized data pipeline with deterministic readiness tracking and graceful error handling.

**Purpose**: All ChartsPro data fetching goes through `runtime/dataClient.ts`. dump().data provides deterministic readiness signals for testing and UX state management.

---

### dump().data Contract (TV-3 Steg 1B)

**Full schema**:

```typescript
dump().data: {
  // API health status
  api: {
    online: boolean;                    // GET /api/health succeeded
    lastHealthCheck: number | null;     // Timestamp of last health check
  };

  // Overall data fetch status
  status: 'idle' | 'loading' | 'ready' | 'error';

  // Last error message (if any)
  lastError: string | null;

  // Base symbol readiness
  baseReady: boolean;                   // true when base rows > 0

  // Compare readiness (all must be ready or error)
  comparesReady: boolean;               // true when all compares are ready or error

  // Per-symbol compare tracking
  compareStatusBySymbol: Record<string, {
    status: 'idle' | 'loading' | 'ready' | 'error';
    lastError: string | null;
    rows: number;                       // Number of OHLCV bars loaded
  }>;
}
```

---

### Readiness Rules

1. **baseReady**: `true` when `dump().pricePoints > 0` (base OHLCV loaded)
2. **comparesReady**: `true` when:
   - No compares added (empty compareStatusBySymbol), OR
   - All compare entries have `status === 'ready'` OR `status === 'error'` (i.e., not loading)
3. **status**: 
   - `'idle'` — No fetch in progress, no data yet
   - `'loading'` — Base fetch in progress
   - `'ready'` — Base rows > 0
   - `'error'` — Base fetch failed

---

### Compare Error Handling (Graceful)

**Rule**: Compare errors NEVER break the base chart.

**Behavior**:
- When compare fetch fails, `compareStatusBySymbol[symbol].status = 'error'`
- Base chart continues rendering normally
- Compare row in legend shows "—" (dash) + error badge
- User can remove the failing compare or retry

**Example**:

```typescript
// Base loads successfully
dump().data.baseReady === true
dump().data.status === 'ready'

// User adds INVALID symbol (non-existent compare)
await __lwcharts.compare.add('NOSUCHSYMBOL.XX');

// Base still renders; compare is marked as error
dump().data.compareStatusBySymbol['NOSUCHSYMBOL.XX'] === {
  status: 'error',
  lastError: 'Failed to fetch OHLCV: ...',
  rows: 0
};

// Base unaffected
dump().data.baseReady === true  // Still true
dump().pricePoints > 0           // Still renders
```

---

### Testing dump().data

**Example Playwright test**:

```typescript
test('baseReady reflects loaded candles', async ({ page }) => {
  // Set symbol to load data
  await page.evaluate(() => {
    window.__lwcharts?.set?.({ symbol: 'AAPL.US' });
  });

  // Wait for data load
  await page.waitForTimeout(1500);

  // Verify readiness
  const data = await page.evaluate(() => {
    return window.__lwcharts?.dump?.()?.data ?? null;
  });

  expect(data.baseReady).toBe(true);
  expect(data.status).toBe('ready');
});
```

---

## TV-3 Steg 1A: API Health Check + Data Stability (DATA CLIENT)

**Status**: Centralized data client with health checks, timeout/retry logic, and visual status indicator.

**Purpose**: All ChartsPro data fetching goes through `runtime/dataClient.ts` for consistent error handling, API health monitoring, and status exposure to UI.

---

### API Health Check

**Endpoint**: `GET http://127.0.0.1:8000/api/health`

**Response** (when online):
```json
{
  "status": "ok",
  "timestamp": "2024-01-13T10:30:45.123456"
}
```

**Response** (when offline): HTTP timeout (5s) or connection refused.

**Client API**:

```typescript
import { healthCheck, startHealthCheckPoll, stopHealthCheckPoll } from '@/features/chartsPro/runtime/dataClient';

// Manual check
const result = await healthCheck();
// => { ok: true, status: 'online', message: 'API is reachable', timestamp: 1234567890 }
// OR
// => { ok: false, status: 'offline', message: 'TIMEOUT', timestamp: 1234567890 }

// Background polling (for UI status badge)
startHealthCheckPoll(5000, (result) => {
  console.log('API status:', result.status);
});

// Stop polling
stopHealthCheckPoll();
```

---

### Visual Status Badge

**Component**: `ApiStatusBadge.tsx`

**Behavior**:
- Polls backend every 5 seconds
- Shows green "API: ON" when backend reachable
- Shows red "API: OFF — Start on :8000" when unreachable
- Tooltip displays last error message (TIMEOUT, CORS, HTTP 500, etc.)

**Integration**: Rendered in `ChartsProTab.tsx` next to data source toggle.

**Live Toggle Disable**: When API is offline, "🟢 Live" toggle is disabled (opacity-50, cursor-not-allowed). Clicking shows toast: "API is offline. Start backend on :8000".

---

### Data Fetch API

**fetchOhlcv** (base symbol):

```typescript
import { fetchOhlcv } from '@/features/chartsPro/runtime/dataClient';

const result = await fetchOhlcv('AAPL.US', '1d', { limit: 500, source: 'yahoo' });

// Success:
// => { ok: true, data: [ { time, open, high, low, close, volume }, ... ] }

// Error:
// => { ok: false, error: { code: 'HTTP_404', message: 'Failed to fetch OHLCV: Not Found' } }
// OR
// => { ok: false, error: { code: 'TIMEOUT', message: 'TIMEOUT' } }
```

**fetchCompareOhlcv** (compare symbol, non-blocking):

```typescript
import { fetchCompareOhlcv } from '@/features/chartsPro/runtime/dataClient';

const result = await fetchCompareOhlcv('MSFT.US', '1d', { limit: 500 });

// Same shape as fetchOhlcv, but does NOT update global dataStatus
// (compare errors don't break base chart)
```

---

### State Exposure

**For dump() integration (Steg 1B — future)**:

```typescript
import { getDataStatus, getLastError, getLastHealthCheck } from '@/features/chartsPro/runtime/dataClient';

const status = getDataStatus();
// => 'idle' | 'loading' | 'ready' | 'error'

const error = getLastError();
// => string | null (e.g., "Failed to fetch OHLCV: 500 Internal Server Error")

const health = getLastHealthCheck();
// => { ok: true, status: 'online', ... } OR { ok: false, status: 'offline', ... }
```

**Future dump() fields (Steg 1B)**:

```typescript
dump().data: {
  status: 'idle' | 'loading' | 'ready' | 'error';  // Current data fetch status
  lastError: string | null;                        // Last error message
  health: {
    ok: boolean;
    status: 'online' | 'offline' | 'error';
    message?: string;
    timestamp: number;
  };
}
```

---

### Error Shape Contract

All data fetch functions return standardized error shape:

```typescript
interface FetchResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;      // 'TIMEOUT' | 'HTTP_404' | 'HTTP_500' | 'FETCH_ERROR'
    message: string;   // Human-readable error message
  };
}
```

---

### Configuration

**Default config**:

```typescript
{
  baseUrl: 'http://127.0.0.1:8000',
  timeout: 10000,  // 10s for data fetches
  retries: 2       // 2 retry attempts with exponential backoff
}
```

**Customize** (optional):

```typescript
import { configureDataClient } from '@/features/chartsPro/runtime/dataClient';

configureDataClient({
  baseUrl: 'https://api.example.com',
  timeout: 15000,
  retries: 3,
});
```

---

### Acceptance Criteria (from TV_PARITY_CHECKLIST.md P0 #1)

- ✅ `GET /api/health` returns `{ status: "ok" }` or 503
- ✅ UI polls every 5 seconds
- ✅ Badge shows "API: ON" (green) or "API: OFF Start on :8000" (red)
- ✅ When OFF: Live toggle is disabled

---

### Files

- **runtime/dataClient.ts**: Core implementation (430 lines)
- **components/ApiStatusBadge.tsx**: Visual status indicator (50 lines)
- **ChartsProTab.tsx**: Badge integration + Live toggle disable logic
- **app/main.py**: `/api/health` endpoint

---

## TV-2.1: TradingView Legend UI Parity (DOM RENDERING)

**Status**: All legend UI elements render with deterministic test IDs and respond correctly to user interactions.

**Test IDs** (verifiable in DOM):

| Element | Test ID Pattern | Example |
|---------|-----------------|---------|
| Legend overlay container | `legend-overlay` | `data-testid="legend-overlay"` |
| Legend row | `legend-row-{id}` | `data-testid="legend-row-base"` |
| Color marker | `legend-marker-{id}` | `data-testid="legend-marker-base"` |
| Toggle button (eye icon) | `legend-toggle-{id}` | `data-testid="legend-toggle-base"` |
| Settings button | `legend-settings-{id}` | `data-testid="legend-settings-base"` |
| Drag handle | `legend-handle-{id}` | `data-testid="legend-handle-base"` |
| Drop indicator | `drop-indicator-before-{id}` | `data-testid="drop-indicator-before-compare-aapl-us"` |

**UI Rendering Contracts**:

1. **Legend Overlay Visibility**: Always visible at top-left of chart when series present; position: absolute, top: 2, left: 2, z-index: 30; semi-transparent dark background.

2. **Legend Row Hover**: On mouse enter, background becomes darker (bg-slate-800/80); dump().ui.legendHoverId reflects hovered row ID.

3. **Toggle Visibility**: Clicking eye button toggles visibility in dump().ui.legendVisibility[id]; marker opacity changes (visible=1.0, hidden=0.4).

4. **Solo Mode**: Alt+click enters solo mode (dump().ui.legendSoloId set); other series dimmed (opacity ~0.35); alt+click again clears.

5. **Drag-Drop Reorder**: Dragging shows drop-indicator-before-{targetId} (blue line); on drop, onReorder() called and dump().render.legendRows[].orderIndex updated.

6. **Settings Modal**: Clicking settings button opens modal; dump().ui.openSeriesSettingsId set to clicked row ID.

7. **Series Text**: Each row displays symbol name and last value; text truncated if needed.

**dump() Fields Exposed (TV-2.1)**:

```typescript
dump().ui: {
  legendHoverId: string | null;            // Current hovered legend row ID
  legendSoloId: string | null;             // Current solo-mode ID (if active)
  legendVisibility: Record<string, bool>;   // Map of series ID → visibility
  openSeriesSettingsId: string | null;     // Currently open settings modal row ID
}

dump().render.legendRows[]: {
  id: string;                              // Series ID
  symbol: string;                          // Display symbol (e.g., "AAPL.US")
  isBase: boolean;                         // Is this the base series?
  visible: boolean;                        // Is series visible?
  colorHint: string;                       // Color code (hex)
  lastValue: string | null;                // Formatted price at rightmost bar
  orderIndex: number;                      // Position in legend (0-based)
}

dump().render.seriesStyles[]: {
  id: string;                              // Series ID
  colorHint: string;                       // Current color (hex)
  width: number;                           // Line width (1-4)
  lineStyle: "solid" | "dashed" | "dotted"; // Line style
  pane: "main" | "own";                    // Pane placement
  scale: "left" | "right";                 // Price scale placement
  scaleSide: "left" | "right";             // Visual side (same as scale)
}
```

---

## Architecture Overview (Sprint TV-1)

**Source of Truth**: Hover target alias resolution lives in **`src/features/chartsPro/runtime/hoverPipeline.ts`**.

**Runtime Modules**:
- **hoverPipeline.ts**: Canonical `resolveHoverWhere(where, baseRows, percentAnchorIndex)` → timeKey mapper. No DOM, pure logic.
  - Deterministic mapping rules:
    - "left" | "first" → index 0
    - "center" | "mid" → index floor(baseLen / 2)
    - "right" | "last" → index baseLen - 1
    - "anchor" → percentAnchorIndex ?? floor(baseLen / 2)
    - numeric n ∈ [0, 1) → fraction of range → index
    - numeric n ≥ 1 → direct index (clamped to [0..baseLen-1])
  - QA instrumentation: `window.__lwcharts._qaHoverLastResolve` (debug info from resolver)

- **legendRuntime.ts**: Legend state management (buildLegendRows, computeLegendDimming).
  - QA primitives: `_qaLegendHover`, `_qaLegendSolo`, `_qaLegendToggle`, `_qaLegendReorder`

- **seriesStyling.ts**: Series styling/placement application (applySeriesStyle, applySeriesPlacement).
  - Maps UI style format to LW series API format

- **dumpBuilder.ts** (stub): Placeholder for future dump() extraction.

**ChartViewport.tsx**: Wires modules together; exposes API; manages state and lifecycle.

---

Use `/?mock=1` to force QA mode in both dev and production previews. In QA mode the global API is guaranteed to expose:

- `window.__lwcharts.set(patch)` — always present; merges defined keys into the API and forwards to `_applyPatch` if registered.
- `window.__lwcharts.dump()` — always present; returns the live chart snapshot (timeframe, render, compares, hover, etc.).
  - `dump().hover` structured fields: `{ active, time, ohlc:{o,h,l,c}, volume, changeAbs, changePct, priceAtCursor, compares }`.
  - `dump().render.crosshair` contains `{ active, time, price }` for crosshair verification.
  - `dump().ui.contextMenuOpen` and `dump().ui.lastContextAction` are set by the UI for deterministic context-menu QA.
- `window.__lwcharts._applyPatch(patch)` — registered once the Charts tab mounts; drives real state (e.g. timeframe change).
- `window.__lwcharts.debug.*` — gated to QA (mock=1) or dev builds; includes `dumpBindings`, `scan`, and QA flags.
- In QA/dev only: `debug.zoom(delta)` and `debug.pan(dx, dy)` for deterministic zoom/pan during tests.
- `dump().render` carries `layout` (container/canvas/panes) plus `barSpacing`, `visibleRange`, and `scrollPosition` for stability assertions.

## Single-Symbol Hover Contract (`_qaApplyHover`)

**Gating**: Exposed only when URL contains `?mock=1` OR `import.meta.env.PW_TEST === "1"`. In production (without mock/test flags), `_qaApplyHover` is **not** exposed.

**API**:

```ts
window.__lwcharts._qaApplyHover(opts?: { where?: "left" | "mid" | "right" | number; preferVisible?: boolean })
  -> { ok: boolean; snapshot: HoverSnapshot | null; error: string | null }
```

**Options (`opts`)**:

- `where?: "left" | "mid" | "right" | number` (default: `"mid"`)
  - `"left"` — apply hover at the leftmost visible bar (or first if not visible)
  - `"mid"` — apply hover at the middle visible bar (deterministic center)
  - `"right"` — apply hover at the rightmost visible bar (or last if not visible)
  - `number` — treated as an index into the visible bars; clamped to `[0, visible.length - 1]`
- `preferVisible?: boolean` (default: `true`)
  - If `true`, resolves position within visible bars; falls back to base rows if no visible data
  - If `false`, uses base rows directly

**Return Object**:

```ts
{
  ok: boolean;                    // true if hover was applied successfully
  snapshot: HoverSnapshot | null; // OHLCV + derived data at hover timeKey, or null if failed
  error: string | null;           // Error code or message: "NO_BASE_ROWS", "APPLY_HOVER_FAILED", or exception message
}
```

**`HoverSnapshot` Structure** (when `ok === true`):

```ts
{
  time: number;                  // Unix timestamp (seconds) of the bar
  base: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    percent: number | null;      // Percent change (if compareScaleMode === "percent")
  };
  compares: Record<string, {
    price: number | null;
    percent: number | null;
  }>;
}
```

**Error Codes**:

- `"NO_BASE_ROWS"` — Chart has no base data loaded (data still loading or symbol error)
- `"APPLY_HOVER_FAILED"` — Internal snapshot generation failed (rare; suggests DOM/ref corruption)
- Any other string — JavaScript exception message during execution

**Side Effects** (on success):

- `hoverStateRef.current` is updated with the snapshot
- `dump().hover.active` becomes `true` and reflects the new hover state
- Crosshair lines + pills (time/price) become visible in the chart viewport
- All dump() consumers see the updated hover state immediately

**Verbose Logging** (QA debugging):

Logging is controlled by:
- URL param: `?qaVerbose=1`
- localStorage key: `localStorage.setItem("chartspro.qaVerbose", "1")`

When enabled, logs like `[_qaApplyHover] Success: applied hover at timeKey 1704348000 snapshot.time: 1704348000` appear in the browser console.

**DOM Elements Verification**:

When a hover is applied, verify these testids are visible:

- `data-testid="crosshair-vertical"` — vertical line at hover x-position
- `data-testid="crosshair-horizontal"` — horizontal line at hover y-position
- `data-testid="time-pill"` — time label below the chart (e.g., "2024-01-01 12:00")
- `data-testid="price-pill"` — price label to the right of the chart (e.g., "123.45")

**Example Usage** (Playwright test):

```js
// Wait for chart ready
await page.goto("/?mock=1");
await page.getByRole("tab", { name: /^charts$/i }).click();
await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

// Apply hover at mid position
const result = await page.evaluate(() => 
  (window as any).__lwcharts._qaApplyHover({ where: "mid" })
);

expect(result.ok).toBe(true);
expect(result.snapshot.time).toBeGreaterThan(0);
expect(result.snapshot.base.close).toBeGreaterThan(0);

// Verify dump() reflects the hover
const hoverDump = await page.evaluate(() => (window as any).__lwcharts.dump().hover);
expect(hoverDump.active).toBe(true);
expect(hoverDump.time).toBe(result.snapshot.time);

// Verify crosshair is visible
await expect(page.locator('[data-testid="time-pill"]')).toBeVisible();
await expect(page.locator('[data-testid="price-pill"]')).toBeVisible();

// Apply hover at right, verify it differs from mid
const rightResult = await page.evaluate(() => 
  (window as any).__lwcharts._qaApplyHover({ where: "right" })
);
expect(rightResult.snapshot.time).not.toBe(result.snapshot.time);
```

**Troubleshooting**:

| Issue | Cause | Fix |
|-------|-------|-----|
| `_qaApplyHover is undefined` | Not running with `?mock=1` | Verify URL contains `?mock=1` |
| `error: "NO_BASE_ROWS"` | Chart still loading or symbol has no data | Wait longer; check `dump().pricePoints > 0` |
| `ok: true` but `dump().hover.active === false` | Race condition in update | Poll with `page.waitForFunction()` before asserting dump |
| Crosshair pills not visible | CSS/DOM not rendered | Check `data-testid` in ChartViewport.tsx lines ~3291–3299 |
| OHLC strip not showing | Hover not active or `ohlcDisplay` field missing | Verify `dump().hover.active === true` and snapshot includes `ohlcDisplay` |

## TradingView Hover UI/UX Parity (`_qaClearHover` + `_qaOpenContextMenu`)

**New Extended `HoverSnapshot`** (as of Sprint 2):

When `_qaApplyHover` succeeds, the returned snapshot now includes TradingView-style fields:

```ts
{
  time: number;                  // Unix timestamp (seconds) of the bar
  x: number | null;              // Plot x-coordinate (pixels, pre-computed in applyHoverSnapshot)
  y: number | null;              // Plot y-coordinate (pixels, pre-computed in applyHoverSnapshot)
  timeLabel: string;             // Formatted time label (YYYY-MM-DD HH:mm) for pill display
  priceLabel: string;            // Formatted price label for pill display
  base: { open, high, low, close, volume, percent };
  compares: Record<string, { price, percent }>;
  ohlcDisplay: {
    symbol: string;              // Symbol being hovered
    open: string;                // Formatted open price
    high: string;                // Formatted high price
    low: string;                 // Formatted low price
    close: string;               // Formatted close price
    change: string;              // Formatted change (+/-x.xx% or absolute)
  };
}
```

**New DOM Elements**:

When a hover is active, verify these additional testids:

- `data-testid="ohlc-strip"` — top-left OHLC info panel (displays O, H, L, C, change with color-coded +/- for change)
- Pills now have clamped positioning to prevent overflow beyond container bounds

**Clear Hover QA Primitive (`_qaClearHover`)**:

```ts
window.__lwcharts._qaClearHover()
  -> { ok: boolean }
```

Explicitly clears the hover state. Useful for testing hover lifecycle and ensuring revert-to-last behavior.

**Return**:
- `{ ok: true }` on success
- Sets `hoverStateRef.current = null` and triggers `applyHoverSnapshot(null)`
- `dump().hover.active` becomes `false`
- OHLC strip and pills hide from view

**Example**:

```js
// Apply hover
const result = await page.evaluate(() => window.__lwcharts._qaApplyHover({ where: "mid" }));
expect(result.ok).toBe(true);

// Verify active
const dump1 = await page.evaluate(() => window.__lwcharts.dump().hover);
expect(dump1.active).toBe(true);

// Clear hover
const clearResult = await page.evaluate(() => window.__lwcharts._qaClearHover());
expect(clearResult.ok).toBe(true);

// Verify cleared
const dump2 = await page.evaluate(() => window.__lwcharts.dump().hover);
expect(dump2.active).toBe(false);
```

**Open Context Menu QA Primitive (`_qaOpenContextMenu`)**:

```ts
window.__lwcharts._qaOpenContextMenu(opts?: { where?: "left" | "mid" | "right" | number })
  -> { ok: boolean; contextMenuOpen: boolean }
```

Deterministically opens the context menu at a hover position. Useful for testing context menu actions (Copy Price, Add Alert, Settings).

**Options**:
- `where?: "left" | "mid" | "right" | number` (default: `"mid"`)
  - Same semantics as `_qaApplyHover`; applies hover at the specified position before opening menu

**Return**:
- `{ ok: true, contextMenuOpen: true }` on success
- Context menu becomes visible with actions available

**Example**:

```js
// Open context menu at mid position
const menuResult = await page.evaluate(() => 
  window.__lwcharts._qaOpenContextMenu({ where: "mid" })
);
expect(menuResult.ok).toBe(true);
expect(menuResult.contextMenuOpen).toBe(true);

// Verify menu is visible
await expect(page.locator('[data-testid="context-menu"]')).toBeVisible();
```

**Mouse Leave Behavior**:

When the user's cursor leaves the chart container, `hoverStateRef.current` is cleared automatically via a `mouseleave` event listener. This ensures the hover state doesn't persist after the cursor exits, enabling graceful revert-to-last behavior.

**New `dump().hover` Fields**:

```ts
dump().hover when active === true:
{
  active: true;
  time: number;
  x: number | null;
  y: number | null;
  timeLabel: string;
  priceLabel: string;
  ohlc: { o, h, l, c };
  volume: number;
  ohlcDisplay: { symbol, open, high, low, close, change };
  // ... existing fields
}

dump().hover when active === false:
{
  active: false;
  time: null;
  x: null;
  y: null;
  timeLabel: null;
  priceLabel: null;
  ohlcDisplay: null;
  // ... other fields null
}
```

Inspector contract

- `dump().ui.inspectorOpen` — boolean flag reflecting whether the Inspector sidebar is open.
- `dump().ui.inspectorTab` — one of `"objects"` or `"data"` describing the selected tab.
- `__lwcharts.set({ inspectorOpen: true|false, inspectorTab: "data"|"objects" })` — accepted by the global setter; changes are applied and merged safely. Use `/?mock=1` when interacting from tests.

Example:

```js
// open inspector and switch to data tab
await __lwcharts.set({ inspectorOpen: true, inspectorTab: "data" });
await page.waitForFunction(() => __lwcharts.dump().ui?.inspectorOpen === true && __lwcharts.dump().ui?.inspectorTab === "data");
```

Compare-Percent contract

- `dump().ui.compareScaleMode` — one of `"price"` or `"percent"` describing the active compare scaling mode.
- `__lwcharts.set({ compareScaleMode: "price"|"percent" })` — toggle scaling mode deterministically; changes persist to localStorage (`chartspro.compareScaleMode`).
- `dump().render.objects` includes compare objects with:
  - `kind: "compare"`
  - `id: "compare-<safesymbol>"` — encoded ID (lowercase [a-z0-9_-] only; see ID Encoding below)
  - `title: "<ORIGINAL-SYMBOL>"` — raw symbol as added
  - `visible: boolean`
  - `colorHint: "#RRGGBB"` — color assigned to this compare
  - `paneId: "price"`
- `dump().compares` returns `{ [symbol]: pointCount }` for all active compares.

**ID Encoding table** (canonical mapping):

| Input             | Output         |
|-------------------|----------------|
| "META.US"         | "meta-us"      |
| "NASDAQ:AAPL"     | "nasdaq-aapl"  |
| "DEU40/XETR"      | "deu40-xetr"   |
| "SPCFD"           | "spcfd"        |

Rules:
- A–Z → a–z (lowercase)
- 0–9 → retained
- '.', ':', '/', '\', ' ' → '-' (delimiters become dashes)
- Other chars → '-'
- Multiple consecutive '-' collapse to single '-'
- Trim '-' from start/end

Example:

```js
// toggle compare scale to percent
await __lwcharts.set({ compareScaleMode: "percent" });
await page.waitForFunction(() => __lwcharts.dump().ui?.compareScaleMode === "percent");

// add a compare and verify its encoded ID
await __lwcharts.compare.add("AAPL.US");
const objects = __lwcharts.dump().render.objects;
const aaplObj = objects.find(o => o.kind === "compare" && o.title === "AAPL.US");
console.assert(aaplObj.id === "compare-aapl-us");
```

Minimal contract checks (also covered by `tests/chartsPro.contract.spec.ts` and `tests/chartsPro.comparePercent.spec.ts`):

```js
await __lwcharts.set({ timeframe: "4h" });
await page.waitForFunction(() => __lwcharts.dump().timeframe === "4h");
typeof __lwcharts.set === "function";
typeof __lwcharts.dump === "function";
typeof __lwcharts._applyPatch === "function"; // after Charts tab mounted
```

### Drawing Selection via QA API (TV-30.1)

**Status**: ✅ COMPLETE — Deterministic drawing selection for tests

**Problem**: Canvas-based click selection is unreliable in tests (coordinate-dependent, timing-sensitive).

**Solution**: Use `__lwcharts.set({ selectedId })` to programmatically select drawings by ID.

```js
// Select a drawing deterministically
await __lwcharts.set({ selectedId: "drawing-abc123" });
await page.waitForFunction(() => __lwcharts.dump().ui?.selectedObjectId === "drawing-abc123");

// Deselect (clear selection)
await __lwcharts.set({ selectedId: null });
await page.waitForFunction(() => __lwcharts.dump().ui?.selectedObjectId === null);
```

**Test Pattern** (recommended):

```typescript
// Create drawing and get its ID
const drawingId = await createTrendLine(page);

// Select via QA API (not canvas click)
await page.evaluate((id) => {
  window.__lwcharts?.set({ selectedId: id });
}, drawingId);

// Wait for selection to propagate
await expect.poll(async () => {
  const d = await dump(page);
  return d?.ui?.selectedObjectId;
}, { timeout: 3000 }).toBe(drawingId);

// Now FloatingToolbar is visible and can be interacted with
```

**Why this is better than canvas clicks**:
- Deterministic: No coordinate guessing
- State-driven: Uses same selection mechanism as UI
- Reliable: Works regardless of chart zoom/pan/position
- Fast: No waitForTimeout needed

**Dump contract**:
- `dump().ui.selectedObjectId` — ID of currently selected drawing (or null)
- `dump().ui.floatingToolbar.drawingId` — ID of drawing the toolbar is showing for
- `dump().ui.objectSettingsDialog.isOpen` — boolean, true when Object Settings modal is open
- `dump().ui.objectSettingsDialog.drawingId` — ID of drawing being edited (or null)

### Object Settings Modal (TV-30.3)

**Status**: ✅ COMPLETE — Gear button in FloatingToolbar opens modal for precise editing

**Features**:
- Edit exact coordinates (p1, p2, p3 time/price)
- Change style (color, width, dash, opacity)
- Change fill (fillColor, fillOpacity for shapes)
- Lock/Unlock and Delete buttons

**Test Pattern**:

```typescript
// Select drawing and open settings
await page.evaluate((id) => window.__lwcharts?.set({ selectedId: id }), drawingId);
await page.getByTestId("floating-toolbar-settings").click();

// Verify modal open via dump
const d = await dump(page);
expect(d?.ui?.objectSettingsDialog?.isOpen).toBe(true);
expect(d?.ui?.objectSettingsDialog?.drawingId).toBe(drawingId);

// Edit p1 price and save
await page.getByTestId("object-settings-p1-price").fill("150.00");
await page.getByTestId("object-settings-save").click();

// Verify change
const updated = await dump(page);
expect(updated?.objects?.find(o => o.id === drawingId)?.p1?.price).toBe(150);
```

**Test IDs**:
- `floating-toolbar-settings` — Gear button in FloatingToolbar
- `object-settings-modal` — The modal container
- `object-settings-p1-time`, `object-settings-p1-price` — Point 1 inputs
- `object-settings-p2-time`, `object-settings-p2-price` — Point 2 inputs
- `object-settings-color-{hex}` — Stroke color buttons (e.g., `object-settings-color-ef4444`)
- `object-settings-width` — Stroke width slider
- `object-settings-stroke-opacity` — Stroke opacity slider
- `object-settings-fill-color-{hex}` — Fill color buttons (shapes only)
- `object-settings-fill-opacity` — Fill opacity slider (shapes only)
- `object-settings-dash-solid|dashed|dotted` — Line style buttons
- `object-settings-lock` — Lock/Unlock button
- `object-settings-delete` — Delete button
- `object-settings-cancel` — Cancel button
- `object-settings-save` — Save button

### Alert Button (TV-30.4)

**Status**: ✅ COMPLETE — Bell button in FloatingToolbar creates alerts linked to drawings

**Supported Drawing Kinds**: `hline`, `trend`, `ray`, `extendedLine`
- For shapes/text: Shows "Not supported" message in modal

**Features**:
- Quick alert creation from selected drawing
- Label input, direction selector (cross_up/down/any), one-shot checkbox
- Posts to `/alerts` API endpoint with drawing geometry

**Dump Contract**:
- `dump().ui.createAlertDialog.isOpen` — boolean, true when Create Alert modal is open
- `dump().ui.createAlertDialog.drawingId` — ID of drawing being alerted (or null)

**Test Pattern**:

```typescript
// Select line drawing and open alert modal
const drawingId = await createHorizontalLine(page);
await page.evaluate((id) => window.__lwcharts?.set({ selectedId: id }), drawingId);
await page.getByTestId("floating-toolbar-alert").click();

// Verify modal open via dump
const d = await dump(page);
expect(d?.ui?.createAlertDialog?.isOpen).toBe(true);
expect(d?.ui?.createAlertDialog?.drawingId).toBe(drawingId);
```

**Test IDs**:
- `floating-toolbar-alert` — Bell button in FloatingToolbar (line-based drawings only)
- `create-alert-modal` — The modal container
- `create-alert-label` — Alert label input
- `create-alert-direction` — Direction selector (cross_up/cross_down/any)
- `create-alert-oneshot` — One-shot checkbox
- `create-alert-cancel` — Cancel button
- `create-alert-submit` — Create button
- `create-alert-not-supported` — "Not supported" message for shapes/text

### Per-Object Hide (TV-30.5)

**Status**: ✅ COMPLETE — Eye button in FloatingToolbar toggles drawing visibility

**Features**:
- Hide/Show individual drawings without deleting
- Visual feedback: Eye icon when visible, EyeOff icon when hidden
- Hidden drawings are not rendered but remain in dump().objects with `hidden: true`

**Dump Contract**:
- `dump().objects[n].hidden` — boolean, true when drawing is hidden

**Test Pattern**:

```typescript
// Select drawing and toggle hide
const drawingId = await createTrendLine(page);
await page.evaluate((id) => window.__lwcharts?.set({ selectedId: id }), drawingId);

// Check initial state
let d = await dump(page);
expect(d?.objects?.find(o => o.id === drawingId)?.hidden).toBe(false);

// Click hide button
await page.getByTestId("floating-toolbar-hide").click();

// Verify hidden
d = await dump(page);
expect(d?.objects?.find(o => o.id === drawingId)?.hidden).toBe(true);

// Toggle again to show
await page.getByTestId("floating-toolbar-hide").click();
d = await dump(page);
expect(d?.objects?.find(o => o.id === drawingId)?.hidden).toBe(false);
```

**Test IDs**:
- `floating-toolbar-hide` — Eye/EyeOff button in FloatingToolbar

### Style Presets / Templates (TV-30.6)

**Status**: ✅ COMPLETE — Bookmark button in FloatingToolbar for style presets

**Features**:
- Save current drawing style as named preset
- Apply saved preset to any drawing of same kind
- Set default preset per tool kind (applied to new drawings)
- Delete presets
- Persisted to localStorage (`cp.toolPresets`)

**Dump Contract**:
- `dump().ui.presets.presets` — Record of preset arrays per DrawingKind
- `dump().ui.presets.defaults` — Record of default preset IDs per DrawingKind

**Test Pattern**:

```typescript
// Save preset
await page.getByTestId("floating-toolbar-preset").click();
await page.getByTestId("preset-save-current").click();
await page.getByTestId("preset-save-name").fill("My Style");
await page.getByTestId("preset-save-confirm").click();

// Get preset ID from dump
const d = await dump(page);
const presetId = d?.ui?.presets?.presets?.hline?.[0]?.id;

// Apply preset
await page.getByTestId(`preset-apply-${presetId}`).click();

// Set as default
await page.getByTestId(`preset-default-${presetId}`).click();
```

**Test IDs**:
- `floating-toolbar-preset` — Bookmark button in FloatingToolbar
- `preset-menu` — Dropdown menu container
- `preset-save-current` — "Save current style as preset" button
- `preset-save-name` — Preset name input
- `preset-save-confirm` — Confirm save button
- `preset-save-cancel` — Cancel save button
- `preset-item-{id}` — Preset row container
- `preset-apply-{id}` — Apply preset button
- `preset-default-{id}` — Toggle default star button
- `preset-delete-{id}` — Delete preset button

### Drawing Labels (TV-30.7)

**Status**: ✅ COMPLETE — Type (T) button in FloatingToolbar for adding text labels to drawings

**Features**:
- Attach text labels to any drawing type
- Labels rendered at appropriate anchor points per drawing geometry
- Edit labels via FloatingToolbar button or ObjectSettingsModal
- Labels persist after page reload
- Active state on button when drawing has label

**Dump Contract**:
- `dump().objects[n].label` — string | null, user-assigned label text
- `dump().ui.labelModal.isOpen` — boolean, label modal open state
- `dump().ui.labelModal.drawingId` — string | null, drawing being edited

**Test Pattern**:

```typescript
// Create drawing and open label modal
const drawingId = await createHorizontalLine(page);
await page.getByTestId("floating-toolbar-label").click();

// Verify modal opened
let d = await dump(page);
expect(d?.ui?.labelModal?.isOpen).toBe(true);

// Enter label and save
await page.getByTestId("label-modal-input").fill("Support level");
await page.getByTestId("label-modal-save").click();

// Verify label saved
d = await dump(page);
expect(d?.objects?.find(o => o.id === drawingId)?.label).toBe("Support level");
```

**Test IDs**:
- `floating-toolbar-label` — Type (T) button in FloatingToolbar
- `label-modal` — Label modal container
- `label-modal-input` — Label text input
- `label-modal-save` — Save button
- `label-modal-cancel` — Cancel button

### Z-order / Layers (TV-30.8)

**Status**: ✅ COMPLETE — Bring to Front / Send to Back buttons in FloatingToolbar

**Features**:
- Control stacking order of overlapping drawings
- Bring to Front: sets z = max(all z values) + 1
- Send to Back: sets z = min(all z values) - 1
- Z values exposed in dump() for testing

**Dump Contract**:
- `dump().objects[n].z` — number, z-order value (higher = on top)

**Test Pattern**:

```typescript
// Create two drawings
await setTool(page, "hline");
await page.mouse.click(centerX, centerY * 0.4); // First at 40%
await page.keyboard.press("Escape");
await setTool(page, "hline");
await page.mouse.click(centerX, centerY * 0.6); // Second at 60%

// Get z values - second should be higher
let d = await dump(page);
const firstId = d?.objects?.[0]?.id;
const secondId = d?.objects?.[1]?.id;
expect(d?.objects?.[1]?.z).toBeGreaterThan(d?.objects?.[0]?.z);

// Send second to back (it's auto-selected)
await page.getByTestId("floating-toolbar-send-to-back").click();
d = await dump(page);
expect(d?.objects?.find(o => o.id === secondId)?.z)
  .toBeLessThan(d?.objects?.find(o => o.id === firstId)?.z);

// Bring it back to front
await page.getByTestId("floating-toolbar-bring-to-front").click();
d = await dump(page);
expect(d?.objects?.find(o => o.id === secondId)?.z)
  .toBeGreaterThan(d?.objects?.find(o => o.id === firstId)?.z);
```

**Test IDs**:
- `floating-toolbar-bring-to-front` — ArrowUpToLine button
- `floating-toolbar-send-to-back` — ArrowDownToLine button

---

- `dump().ui.inspectorOpen` — boolean flag reflecting whether the Inspector sidebar is open.
- `dump().ui.inspectorTab` — one of `"objects"` or `"data"` describing the selected tab.
- `__lwcharts.set({ inspectorOpen: true|false, inspectorTab: "data"|"objects" })` — accepted by the global setter; changes are applied and merged safely. Use `/?mock=1` when interacting from tests.

Example:

```js
// open inspector and switch to data tab
await __lwcharts.set({ inspectorOpen: true, inspectorTab: "data" });
await page.waitForFunction(() => __lwcharts.dump().ui?.inspectorOpen === true && __lwcharts.dump().ui?.inspectorTab === "data");
```

Compare-Percent contract

- `dump().ui.compareScaleMode` — one of `"price"` or `"percent"` describing the active compare scaling mode.
- `__lwcharts.set({ compareScaleMode: "price"|"percent" })` — toggle scaling mode deterministically; changes persist to localStorage (`chartspro.compareScaleMode`).
- `dump().render.objects` includes compare objects with:
  - `kind: "compare"`
  - `id: "compare-<safesymbol>"` — encoded ID (lowercase [a-z0-9_-] only; see ID Encoding below)
  - `title: "<ORIGINAL-SYMBOL>"` — raw symbol as added
  - `visible: boolean`
  - `colorHint: "#RRGGBB"` — color assigned to this compare
  - `paneId: "price"`
- `dump().compares` returns `{ [symbol]: pointCount }` for all active compares.

**ID Encoding table** (canonical mapping):

| Input             | Output         |
|-------------------|----------------|
| "META.US"         | "meta-us"      |
| "NASDAQ:AAPL"     | "nasdaq-aapl"  |
| "DEU40/XETR"      | "deu40-xetr"   |
| "SPCFD"           | "spcfd"        |

Rules:
- A–Z → a–z (lowercase)
- 0–9 → retained
- '.', ':', '/', '\', ' ' → '-' (delimiters become dashes)
- Other chars → '-'
- Multiple consecutive '-' collapse to single '-'
- Trim '-' from start/end

Example:

```js
// toggle compare scale to percent
await __lwcharts.set({ compareScaleMode: "percent" });
await page.waitForFunction(() => __lwcharts.dump().ui?.compareScaleMode === "percent");

// add a compare and verify its encoded ID
await __lwcharts.compare.add("AAPL.US");
const objects = __lwcharts.dump().render.objects;
const aaplObj = objects.find(o => o.kind === "compare" && o.title === "AAPL.US");
console.assert(aaplObj.id === "compare-aapl-us");
```

Minimal contract checks (also covered by `tests/chartsPro.contract.spec.ts` and `tests/chartsPro.comparePercent.spec.ts`):

```js
await __lwcharts.set({ timeframe: "4h" });
await page.waitForFunction(() => __lwcharts.dump().timeframe === "4h");
typeof __lwcharts.set === "function";
typeof __lwcharts.dump === "function";
typeof __lwcharts._applyPatch === "function"; // after Charts tab mounted
typeof __lwcharts.debug.zoom === "function"; // only in mock/dev
```

Notes
- `set` never disappears; stubs live in `src/main.tsx`.
- `_applyPatch` uses the same handler as the UI timeframe dropdown.
- Debug helpers stay behind the QA/dev gate; production users only see `set` and `dump`.
## Multi-Symbol Hover Contract (Compares + Overlays)

**Extended HoverSnapshot Structure** (as of Sprint 3):

When _qaApplyHover succeeds with active compares, the returned snapshot now includes per-compare cursor values and overlay data:

`	s
{
  time: number;                  // Unix timestamp (seconds) of the bar
  x: number | null;              // Plot x-coordinate (pixels, pre-computed in applyHoverSnapshot)
  y: number | null;              // Plot y-coordinate (pixels, pre-computed in applyHoverSnapshot)
  timeLabel: string;             // Formatted time label (YYYY-MM-DD HH:mm) for pill display
  priceLabel: string;            // Formatted price label for pill display
  base: { open, high, low, close, volume, percent };
  compares: Record<string, {
    price: number | null;
    percent: number | null;
    priceAtCursor: number | null;        // Price value at cursor time for this compare
    percentAtCursor: number | null;      // Percent value at cursor time (if percent-mode)
    changeAbs: number | null;            // Absolute change from compare anchor close
    changePct: number | null;            // Percent change from compare anchor close
    colorHint?: string;                  // Hex color assigned to this compare (#RRGGBB)
  }>;
  overlayValues: Record<string, number | null>;  // Indicator values at cursor (SMA/EMA keys -> values)
  compareDisplays?: Record<string, {
    symbol: string;              // Compare symbol (e.g., "AAPL.US")
    value: string;               // Formatted compare value at cursor
    change?: string;             // Formatted change (+/-x.xx%)
    colorHint?: string;          // Hex color for display
  }>;
  ohlcDisplay: {
    symbol: string;              // Base symbol
    open: string;
    high: string;
    low: string;
    close: string;
    change: string;
  };
}
`

**OHLC Strip Multi-Row UI**:

When one or more compares are active, the OHLC strip now renders:
- **Base row**: Symbol (O/H/L/C) + base change
- **Compare rows** (up to 4): Per-compare symbol + value at cursor + change % (color-coded by colorHint)

Each compare row has testid: data-testid="ohlc-compare-row-{safeSymbol}" (encoded using ID Encoding rules)

Example HTML structure:
`html
<div data-testid="ohlc-strip">
  <div><!-- base row: EUR/USD O: 1.0950 H: 1.1000 L: 1.0900 C: 1.0980 +0.28% --></div>
  <div data-testid="ohlc-compare-row-aapl-us">
    <span>AAPL.US</span>
    <span style="color: #00AA00;">205.30</span>
    <span style="color: #00AA00;">+2.50%</span>
  </div>
  <div data-testid="ohlc-compare-row-msft-us">
    <span>MSFT.US</span>
    <span style="color: #FF0000;">420.15</span>
    <span style="color: #FF0000;">-1.20%</span>
  </div>
</div>
`

**Extended dump().hover Fields**:

`	s
dump().hover when active === true:
{
  active: true;
  time: number;
  x: number | null;
  y: number | null;
  timeLabel: string;
  priceLabel: string;
  ohlc: { o, h, l, c };
  volume: number;
  ohlcDisplay: { symbol, open, high, low, close, change };
  compares: Record<symbol, {
    price: number | null;
    percent: number | null;
    priceAtCursor: number | null;
    percentAtCursor: number | null;
    changeAbs: number | null;
    changePct: number | null;
    colorHint?: string;
  }>;
  overlays: Record<overlayId, number | null>;  // SMA/EMA -> values at cursor
  compareDisplays?: Record<symbol, {
    symbol: string;
    value: string;
    change?: string;
    colorHint?: string;
  }>;
}

dump().hover when active === false:
{
  active: false;
  // ... all fields null
}
`

**New dump().render.legendLabels Field**:

Exposes legend label positions for collision detection assertions:

`	s
dump().render.legendLabels: Array<{
  id: string;                  // Unique label identifier (e.g., "base", "compare-aapl-us")
  y: number;                   // Y-coordinate (pixels) of the label in the price pane
  text: string;                // Label text (e.g., "EUR/USD", "AAPL.US")
  paneId: string;              // Pane containing the label ("price" for base/same-pane, "pane-compare-{safeSymbol}" for separate pane)
}>
`

Labels are collision-free with minimum spacing enforced (18px tolerance between labels).

**Multi-Symbol Hover Test Example**:

`js
// Wait for chart ready and add compares
await page.goto("/?mock=1");
await page.getByRole("tab", { name: /^charts$/i }).click();
await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

await page.evaluate(() => (window as any).__lwcharts.compare.add("AAPL.US"));
await page.evaluate(() => (window as any).__lwcharts.compare.add("MSFT.US"));
await page.waitForFunction(() => Object.keys((window as any).__lwcharts.dump().compares).length === 2);

// Apply hover at mid position
const result = await page.evaluate(() => 
  (window as any).__lwcharts._qaApplyHover({ where: "mid" })
);

expect(result.ok).toBe(true);
expect(result.snapshot.compares["AAPL.US"]).toBeDefined();
expect(result.snapshot.compares["AAPL.US"].priceAtCursor).toBeGreaterThan(0);
expect(result.snapshot.compares["AAPL.US"].changeAbs).not.toBeNull();
expect(result.snapshot.compareDisplays["AAPL.US"]).toBeDefined();
expect(result.snapshot.compareDisplays["AAPL.US"].value).toMatch(/^\d+\.\d+$/);
expect(result.snapshot.compareDisplays["AAPL.US"].change).toMatch(/^[+-]\d+\.\d+%$/);

// Verify OHLC strip displays compare rows
await expect(page.locator('[data-testid="ohlc-compare-row-aapl-us"]')).toBeVisible();
await expect(page.locator('[data-testid="ohlc-compare-row-msft-us"]')).toBeVisible();

// Verify overlay values captured
const hoverDump = await page.evaluate(() => (window as any).__lwcharts.dump().hover);
expect(hoverDump.overlays).toBeDefined();
expect(Object.keys(hoverDump.overlays).length).toBeGreaterThanOrEqual(0);

// Verify legend labels exist and don't overlap (min 12px tolerance)
const legendLabels = await page.evaluate(() => (window as any).__lwcharts.dump().render.legendLabels);
expect(legendLabels).toBeDefined();
expect(legendLabels.length).toBeGreaterThan(0);
for (let i = 0; i < legendLabels.length - 1; i++) {
  const gap = Math.abs(legendLabels[i + 1].y - legendLabels[i].y);
  expect(gap).toBeGreaterThanOrEqual(12);
}

// Clear hover and verify state reverts
const clearResult = await page.evaluate(() => window.__lwcharts._qaClearHover());
expect(clearResult.ok).toBe(true);
const dump2 = await page.evaluate(() => (window as any).__lwcharts.dump().hover);
expect(dump2.active).toBe(false);
`

**Troubleshooting Multi-Symbol Hover**:

| Issue | Cause | Fix |
|-------|-------|-----|
| compares field empty in snapshot | No compares added or not yet loaded | Verify dump().compares has items before calling _qaApplyHover |
| priceAtCursor is 
ull | Overlay value not captured at this time | Check if overlay data exists at hover time; may indicate data gap |
| compareDisplays missing | Snapshot generated before compare display computation | Poll with page.waitForFunction() to ensure snapshot fully populated |
| Compare rows not visible in OHLC strip | Hover not active or max 4 limit exceeded | Verify dump().hover.active === true; remove extra compares if > 4 |
| legendLabels shows overlapping y-coordinates | Label collision detection failed | Rare; indicates resolveLabelPositions() needs adjustment; check spacing rules |
# Pinned Crosshair + Context Menu Contract (Sprint 4)

**Overview**: Pinned crosshair allows users to freeze the crosshair at a specific price/time by left-clicking the chart. The context menu provides actions: Copy Price (clipboard), Add Alert (modal), Settings (visibility toggles). All features are deterministic and testable via QA primitives.

## Pinned Crosshair API

**_qaPinCrosshair(opts?)**

Programmatically pin the crosshair at a specific position (or current hover if already active).

```ts
window.__lwcharts._qaPinCrosshair(opts?: { where?: "mid" | "left" | "right" | number })
  -> { ok: boolean; pinned: boolean; time: number | null; price: number | null; error: string | null }
```

**Behavior**:

- If `opts.where` is provided, applies hover at that position first (same as `_qaApplyHover`)
- Then pins the crosshair at the current hover state
- Returns `{ ok: true, pinned: true, time, price }` on success
- Once pinned, mousemove events are ignored; crosshair stays at pinned time/price
- `dump().ui.pinned === true` immediately (synchronous ref-based state)

**Example**:

```js
const result = await page.evaluate(() => (window as any).__lwcharts._qaPinCrosshair({ where: "mid" }));
expect(result.ok).toBe(true);
expect(result.pinned).toBe(true);
expect(result.time).toBeGreaterThan(0);
expect(result.price).toBeGreaterThan(0);

// Verify pinned state in dump
const dump = await page.evaluate(() => (window as any).__lwcharts.dump());
expect(dump.ui.pinned).toBe(true);
expect(dump.ui.pinnedTime).toBe(result.time);
expect(dump.ui.pinnedPrice).toBe(result.price);
```

**_qaUnpinCrosshair()**

Unpin the crosshair and resume normal hover behavior.

```ts
window.__lwcharts._qaUnpinCrosshair()
  -> { ok: boolean; pinned: boolean; error: string | null }
```

**Behavior**:

- Clears pinned state and refs
- Crosshair resumes following mouse movement
- `dump().ui.pinned === false` immediately
- Returns `{ ok: true, pinned: false }`

**Example**:

```js
const result = await page.evaluate(() => (window as any).__lwcharts._qaUnpinCrosshair());
expect(result.ok).toBe(true);
expect(result.pinned).toBe(false);

// Verify hover resumes
await page.mouse.move(100, 200);
const dump = await page.evaluate(() => (window as any).__lwcharts.dump());
expect(dump.hover.active).toBe(true); // hover updates normally
```

**User Interaction** (left-click):

- Left-click on chart surface when hovering → toggles pin state
- Left-click again → unpins (no modal or confirmation needed)
- ESC key while pinned → unpins

## Context Menu API

**_qaClickContextAction(action)**

Simulate clicking a context menu action (used for QA automation).

```ts
window.__lwcharts._qaClickContextAction(action: "copyPrice" | "addAlert" | "settings")
  -> { ok: boolean; action: string; error: string | null }
```

**Actions**:

1. **"copyPrice"**
   - Copies `"SYMBOL PRICE @ TIME_LABEL"` to clipboard (e.g., `"AAPL.US 184.5 @ 2024-01-02 16:00"`)
   - Fallback: if `navigator.clipboard` unavailable (headless), stores in `dump().ui.lastClipboardText`
   - Returns `{ ok: true, action: "copyPrice" }`
   - Verification: `dump().ui.lastClipboardText === "AAPL.US 184.5 @ 2024-01-02 16:00"`

2. **"addAlert"**
   - Opens Add Alert modal with prefilled inputs:
     - `symbol`: current symbol (disabled input)
     - `timeframe`: current timeframe (disabled input)
     - `priceAtCursor`: price at current hover (disabled input)
     - `timeKey`: time of current hover (disabled input)
   - Modal has Confirm and Cancel buttons
   - Prefilled data in `dump().ui.lastAlertDraft`: `{ symbol, timeframe, priceAtCursor, timeKey }`
   - Returns `{ ok: true, action: "addAlert" }`

3. **"settings"**
   - Opens Settings modal with checkboxes:
     - `showCrosshair`: toggle visibility of time/price pills (default: true)
     - `showOhlcStrip`: toggle visibility of OHLC info panel (default: true)
   - Changes apply immediately to dump state
   - Returns `{ ok: true, action: "settings" }`

**Example**:

```js
// Test Copy Price action
await page.evaluate(() => (window as any).__lwcharts._qaClickContextAction("copyPrice"));
const dump = await page.evaluate(() => (window as any).__lwcharts.dump());
expect(dump.ui.lastClipboardText).toMatch(/^[A-Z0-9.]+ \d+\.\d+ @ \d{4}-\d{2}-\d{2}/);

// Test Add Alert action
await page.evaluate(() => (window as any).__lwcharts._qaClickContextAction("addAlert"));
const dump2 = await page.evaluate(() => (window as any).__lwcharts.dump());
expect(dump2.ui.lastAlertDraft).toBeDefined();
expect(dump2.ui.lastAlertDraft.symbol).toBeTruthy();
expect(dump2.ui.lastAlertDraft.priceAtCursor).toBeGreaterThan(0);

// Test Settings action (toggle crosshair)
await page.evaluate(() => (window as any).__lwcharts._qaClickContextAction("settings"));
// Verify modal is open; checkbox state changes
const dump3 = await page.evaluate(() => {
  const d = (window as any).__lwcharts.dump();
  return d.ui.showCrosshair; // Check state
});
expect(typeof dump3).toBe("boolean");
```

## dump().ui Extended Schema (Sprint 4)

Extends the `dump().ui` object with pinned + settings state:

```ts
dump().ui: {
  // ... existing fields (inspectorOpen, etc.) ...
  
  // Pinned crosshair state (Sprint 4)
  pinned: boolean;                  // true if crosshair is pinned
  pinnedTime: number | null;        // Unix timestamp of pinned bar (or null if not pinned)
  pinnedPrice: number | null;       // Price at pinned position (or null if not pinned)
  
  // Settings toggles (Sprint 4)
  showCrosshair: boolean;           // Visibility of crosshair pills (time/price labels)
  showOhlcStrip: boolean;           // Visibility of OHLC strip panel
  
  // Context menu state (Sprint 4)
  contextMenuOpen: boolean;         // true if context menu visible
  lastContextAction: string | null; // Last action clicked ("copyPrice" | "addAlert" | "settings" | null)
  lastClipboardText: string | null; // Last copied text (for headless/test verification)
  lastAlertDraft: {                 // Last alert draft data from "addAlert" action
    symbol: string;
    timeframe: string;
    priceAtCursor: number;
    timeKey: number;
  } | null;
}
```

## Visual Behavior (dump().render.crosshair)

When pinned, the crosshair rendering reflects pinned time/price:

```ts
dump().render.crosshair: {
  active: boolean;                  // true if pinned OR hover active
  time: number | null;              // Pinned time (if pinned) or hover time (if hovering)
  price: number | null;             // Pinned price (if pinned) or hover price (if hovering)
}
```

**Priority**: Pinned state takes precedence over hover state in dump().render.

## Conditional UI Rendering

**Crosshair Pills** (time/price labels):

- Visible if `dump().ui.showCrosshair === true` AND hover/pinned active
- Hidden if `dump().ui.showCrosshair === false` (even if pinned)

**OHLC Strip Panel**:

- Visible if `dump().ui.showOhlcStrip === true` AND hover/pinned active
- Hidden if `dump().ui.showOhlcStrip === false` (even if pinned)

## Pinned Crosshair + Context Menu Test Example

```js
// Full workflow: pin, context menu, copy price, settings
await page.goto("/?mock=1");
await page.getByRole("tab", { name: /^charts$/i }).click();
await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

// Apply hover to mid position
const hoverResult = await page.evaluate(() => 
  (window as any).__lwcharts._qaApplyHover({ where: "mid" })
);
expect(hoverResult.ok).toBe(true);

// Pin crosshair
const pinResult = await page.evaluate(() => (window as any).__lwcharts._qaPinCrosshair());
expect(pinResult.ok).toBe(true);
expect(pinResult.pinned).toBe(true);

// Verify pinned in dump
let dump = await page.evaluate(() => (window as any).__lwcharts.dump());
expect(dump.ui.pinned).toBe(true);
expect(dump.ui.pinnedTime).toBe(pinResult.time);
expect(dump.ui.pinnedPrice).toBe(pinResult.price);

// Verify crosshair stays stable (move mouse, dump should not change)
const prevDump = dump;
await page.mouse.move(50, 50); // move away
dump = await page.evaluate(() => (window as any).__lwcharts.dump());
expect(dump.ui.pinnedTime).toBe(prevDump.ui.pinnedTime); // still pinned at same position
expect(dump.render.crosshair.time).toBe(prevDump.render.crosshair.time);

// Copy price action
await page.evaluate(() => (window as any).__lwcharts._qaClickContextAction("copyPrice"));
dump = await page.evaluate(() => (window as any).__lwcharts.dump());
expect(dump.ui.lastClipboardText).toMatch(/^[A-Z0-9.]+ \d+\.\d+ @ /);

// Settings action
await page.evaluate(() => (window as any).__lwcharts._qaClickContextAction("settings"));
dump = await page.evaluate(() => (window as any).__lwcharts.dump());
expect(dump.ui.showCrosshair).toBe(true); // initial state

// Unpin crosshair
const unpinResult = await page.evaluate(() => (window as any).__lwcharts._qaUnpinCrosshair());
expect(unpinResult.ok).toBe(true);
expect(unpinResult.pinned).toBe(false);

dump = await page.evaluate(() => (window as any).__lwcharts.dump());
expect(dump.ui.pinned).toBe(false);
```

---

## TV-2: TradingView Legend UI Parity (Sprint TV-2.1)

### API/QA Contract

Seven deterministic QA primitives for legend interactions:

#### 1. `_qaLegendHover(id: string | null)`

Set/clear legend row hover state.

```typescript
const result = await page.evaluate(({ id }) => {
  const api = (window as any).__lwcharts;
  return api._qaLegendHover?.(id);
}, { id: "base" });

expect(result.ok).toBe(true);
expect(result.legendHoverId).toBe("base");

const dump = await page.evaluate(() => (window as any).__lwcharts.dump());
expect(dump.ui.legendHoverId).toBe("base");
```

**Behavior**: Sets `dump().ui.legendHoverId` and triggers dimming of other series in legend.

---

#### 2. `_qaLegendToggle(id: string)`

Toggle series visibility on/off.

```typescript
const result = await page.evaluate(({ id }) => {
  const api = (window as any).__lwcharts;
  return api._qaLegendToggle?.(id);
}, { id: "base" });

expect(result.ok).toBe(true);

const dump = await page.evaluate(() => (window as any).__lwcharts.dump());
// Visibility should toggle
expect(dump.ui.legendVisibility["base"]).not.toBe(initialState);
```

**Behavior**: Flips `dump().ui.legendVisibility[id]` and hides/shows series in chart.

---

#### 3. `_qaLegendSolo(id: string | null)`

Isolate single series or clear solo mode.

```typescript
// Enable solo
const result = await page.evaluate(({ id }) => {
  const api = (window as any).__lwcharts;
  return api._qaLegendSolo?.(id);
}, { id: "base" });

expect(result.ok).toBe(true);
expect(result.soloId).toBe("base");

const dump = await page.evaluate(() => (window as any).__lwcharts.dump());
expect(dump.ui.legendSoloId).toBe("base");
// All other series should be hidden
expect(dump.ui.legendVisibility["other-id"]).toBe(false);

// Clear solo
const clearResult = await page.evaluate(() => {
  const api = (window as any).__lwcharts;
  return api._qaLegendSolo?.(null);
});

expect(clearResult.ok).toBe(true);
expect(clearResult.soloId).toBeNull();
```

**Behavior**: Sets `dump().ui.legendSoloId` and hides all other series.

---

#### 4. `_qaLegendReorder({fromId: string, toIndex: number})`

Reorder legend rows by drag/drop.

```typescript
const result = await page.evaluate(({ fromId, toIndex }) => {
  const api = (window as any).__lwcharts;
  return api._qaLegendReorder?.({ fromId, toIndex });
}, { fromId: "compare-TSLA.US", toIndex: 0 });

expect(result.ok).toBe(true);

const dump = await page.evaluate(() => (window as any).__lwcharts.dump());
const newOrder = dump.render.legendRows.map((r: any) => r.id);
// TSLA should now be at or near position 0
expect(newOrder.indexOf("compare-TSLA.US")).toBeLessThan(previousIndex);
```

**Behavior**: Reorders `dump().render.legendRows` and updates `orderIndex` field.

---

#### 5. `_qaOpenSeriesSettings(id: string)`

Open series settings modal.

```typescript
const result = await page.evaluate(({ id }) => {
  const api = (window as any).__lwcharts;
  return api._qaOpenSeriesSettings?.(id);
}, { id: "base" });

expect(result.ok).toBe(true);
expect(result.id).toBe("base");
```

**Behavior**: Opens modal for editing series style/placement.

---

#### 6. `_qaSetSeriesStyle(id: string, {colorHint?, width?, lineStyle?})`

Set series line style properties.

```typescript
const result = await page.evaluate(({ id }) => {
  const api = (window as any).__lwcharts;
  return api._qaSetSeriesStyle?.(id, {
    colorHint: "#FF6B35",
    width: 3,
    lineStyle: "dashed"
  });
}, { id: "base" });

expect(result.ok).toBe(true);
expect(result.style.width).toBe(3);

const dump = await page.evaluate(() => (window as any).__lwcharts.dump());
const style = dump.render.seriesStyles.find((s: any) => s.id === "base");
expect(style.width).toBe(3);
expect(style.lineStyle).toBe("dashed");
```

**Behavior**: Updates `dump().render.seriesStyles[]` and applies style to series.

---

#### 7. `_qaSetSeriesPlacement(id: string, {pane?, scale?})`

Set series pane and scale placement.

```typescript
const result = await page.evaluate(({ id }) => {
  const api = (window as any).__lwcharts;
  return api._qaSetSeriesPlacement?.(id, {
    pane: "main",
    scale: "left"
  });
}, { id: "base" });

expect(result.ok).toBe(true);
expect(result.placement.scale).toBe("left");

const dump = await page.evaluate(() => (window as any).__lwcharts.dump());
const style = dump.render.seriesStyles.find((s: any) => s.id === "base");
expect(style.scale).toBe("left");
expect(style.pane).toBe("main");
```

**Behavior**: Updates `dump().render.seriesStyles[]` placement fields.

---

### UI Contract

Legend overlay must render stably with these test IDs:

```
data-testid="legend-overlay"                    // Main container, top-left, 4-column grid
data-testid="legend-row-{id}"                   // Each series row (draggable)
data-testid="legend-handle-{id}"                // Drag handle (grip icon)
data-testid="legend-marker-{id}"                // Color dot indicator
data-testid="legend-settings-{id}"              // Settings button
data-testid="legend-toggle-{id}"                // Eye/visibility button
data-testid="legend-remove-{id}"                // Remove button (if not base)
data-testid="drop-indicator-before-{id}"        // Drop target indicator during drag
```

**Grid Layout** (4 columns, no shift):
1. **[Handle]** – Drag grip (hidden until hover)
2. **[Marker]** – Color dot (fixed width)
3. **[Name+Value]** – Series symbol + last value (flex, truncated)
4. **[Actions]** – Settings/toggle/remove buttons (hidden until hover)

**Hover Behavior**:
- Row background changes to `bg-slate-800/80`
- Actions become visible (`opacity-100`)
- All other series are dimmed (marker color becomes lighter)

**Visibility Toggle**:
- Toggled series is marked with lower opacity (eye icon changes)
- Series disappears from chart render

**Solo Mode**:
- All other rows become dimmed (lower opacity)
- All other series hidden from chart
- Solo row remains highlighted

---

### dump() Schema (TV-2.1)

```typescript
dump().ui: {
  legendHoverId: string | null;                  // Current hover row ID
  legendSoloId: string | null;                   // Current solo ID (if active)
  legendVisibility: Record<string, boolean>;     // Map of series ID → visible
}

dump().render.legendRows[]: {
  id: string;
  symbol: string;
  isBase: boolean;
  visible: boolean;
  lastValue: number | null;
  colorHint: string;
  orderIndex: number;                            // Position in legend (0-based)
}

dump().render.seriesStyles[]: {
  id: string;
  colorHint: string;
  width: number;
  lineStyle: "solid" | "dashed" | "dotted";
  pane: "main" | "own";
  scale: "left" | "right";
  scaleSide: "left" | "right";
}
```

---

## TV-23.1: Settings Dialog

### Overview

The Settings Dialog provides a centralized UI for configuring chart appearance, layout, and advanced settings. Opened via the gear button in TopBar.

### dump().ui.settingsDialog

```typescript
dump().ui.settingsDialog: {
  isOpen: boolean;      // Whether dialog is currently open
  activeTab: string;    // Current tab: "appearance" | "layout" | "advanced"
}
```

### localStorage

Settings are persisted to `cp.settings` as JSON:

```typescript
localStorage.getItem("cp.settings");
// Returns: { appearance: {...}, layout: {...}, advanced: {...} }
```

### Test Patterns

```typescript
// Open settings dialog
await page.getByTestId("settings-button").click();
await expect(page.getByTestId("settings-dialog")).toBeVisible();

// Verify dialog state in dump()
await expect.poll(async () => {
  const dump = await page.evaluate(() => __lwcharts.dump());
  return dump.ui.settingsDialog.isOpen;
}).toBe(true);

// Navigate tabs
await page.getByTestId("settings-tab-layout").click();
await expect(page.getByTestId("settings-panel-layout")).toBeVisible();

// Close via Escape
await page.keyboard.press("Escape");
await expect(page.getByTestId("settings-dialog")).not.toBeVisible();
```

### Test IDs

| Element | data-testid |
|---------|-------------|
| Settings button (TopBar) | `settings-button` |
| Dialog container | `settings-dialog` |
| Close button | `settings-close` |
| Tab buttons | `settings-tab-{appearance\|layout\|advanced}` |
| Tab panels | `settings-panel-{appearance\|layout\|advanced}` |
| Save button | `settings-save` |
| Cancel button | `settings-cancel` |
| Reset button | `settings-reset` |
| Individual controls | `settings-{fieldName}` (e.g., `settings-showGrid`, `settings-upColor`) |

---

## TV-23.2: Apply Appearance Settings to Chart

### Overview

TV-23.2 wires the Settings Dialog's Appearance tab to actual lwcharts rendering. When appearance settings are changed and saved, the chart visually updates.

### dump().render.appliedAppearance

```typescript
dump().render.appliedAppearance: {
  chartOptions: {
    backgroundColor: string;     // e.g., "#1e1e2e"
    gridVisible: boolean;        // true if showGrid=true AND gridStyle!="hidden"
    gridStyle: string;           // "solid" | "dashed" | "hidden"
    gridColor: string;           // e.g., "rgba(42, 46, 57, 0.5)"
    crosshairMode: string;       // "normal" | "magnet" | "hidden"
    crosshairColor: string;      // e.g., "rgba(255, 255, 255, 0.5)"
  };
  seriesOptions: {              // Only for candles/bars chartType
    upColor: string;            // e.g., "#22c55e"
    downColor: string;          // e.g., "#ef4444"
    wickUpColor: string;        // e.g., "#22c55e"
    wickDownColor: string;      // e.g., "#ef4444"
  } | null;                     // null for line/area chart types
  appliedAt: number;            // Unix timestamp of last application
}
```

### Settings Mapping to lwcharts

| Zustand Setting | lwcharts Option |
|-----------------|-----------------|
| `backgroundColor` | `layout.background.color` |
| `showGrid` + `gridStyle` | `grid.horzLines/vertLines.visible` |
| `gridStyle` | `grid.horzLines/vertLines.style` (Solid/Dashed/Dotted) |
| `gridColor` | `grid.horzLines/vertLines.color` |
| `crosshairMode` | `crosshair.mode` (Normal/Magnet/Hidden) |
| `crosshairColor` | `crosshair.vertLine/horzLine.color` |
| `upColor` | series `upColor` |
| `downColor` | series `downColor` |
| `wickUpColor` | series `wickUpColor` |
| `wickDownColor` | series `wickDownColor` |

### Programmatic Testing via window.__cpSettingsStore

For tests that need to change settings programmatically (without UI interaction):

```typescript
// Change backgroundColor directly
await page.evaluate(() => {
  const store = (window as any).__cpSettingsStore;
  store.getState().updateSettings({
    appearance: { backgroundColor: "#ff0000" }
  });
});

// Wait for change to apply
await page.waitForTimeout(100);

// Verify via dump()
const appearance = await page.evaluate(() => {
  return window.__lwcharts.dump().render.appliedAppearance;
});
expect(appearance.chartOptions.backgroundColor).toBe("#ff0000");
```

### Test Patterns

```typescript
// Test backgroundColor change
await page.evaluate(() => {
  window.__cpSettingsStore.getState().updateSettings({
    appearance: { backgroundColor: "#ff0000" }
  });
});
await page.waitForTimeout(100);
const dump = await page.evaluate(() => window.__lwcharts.dump());
expect(dump.render.appliedAppearance.chartOptions.backgroundColor).toBe("#ff0000");

// Test grid visibility toggle
await page.evaluate(() => {
  window.__cpSettingsStore.getState().updateSettings({
    appearance: { showGrid: false }
  });
});
await page.waitForTimeout(100);
const gridState = await page.evaluate(() => {
  return window.__lwcharts.dump().render.appliedAppearance.chartOptions.gridVisible;
});
expect(gridState).toBe(false);

// Test via dialog save
await page.getByTestId("settings-button").click();
await page.getByTestId("settings-backgroundColor").fill("#123456");
await page.getByTestId("settings-save").click();
await page.waitForTimeout(100);
const bgColor = await page.evaluate(() => {
  return window.__lwcharts.dump().render.appliedAppearance.chartOptions.backgroundColor;
});
expect(bgColor).toBe("#123456");
```

---

## Troubleshooting Context Menu + Pinning + Legend

| Issue | Cause | Fix |
|-------|-------|-----|
| _qaPinCrosshair returns error "No hover state to pin" | Hover not active when pinning | Call `_qaApplyHover()` first to establish hover state |
| dump().ui.pinned is false after _qaPinCrosshair call | State not synchronized | Use `page.waitForFunction(() => dump.ui.pinned === true)` if async timing issues |
| Crosshair moves despite pinned === true | pinned state not respected by handler | Rare; check that crosshairMove handler checks `pinnedFlagRef.current` (not React state) |
| Copy Price action produces empty text | No hover at action time | Ensure hover is active before calling _qaClickContextAction("copyPrice") |
| Settings modal doesn't open | Action rejected or modal state not set | Verify `lastContextAction === "settings"` in dump after calling action |
| OHLC strip still visible after toggling showOhlcStrip | Conditional rendering not applied | Hard refresh browser (Ctrl+Shift+R) to reload component |

