import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  createChart,
  type SeriesType,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineWidth,
  type LogicalRange,
  type MouseEventParams,
  type Time,
  type TimeRange,
} from "@/lib/lightweightCharts";
import { createBaseSeries, type ChartType, type UIChartType, type BaseSeriesApi } from "../runtime/seriesFactory";
import { transformOhlcToHeikinAshi } from "../runtime/heikinAshi";
import { transformOhlcToRenkoWithSettings, renkoToLwCandlestick, type RenkoTransformResult } from "../runtime/renko";
import { useScaleInteractions, type ScaleInteractionMetrics } from "../hooks/useScaleInteractions";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { toast } from "sonner";

import type { ChartMeta, Drawing, IndicatorInstance, NormalizedBar, RawOhlcvRow, Tf } from "../types";
import { indicatorDisplayName, indicatorParamsSummary, normalizeRows } from "../types";
import { useChartControls, TIMEFRAME_OPTIONS } from "../state/controls";
import type { ChartSettings } from "./TopBar/SettingsPanel";
import type { RenkoSettingsInput as RenkoSettings } from "../runtime/renko";
import { applyChartLevelSettings, applySeriesSettings, createAppliedSnapshot, applyAppearanceToChart, applyAppearanceToSeries, createAppearanceSnapshot, type AppliedSettingsSnapshot, type AppliedAppearanceSnapshot } from "../utils/applyChartSettings";
import {
  colorFor,
  compareCache,
  cacheKey,
  loadPersisted,
  savePersisted,
  loadPreferredCompareMode,
  savePreferredCompareMode,
  loadPreferredCompareTimeframe,
  savePreferredCompareTimeframe,
  loadOverlayState,
  saveOverlayState,
  SYMBOL_PATTERN,
  encodeId,
  encodeCompareId,
  decodeCompareId,
  type CompareMode,
  type CompareAddMode,
  type OverlayState,
} from "../state/compare";
import { OverlayCanvasLayer } from "./OverlayCanvas";
import { DrawingLayer } from "./DrawingLayer";
import { AlertMarkersLayer } from "./AlertMarkersLayer";
import { FloatingToolbar } from "./FloatingToolbar";
import { ObjectSettingsModal } from "./Modal/ObjectSettingsModal";
import { CreateAlertModal } from "./Modal/CreateAlertModal";
import { LabelModal } from "./Modal/LabelModal";
import { CompareToolbar } from "./CompareToolbar";
import { InspectorSidebar, type InspectorObject } from "./InspectorSidebar";
import { OhlcStrip } from "./OhlcStrip";
import { ContextMenu, DEFAULT_CHART_ACTIONS, type ContextMenuState } from "./ContextMenu";
import { CrosshairOverlayLayer, getCrosshairPerfMetrics, resetCrosshairPerfMetrics } from "./CrosshairOverlayLayer";
import { Watermark } from "./Watermark";
import { LastPriceLine } from "./LastPriceLine";
import { type ChartsTheme, getThemeCssVars } from "../theme";
import type { IndicatorWorkerResponse } from "../indicators/registryV2";
import { useSettingsStore } from "../state/settings";
import { useToolbarStore, type CompareScaleMode } from "../state/toolbar";
import {
  applyPresetToDrawing,
  getAllPresets,
  getDefaultStyleForKind,
  type Preset,
} from "../presetStore";
import {
  alignAndTransform,
  buildEmaSeries,
  buildSmaSeries,
  describeBarBounds,
  describePointBounds,
  normalizeCompareMode,
  normalizeTimeKey,
  lwTimeFromNormalized,
  transformToPctBars,
  findAnchorClose,
  alignCompareToPercentMode,
} from "../utils/series";
import { getMockOhlcv } from "../mocks/ohlcv";
import { fetchOhlcvSeries } from "../hooks/useOhlcv";
import "../testingApi"; // side-effect: exposes testing helpers on window
import {
  getPriceCanvas,
  hoverAt,
  paintProbeIfEmpty,
  samplePriceCanvasPixelComposite,
  scanPriceCanvasDiagnostics,
} from "../testingApi";
import type {
  ChartsHelpersApi,
  ChartsHelpersDebug,
  DebugBindingSnapshot,
  HoverSnapshot,
  HoverTarget,
  LastSampleSnapshot,
  LwChartsApi,
  LwChartsDebugApi,
  VisibleRow,
  LwChartsExportHandlers,
} from "../qaTypes";

/** Get the bar duration in seconds for a timeframe */
function getBarDurationSeconds(tf: Tf): number {
  const map: Record<Tf, number> = {
    "1m": 60,
    "5m": 5 * 60,
    "15m": 15 * 60,
    "30m": 30 * 60,
    "1h": 60 * 60,
    "4h": 4 * 60 * 60,
    "1d": 24 * 60 * 60,
    "1w": 7 * 24 * 60 * 60,
    "1M": 30 * 24 * 60 * 60, // approximate
  };
  return map[tf] ?? 60;
}

// TV-38.1: Date formatters and PerfMetrics moved to CrosshairOverlayLayer
// to isolate crosshair logic from ChartViewport

const TIMEFRAME_VALUE_SET = new Set<Tf>(TIMEFRAME_OPTIONS.map((option) => option.value));
const MAX_COMPARE_COUNT = 4;
type CompareItemState = { symbol: string; mode: CompareMode; timeframe: Tf; hidden?: boolean; addMode?: CompareAddMode };
type CompareAddInput = CompareMode | string | { mode?: CompareMode | string; timeframe?: Tf | string };
type EnsureCompareSeriesDataFn = (
  sym: string,
  mode: CompareMode,
  tf: Tf,
  hidden?: boolean,
  prefetchedRows?: NormalizedBar[],
) => Promise<void>;

/**
 * Normalize inspector tab to canonical form.
 */
const normalizeInspectorTab = (input: unknown): "objectTree" | "dataWindow" | undefined => {
  if (typeof input !== "string") return undefined;
  const v = input.trim().toLowerCase();
  const map: Record<string, "objectTree" | "dataWindow"> = {
    objecttree: "objectTree",
    objects: "objectTree",
    "object-tree": "objectTree",
    tree: "objectTree",
    datawindow: "dataWindow",
    data: "dataWindow",
    "data-window": "dataWindow",
    window: "dataWindow",
  };
  return map[v];
};

const OVERLAY_COLORS: Record<string, string> = {
  "sma-20": "#f472b6",
  "sma-50": "#6366f1",
  "ema-12": "#f97316",
  "ema-26": "#14b8a6",
};
type ExportHandlers = LwChartsExportHandlers;
type LegendEntry = { value: string | null; color: string | null };
type LegendSnapshot = { base: LegendEntry; compares: Record<string, LegendEntry> };
type ScaleSnapshot = {
  mode: "price" | "percent";
  baseMode: string;
  overlayMode: string;
  ticks: string[];
  zeroLine: { visible: boolean; value: number };
};
type InspectorTab = "objectTree" | "dataWindow";
type DataStatus = "idle" | "loading" | "ready" | "error";

const describePriceScaleMode = (mode: PriceScaleMode | undefined) => {
  switch (mode) {
    case PriceScaleMode.Normal:
      return "Normal";
    case PriceScaleMode.Percentage:
      return "Percentage";
    case PriceScaleMode.IndexedTo100:
      return "IndexedTo100";
    case PriceScaleMode.Logarithmic:
      return "Logarithmic";
    default:
      return mode == null ? "Unknown" : String(mode);
  }
};

const parseAlphaFromColor = (input: string | null | undefined) => {
  if (!input) return 0;
  if (input === "transparent") return 0;
  const rgbaMatch = input.match(/rgba?\(([^)]+)\)/i);
  if (!rgbaMatch) return 1;
  const parts = rgbaMatch[1].split(",").map((part) => part.trim());
  if (parts.length < 4) return 1;
  const alpha = Number.parseFloat(parts[3]);
  return Number.isFinite(alpha) ? alpha : 0;
};

const LIGHTWEIGHT_CHARTS_VERSION =
  (typeof __LW_VERSION__ === "string" && __LW_VERSION__) ||
  (typeof __LW_CHARTS_VERSION__ === "string" && __LW_CHARTS_VERSION__) ||
  "unknown";

const queueAfterNextPaint = (cb: () => void) => {
  if (typeof window === "undefined") {
    cb();
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(cb);
  });
};

const shouldExposeQaDebug = () => {
  const isDev = typeof import.meta !== "undefined" && (import.meta as { env?: { MODE?: string } }).env?.MODE !== "production";
  if (isDev) return true;
  if (typeof window !== "undefined") {
    try {
      return window.location?.search?.includes("mock=1") ?? false;
    } catch {
      return false;
    }
  }
  return false;
};

/**
 * TV-28.0: Compute pixel coordinates for all handles of a selected drawing.
 * This enables deterministic drag tests in Playwright by providing exact click targets.
 * Returns an object with labeled handle positions, or null if coordinates can't be computed.
 */
type HandlesPx = Record<string, { x: number; y: number }>;
function computeHandlesPx(
  drawing: Drawing,
  chart: IChartApi | null,
  series: ISeriesApi<SeriesType> | null,
  containerWidth: number,
  containerHeight: number,
): HandlesPx | null {
  if (!chart || !series || containerWidth <= 0 || containerHeight <= 0) return null;

  // Helper: convert time/price to pixel coordinates
  const toPixel = (timeMs: number, price: number): { x: number; y: number } | null => {
    const timeSec = Math.floor(timeMs / 1000);
    const x = chart.timeScale().timeToCoordinate(timeSec as unknown as Time);
    const y = series.priceToCoordinate(price);
    if (x == null || y == null) return null;
    return { x, y };
  };

  const handles: HandlesPx = {};

  switch (drawing.kind) {
    case "hline": {
      // Horizontal line: center handle at mid-width
      const y = series.priceToCoordinate(drawing.price);
      if (y == null) return null;
      handles.center = { x: containerWidth / 2, y };
      break;
    }
    case "vline": {
      // Vertical line: center handle at mid-height
      const timeSec = Math.floor(drawing.timeMs / 1000);
      const x = chart.timeScale().timeToCoordinate(timeSec as unknown as Time);
      if (x == null) return null;
      handles.center = { x, y: containerHeight / 2 };
      break;
    }
    case "trend":
    case "ray":
    case "extendedLine": {
      const p1 = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const p2 = toPixel(drawing.p2.timeMs, drawing.p2.price);
      if (!p1 || !p2) return null;
      handles.p1 = p1;
      handles.p2 = p2;
      handles.center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      break;
    }
    case "rectangle": {
      const p1 = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const p2 = toPixel(drawing.p2.timeMs, drawing.p2.price);
      if (!p1 || !p2) return null;
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      handles.topLeft = { x: minX, y: minY };
      handles.topRight = { x: maxX, y: minY };
      handles.bottomLeft = { x: minX, y: maxY };
      handles.bottomRight = { x: maxX, y: maxY };
      handles.center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      break;
    }
    case "circle":
    case "ellipse": {
      const p1 = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const p2 = toPixel(drawing.p2.timeMs, drawing.p2.price);
      if (!p1 || !p2) return null;
      const cx = p1.x;
      const cy = p1.y;
      const radiusX = Math.abs(p2.x - p1.x);
      const radiusY = Math.abs(p2.y - p1.y);
      handles.center = { x: cx, y: cy };
      handles.top = { x: cx, y: cy - radiusY };
      handles.right = { x: cx + radiusX, y: cy };
      handles.bottom = { x: cx, y: cy + radiusY };
      handles.left = { x: cx - radiusX, y: cy };
      break;
    }
    case "triangle": {
      const p1 = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const p2 = toPixel(drawing.p2.timeMs, drawing.p2.price);
      const p3 = toPixel(drawing.p3.timeMs, drawing.p3.price);
      if (!p1 || !p2 || !p3) return null;
      handles.p1 = p1;
      handles.p2 = p2;
      handles.p3 = p3;
      handles.center = { x: (p1.x + p2.x + p3.x) / 3, y: (p1.y + p2.y + p3.y) / 3 };
      break;
    }
    case "channel":
    case "pitchfork":
    case "schiffPitchfork":
    case "modifiedSchiffPitchfork":
    case "flatTopChannel":
    case "flatBottomChannel": {
      const p1 = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const p2 = toPixel(drawing.p2.timeMs, drawing.p2.price);
      const p3 = toPixel(drawing.p3.timeMs, drawing.p3.price);
      if (!p1 || !p2 || !p3) return null;
      handles.p1 = p1;
      handles.p2 = p2;
      handles.p3 = p3;
      handles.center = { x: (p1.x + p2.x + p3.x) / 3, y: (p1.y + p2.y + p3.y) / 3 };
      break;
    }
    case "callout": {
      const anchor = toPixel(drawing.anchor.timeMs, drawing.anchor.price);
      const box = toPixel(drawing.box.timeMs, drawing.box.price);
      if (!anchor || !box) return null;
      handles.anchor = anchor;
      handles.box = box;
      break;
    }
    case "note": {
      const anchor = toPixel(drawing.anchor.timeMs, drawing.anchor.price);
      if (!anchor) return null;
      handles.anchor = anchor;
      break;
    }
    case "text": {
      const anchor = toPixel(drawing.anchor.timeMs, drawing.anchor.price);
      if (!anchor) return null;
      handles.anchor = anchor;
      break;
    }
    case "priceRange":
    case "dateRange":
    case "dateAndPriceRange": {
      const p1 = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const p2 = toPixel(drawing.p2.timeMs, drawing.p2.price);
      if (!p1 || !p2) return null;
      handles.p1 = p1;
      handles.p2 = p2;
      handles.center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      break;
    }
    case "fibRetracement": {
      const p1 = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const p2 = toPixel(drawing.p2.timeMs, drawing.p2.price);
      if (!p1 || !p2) return null;
      handles.p1 = p1;
      handles.p2 = p2;
      break;
    }
    case "regressionTrend": {
      const p1 = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const p2 = toPixel(drawing.p2.timeMs, drawing.p2.price);
      if (!p1 || !p2) return null;
      handles.p1 = p1;
      handles.p2 = p2;
      handles.center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      break;
    }
    case "longPosition":
    case "shortPosition": {
      const p1 = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const p2 = toPixel(drawing.p2.timeMs, drawing.p2.price);
      const p3 = toPixel(drawing.p3.timeMs, drawing.p3.price);
      if (!p1 || !p2 || !p3) return null;
      handles.entry = p1;
      handles.stop = p2;
      handles.target = p3;
      break;
    }
    case "fibExtension": {
      const p1 = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const p2 = toPixel(drawing.p2.timeMs, drawing.p2.price);
      const p3 = toPixel(drawing.p3.timeMs, drawing.p3.price);
      if (!p1 || !p2 || !p3) return null;
      handles.p1 = p1;
      handles.p2 = p2;
      handles.p3 = p3;
      break;
    }
    case "fibFan": {
      const p1 = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const p2 = toPixel(drawing.p2.timeMs, drawing.p2.price);
      if (!p1 || !p2) return null;
      handles.p1 = p1;
      handles.p2 = p2;
      break;
    }
    case "abcd": {
      const pA = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const pB = toPixel(drawing.p2.timeMs, drawing.p2.price);
      const pC = toPixel(drawing.p3.timeMs, drawing.p3.price);
      const pD = toPixel(drawing.p4.timeMs, drawing.p4.price);
      if (!pA || !pB || !pC || !pD) return null;
      handles.A = pA;
      handles.B = pB;
      handles.C = pC;
      handles.D = pD;
      break;
    }
    case "headAndShoulders": {
      const pLS = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const pHead = toPixel(drawing.p2.timeMs, drawing.p2.price);
      const pRS = toPixel(drawing.p3.timeMs, drawing.p3.price);
      const pNL1 = toPixel(drawing.p4.timeMs, drawing.p4.price);
      const pNL2 = toPixel(drawing.p5.timeMs, drawing.p5.price);
      if (!pLS || !pHead || !pRS || !pNL1 || !pNL2) return null;
      handles.LS = pLS;
      handles.Head = pHead;
      handles.RS = pRS;
      handles.NL1 = pNL1;
      handles.NL2 = pNL2;
      break;
    }
    case "elliottWave": {
      const p0 = toPixel(drawing.p0.timeMs, drawing.p0.price);
      const p1 = toPixel(drawing.p1.timeMs, drawing.p1.price);
      const p2 = toPixel(drawing.p2.timeMs, drawing.p2.price);
      const p3 = toPixel(drawing.p3.timeMs, drawing.p3.price);
      const p4 = toPixel(drawing.p4.timeMs, drawing.p4.price);
      const p5 = toPixel(drawing.p5.timeMs, drawing.p5.price);
      if (!p0 || !p1 || !p2 || !p3 || !p4 || !p5) return null;
      handles.p0 = p0;
      handles.p1 = p1;
      handles.p2 = p2;
      handles.p3 = p3;
      handles.p4 = p4;
      handles.p5 = p5;
      break;
    }
    default:
      return null;
  }

  return Object.keys(handles).length > 0 ? handles : null;
}

/**
 * TV-30.1: Compute bounding box from handlesPx coordinates
 * Returns { x, y, width, height } where x,y is top-left corner
 */
function computeSelectionBounds(handlesPx: HandlesPx | null): { x: number; y: number; width: number; height: number } | null {
  if (!handlesPx) return null;
  const points = Object.values(handlesPx);
  if (points.length === 0) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  // Add some padding for handle size
  const padding = 8;
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(maxX - minX + padding * 2, 20),
    height: Math.max(maxY - minY + padding * 2, 20),
  };
}

const installLwChartsStub = () => {
  if (typeof window === "undefined") return;
  const w = window as typeof window;
  const stubDump = () => ({
    symbol: null,
    timeframe: null,
    pricePoints: 0,
    volumePoints: 0,
    render: {
      hasChart: false,
      canvasW: 0,
      canvasH: 0,
      canvasWH: { w: 0, h: 0 },
      pricePoints: 0,
      volumePoints: 0,
      compareCount: 0,
      overlayCount: 0,
      overlayZ: null,
      hasOpaqueOverlay: false,
      overlayPercentActive: false,
      priceScaleModeBase: "Normal",
      bgColor: "#000000",
      seriesType: null,
      candlePalette: {
        up: "#000000",
        down: "#000000",
        borderUp: "#000000",
        borderDown: "#000000",
        wickUp: "#000000",
        wickDown: "#000000",
      },
      lwVersion: LIGHTWEIGHT_CHARTS_VERSION,
    },
    compares: {},
    overlays: { sma: [], ema: [] },
    scale: null,
    hover: null,
    legend: null,
    last: null,
    styles: { theme: "dark", compareColors: [] },
    // TV-37.1: UI namespace for BottomBar and other UI components
    ui: {
      bottomBar: null,
    },
  });
  const ensureSet = (target: Partial<LwChartsApi>): LwChartsApi["set"] => {
    const setter = (patch: Partial<LwChartsApi>) => {
      const merged = { ...(w.__lwcharts as Partial<LwChartsApi> | undefined), ...patch } as LwChartsApi;
      if (patch.debug) {
        merged.debug = { ...(w.__lwcharts as Partial<LwChartsApi> | undefined)?.debug, ...patch.debug };
      }
      // Preserve new set function if provided, otherwise use stub setter
      merged.set = patch.set ?? setter;
      w.__lwcharts = merged;
      try {
        // Notify consumers via event for reactive patches (supports compareAddMode / compares)
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("lwcharts:patch", { detail: patch }));
        }
      } catch {
        // ignore
      }
      return merged;
    };
    target.set = target.set ?? setter;
    return target.set;
  };
  const existing = (w.__lwcharts as Partial<LwChartsApi> | undefined) ?? {};
  const set = ensureSet(existing);
  if (!existing.chart) {
    const base: Partial<LwChartsApi> = {
      chart: null,
      priceSeriesRef: { current: null } as MutableRefObject<CandlestickSeries | null>,
      volumeSeriesRef: { current: null } as MutableRefObject<VolumeSeries | null>,
      fit: () => {},
      samplePixel: () => Promise.resolve(null),
      hoverAt: () => false,
      version: LIGHTWEIGHT_CHARTS_VERSION,
      meta: { impl: "stub", boundAt: Date.now(), compositeSource: "stub" },
      dump: stubDump,
      compare: {
        list: () => [],
        add: async () => {},
        remove: () => {},
        mode: () => {},
        toggle: () => {},
        timeframe: () => {},
      },
      dumpVisible: () => [],
      export: {},
      set,
    };
    if (shouldExposeQaDebug()) {
      base.debug = {
        scan: () => ({ canvases: [], bgRgb: null }),
        paintProbeIfEmpty: () => false,
        dumpBindings: () => ({
          hasHelpers: Boolean(window.__chartsHelpers),
          usesComposite: Boolean(window.__chartsHelpers?.samplePriceCanvasPixelComposite),
          lastSample: window.__chartsHelpers?.debug?.lastSample ?? null,
          canvases: { canvases: [], bgRgb: null },
          canvasWH: { w: 0, h: 0 },
        }),
        zoom: () => false,
        pan: () => false,
        hasApplyPatch: () => typeof w.__lwcharts?._applyPatch === "function",
      };
    } else {
      delete base.debug;
    }
    set(base as LwChartsApi);
  } else {
    // Ensure debug gating and set persist even if another bundle pre-set the object.
    if (shouldExposeQaDebug()) {
      existing.debug = existing.debug ?? {
        scan: () => ({ canvases: [], bgRgb: null }),
        paintProbeIfEmpty: () => false,
        dumpBindings: () => ({
          hasHelpers: Boolean(window.__chartsHelpers),
          usesComposite: Boolean(window.__chartsHelpers?.samplePriceCanvasPixelComposite),
          lastSample: window.__chartsHelpers?.debug?.lastSample ?? null,
          canvases: { canvases: [], bgRgb: null },
          canvasWH: { w: 0, h: 0 },
        }),
        zoom: () => false,
        pan: () => false,
      };
    } else {
      delete existing.debug;
    }
    set(existing);
  }
};

installLwChartsStub();

// TV-21.4a: Use UIChartType from seriesFactory (single source of truth)
type ChartTypeProp = UIChartType;

interface ChartViewportProps {
  apiBase: string;
  data: NormalizedBar[];
  meta: ChartMeta | null;
  theme: ChartsTheme;
  loading?: boolean;
  symbol: string;
  timeframe: Tf;
  chartType?: ChartTypeProp;
  chartSettings?: ChartSettings;
  /** TV-22.0a: Renko settings (mode, boxSize, atrPeriod, etc.) */
  renkoSettings?: RenkoSettings;
  /** TV-37.2: Price scale mode (linear/log/percent) */
  priceScaleMode?: "linear" | "log" | "percent";
  /** TV-37.2: Price scale auto-scale (independent toggle) */
  priceScaleAutoScale?: boolean;
  /** TV-37.2: Callback when autoScale is changed by context action or QA API (to sync UI) */
  onAutoScaleChange?: (enabled: boolean) => void;
  /** TV-37.4: Callback when timeframe is changed via QA API (to sync UI) */
  onTimeframeChange?: (timeframe: Tf) => void;
  /** FIX 3: Hide internal toolbar (when controls are in TVCompactHeader) */
  hideToolbar?: boolean;
  drawings: Drawing[];
  selectedId: string | null;
  indicators: IndicatorInstance[];
  magnetEnabled: boolean;
  snapToClose: boolean;
  onSelectDrawing: (id: string | null) => void;
  onUpsertDrawing: (drawing: Drawing, options?: { transient?: boolean; select?: boolean }) => void;
  onRemoveDrawing: (id: string) => void;
  duplicateDrawing: (id: string) => Drawing | null;
  onToggleLock: (id: string) => void;
  onToggleHide: (id: string) => void;
  registerExports?: (handlers: ExportHandlers) => void;
  onChartReady?: (chart: IChartApi) => void;
  onUpdateIndicator?: (id: string, patch: Partial<IndicatorInstance>) => void;
  /** PRIO 3: Callback when indicator compute results change */
  onIndicatorResultsChange?: (results: Record<string, IndicatorWorkerResponse>) => void;
  /** TV-20.3: Callback when text drawing is created (opens modal) */
  onTextCreated?: (drawingId: string) => void;
  /** TV-20.4: Callback when text drawing is edited (double-click or Enter) */
  onTextEdit?: (drawingId: string) => void;
  mockMode?: boolean;
  debugMode?: boolean;
  workspaceMode?: boolean;
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  rightPanelActiveTab?: "indicators" | "objects" | "alerts" | null;
  // TV-18.1: Modal state (central portal)
  modalOpen?: boolean;
  modalKind?: string | null;
  // TV-20.13: LeftToolbar favorites + recents for dump()
  leftToolbarState?: { favorites: string[]; recents: string[] };
  // TV-20.14: Global drawing controls for dump() and DrawingLayer
  drawingsHidden?: boolean;
  drawingsLocked?: boolean;
}

type CandlestickSeries = ISeriesApi<"Candlestick">;
type VolumeSeries = ISeriesApi<"Histogram">;
type LineSeries = ISeriesApi<"Line">;
type HistogramSeries = ISeriesApi<"Histogram">;
type DataWindowRow = {
  id: string;
  group: string;
  label: string;
  value: string;
  color?: string;
  valueColor?: string;
  muted?: boolean;
  symbol?: string;
};
type LastValueLabel = { key: string; text: string; background: string; color: string; y: number };

export function ChartViewport({
  apiBase,
  data: initialData,
  meta,
  theme,
  loading,
  symbol,
  timeframe,
  chartType = "candles",
  chartSettings,
  renkoSettings,
  priceScaleMode = "linear",
  priceScaleAutoScale = true,
  drawings,
  selectedId,
  indicators,
  magnetEnabled,
  snapToClose,
  onSelectDrawing,
  onUpsertDrawing,
  onRemoveDrawing,
  duplicateDrawing,
  onToggleLock,
  onToggleHide,
  registerExports,
  onChartReady,
  onUpdateIndicator,
  onIndicatorResultsChange,
  onTextCreated,
  onTextEdit,
  mockMode = false,
  debugMode = false,
  workspaceMode = false,
  sidebarCollapsed = false,
  sidebarWidth = 320,
  rightPanelActiveTab = null,
  // TV-18.1: Modal state
  modalOpen = false,
  modalKind = null,
  // TV-20.13: LeftToolbar state
  leftToolbarState,
  // TV-20.14: Global drawing controls
  drawingsHidden = false,
  drawingsLocked = false,
  // TV-37.2: Callback when autoScale changes (context action or QA API)
  onAutoScaleChange,
  // TV-37.4: Callback when timeframe changes via QA API
  onTimeframeChange,
  // FIX 3: Hide internal toolbar when controls are in TVCompactHeader
  hideToolbar = false,
}: ChartViewportProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panesContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRootRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<BaseSeriesApi | null>(null);
  const baseSeriesTypeRef = useRef<ChartTypeProp>("candles");
  const chartTypeRef = useRef<ChartTypeProp>(chartType); // Track current chart type for dump()
  const volumeSeriesRef = useRef<VolumeSeries | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compareLineSeriesRef = useRef<Map<string, LineSeries>>(new Map());
  const compareMetaRef = useRef<Map<string, { mode: CompareMode; hidden?: boolean; timeframe: Tf; addMode?: CompareAddMode }>>(new Map());
  // Map of symbol -> separate pane chart for addMode === 'newPane'
  const comparePaneMap = useRef<Map<string, { chart: IChartApi; series: LineSeries; container: HTMLDivElement }>>(new Map());
  const compareValuesRef = useRef<Map<string, Map<number, number>>>(new Map());
  const comparePriceValuesRef = useRef<Map<string, Map<number, number>>>(new Map());
  const compareSourceRowsRef = useRef<Map<string, NormalizedBar[]>>(new Map());
  const compareAnchorCloseRef = useRef<Map<string, number>>(new Map());
  const seriesLastValueRef = useRef<Map<string, { value: number; time: number }>>(new Map());
  const overlaySeriesRef = useRef<Map<string, LineSeries>>(new Map());
  const zeroLineSeriesRef = useRef<LineSeries | null>(null);

  const resolveAppearance = useCallback(() => {
    const settings = chartSettingsRef.current;
    const appearance = settings?.appearance;
    return {
      upColor: appearance?.candleUpColor ?? theme.candleUp,
      downColor: appearance?.candleDownColor ?? theme.candleDown,
      borderUp: appearance?.borderVisible === false ? appearance?.candleUpColor ?? theme.candleUp : appearance?.candleUpColor ?? theme.candleUp,
      borderDown: appearance?.borderVisible === false ? appearance?.candleDownColor ?? theme.candleDown : appearance?.candleDownColor ?? theme.candleDown,
      wickUp: appearance?.wickVisible === false ? "transparent" : theme.wickUp,
      wickDown: appearance?.wickVisible === false ? "transparent" : theme.wickDown,
      wickVisible: appearance?.wickVisible ?? true,
      borderVisible: appearance?.borderVisible ?? true,
    };
  }, [theme.candleDown, theme.candleUp, theme.wickDown, theme.wickUp]);
  const indicatorSeriesRef = useRef<Map<string, LineSeries | HistogramSeries>>(new Map());
  const ensureCompareSeriesDataRef = useRef<EnsureCompareSeriesDataFn>(async () => {});
  const ensureBaseSeriesRef = useRef<() => void>(() => {});
  const bindTestApiRef = useRef<() => void>(() => {});
  const anchorStateRef = useRef<{ time: number; baseClose: number } | null>(null);
  const hoverStateRef = useRef<HoverSnapshot | null>(null);
  const legendStateRef = useRef<LegendSnapshot>({ base: { value: null, color: null }, compares: {} });
  const scaleInfoRef = useRef<ScaleSnapshot>({
    mode: "price",
    baseMode: describePriceScaleMode(PriceScaleMode.Normal),
    overlayMode: describePriceScaleMode(PriceScaleMode.Normal),
    ticks: [],
    zeroLine: { visible: false, value: 0 },
  });
  const lastSnapshotRef = useRef<LastValueSnapshot>({ base: null, compares: {} });
  const updateLastValueLabelsRef = useRef<() => void>(() => {});
  const exportHandlersLocalRef = useRef<ExportHandlers>({});
  // TV-30.8: Ref for stable access to onSelectDrawing in QA API
  const onSelectDrawingRef = useRef(onSelectDrawing);
  onSelectDrawingRef.current = onSelectDrawing;
  
  // TV-37.2: Ref for stable access to onAutoScaleChange in QA API (avoids stale closure)
  const onAutoScaleChangeRef = useRef(onAutoScaleChange);
  onAutoScaleChangeRef.current = onAutoScaleChange;
  
  // TV-37.4: Ref for stable access to onTimeframeChange in QA API (avoids stale closure)
  const onTimeframeChangeRef = useRef(onTimeframeChange);
  onTimeframeChangeRef.current = onTimeframeChange;
  
  // Workspace layout refs (updated on every render to ensure dump() sees current values)
  const workspaceModeRef = useRef(workspaceMode);
  const sidebarCollapsedRef = useRef(sidebarCollapsed);
  const sidebarWidthRef = useRef(sidebarWidth);
  const rightPanelActiveTabRef = useRef<string | null>(rightPanelActiveTab);
  // TV-18.1: Modal refs
  const modalOpenRef = useRef(modalOpen);
  const modalKindRef = useRef<string | null>(modalKind ?? null);
  const chartSettingsRef = useRef<ChartSettings | undefined>(chartSettings);
  // TV-22.0a: Renko settings ref for dump()
  const renkoSettingsRef = useRef<RenkoSettings | undefined>(renkoSettings);
  // TV-20.13: LeftToolbar state ref for dump()
  const leftToolbarStateRef = useRef(leftToolbarState);
  // TV-20.14: Drawing controls refs for dump()
  const drawingsHiddenRef = useRef(drawingsHidden);
  const drawingsLockedRef = useRef(drawingsLocked);
  // TV-30.3: Object settings modal ref for dump() - initialize with false to avoid TDZ
  // The actual state sync happens later via objectSettingsOpenRef.current = objectSettingsOpen
  const objectSettingsOpenRef = useRef<boolean>(false);
  const appliedSettingsRef = useRef<AppliedSettingsSnapshot | null>(null); // TV-10.3: Track applied settings
  const appliedAppearanceRef = useRef<AppliedAppearanceSnapshot | null>(null); // TV-23.2: Track applied appearance for dump()
  const timeframeRef = useRef<string>(timeframe); // TV-11: Track current timeframe for dump()
  
  // TV-38.1: Crosshair throttling refs REMOVED - now managed by CrosshairOverlayLayer
  // This eliminates ChartViewport re-renders on crosshair movement
  
  // TV-23.1: Settings dialog state for dump() - use getState() directly in dump() to avoid render loop
  workspaceModeRef.current = workspaceMode;
  sidebarCollapsedRef.current = sidebarCollapsed;
  sidebarWidthRef.current = sidebarWidth;
  rightPanelActiveTabRef.current = rightPanelActiveTab;
  modalOpenRef.current = modalOpen; // TV-18.1
  modalKindRef.current = modalKind ?? null; // TV-18.1
  chartTypeRef.current = chartType; // Sync current chartType prop to ref for dump()
  chartSettingsRef.current = chartSettings; // Sync settings for dump()
  renkoSettingsRef.current = renkoSettings; // TV-22.0a: Sync renko settings for dump()
  leftToolbarStateRef.current = leftToolbarState; // TV-20.13: Sync leftToolbar state for dump()
  drawingsHiddenRef.current = drawingsHidden; // TV-20.14: Sync drawingsHidden for dump()
  drawingsLockedRef.current = drawingsLocked; // TV-20.14: Sync drawingsLocked for dump()
  // NOTE: objectSettingsOpenRef.current sync moved to after objectSettingsOpen state declaration to avoid TDZ
  timeframeRef.current = timeframe; // Sync timeframe for dump()
  // TV-22.0c: Track last Renko transform result for dump().render.renko
  const lastRenkoResultRef = useRef<RenkoTransformResult | null>(null);
  const seriesPointCountsRef = useRef<{ price: number; volume: number; compares: Record<string, number> }>({
    price: 0,
    volume: 0,
    compares: {},
  });
  const lastLoadedBaseRowsRef = useRef<NormalizedBar[]>([]);
  const currentSymbolRef = useRef(symbol);
  const baseScaleModeRef = useRef<PriceScaleMode>(PriceScaleMode.Normal);
  const barSpacingGuardRef = useRef<number | null>(null);
  const barSpacingRef = useRef<number | null>(null);
  const barSpacingLockedRef = useRef<boolean>(false); // TV-34: Lock to prevent guard override
  const baseFetchAbortRef = useRef<AbortController | null>(null);
  const baseLoadSeqRef = useRef(0);
  const indicatorWorkerRef = useRef<Worker | null>(null);
  const dataRevisionRef = useRef<number>(0); // TV-11: Incremented on timeframe change (test signal, not timestamp)
  
  // FIX 2: Track whether initial range has been applied for 1D timeframe
  // This prevents fitToContent() from overriding the 485-day range on initial load
  const rangeInitializedRef = useRef<boolean>(false);

  // Percent mode anchor tracking
  const percentAnchorRef = useRef<{ time: number | null; index: number | null; baseClose: number | null; compareCloses: Record<string, number> }>({
    time: null,
    index: null,
    baseClose: null,
    compareCloses: {},
  });
  const percentLastValuesRef = useRef<{ base: number | null; compares: Record<string, number> }>({ base: null, compares: {} });
  const percentZeroLineRef = useRef<any>(null);

  const [data, setData] = useState<NormalizedBar[]>(initialData);
  const [indicatorResults, setIndicatorResults] = useState<Record<string, IndicatorWorkerResponse>>({});
  
  // PRIO 3: Notify parent of indicator results changes
  useEffect(() => {
    onIndicatorResultsChange?.(indicatorResults);
  }, [indicatorResults, onIndicatorResultsChange]);
  
  const [dataWindowRows, setDataWindowRows] = useState<DataWindowRow[]>([]);
  const [lastValueLabels, setLastValueLabels] = useState<{ base: LastValueLabel | null; compares: LastValueLabel[] }>({
    base: null,
    compares: [],
  });
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = window.localStorage?.getItem("chartspro.inspector.open");
      if (stored != null) return stored === "1";
      return mockMode || shouldExposeQaDebug();
    } catch {
      return mockMode || shouldExposeQaDebug();
    }
  });
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>(() => {
    if (typeof window === "undefined") return "objectTree";
    try {
      const stored = window.localStorage?.getItem("chartspro.inspector.tab");
      if (stored === "dataWindow" || stored === "objectTree") return stored as InspectorTab;
    } catch {
      // ignore
    }
    return "objectTree";
  });

  // Initialize inspectorStateRef after inspectorOpen and inspectorTab are defined to avoid TDZ error
  const inspectorStateRef = useRef<{ open: boolean; tab: InspectorTab }>({ open: inspectorOpen, tab: inspectorTab });

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    selectedAction: null,
  });
  const contextMenuStateRef = useRef<ContextMenuState>(contextMenu);
  const [lastContextAction, setLastContextAction] = useState<string | null>(null);

  // OHLC strip visibility state
  const [showOhlcStrip, setShowOhlcStrip] = useState<boolean>(true);
  const [hoverBar, setHoverBar] = useState<NormalizedBar | null>(null);
  const [hoverPrevClose, setHoverPrevClose] = useState<number | null>(null);

  // Watermark visibility state
  const [showWatermark, setShowWatermark] = useState<boolean>(true);

  // Volume visibility state
  const [showVolume, setShowVolume] = useState<boolean>(true);

  // Crosshair visibility state (affects both overlay and chart crosshair)
  const [showCrosshair, setShowCrosshair] = useState<boolean>(true);

  // TV-38.1: crosshairPosition state REMOVED - now managed by CrosshairOverlayLayer
  // This isolates crosshair updates from ChartViewport render cycle

  // Last price line state
  const [lastPriceY, setLastPriceY] = useState<number | null>(null);

  // TV-30.1: Selection bounds for FloatingToolbar
  const [selectionBounds, setSelectionBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // TV-30.3: Object settings modal open state
  const [objectSettingsOpen, setObjectSettingsOpen] = useState<boolean>(false);
  // TV-30.3: Sync objectSettingsOpen to ref for dump() (must be after state declaration to avoid TDZ)
  objectSettingsOpenRef.current = objectSettingsOpen;

  // TV-30.4: Create alert modal open state
  const [createAlertOpen, setCreateAlertOpen] = useState<boolean>(false);
  const createAlertOpenRef = useRef<boolean>(false);
  createAlertOpenRef.current = createAlertOpen;

  // TV-30.7: Label modal open state
  const [labelModalOpen, setLabelModalOpen] = useState<boolean>(false);
  const labelModalOpenRef = useRef<boolean>(false);
  labelModalOpenRef.current = labelModalOpen;

  const setInspectorTabSafe = useCallback((value: unknown) => {
    const normalized = normalizeInspectorTab(value);
    if (normalized) {
      setInspectorTab(normalized);
    }
  }, []);
  const mainBarByTime = useMemo(() => {
    const map = new Map<number, NormalizedBar>();
    data.forEach((bar) => map.set(Number(bar.time), bar));
    return map;
  }, [data]);
  const indicatorValueByTime = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    Object.values(indicatorResults).forEach((result) => {
      const owner = indicators.find((indicator) => indicator.id === result.id);
      if (!owner || owner.hidden) return;
      result.lines.forEach((line) => {
        const key = `${result.id}:${line.id}`;
        const inner = new Map<number, number>();
        line.values.forEach((point) => inner.set(Number(point.time), point.value));
        map.set(key, inner);
      });
    });
    return map;
  }, [indicatorResults, indicators]);

  // TV-30.3: Memoize selected drawing for ObjectSettingsModal and FloatingToolbar
  const selectedDrawing = useMemo(() => {
    if (!selectedId) return null;
    return drawings.find((d) => d.id === selectedId) ?? null;
  }, [selectedId, drawings]);

  const [compareItems, setCompareItems] = useState<CompareItemState[]>(() =>
    loadPersisted()
      .slice(0, MAX_COMPARE_COUNT)
      .map((item) => {
        const resolvedMode = normalizeCompareMode(item.mode) ?? "percent";
        const inferredAdd = (item as any)?.addMode ?? (resolvedMode === "price" ? "newPriceScale" : "samePercent");
        return {
          symbol: item.symbol.toUpperCase(),
          mode: resolvedMode,
          timeframe: TIMEFRAME_VALUE_SET.has(item.timeframe as Tf) ? (item.timeframe as Tf) : timeframe,
          hidden: false,
          addMode: inferredAdd as CompareAddMode,
        };
      }),
  );
  const compareItemsRef = useRef(compareItems);
  const compareSeriesMap = compareLineSeriesRef.current;
  const indicatorSeriesMap = indicatorSeriesRef.current;
  const [chartReady, setChartReady] = useState(false);
  const [baseLoading, setBaseLoading] = useState(false);
  const lastErrorRef = useRef<string | null>(null);
  const [compareVersion, setCompareVersion] = useState(0);
  const [defaultCompareMode, setDefaultCompareMode] = useState<CompareMode>(() => loadPreferredCompareMode());
  const [defaultCompareTimeframe, setDefaultCompareTimeframe] = useState<Tf>(() =>
    loadPreferredCompareTimeframe(timeframe),
  );
  const [defaultCompareAddMode, setDefaultCompareAddMode] = useState<CompareAddMode>(() => {
    try {
      if (typeof window === "undefined" || typeof window.localStorage === "undefined") return "samePercent" as CompareAddMode;
      const stored = window.localStorage.getItem("chartspro.compareAddMode");
      if (stored === "samePercent" || stored === "newPriceScale" || stored === "newPane") return stored as CompareAddMode;
      return "samePercent" as CompareAddMode;
    } catch {
      return "samePercent" as CompareAddMode;
    }
  });
  const [compareScaleMode, setCompareScaleMode] = useState<"price" | "percent">(() => {
    try {
      if (typeof window === "undefined" || typeof window.localStorage === "undefined") return "price";
      const stored = window.localStorage.getItem("chartspro.compareScaleMode");
      if (stored === "price" || stored === "percent") return stored;
      return "price";
    } catch {
      return "price";
    }
  });
  const compareScaleModeRef = useRef(compareScaleMode);
  compareScaleModeRef.current = compareScaleMode;
  const [overlayState, setOverlayState] = useState<OverlayState>(() => loadOverlayState());
  const overlayStateRef = useRef<OverlayState>(overlayState);
  overlayStateRef.current = overlayState;
  const toggleOverlay = useCallback((group: "sma" | "ema", value: number) => {
    setOverlayState((prev: OverlayState) => {
      const current = new Set<number>(prev[group]);
      if (current.has(value)) {
        current.delete(value);
      } else {
        current.add(value);
      }
      const next: OverlayState = {
        ...prev,
        [group]: Array.from(current).sort((a, b) => a - b),
      };
      saveOverlayState(next);
      return next;
    });
  }, []);
  const sizeWarnedRef = useRef(false);
  const tool = useChartControls((state) => state.tool);
  const setTool = useChartControls((state) => state.setTool);

  // PRIO 2: Sync with toolbar store when controls are in TVCompactHeader (hideToolbar=true)
  // This allows the topbar controls to drive the chart state
  const storeCompareItems = useToolbarStore((state) => state.compareItems);
  const storeOverlayState = useToolbarStore((state) => state.overlayState);
  const storeInspectorOpen = useToolbarStore((state) => state.inspectorOpen);
  const storeInspectorTab = useToolbarStore((state) => state.inspectorTab);
  const storeCompareScaleMode = useToolbarStore((state) => state.compareScaleMode);
  const storeSetCompareItems = useToolbarStore((state) => state.setCompareItems);
  
  // Sync store → internal state when hideToolbar is true (workspace mode)
  useEffect(() => {
    if (!hideToolbar) return;
    
    // Sync compare items from store
    const storeItems = storeCompareItems.map((item) => ({
      symbol: item.symbol.toUpperCase(),
      mode: item.mode,
      timeframe: item.timeframe,
      hidden: item.hidden ?? false,
      addMode: (item.mode === "price" ? "newPriceScale" : "samePercent") as CompareAddMode,
    }));
    setCompareItems(storeItems);
    
    // Sync overlay state from store
    setOverlayState(storeOverlayState);
    
    // Sync inspector state from store
    setInspectorOpen(storeInspectorOpen);
    setInspectorTab(storeInspectorTab);
    
    // Sync compare scale mode from store
    setCompareScaleMode(storeCompareScaleMode);
  }, [hideToolbar, storeCompareItems, storeOverlayState, storeInspectorOpen, storeInspectorTab, storeCompareScaleMode]);

  // PRIO 2: Reverse sync - internal state → store when hideToolbar is true
  // This ensures state changes from chart API (e.g., addCompare with guard) propagate to TopControls
  useEffect(() => {
    if (!hideToolbar) return;
    
    // Compare internal items with store items
    const internalSymbols = compareItems.map((i) => i.symbol.toUpperCase()).sort().join(",");
    const storeSymbols = storeCompareItems.map((i) => i.symbol.toUpperCase()).sort().join(",");
    
    if (internalSymbols !== storeSymbols) {
      // Internal state changed (e.g., addCompare was called), sync to store
      storeSetCompareItems(compareItems.map((item) => ({
        symbol: item.symbol,
        mode: item.mode,
        timeframe: item.timeframe,
        hidden: item.hidden ?? false,
      })));
    }
  }, [hideToolbar, compareItems, storeCompareItems, storeSetCompareItems]);

  // TV-8.2: Alert markers state and fetching
  interface AlertMarker {
    id: number;
    price: number;
    label?: string;
    isSelected?: boolean;
  }
  const [alerts, setAlerts] = useState<AlertMarker[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const apiBaseClean = apiBase.replace(/\/$/, "");
      const tfMap: Record<Tf, string> = {
        "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "4h": "4h",
        "1d": "D", "1w": "W", "1M": "M"
      };
      const bar = tfMap[timeframe] || "D";
      const url = new URL(`${apiBaseClean}/alerts`);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("bar", bar);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const items = data?.items ?? data ?? [];
      const markers: AlertMarker[] = Array.isArray(items)
        ? items.map((item: any) => {
            const price = item.geometry?.price ?? 0;
            return {
              id: item.id,
              price: Number(price),
              label: item.label || undefined,
              isSelected: item.id === selectedAlertId,
            };
          })
        : [];
      setAlerts(markers);
    } catch (err) {
      console.warn("[ChartViewport] Alert fetch failed:", err);
      setAlerts([]);
    }
  }, [apiBase, symbol, timeframe, selectedAlertId]);

  // Fetch alerts on mount and when symbol/timeframe changes
  useEffect(() => {
    if (symbol) {
      void fetchAlerts();
    }
  }, [symbol, timeframe, fetchAlerts]);

  // TV-11: Increment data revision when timeframe changes (signals fetch trigger for tests)
  // FIX 2: Reset rangeInitializedRef so new timeframe gets proper initial range
  useEffect(() => {
    dataRevisionRef.current += 1;
    rangeInitializedRef.current = false; // Allow new initial range to be set
  }, [timeframe]);

  // Auto-refresh alerts every 10 seconds (useful for triggered alerts)
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchAlerts();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // TV-34.1/34.2/34.3: Scale interactions (axis drag, auto-fit, wheel zoom pivot)
  const scaleInteractionsRef = useRef<ReturnType<typeof useScaleInteractions> | null>(null);
  const scaleInteractions = useScaleInteractions({
    chartRef: chartRef,
    seriesRef: candleSeriesRef,
    containerRef: chartRootRef,
    enabled: chartReady,
    onScaleChange: () => {
      // Trigger redraw when scale changes
      const chart = chartRef.current;
      if (chart) {
        barSpacingRef.current = chart.timeScale().options().barSpacing;
      }
    },
  });
  scaleInteractionsRef.current = scaleInteractions;

const overlayWrapperClassName = "chartspro-overlay absolute inset-0 pointer-events-none";
const overlayCanvasClassName = "chartspro-overlay__canvas absolute inset-0";
  const creationThemeRef = useRef(theme);
  creationThemeRef.current = theme;

  // TV-3.7: Keyboard shortcuts for tool selection (Esc, H, V, T, C, R, N)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if event is a repeat (holding down key)
      if (event.repeat) return;

      // Ignore if modifier keys are pressed (metaKey, ctrlKey, altKey, shiftKey)
      // These are for OS/browser shortcuts, not our app
      // TV-32: Shift+L = toggle lock, Shift+H = toggle hide (handled by DrawingLayer)
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      // Ignore if focus is in input-like element
      const target = event.target as HTMLElement;
      
      // Check if target is an input, textarea, or has contentEditable
      const isEditable = 
        target?.tagName === "INPUT" || 
        target?.tagName === "TEXTAREA" || 
        target?.isContentEditable || 
        target?.closest('[contenteditable="true"]') !== null;
      
      if (isEditable) return;

      const key = event.key.toLowerCase();
      let nextTool: typeof tool | null = null;

      switch (key) {
        // NOTE: Esc is handled by DrawingLayer with priority (cancel operation first)
        // Don't duplicate Esc here to avoid listener race conditions
        case "h":
          nextTool = "hline";
          break;
        case "v":
          nextTool = "vline";
          break;
        case "t":
          nextTool = "trendline";
          break;
        case "a":
          nextTool = "ray";
          break;
        case "e":
          nextTool = "extendedLine";
          break;
        case "c":
          nextTool = "channel";
          break;
        case "r":
          nextTool = "rectangle";
          break;
        case "o":
          nextTool = "circle";
          break;
        case "i":
          nextTool = "ellipse";
          break;
        case "y":
          nextTool = "triangle";
          break;
        case "n":
          nextTool = "text";
          break;
        case "p":
          nextTool = "pitchfork";
          break;
        case "f":
          nextTool = "flatTopChannel";
          break;
        case "b":
          nextTool = "fibRetracement";
          break;
        case "g":
          nextTool = "regressionTrend";
          break;
        case "l":
          nextTool = "longPosition";
          break;
        case "s":
          nextTool = "shortPosition";
          break;
        case "k":
          nextTool = "callout";
          break;
        case "m":
          nextTool = "note";
          break;
        case "x":
          nextTool = "fibExtension";
          break;
        case "u":
          nextTool = "fibFan";
          break;
        case "j":
          nextTool = "schiffPitchfork";
          break;
        case "d":
          nextTool = "modifiedSchiffPitchfork";
          break;
        case "w":
          nextTool = "abcd";
          break;
        case "q":
          nextTool = "headAndShoulders";
          break;
        case "z":
          nextTool = "elliottWave";
          break;
        default:
          return;
      }

      event.preventDefault();
      setTool(nextTool);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [setTool]);
  const visibleIndicators = useMemo(() => indicators.filter((indicator) => !indicator.hidden), [indicators]);
  const safeApiBase = useMemo(() => apiBase.replace(/\/$/, ""), [apiBase]);
  const isLoading = Boolean(loading || baseLoading);
  const mockModeActive = Boolean(mockMode);
  const qaDebugEnabled = shouldExposeQaDebug() || mockModeActive;
  const debugModeActive = Boolean(debugMode);

  const sampleCanvasPixel = useCallback(() => samplePriceCanvasPixelComposite(rootRef.current), []);

  const rebindTestApiWithSample = useCallback(() => {
    bindTestApiRef.current();
    void sampleCanvasPixel();
  }, [sampleCanvasPixel]);

  const hoverCanvasAt = useCallback((pos: "left" | "center" | "right" | number) => hoverAt(rootRef.current, pos), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: ErrorEvent) => {
      if (typeof event?.message === "string" && event.message.includes("removeChild")) {
        event.preventDefault();
      }
    };
    const previousOnError = window.onerror;
    const proxy: OnErrorEventHandler = (message, source, lineno, colno, error) => {
      const text =
        typeof message === "string"
          ? message
          : typeof (message as ErrorEvent | undefined)?.message === "string"
            ? (message as ErrorEvent).message
            : "";
      if (text.includes("removeChild")) {
        return true;
      }
      if (typeof previousOnError === "function") {
        return previousOnError(message, source ?? "", lineno ?? 0, colno ?? 0, error ?? undefined);
      }
      return false;
    };
    window.onerror = proxy;
    window.addEventListener("error", handler);
    return () => {
      window.removeEventListener("error", handler);
      window.onerror = previousOnError ?? null;
    };
  }, []);

  const updateBarSpacingGuard = useCallback(
    (range?: LogicalRange | null) => {
      // TV-34: Skip if barSpacing is locked (programmatic control)
      if (barSpacingLockedRef.current) return;
      
      const chart = chartRef.current;
      if (!chart) return;
      const targetRange = range ?? chart.timeScale().getVisibleLogicalRange();
      const from = targetRange?.from;
      const to = targetRange?.to;
      if (typeof from !== "number" || typeof to !== "number") return;
      const span = Math.abs(to - from);
      if (!Number.isFinite(span) || span <= 0) return;
      const width = chartRootRef.current?.getBoundingClientRect().width ?? 0;
      if (!width || !Number.isFinite(width)) return;
      const approxSpacing = width / span;
      if (approxSpacing >= 3) {
        if (barSpacingGuardRef.current != null) {
          chart.timeScale().applyOptions({ barSpacing: undefined });
          barSpacingGuardRef.current = null;
          barSpacingRef.current = null;
        }
        return;
      }
      const guardSpacing = Math.min(18, Math.max(4, Math.round(approxSpacing * 1.8)));
      if (barSpacingGuardRef.current === guardSpacing) return;
      chart.timeScale().applyOptions({ barSpacing: guardSpacing });
      barSpacingGuardRef.current = guardSpacing;
      barSpacingRef.current = guardSpacing;
    },
    [],
  );

/**
 * FIX 2: ALWAYS show ~485 days from right edge when timeframe is 1D.
 * This ensures a clean default view (not "fit all" which looks cramped).
 * For other timeframes or insufficient data: use fitContent.
 * Sets rangeInitializedRef to prevent later effects from overriding.
 */
const applyInitialRange = useCallback((dataCount: number, currentTimeframe: string) => {
  const chart = chartRef.current;
  const host = containerRef.current;
  if (!chart || !host) return;
  
  // Resize canvas first
  const nextWidth = Math.floor(host.clientWidth);
  const nextHeight = Math.floor(host.clientHeight);
  if (nextWidth > 0 && nextHeight > 0) {
    chart.resize(nextWidth, nextHeight);
  }
  
  // For 1D timeframe with sufficient data: show last 485 bars (≈1Y of trading days)
  // For other timeframes or insufficient data: use fitContent
  const is1DTimeframe = currentTimeframe === "1D";
  const visibleBars = 485;
  const hasEnoughData = dataCount > 50; // Need reasonable amount of data
  
  if (is1DTimeframe && hasEnoughData && dataCount > 0) {
    // Show last N bars (485 for ~1Y, fallback to 365 if needed)
    const barsToShow = Math.min(visibleBars, dataCount);
    const fromIndex = Math.max(0, dataCount - barsToShow);
    const toIndex = dataCount;
    
    try {
      chart.timeScale().setVisibleLogicalRange({ from: fromIndex, to: toIndex });
      // Mark range as initialized to prevent fitToContent from overriding
      rangeInitializedRef.current = true;
    } catch {
      // Fallback to fitContent if setVisibleLogicalRange fails
      chart.timeScale().fitContent();
    }
  } else {
    // Other timeframes or insufficient data - use fitContent
    chart.timeScale().fitContent();
  }
  
  queueAfterNextPaint(() => {
    if (!chartRef.current) return;
    updateBarSpacingGuard(chartRef.current.timeScale().getVisibleLogicalRange());
    rebindTestApiWithSample();
  });
}, [rebindTestApiWithSample, updateBarSpacingGuard]);

const fitToContent = useCallback(() => {
  const chart = chartRef.current;
  const host = containerRef.current;
  if (!chart || !host) return;
  const nextWidth = Math.floor(host.clientWidth);
  const nextHeight = Math.floor(host.clientHeight);
  if (nextWidth > 0 && nextHeight > 0) {
    chart.resize(nextWidth, nextHeight);
  }
  chart.timeScale().fitContent();
  queueAfterNextPaint(() => {
    if (!chartRef.current) return;
    const snapHost = containerRef.current;
    if (snapHost) {
      const w = Math.floor(snapHost.clientWidth);
      const h = Math.floor(snapHost.clientHeight);
      if (w > 0 && h > 0) {
        chartRef.current.resize(w, h);
      }
    }
    chartRef.current.timeScale().fitContent();
    updateBarSpacingGuard(chartRef.current.timeScale().getVisibleLogicalRange());
    rebindTestApiWithSample();
  });
}, [rebindTestApiWithSample, updateBarSpacingGuard]);

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const newState: ContextMenuState = {
      open: true,
      x: e.clientX,
      y: e.clientY,
      selectedAction: null,
    };
    setContextMenu(newState);
    contextMenuStateRef.current = newState;
  }, []);

  const handleContextMenuClose = useCallback(() => {
    const newState: ContextMenuState = { open: false, x: 0, y: 0, selectedAction: null };
    setContextMenu(newState);
    contextMenuStateRef.current = newState;
  }, []);

  const handleContextMenuAction = useCallback((actionId: string) => {
    const newState: ContextMenuState = { ...contextMenuStateRef.current, selectedAction: actionId, open: false };
    setContextMenu(newState);
    contextMenuStateRef.current = newState;
    setLastContextAction(actionId);

    switch (actionId) {
      case "add-alert":
        // Open alerts panel - integration point for AlertsPanel
        toast.info("Add Alert: Feature integration pending");
        break;
      case "reset-scale":
        chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
        onAutoScaleChangeRef.current?.(true); // TV-37.2: Sync UI state via ref
        break;
      case "auto-scale":
        chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
        onAutoScaleChangeRef.current?.(true); // TV-37.2: Sync UI state via ref
        break;
      case "fit-content":
        fitToContent();
        break;
      case "toggle-ohlc":
        setShowOhlcStrip((prev) => !prev);
        break;
      case "toggle-volume":
        setShowVolume((prev) => {
          const newVal = !prev;
          // Apply visibility to volume series
          if (volumeSeriesRef.current) {
            volumeSeriesRef.current.applyOptions({
              visible: newVal,
            });
          }
          return newVal;
        });
        break;
      case "toggle-crosshair":
        setShowCrosshair((prev) => {
          const newVal = !prev;
          // Toggle chart crosshair mode
          if (chartRef.current) {
            chartRef.current.applyOptions({
              crosshair: {
                mode: newVal ? CrosshairMode.Magnet : CrosshairMode.Hidden,
              },
            });
          }
          return newVal;
        });
        break;
      case "toggle-watermark":
        setShowWatermark((prev) => !prev);
        break;
      case "copy-price": {
        const lastBar = lastLoadedBaseRowsRef.current[lastLoadedBaseRowsRef.current.length - 1];
        if (lastBar) {
          navigator.clipboard?.writeText(lastBar.close.toFixed(2)).then(() => {
            toast.success(`Copied: ${lastBar.close.toFixed(2)}`);
          }).catch(() => {
            toast.error("Failed to copy price");
          });
        }
        break;
      }
      case "export-png":
        exportHandlersLocalRef.current.png?.();
        break;
      case "export-csv":
        exportHandlersLocalRef.current.csv?.();
        break;
      case "settings":
        toast.info("Settings: Feature pending");
        break;
      default:
        break;
    }
  }, [fitToContent, onAutoScaleChange]);

  currentSymbolRef.current = symbol;
  timeframeRef.current = timeframe;
  compareItemsRef.current = compareItems;

  useEffect(() => {
    savePreferredCompareMode(defaultCompareMode);
  }, [defaultCompareMode]);

  useEffect(() => {
    savePreferredCompareTimeframe(defaultCompareTimeframe);
  }, [defaultCompareTimeframe]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem("chartspro.compareScaleMode", compareScaleMode);
      }
    } catch {
      // ignore quota errors
    }
  }, [compareScaleMode]);

  // Manage 0% priceLine for percent mode
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    
    if (compareScaleMode === "percent") {
      // Add 0% priceLine if not already present
      if (!percentZeroLineRef.current) {
        try {
          percentZeroLineRef.current = candleSeriesRef.current.createPriceLine({
            price: 0,
            color: theme.priceLine || "#808080",
            lineWidth: 1 as LineWidth,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "0%",
          });
        } catch (err) {
          console.warn("[ChartsPro] Failed to create 0% priceLine:", err);
        }
      }
    } else {
      // Remove 0% priceLine when switching back to price mode
      if (percentZeroLineRef.current) {
        try {
          candleSeriesRef.current.removePriceLine(percentZeroLineRef.current);
        } catch (err) {
          console.warn("[ChartsPro] Failed to remove 0% priceLine:", err);
        }
        percentZeroLineRef.current = null;
      }
    }
  }, [compareScaleMode, theme.priceLine]);

  const fetchOhlcv = useCallback(
    async (sym: string, bar: string) => {
      const normalizedSym = sym.toUpperCase();
      const key = cacheKey(normalizedSym, bar);
      if (compareCache.has(key)) {
        return compareCache.get(key)!;
      }
      const rows = await fetchOhlcvSeries({
        apiBase: safeApiBase,
        symbol: normalizedSym,
        timeframe: bar,
        limit: 4000,
        mock: mockModeActive && isValidTimeframe(bar),
      });
      compareCache.set(key, rows);
      return rows;
    },
    [mockModeActive, safeApiBase],
  );

  const addCompare = useCallback(
    async (sym: string, input?: CompareAddInput) => {
      const normalized = sym.trim().toUpperCase();
      if (!normalized) return;
      if (!SYMBOL_PATTERN.test(normalized)) {
        toast.warning("Invalid symbol");
        return;
      }
      const baseRows = lastLoadedBaseRowsRef.current;
      if (!baseRows.length) {
        toast.warning("Load base candles before adding compares");
        return;
      }
      const { mode, timeframe: desiredTf, addMode } = resolveCompareAddInput(
        input,
        defaultCompareMode,
        defaultCompareTimeframe ?? timeframeRef.current,
      );
      const targetTf = isValidTimeframe(desiredTf) ? desiredTf : timeframeRef.current;
      const existing = compareItemsRef.current.find((entry) => entry.symbol === normalized);
      if (!existing && compareItemsRef.current.length >= MAX_COMPARE_COUNT) {
        toast.warning("Max 4 compares");
        return;
      }
      let cmpRows: NormalizedBar[];
      try {
        cmpRows = await fetchOhlcv(normalized, targetTf);
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to load ${normalized}`;
        toast.error(message);
        return;
      }
      if (!cmpRows.length) {
        toast.warning("No data for compare symbol");
        return;
      }
      const preview = alignAndTransform(baseRows, cmpRows, mode).series;
      if (!preview.length) {
        toast.warning("No overlap between base and compare series");
        return;
      }
      if (typeof window !== "undefined") {
        const w = window as unknown as Record<string, unknown>;
        if (w.__lwdebug) {
          console.debug("[compare:add]", {
            symbol: normalized,
            timeframe: targetTf,
            fetched: cmpRows.length,
            aligned: preview.length,
          });
        }
      }
      await ensureCompareSeriesDataRef.current(normalized, mode, targetTf, false, cmpRows);
      setCompareItems((prev) => {
        if (prev.some((entry) => entry.symbol === normalized)) {
          return prev.map((entry) =>
            entry.symbol === normalized
              ? { ...entry, hidden: false, mode, timeframe: targetTf, ...(addMode ? { addMode } : {}) }
              : entry,
          );
        }
        const inferredAddMode = (addMode as CompareAddMode) ?? defaultCompareAddMode ?? (mode === "price" ? "newPriceScale" : "samePercent");
        return [...prev, { symbol: normalized, mode, timeframe: targetTf, hidden: false, addMode: inferredAddMode }];
      });
      const inferredAddMode = (addMode as CompareAddMode) ?? defaultCompareAddMode ?? (mode === "price" ? "newPriceScale" : "samePercent");
      await ensureCompareSeriesDataRef.current(normalized, mode, targetTf, false, cmpRows, inferredAddMode);
      toast.success(`${normalized} added`);
    },
    [defaultCompareMode, defaultCompareTimeframe, fetchOhlcv, defaultCompareAddMode],
  );

  const removeCompare = useCallback((sym: string) => {
    const normalized = sym.trim().toUpperCase();
    setCompareItems((prev) => prev.filter((entry) => entry.symbol !== normalized));
  }, []);

  const toggleCompare = useCallback((sym: string) => {
    const normalized = sym.trim().toUpperCase();
    setCompareItems((prev) =>
      prev.map((entry) => (entry.symbol === normalized ? { ...entry, hidden: !entry.hidden } : entry)),
    );
  }, []);

  const setCompareMode = useCallback(
    (sym: string, modeInput: CompareMode | string) => {
      const normalized = sym.trim().toUpperCase();
      const resolvedMode = normalizeCompareMode(modeInput) ?? null;
      if (!resolvedMode) {
        console.warn("[ChartsPro] Ignoring invalid compare mode", { symbol: normalized, mode: modeInput });
        return;
      }
      setCompareItems((prev) =>
        prev.map((entry) => (entry.symbol === normalized ? { ...entry, mode: resolvedMode } : entry)),
      );
      if (resolvedMode === "price") {
        enforceBasePriceScale();
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            enforceBasePriceScale();
          });
        }
      }
    },
    [theme],
  );

  const setCompareTimeframe = useCallback((sym: string, nextTimeframe: Tf) => {
    const normalized = sym.trim().toUpperCase();
    if (!isValidTimeframe(nextTimeframe)) return;
    setCompareItems((prev) =>
      prev.map((entry) => (entry.symbol === normalized ? { ...entry, timeframe: nextTimeframe } : entry)),
    );
  }, []);

  const safeObjectId = useCallback((prefix: string, key: string) => {
    return `${prefix}-${encodeId(key)}`;
  }, []);

  const buildInspectorObjects = useCallback(() => {
    const out: InspectorObject[] = [];
    // base
    out.push({ id: "base", kind: "base", title: `Base ${currentSymbolRef.current ?? symbol}`, paneId: "price", visible: true });
    // volume
    out.push({ id: "volume", kind: "volume", title: "Volume", paneId: "volume", visible: Boolean(volumeSeriesRef.current) });
    // compares
    compareItemsRef.current.forEach((item) => {
      const id = safeObjectId("compare", item.symbol);
      const meta = compareMetaRef.current.get(item.symbol) ?? { mode: item.mode, hidden: item.hidden, timeframe: item.timeframe };
      const paneId = (meta.addMode === "newPane") ? `pane-compare-${encodeId(item.symbol)}` : "price";
      out.push({
        id,
        kind: "compare",
        title: item.symbol,
        paneId,
        visible: !item.hidden,
        removable: true,
        colorHint: colorFor(item.symbol),
        // expose addMode for QA
        addMode: (meta as any).addMode ?? (meta.mode === "price" ? "newPriceScale" : "samePercent"),
      } as any);
    });
    // overlays (sma/ema)
    overlayStateRef.current.sma.forEach((v) => {
      out.push({ id: `overlay-sma-${v}`, kind: "overlay", title: `SMA ${v}`, paneId: "price", visible: true });
    });
    overlayStateRef.current.ema.forEach((v) => {
      out.push({ id: `overlay-ema-${v}`, kind: "overlay", title: `EMA ${v}`, paneId: "price", visible: true });
    });
    // indicators
    indicatorSeriesRef.current.forEach((_, key) => {
      out.push({ id: safeObjectId("indicator", key), kind: "pane-indicator", title: key, paneId: "indicator", visible: true });
    });
    return out;
  }, [safeObjectId, symbol]);

  const handleInspectorToggleVisible = useCallback((id: string) => {
    if (id.startsWith("compare-")) {
      const sym = decodeCompareId(id, compareItemsRef.current.map((item) => item.symbol));
      if (sym) {
        toggleCompare(sym);
      }
      return;
    }
    if (id.startsWith("overlay-")) {
      const parts = id.split("-");
      const group = parts[1] as "sma" | "ema";
      const value = Number(parts[2]);
      toggleOverlay(group, value);
      return;
    }
    // ignore base/volume toggles for now
  }, [toggleCompare, toggleOverlay]);

  const handleInspectorRemove = useCallback((id: string) => {
    if (id.startsWith("compare-")) {
      const sym = decodeCompareId(id, compareItemsRef.current.map((item) => item.symbol));
      if (sym) {
        removeCompare(sym);
      }
    }
  }, [removeCompare]);

  const buildVisibleRows = useCallback((): VisibleRow[] => {
    if (!chartReady || !chartRef.current || !data.length) return [];
    const timeScale = chartRef.current.timeScale();
    const range: TimeRange | null = timeScale.getVisibleRange();
    const from = range ? normalizeTimeKey(range.from) : null;
    const to = range ? normalizeTimeKey(range.to) : null;
    const activeCompares = compareItemsRef.current
      .filter((item) => !item.hidden)
      .slice()
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
    const compareColumns = activeCompares.map((item) => ({
      key: `${item.symbol}_${item.mode}`,
      values: compareValuesRef.current.get(item.symbol),
    }));
    return data
      .filter((bar) => {
        const time = Number(bar.time);
        if (from != null && time < from) return false;
        if (to != null && time > to) return false;
        return true;
      })
      .map((bar) => {
        const row: VisibleRow = {
          time: Number(bar.time),
          base_open: bar.open,
          base_high: bar.high,
          base_low: bar.low,
          base_close: bar.close,
        };
        compareColumns.forEach(({ key, values }) => {
          row[key] = values?.get(Number(bar.time)) ?? null;
        });
        return row;
      });
  }, [chartReady, data]);

  const syncZeroLine = useCallback(
    (rowsOverride?: NormalizedBar[]) => {
      const chart = chartRef.current;
      if (!chart) return;
      const rows = rowsOverride ?? lastLoadedBaseRowsRef.current;
      const requiresZeroLine = compareItemsRef.current.some((item) => !item.hidden && item.mode === "percent");
      if (!requiresZeroLine || !rows.length) {
        if (zeroLineSeriesRef.current) {
          chart.removeSeries(zeroLineSeriesRef.current);
          zeroLineSeriesRef.current = null;
        }
        return;
      }
      if (!zeroLineSeriesRef.current) {
        zeroLineSeriesRef.current = chart.addLineSeries({
          color: theme.priceLine,
          lineStyle: LineStyle.Dashed,
          lineWidth: 1 as const,
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "overlay",
        });
      }
      zeroLineSeriesRef.current.applyOptions({
        color: theme.priceLine,
        lineStyle: LineStyle.Dashed,
        lineWidth: 1 as const,
        priceLineVisible: false,
        lastValueVisible: false,
        priceScaleId: "overlay",
      });
      zeroLineSeriesRef.current.setData(
        rows.map((row) => ({
          time: row.time,
          value: 0,
        })),
      );
    },
    [theme.priceLine],
  );

  function enforceBasePriceScale(rowsOverride?: NormalizedBar[]) {
    const chart = chartRef.current;
    const baseSeries = candleSeriesRef.current;
    if (!chart || !baseSeries) return;
    const appearance = resolveAppearance();
    
    // TV-21.3b: For hollowCandles, preserve the transparent upColor styling
    // (created by seriesFactory) - don't override with appearance.upColor
    const isHollow = baseSeriesTypeRef.current === "hollowCandles";
    
    baseSeries.applyOptions({
      upColor: isHollow ? "transparent" : appearance.upColor,
      downColor: appearance.downColor,
      borderUpColor: appearance.borderVisible ? appearance.borderUp : appearance.upColor,
      borderDownColor: appearance.borderVisible ? appearance.borderDown : appearance.downColor,
      wickUpColor: appearance.wickUp,
      wickDownColor: appearance.wickDown,
      wickVisible: appearance.wickVisible,
      borderVisible: appearance.borderVisible,
      priceScaleId: "right",
    });
    try {
      const rightScale = chart.priceScale("right");
      // TV-19.4: Respect the current scale mode instead of forcing Normal
      const currentMode = baseScaleModeRef.current ?? PriceScaleMode.Normal;
      rightScale.applyOptions({
        mode: currentMode,
        borderVisible: false,
        alignLabels: true,
        scaleMargins: { top: 0.1, bottom: 0.3 },
      });
    } catch {
      // ignore
    }
    syncZeroLine(rowsOverride);
    if (chart.timeScale()) {
      updateBarSpacingGuard(chart.timeScale().getVisibleLogicalRange());
    }
    rebindTestApiWithSample();
  }

  const updateScaleInfo = useCallback(() => {
    const percentActive = compareItemsRef.current.some((item) => !item.hidden && item.mode === "percent");
    const visibleRows = buildVisibleRows();
    if (!percentActive) {
      const values: number[] = [];
      visibleRows.forEach((row) => {
        if (typeof row.base_close === "number" && Number.isFinite(row.base_close)) {
          values.push(row.base_close);
        }
      });
      if (!values.length && lastLoadedBaseRowsRef.current.length) {
        lastLoadedBaseRowsRef.current.forEach((bar) => {
          if (Number.isFinite(bar.close)) values.push(bar.close);
        });
      }
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 1;
      const span = Math.max(1e-6, max - min || Math.abs(max) * 0.1 || 1);
      const steps = 4;
      const ticks: string[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const value = min + (span * i) / steps;
        ticks.push(formatPrice(value));
      }
      scaleInfoRef.current = {
        mode: "price",
        baseMode: describePriceScaleMode(baseScaleModeRef.current),
        overlayMode: describePriceScaleMode(PriceScaleMode.Normal),
        ticks,
        zeroLine: { visible: false, value: 0 },
      };
      return;
    }
    const percentKeys = compareItemsRef.current
      .filter((item) => !item.hidden && item.mode === "percent")
      .map((item) => `${item.symbol}_${item.mode}`);
    const percentValues: number[] = [];
    visibleRows.forEach((row) => {
      percentKeys.forEach((key) => {
        const value = row[key];
        if (typeof value === "number" && Number.isFinite(value)) {
          percentValues.push(value);
        }
      });
    });
    if (!percentValues.length) {
      percentValues.push(-1, 0, 1);
    }
    const min = Math.min(...percentValues);
    const max = Math.max(...percentValues);
    const span = Math.abs(max - min) || 1;
    const steps = 4;
    const ticks: string[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const value = min + (span * i) / steps;
      ticks.push(formatSignedPercent(value));
    }
    scaleInfoRef.current = {
      mode: "percent",
      baseMode: describePriceScaleMode(baseScaleModeRef.current),
      overlayMode: describePriceScaleMode(PriceScaleMode.Percentage),
      ticks,
      zeroLine: { visible: true, value: 0 },
    };
  }, [buildVisibleRows]);

  const applyHoverSnapshot = useCallback(
    (timeKey: number | null) => {
      if (timeKey == null) {
        hoverStateRef.current = null;
        legendStateRef.current = { base: { value: null, color: null }, compares: {} };
        setDataWindowRows([]);
        setHoverBar(null);
        setHoverPrevClose(null);
        return null;
      }
      const bar = mainBarByTime.get(timeKey);
      if (!bar) {
        hoverStateRef.current = null;
        legendStateRef.current = { base: { value: null, color: null }, compares: {} };
        setDataWindowRows([]);
        setHoverBar(null);
        setHoverPrevClose(null);
        return null;
      }
      
      // Calculate previous bar's close for change calculation
      const sortedTimes = Array.from(mainBarByTime.keys()).sort((a, b) => a - b);
      const barIndex = sortedTimes.indexOf(timeKey);
      const prevBar = barIndex > 0 ? mainBarByTime.get(sortedTimes[barIndex - 1]) : null;
      const prevClose = prevBar?.close ?? null;
      
      // Update OHLC strip state
      setHoverBar(bar);
      setHoverPrevClose(prevClose);
      
      const changeRows: DataWindowRow[] = [];
      const infoRows: DataWindowRow[] = [
        { id: "open", group: "Price", label: "O", value: formatPrice(bar.open) },
        { id: "high", group: "Price", label: "H", value: formatPrice(bar.high) },
        { id: "low", group: "Price", label: "L", value: formatPrice(bar.low) },
        { id: "close", group: "Price", label: "C", value: formatPrice(bar.close) },
        { id: "volume", group: "Volume", label: "Vol", value: formatNumber(bar.volume) },
      ];
      const comparesSnapshot: Record<string, { price: number | null; percent: number | null }> = {};
      const baseAnchor = anchorStateRef.current;
      const basePercent =
        baseAnchor && Number.isFinite(baseAnchor.baseClose) && baseAnchor.baseClose !== 0
          ? ((bar.close / baseAnchor.baseClose) - 1) * 100
          : null;
      const baseColor =
        typeof basePercent === "number"
          ? basePercent >= 0
            ? theme.candleUp
            : theme.candleDown
          : theme.axisText;
      const percentModeActive = compareItemsRef.current.some((item) => !item.hidden && item.mode === "percent");
      const baseLegendValue = percentModeActive ? formatSignedPercent(basePercent) : formatPrice(bar.close);
      changeRows.push({
        id: "change-base",
        group: "Change",
        label: symbol,
        value: baseLegendValue,
        color: baseColor,
        valueColor: baseColor,
        symbol,
      });
      const legendSnapshot: LegendSnapshot = {
        base: { value: baseLegendValue, color: baseColor },
        compares: {},
      };
      const sortedCompares = compareItemsRef.current
        .filter((item) => !item.hidden)
        .slice()
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
      sortedCompares.forEach((item) => {
        if (item.hidden) return;
        const valueMap = compareValuesRef.current.get(item.symbol);
        const priceMap = comparePriceValuesRef.current.get(item.symbol);
        const chartValue = valueMap?.get(timeKey) ?? null;
        const priceValue = priceMap?.get(timeKey) ?? null;
        const anchorClose = compareAnchorCloseRef.current.get(item.symbol) ?? null;
        const percent =
          item.mode === "percent" && priceValue != null && anchorClose != null && anchorClose !== 0
            ? ((priceValue / anchorClose) - 1) * 100
            : null;
        comparesSnapshot[item.symbol] = { price: priceValue ?? null, percent };
        const compareColor = colorFor(item.symbol);
        const percentColor =
          typeof percent === "number"
            ? percent >= 0
              ? theme.candleUp
              : theme.candleDown
            : compareColor;
        const legendValue = formatLegendValue(item.mode, chartValue, priceValue, percent);
        changeRows.push({
          id: `change-${item.symbol}`,
          group: "Change",
          label: `${item.symbol} (${item.mode})`,
          value: legendValue,
          color: compareColor,
          valueColor: item.mode === "percent" ? percentColor : compareColor,
          symbol: item.symbol,
        });
      });
      Object.values(indicatorResults).forEach((result) => {
        const owner = indicators.find((indicator) => indicator.id === result.id);
        if (!owner || owner.hidden) return;
        result.lines.forEach((line) => {
          const key = `${result.id}:${line.id}`;
          const map = indicatorValueByTime.get(key);
          if (!map) return;
          const value = map.get(timeKey);
          if (value == null) return;
          infoRows.push({
            id: key,
            group: owner.pane === "price" ? "Overlay" : indicatorDisplayName(result.kind),
            label: line.label ?? indicatorDisplayName(result.kind),
            value: formatPrice(value),
            color: line.color ?? owner.color,
          });
        });
      });
      setDataWindowRows([...changeRows, ...infoRows]);
      changeRows
        .filter((row) => row.symbol && row.id !== "change-base")
        .sort((a, b) => (a.symbol ?? "").localeCompare(b.symbol ?? ""))
        .forEach((row) => {
          if (!row.symbol) return;
          legendSnapshot.compares[row.symbol] = {
            value: row.value,
            color: row.valueColor ?? row.color ?? null,
          };
        });
      legendStateRef.current = legendSnapshot;
      const snapshot: HoverSnapshot = {
        time: timeKey,
        base: {
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          percent: basePercent,
        },
        compares: comparesSnapshot,
      };
      hoverStateRef.current = snapshot;
      return snapshot;
    },
    [indicatorResults, indicatorValueByTime, mainBarByTime, indicators, symbol, theme.axisText, theme.candleDown, theme.candleUp],
  );

  const updateLastValueLabels = useCallback(() => {
    if (!chartRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const height = container.clientHeight;
    if (!height) return;
    const baseSeries = candleSeriesRef.current;
    const themeSnapshot = creationThemeRef.current;
    const nextSnapshot: LastValueSnapshot = { base: null, compares: {} };
    let baseLabel: LastValueLabel | null = null;
    const percentModeActive = compareItemsRef.current.some((item) => !item.hidden && item.mode === "percent");
    if (baseSeries && lastLoadedBaseRowsRef.current.length) {
      const lastBar = lastLoadedBaseRowsRef.current[lastLoadedBaseRowsRef.current.length - 1];
      const coord = baseSeries.priceToCoordinate(lastBar.close);
      if (coord != null) {
        const backgroundColor = lastBar.close >= lastBar.open ? themeSnapshot.candleUp : themeSnapshot.candleDown;
        const basePercent =
          anchorStateRef.current && anchorStateRef.current.baseClose !== 0
            ? ((lastBar.close / anchorStateRef.current.baseClose) - 1) * 100
            : null;
        baseLabel = {
          key: "base",
          text: percentModeActive && basePercent != null ? formatSignedPercent(basePercent) : formatPrice(lastBar.close),
          background: backgroundColor,
          color: "#0f172a",
          y: coord,
        };
        nextSnapshot.base = {
          price: lastBar.close,
          pct: percentModeActive && basePercent != null ? formatSignedPercent(basePercent) : null,
        };
      }
    }
    const compareLabels: LastValueLabel[] = [];
    const sortedCompareItems = compareItemsRef.current.slice().sort((a, b) => a.symbol.localeCompare(b.symbol));
    sortedCompareItems.forEach((item) => {
      if (item.hidden) {
        nextSnapshot.compares[item.symbol] = { price: null, pct: null };
        return;
      }
      const series = compareSeriesMap.get(item.symbol);
      if (!series) {
        nextSnapshot.compares[item.symbol] = { price: null, percent: null };
        return;
      }
      const sourceRows = compareSourceRowsRef.current.get(item.symbol);
      const lastRow = sourceRows?.[sourceRows.length - 1] ?? null;
      const price = lastRow?.close ?? null;
      const anchorClose = compareAnchorCloseRef.current.get(item.symbol) ?? null;
      const percent = anchorClose != null && anchorClose !== 0 && price != null ? ((price / anchorClose) - 1) * 100 : null;
      nextSnapshot.compares[item.symbol] = {
        price,
        pct: item.mode === "percent" && percent != null ? formatSignedPercent(percent) : null,
      };
      const lastValueEntry = seriesLastValueRef.current.get(item.symbol);
      const chartValue = lastValueEntry?.value ?? null;
      if (chartValue == null) return;
      const coord = series.priceToCoordinate(chartValue);
      if (coord == null) return;
      const displayValue =
        item.mode === "percent"
          ? formatSignedPercent(percent)
          : item.mode === "indexed"
            ? Number.isFinite(chartValue)
              ? Number(chartValue).toFixed(2)
              : "-"
            : formatPrice(price ?? chartValue);
      compareLabels.push({
        key: item.symbol,
        text: displayValue,
        background: colorFor(item.symbol),
        color: "#f8fafc",
        y: coord,
      });
    });
    const resolved = resolveLabelPositions(baseLabel, compareLabels, height);
    lastSnapshotRef.current = nextSnapshot;
    setLastValueLabels(resolved);
  }, []);
  updateLastValueLabelsRef.current = updateLastValueLabels;

  const bindTestApi = useCallback(() => {
    if (typeof window === "undefined") return;
    const rootEl = rootRef.current;
    if (!rootEl) return;
    const chartsHelpers: ChartsHelpersApi =
      (window.__chartsHelpers as ChartsHelpersApi | undefined) ?? {
        getPriceCanvas,
        samplePriceCanvasPixelComposite,
        samplePriceCanvasPixel: samplePriceCanvasPixelComposite,
        hoverAt,
      };
    const helperDebug = qaDebugEnabled ? chartsHelpers.debug ?? null : null;
    const usesComposite = typeof chartsHelpers.samplePriceCanvasPixelComposite === "function";
    const helperSample =
      (usesComposite ? chartsHelpers.samplePriceCanvasPixelComposite : chartsHelpers.samplePriceCanvasPixel) ??
      samplePriceCanvasPixelComposite;
    const compositeSource = usesComposite ? "helpers" : "local";
    const runDiagnostics = () => helperDebug?.scan?.(rootEl) ?? scanPriceCanvasDiagnostics(rootEl);
    const describeRenderSnapshot = () => {
      const themeSnapshot = creationThemeRef.current;
      const priceCanvas = chartsHelpers.getPriceCanvas(rootEl);
      const overlayCanvas = overlayCanvasRef.current;
      let overlayZ: number | null = null;
      let hasOpaqueOverlay = false;
      if (overlayCanvas && typeof window !== "undefined") {
        const style = window.getComputedStyle(overlayCanvas);
        const parsedZ = Number.parseInt(style.zIndex ?? "", 10);
        overlayZ = Number.isFinite(parsedZ) ? parsedZ : null;
        const pointerEvents = style.pointerEvents ?? "auto";
        const alpha = parseAlphaFromColor(style.backgroundColor);
        hasOpaqueOverlay = pointerEvents !== "none" && alpha > 0.01;
      }
      const percentOverlayActive = compareItemsRef.current.some(
        (item) => !item.hidden && item.mode === "percent",
      );
      const canvasWidth = priceCanvas?.width ?? 0;
      const canvasHeight = priceCanvas?.height ?? 0;
      const canvasWH = { w: canvasWidth, h: canvasHeight };
      const containerWH = {
        w: containerRef.current?.clientWidth ?? 0,
        h: containerRef.current?.clientHeight ?? 0,
      };
      const timeScale = chartRef.current ? chartRef.current.timeScale() : null;
      let barSpacing: number | null = barSpacingRef.current ?? null;
      let visibleRange: { from: number | null; to: number | null } | null = null;
      let visibleTimeRange: { from: number | null; to: number | null } | null = null;
      let scrollPosition: number | null = null;
      try {
        const opts = typeof timeScale?.options === "function" ? (timeScale as any).options?.() : null;
        if (opts && typeof opts.barSpacing === "number") {
          barSpacing = opts.barSpacing;
        }
        const range = typeof timeScale?.getVisibleLogicalRange === "function" ? timeScale.getVisibleLogicalRange() : null;
        if (range && typeof range.from === "number" && typeof range.to === "number") {
          visibleRange = { from: range.from, to: range.to };
        }
        // Also get actual time range (unix timestamps) for TV-19.2 tests
        const timeRange = typeof timeScale?.getVisibleRange === "function" ? timeScale.getVisibleRange() : null;
        if (timeRange && (typeof timeRange.from === "number" || typeof (timeRange.from as any) === "number")) {
          visibleTimeRange = { 
            from: Number(timeRange.from), 
            to: Number(timeRange.to) 
          };
        }
        if (typeof timeScale?.scrollPosition === "function") {
          scrollPosition = timeScale.scrollPosition();
        }
      } catch {
        // ignore
      }
      if (barSpacing == null && containerWH.w > 0 && visibleRange && visibleRange.to != null && visibleRange.from != null) {
        const span = Math.max(1, visibleRange.to - visibleRange.from);
        barSpacing = Number((containerWH.w / span).toFixed(2));
      }
      if (barSpacing == null) {
        barSpacing = 6;
      }
      const bgColor = window.getComputedStyle(rootEl).backgroundColor?.toLowerCase?.() ?? null;
      const layoutCanvasWH = {
        w: canvasWidth || containerWH.w,
        h: canvasHeight || containerWH.h,
      };
      const panes: Array<{ id: string; h: number }> = [{ id: "price", h: containerRef.current?.clientHeight ?? 0 }];
      // include separate compare panes
      try {
        comparePaneMap.current.forEach((entry, symbol) => {
          const id = `pane-compare-${encodeId(symbol)}`;
          panes.push({ id, h: entry.container.clientHeight ?? 160 });
        });
      } catch {
        // ignore
      }
      const layoutSnapshot = {
        toolbarH: toolbarRef.current?.clientHeight ?? 0,
        rootH: rootEl.clientHeight ?? 0,
        viewportH: containerRef.current?.clientHeight ?? 0,
        canvasH: canvasHeight,
        canvasWH: layoutCanvasWH,
        containerWH,
        panes,
      };
      
      // Day 18 diagnostics: host dimensions, canvas count, data length, last timestamp
      const hostEl = chartRootRef.current;
      const hostWH = {
        w: hostEl?.clientWidth ?? 0,
        h: hostEl?.clientHeight ?? 0,
      };
      const allCanvases = rootEl.querySelectorAll('canvas');
      const canvasCount = allCanvases.length;
      const lastBar = lastLoadedBaseRowsRef.current[lastLoadedBaseRowsRef.current.length - 1];
      
      return {
        hasChart: Boolean(chartRef.current && seriesPointCountsRef.current.price > 0),
        timeframe: timeframeRef.current ?? null,
        canvasW: canvasWidth,
        canvasH: canvasHeight,
        canvasWH,
        layout: layoutSnapshot,
        pricePoints: seriesPointCountsRef.current.price,
        volumePoints: seriesPointCountsRef.current.volume,
        compareCount: Object.keys(seriesPointCountsRef.current.compares).length,
        overlayCount: overlayStateRef.current.sma.length + overlayStateRef.current.ema.length,
        overlayZ,
        hasOpaqueOverlay,
        overlayPercentActive: percentOverlayActive,
        priceScaleModeBase: describePriceScaleMode(baseScaleModeRef.current),
        bgColor,
        barSpacing,
        visibleRange,
        visibleTimeRange,
        scrollPosition,
        // Also expose a compact `scale` object to make QA assertions simpler
        scale: { barSpacing, visibleRange, visibleTimeRange, scrollPosition },
        seriesType: baseSeriesTypeRef.current,
        candlePalette: {
          up: themeSnapshot.candleUp,
          down: themeSnapshot.candleDown,
          borderUp: themeSnapshot.candleBorderUp ?? themeSnapshot.candleUp,
          borderDown: themeSnapshot.candleBorderDown ?? themeSnapshot.candleDown,
          wickUp: themeSnapshot.wickUp,
          wickDown: themeSnapshot.wickDown,
        },
        // TV-21.3b: Expose actual lwcharts series options for hollow candles style verification
        baseSeriesOptions: (() => {
          const series = candleSeriesRef.current;
          if (!series || typeof series.options !== 'function') return null;
          try {
            const opts = series.options();
            // Only expose style-relevant options for QA
            return {
              upColor: opts.upColor ?? null,
              downColor: opts.downColor ?? null,
              borderUpColor: opts.borderUpColor ?? null,
              borderDownColor: opts.borderDownColor ?? null,
              wickUpColor: opts.wickUpColor ?? null,
              wickDownColor: opts.wickDownColor ?? null,
            };
          } catch {
            return null;
          }
        })(),
        lwVersion: LIGHTWEIGHT_CHARTS_VERSION,
        // Day 18 diagnostics
        host: hostWH,
        canvas: {
          w: canvasWidth,
          h: canvasHeight,
          count: canvasCount,
        },
        dataLen: lastLoadedBaseRowsRef.current.length,
        dataRevision: dataRevisionRef.current, // TV-11: Increments on timeframe change (test signal)
      };
    };
    const describeBindings = (): DebugBindingSnapshot => {
      const diag = runDiagnostics();
      const renderSnapshot = describeRenderSnapshot();
      return {
        hasHelpers: Boolean(window.__chartsHelpers),
        usesComposite,
        lastSample: helperDebug?.lastSample ?? null,
        canvases: diag,
        canvasWH: renderSnapshot.canvasWH ?? null,
      };
    };
    const clampSpacing = (value: number) => Math.min(80, Math.max(2, value));
    const resolveBarSpacing = () => {
      if (barSpacingRef.current != null) return barSpacingRef.current;
      const scale = chartRef.current?.timeScale();
      if (scale) {
        try {
          const opts = typeof (scale as any).options === "function" ? (scale as any).options() : null;
          if (opts && typeof opts.barSpacing === "number") {
            return opts.barSpacing as number;
          }
        } catch {
          // ignore
        }
      }
      if (barSpacingGuardRef.current != null) return barSpacingGuardRef.current;
      const width = containerRef.current?.clientWidth ?? 0;
      const range = scale?.getVisibleLogicalRange?.();
      if (width > 0 && range && typeof range.from === "number" && typeof range.to === "number") {
        const span = Math.max(1, range.to - range.from);
        return width / span;
      }
      return 6;
    };
    const debugZoom = (delta = 1) => {
      const chart = chartRef.current;
      if (!chart) return false;
      const scale = chart.timeScale();
      const current = resolveBarSpacing();
      const next = clampSpacing(current + delta);
      scale.applyOptions({ barSpacing: next });
      barSpacingGuardRef.current = next;
      barSpacingRef.current = next;
      queueAfterNextPaint(() => {
        // Ensure derived state (anchor, compares, scale info) is refreshed
        try {
          updateAnchorFromRange(scale.getVisibleRange());
          refreshAllCompares({ reason: "anchor" });
          syncZeroLine();
          updateLastValueLabelsRef.current();
        } catch {
          // ignore
        }
        rebindTestApiWithSample();
      });
      return true;
    };
    const debugPan = (dx = 10, _dy = 0) => {
      const chart = chartRef.current;
      if (!chart) return false;
      const scale = chart.timeScale();
      try {
        const currentPos =
          typeof scale.scrollPosition === "function" ? (scale.scrollPosition() as number | null) ?? 0 : 0;
        const nextPos = currentPos + dx;
        if (typeof scale.scrollToPosition === "function") {
          scale.scrollToPosition(nextPos, false);
          queueAfterNextPaint(() => {
            try {
              updateAnchorFromRange(scale.getVisibleRange());
              // Re-apply base transform if percent mode
              if (compareScaleModeRef.current === "percent") {
                const rows = lastLoadedBaseRowsRef.current;
                if (rows && rows.length) applyBaseSeries(rows);
              }
              refreshAllCompares({ reason: "anchor" });
              syncZeroLine();
              updateLastValueLabelsRef.current();
            } catch {
              // ignore
            }
            rebindTestApiWithSample();
          });
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    };
    updateScaleInfo();
    if (typeof window !== "undefined" && typeof window.__lwcharts?.set !== "function") {
      installLwChartsStub();
    }
    const nextApi: LwChartsApi = {
      chart: chartRef.current,
      priceSeriesRef: candleSeriesRef,
      volumeSeriesRef,
      fit: () => fitToContent(),
      samplePixel: () => helperSample(rootEl),
      hoverAt: (target?: HoverTarget) => {
        if (
          target === "left" ||
          target === "center" ||
          target === "right" ||
          typeof target === "number"
        ) {
          const direct: "left" | "center" | "right" | number =
            typeof target === "number" ? target : target ?? "center";
          return hoverCanvasAt(direct);
        }
        const rows = buildVisibleRows();
        const pickTime = (mode: "mid" | "last" | "first") => {
          if (!rows.length) return null;
          if (mode === "last") {
            const last = rows[rows.length - 1];
            const lastTime = (last as Record<string, number | null>)?.time;
            return typeof lastTime === "number" ? lastTime : null;
          }
          if (mode === "first") {
            const first = rows[0];
            const firstTime = (first as Record<string, number | null>)?.time;
            return typeof firstTime === "number" ? firstTime : null;
          }
          const fallback = rows[Math.floor(rows.length / 2)];
          const fallbackTime = (fallback as Record<string, number | null>)?.time;
          return typeof fallbackTime === "number" ? fallbackTime : null;
        };
        let targetTime: number | null = null;
        if (typeof target === "number") {
          targetTime = target;
        } else if (typeof target === "string") {
          if (target === "last" || target === "right" || target === "anchor") {
            targetTime = pickTime("last");
          } else if (target === "first" || target === "left") {
            targetTime = pickTime("first");
          } else {
            targetTime = pickTime("mid");
          }
        } else {
          targetTime = pickTime("mid");
        }
        const snapshot = applyHoverSnapshot(targetTime ?? null);
        if (snapshot && chartRef.current && candleSeriesRef.current) {
          chartRef.current.setCrosshairPosition(snapshot.base.close, snapshot.time, candleSeriesRef.current);
        } else {
          chartRef.current?.clearCrosshairPosition();
        }
        return snapshot;
      },
      version: LIGHTWEIGHT_CHARTS_VERSION,
      meta: {
        impl: "composite-v3",
        boundAt: Date.now(),
        compositeSource,
      },
      dump: () => {
        updateScaleInfo();
        const objects = buildInspectorObjects();
        const percentBlock = compareScaleMode === "percent" ? {
          anchorTime: percentAnchorRef.current.time,
          anchorIndex: percentAnchorRef.current.index,
          anchorClose: {
            base: percentAnchorRef.current.baseClose,
            compares: { ...percentAnchorRef.current.compareCloses },
          },
          lastPercent: {
            base: percentLastValuesRef.current.base,
            compares: { ...percentLastValuesRef.current.compares },
          },
        } : null;
        const compareStatusBySymbol: Record<string, { status: DataStatus; lastError: string | null; rows: number }> = {};
        compareItemsRef.current.forEach((item) => {
          const rows = compareSourceRowsRef.current.get(item.symbol)?.length ?? 0;
          const status: DataStatus = rows > 0 ? "ready" : isLoading ? "loading" : "idle";
          compareStatusBySymbol[item.symbol] = { status, lastError: null, rows };
        });
        const comparesReady =
          Object.keys(compareStatusBySymbol).length === 0 ||
          Object.values(compareStatusBySymbol).every((entry) => entry.status === "ready" || entry.status === "error");
        const baseReady = data.length > 0;
        const overallStatus: DataStatus = isLoading ? "loading" : baseReady ? "ready" : "idle";
        // TV-37.2: Enhanced data diagnostics for range preset debugging
        const ohlcvRows = lastLoadedBaseRowsRef.current;
        const ohlcvDiagnostics = ohlcvRows.length > 0 ? {
          rowCount: ohlcvRows.length,
          firstTs: Number(ohlcvRows[0].time),
          lastTs: Number(ohlcvRows[ohlcvRows.length - 1].time),
          bar: timeframeRef.current,
          // Human-readable timestamps
          firstIso: new Date(Number(ohlcvRows[0].time) * 1000).toISOString(),
          lastIso: new Date(Number(ohlcvRows[ohlcvRows.length - 1].time) * 1000).toISOString(),
        } : null;
        return {
          symbol: currentSymbolRef.current,
          timeframe: timeframeRef.current,
          pricePoints: seriesPointCountsRef.current.price,
          volumePoints: seriesPointCountsRef.current.volume,
          data: {
            api: { online: true, lastHealthCheck: null },
            status: overallStatus,
            lastError: lastErrorRef.current,
            baseReady,
            comparesReady,
            compareStatusBySymbol,
            // TV-37.2: OHLCV diagnostics for range preset debugging
            ohlcv: ohlcvDiagnostics,
            // TV-37.2: Meta diagnostics (source, fallback, etc.)
            meta: meta ? {
              source: meta.source ?? null,
              fallback: meta.fallback ?? null,
              tz: meta.tz ?? null,
              cache: meta.cache ?? null,
            } : null,
          },
          dataBounds: (() => {
            const rows = lastLoadedBaseRowsRef.current;
            if (!rows || rows.length === 0) return null;
            return {
              firstBarTime: Number(rows[0].time),
              lastBarTime: Number(rows[rows.length - 1].time),
              dataCount: rows.length,
            };
          })(),
          render: {
            ...describeRenderSnapshot(),
                        appliedSettings: appliedSettingsRef.current, // TV-10.3: Expose applied settings for tests
            appliedAppearance: appliedAppearanceRef.current, // TV-23.2: Expose applied appearance for tests
            objects,
            // TV-22.0c: Renko transform metadata for testing
            renko: lastRenkoResultRef.current ? {
              boxSizeUsed: lastRenkoResultRef.current.meta.boxSizeUsed,
              modeUsed: lastRenkoResultRef.current.meta.modeUsed,
              atrPeriodUsed: lastRenkoResultRef.current.meta.atrPeriodUsed,
              bricksCount: lastRenkoResultRef.current.meta.bricksCount,
              roundingUsed: lastRenkoResultRef.current.meta.roundingUsed,
              sample: {
                firstBrick: lastRenkoResultRef.current.meta.firstBrick,
                lastBrick: lastRenkoResultRef.current.meta.lastBrick,
              },
            } : null,
            lastPrice: (() => {
              const lastBar = lastLoadedBaseRowsRef.current[lastLoadedBaseRowsRef.current.length - 1];
              if (!lastBar) return null;
              const barDuration = getBarDurationSeconds(timeframeRef.current);
              const now = Math.floor(Date.now() / 1000);
              const barEndTime = Number(lastBar.time) + barDuration;
              const countdownSec = Math.max(0, barEndTime - now);
              return {
                price: lastBar.close,
                time: Number(lastBar.time),
                countdownSec,
              };
            })(),
            scale: {
              barSpacing: (() => {
                // Prefer cached value, but fall back to chart's actual barSpacing
                if (barSpacingRef.current != null) return barSpacingRef.current;
                try {
                  return chartRef.current?.timeScale().options().barSpacing ?? null;
                } catch {
                  return null;
                }
              })(),
              rightOffset: chartRef.current?.timeScale().scrollPosition() ?? 0,
              priceScaleMode: describePriceScaleMode(baseScaleModeRef.current),
              visibleTimeRange: (() => {
                try {
                  const timeScale = chartRef.current?.timeScale();
                  const range = timeScale?.getVisibleRange?.();
                  if (range && range.from != null && range.to != null) {
                    return { from: Number(range.from), to: Number(range.to) };
                  }
                } catch {
                  // ignore
                }
                return null;
              })(),
              visibleLogicalRange: (() => {
                try {
                  const timeScale = chartRef.current?.timeScale();
                  const range = timeScale?.getVisibleLogicalRange?.();
                  if (range && range.from != null && range.to != null) {
                    return { from: Number(range.from), to: Number(range.to) };
                  }
                } catch {
                  // ignore
                }
                return null;
              })(),
              // TV-34.1: Price scale visible range
              priceRange: (() => {
                try {
                  const priceScale = chartRef.current?.priceScale("right");
                  const range = priceScale?.getVisibleRange?.();
                  if (range && range.from != null && range.to != null) {
                    return { from: Number(range.from), to: Number(range.to) };
                  }
                } catch {
                  // ignore
                }
                return null;
              })(),
              // TV-34.2: Auto-scale state
              autoScale: scaleInteractionsRef.current?.getMetrics?.()?.autoScale ?? true,
            },
            // TV-34.1/34.2/34.3: Scale interaction metrics
            scaleInteraction: scaleInteractionsRef.current?.getMetrics?.() ?? null,
          },
          percent: percentBlock,
          compares: { ...seriesPointCountsRef.current.compares },
          overlays: {
            sma: [...overlayStateRef.current.sma],
            ema: [...overlayStateRef.current.ema],
          },
          scale: { ...scaleInfoRef.current },
          hover: hoverStateRef.current
            ? {
                time: hoverStateRef.current.time,
                base: {
                  open: hoverStateRef.current.base.open,
                  high: hoverStateRef.current.base.high,
                  low: hoverStateRef.current.base.low,
                  close: hoverStateRef.current.base.close,
                  volume: hoverStateRef.current.base.volume,
                  percent: hoverStateRef.current.base.percent,
                },
                compares: Object.fromEntries(
                  Object.entries(hoverStateRef.current.compares).map(([key, entry]) => [
                    key,
                    { price: entry.price, percent: entry.percent },
                  ]),
                ),
                ohlcStrip: {
                  symbol: currentSymbolRef.current,
                  timeframe: timeframeRef.current,
                  open: hoverStateRef.current.base.open.toFixed(2),
                  high: hoverStateRef.current.base.high.toFixed(2),
                  low: hoverStateRef.current.base.low.toFixed(2),
                  close: hoverStateRef.current.base.close.toFixed(2),
                },
              }
            : null,
          legend: {
            base: legendStateRef.current.base,
            compares: { ...legendStateRef.current.compares },
          },
          last: {
            base: lastSnapshotRef.current.base,
            compares: { ...lastSnapshotRef.current.compares },
          },
          comparesMeta: Array.from(compareMetaRef.current.entries()).map(([symbol, meta]) => ({
            symbol,
            mode: meta.mode,
            timeframe: meta.timeframe,
            hidden: Boolean(meta.hidden),
            addMode: (meta as any).addMode ?? (meta.mode === "price" ? "newPriceScale" : "samePercent"),
          })),
          // TV-35.5 + TV-36.4: Enhanced styles/theme state for visual QA
          styles: {
            theme: creationThemeRef.current.name,
            // TV-36.4: Full CSS vars object for Playwright visual parity tests
            cssVars: getThemeCssVars(theme),
            // TV-35.5: Expose key theme tokens for Playwright visual testing
            tokens: {
              canvas: {
                background: theme.canvas.background,
                grid: theme.canvas.grid,
              },
              text: {
                primary: theme.text.primary,
                axis: theme.text.axis,
              },
              candle: {
                up: theme.candle.upColor,
                down: theme.candle.downColor,
              },
              crosshair: theme.crosshairTokens.line,
              watermark: {
                color: theme.watermark.color,
                opacity: theme.watermark.opacity,
              },
              // TV-36.4: Add overlay tokens for unified component testing
              overlay: {
                line: theme.overlay.line,
                selection: theme.overlay.selection,
                handleFill: theme.overlay.handleFill,
                handleStroke: theme.overlay.handleStroke,
                labelBg: theme.overlay.labelBg,
                labelText: theme.overlay.labelText,
                toolbarBg: theme.overlay.toolbarBg,
                toolbarBorder: theme.overlay.toolbarBorder,
                modalBg: theme.overlay.modalBg,
                modalBorder: theme.overlay.modalBorder,
                chipBg: theme.overlay.chipBg,
                chipText: theme.overlay.chipText,
                chipBorder: theme.overlay.chipBorder,
              },
              spacing: { ...theme.spacing },
            },
            typography: {
              fontFamily: theme.typography.fontFamily.axis,
              fontSize: theme.typography.fontSize.sm,
            },
            compareColors: compareItemsRef.current.map((item) => ({
              symbol: item.symbol,
              color: colorFor(item.symbol),
            })),
          },
          ui: {
            // TV-37.2: Include BottomBar state from _state (set by BottomBar component)
            bottomBar: (window as Record<string, unknown>).__lwcharts?._state?.ui?.bottomBar ?? null,
            activeTool: useChartControls.getState().tool, // Read from store for immediate updates
            chartType: chartTypeRef.current,
            timeframe: timeframeRef.current, // TV-11: Expose current timeframe
            settings: chartSettingsRef.current ?? null,
            // TV-23.1: Settings dialog state - read directly from store to avoid render issues
            settingsDialog: (() => {
              const state = useSettingsStore.getState();
              return { isOpen: state.isDialogOpen, activeTab: state.activeTab };
            })(),
            // TV-22.0a: Expose Renko settings for testing
            renko: renkoSettingsRef.current ?? null,
            // TV-20.13: Expose LeftToolbar favorites + recents
            leftToolbar: leftToolbarStateRef.current ?? { favorites: [], recents: [] },
            // TV-20.14: Expose global drawing controls (read from refs for real-time accuracy)
            drawings: {
              hidden: drawingsHiddenRef.current,
              locked: drawingsLockedRef.current,
            },
            inspectorOpen,
            inspectorTab,
            compareScaleMode,
            ohlcStripVisible: showOhlcStrip,
            contextMenu: {
              open: contextMenuStateRef.current.open,
              x: contextMenuStateRef.current.x,
              y: contextMenuStateRef.current.y,
              selectedAction: contextMenuStateRef.current.selectedAction,
            },
            lastContextAction,
            magnet: magnetEnabled,
            snap: snapToClose,
            watermarkVisible: showWatermark,
            // TV-38.1: crosshair state moved to CrosshairOverlayLayer
            crosshair: "managed by CrosshairOverlayLayer",
            volumeVisible: showVolume,
            crosshairEnabled: showCrosshair,
            selectedObjectId: selectedId,
            // TV-39: Layout parity metrics for QA
            layout: {
              // TV-39.1: Header dimensions (target 48-52px)
              headerH: toolbarRef.current?.offsetHeight ?? 50,
              // TV-39.2: Left toolbar dimensions (target 45-50px) - not yet in grid
              leftW: 48,
              // TV-39.3: Bottom bar dimensions (target 38-42px)
              bottomH: 40,
              // TV-39.4: Right panel dimensions (target 300-360px when expanded)
              rightW: sidebarCollapsedRef.current ? 0 : (sidebarWidthRef.current ?? 320),
              rightCollapsed: sidebarCollapsedRef.current,
              // Legacy fields for backward compatibility
              workspaceMode: workspaceModeRef.current,
              sidebarCollapsed: sidebarCollapsedRef.current,
              sidebarWidth: sidebarWidthRef.current,
              viewportWH: {
                w: containerRef.current?.clientWidth ?? 0,
                h: containerRef.current?.clientHeight ?? 0,
              },
              hasNestedScroll: (() => {
                if (!rootRef.current) return false;
                const root = rootRef.current;
                const hasPageScroll = typeof window !== "undefined" && window.scrollY > 0;
                const hasRootScroll = root.scrollTop > 0;
                return hasPageScroll && hasRootScroll;
              })(),
            },
            rightPanel: {
              activeTab: rightPanelActiveTabRef.current,
              collapsed: sidebarCollapsedRef.current,
              width: sidebarWidthRef.current,
            },
            // TV-18.1: Modal state
            modal: {
              open: modalOpenRef.current,
              kind: modalKindRef.current,
            },
            indicators: {
              count: Array.isArray(indicators) ? indicators.length : 0,
              names: Array.isArray(indicators) ? indicators.map((i) => i.kind) : [],
              items: Array.isArray(indicators)
                ? indicators.map((i) => ({
                    id: i.id,
                    name: i.kind.toUpperCase(),
                    pane: i.pane,
                    visible: !i.hidden,
                    paramsSummary: indicatorParamsSummary(i),
                  }))
                : [],
              addOpen: (() => {
                try {
                  const v = window.localStorage?.getItem("cp.indicators.addOpen");
                  return v === "1";
                } catch {
                  return false;
                }
              })(),
            },
            alerts: {
              count: alerts.length,
              ids: alerts.map((a) => a.id),
              selectedId: selectedAlertId,
              items: alerts.map((a) => ({
                id: a.id,
                price: a.price,
                label: a.label || null,
                isSelected: a.id === selectedAlertId,
              })),
              visibleCount: (() => {
                // Count how many alert markers are visible in current price range
                if (!chartRef.current || !candleSeriesRef.current || !alerts.length) return 0;
                try {
                  const priceScale = chartRef.current.priceScale("right");
                  if (!priceScale) return 0;
                  const range = priceScale.getVisibleRange();
                  if (!range) return alerts.length;
                  let visibleCount = 0;
                  alerts.forEach((alert) => {
                    if (alert.price >= range.barHigh && alert.price <= range.barLow) {
                      visibleCount++;
                    }
                  });
                  return visibleCount;
                } catch {
                  return alerts.length;
                }
              })(),
            },
            // TV-30.1: Floating toolbar state
            floatingToolbar: (() => {
              const selectedDrawing = selectedId ? drawings.find(d => d.id === selectedId) : null;
              if (!selectedDrawing || drawingsHiddenRef.current) return null;
              const width = containerRef.current?.clientWidth ?? 0;
              const height = containerRef.current?.clientHeight ?? 0;
              const handlesPx = computeHandlesPx(
                selectedDrawing,
                chartRef.current,
                candleSeriesRef.current as ISeriesApi<SeriesType> | null,
                width,
                height
              );
              const bounds = computeSelectionBounds(handlesPx);
              return {
                visible: !!bounds,
                drawingId: selectedDrawing.id,
                drawingKind: selectedDrawing.kind,
                bounds: bounds ?? null,
                style: selectedDrawing.style ?? null,
                locked: selectedDrawing.locked ?? false,
              };
            })(),
            // TV-30.3: Object settings dialog state
            objectSettingsDialog: {
              isOpen: objectSettingsOpenRef.current,
              drawingId: objectSettingsOpenRef.current && selectedId ? selectedId : null,
            },
            // TV-30.4: Create alert dialog state
            createAlertDialog: {
              isOpen: createAlertOpenRef.current,
              drawingId: createAlertOpenRef.current && selectedId ? selectedId : null,
            },
            // TV-30.6: Style presets state
            presets: getAllPresets(),
            // TV-30.7: Label modal state
            labelModal: {
              isOpen: labelModalOpenRef.current,
              drawingId: labelModalOpenRef.current && selectedId ? selectedId : null,
            },
          },
          // ========== PERFORMANCE METRICS (for debug/QA only) ==========
          perf: {
            crosshair: (() => {
              const metrics = getCrosshairPerfMetrics();
              return {
                rawEvents: metrics.crosshairRawEvents,
                frameCommits: metrics.crosshairFrameCommits,
                bailouts: metrics.crosshairBailouts,
                lastHandlerMs: metrics.lastHandlerMs,
                applyHoverCalls: metrics.applyHoverSnapshotCalls,
                applyHoverMs: metrics.applyHoverSnapshotMs,
                // TV-38.1: Track active handlers (should always be 1 in steady state)
                activeCrosshairHandlers: metrics.activeCrosshairHandlers,
                // Ratio shows how effective RAF throttling is (should be <<1 when working)
                commitRatio: metrics.crosshairRawEvents > 0
                  ? metrics.crosshairFrameCommits / metrics.crosshairRawEvents
                  : 0,
                // Bailout rate shows how often we skip work due to same-bar
                bailoutRate: metrics.crosshairRawEvents > 0
                  ? metrics.crosshairBailouts / metrics.crosshairRawEvents
                  : 0,
              };
            })(),
          },
          // Objects (drawings) contract
          objects: drawings.map((d) => ({
            id: d.id,
            type: d.kind,
            symbol: d.symbol,
            locked: d.locked ?? false,
            hidden: d.hidden ?? false,
            selected: d.id === selectedId,
            label: d.label ?? null,
            // TV-30.8: Include z for z-order tests
            z: d.z,
            // TV-30: Include style for FloatingToolbar tests
            style: d.style ?? null,
            fillColor: (d as any).fillColor ?? null,
            fillOpacity: (d as any).fillOpacity ?? null,
            points: d.kind === "hline" 
              ? [{ price: d.price }]
              : d.kind === "vline"
              ? [{ timeMs: d.timeMs }]
              : d.kind === "trend"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }]
              : d.kind === "ray"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }]
              : d.kind === "extendedLine"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }]
              : d.kind === "rectangle"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }]
              : d.kind === "circle"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }]
              : d.kind === "ellipse"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }]
              : d.kind === "triangle"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }, { timeMs: d.p3.timeMs, price: d.p3.price }]
              : d.kind === "callout"
              ? [{ label: "anchor", timeMs: d.anchor.timeMs, price: d.anchor.price }, { label: "box", timeMs: d.box.timeMs, price: d.box.price }]
              : d.kind === "note"
              ? [{ label: "anchor", timeMs: d.anchor.timeMs, price: d.anchor.price }]
              : d.kind === "text"
              ? [{ timeMs: d.anchor.timeMs, price: d.anchor.price }]
              : d.kind === "channel"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }, { timeMs: d.p3.timeMs, price: d.p3.price }]
              : d.kind === "priceRange"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }]
              : d.kind === "dateRange"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }]
              : d.kind === "dateAndPriceRange"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }]
              : d.kind === "pitchfork"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }, { timeMs: d.p3.timeMs, price: d.p3.price }]
              : d.kind === "schiffPitchfork"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }, { timeMs: d.p3.timeMs, price: d.p3.price }]
              : d.kind === "modifiedSchiffPitchfork"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }, { timeMs: d.p3.timeMs, price: d.p3.price }]
              : d.kind === "flatTopChannel"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }, { timeMs: d.p3.timeMs, price: d.p3.price }]
              : d.kind === "flatBottomChannel"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }, { timeMs: d.p3.timeMs, price: d.p3.price }]
              : d.kind === "fibExtension"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }, { timeMs: d.p3.timeMs, price: d.p3.price }]
              : d.kind === "fibFan"
              ? [{ timeMs: d.p1.timeMs, price: d.p1.price }, { timeMs: d.p2.timeMs, price: d.p2.price }]
              : d.kind === "abcd"
              ? [
                  { label: "A", timeMs: d.p1.timeMs, price: d.p1.price },
                  { label: "B", timeMs: d.p2.timeMs, price: d.p2.price },
                  { label: "C", timeMs: d.p3.timeMs, price: d.p3.price },
                  { label: "D", timeMs: d.p4.timeMs, price: d.p4.price },
                ]
              : d.kind === "headAndShoulders"
              ? [
                  { label: "LS", timeMs: d.p1.timeMs, price: d.p1.price },
                  { label: "Head", timeMs: d.p2.timeMs, price: d.p2.price },
                  { label: "RS", timeMs: d.p3.timeMs, price: d.p3.price },
                  { label: "NL1", timeMs: d.p4.timeMs, price: d.p4.price },
                  { label: "NL2", timeMs: d.p5.timeMs, price: d.p5.price },
                ]
              : d.kind === "elliottWave"
              ? [
                  { label: "0", timeMs: d.p0.timeMs, price: d.p0.price },
                  { label: "1", timeMs: d.p1.timeMs, price: d.p1.price },
                  { label: "2", timeMs: d.p2.timeMs, price: d.p2.price },
                  { label: "3", timeMs: d.p3.timeMs, price: d.p3.price },
                  { label: "4", timeMs: d.p4.timeMs, price: d.p4.price },
                  { label: "5", timeMs: d.p5.timeMs, price: d.p5.price },
                ]
              : [],
            // Raw p1/p2 for trend tests
            ...(d.kind === "trend" && { p1: d.p1, p2: d.p2 }),
            // Raw p1/p2 for ray tests
            ...(d.kind === "ray" && { p1: d.p1, p2: d.p2 }),
            // Raw p1/p2 for extended line tests
            ...(d.kind === "extendedLine" && { p1: d.p1, p2: d.p2 }),
            // Raw p1/p2 for rectangle tests
            ...(d.kind === "rectangle" && { p1: d.p1, p2: d.p2 }),
            // Raw p1/p2 for circle tests (p1=center, p2=edge)
            ...(d.kind === "circle" && { p1: d.p1, p2: d.p2 }),
            // Raw p1/p2 for ellipse tests (p1=center, p2=bounding corner)
            ...(d.kind === "ellipse" && { p1: d.p1, p2: d.p2 }),
            // Raw p1/p2/p3 for triangle tests (3 vertices)
            ...(d.kind === "triangle" && { p1: d.p1, p2: d.p2, p3: d.p3 }),
            // TV-26: Callout anchor, box, text for callout tests
            ...(d.kind === "callout" && { anchor: d.anchor, box: d.box, text: d.text }),
            // TV-27: Note anchor, text for note tests
            ...(d.kind === "note" && { anchor: d.anchor, text: d.text }),
            // Text content for text tests
            ...(d.kind === "text" && { content: d.content, anchor: d.anchor }),
            // PriceRange computed values for measure tests
            ...(d.kind === "priceRange" && {
              p1: d.p1,
              p2: d.p2,
              deltaPrice: d.p2.price - d.p1.price,
              deltaPercent: d.p1.price !== 0 ? ((d.p2.price - d.p1.price) / d.p1.price) * 100 : 0,
            }),
            // DateRange computed values for measure tests
            ...(d.kind === "dateRange" && {
              p1: d.p1,
              p2: d.p2,
              deltaMs: Math.abs(d.p2.timeMs - d.p1.timeMs),
              deltaDays: Math.abs(d.p2.timeMs - d.p1.timeMs) / (1000 * 60 * 60 * 24),
            }),
            // DateAndPriceRange computed values for combined measure tests
            ...(d.kind === "dateAndPriceRange" && {
              p1: d.p1,
              p2: d.p2,
              deltaPrice: d.p2.price - d.p1.price,
              deltaPercent: d.p1.price !== 0 ? ((d.p2.price - d.p1.price) / d.p1.price) * 100 : 0,
              deltaMs: Math.abs(d.p2.timeMs - d.p1.timeMs),
              deltaDays: Math.abs(d.p2.timeMs - d.p1.timeMs) / (1000 * 60 * 60 * 24),
            }),
            // Parallel channel raw points for channel tests
            ...(d.kind === "channel" && {
              p1: d.p1,
              p2: d.p2,
              p3: d.p3,
            }),
            // Pitchfork raw points for pitchfork tests
            ...(d.kind === "pitchfork" && {
              p1: d.p1,
              p2: d.p2,
              p3: d.p3,
            }),
            // Schiff Pitchfork raw points for tests
            ...(d.kind === "schiffPitchfork" && {
              p1: d.p1,
              p2: d.p2,
              p3: d.p3,
            }),
            // Modified Schiff Pitchfork raw points for tests
            ...(d.kind === "modifiedSchiffPitchfork" && {
              p1: d.p1,
              p2: d.p2,
              p3: d.p3,
            }),
            // Flat Top Channel raw points for tests
            ...(d.kind === "flatTopChannel" && {
              p1: d.p1,
              p2: d.p2,
              p3: d.p3,
              flatPrice: d.p3.price, // The horizontal top level
            }),
            // Flat Bottom Channel raw points for tests
            ...(d.kind === "flatBottomChannel" && {
              p1: d.p1,
              p2: d.p2,
              p3: d.p3,
              flatPrice: d.p3.price, // The horizontal bottom level
            }),
            // Regression Trend raw points + computed values for tests
            ...(d.kind === "regressionTrend" && {
              p1: d.p1,
              p2: d.p2,
              points: [d.p1, d.p2],
              // Computed regression values for deterministic testing
              ...(() => {
                const minTime = Math.min(d.p1.timeMs, d.p2.timeMs);
                const maxTime = Math.max(d.p1.timeMs, d.p2.timeMs);
                const barsInWindow = data.filter(
                  (bar) => bar.timestampMs >= minTime && bar.timestampMs <= maxTime
                );
                const n = barsInWindow.length;
                if (n < 2) {
                  return { n, slope: null, intercept: null, stdev: null, bandK: 2, windowStart: minTime, windowEnd: maxTime };
                }
                // Linear regression: y = slope*x + intercept
                let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
                for (let i = 0; i < n; i++) {
                  const x = i;
                  const y = barsInWindow[i].close;
                  sumX += x;
                  sumY += y;
                  sumXY += x * y;
                  sumX2 += x * x;
                }
                const denom = n * sumX2 - sumX * sumX;
                if (denom === 0) {
                  return { n, slope: 0, intercept: sumY / n, stdev: 0, bandK: 2, windowStart: minTime, windowEnd: maxTime };
                }
                const slope = (n * sumXY - sumX * sumY) / denom;
                const intercept = (sumY - slope * sumX) / n;
                // Standard deviation of residuals
                let sumResidual2 = 0;
                for (let i = 0; i < n; i++) {
                  const predicted = slope * i + intercept;
                  const residual = barsInWindow[i].close - predicted;
                  sumResidual2 += residual * residual;
                }
                const stdev = Math.sqrt(sumResidual2 / n);
                return { n, slope, intercept, stdev, bandK: 2, windowStart: minTime, windowEnd: maxTime };
              })(),
            }),
            // Long Position computed values for risk/reward tests
            ...(d.kind === "longPosition" && {
              p1: d.p1,
              p2: d.p2,
              p3: d.p3,
              points: [d.p1, d.p2, d.p3],
              ...(() => {
                const entryPrice = d.p1.price;
                const stopPrice = d.p2.price;
                const targetPrice = d.p3.price;
                const riskPrice = Math.abs(entryPrice - stopPrice);
                const rewardPrice = Math.abs(targetPrice - entryPrice);
                const riskPercent = entryPrice !== 0 ? (riskPrice / entryPrice) * 100 : 0;
                const rewardPercent = entryPrice !== 0 ? (rewardPrice / entryPrice) * 100 : 0;
                const riskRewardRatio = riskPrice > 0 ? rewardPrice / riskPrice : 0;
                return { riskPrice, rewardPrice, riskPercent, rewardPercent, riskRewardRatio };
              })(),
            }),
            // Short Position computed values for risk/reward tests
            ...(d.kind === "shortPosition" && {
              p1: d.p1,
              p2: d.p2,
              p3: d.p3,
              points: [d.p1, d.p2, d.p3],
              ...(() => {
                const entryPrice = d.p1.price;
                const stopPrice = d.p2.price;
                const targetPrice = d.p3.price;
                const riskPrice = Math.abs(stopPrice - entryPrice);
                const rewardPrice = Math.abs(entryPrice - targetPrice);
                const riskPercent = entryPrice !== 0 ? (riskPrice / entryPrice) * 100 : 0;
                const rewardPercent = entryPrice !== 0 ? (rewardPrice / entryPrice) * 100 : 0;
                const riskRewardRatio = riskPrice > 0 ? rewardPrice / riskPrice : 0;
                return { riskPrice, rewardPrice, riskPercent, rewardPercent, riskRewardRatio };
              })(),
            }),
            // FibRetracement computed values for Fibonacci tests
            ...(d.kind === "fibRetracement" && {
              p1: d.p1,
              p2: d.p2,
              levels: (() => {
                const p1Price = d.p1.price;
                const p2Price = d.p2.price;
                const priceRange = p2Price - p1Price;
                // Standard fib levels: 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618
                const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];
                return FIB_RATIOS.map(ratio => ({
                  ratio,
                  price: p2Price - priceRange * ratio,
                }));
              })(),
            }),
            // TV-28.1: FibExtension computed values (3-point: p1=impulse start, p2=impulse end, p3=retracement anchor)
            ...(d.kind === "fibExtension" && {
              p1: d.p1,
              p2: d.p2,
              p3: d.p3,
              levels: (() => {
                // Impulse delta is from p1 to p2
                const impulseDelta = d.p2.price - d.p1.price;
                // Extension levels project from p3 (retracement point)
                const FIB_EXT_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2, 2.618, 3.618, 4.236];
                return FIB_EXT_RATIOS.map(ratio => ({
                  ratio,
                  price: d.p3.price + impulseDelta * ratio,
                }));
              })(),
            }),
            // TV-28.2: FibFan computed values (2-point: p1=anchor, p2=end, rays at fib ratios)
            ...(d.kind === "fibFan" && {
              p1: d.p1,
              p2: d.p2,
              ratios: [0.236, 0.382, 0.5, 0.618, 0.786],
            }),
            // TV-31: ABCD Pattern computed values (4-point: A, B, C, D where D = C + k*(B-A))
            ...(d.kind === "abcd" && {
              p1: d.p1,
              p2: d.p2,
              p3: d.p3,
              p4: d.p4,
              k: d.k,
            }),
            // TV-32: Head & Shoulders Pattern computed values (5-point: LS, Head, RS, NL1, NL2)
            ...(d.kind === "headAndShoulders" && {
              p1: d.p1,
              p2: d.p2,
              p3: d.p3,
              p4: d.p4,
              p5: d.p5,
              inverse: d.inverse,
            }),
            // TV-33: Elliott Wave Impulse computed values (6-point: p0=origin, p1-p5=wave ends)
            ...(d.kind === "elliottWave" && {
              p0: d.p0,
              p1: d.p1,
              p2: d.p2,
              p3: d.p3,
              p4: d.p4,
              p5: d.p5,
              direction: d.direction,
            }),
            // TV-28.0: handlesPx for selected drawing only (enables deterministic drag tests)
            ...(d.id === selectedId && (() => {
              const containerEl = containerRef.current;
              const width = containerEl?.clientWidth ?? 0;
              const height = containerEl?.clientHeight ?? 0;
              const hpx = computeHandlesPx(d, chartRef.current, candleSeriesRef.current as ISeriesApi<SeriesType> | null, width, height);
              return hpx ? { handlesPx: hpx } : {};
            })()),
          })),
          // Alerts contract (count only for now, full list via API)
          alerts: {
            count: 0, // Populated by AlertsPanel via refetch
          },
        };
      },
      compare: {
            list: () =>
              Array.from(compareMetaRef.current.entries()).map(([key, meta]) => ({
                symbol: key,
                mode: meta.mode,
                hidden: Boolean(meta.hidden),
                timeframe: meta.timeframe,
                addMode: (meta as any).addMode ?? (meta.mode === "price" ? "newPriceScale" : "samePercent"),
              })),
        add: (symbol: string, options?: CompareAddInput) => addCompare(symbol, options),
        remove: (s: string) => removeCompare(s),
        mode: (symbolOrMode: string, maybeMode?: CompareMode | string) => {
          if (maybeMode == null) {
            const resolvedMode = normalizeCompareMode(symbolOrMode);
            const latest = compareItemsRef.current[compareItemsRef.current.length - 1];
            if (!resolvedMode || !latest) {
              console.warn("[ChartsPro] compare.mode requires symbol + mode or (mode) with at least one compare");
              return;
            }
            setCompareMode(latest.symbol, resolvedMode);
            return;
          }
          setCompareMode(symbolOrMode, maybeMode);
        },
        toggle: (s: string) => toggleCompare(s),
        timeframe: (symbolOrTf: string, maybeTimeframe?: string) => {
          if (maybeTimeframe == null) {
            const latest = compareItemsRef.current[compareItemsRef.current.length - 1];
            if (!latest) {
              console.warn("[ChartsPro] No compare available to update timeframe");
              return;
            }
            if (!isValidTimeframe(symbolOrTf)) {
              console.warn("[ChartsPro] Ignoring invalid compare timeframe", { timeframe: symbolOrTf });
              return;
            }
            setCompareTimeframe(latest.symbol, symbolOrTf as Tf);
            return;
          }
          if (!isValidTimeframe(maybeTimeframe)) {
            console.warn("[ChartsPro] Ignoring invalid compare timeframe", {
              symbol: symbolOrTf,
              timeframe: maybeTimeframe,
            });
            return;
          }
          setCompareTimeframe(symbolOrTf, maybeTimeframe as Tf);
        },
      },
      dumpVisible: () => buildVisibleRows().map((row) => ({ ...row })),
      export: {
        png: () => exportHandlersLocalRef.current.png?.() ?? null,
        csv: () => exportHandlersLocalRef.current.csv?.() ?? null,
      },
      set: (patch) => {
        if (import.meta.env.DEV) {
          console.log("[set] called with patch:", JSON.stringify(patch));
        }
        // TV-30.8: Handle selectedId specially - update React state via ref for stability
        if ("selectedId" in patch && patch.selectedId !== undefined) {
          onSelectDrawingRef.current(patch.selectedId as string | null);
        }
        // TV-30.8: Handle activeTool - update via controls store
        if ("activeTool" in patch && patch.activeTool !== undefined) {
          useChartControls.getState().setTool(patch.activeTool as any);
        }
        // TV-34.1: Handle barSpacing - apply directly to chart (bypass guard)
        if ("barSpacing" in patch && typeof patch.barSpacing === "number") {
          const chart = chartRef.current;
          if (import.meta.env.DEV) console.log("[set barSpacing] chart:", chart ? "exists" : "null", "value:", patch.barSpacing);
          if (chart) {
            const clamped = Math.max(1, Math.min(50, patch.barSpacing));
            barSpacingLockedRef.current = true; // Lock to prevent guard override
            chart.timeScale().applyOptions({ barSpacing: clamped });
            barSpacingRef.current = clamped;
            barSpacingGuardRef.current = clamped;
            if (import.meta.env.DEV) console.log("[set barSpacing] applied:", clamped);
          }
        }
        // TV-34.2: Handle autoScale - apply directly to chart
        if ("autoScale" in patch && typeof patch.autoScale === "boolean") {
          const chart = chartRef.current;
          if (chart) {
            const priceScale = chart.priceScale("right");
            priceScale?.applyOptions({ autoScale: patch.autoScale });
            onAutoScaleChangeRef.current?.(patch.autoScale); // TV-37.2: Sync UI state via ref
          }
        }
        // TV-34.2: Handle autoFit - trigger auto-fit directly
        if ("autoFit" in patch && patch.autoFit === true) {
          const chart = chartRef.current;
          if (chart) {
            const priceScale = chart.priceScale("right");
            priceScale?.applyOptions({ autoScale: true });
            onAutoScaleChangeRef.current?.(true); // TV-37.2: Sync UI state via ref
          }
        }
        // TV-37.4: Handle timeframe - sync UI state via ref (with validation)
        if ("timeframe" in patch && typeof patch.timeframe === "string") {
          const tf = patch.timeframe as Tf;
          if (TIMEFRAME_VALUE_SET.has(tf)) {
            if (import.meta.env.DEV) console.log("[set timeframe] calling onTimeframeChangeRef with:", tf);
            onTimeframeChangeRef.current?.(tf);
          } else {
            console.warn(`[set timeframe] invalid timeframe "${tf}", valid values: ${[...TIMEFRAME_VALUE_SET].join(", ")}`);
          }
        }
        // TV-34.1: Handle priceRange - disable autoScale (note: LWC doesn't support setVisibleRange on priceScale)
        if ("priceRange" in patch && patch.priceRange && typeof patch.priceRange === "object") {
          const range = patch.priceRange as { from?: number; to?: number };
          if (typeof range.from === "number" && typeof range.to === "number") {
            const chart = chartRef.current;
            if (chart) {
              const priceScale = chart.priceScale("right");
              // Disable autoScale - LWC will fit to visible data range
              priceScale?.applyOptions({ autoScale: false });
              onAutoScaleChangeRef.current?.(false); // TV-37.2: Sync UI state via ref
            }
          }
        }
        // Update window.__lwcharts directly with merged properties
        if (typeof window !== "undefined" && window.__lwcharts) {
          Object.assign(window.__lwcharts, patch);
          return window.__lwcharts;
        }
        Object.assign(nextApi, patch);
        return nextApi;
      },
    };
    const debugApi: LwChartsDebugApi = {
      scan: () => runDiagnostics(),
      paintProbeIfEmpty: () => paintProbeIfEmpty(rootEl),
      dumpBindings: () => describeBindings(),
    };
    if (qaDebugEnabled) {
      debugApi.zoom = debugZoom;
      debugApi.pan = debugPan;
      debugApi.hasApplyPatch = () => typeof window.__lwcharts?._applyPatch === "function";
      const existingDebug = (window.__lwcharts as Partial<LwChartsApi> | undefined)?.debug ?? {};
      nextApi.debug = { ...existingDebug, ...debugApi };
    } else {
      delete nextApi.debug;
    }
    const w = window as typeof window;
    // TV-37.2 FIX: Always assign nextApi directly to ensure our real set() replaces any stub
    // The stub from main.tsx may intercept set() calls, so we need to overwrite completely
    // IMPORTANT: Preserve _state which BottomBar uses for dump().ui.bottomBar state
    const existingState = (w.__lwcharts as Record<string, unknown>)?._state;
    w.__lwcharts = nextApi;
    if (existingState && typeof existingState === "object") {
      (w.__lwcharts as Record<string, unknown>)._state = existingState;
    }
    // TV-38.1: Expose _perf for direct access (bypasses dump() for lightweight monitoring)
    // Now uses module-level metrics from CrosshairOverlayLayer
    (w.__lwcharts as Record<string, unknown>)._perf = {
      get: () => getCrosshairPerfMetrics(),
      reset: () => resetCrosshairPerfMetrics(),
    };
    if (qaDebugEnabled && w.__lwcharts) {
      w.__lwcharts.debug = { ...(w.__lwcharts.debug ?? {}), ...debugApi };
    }
  }, [
    addCompare,
    removeCompare,
    setCompareMode,
    setCompareTimeframe,
    toggleCompare,
    fitToContent,
    buildVisibleRows,
    applyHoverSnapshot,
    exportHandlersLocalRef,
    updateScaleInfo,
    hoverCanvasAt,
    qaDebugEnabled,
    compareScaleMode,
    tool,
    drawings,
    selectedId,
    magnetEnabled,
    snapToClose,
    // onAutoScaleChange: Now uses ref (onAutoScaleChangeRef) for stable access
    // onSelectDrawing: Now uses ref (onSelectDrawingRef) for stable access
    // drawingsHidden, drawingsLocked: Removed - now read from refs for real-time accuracy
  ]);

  bindTestApiRef.current = bindTestApi;

  useEffect(() => {
    bindTestApi();
  }, [overlayState, bindTestApi]);

  useEffect(() => {
    // persist inspector state
    try {
      if (typeof window !== "undefined") {
        window.localStorage?.setItem("chartspro.inspector.open", inspectorOpen ? "1" : "0");
        window.localStorage?.setItem("chartspro.inspector.tab", inspectorTab);
      }
    } catch {
      // ignore
    }
    // FIX 2: Only resize, don't fitToContent if initial 1D range was set
    // This prevents overriding the 485-day view when inspector opens/closes
    queueAfterNextPaint(() => {
      const chart = chartRef.current;
      const host = containerRef.current;
      if (chart && host) {
        const w = Math.floor(host.clientWidth);
        const h = Math.floor(host.clientHeight);
        if (w > 0 && h > 0) {
          chart.resize(w, h);
        }
        // Only fitContent if range hasn't been initialized (non-1D or user has zoomed)
        if (!rangeInitializedRef.current) {
          chart.timeScale().fitContent();
        }
      }
    });
  }, [inspectorOpen, inspectorTab]);

  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail as Record<string, unknown> | undefined;
        if (!detail) return;
        if (typeof detail.inspectorOpen !== "undefined") {
          const next = Boolean(detail.inspectorOpen);
          setInspectorOpen(next);
        }
        if (typeof detail.inspectorTab === "string") {
          setInspectorTabSafe(detail.inspectorTab);
        }
        if (typeof detail.compareScaleMode === "string") {
          const scaleMode = detail.compareScaleMode === "price" || detail.compareScaleMode === "percent"
            ? detail.compareScaleMode
            : null;
          if (scaleMode) {
            setCompareScaleMode(scaleMode);
          }
        }
        if (typeof detail.compareAddMode === "string") {
          const m = detail.compareAddMode as string;
          if (m === "samePercent" || m === "newPriceScale" || m === "newPane") {
            setDefaultCompareAddMode(m as CompareAddMode);
          }
        }
        if (Array.isArray(detail.compares)) {
          try {
            const list = (detail.compares as any[]).map((c) => ({
              symbol: (String(c.symbol || "").trim() || "").toUpperCase(),
              mode: normalizeCompareMode(c.mode) ?? defaultCompareMode,
              timeframe: isValidTimeframe(c.timeframe) ? (c.timeframe as Tf) : defaultCompareTimeframe ?? timeframeRef.current,
              hidden: Boolean(c.hidden),
              addMode: (c as any).addMode && ( (c as any).addMode === "samePercent" || (c as any).addMode === "newPriceScale" || (c as any).addMode === "newPane") ? (c as any).addMode : undefined,
            }));
            setCompareItems(() => list.map((l) => ({ symbol: l.symbol, mode: l.mode, timeframe: l.timeframe, hidden: l.hidden, addMode: l.addMode })));
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener("lwcharts:patch", handler as EventListener);
    return () => window.removeEventListener("lwcharts:patch", handler as EventListener);
  }, []);

  useEffect(() => {
    savePersisted(
      compareItems.map((item) => ({
        symbol: item.symbol,
        mode: item.mode,
        timeframe: item.timeframe,
        addMode: (item as any).addMode ?? undefined,
      })),
    );
    const map = compareMetaRef.current;
    const active = new Set<string>();
    compareItems.forEach((item) => {
      active.add(item.symbol);
      map.set(item.symbol, { mode: item.mode, hidden: item.hidden, timeframe: item.timeframe, addMode: (item as any).addMode });
    });
    Array.from(map.keys()).forEach((key) => {
      if (!active.has(key)) {
        map.delete(key);
        delete seriesPointCountsRef.current.compares[key];
        compareValuesRef.current.delete(key);
        comparePriceValuesRef.current.delete(key);
        compareSourceRowsRef.current.delete(key);
        compareAnchorCloseRef.current.delete(key);
        seriesLastValueRef.current.delete(key);
        // remove any separate pane created for this compare
        const pane = comparePaneMap.current.get(key);
        if (pane) {
          try {
            // remove pane DOM container
            pane.container.remove();
          } catch {
            // ignore
          }
          comparePaneMap.current.delete(key);
        }
      }
    });
    bindTestApi();
  }, [compareItems, bindTestApi]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage?.setItem("chartspro.compareAddMode", defaultCompareAddMode);
      }
    } catch {
      // ignore
    }
  }, [defaultCompareAddMode]);

  const applyBaseSeries = useCallback(
    (bars: NormalizedBar[]) => {
      if (!chartRef.current || !candleSeriesRef.current || !volumeSeriesRef.current) return;
      
      // Store raw bars for reference
      lastLoadedBaseRowsRef.current = bars;
      
      // Determine anchor for percent mode
      let dataToApply = bars;
      let anchorTime: number | null = null;
      let anchorIndex: number | null = null;
      let baseAnchorClose: number | null = null;
      
      if (compareScaleMode === "percent" && bars.length > 0) {
        // Get visible range to find anchor (left-most visible bar)
        try {
          const timeScale = chartRef.current.timeScale();
          const logicalRange = timeScale?.getVisibleLogicalRange?.();
          if (logicalRange && typeof logicalRange.from === "number") {
            // Map logical index to actual bar index (left-most visible)
            anchorIndex = Math.max(0, Math.floor(logicalRange.from));
          } else {
            // Fallback: use first bar
            anchorIndex = 0;
          }
        } catch {
          anchorIndex = 0;
        }
        
        // Get anchor values
        if (anchorIndex >= 0 && anchorIndex < bars.length) {
          const anchorBar = bars[anchorIndex];
          anchorTime = typeof anchorBar.time === "number" ? anchorBar.time : null;
          baseAnchorClose = anchorBar.close ?? null;
          
          // Transform bars to percent
          if (baseAnchorClose && Number.isFinite(baseAnchorClose) && baseAnchorClose !== 0) {
            dataToApply = transformToPctBars(bars, baseAnchorClose);
            
            // Track last percent value (should be ~0 at anchor)
            const lastBar = dataToApply[dataToApply.length - 1];
            percentLastValuesRef.current.base = lastBar?.close ?? null;
          }
        }
        
        // Update anchor ref
        percentAnchorRef.current = {
          time: anchorTime,
          index: anchorIndex,
          baseClose: baseAnchorClose,
          compareCloses: {},
        };
      }
      
      // TV-21.1: Apply Heikin Ashi transform if chartType is heikinAshi
      if (chartType === "heikinAshi" && dataToApply.length > 0) {
        const haBars = transformOhlcToHeikinAshi(dataToApply);
        dataToApply = haBars as NormalizedBar[];
      }
      
      // TV-21.4 + TV-22.0c: Apply Renko transform with settings if chartType is renko
      if (chartType === "renko" && dataToApply.length > 0) {
        // Use renkoSettings from props/ref, with defaults if not provided
        const settings = renkoSettingsRef.current ?? {
          mode: "auto" as const,
          fixedBoxSize: 1,
          atrPeriod: 14,
          autoMinBoxSize: 0.01,
          rounding: "none" as const,
        };
        const renkoResult = transformOhlcToRenkoWithSettings(dataToApply, settings);
        lastRenkoResultRef.current = renkoResult; // Store for dump()
        const renkoCandles = renkoToLwCandlestick(renkoResult.bricks);
        dataToApply = renkoCandles as NormalizedBar[];
      } else {
        // Clear renko result when not in renko mode
        lastRenkoResultRef.current = null;
      }
      
      // Build candle data with transformed values
      const priceData: CandlestickData[] = dataToApply.map((bar) => ({
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }));

      const priceSeriesData = chartType === "line" || chartType === "area"
        ? dataToApply.map((bar) => ({ time: bar.time, value: bar.close }))
        : priceData;

      const priceBounds = describePointBounds(priceData);
      if (!priceBounds.count) {
        candleSeriesRef.current.setData([] as any);
        volumeSeriesRef.current.setData([]);
        seriesPointCountsRef.current.price = 0;
        seriesPointCountsRef.current.volume = 0;
        toast.warning("Inga prisdata efter transform");
        queueAfterNextPaint(() => {
          rebindTestApiWithSample();
        });
        return;
      }
      
      candleSeriesRef.current.setData(priceSeriesData as any);
      
      // Volume stays in original scale (not percentified)
      const volumeData: HistogramData[] = bars.map((bar) => ({
        time: bar.time,
        value: bar.volume,
        color:
          bar.close > bar.open
            ? theme.volumeUp
            : bar.close < bar.open
              ? theme.volumeDown
              : theme.volumeNeutral,
      }));
      volumeSeriesRef.current.setData(volumeData);
      
      enforceBasePriceScale(bars);
      seriesPointCountsRef.current.price = priceSeriesData.length;
      seriesPointCountsRef.current.volume = volumeData.length;
      // FIX 2: Show 485 days for 1D timeframe, fitContent for others
      applyInitialRange(priceSeriesData.length, timeframeRef.current);
      setCompareVersion((tick) => tick + 1);
      updateLastValueLabelsRef.current();
      queueAfterNextPaint(() => {
        rebindTestApiWithSample();
      });
    },
    [
      compareScaleMode,
      applyInitialRange,
      rebindTestApiWithSample,
      theme.candleBorderDown,
      theme.candleBorderUp,
      theme.candleDown,
      theme.candleUp,
      theme.volumeDown,
      theme.volumeNeutral,
      theme.volumeUp,
      theme.wickDown,
      theme.wickUp,
      chartType,
    ],
  );

  const ensureCompareSeriesData = useCallback(
    async (sym: string, mode: CompareMode, tf: Tf, hidden?: boolean, prefetchedRows?: NormalizedBar[], overrideAddMode?: CompareAddMode) => {
      if (!chartRef.current) return;
      const baseRows = lastLoadedBaseRowsRef.current;
      if (!baseRows.length) return;
      const symbolKey = sym.toUpperCase();
      const color = colorFor(symbolKey);
      const chart = chartRef.current;
      let series = compareSeriesMap.get(symbolKey);
      // If a separate pane exists for this compare, prefer its series
      const existingPane = comparePaneMap.current.get(symbolKey);
      // derive per-compare addMode (fallback to sensible default)
      const perCompareEntry = compareItemsRef.current.find((it) => it.symbol === symbolKey);
      const perCompareAddMode: CompareAddMode = overrideAddMode ?? (perCompareEntry?.addMode as CompareAddMode) ?? (mode === "price" ? "newPriceScale" : "samePercent");
      
      // Ensure pane exists for newPane mode (before series creation)
      if (perCompareAddMode === "newPane" && !existingPane) {
        try {
          const paneHost = document.createElement("div");
          paneHost.className = "chartspro-pane";
          paneHost.style.width = "100%";
          paneHost.style.height = "160px";
          paneHost.style.borderTop = "1px solid rgba(255,255,255,0.1)";
          paneHost.setAttribute("data-testid", `pane-${encodeId(symbolKey)}`);
          // Append to dedicated panes container
          if (panesContainerRef.current) {
            panesContainerRef.current.appendChild(paneHost);
          }
          const paneChart = createChart(paneHost, {
            width: containerRef.current?.clientWidth ?? 600,
            height: 160,
            layout: { background: { type: "solid", color: "transparent" } },
          });
          const paneSeries = paneChart.addLineSeries({
            color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            priceScaleId: symbolKey,
          });
          // sync visible range from main chart
          try {
            chartRef.current?.timeScale().subscribeVisibleLogicalRangeChange((range) => {
              try {
                paneChart.timeScale().setVisibleLogicalRange(range as any);
              } catch {
                // ignore
              }
            });
          } catch {
            // ignore
          }
          comparePaneMap.current.set(symbolKey, { chart: paneChart, series: paneSeries, container: paneHost });
          // If we haven't created a main series yet, use the pane series
          if (!series) {
            series = paneSeries;
          }
        } catch (err) {
          console.warn("[ChartsPro] failed to create pane", err);
        }
      }
      
      if (!series) {
        if (existingPane) {
          series = existingPane.series;
        }
      }
      if (!series) {
        series = chart.addLineSeries({
          color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: mode === "price" || perCompareAddMode === "newPriceScale" ? symbolKey : "overlay",
        });
        compareSeriesMap.set(symbolKey, series);
      }
      series.applyOptions({
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        priceScaleId: mode === "price" || perCompareAddMode === "newPriceScale" || perCompareAddMode === "newPane" ? symbolKey : "overlay",
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 3,
        crosshairMarkerBackgroundColor: color,
        crosshairMarkerBorderColor: theme.axisText,
        visible: !hidden,
      });
      const targetTf = isValidTimeframe(tf) ? tf : timeframeRef.current;
      const cmpRows = prefetchedRows ?? (await fetchOhlcv(symbolKey, targetTf));
      compareSourceRowsRef.current.set(symbolKey, cmpRows);
      
      // Handle percent mode transformation (global Y-axis in percent)
      // Determine whether this compare should be rendered in percent relative to base
      const currentScaleMode = compareScaleModeRef.current;
      const effectiveScaleForThisCompare = perCompareAddMode === "samePercent" ? "percent" : currentScaleMode;
      const anchorTime = effectiveScaleForThisCompare === "percent" ? (percentAnchorRef.current?.time ?? anchorStateRef.current?.time) : anchorStateRef.current?.time;
      const anchorClose = findCompareCloseAtOrBefore(cmpRows, anchorTime ?? null);
      if (anchorClose != null) {
        compareAnchorCloseRef.current.set(symbolKey, anchorClose);
        // Only update the global percentAnchor compare closes when global mode is percent
        if (currentScaleMode === "percent") {
          percentAnchorRef.current.compareCloses[symbolKey] = anchorClose;
        }
      } else {
        compareAnchorCloseRef.current.delete(symbolKey);
        if (currentScaleMode === "percent") {
          delete percentAnchorRef.current.compareCloses[symbolKey];
        }
      }
      
      let aligned: Array<{ time: Time; value: number }> = [];
      let closes = new Map<number, number>();
      
      if (effectiveScaleForThisCompare === "percent" && anchorClose != null) {
        // Transform compare to percent relative to compare's own anchor (or shared base anchor)
        // Note: alignCompareToPercentMode expects an anchorClose for the compare series
        aligned = alignCompareToPercentMode(baseRows, cmpRows, anchorClose);
        // Still track original prices for tooltips
        cmpRows.forEach((row) => {
          const ts = lwTimeFromNormalized(row);
          if (ts != null) {
            const baseTimes = new Set<number>();
            baseRows.forEach((br) => {
              const bt = lwTimeFromNormalized(br);
              if (bt != null) baseTimes.add(bt);
            });
            if (baseTimes.has(ts)) {
              closes.set(ts, row.close);
            }
          }
        });
      } else {
        // Original behavior for price/indexed modes
        const { series: transformed, closes: transformedCloses } = alignAndTransform(baseRows, cmpRows, mode, anchorClose);
        aligned = transformed;
        closes = transformedCloses;
      }
      
      if (!aligned.length) {
        series.setData([]);
        compareValuesRef.current.set(symbolKey, new Map());
        comparePriceValuesRef.current.set(symbolKey, new Map());
        seriesPointCountsRef.current.compares[symbolKey] = 0;
        toast.warning("No overlap between base and compare series");
        seriesLastValueRef.current.delete(symbolKey);
        updateLastValueLabelsRef.current();
        rebindTestApiWithSample();
        return;
      }
      series.setData(aligned);
      compareValuesRef.current.set(symbolKey, new Map(aligned.map((point) => [Number(point.time), point.value])));
      comparePriceValuesRef.current.set(symbolKey, closes);
      const lastPoint = aligned[aligned.length - 1];
      seriesLastValueRef.current.set(symbolKey, { value: lastPoint.value, time: Number(lastPoint.time) });
      if (effectiveScaleForThisCompare === "percent") {
        percentLastValuesRef.current.compares[symbolKey] = lastPoint.value;
      }
      seriesPointCountsRef.current.compares[symbolKey] = aligned.length;
      // FIX 2: Don't fitToContent if initial 1D range was set (preserves 485-day view)
      if (!hidden && !rangeInitializedRef.current) {
        fitToContent();
      }
      updateLastValueLabelsRef.current();
      rebindTestApiWithSample();
    },
    [compareSeriesMap, fetchOhlcv, fitToContent, rebindTestApiWithSample, theme.axisText],
  );

  ensureCompareSeriesDataRef.current = ensureCompareSeriesData;

  const refreshAllCompares = useCallback(
    (options?: { cancelled?: () => boolean; reason?: "anchor" }) => {
      const baseRows = lastLoadedBaseRowsRef.current;
      if (!baseRows.length) return;
      compareItemsRef.current.forEach((item) => {
        const cachedRows = compareSourceRowsRef.current.get(item.symbol);
        void ensureCompareSeriesData(item.symbol, item.mode, item.timeframe, item.hidden, cachedRows).catch((err) => {
          if (options?.cancelled?.()) return;
          if (options?.reason === "anchor") return;
          const message = err instanceof Error ? err.message : `Kunde inte ladda ${item.symbol}`;
          toast.warning(message || `Kunde inte ladda ${item.symbol}`);
          setCompareItems((prev) => prev.filter((entry) => entry.symbol !== item.symbol));
        });
      });
    },
    [ensureCompareSeriesData, setCompareItems],
  );

  const updateAnchorFromRange = useCallback((range?: TimeRange | null) => {
    const baseRows = lastLoadedBaseRowsRef.current;
    if (!baseRows.length) {
      anchorStateRef.current = null;
      compareAnchorCloseRef.current.clear();
      return;
    }
    // Use left-most visible bar as anchor
    const target = range ? normalizeTimeKey(range.from) : null;
    const anchorBar = findBarAtOrAfter(baseRows, target);
    if (!anchorBar) {
      anchorStateRef.current = null;
      compareAnchorCloseRef.current.clear();
      return;
    }
    const anchorTime = lwTimeFromNormalized(anchorBar);
    if (anchorTime == null) {
      anchorStateRef.current = null;
      compareAnchorCloseRef.current.clear();
      return;
    }
    anchorStateRef.current = { time: anchorTime, baseClose: anchorBar.close };
    compareAnchorCloseRef.current.clear();
    compareSourceRowsRef.current.forEach((rows, symbol) => {
      const anchorClose = findCompareCloseAtOrAfter(rows, anchorTime);
      if (anchorClose != null) {
        compareAnchorCloseRef.current.set(symbol, anchorClose);
      }
    });
  }, []);

  const applyOverlays = useCallback(() => {
    if (!chartReady) return;
    const chart = chartRef.current;
    if (!chart) return;
    const baseRows = lastLoadedBaseRowsRef.current;
    const map = overlaySeriesRef.current;
    if (!baseRows.length) {
      map.forEach((series) => chart.removeSeries(series));
      map.clear();
      return;
    }
    const activeKeys = new Set<string>();
    overlayState.sma.forEach((length) => {
      const key = `sma-${length}`;
      activeKeys.add(key);
      let series = map.get(key);
      if (!series) {
        series = chart.addLineSeries({
          color: OVERLAY_COLORS[key] ?? "#c084fc",
          lineWidth: 2 as const,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        map.set(key, series);
      }
      series.setData(buildSmaSeries(baseRows, length));
    });
    overlayState.ema.forEach((length) => {
      const key = `ema-${length}`;
      activeKeys.add(key);
      let series = map.get(key);
      if (!series) {
        series = chart.addLineSeries({
          color: OVERLAY_COLORS[key] ?? "#22d3ee",
          lineWidth: 2 as const,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        map.set(key, series);
      }
      series.setData(buildEmaSeries(baseRows, length));
    });
    map.forEach((series, key) => {
      if (!activeKeys.has(key)) {
        chart.removeSeries(series);
        map.delete(key);
      }
    });
  }, [overlayState, chartReady]);

  const loadBase = useCallback(
    async (sym: string, bar: string) => {
      const normalizedSymbol = sym.trim().toUpperCase();
      if (!normalizedSymbol || !bar) return;
      if (!chartRef.current || !candleSeriesRef.current || !volumeSeriesRef.current) return;
      baseFetchAbortRef.current?.abort();
      const controller = new AbortController();
      baseFetchAbortRef.current = controller;
      const requestSeq = ++baseLoadSeqRef.current;
      setBaseLoading(true);
      try {
        if (mockModeActive && isValidTimeframe(bar)) {
          const normalized = getMockOhlcv(normalizedSymbol, bar as Tf);
          lastLoadedBaseRowsRef.current = normalized;
          setData(normalized);
          applyBaseSeries(normalized);
          refreshAllCompares();
          updateLastValueLabelsRef.current();
          return;
        }
        const endpoint = `${safeApiBase}/chart/ohlcv?symbol=${encodeURIComponent(
          normalizedSymbol,
        )}&bar=${encodeURIComponent(bar)}&limit=4000`;
        const res = await fetch(endpoint, { signal: controller.signal });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Kunde inte ladda ${normalizedSymbol}`);
        }
        const payload = await res.json();
        const rows: RawOhlcvRow[] = Array.isArray(payload?.rows)
          ? payload.rows
          : Array.isArray(payload)
            ? payload
            : [];
        if (requestSeq !== baseLoadSeqRef.current) return;
        const normalized = normalizeRows(rows);
        lastLoadedBaseRowsRef.current = normalized;
        setData(normalized);
        applyBaseSeries(normalized);
        refreshAllCompares();
        updateLastValueLabelsRef.current();
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("[ChartsPro] loadBase failed", error);
        toast.error(`Kunde inte ladda ${normalizedSymbol} (${bar})`);
        if (!mockModeActive && isValidTimeframe(bar)) {
          const fallback = getMockOhlcv(normalizedSymbol, bar as Tf);
          if (fallback.length) {
            toast.info(`Visar mock-data f\u00f6r ${normalizedSymbol} (${bar})`);
            lastLoadedBaseRowsRef.current = fallback;
            setData(fallback);
            applyBaseSeries(fallback);
            refreshAllCompares();
            updateLastValueLabelsRef.current();
          }
        }
      } finally {
        if (requestSeq === baseLoadSeqRef.current) {
          setBaseLoading(false);
          if (baseFetchAbortRef.current === controller) {
            baseFetchAbortRef.current = null;
          }
        }
      }
    },
    [applyBaseSeries, mockModeActive, refreshAllCompares, safeApiBase],
  );

  useEffect(() => {
    if (!chartReady) return;
    let cancelled = false;
    refreshAllCompares({ cancelled: () => cancelled });
    compareSeriesMap.forEach((series, key) => {
      if (!compareItems.some((item) => item.symbol === key)) {
        chartRef.current?.removeSeries(series);
        compareSeriesMap.delete(key);
        compareMetaRef.current.delete(key);
        delete seriesPointCountsRef.current.compares[key];
        compareValuesRef.current.delete(key);
        comparePriceValuesRef.current.delete(key);
        compareSourceRowsRef.current.delete(key);
        compareAnchorCloseRef.current.delete(key);
        seriesLastValueRef.current.delete(key);
      }
    });
    // Sync compare metadata (including addMode) for inspector/dump API
    try {
      compareMetaRef.current.clear();
      compareItems.forEach((item) => {
        const inferred = item.addMode ?? (item.mode === "price" ? ("newPriceScale" as CompareAddMode) : ("samePercent" as CompareAddMode));
        compareMetaRef.current.set(item.symbol, {
          mode: item.mode,
          hidden: Boolean(item.hidden),
          timeframe: item.timeframe,
          // store addMode via any-typing extension so downstream code can read it
          ...(Object.prototype.hasOwnProperty.call(item, "addMode") ? { addMode: inferred } : { addMode: inferred }),
        } as any);
      });
    } catch {
      // ignore metadata sync errors
    }
    updateLastValueLabelsRef.current();
    return () => {
      cancelled = true;
    };
  }, [chartReady, compareItems, compareSeriesMap, refreshAllCompares]);

  useEffect(() => {
    if (!chartReady) return;
    syncZeroLine();
  }, [chartReady, compareItems, compareVersion, overlayState, theme, syncZeroLine]);

  const ensureBaseSeries = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const appearance = resolveAppearance();

    // TV-19.4: Map priceScaleMode prop to LightweightCharts PriceScaleMode
    const lwScaleMode = priceScaleMode === "log" 
      ? PriceScaleMode.Logarithmic 
      : priceScaleMode === "percent" 
        ? PriceScaleMode.Percentage 
        : PriceScaleMode.Normal;
    
    // Update ref for dump() exposure
    baseScaleModeRef.current = lwScaleMode;

    // TV-37.2 FIX: Use priceScaleAutoScale prop (boolean) instead of legacy string comparison
    chart.applyOptions({
      layout: { attributionLogo: false } as any,
      rightPriceScale: {
        mode: lwScaleMode,
        autoScale: priceScaleAutoScale, // Use boolean prop, not legacy priceScaleMode === "auto"
        borderVisible: false,
        alignLabels: true,
        scaleMargins: { top: 0.1, bottom: 0.3 },
      },
    });

    // TV-21.4a: chartType is now UIChartType which is a subset of ChartType - no cast needed
    const targetType: ChartType = chartType;
    const needsNewSeries = !candleSeriesRef.current || baseSeriesTypeRef.current !== chartType;

    // TV-37.2 OPT: Capture visible range before series swap to prevent flicker
    let visibleRange: { from: number; to: number } | null = null;
    if (needsNewSeries) {
      try {
        const r = chart.timeScale().getVisibleLogicalRange();
        if (r && r.from != null && r.to != null) {
          visibleRange = { from: r.from, to: r.to };
        }
      } catch {
        // Ignore if chart not ready
      }
    }

    if (needsNewSeries) {
      if (chart && candleSeriesRef.current) {
        try {
          chart.removeSeries(candleSeriesRef.current);
        } catch {
          // ignore
        }
      }
      const next = createBaseSeries(chart, targetType, {
        upColor: appearance.upColor,
        downColor: appearance.downColor,
        borderUpColor: appearance.borderVisible ? appearance.borderUp : appearance.upColor,
        borderDownColor: appearance.borderVisible ? appearance.borderDown : appearance.downColor,
        wickUpColor: appearance.wickUp,
        wickDownColor: appearance.wickDown,
      });
      candleSeriesRef.current = next;
      baseSeriesTypeRef.current = chartType;

      // TV-37.2 OPT: Restore visible range after series swap to prevent scroll reset
      if (visibleRange) {
        requestAnimationFrame(() => {
          try {
            chart.timeScale().setVisibleLogicalRange(visibleRange);
          } catch {
            // Ignore if chart destroyed during raf
          }
        });
      }
    } else if (candleSeriesRef.current) {
      const series = candleSeriesRef.current;
      if (chartType === "candles" || chartType === "bars") {
        series.applyOptions({
          upColor: appearance.upColor,
          downColor: appearance.downColor,
          borderUpColor: appearance.borderVisible ? appearance.borderUp : appearance.upColor,
          borderDownColor: appearance.borderVisible ? appearance.borderDown : appearance.downColor,
          wickUpColor: appearance.wickUp,
          wickDownColor: appearance.wickDown,
          wickVisible: appearance.wickVisible,
          borderVisible: appearance.borderVisible,
          priceScaleId: "right",
        } as any);
      }
      if (chartType === "line" || chartType === "area") {
        series.applyOptions({ color: appearance.upColor } as any);
      }
    }

    if (!volumeSeriesRef.current) {
      volumeSeriesRef.current = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "",
        priceLineVisible: false,
        lastValueVisible: false,
        color: theme.volumeNeutral,
      });
    } else {
      volumeSeriesRef.current.applyOptions({
        priceFormat: { type: "volume" },
        priceScaleId: "",
        priceLineVisible: false,
        lastValueVisible: false,
        color: theme.volumeNeutral,
      });
    }

    try {
      chart.priceScale("right").applyOptions({
        mode: lwScaleMode,
        autoScale: priceScaleAutoScale, // TV-37.2 FIX: Use boolean prop, not legacy string comparison
        borderVisible: false,
        alignLabels: true,
        scaleMargins: { top: 0.1, bottom: 0.3 },
      });
      baseScaleModeRef.current = lwScaleMode;
    } catch (e) {
      // Log in DEV to help debug scale issues
      if (import.meta.env.DEV) console.warn("[ensureBaseSeries] priceScale apply failed:", e);
    }

    enforceBasePriceScale();

    chart.priceScale("").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    rebindTestApiWithSample();
  }, [chartType, priceScaleMode, priceScaleAutoScale, rebindTestApiWithSample, resolveAppearance, theme.volumeNeutral]);
  ensureBaseSeriesRef.current = ensureBaseSeries;

  useEffect(() => {
    ensureBaseSeries();
  }, [ensureBaseSeries]);

  useLayoutEffect(() => {
    let destroyed = false;
    let raf: number | null = null;
    const mountChart = () => {
      if (destroyed) return;
      const host = containerRef.current;
      const mountNode = chartRootRef.current;
      if (!host || !mountNode) {
        raf = requestAnimationFrame(mountChart);
        return;
      }
      const rect = host.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV && !sizeWarnedRef.current) {
          console.warn("[ChartsPro] container has zero size at mount; delaying chart creation");
          sizeWarnedRef.current = true;
        }
        raf = requestAnimationFrame(mountChart);
        return;
      }
      sizeWarnedRef.current = false;
      const themeSnapshot = creationThemeRef.current;
      const chart = createChart(mountNode, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: themeSnapshot.background },
          textColor: themeSnapshot.axisText,
          fontFamily: themeSnapshot.fontFamily,
        },
        grid: {
          horzLines: { color: themeSnapshot.grid, style: LineStyle.Dotted },
          vertLines: { color: themeSnapshot.grid, style: LineStyle.Dotted },
        },
        timeScale: { borderVisible: false, secondsVisible: false, fixLeftEdge: false, fixRightEdge: false },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.3 } },
        watermark: { visible: false },
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: {
            color: themeSnapshot.crosshair,
            width: 1,
            style: LineStyle.Dashed,
            labelVisible: true,
            labelBackgroundColor: themeSnapshot.crosshairLabelBg,
          },
          horzLine: {
            color: themeSnapshot.crosshair,
            labelVisible: true,
            labelBackgroundColor: themeSnapshot.crosshairLabelBg,
          },
        },
      });
      chart.applyOptions({
        layout: { attributionLogo: false } as any,
      });
      chartRef.current = chart;
      ensureBaseSeriesRef.current();
      setChartReady(true);
      if (onChartReady) onChartReady(chart);
      rebindTestApiWithSample();
    };
    mountChart();
    return () => {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      if (chartRef.current && candleSeriesRef.current) {
        chartRef.current.removeSeries(candleSeriesRef.current);
      }
      if (chartRef.current && volumeSeriesRef.current) {
        chartRef.current.removeSeries(volumeSeriesRef.current);
      }
      compareSeriesMap.forEach((series) => chartRef.current?.removeSeries(series));
      indicatorSeriesMap.forEach((series) => chartRef.current?.removeSeries(series));
      compareSeriesMap.clear();
      overlaySeriesRef.current.forEach((series) => chartRef.current?.removeSeries(series));
      overlaySeriesRef.current.clear();
      if (zeroLineSeriesRef.current && chartRef.current) {
        chartRef.current.removeSeries(zeroLineSeriesRef.current);
      }
      zeroLineSeriesRef.current = null;
      indicatorSeriesMap.clear();
      seriesLastValueRef.current.clear();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      setChartReady(false);
    };
  }, [compareSeriesMap, indicatorSeriesMap, rebindTestApiWithSample]);

  useEffect(() => {
    ensureBaseSeries();
  }, [ensureBaseSeries]);

  useEffect(() => {
    updateLastValueLabelsRef.current();
  }, [theme, compareItems, chartReady]);

  // Prime hover state once data is available so dump().hover is never null after initial load.
  useEffect(() => {
    if (!chartReady || hoverStateRef.current || !data.length) return;
    if (!chartRef.current || !candleSeriesRef.current) return;

    const last = data[data.length - 1];
    const timeKey = Number((last as any)?.time);
    if (!Number.isFinite(timeKey)) return;

    const snapshot = applyHoverSnapshot(timeKey);
    if (snapshot) {
      chartRef.current.setCrosshairPosition(snapshot.base.close, snapshot.time, candleSeriesRef.current);
    }
  }, [chartReady, data, applyHoverSnapshot]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      if (chartRef.current) {
        const chart = chartRef.current;
        const ts = chart.timeScale();
        
        // PRIO 2.5: Capture exact range BEFORE resize
        const rangeBeforeResize = rangeInitializedRef.current ? ts.getVisibleLogicalRange() : null;
        
        chart.resize(Math.floor(width), Math.floor(height));
        queueAfterNextPaint(() => {
          // FIX 2: Don't fitToContent if initial 1D range was set (preserves 485-day view)
          // Just resize the canvas, keep the current visible range
          if (chartReady && !rangeInitializedRef.current) {
            fitToContent();
          } else {
            // PRIO 2.5: Restore exact range AFTER resize to prevent drift
            if (rangeBeforeResize) {
              ts.setVisibleLogicalRange(rangeBeforeResize);
            }
            rebindTestApiWithSample();
          }
          updateLastValueLabelsRef.current();
        });
      }
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [chartReady, fitToContent, rebindTestApiWithSample]);

  useEffect(() => {
    if (!chartReady || !chartRef.current) return;
    const chart = chartRef.current;
    const percentActive = compareItems.some((item) => !item.hidden && item.mode === "percent");
    if (!percentActive) return;
    let overlayScale: ReturnType<IChartApi["priceScale"]> | null = null;
    try {
      overlayScale = chart.priceScale("overlay");
    } catch {
      overlayScale = null;
    }
    if (!overlayScale) return;
    overlayScale.applyOptions({
      mode: percentActive ? PriceScaleMode.Percentage : PriceScaleMode.Normal,
      borderVisible: false,
      alignLabels: true,
      scaleMargins: { top: 0.2, bottom: 0.1 },
    });
  }, [chartReady, compareItems]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // TV-35.2: Apply theme with proper typography tokens
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: theme.canvas.background },
        textColor: theme.text.axis,
        fontFamily: theme.typography.fontFamily.axis,
        fontSize: theme.typography.fontSize.sm, // 10px for axis labels
        attributionLogo: false as any,
      },
      grid: {
        horzLines: { 
          color: theme.canvas.grid, 
          style: LineStyle.Dotted,
          visible: true,
        },
        vertLines: { 
          color: theme.canvas.subtleGrid, 
          style: LineStyle.Dotted,
          visible: true,
        },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: theme.crosshairTokens.line,
          width: theme.crosshairTokens.width as 1 | 2 | 3 | 4,
          style: LineStyle.Dashed,
          labelVisible: true,
          labelBackgroundColor: theme.crosshairTokens.labelBackground,
        },
        horzLine: {
          color: theme.crosshairTokens.line,
          labelVisible: true,
          labelBackgroundColor: theme.crosshairTokens.labelBackground,
        },
      },
      rightPriceScale: {
        borderColor: theme.canvas.grid,
      },
      timeScale: {
        borderColor: theme.canvas.grid,
      },
    });
    enforceBasePriceScale();
    syncZeroLine();
    queueAfterNextPaint(() => {
      rebindTestApiWithSample();
    });
  }, [rebindTestApiWithSample, syncZeroLine, theme]);
  // TV-10.3: Apply settings to rendering when chartSettings or chartType changes
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series || !chartSettings) return;

    // Apply chart-level settings (background, grid, crosshair)
    applyChartLevelSettings(chart, chartSettings, theme);

    // Apply series-level settings (colors, borders, wicks)
    applySeriesSettings(series, chartType, chartSettings, theme);

    // Update applied settings snapshot for dump()
    appliedSettingsRef.current = createAppliedSnapshot(chartSettings, chartType);

    // Ensure test API reflects updated state
    queueAfterNextPaint(() => {
      rebindTestApiWithSample();
    });
  }, [chartSettings, chartType, theme, rebindTestApiWithSample]);

  // TV-23.2 + TV-35.2: Apply Zustand settings store appearance to chart when settings change
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !chartReady) return;

    // Subscribe to settings store changes
    const unsubscribe = useSettingsStore.subscribe(
      (state) => state.settings.appearance,
      (appearance) => {
        // Apply chart-level appearance with full theme tokens (TV-35.2)
        applyAppearanceToChart(chart, appearance, theme);

        // Apply series-level appearance if series exists
        const currentSeries = candleSeriesRef.current;
        if (currentSeries) {
          applyAppearanceToSeries(currentSeries, chartType, appearance);
        }

        // Update snapshot for dump()
        appliedAppearanceRef.current = createAppearanceSnapshot(appearance, chartType);

        // Refresh test API
        queueAfterNextPaint(() => {
          rebindTestApiWithSample();
        });
      },
      { fireImmediately: true }
    );

    return () => {
      unsubscribe();
    };
  }, [chartReady, chartType, theme, rebindTestApiWithSample]);

  // TV-22.0b: Re-apply base series when renkoSettings change (only in renko mode)
  useEffect(() => {
    if (!chartReady || chartType !== "renko") return;
    const rows = lastLoadedBaseRowsRef.current;
    if (rows && rows.length > 0) {
      applyBaseSeries(rows);
    }
  }, [chartReady, chartType, renkoSettings, applyBaseSeries]);


  useEffect(() => {
    if (!chartReady || !chartRef.current) return;
    const scale = chartRef.current.timeScale();
    const runSync = () => {
      const visibleRange = scale.getVisibleRange();
      updateAnchorFromRange(visibleRange);
      // If percent mode is active we need to re-apply the base percent transform
      // so the chart and dump() reflect the new anchor (left-most visible).
      try {
        if (compareScaleModeRef.current === "percent") {
          // Re-apply transform to base series relative to new anchor
          const rows = lastLoadedBaseRowsRef.current;
          if (rows && rows.length) {
            applyBaseSeries(rows);
          }
        }
      } catch {
        // ignore
      }
      refreshAllCompares({ reason: "anchor" });
      syncZeroLine();
      updateLastValueLabelsRef.current();
      rebindTestApiWithSample();
    };
    const handler = () => {
      queueAfterNextPaint(() => {
        runSync();
      });
    };
    scale.subscribeVisibleLogicalRangeChange(handler);
    handler();
    return () => scale.unsubscribeVisibleLogicalRangeChange(handler);
  }, [chartReady, refreshAllCompares, rebindTestApiWithSample, updateAnchorFromRange, syncZeroLine]);

  useEffect(() => {
    if (!chartReady || !chartRef.current) return;
    const scale = chartRef.current.timeScale();
    const handler = (range: LogicalRange | null) => {
      updateBarSpacingGuard(range);
      rebindTestApiWithSample();
    };
    scale.subscribeVisibleLogicalRangeChange(handler);
    updateBarSpacingGuard(scale.getVisibleLogicalRange());
    rebindTestApiWithSample();
    return () => scale.unsubscribeVisibleLogicalRangeChange(handler);
  }, [chartReady, rebindTestApiWithSample, updateBarSpacingGuard]);

  useEffect(() => {
    if (!chartReady || !chartRef.current) return;
    queueAfterNextPaint(() => {
      updateAnchorFromRange(chartRef.current?.timeScale().getVisibleRange());
      refreshAllCompares({ reason: "anchor" });
      syncZeroLine();
      updateLastValueLabelsRef.current();
      rebindTestApiWithSample();
    });
  }, [chartReady, data, refreshAllCompares, rebindTestApiWithSample, updateAnchorFromRange, syncZeroLine]);

  useEffect(() => {
    applyOverlays();
  }, [applyOverlays, compareVersion]);

  useEffect(() => {
    if (!chartReady) return;
    void loadBase(symbol, timeframe);
  }, [chartReady, loadBase, symbol, timeframe]);

  useEffect(() => {
    return () => {
      baseFetchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL("../indicators/indicatorWorker.ts", import.meta.url), {
      type: "module",
    });
    indicatorWorkerRef.current = worker;
    worker.onmessage = (event: MessageEvent<IndicatorWorkerResponse>) => {
      const payload = event.data;
      setIndicatorResults((prev) => ({ ...prev, [payload.id]: payload }));
    };
    return () => {
      worker.terminate();
      indicatorWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    setIndicatorResults((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        const owner = indicators.find((indicator) => indicator.id === id);
        if (!owner || owner.hidden) {
          delete next[id];
        }
      });
      return next;
    });
  }, [indicators]);

  useEffect(() => {
    if (!indicatorWorkerRef.current) return;
    visibleIndicators.forEach((indicator) => {
      indicatorWorkerRef.current?.postMessage({
        type: "compute",
        payload: {
          id: indicator.id,
          kind: indicator.kind,
          params: indicator.params,
          color: indicator.color,
          pane: indicator.pane,
          timeframe,
          data,
        },
      });
    });
  }, [visibleIndicators, data, timeframe]);

  useEffect(() => {
    if (!registerExports) return;
    const png = async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))));
      const chart = chartRef.current;
      if (!chart) return null;
      const screenshot = chart.takeScreenshot();
      if (!screenshot) return null;
      const composite = document.createElement("canvas");
      composite.width = screenshot.width;
      composite.height = screenshot.height;
      const ctx = composite.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(screenshot, 0, 0);
      if (overlayCanvasRef.current) {
        ctx.drawImage(
          overlayCanvasRef.current,
          0,
          0,
          overlayCanvasRef.current.width,
          overlayCanvasRef.current.height,
          0,
          0,
          composite.width,
          composite.height,
        );
      }
      return composite.toDataURL("image/png");
    };
    const csv = async () => {
      const rows = buildVisibleRows();
      if (!rows.length) return null;
      const columns = Object.keys(rows[0]);
      const lines = rows.map((row) =>
        columns
          .map((column) => {
            if (column === "time") {
              return String(row[column]);
            }
            if (column.startsWith("base_")) {
              return toCsvCell(row[column]);
            }
            const mode = column.split("_").pop();
            const value = row[column];
            if (mode === "percent") {
              return toCsvCell(formatSignedPercent(typeof value === "number" ? value : null));
            }
            if (mode === "indexed") {
              return toCsvCell(typeof value === "number" ? value.toFixed(2) : "");
            }
            return toCsvCell(typeof value === "number" ? value.toFixed(2) : value);
          })
          .join(","),
      );
      return [columns.join(","), ...lines].join("\n");
    };
    exportHandlersLocalRef.current = { png, csv };
    registerExports({ png, csv });
  }, [registerExports, drawings, chartReady, buildVisibleRows]);

  // PRIO 3: Configure scaleMargins for "separate" indicator panes
  // This gives each oscillator (RSI, MACD, ADX, etc.) its own vertical section
  // TV-style: Price takes ~60%, indicators share remaining ~40% with min-height guarantees
  useEffect(() => {
    const chart = chartRef.current;
    if (!chartReady || !chart) return;
    
    // Collect unique separate indicator IDs
    const separateIndicators = indicators
      .filter(ind => !ind.hidden && ind.pane === "separate")
      .map(ind => ind.id);
    
    if (separateIndicators.length === 0) {
      // Reset price scale to use full height when no separate indicators
      chart.priceScale("right").applyOptions({
        scaleMargins: { top: 0.02, bottom: 0.08 },
      });
      return;
    }
    
    // Calculate vertical sections with min-height guarantees:
    // - Price pane: minimum 50% of chart, up to 65% if few indicators
    // - Each indicator: minimum 10% of chart height
    const MIN_INDICATOR_HEIGHT = 0.10; // 10% minimum per indicator
    const MAX_INDICATORS_ZONE = 0.45; // Indicators can take up to 45%
    const indicatorCount = separateIndicators.length;
    
    // Calculate ideal indicator zone
    const idealIndicatorZone = Math.min(
      indicatorCount * MIN_INDICATOR_HEIGHT + 0.02, // 10% per + 2% buffer
      MAX_INDICATORS_ZONE
    );
    
    // Price zone is the rest
    const priceZoneHeight = 1 - idealIndicatorZone - 0.03; // 3% gap between price and indicators
    const priceTop = 0.02;
    const priceBottom = 1 - priceZoneHeight - priceTop;
    
    // Indicator zone starts after price + gap
    const indicatorZoneStart = 1 - idealIndicatorZone;
    const indicatorZoneEnd = 0.98;
    const indicatorZoneHeight = indicatorZoneEnd - indicatorZoneStart;
    const perIndicatorHeight = indicatorZoneHeight / indicatorCount;
    
    // Configure price scale margins
    chart.priceScale("right").applyOptions({
      scaleMargins: { top: priceTop, bottom: priceBottom },
    });
    
    // Configure each separate indicator scale
    separateIndicators.forEach((indId, index) => {
      const scaleId = `ind_${indId}`;
      const top = indicatorZoneStart + (index * perIndicatorHeight);
      const bottom = 1 - (indicatorZoneStart + ((index + 1) * perIndicatorHeight));
      
      chart.priceScale(scaleId).applyOptions({
        scaleMargins: { top, bottom: Math.max(0.01, bottom) },
        autoScale: true,
        borderVisible: true,
        borderColor: "rgba(54, 58, 69, 0.8)",
      });
    });
  }, [chartReady, indicators]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chartReady || !chart) return;
    const indicatorMap = indicatorSeriesMap;
    const active = new Set<string>();
    Object.values(indicatorResults).forEach((result) => {
      const owner = indicators.find((indicator) => indicator.id === result.id);
      if (!owner || owner.hidden) return;
      result.lines.forEach((line) => {
        const key = `${result.id}:${line.id}`;
        let series = indicatorMap.get(key);
        if (!series) {
          series =
            line.style === "histogram"
              ? chart.addHistogramSeries({
                  color: line.color ?? "#f97316",
                  priceLineVisible: false,
                  lastValueVisible: false,
                  priceScaleId: line.pane === "price" ? "right" : `ind_${result.id}`,
                })
              : chart.addLineSeries({
                  color: line.color ?? "#0ea5e9",
                  lineWidth: (line.lineWidth ?? 2) as LineWidth,
                  priceLineVisible: false,
                  lastValueVisible: false,
                  priceScaleId: line.pane === "price" ? "right" : `ind_${result.id}`,
                });
          indicatorMap.set(key, series);
        } else {
          series.applyOptions({ color: line.color ?? "#0ea5e9" });
        }
        series.setData(line.values);
        active.add(key);
      });
    });
    indicatorMap.forEach((series, key) => {
      if (!active.has(key)) {
        chart.removeSeries(series);
        indicatorMap.delete(key);
      }
    });
  }, [chartReady, indicatorResults, indicatorSeriesMap, indicators]);

  // Last price Y position tracking
  useEffect(() => {
    if (!chartReady || !candleSeriesRef.current || !data.length) {
      setLastPriceY(null);
      return;
    }
    
    const lastBar = data[data.length - 1];
    const series = candleSeriesRef.current;
    
    try {
      // Get the Y coordinate for the last close price
      const yCoord = series.priceToCoordinate(lastBar.close);
      setLastPriceY(yCoord ?? null);
    } catch {
      setLastPriceY(null);
    }
  }, [chartReady, data]);

  // TV-38.1: Crosshair subscription REMOVED from ChartViewport
  // Now handled by CrosshairOverlayLayer component, which:
  // - Owns its own subscription and state
  // - Isolates crosshair updates from ChartViewport render cycle
  // - Provides RAF-throttling and bail-early optimization
  // - Tracks activeCrosshairHandlers for double-subscription detection

  const indicatorLegendItems = useMemo(
    () =>
      indicators.map((indicator) => {
        const result = indicatorResults[indicator.id];
        const primaryLine = result?.lines?.[0];
        const values = primaryLine?.values ?? [];
        const lastValue = values.length ? values[values.length - 1]?.value : null;
        const status = result?.error
          ? result.error
          : lastValue != null
            ? formatPrice(lastValue)
            : result
              ? "…"
              : "Pending";
        return {
          id: indicator.id,
          label: indicatorDisplayName(indicator.kind),
          pane: indicator.pane,
          color: indicator.color,
          hidden: Boolean(indicator.hidden),
          status,
          error: result?.error ?? null,
        };
      }),
    [indicators, indicatorResults],
  );

  const groupedDataRows = useMemo(() => {
    const groups = new Map<string, DataWindowRow[]>();
    dataWindowRows.forEach((row) => {
      const bucket = groups.get(row.group) ?? [];
      bucket.push(row);
      groups.set(row.group, bucket);
    });
    return Array.from(groups.entries());
  }, [dataWindowRows]);
  const metaItems = useMemo(() => {
    if (!meta) return [];
    const entries: Array<{ label: string; value: string }> = [];
    if (meta.source) entries.push({ label: "Source", value: meta.source });
    if (meta.tz) entries.push({ label: "TZ", value: meta.tz });
    if (meta.cache) entries.push({ label: "Cache", value: meta.cache });
    if (typeof meta.fallback === "boolean")
      entries.push({ label: "Fallback", value: meta.fallback ? "Yes" : "No" });
    return entries;
  }, [meta]);
  const debugSummary = useMemo(() => {
    if (!debugModeActive) return null;
    const baseBounds = describeBarBounds(lastLoadedBaseRowsRef.current ?? []);
    const compares = compareItems.map((item) => ({
      ...item,
      count: seriesPointCountsRef.current.compares[item.symbol] ?? 0,
    }));
    return { baseBounds, compares };
  }, [compareItems, compareVersion, debugModeActive]);

  // TV-36.1: Generate CSS custom properties from theme for cascading to all children
  const themeCssVars = useMemo(() => getThemeCssVars(theme), [theme]);

  return (
    <div 
      ref={rootRef} 
      className="chartspro-root flex h-full flex-col overflow-hidden rounded-lg"
      style={{
        ...themeCssVars,
        backgroundColor: "var(--cp-bg)",
      }}
      data-theme={theme.name}
    >
      {/* FIX 3: Conditionally render toolbar (hidden when controls are in TVCompactHeader) */}
      {!hideToolbar && (
      <div
        ref={toolbarRef}
        className="flex-none border-b border-slate-800/40 bg-slate-950/40 flex flex-wrap items-center"
        style={{
          padding: "var(--cp-pad-sm) var(--cp-pad)",
          gap: "var(--cp-gap)",
        }}
      >
        <CompareToolbar
          items={compareItems}
          defaultMode={defaultCompareMode}
          defaultTimeframe={defaultCompareTimeframe}
          compareScaleMode={compareScaleMode}
          onAdd={addCompare}
          onRemove={removeCompare}
          onToggle={toggleCompare}
          onMode={setCompareMode}
          onTimeframe={setCompareTimeframe}
          onDefaultsChange={({ mode, timeframe }) => {
            setDefaultCompareMode(mode);
            setDefaultCompareTimeframe(timeframe);
          }}
          onCompareScaleModeChange={setCompareScaleMode}
        />
        <OverlayToggles state={overlayState} onToggle={toggleOverlay} />
        <div>
          <button
            type="button"
            data-testid="chartspro-inspector-toggle"
            onClick={() => setInspectorOpen((v) => !v)}
            className="rounded border px-2 py-1 text-xs text-slate-200 hover:bg-slate-800/30"
          >
            Inspector
          </button>
        </div>
      </div>
      )}
        <div ref={containerRef} className="chartspro-surface relative flex-1 min-h-0 overflow-hidden" onContextMenu={handleContextMenu} style={{ display: 'grid', gridTemplateRows: inspectorOpen ? '1fr auto' : '1fr 0px' }}>
          <div className="min-h-0 min-w-0 relative" style={{ display: 'flex' }}>
            <div
              ref={chartRootRef}
              className="chartspro-price"
              style={{ flex: '1 1 0%', minHeight: 0, minWidth: 0, position: 'relative' }}
            >
        {/* Symbol watermark in background */}
        <Watermark symbol={symbol} visible={showWatermark} theme={theme} />
        
        {/* TradingView-style OHLC Strip */}
        {showOhlcStrip && (
          <OhlcStrip
            symbol={symbol}
            timeframe={timeframe}
            bar={hoverBar ?? (data.length ? data[data.length - 1] : null)}
            prevClose={hoverPrevClose ?? (data.length > 1 ? data[data.length - 2]?.close ?? null : null)}
            theme={theme}
          />
        )}
        
        {/* TV-38.1: Crosshair overlay layer - isolated from ChartViewport render cycle */}
        <CrosshairOverlayLayer
          chartRef={chartRef}
          chartReady={chartReady}
          theme={theme}
          containerRef={containerRef}
          timeframe={timeframe}
          barByTime={mainBarByTime}
          showCrosshair={showCrosshair}
          onHoverSnapshot={applyHoverSnapshot}
        />
        
        {/* Last price line with countdown */}
        <LastPriceLine
          lastPrice={data.length ? data[data.length - 1].close : null}
          lastTime={data.length ? Number(data[data.length - 1].time) : null}
          timeframe={timeframe}
          yPosition={lastPriceY}
          theme={theme}
          containerWidth={containerRef.current?.clientWidth ?? 0}
        />
        {debugModeActive && debugSummary ? (
          <div className="absolute right-2 top-2 z-40 w-64 rounded border border-slate-700/70 bg-slate-900/90 p-2 text-[11px] text-slate-100 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <span>Base: {debugSummary.baseBounds.count} pts</span>
              <button
                type="button"
                className="rounded border border-slate-700/80 px-1 py-0.5 text-[10px] uppercase text-slate-200"
                onClick={() => fitToContent()}
              >
                Fit
              </button>
            </div>
            <div className="text-[10px] text-slate-400">{formatBounds(debugSummary.baseBounds)}</div>
            {debugSummary.compares.map((item) => (
              <div key={`${item.symbol}-${item.timeframe}`} className="mt-1 border-t border-slate-700/40 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <span>{item.symbol}</span>
                  <span>{item.count} pts</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  {item.timeframe} | {item.mode} {item.hidden ? "(hidden)" : ""}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {chartReady ? (
          <div className={overlayWrapperClassName}>
            <OverlayCanvasLayer
              containerRef={containerRef}
              className={overlayCanvasClassName}
              pointerEvents={"none"}
              onCanvasReady={(canvas) => {
                overlayCanvasRef.current = canvas;
              }}
            >
              <DrawingLayer
                chart={chartRef.current}
                candleSeries={candleSeriesRef.current}
                containerRef={containerRef}
                data={data}
                timeframe={timeframe}
                symbol={symbol}
                drawings={drawings}
                selectedId={selectedId}
                tool={tool}
                magnetEnabled={magnetEnabled}
                snapToClose={snapToClose}
                theme={theme}
                onSelect={onSelectDrawing}
                onUpsert={onUpsertDrawing}
                onRemove={onRemoveDrawing}
                duplicateDrawing={duplicateDrawing}
                onToggleLock={onToggleLock}
                onToggleHide={onToggleHide}
                setTool={setTool}
                onTextCreated={onTextCreated}
                onTextEdit={onTextEdit}
                globalHidden={drawingsHidden}
                globalLocked={drawingsLocked}
              />
            </OverlayCanvasLayer>
            {/* TV-8.2: Alert markers layer – renders dashed lines + bell icons */}
            <AlertMarkersLayer
              chart={chartRef.current}
              series={candleSeriesRef.current}
              alerts={alerts}
              selectedAlertId={selectedAlertId}
              onMarkerClick={(alertId) => setSelectedAlertId(alertId)}
              theme={theme.mode}
            />
            {/* TV-30.1: Floating Toolbar for selected drawing */}
            {(() => {
              // Find selected drawing
              const selectedDrawing = selectedId ? drawings.find(d => d.id === selectedId) : null;
              if (!selectedDrawing || drawingsHidden) return null;

              // TV-30.1c: Use chartRootRef for positioning since bounds come from chart coordinates
              const chartEl = chartRootRef.current;
              const width = chartEl?.clientWidth ?? 0;
              const height = chartEl?.clientHeight ?? 0;
              const handlesPx = computeHandlesPx(
                selectedDrawing, 
                chartRef.current, 
                candleSeriesRef.current as ISeriesApi<SeriesType> | null, 
                width, 
                height
              );
              const bounds = computeSelectionBounds(handlesPx);

              if (!bounds) return null;

              return (
                <FloatingToolbar
                  drawing={selectedDrawing}
                  bounds={bounds}
                  containerRef={chartRootRef}
                  drawingsHidden={drawingsHidden}
                  onUpdateStyle={(stylePatch) => {
                    const updated = {
                      ...selectedDrawing,
                      style: { ...selectedDrawing.style, ...stylePatch } as any,
                      updatedAt: Date.now(),
                    };
                    onUpsertDrawing(updated);
                  }}
                  onUpdateFill={(fillColor, fillOpacity) => {
                    const updated = {
                      ...selectedDrawing,
                      fillColor,
                      fillOpacity: fillOpacity ?? selectedDrawing.fillOpacity ?? 0.10,
                      updatedAt: Date.now(),
                    } as any;
                    onUpsertDrawing(updated);
                  }}
                  onToggleLock={() => {
                    onToggleLock(selectedDrawing.id);
                  }}
                  onToggleHidden={() => {
                    onToggleHide(selectedDrawing.id);
                  }}
                  onDelete={() => {
                    onRemoveDrawing(selectedDrawing.id);
                  }}
                  onOpenSettings={() => {
                    setObjectSettingsOpen(true);
                  }}
                  onCreateAlert={() => {
                    setCreateAlertOpen(true);
                  }}
                  onEditLabel={() => {
                    setLabelModalOpen(true);
                  }}
                  onBringToFront={() => {
                    // TV-30.8: Bring selected drawing to front (max z + 1)
                    if (drawings.length <= 1) return;
                    const zValues = drawings.map((d) => Number.isFinite(d.z) ? d.z : 0);
                    const maxZ = Math.max(...zValues);
                    const currentZ = Number.isFinite(selectedDrawing.z) ? selectedDrawing.z : 0;
                    if (currentZ === maxZ) return; // Already at front
                    const updated = {
                      ...selectedDrawing,
                      z: maxZ + 1,
                      updatedAt: Date.now(),
                    };
                    onUpsertDrawing(updated);
                  }}
                  onSendToBack={() => {
                    // TV-30.8: Send selected drawing to back (min z - 1)
                    if (drawings.length <= 1) return;
                    const zValues = drawings.map((d) => Number.isFinite(d.z) ? d.z : 0);
                    const minZ = Math.min(...zValues);
                    const currentZ = Number.isFinite(selectedDrawing.z) ? selectedDrawing.z : 0;
                    if (currentZ === minZ) return; // Already at back
                    const updated = {
                      ...selectedDrawing,
                      z: minZ - 1,
                      updatedAt: Date.now(),
                    };
                    onUpsertDrawing(updated);
                  }}
                  onApplyPreset={(preset: Preset) => {
                    // TV-30.6: Apply preset style to selected drawing
                    const updates = applyPresetToDrawing(preset);
                    const updated = {
                      ...selectedDrawing,
                      style: { ...selectedDrawing.style, ...updates.style } as any,
                      fillColor: updates.fillColor ?? (selectedDrawing as any).fillColor,
                      fillOpacity: updates.fillOpacity ?? (selectedDrawing as any).fillOpacity,
                      updatedAt: Date.now(),
                    } as any;
                    onUpsertDrawing(updated);
                  }}
                />
              );
            })()}
          </div>
        ) : null}
        {lastValueLabels.base || lastValueLabels.compares.length ? (
          <div className="chartspro-last-labels pointer-events-none">
            {lastValueLabels.base ? (
              <div
                className="chartspro-last-label chartspro-last-label--base"
                style={{
                  top: `${lastValueLabels.base.y - 10}px`,
                  backgroundColor: lastValueLabels.base.background,
                  color: lastValueLabels.base.color,
                }}
              >
                {lastValueLabels.base.text}
              </div>
            ) : null}
            {lastValueLabels.compares.map((label) => (
              <div
                key={`compare-last-${label.key}`}
                className="chartspro-last-label chartspro-last-label--compare"
                style={{
                  top: `${label.y - 10}px`,
                  backgroundColor: label.background,
                  color: label.color,
                }}
              >
                {label.text}
              </div>
            ))}
          </div>
        ) : null}
        {(!data.length || isLoading) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/40 text-slate-100 backdrop-blur-sm">
            {isLoading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm tracking-wide">Laddar candles.</span>
              </>
            ) : (
              <span className="text-sm text-slate-300">
                No data for {symbol} ({timeframe})
              </span>
            )}
          </div>
        )}
        {/* Data Window */}
        {groupedDataRows.length ? (
          <div className="chartspro-data-window absolute left-2 top-2">
            {groupedDataRows.map(([group, rows]) => (
              <div key={group} className="chartspro-data-window__section">
                <div className="chartspro-data-window__title">{group}</div>
                {rows.map((row) => (
                  <div key={row.id} className="chartspro-data-window__row">
                    <span className="chartspro-data-window__label" style={{ color: row.color ?? undefined }}>
                      {row.label}
                    </span>
                    <span
                      className="chartspro-data-window__value"
                      style={{ color: row.valueColor ?? undefined }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
        {indicatorLegendItems.length ? (
          <div className="chartspro-legend chartspro-legend--indicator">
            {indicatorLegendItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chartspro-legend__item ${item.hidden ? "is-muted" : ""}`}
                onClick={() => onUpdateIndicator?.(item.id, { hidden: !item.hidden })}
                disabled={!onUpdateIndicator}
              >
                <span className="chartspro-legend__dot" style={{ backgroundColor: item.color }} />
                <div className="chartspro-legend__text">
                  <span className="chartspro-legend__label">
                    {item.label} · {item.pane === "price" ? "Overlay" : "Pane"}
                  </span>
                  <span className="chartspro-legend__value">{item.status}</span>
                </div>
                {item.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        ) : null}
        {metaItems.length ? (
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-2 text-[11px] font-medium text-slate-300 opacity-80">
            {metaItems.map((item) => (
              <span key={`${item.label}-${item.value}`} className="rounded bg-slate-900/60 px-2 py-0.5">
                {item.label}: {item.value}
              </span>
            ))}
          </div>
        ) : null}
            </div>
            <div ref={panesContainerRef} style={{ height: 0, overflow: 'hidden' }} />
        </div>
        <div data-testid="inspector-root" className="overflow-hidden" style={{ minHeight: 0 }}>
          <InspectorSidebar
            open={inspectorOpen}
            tab={inspectorTab}
            onTabChange={(t) => setInspectorTab(t)}
            onClose={() => setInspectorOpen(false)}
            objects={buildInspectorObjects()}
            hover={hoverStateRef.current}
            lastLegend={{ base: legendStateRef.current.base, compares: { ...legendStateRef.current.compares } }}
            onToggleVisible={handleInspectorToggleVisible}
            onRemove={handleInspectorRemove}
          />
        </div>
      </div>
      {/* Context Menu */}
      <ContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        actions={DEFAULT_CHART_ACTIONS}
        onAction={handleContextMenuAction}
        onClose={handleContextMenuClose}
        theme={theme}
      />
      {/* TV-30.3: Object Settings Modal */}
      <ObjectSettingsModal
        open={objectSettingsOpen}
        drawing={selectedDrawing ?? null}
        onClose={() => setObjectSettingsOpen(false)}
        onSave={(updated) => {
          onUpsertDrawing(updated);
        }}
        onDelete={() => {
          if (selectedDrawing) {
            onRemoveDrawing(selectedDrawing.id);
            setObjectSettingsOpen(false);
          }
        }}
        onToggleLock={() => {
          if (selectedDrawing) {
            onToggleLock(selectedDrawing.id);
          }
        }}
      />
      {/* TV-30.4: Create Alert Modal */}
      <CreateAlertModal
        open={createAlertOpen}
        drawing={selectedDrawing ?? null}
        apiBase={apiBase}
        symbol={symbol}
        timeframe={timeframe}
        onClose={() => setCreateAlertOpen(false)}
        onAlertCreated={() => {
          void fetchAlerts();
          setCreateAlertOpen(false);
        }}
      />
      {/* TV-30.7: Label Modal */}
      <LabelModal
        open={labelModalOpen}
        initialLabel={selectedDrawing?.label ?? ""}
        drawingKind={selectedDrawing?.kind ?? "trend"}
        onSave={(label) => {
          if (selectedDrawing) {
            const updated = {
              ...selectedDrawing,
              label,
              updatedAt: Date.now(),
            };
            onUpsertDrawing(updated);
          }
          setLabelModalOpen(false);
        }}
        onClose={() => setLabelModalOpen(false)}
      />
    </div>
  );
}

function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toPrecision(3);
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

function isValidTimeframe(value: string | Tf | null | undefined): value is Tf {
  if (!value) return false;
  return TIMEFRAME_VALUE_SET.has(value as Tf);
}

function formatTimestamp(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Date(value * 1000).toISOString().replace("T", " ").slice(0, 16);
}

function formatBounds(bounds: { minTime: number | null; maxTime: number | null }) {
  const start = formatTimestamp(bounds.minTime);
  const end = formatTimestamp(bounds.maxTime);
  return `${start} -> ${end}`;
}

function resolveLabelPositions(
  baseLabel: LastValueLabel | null,
  compareLabels: LastValueLabel[],
  height: number,
): { base: LastValueLabel | null; compares: LastValueLabel[] } {
  const entries: Array<{ type: "base" | "compare"; label: LastValueLabel }> = [];
  if (baseLabel) {
    entries.push({ type: "base", label: { ...baseLabel } });
  }
  compareLabels.forEach((label) => entries.push({ type: "compare", label: { ...label } }));
  if (!entries.length) {
    return { base: null, compares: [] };
  }
  const sorted = [...entries].sort((a, b) => a.label.y - b.label.y);
  const minGap = 18;
  const minY = 10;
  const maxY = Math.max(minY, height - 10);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].label.y - sorted[i - 1].label.y < minGap) {
      sorted[i].label.y = sorted[i - 1].label.y + minGap;
    }
  }
  for (let i = sorted.length - 2; i >= 0; i -= 1) {
    if (sorted[i + 1].label.y - sorted[i].label.y < minGap) {
      sorted[i].label.y = sorted[i + 1].label.y - minGap;
    }
  }
  sorted.forEach((entry) => {
    entry.label.y = Math.min(maxY, Math.max(minY, entry.label.y));
  });
  const baseResolved = sorted.find((entry) => entry.type === "base")?.label ?? null;
  const comparesResolved = sorted
    .filter((entry) => entry.type === "compare")
    .map((entry) => entry.label);
  return { base: baseResolved, compares: comparesResolved };
}

const OVERLAY_TOGGLE_CONFIG = [
  { group: "sma" as const, value: 20, label: "SMA 20" },
  { group: "sma" as const, value: 50, label: "SMA 50" },
  { group: "ema" as const, value: 12, label: "EMA 12" },
  { group: "ema" as const, value: 26, label: "EMA 26" },
];

interface OverlayTogglesProps {
  state: OverlayState;
  onToggle: (group: "sma" | "ema", value: number) => void;
}

function OverlayToggles({ state, onToggle }: OverlayTogglesProps) {
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-300">
      {OVERLAY_TOGGLE_CONFIG.map((item) => {
        const active = state[item.group].includes(item.value);
        return (
          <button
            key={`${item.group}-${item.value}`}
            type="button"
            data-testid={`overlay-toggle-${item.group}-${item.value}`}
            onClick={() => onToggle(item.group, item.value)}
            className={`rounded border px-2 py-0.5 uppercase tracking-wide transition ${
              active
                ? "border-sky-400 bg-sky-600/30 text-slate-100"
                : "border-slate-700/60 text-slate-400 hover:bg-slate-800/30"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}


function resolveCompareAddInput(
  input: CompareAddInput | undefined,
  fallbackMode: CompareMode,
  fallbackTimeframe: Tf,
): { mode: CompareMode; timeframe: Tf; addMode?: string } {
  let mode = fallbackMode;
  let timeframe = fallbackTimeframe;
  let addMode: string | undefined = undefined;
  const applyMode = (candidate?: CompareMode | string) => {
    if (!candidate) return;
    const normalized = typeof candidate === "string" ? normalizeCompareMode(candidate) : candidate;
    if (normalized) mode = normalized;
  };
  if (input == null) {
    return { mode, timeframe, addMode };
  }
  if (typeof input === "string") {
    if (isValidTimeframe(input)) {
      timeframe = input;
    } else {
      applyMode(input);
      // accept legacy aliases for addMode
      if (input === "samePercent" || input === "newPriceScale" || input === "newPane") addMode = input;
    }
    return { mode, timeframe, addMode };
  }
  if (typeof input === "object") {
    if (input.timeframe && isValidTimeframe(input.timeframe as Tf)) {
      timeframe = input.timeframe as Tf;
    }
    if (input.mode) {
      applyMode(input.mode);
    }
    // capture addMode if provided
    if ((input as any).addMode && typeof (input as any).addMode === "string") {
      addMode = (input as any).addMode;
    }
    return { mode, timeframe, addMode };
  }
  applyMode(input as any);
  return { mode, timeframe, addMode };
}

function formatSignedPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  const rounded = Math.abs(value) < 0.0005 ? 0 : value;
  const sign = rounded >= 0 ? "+" : "-";
  return `${sign}${Math.abs(rounded).toFixed(2)}%`;
}

function formatLegendValue(
  mode: CompareMode,
  chartValue: number | null,
  priceValue: number | null,
  percentValue: number | null,
) {
  if (mode === "percent") {
    return formatSignedPercent(percentValue);
  }
  if (mode === "indexed") {
    if (typeof chartValue !== "number" || Number.isNaN(chartValue)) return "—";
    return chartValue.toFixed(2);
  }
  if (typeof priceValue !== "number" || Number.isNaN(priceValue)) return "—";
  return formatPrice(priceValue);
}

function findBarAtOrBefore(rows: NormalizedBar[], targetTime: number | null): NormalizedBar | null {
  if (!rows.length) return null;
  if (targetTime == null) return rows[rows.length - 1] ?? null;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const ts = lwTimeFromNormalized(rows[i]);
    if (ts != null && ts <= targetTime) {
      return rows[i];
    }
  }
  return rows[rows.length - 1] ?? null;
}

function findCompareCloseAtOrBefore(rows: NormalizedBar[], targetTime: number | null): number | null {
  if (!rows.length) return null;
  const fallbackTime = targetTime ?? lwTimeFromNormalized(rows[rows.length - 1]) ?? null;
  if (fallbackTime == null) return null;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const ts = lwTimeFromNormalized(rows[i]);
    if (ts != null && ts <= fallbackTime) {
      return rows[i].close;
    }
  }
  return null;
}

function findBarAtOrAfter(rows: NormalizedBar[], targetTime: number | null): NormalizedBar | null {
  if (!rows.length) return null;
  if (targetTime == null) return rows[0] ?? null;
  for (let i = 0; i < rows.length; i += 1) {
    const ts = lwTimeFromNormalized(rows[i]);
    if (ts != null && ts >= targetTime) {
      return rows[i];
    }
  }
  return rows[0] ?? null;
}

function findCompareCloseAtOrAfter(rows: NormalizedBar[], targetTime: number | null): number | null {
  if (!rows.length) return null;
  const fallbackTime = targetTime ?? lwTimeFromNormalized(rows[0]) ?? null;
  if (fallbackTime == null) return null;
  for (let i = 0; i < rows.length; i += 1) {
    const ts = lwTimeFromNormalized(rows[i]);
    if (ts != null && ts >= fallbackTime) {
      return rows[i].close;
    }
  }
  return null;
}

function toCsvCell(value: number | string | null | undefined) {
  if (value == null || value === "") return "";
  const str = typeof value === "number" ? (Number.isNaN(value) ? "" : String(value)) : String(value);
  if (!str) return "";
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
