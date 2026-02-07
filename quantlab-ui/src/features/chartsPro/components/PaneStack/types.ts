/**
 * PaneStack Types - Multi-pane chart system for TradingView-style indicator panes
 */

import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import type { IndicatorInstance } from "../../types";
import type { IndicatorWorkerResponse } from "../../indicators/registryV2";
import type { ChartTheme } from "../../theme";

// ============================================================================
// Pane Types
// ============================================================================

export type PaneId = string;

export interface PaneState {
  id: PaneId;
  type: "price" | "indicator";
  /** Height in pixels */
  height: number;
  /** Minimum height in pixels */
  minHeight: number;
  /** Indicator instances in this pane (for indicator panes) */
  indicators: string[]; // indicator IDs
}

export interface PaneInstance {
  id: PaneId;
  container: HTMLDivElement;
  chart: IChartApi;
  series: Map<string, ISeriesApi<"Line" | "Histogram">>;
  type: "price" | "indicator";
}

// ============================================================================
// Sync Controller Types
// ============================================================================

export interface SyncState {
  /** Prevents recursive sync loops */
  syncLock: boolean;
  /** Source pane ID that initiated the current sync */
  syncSource: PaneId | null;
}

export interface CrosshairSyncEvent {
  time: Time | null;
  sourcePane: PaneId;
}

export interface RangeSyncEvent {
  from: number;
  to: number;
  sourcePane: PaneId;
}

// ============================================================================
// PaneStack Props
// ============================================================================

export interface PaneStackProps {
  /** Total available width */
  width: number;
  /** Total available height for all panes */
  totalHeight: number;
  /** Theme for chart styling */
  theme: ChartTheme;
  /** Indicator instances */
  indicators: IndicatorInstance[];
  /** Computed indicator results */
  indicatorResults: Record<string, IndicatorWorkerResponse>;
  /** Callback to update an indicator */
  onUpdateIndicator?: (id: string, patch: Partial<IndicatorInstance>) => void;
  /** Callback to remove an indicator */
  onRemoveIndicator?: (id: string) => void;
  /** Callback to open indicator settings */
  onOpenIndicatorSettings?: (id: string) => void;
  /** Price chart ref (passed from parent) */
  priceChartRef?: React.RefObject<IChartApi | null>;
  /** Price data for crosshair sync */
  priceData?: Array<{ time: Time; close: number }>;
}

// ============================================================================
// Pane Heights
// ============================================================================

export const DEFAULT_INDICATOR_PANE_HEIGHT = 150;
export const MIN_PANE_HEIGHT = 80;
export const DIVIDER_HEIGHT = 6;
