import type { MutableRefObject } from "react";

import type {
  IChartApi,
  ISeriesApi,
} from "@/lib/lightweightCharts";
import type { CompareMode, Tf } from "./state/compare";

export type RGBA = { r: number; g: number; b: number; a: number };
export type SamplePoint = { x: number; y: number };
export type CanvasScanInfo = { idx: number; w: number; h: number; score: number };
export type CanvasScanSummary = { canvases: CanvasScanInfo[]; bgRgb: RGBA | null };

export type LastSampleSnapshot = {
  candidateIndex: number | null;
  canvasPixels: { w: number; h: number } | null;
  clientPixels: { w: number; h: number } | null;
  dpr: number;
  bgRgb: RGBA | null;
  point: SamplePoint | null;
  rgba: RGBA | null;
  path: string;
};

export interface ChartsHelpersDebug {
  lastSample: LastSampleSnapshot | null;
  scan: (root?: HTMLElement | Document | null) => CanvasScanSummary;
  paintProbeIfEmpty: (root?: HTMLElement | Document | null) => boolean;
  zoom?: (deltaY: number, clientX?: number, clientY?: number) => void;
}

export interface ChartsHelpersApi {
  getPriceCanvas: (root: HTMLElement | Document | null) => HTMLCanvasElement | null;
  samplePriceCanvasPixel: (root: HTMLElement | null) => Promise<RGBA | null>;
  samplePriceCanvasPixelComposite: (root: HTMLElement | null) => Promise<RGBA | null>;
  hoverAt: (root: HTMLElement | null, pos: "left" | "center" | "right" | number) => boolean;
  debug?: ChartsHelpersDebug;
}

export type VisibleRow = Record<string, number | null>;

export type HoverSnapshot = {
  time: number;
  x: number | null;  // plot x-coordinate (px)
  y: number | null;  // plot y-coordinate (px)
  timeLabel: string; // formatted time string for pill
  priceLabel: string; // formatted price string for pill
  base: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    percent: number | null;
  };
  compares: Record<string, {
    price: number | null;
    percent: number | null;
    priceAtCursor: number | null;    // NEW: price value at hover time
    percentAtCursor: number | null;  // NEW: percent value at hover time (if mode=percent)
    changeAbs: number | null;        // NEW: abs change from anchor or prev close
    changePct: number | null;        // NEW: percent change
    colorHint?: string;              // color indicator for compare
  }>;
  overlayValues: Record<string, number | null>;  // NEW: SMA/EMA/etc values at cursor
  ohlcDisplay: {  // TradingView-style OHLC display row
    symbol: string;
    open: string;
    high: string;
    low: string;
    close: string;
    change: string;  // formatted change % or price
  };
  compareDisplays?: Record<string, {  // NEW: per-compare display data for strip
    symbol: string;
    value: string;      // price or percent formatted
    change?: string;    // percent change
    colorHint?: string;
  }>;
};

export type HoverTarget =
  | number
  | "mid"
  | "last"
  | "right"
  | "anchor"
  | "first"
  | "left"
  | "center";

export type DebugBindingSnapshot = {
  hasHelpers: boolean;
  usesComposite: boolean;
  lastSample: LastSampleSnapshot | null;
  canvases: CanvasScanSummary;
  canvasWH: { w: number; h: number } | null;
};

export interface LwChartsDebugApi {
  scan: () => CanvasScanSummary;
  paintProbeIfEmpty: () => boolean;
  dumpBindings: () => DebugBindingSnapshot;
  zoom?: (delta?: number) => boolean;
  pan?: (dx?: number, dy?: number) => boolean;
  hasApplyPatch?: () => boolean;
}

export interface CompareListEntry {
  symbol: string;
  mode: CompareMode;
  timeframe: Tf;
  hidden?: boolean;
}

export type CompareAddInput = CompareMode | string | { mode?: CompareMode | string; timeframe?: Tf | string };

export interface LwChartsCompareApi {
  list: () => CompareListEntry[];
  add: (symbol: string, options?: CompareAddInput) => Promise<void>;
  remove: (symbol: string) => void;
  mode: (symbolOrMode: string, maybeMode?: CompareMode | string) => void;
  toggle: (symbol: string) => void;
  timeframe: (symbolOrTf: string, maybeTimeframe?: string) => void;
}

export interface LwChartsExportHandlers {
  png?: () => Promise<string | null>;
  csv?: () => Promise<string | null>;
}

export type CandlestickSeries = ISeriesApi<"Candlestick">;
export type VolumeSeries = ISeriesApi<"Histogram">;

export interface LwChartsApi {
  chart: IChartApi | null;
  priceSeriesRef: MutableRefObject<CandlestickSeries | null>;
  volumeSeriesRef: MutableRefObject<VolumeSeries | null>;
  fit: () => void;
  samplePixel: () => Promise<RGBA | null>;
  hoverAt: (target?: HoverTarget) => HoverSnapshot | boolean | null;
  version: string;
  meta?: { impl: string; boundAt: number; compositeSource?: string };
  dump: () => unknown;
  compare: LwChartsCompareApi;
  dumpVisible: () => VisibleRow[];
  export: LwChartsExportHandlers;
  debug?: LwChartsDebugApi;
  _applyPatch?: (patch: Partial<LwChartsApi>) => void;
  set: (patch: Partial<LwChartsApi>) => LwChartsApi;
}

declare global {
  interface Window {
    __chartsHelpers?: ChartsHelpersApi;
    __lwcharts?: LwChartsApi;
  }
}
