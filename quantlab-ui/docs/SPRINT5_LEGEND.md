# Sprint 5: Legend Overlay & Series Controls

## Overview
Implemented TradingView-style legend overlay with series visibility controls, solo mode, and customizable series styling (color, line width, line style).

## Components Added

### 1. `src/features/chartsPro/components/LegendOverlay.tsx`
- Renders TradingView-parity legend in top-left of chart
- 18-22px row height with tight spacing
- Hover state with semi-transparent row highlighting
- Click to toggle visibility, alt+click for solo mode
- Hover to reveal action buttons (settings, hide, remove)
- Keyboard: Alt+Click = solo, Ctrl+Click = remove compare

### 2. `src/features/chartsPro/components/SeriesSettingsModal.tsx`
- Color picker with 8 preset swatches + text input
- Line width dropdown (1-4)
- Line style selector (solid/dashed/dotted)
- Save/Cancel buttons with localStorage persistence

### 3. `src/features/chartsPro/utils/legendModel.ts`
- `loadLegendVisibility()` — restore from localStorage
- `persistLegendVisibility()` — save to localStorage
- `loadSeriesStyles()` — restore series overrides
- `persistSeriesStyles()` — save series overrides
- Helper: `hexToRgba()` for color conversion

## State Management in ChartViewport

- `legendHoverId: string | null` — current hover ID
- `legendSoloId: string | null` — solo mode ID  
- `legendVisibility: Record<string, boolean>` — show/hide per series
- `seriesStyles: Record<string, SeriesStyle>` — color/width/lineStyle overrides
- `openSeriesSettingsId: string | null` — which series has modal open
- `legendSoloStateRef` — backup of visibility state before entering solo

## Dump Schema Extensions

### New `dump().ui` fields
- `legendHoverId: string | null` — ID of hovered legend row
- `legendSoloId: string | null` — ID in solo mode (null = normal)
- `legendVisibility: Record<string, boolean>` — visibility state

### New `dump().render` fields
- `legendRows: Array<{id, symbol, isBase, visible, lastValue, colorHint, orderIndex}>` — current legend data
- `seriesStyles: Array<{id, colorHint, width, lineStyle}>` — current style overrides

## QA Primitives (5 functions)

All exposed on `window.__lwcharts` when `?mock=1`:

1. **`_qaLegendHover(id: string | null) -> {ok, legendHoverId}`**
   - Sets hover state for visual dimming
   - `null` clears hover

2. **`_qaLegendToggle(id: string) -> {ok, id}`**
   - Toggles series visibility on/off

3. **`_qaLegendSolo(id: string | null) -> {ok, soloId}`**
   - Enter solo mode for specified ID
   - `null` exits solo and restores previous visibility

4. **`_qaOpenSeriesSettings(id: string) -> {ok, id}`**
   - Opens modal for styling series

5. **`_qaSetSeriesStyle(id: string, style: {colorHint?, width?, lineStyle?}) -> {ok, id, style}`**
   - Directly apply style without modal
   - Partial updates merge with existing

## Files Changed

- **Modified**: `src/features/chartsPro/components/ChartViewport.tsx`
  - Added legend state hooks
  - Integrated LegendOverlay component
  - Wired all handlers (hover, toggle, solo, settings, reorder)
  - Extended dump() schema
  - Added 5 QA primitives to testingApi
  - Added localStorage persistence effects

- **Created**: 
  - `src/features/chartsPro/components/LegendOverlay.tsx` (180 lines)
  - `src/features/chartsPro/components/SeriesSettingsModal.tsx` (170 lines)
  - `src/features/chartsPro/utils/legendModel.ts` (100 lines)
  - `tests/chartsPro.legendParity.spec.ts` (350 lines, 15 tests)

## Test Coverage

**All 15 tests passing (100% success rate)**:

1. API readiness: all 5 legend QA primitives present
2. Legend overlay renders with base series initially
3. _qaLegendHover sets and clears legendHoverId
4. _qaLegendToggle works without errors
5. _qaLegendSolo works without errors
6. _qaOpenSeriesSettings opens modal
7. _qaSetSeriesStyle works without errors
8. Multiple style operations work
9. Legend state survives viewport re-renders
10. dump.render.legendRows has correct structure
11. Chart still renders without errors after Legend Overlay addition
12. Compare toolbar still functional
13. Inspector sidebar still works
14. Legend interactions do not break existing chart features
15. Legend state resets correctly when changing symbols

**Execution**: ~28 seconds for full test suite (Playwright headless chromium)

## Regression Testing (Sprints 2-4)

- Chart rendering: ✅ No errors introduced
- Compare functionality: ✅ Toolbar operational
- Inspector: ✅ Still toggleable
- Chart hover: ✅ _qaApplyHover still works
- Crosshair/pinning: ✅ Sprint 4 features preserved
- Context menu: ✅ Still operable

## Persistence

Legend state is automatically saved/restored:
- **localStorage keys**:
  - `ql/chart.legend.visibility` → `{[seriesId]: boolean}`
  - `ql/chart.legend.seriesStyles` → `{[seriesId]: {colorHint, width, lineStyle}}`
- **Scope**: Per-browser (not per-symbol; applies globally across symbols)

## Browser Compatibility

- Legend overlay CSS: Flexbox, CSS Grid (IE11+, all modern)
- Color picker: HTML5 input[type="color"] with fallback swatches
- Modal: Standard React modal with Tailwind styling

## Known Limitations

- Reorder (drag-drop): Implemented in QA primitive `_qaLegendReorder()` but UI drag handler not fully wired
- Series styles don't propagate to exported PNG (chart export uses default colors)
- Legend overlay doesn't scroll if >15 series (would need scrollable container)

## DoD Checklist

- [x] LegendOverlay component renders and displays all series
- [x] SeriesSettingsModal opens/closes correctly
- [x] All 5 QA primitives exposed and callable
- [x] dump() schema includes legendRows and seriesStyles
- [x] Visibility and styles persist to localStorage
- [x] No TypeScript errors (npm run build passes)
- [x] All 15 tests passing
- [x] No regressions in existing features
- [x] Code follows existing patterns and conventions
- [x] Documentation updated (this file + QA_CHARTSPRO.md)
