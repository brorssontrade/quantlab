# TV-9 BottomBar Implementation — Complete

**Date:** 2025-01-21 (Day 21)  
**Sprint:** ChartsPro TradingView UI (TVUI)  
**Status:** ✅ **COMPLETE**

---

## Scope

Implement TradingView-style BottomBar with:

1. **Quick Ranges** — 1D, 5D, 1M, 6M, YTD, 1Y, All (instant viewport updates)
2. **Scale Toggles** — Auto, Log, %, ADJ (visual state toggles; ADJ disabled for now)
3. **Timezone + Clock** — UTC/Local selector + HH:MM:SS live clock (updates every second)
4. **Persistens** — localStorage for range + scaleMode (`cp.bottomBar.*`)
5. **dump() Exposure** — `dump().ui.bottomBar` with rangeKey, scaleMode, tzMode, clockText
6. **Deterministic Tests** — 13 tests (repeat-each=10 for idempotence)

---

## Implementation

### Files Created

| File | Purpose |
|------|---------|
| `quantlab-ui/src/features/chartsPro/components/BottomBar.tsx` | Main BottomBar component (quick ranges, toggles, clock) |
| `quantlab-ui/tests/chartsPro.tvUi.bottomBar.spec.ts` | 13 Playwright tests (behavior, persist, responsive, deterministic) |

### Files Modified

| File | Change |
|------|--------|
| `quantlab-ui/src/features/chartsPro/ChartsProTab.tsx` | Import BottomBar, add chartRef, pass chart + lastBarTime |
| `quantlab-ui/src/features/chartsPro/components/ChartViewport.tsx` | Add `onChartReady` callback to expose IChartApi |

---

## Features

### A) Quick Ranges
- **Buttons:** 1D, 5D, 1M, 6M, YTD, 1Y, All (left-aligned)
- **Logic:** Uses `chart.timeScale().setVisibleRange()` with deterministic calculations:
  - `1D/5D/1M/1Y`: lastBarTime minus N days (seconds)
  - `YTD`: Jan 1 of current year to lastBarTime
  - `All`: `chart.timeScale().fitContent()`
- **State:** Selected range highlighted with purple background (`bg-purple-600`)
- **Persistence:** Stored in `cp.bottomBar.range` (loaded on mount)

### B) Scale Toggles
- **Modes:** Auto, Log, %, ADJ (center-aligned, bordered)
- **State:** Active mode has blue background (`bg-blue-600`)
- **Logic:** Updates `displayMode` state (callback `onScaleModeChange` for future chart integration)
- **ADJ:** Disabled (greyed out, `cursor-not-allowed`) — placeholder for future dividend-adjusted pricing
- **Persistence:** Stored in `cp.bottomBar.scaleMode`

### C) Timezone + Clock
- **Timezone Label:** Shows "UTC" or "Local" (data-testid=`bottombar-tz`)
- **Clock:** Live HH:MM:SS display (updated every second via setInterval)
- **Format:** Uses `Intl.DateTimeFormat` with proper timezone handling
- **Styling:** Monospace font, right-aligned

### D) Persistens
- **Keys:**
  - `cp.bottomBar.range` → Selected range (1D/5D/1M/6M/YTD/1Y/All)
  - `cp.bottomBar.scaleMode` → Active scale mode (auto/log/percent/adj)
- **Load:** On component mount (useEffect)
- **Save:** On every range/mode change
- **Validation:** Sanitizes stored values (only accepts valid range keys / mode strings)

### E) dump() Exposure
- **Path:** `dump().ui.bottomBar`
- **Fields:**
  - `rangeKey` → Current range (string)
  - `scaleMode` → Current mode (string)
  - `tzMode` → Timezone ("UTC" | "Local")
  - `clockText` → Current clock display (string, e.g., "08:15:42")
- **Mechanism:** Uses `window.__lwcharts._applyPatch()` with partial patch on state change

---

## Tests (13 total)

### Functional Tests (8)

1. **TV-9.1** — BottomBar renders with all 7 quick range buttons ✅
2. **TV-9.2** — Range click changes selected state (1D → 5D) ✅
3. **TV-9.3** — Scale toggles render (Auto, Log, %, ADJ); ADJ disabled ✅
4. **TV-9.4** — Scale toggle click changes mode (Auto → Log) ✅
5. **TV-9.5** — Clock displays time in HH:MM:SS format ✅
6. **TV-9.6** — Range selection persists in localStorage (6M reload test) ✅
7. **TV-9.7** — Scale mode persists in localStorage (percent reload test) ✅
8. **TV-9.8** — dump().ui.bottomBar exposes state correctly ✅

### Responsive Tests (3)

1. **TV-9.R1** — BottomBar visible on mobile (375px) ✅
2. **TV-9.R2** — BottomBar visible on tablet (768px) ✅
3. **TV-9.R3** — BottomBar visible on desktop (1920px) ✅

### Deterministic Tests (2)

1. **TV-9.D1** — Range click is idempotent (5 consecutive clicks on 1Y) ✅
2. **TV-9.D2** — Scale toggle is idempotent (5 consecutive clicks on percent) ✅

**Total:** 13 tests (--repeat-each=10 for deterministic suite)

---

## Integration

### tv-shell Grid Layout

```css
.tv-shell {
  display: grid;
  grid-template-columns: auto 1fr auto; /* leftbar, chart, rightbar */
  grid-template-rows: auto 1fr auto;    /* topbar, chart, bottombar */
  min-height: 0;
}

.tv-bottombar {
  grid-column: 1 / -1; /* Full width */
  grid-row: 3;
  min-height: 0;       /* Allows flex shrink */
}
```

### Props Flow

```
ChartsProTab
  ├─ chartRef (useRef<IChartApi>)
  ├─ ChartViewport
  │   └─ onChartReady={(chart) => chartRef.current = chart}
  └─ BottomBar
      ├─ chart={chartRef.current}
      ├─ lastBarTime={data[data.length - 1].time (unix seconds)}
      └─ timezone="UTC"
```

### Data Flow

1. ChartViewport creates chart → calls `onChartReady(chart)`
2. ChartsProTab stores chart in `chartRef.current`
3. BottomBar receives chart reference
4. Range click → `chart.timeScale().setVisibleRange({ from, to })`
5. Clock updates every second via setInterval
6. All state changes → persist to localStorage + update dump()

---

## Edge Cases Handled

1. **Chart not ready:** BottomBar renders even if `chart === null` (defensive checks before calling chart APIs)
2. **No data:** lastBarTime undefined → range buttons disabled or no-op (graceful degradation)
3. **Invalid localStorage:** Sanitizes stored range/mode (only accepts valid values)
4. **ADJ mode:** Clearly disabled with tooltip ("ADJ: coming soon")
5. **Clock precision:** Timezone switch updates clock immediately (no stale display)

---

## Known Limitations (Non-Blocking)

1. **ADJ mode:** Not implemented (requires dividend-adjusted price data from backend)
2. **Scale mode integration:** Toggles update state but don't yet modify chart scale (future: link to chart priceScale options)
3. **YTD edge case:** Uses Jan 1 00:00:00 (may need adjustment for markets with non-standard calendar years)
4. **Responsive compact layout:** BottomBar uses flex wrapping (may overflow on very small screens <320px; acceptable for MVP)

---

## Verification

### Pre-Flight Gates

| Gate | Command | Result |
|------|---------|--------|
| Frontend build | `npm run build` | ✅ **PASS** (6.95s, no errors) |
| Backend tests | `pytest tests/ -v` | ✅ **PASS** (50 passed) |
| tvParity | `npx playwright test tests/chartsPro.tvParity.spec.ts` | ✅ **PASS** (35 tests) |
| CP2 + CP7 | `npx playwright test tests/chartsPro.cp2.spec.ts tests/chartsPro.cp7.spec.ts` | ✅ **PASS** (2 tests) |
| BottomBar tests | `npx playwright test tests/chartsPro.tvUi.bottomBar.spec.ts` | ✅ **PASS** (13 tests) |

### Visual Verification

- URL: `http://localhost:5173/?mock=1#chartspro`
- ✅ BottomBar renders at bottom of tv-shell
- ✅ Quick ranges clickable (1D/5D/1M/6M/YTD/1Y/All)
- ✅ Scale toggles clickable (Auto/Log/% active, ADJ disabled)
- ✅ Clock displays live time
- ✅ No console errors
- ✅ No layout jank or overflow

---

## Next Steps

1. **TV-10 ContextMenu** — Enhance context menu with drawing detection (Edit/Lock/Hide/Delete)
2. **TV-11 Settings Dialog** — Chart settings (theme, scale mode, crosshair, etc.)
3. **Scale Mode Integration** — Wire BottomBar scale toggles to chart priceScale (auto/log/percent)
4. **ADJ Mode** — Backend support for dividend-adjusted prices (requires EODHD dividend API)

---

## Docs Updated

- ✅ This file (TV9_IMPLEMENTATION.md)
- 🔄 LLM_TASKS.md (TV-9 completion log pending)
- 🔄 FILE_INDEX.md (BottomBar.tsx entry pending)
- 🔄 CHARTSPRO_TVUI_KANBAN.md (TV-9 status → DONE pending)

---

**Author:** GitHub Copilot (AI Coding Agent)  
**Model:** Claude Sonnet 4.5  
**Review:** Ready for code review + merge
