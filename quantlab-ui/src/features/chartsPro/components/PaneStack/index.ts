/**
 * PaneStack - Multi-pane indicator system
 * 
 * Provides TradingView-style separate panes for indicators with:
 * - Separate IChartApi per pane
 * - Synced timeScale and crosshair
 * - Resizable dividers
 * - Per-pane legends
 */

export { PaneStack, default } from "./PaneStack";
export { IndicatorPane } from "./IndicatorPane";
export { PaneDivider } from "./PaneDivider";
export { SyncController, getSyncController, resetSyncController } from "./SyncController";
export * from "./types";
