/**
 * Centralized test selectors for ChartsPro tests
 * 
 * This file contains all data-testid values and common locator patterns.
 * Tests should import from here to avoid selector rot when UI changes.
 * 
 * Updated: 2026-01-30 (PRIO2 TopControls migration)
 */

import type { Page } from "@playwright/test";

// ============================================================================
// TopBar / Header Selectors (TVCompactHeader in workspace mode)
// ============================================================================
export const TOPBAR = {
  // Symbol search (PRIO2: symbol shows as chip, click to edit)
  symbolChip: '[data-testid="tv-symbol-chip"]',
  symbolInput: '[data-testid="topbar-symbol-input"]',
  symbolDropdown: '[data-testid="symbol-dropdown"]',
  
  // Timeframe selector
  timeframeButton: '[data-testid="timeframe-button"]',
  timeframeDropdown: '[data-testid="timeframe-dropdown"]',
  timeframeItem: (tf: string) => `[data-testid="timeframe-item-${tf}"]`,
  
  // Chart type
  chartTypeButton: '[data-testid="chart-type-button"]',
  chartTypeDropdown: '[data-testid="chart-type-dropdown"]',
  chartTypeItem: (type: string) => `[data-testid="chart-type-${type}"]`,
  
  // Compare controls (TopControls in workspace mode)
  controls: '[data-testid="topbar-controls"]',
  scaleModeToggle: '[data-testid="topbar-scale-mode-toggle"]',
  compareInput: '[data-testid="topbar-compare-input"]',
  compareTimeframe: '[data-testid="topbar-compare-tf"]',
  compareMode: '[data-testid="topbar-compare-mode"]',
  compareAddBtn: '[data-testid="topbar-compare-add-btn"]',
  compareChip: (symbol: string) => `[data-testid="topbar-compare-chip-${symbol.toLowerCase().replace(/\./g, "-")}"]`,
  
  // Overlay toggles
  overlayVolume: '[data-testid="topbar-overlay-volume"]',
  overlayMa20: '[data-testid="topbar-overlay-ma20"]',
  overlayMa50: '[data-testid="topbar-overlay-ma50"]',
  overlayMa200: '[data-testid="topbar-overlay-ma200"]',
  overlayBb: '[data-testid="topbar-overlay-bb"]',
  overlayVwap: '[data-testid="topbar-overlay-vwap"]',
  
  // Inspector toggle
  inspectorToggle: '[data-testid="topbar-inspector-toggle"]',
  
  // Right panel actions
  indicatorsBtn: '[data-testid="topbar-indicators-btn"]',
  alertsBtn: '[data-testid="topbar-alerts-btn"]',
  objectsBtn: '[data-testid="topbar-objects-btn"]',
  panelsBtn: '[data-testid="topbar-panels-btn"]',
  
  // Utility controls (in UtilsMenu dropdown)
  utilsMenuBtn: '[data-testid="utils-menu-button"]',
  utilsMenu: '[data-testid="utils-menu"]',
  magnetBtn: '[data-testid="utils-magnet-btn"]',
  snapBtn: '[data-testid="utils-snap-btn"]',
  saveLayoutBtn: '[data-testid="utils-save-layout"]',
  loadLayoutBtn: '[data-testid="utils-load-layout"]',
  exportPngBtn: '[data-testid="utils-export-png"]',
  exportCsvBtn: '[data-testid="utils-export-csv"]',
  reloadBtn: '[data-testid="utils-reload-btn"]',
  
  // Legacy icons (may be deprecated)
  saveLayoutIcon: '[data-testid="topbar-save-layout-icon"]',
  loadLayoutIcon: '[data-testid="topbar-load-layout-icon"]',
  exportPngIcon: '[data-testid="topbar-export-png-icon"]',
  exportCsvIcon: '[data-testid="topbar-export-csv-icon"]',
  
  // Theme toggle (icon button in workspace mode)
  themeToggle: '[data-testid="theme-toggle-button"]',
  
  // Theme options (deprecated in favor of themeToggle)
  themeDark: '[data-testid="topbar-theme-dark"]',
  themeLight: '[data-testid="topbar-theme-light"]',
} as const;

// ============================================================================
// Legacy Compare Toolbar (shown when hideToolbar=false, non-workspace mode)
// ============================================================================
export const COMPARE_TOOLBAR = {
  scaleModeToggle: '[data-testid="compare-scale-mode-toggle"]',
  addSymbol: '[data-testid="compare-add-symbol"]',
  addTimeframe: '[data-testid="compare-add-timeframe"]',
  addMode: '[data-testid="compare-add-mode"]',
  addSubmit: '[data-testid="compare-add-submit"]',
  chipTimeframe: (symbol: string) => `[data-testid="compare-${symbol.toLowerCase().replace(/\./g, "-")}-timeframe"]`,
  chipMode: (symbol: string) => `[data-testid="compare-${symbol.toLowerCase().replace(/\./g, "-")}-mode"]`,
} as const;

// ============================================================================
// TV Layout Shell
// ============================================================================
export const TV_SHELL = {
  root: '[data-testid="tv-shell"]',
  header: '[data-testid="tv-header"]',
  leftbar: '[data-testid="tv-leftbar"]',
  chartRoot: '[data-testid="tv-chart-root"]',
  rightbar: '[data-testid="tv-rightbar"]',
  bottombar: '[data-testid="tv-bottombar"]',
  
  // Header actions
  compareBtn: '[data-testid="tv-compare-btn"]',
  themeBtn: '[data-testid="tv-theme-btn"]',
  fullscreenBtn: '[data-testid="tv-fullscreen-btn"]',
} as const;

// ============================================================================
// Left Toolbar (Drawing tools)
// ============================================================================
export const LEFT_TOOLBAR = {
  root: '[data-testid="left-toolbar"]',
  selectTool: '[data-testid="tool-select"]',
  crosshairTool: '[data-testid="tool-crosshair"]',
  hlineTool: '[data-testid="tool-hline"]',
  trendlineTool: '[data-testid="tool-trendline"]',
  fibTool: '[data-testid="tool-fib"]',
  rectTool: '[data-testid="tool-rect"]',
  textTool: '[data-testid="tool-text"]',
  
  // Tool groups
  lineGroup: '[data-testid="toolgroup-lines"]',
  fibGroup: '[data-testid="toolgroup-fib"]',
  shapeGroup: '[data-testid="toolgroup-shapes"]',
  measureGroup: '[data-testid="toolgroup-measure"]',
  annotationGroup: '[data-testid="toolgroup-annotation"]',
} as const;

// ============================================================================
// Right Panel (Indicators, Objects, Alerts tabs)
// ============================================================================
export const RIGHT_PANEL = {
  root: '[data-testid="rightpanel-root"]',
  indicatorsTab: '[data-testid="rightpanel-tab-indicators"]',
  objectsTab: '[data-testid="rightpanel-tab-objects"]',
  alertsTab: '[data-testid="rightpanel-tab-alerts"]',
  collapseBtn: '[data-testid="rightpanel-collapse-btn"]',
  expandBtn: '[data-testid="rightpanel-expand-btn"]',
  tabs: '[data-testid="rightpanel-tabs"]',
  content: '[data-testid="rightpanel-content"]',
  
  // Indicators tab (V2)
  indicatorsTabV2: '[data-testid="indicators-tab-v2"]',
  addIndicatorBtn: '[data-testid="indicators-add-btn"]',
  indicatorsEmpty: '[data-testid="indicators-empty"]',
  indicatorList: '[data-testid="indicator-list"]',
  indicatorRow: (id: string) => `[data-testid="indicator-row-${id}"]`,
  indicatorEye: (id: string) => `[data-testid="indicator-eye-${id}"]`,
  indicatorEdit: (id: string) => `[data-testid="indicator-edit-${id}"]`,
  indicatorRemove: (id: string) => `[data-testid="indicator-remove-${id}"]`,
  indicatorParam: (id: string, key: string) => `[data-testid="indicator-param-${id}-${key}"]`,
  
  // Objects tab
  objectsTable: '[data-testid="objects-table"]',
  objectRow: (id: string) => `[data-testid="object-row-${id}"]`,
  
  // Alerts tab  
  createAlertBtn: '[data-testid="create-alert-btn"]',
  alertsList: '[data-testid="alerts-list"]',
  alertRow: (id: string) => `[data-testid="alert-row-${id}"]`,
} as const;

// ============================================================================
// Indicators Modal V3 (PRIO 3)
// ============================================================================
export const INDICATORS_MODAL = {
  root: '[data-testid="indicators-modal"]', // V3 uses "indicators-modal"
  search: '[data-testid="indicators-modal-search"]',
  close: '[data-testid="indicators-modal-close"]',
  
  // Categories (V3 uses kebab-case)
  categoryAll: '[data-testid="category-all"]',
  categoryMovingAverage: '[data-testid="category-moving-average"]',
  categoryMomentum: '[data-testid="category-momentum"]',
  categoryVolatility: '[data-testid="category-volatility"]',
  categoryVolume: '[data-testid="category-volume"]',
  categoryTrend: '[data-testid="category-trend"]',
  categoryFavorites: '[data-testid="category-favorites"]',
  categoryRecent: '[data-testid="category-recent"]',
  category: (cat: string) => `[data-testid="category-${cat}"]`,
  
  // Indicator items (V3: click row or use add button)
  indicatorItem: (id: string) => `[data-testid="indicator-add-btn-${id}"]`,
  indicatorRow: (id: string) => `[data-testid="indicators-modal-add-${id}"]`,
  
  // Indicator IDs for quick reference
  INDICATOR_IDS: ["sma", "ema", "rsi", "macd", "bb", "atr", "adx", "vwap", "avwap", "obv"] as const,
} as const;

// ============================================================================
// Bottom Bar (Quick ranges, scale toggles, clock)
// ============================================================================
export const BOTTOM_BAR = {
  root: '[data-testid="tv-bottombar"]',
  
  // Quick ranges
  range1D: '[data-testid="range-1D"]',
  range5D: '[data-testid="range-5D"]',
  range1M: '[data-testid="range-1M"]',
  range3M: '[data-testid="range-3M"]',
  range6M: '[data-testid="range-6M"]',
  rangeYTD: '[data-testid="range-YTD"]',
  range1Y: '[data-testid="range-1Y"]',
  range5Y: '[data-testid="range-5Y"]',
  rangeAll: '[data-testid="range-All"]',
  
  // Scale toggles
  autoScaleBtn: '[data-testid="auto-scale-btn"]',
  logScaleBtn: '[data-testid="log-scale-btn"]',
  percentScaleBtn: '[data-testid="percent-scale-btn"]',
  
  // Clock
  clock: '[data-testid="bottom-clock"]',
} as const;

// ============================================================================
// ChartsPro Core
// ============================================================================
export const CHARTS_PRO = {
  root: '.chartspro-root',
  surface: '.chartspro-surface',
  priceCanvas: '.chartspro-price canvas',
  lwCharts: '.tv-lightweight-charts',
  
  // Legend
  legend: '[data-testid="legend-overlay"]',
  legendRow: (symbol: string) => `[data-testid="legend-row-${symbol}"]`,
  legendVisibility: (symbol: string) => `[data-testid="legend-visibility-${symbol}"]`,
  legendSettings: (symbol: string) => `[data-testid="legend-settings-${symbol}"]`,
  
  // OHLC Strip
  ohlcStrip: '[data-testid="ohlc-strip"]',
  ohlcSymbol: '[data-testid="ohlc-symbol"]',
  ohlcTimeframe: '[data-testid="ohlc-timeframe"]',
  ohlcOpen: '[data-testid="ohlc-open"]',
  ohlcHigh: '[data-testid="ohlc-high"]',
  ohlcLow: '[data-testid="ohlc-low"]',
  ohlcClose: '[data-testid="ohlc-close"]',
  ohlcVolume: '[data-testid="ohlc-volume"]',
  
  // Crosshair
  crosshairPricePill: '[data-testid="crosshair-price-pill"]',
  crosshairTimePill: '[data-testid="crosshair-time-pill"]',
  
  // Inspector panel
  inspectorPanel: '[data-testid="inspector-panel"]',
  inspectorToggleBtn: '[data-testid="chartspro-inspector-toggle"]',
} as const;

// ============================================================================
// Settings Dialog (TV-23.1: Now a modal dialog, not a panel)
// ============================================================================
export const SETTINGS = {
  button: '[data-testid="settings-button"]',
  
  // OLD: settings-panel (deprecated - was side panel)
  // NEW: Settings is a modal dialog accessed via ModalPortal
  dialogOverlay: '[data-testid="modal-overlay"]',
  dialogContent: '[data-modal-kind="settings"]',
  
  // For legacy tests expecting settings-panel
  panel: '[data-modal-kind="settings"]', // Alias for dialog
  closeBtn: '[data-testid="settings-close"]',
  
  // Tabs in SettingsDialog
  tabAppearance: '[data-testid="settings-tab-appearance"]',
  tabLayout: '[data-testid="settings-tab-layout"]',
  tabAdvanced: '[data-testid="settings-tab-advanced"]',
  
  // Appearance controls (in SettingsDialog)
  candleUpColor: '[data-testid="settings-candle-up-color"]',
  candleDownColor: '[data-testid="settings-candle-down-color"]',
  wickColor: '[data-testid="settings-wick-color"]',
  wickVisible: '[data-testid="settings-wick-visible"]',
  gridVisible: '[data-testid="settings-grid-visible"]',
  
  // Scale mode radios (in SettingsDialog)
  scaleLinear: '[data-testid="settings-scale-linear"]',
  scaleLog: '[data-testid="settings-scale-log"]',
  scalePercent: '[data-testid="settings-scale-percent"]',
  
  // Dialog buttons
  saveBtn: '[data-testid="settings-save"]',
  cancelBtn: '[data-testid="settings-cancel"]',
  resetBtn: '[data-testid="settings-reset"]',
} as const;

// ============================================================================
// Modals
// ============================================================================
export const MODALS = {
  // Indicator search modal
  indicatorSearch: '[data-testid="indicator-search-modal"]',
  indicatorSearchInput: '[data-testid="indicator-search-input"]',
  indicatorSearchList: '[data-testid="indicator-search-list"]',
  indicatorSearchItem: (id: string) => `[data-testid="indicator-search-item-${id}"]`,
  
  // Alert form modal
  alertForm: '[data-testid="alert-form-modal"]',
  alertFormSubmit: '[data-testid="alert-form-submit"]',
  alertFormCancel: '[data-testid="alert-form-cancel"]',
  
  // Settings modal
  seriesSettings: '[data-testid="series-settings-modal"]',
  
  // Renko settings modal
  renkoSettings: '[data-testid="renko-settings-modal"]',
  renkoModeAuto: '[data-testid="renko-mode-auto"]',
  renkoModeFixed: '[data-testid="renko-mode-fixed"]',
  renkoSave: '[data-testid="renko-save"]',
  renkoCancel: '[data-testid="renko-cancel"]',
} as const;

// ============================================================================
// Context Menu
// ============================================================================
export const CONTEXT_MENU = {
  root: '[data-testid="context-menu"]',
  copyPrice: '[data-testid="context-copy-price"]',
  addAlert: '[data-testid="context-add-alert"]',
  settings: '[data-testid="context-settings"]',
  toggleCrosshair: '[data-testid="context-toggle-crosshair"]',
  toggleOhlc: '[data-testid="context-toggle-ohlc"]',
} as const;

// ============================================================================
// Tab Navigation
// ============================================================================
export const TABS = {
  charts: '[data-testid="tab-charts"]',
  hotlists: '[data-testid="tab-hotlists"]',
  screener: '[data-testid="tab-screener"]',
  fundamentals: '[data-testid="tab-fundamentals"]',
} as const;

// ============================================================================
// Helper functions for common patterns
// ============================================================================

/**
 * Wait for chart to be ready with data
 */
export async function waitForChartReady(page: Page, opts: { timeout?: number } = {}) {
  await page.waitForFunction(() => {
    const dump = (window as any).__lwcharts?.dump?.();
    return dump && dump.render?.pricePoints > 0;
  }, { timeout: opts.timeout ?? 15000 });
}

/**
 * Wait for compare symbol to be ready
 */
export async function waitForCompareReady(page: Page, symbol: string, opts: { timeout?: number } = {}) {
  await page.waitForFunction((sym) => {
    const dump = (window as any).__lwcharts?.dump?.();
    return dump?.data?.compareStatusBySymbol?.[sym]?.status === "ready";
  }, symbol, { timeout: opts.timeout ?? 15000 });
}

/**
 * Get dump() from __lwcharts
 */
export async function getDump(page: Page) {
  return page.evaluate(() => (window as any).__lwcharts?.dump?.());
}

/**
 * Use set() on __lwcharts
 */
export async function chartSet(page: Page, patch: Record<string, unknown>) {
  return page.evaluate((p) => (window as any).__lwcharts?.set?.(p), patch);
}

/**
 * Open indicators modal via TopBar button (always visible, deterministic)
 * This is the preferred method over RightPanel button which may not be visible
 */
export async function openIndicatorsModal(page: Page) {
  const indicatorsBtn = page.locator(TOPBAR.indicatorsBtn);
  await indicatorsBtn.click();
  // Wait for modal to be visible
  await page.locator(INDICATORS_MODAL.root).waitFor({ state: "visible", timeout: 5000 });
}

/**
 * Add an indicator via the indicators modal
 * Opens modal via TopBar, searches for indicator, clicks to add
 */
export async function addIndicatorViaModal(page: Page, kind: string) {
  await openIndicatorsModal(page);
  // Search for the indicator
  const search = page.locator(INDICATORS_MODAL.search);
  await search.fill(kind);
  // Click the indicator item (use indicatorRow which matches actual modal testid)
  await page.locator(INDICATORS_MODAL.indicatorRow(kind.toLowerCase())).click();
  // Wait for modal to close
  await page.locator(INDICATORS_MODAL.root).waitFor({ state: "hidden", timeout: 5000 });
}

/**
 * Wait for an indicator to be computed and have values
 */
export async function waitForIndicator(page: Page, kind: string, opts: { timeout?: number } = {}) {
  await page.waitForFunction(
    (k) => {
      const dump = (window as any).__lwcharts?.dump?.();
      const indicators = dump?.indicators ?? [];
      return indicators.some((ind: any) => 
        ind.kind === k && 
        ind.lines?.some((line: any) => (line.valuesCount ?? line.values?.length ?? 0) > 0)
      );
    },
    kind,
    { timeout: opts.timeout ?? 10000 }
  );
}

/**
 * Add compare via TopControls (workspace mode)
 */
export async function addCompareViaTopbar(
  page: Page, 
  symbol: string, 
  opts: { timeframe?: string; mode?: string } = {}
) {
  await page.fill(TOPBAR.compareInput, symbol);
  if (opts.timeframe) {
    await page.selectOption(TOPBAR.compareTimeframe, opts.timeframe);
  }
  if (opts.mode) {
    await page.selectOption(TOPBAR.compareMode, opts.mode);
  }
  await page.click(TOPBAR.compareAddBtn);
}

/**
 * Add compare via legacy toolbar (non-workspace mode)
 */
export async function addCompareViaToolbar(
  page: Page, 
  symbol: string, 
  opts: { timeframe?: string; mode?: string } = {}
) {
  await page.fill(COMPARE_TOOLBAR.addSymbol, symbol);
  if (opts.timeframe) {
    await page.selectOption(COMPARE_TOOLBAR.addTimeframe, opts.timeframe);
  }
  if (opts.mode) {
    await page.selectOption(COMPARE_TOOLBAR.addMode, opts.mode);
  }
  await page.click(COMPARE_TOOLBAR.addSubmit);
}
