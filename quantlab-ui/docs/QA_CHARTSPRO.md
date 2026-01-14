# ChartsPro QA Contract

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

## Troubleshooting Context Menu + Pinning + Legend

| Issue | Cause | Fix |
|-------|-------|-----|
| _qaPinCrosshair returns error "No hover state to pin" | Hover not active when pinning | Call `_qaApplyHover()` first to establish hover state |
| dump().ui.pinned is false after _qaPinCrosshair call | State not synchronized | Use `page.waitForFunction(() => dump.ui.pinned === true)` if async timing issues |
| Crosshair moves despite pinned === true | pinned state not respected by handler | Rare; check that crosshairMove handler checks `pinnedFlagRef.current` (not React state) |
| Copy Price action produces empty text | No hover at action time | Ensure hover is active before calling _qaClickContextAction("copyPrice") |
| Settings modal doesn't open | Action rejected or modal state not set | Verify `lastContextAction === "settings"` in dump after calling action |
| OHLC strip still visible after toggling showOhlcStrip | Conditional rendering not applied | Hard refresh browser (Ctrl+Shift+R) to reload component |

