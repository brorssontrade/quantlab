# ChartsPro — TradingView UI Parity Sprint Plan

**Goal:** Transform ChartsPro into a "TradingView-like" UI with proper layout, controls, and UX that feels professional and intuitive.

**Vision:** Chart is the hero (70–85% focus), panels are utilities, all controls are discoverable and contextual.

---

## Current State Assessment

### ✅ What We Have
- `Toolbar.tsx`: Symbol input, timeframe selector, drawing tools, theme toggle, magnet toggle
- `ChartViewport.tsx`: Full-height chart rendering, data loading, workspace layout
- `ContextMenu.tsx`: Right-click menu (basic)
- `IndicatorPanel.tsx`: Indicator management
- `AlertsPanel.tsx`: Alerts panel
- `ObjectTree.tsx`: Drawing object tree
- `OhlcStrip.tsx`: OHLC display
- dump() API: Comprehensive state introspection
- Workspace persistence: localStorage for layout

### ⚠️ What Needs Refactoring
- Toolbar is "all in one row" → needs grouping + wrapping strategy
- No separate "left toolbar" for drawing tools (mixed in topbar)
- Panels layout is basic → needs tab system + better organization
- No "quick ranges" (1D, 5D, 1M, 1Y) in UI
- Right-click menu not context-aware (drawing vs empty chart)
- Visual spacing inconsistent (too much whitespace)
- No settings panel/dialog yet
- No layout save/load naming UI

### 🔴 Known Gaps
- Symbol autocomplete (just plain input)
- Chart type selector (Candles/Line/Bars) not polished
- Replay/scrubber (UI only)
- Chart type UI not "Candles/Line/Bars" icon-based
- Left toolbar as vertical bar (not implemented yet)
- Scale toggles (Auto/Log/%) UI missing
- Market hours / timezone display missing
- Export UI not integrated into topbar

---

## Sprint Breakdown (Ordered by Dependency)

### **Phase 1: Topbar Architecture & Symbol Control** (Priority 1 – Foundation)

**Goal:** Establish "TradingView order" topbar with proper grouping.

#### 1.1 Refactor Toolbar into TopBar + ToolGroups
**File:** Create `quantlab-ui/src/features/chartsPro/components/TopBar/TopBar.tsx`
**Files to create:**
- `TopBar/TopBar.tsx` (main container, horizontal layout with groups)
- `TopBar/ToolGroup.tsx` (wrapper for logical groups)
- `TopBar/PrimaryControls.tsx` (symbol + timeframe, always visible)
- `TopBar/IndicatorControls.tsx` (indicators button)
- `TopBar/UtilityControls.tsx` (settings, save, export, etc.)

**Changes:**
- Group controls into 4 sections:
  1. **Primary**: Symbol search + Timeframe
  2. **ChartType**: Candles/Line/Bars icons
  3. **Indicators/Alerts**: Button group
  4. **Utilities**: Settings, Save, Snapshot, Replay (placeholder)
- Use CSS Grid or Flex with `flex-wrap` so topbar wraps on small screens
- Keep "Primary" always visible at top when wrapped
- Compact spacing: 4–8px between elements, 12px between groups

**Acceptance Criteria:**
- ✅ Topbar is organized into 4 logical groups
- ✅ On desktop (>1024px): all groups on one row, tight spacing
- ✅ On laptop (768–1024px): may wrap to 2 rows, Primary stays first
- ✅ On mobile (<768px): wraps as needed, Primary always visible
- ✅ No layout shift when toggling panels

#### 1.2 Implement Symbol Search with Autocomplete
**File:** `TopBar/SymbolSearch.tsx`
**Changes:**
- Input + dropdown list (v1: local hardcoded list OR fetch from backend if exists)
- Enter or click → fetch new OHLCV + update chart
- Show ticker + market code (e.g., "AAPL.US")
- Clear input on blur if not in list (optional v1)
- Emit `onSymbolChange(symbol)` with fully qualified symbol

**Acceptance Criteria:**
- ✅ Can type symbol name
- ✅ Shows 5–10 matching tickers in dropdown
- ✅ Enter or click fetches data + renders chart
- ✅ Autocomplete persists symbol in localStorage

#### 1.3 Timeframe Selector (Already exists, polish)
**File:** `TopBar/TimeframeSelector.tsx` (extract from Toolbar)
**Changes:**
- Button group with 1m, 5m, 15m, 1h, 4h, 1D, 1W
- Active button highlighted (TV-style)
- Click → fetch new data (via `onTimeframeChange`)
- Icon-based OR compact buttons
- Ensure `bar` parameter in backend fetch uses this value

**Acceptance Criteria:**
- ✅ All 7 timeframes clickable
- ✅ Active state clearly visible
- ✅ Fetch triggered on change
- ✅ dump().timeframe syncs

---

### **Phase 2: Left Toolbar (Drawing Tools)** (Priority 1 – Core UX)

**Goal:** Vertical toolbar on left with drawing tool selection.

#### 2.1 Create LeftToolbar Component
**File:** Create `quantlab-ui/src/features/chartsPro/components/LeftToolbar/LeftToolbar.tsx`
**Files to create:**
- `LeftToolbar/LeftToolbar.tsx` (vertical toolbar, sticky)
- `LeftToolbar/ToolButton.tsx` (icon + tooltip + active state)
- `LeftToolbar/ToolDivider.tsx` (visual separator)

**Structure:**
```
┌─────────────┐
│ ⊞ Select    │  cursor icon
│ ─ H-Line    │  horizontal line icon
│ │ V-Line    │  vertical line icon
│ ╱ Trend      │  trendline icon
│ ⬜ Channel   │  channel icon
├─────────────┤  divider
│ ⊙ Magnet    │  magnet icon (toggle)
├─────────────┤  divider
│ 🗑 Remove   │  trash icon (remove all drawings)
└─────────────┘
```

**Changes:**
- Always on left edge of chart viewport (position: sticky or absolute within workspace)
- Vertical orientation (icons stacked)
- Icon colors from theme
- Hover = tooltip (small, dark)
- Active tool = highlight border/glow
- Click → select tool + update dump().ui.activeTool
- Magnet = toggle (different visual: ON = full color, OFF = muted)

**Acceptance Criteria:**
- ✅ All 7 tools visible + clickable
- ✅ Active tool highlighted
- ✅ Tooltip on hover
- ✅ dump().ui.activeTool updates
- ✅ Magnet toggle reflects dump().render.magnet state
- ✅ On mobile: becomes floating pill (minimize) or bottom sheet

#### 2.2 Tool State & Keyboard Shortcuts
**File:** Extend `state/controls.ts` with keyboard handling
**Changes:**
- Add keyboard event listener in ChartViewport useEffect:
  - `Esc` → select "Select" tool
  - `H` → select "H-Line"
  - `V` → select "V-Line"
  - `T` → select "Trend"
  - `C` → select "Channel"
  - `M` → toggle Magnet
- On tool change: emit to drawing layer + update ui state
- If on input/textarea: skip shortcuts

**Acceptance Criteria:**
- ✅ Esc always returns to Select
- ✅ Shortcuts work only when chart is focused
- ✅ dump().ui.activeTool reflects current tool

---

### **Phase 3: Right Panel UX (Tabs + Object Tree)** (Priority 2 – Polish)

**Goal:** Consolidate Indicators/Objects/Alerts into tabbed panel with better UX.

#### 3.1 Create TabsPanel Component
**File:** Create `quantlab-ui/src/features/chartsPro/components/RightPanel/TabsPanel.tsx`
**Files to create:**
- `RightPanel/TabsPanel.tsx` (tabs container)
- `RightPanel/IndicatorsTab.tsx` (wrap existing IndicatorPanel)
- `RightPanel/ObjectsTab.tsx` (wrap existing ObjectTree)
- `RightPanel/AlertsTab.tsx` (wrap existing AlertsPanel)

**Structure:**
```
┌──────────────────────────┐
│ Indicators | Objects | Alerts │  (tab headers)
├──────────────────────────┤
│ (content for active tab) │
│                          │
│ [Add Indicator] [Search] │
│                          │
└──────────────────────────┘
```

**Changes:**
- Tabs at top: "Indicators", "Objects", "Alerts"
- Active tab highlighted (underline or background)
- Tab switch is instant (no animation, snappy)
- Each tab is its own component
- Persist active tab to localStorage: `cp.rightPanel.activeTab`

**Acceptance Criteria:**
- ✅ 3 tabs, all functional
- ✅ Tab switch is snappy (no lag)
- ✅ Active tab persisted
- ✅ On mobile: becomes overlay/drawer (same tabs)

#### 3.2 Improve ObjectTree (Drawing List)
**File:** Extend `components/ObjectTree.tsx`
**Changes:**
- Add column headers: Name | Type | Visible | Locked
- For each drawing: show toggle + lock icon + name
- Click on drawing name → highlight in chart (if not already)
- Right-click → mini context menu (Edit / Lock / Delete)
- Drag-to-reorder (v2, optional for v1)
- Search/filter by name (v2)

**Acceptance Criteria:**
- ✅ List shows all drawings with type + visibility
- ✅ Toggles work (hide/lock)
- ✅ Click selects drawing on chart
- ✅ Right-click opens context menu

#### 3.3 Improve AlertsPanel
**File:** Extend `components/AlertsPanel.tsx`
**Changes:**
- Show list of active alerts per symbol
- For each alert: status (Active/Triggered), price level, linked drawing
- Click alert → highlight linked drawing on chart
- "Create Alert" button opens modal/inline form
- Show last triggered time + count

**Acceptance Criteria:**
- ✅ Lists alerts with symbol + price + status
- ✅ Click shows linked drawing
- ✅ Create button works

---

### **Phase 4: Bottom Controls (Quick Ranges + Scale)** (Priority 2)

**Goal:** Add quick range selector + scale toggle at bottom of chart.

#### 4.1 Create BottomBar Component
**File:** Create `quantlab-ui/src/features/chartsPro/components/BottomBar/BottomBar.tsx`
**Files to create:**
- `BottomBar/BottomBar.tsx` (horizontal bar at bottom)
- `BottomBar/QuickRanges.tsx` (buttons: 1D, 5D, 1M, 1Y, All)
- `BottomBar/ScaleToggle.tsx` (Auto / Log)

**Structure:**
```
┌──────────────────────────────────────────┐
│ 1D  5D  1M  1Y  All  │  Auto  Log  │ UTC │
└──────────────────────────────────────────┘
```

**Changes:**
- Positioned at bottom of ChartViewport (sticky or inside workspace)
- Left: Quick range buttons (active = highlighted)
- Center: Scale toggle (Auto / Log)
- Right: Timezone indicator ("UTC", "RTH" label)

**Acceptance Criteria:**
- ✅ Quick range buttons work (change visible range)
- ✅ Scale toggle updates chart
- ✅ Minimal height (24–28px)
- ✅ On small screens: may wrap to 2 rows

#### 4.2 Quick Range Logic
**File:** Extend `state/controls.ts` or new `state/ranges.ts`
**Changes:**
- Add function: `getQuickRange(label: "1D" | "5D" | ...)` → returns `{start, end}` timestamps
- Call from TopBar quick range button
- Update `dump().render.visibleRange` when range changes
- V1: Front-end only (no new API call), just adjust visible range on existing data

**Acceptance Criteria:**
- ✅ 1D = last 1 calendar day
- ✅ 5D = last 5 days, etc.
- ✅ All = full dataset
- ✅ Clicking range updates chart viewport instantly

---

### **Phase 5: Context Menu (Contextual)** (Priority 2 – UX Polish)

**Goal:** Make right-click menu aware of what was clicked.

#### 5.1 Enhance ContextMenu
**File:** Extend `components/ContextMenu.tsx`
**Changes:**
- Detect: clicked on drawing vs empty chart
- If drawing selected → show: Edit | Lock/Unlock | Hide/Show | Delete | Create Alert from this
- If empty chart → show: Add Alert at price | Reset Scale | Fit Content | Toggle Crosshair | Export PNG/CSV
- Use event.target analysis or coordinate to determine if drawing hit

**Acceptance Criteria:**
- ✅ Menu changes based on what's clicked
- ✅ All actions functional
- ✅ Actions logged in Playwright tests

---

### **Phase 6: Settings & Layout Dialog** (Priority 3 – Polish)

**Goal:** Settings dialog for chart appearance + layout naming.

#### 6.1 Create SettingsDialog
**File:** Create `quantlab-ui/src/features/chartsPro/components/SettingsDialog.tsx`
**Changes:**
- Modal dialog with tabs or sections:
  - **Appearance**: Candle colors, background, grid visibility, gridstyle
  - **Layout**: Layout name input, save/load buttons, reset
  - **Advanced**: Crosshair mode, watermark, volume display, precision
- Submit → save to localStorage + apply to chart
- Cancel → no changes

**Acceptance Criteria:**
- ✅ Dialog opens from TopBar "Settings" button
- ✅ All toggles/inputs work
- ✅ Settings persist

#### 6.2 Layout Naming UI
**File:** Extend layout save logic
**Changes:**
- When clicking "Save layout": prompt for name (modal input)
- Store as: `cp.layouts.{name}` in localStorage
- Show list of saved layouts in settings
- Load/delete buttons for each saved layout
- "Reset to default" button

**Acceptance Criteria:**
- ✅ Can name and save layouts
- ✅ Can load saved layout
- ✅ Can delete layout

---

### **Phase 7: Visual Polish Pass** (Priority 3 – UX)

**Goal:** Make the whole UI feel tight and professional like TradingView.

#### 7.1 Spacing & Padding Standardization
**File:** Extend/create `styles/chartsPro.css` or `tailwind.config.ts`
**Changes:**
- Define spacing scale:
  - `--cp-gap-xs`: 4px (between toolbar elements)
  - `--cp-gap-sm`: 8px (between control groups)
  - `--cp-gap-md`: 12px (between major sections)
  - `--cp-pad-xs`: 4px (inside small containers)
  - `--cp-pad-sm`: 8px (inside panels)
- Apply consistently across all ChartsPro components
- Remove "card" padding in ChartsPro context (use minimal padding)
- Panel borders: subtle (1px, theme-aware color)

#### 7.2 Panel Width Constraints
**File:** ChartsPro layout CSS
**Changes:**
- Left toolbar: 44px (fixed)
- Right panel (docked): clamp(280px, 25vw, 420px) – max 420px
- Top bar: full width, height 40–44px
- Bottom bar: full width, height 24–28px
- Chart workspace: fills remaining space (edge-to-edge)

#### 7.3 Visual Separators & Borders
**File:** ChartsPro component styles
**Changes:**
- Top bar bottom border: 1px, theme.border
- Right panel left border: 1px, theme.border
- Bottom bar top border: 1px, theme.border
- Left toolbar right border: 1px, theme.border
- Use consistent `theme.divider` color

#### 7.4 Responsive Hiding
**File:** ChartsPro responsive logic
**Changes:**
- Desktop (>1440px): all panels docked, left toolbar visible
- Laptop (1024–1440px): right panel narrower, left toolbar visible
- Tablet (768–1024px): right panel overlay (slide-in), left toolbar overlay
- Mobile (<768px): all panels hidden by default, bottom drawer access

**Acceptance Criteria:**
- ✅ Consistent spacing throughout
- ✅ Panel widths sensible on all breakpoints
- ✅ Visual separators clear
- ✅ Feels "tight" and "TradingView-like"

---

### **Phase 8: Playwright Test Suite (TradingView UI Parity)** (Priority 3 – Regression Prevention)

**Goal:** Comprehensive tests to prevent regressions on layout/controls/UX.

#### 8.1 Create `chartsPro.tvUi.parity.spec.ts`
**File:** Create `quantlab-ui/tests/chartsPro.tvUi.parity.spec.ts`
**Tests to add:**

```typescript
// TopBar tests
test('Symbol change fetches new data and updates chart', async ({page}) => {
  // 1. Go to ChartsPro
  // 2. Enter new symbol (e.g., MSFT)
  // 3. Assert data loaded + candles visible
  // 4. Assert dump().symbol === 'MSFT'
});

test('Timeframe change updates data and OHLC strip', async ({page}) => {
  // 1. Change timeframe to 1h
  // 2. Assert fetch triggered
  // 3. Assert dump().timeframe === '1h'
  // 4. Assert OHLC strip reflects new candles
});

// Left toolbar tests
test('Tool selection updates dump().ui.activeTool', async ({page}) => {
  // 1. Click "Trend" tool in left toolbar
  // 2. Assert dump().ui.activeTool === 'trend'
  // 3. Click "Select"
  // 4. Assert dump().ui.activeTool === 'select'
});

test('Keyboard shortcuts select tools (H, V, T, C, Esc)', async ({page}) => {
  // 1. Press 'H' key
  // 2. Assert left toolbar highlights "H-Line"
  // 3. Press 'V'
  // 4. Assert highlights "V-Line"
  // 5. Press 'Esc'
  // 6. Assert returns to "Select"
});

test('Magnet toggle works and reflects in dump()', async ({page}) => {
  // 1. Click magnet icon
  // 2. Assert dump().render.magnet === true
  // 3. Click again
  // 4. Assert dump().render.magnet === false
});

// Right panel tests
test('Tabs switch between Indicators/Objects/Alerts', async ({page}) => {
  // 1. Click "Objects" tab
  // 2. Assert ObjectTree visible
  // 3. Click "Indicators" tab
  // 4. Assert IndicatorPanel visible
});

test('Bottom quick ranges change visible range', async ({page}) => {
  // 1. Click "1D" button
  // 2. Assert chart visible range compressed to 1 day
  // 3. Click "1M"
  // 4. Assert range expands
});

// Chart sizing tests
test('Chart remains visible (>400px height) when panels open', async ({page}) => {
  // 1. Open ChartsPro at desktop resolution
  // 2. Measure chart viewport height
  // 3. Assert height > 400px
});

test('On tablet, right panel overlays (not docks)', async ({page}) => {
  // 1. Set viewport to tablet (768x1024)
  // 2. Assert right panel is overlay (position: fixed/absolute)
  // 3. Assert chart still full-width behind panel
});

// Context menu tests
test('Right-click on empty chart shows chart context menu', async ({page}) => {
  // 1. Right-click on chart (no drawing)
  // 2. Assert menu includes "Add Alert at price" and "Reset Scale"
});

test('Right-click on drawing shows object context menu', async ({page}) => {
  // 1. Draw a line
  // 2. Right-click on line
  // 3. Assert menu includes "Lock" and "Delete"
});

// Layout persistence tests
test('Chart state persists on page reload', async ({page}) => {
  // 1. Set symbol to AAPL, timeframe to 1h
  // 2. Reload page
  // 3. Assert symbol and timeframe restored
});
```

**Acceptance Criteria:**
- ✅ All 15+ tests pass on Chrome/Chromium
- ✅ Tests cover symbol change, timeframe, tool selection, panel tabs, quick ranges, sizing, context menu, persistence

---

## Implementation Order (No Dependencies = Parallel)

### Week 1 (Foundation)
1. **Phase 1.1**: Refactor Toolbar → TopBar + ToolGroups
2. **Phase 1.2**: Symbol search + autocomplete
3. **Phase 2.1**: Left toolbar (drawing tools)

### Week 2 (UX Polish)
4. **Phase 2.2**: Keyboard shortcuts
5. **Phase 3.1**: Right panel tabs
6. **Phase 4.1**: Bottom bar (quick ranges + scale)
7. **Phase 5.1**: Contextual context menu

### Week 3 (Polish & Tests)
8. **Phase 6.1/6.2**: Settings + layout naming
9. **Phase 7**: Visual polish pass
10. **Phase 8.1**: Playwright test suite

---

## File Structure (New Files to Create)

```
quantlab-ui/src/features/chartsPro/
├── components/
│   ├── TopBar/
│   │   ├── TopBar.tsx          [NEW]
│   │   ├── ToolGroup.tsx        [NEW]
│   │   ├── PrimaryControls.tsx  [NEW]
│   │   ├── SymbolSearch.tsx     [NEW]
│   │   ├── TimeframeSelector.tsx [NEW]
│   │   ├── ChartTypeSelector.tsx [REFACTOR]
│   │   ├── IndicatorControls.tsx [NEW]
│   │   └── UtilityControls.tsx  [NEW]
│   ├── LeftToolbar/
│   │   ├── LeftToolbar.tsx      [NEW]
│   │   ├── ToolButton.tsx       [NEW]
│   │   └── ToolDivider.tsx      [NEW]
│   ├── RightPanel/
│   │   ├── TabsPanel.tsx        [NEW]
│   │   ├── IndicatorsTab.tsx    [NEW]
│   │   ├── ObjectsTab.tsx       [NEW]
│   │   └── AlertsTab.tsx        [NEW]
│   ├── BottomBar/
│   │   ├── BottomBar.tsx        [NEW]
│   │   ├── QuickRanges.tsx      [NEW]
│   │   └── ScaleToggle.tsx      [NEW]
│   ├── SettingsDialog.tsx       [NEW]
│   └── (existing files)
├── state/
│   ├── ranges.ts               [NEW] (quick range logic)
│   └── (existing files)
├── styles/
│   └── chartsPro.css          [NEW] (spacing standards + layout)
└── tests/
    └── chartsPro.tvUi.parity.spec.ts [NEW] (Playwright)
```

---

## Definition of Done (Per Phase)

### For Each Phase:
- ✅ All new components created + TypeScript strict
- ✅ Integration into ChartsProTab (props, handlers, state)
- ✅ localStorage persistence where needed
- ✅ Responsive design (desktop/tablet/mobile tested)
- ✅ dump() API includes new state fields
- ✅ npm run build succeeds (no errors)
- ✅ pytest passes (50/50)
- ✅ Relevant Playwright tests pass (tvParity suite)
- ✅ QA_CHARTSPRO.md updated with new contract
- ✅ No visual regressions (compare screenshots vs baseline)

---

## Measuring Success

### Checklist (Sprint Complete)
- [ ] **TopBar** organized into 4 groups, responsive wrapping
- [ ] **LeftToolbar** with 7 tools, keyboard shortcuts, Magnet toggle
- [ ] **RightPanel** with 3 tabs (Indicators/Objects/Alerts)
- [ ] **BottomBar** with quick ranges + scale toggles
- [ ] **ContextMenu** aware of chart vs drawing click
- [ ] **SettingsDialog** with appearance + layout naming
- [ ] **Visual polish**: tight spacing, consistent separators, edge-to-edge chart
- [ ] **ResponsiveDesign**: panels docked on desktop, overlay on tablet, drawer on mobile
- [ ] **Playwright suite**: 15+ tests, all passing
- [ ] **Build/Test gates**: green
- [ ] **No regressions**: tvParity 35/35 still passing

---

## Risk Mitigation

1. **Regression**: Maintain tvParity test suite, run before each merge
2. **Responsive chaos**: Define breakpoints early (use CSS variables), test at each breakpoint
3. **Panel widths fighting**: Use `clamp()` + `min-h-0` / `min-w-0` aggressively
4. **Performance**: dump() diagnostic API allows quick debugging
5. **localStorage corruption**: Validate JSON before parsing, fallback to defaults

---

## Next Immediate Action

**Start Phase 1.1**: Begin refactoring Toolbar into TopBar + ToolGroups.
This is the foundation for everything else.

Expected outcome: Topbar with 4 logical groups, responsive, backward-compatible.

