/**
 * PRIO 3: Indicator Registry Manifest
 * 
 * Single source of truth for all indicators.
 * Each indicator defines: id, name, category, tags, inputs, outputs, pane policy, TV-style defaults.
 */

import type { UTCTimestamp } from "@/lib/lightweightCharts";

// ============================================================================
// Types
// ============================================================================

export type IndicatorCategory = 
  | "trend"
  | "momentum"
  | "volatility"
  | "volume"
  | "moving-average";

export type OutputStyle = "line" | "histogram" | "area" | "band" | "candle";

export type PanePolicy = "overlay" | "separate";

export interface InputDef {
  key: string;
  label: string;
  type: "number" | "select" | "color" | "boolean";
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
}

export interface OutputDef {
  key: string;
  label: string;
  style: OutputStyle;
  defaultColor: string;
  defaultLineWidth?: number;
  /** For bands: which output is the pair (e.g., upper/lower) */
  bandPair?: string;
}

/**
 * Indicator documentation sections (TradingView-style info panel)
 */
export interface IndicatorDocs {
  /** What the indicator is */
  definition?: string;
  /** How to interpret it */
  explanation?: string;
  /** The math behind it */
  calculations?: string;
  /** Key insights */
  takeaways?: string[];
  /** Signals and patterns to watch */
  whatToLookFor?: string[];
  /** Known drawbacks */
  limitations?: string[];
  /** Complementary indicator IDs */
  goesGoodWith?: string[];
  /** Brief summary */
  summary?: string;
  /** Common settings */
  commonSettings?: string;
  /** Best market conditions */
  bestConditions?: string;
}

export interface IndicatorManifest {
  id: string;
  name: string;
  shortName: string;
  category: IndicatorCategory;
  tags: string[];
  description: string;
  panePolicy: PanePolicy;
  inputs: InputDef[];
  outputs: OutputDef[];
  /** Extended documentation for info panel */
  docs?: IndicatorDocs;
  /**
   * If true, this indicator is cumulative and benefits from extended history.
   * When active, the data fetch will use a higher limit (e.g., 12k bars for daily)
   * to achieve TradingView-level parity.
   */
  needsExtendedHistory?: boolean;
}

// ============================================================================
// TV-Style Colors (TradingView defaults)
// ============================================================================

export const TV_COLORS = {
  blue: "#2962FF",
  orange: "#FF6D00",
  purple: "#9C27B0",
  purpleTv: "#7E57C2",  // TV's oscillator purple (Williams %R, etc.)
  teal: "#26A69A",
  red: "#F23645",
  green: "#26A69A",
  yellow: "#FFEB3B",
  pink: "#E91E63",
  gray: "#787B86",
  // Band colors (semi-transparent)
  bandFill: "rgba(33, 150, 243, 0.1)",
  histogramUp: "#26A69A",
  histogramDown: "#EF5350",
} as const;

// ============================================================================
// Indicator Manifests
// ============================================================================

export const INDICATOR_MANIFESTS: IndicatorManifest[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Moving Averages
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "sma",
    name: "Simple Moving Average",
    shortName: "SMA",
    category: "moving-average",
    tags: ["trend", "overlay", "classic"],
    description: "Average of closing prices over N periods",
    panePolicy: "overlay",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "length", label: "Length", type: "number", default: 9, min: 1, max: 500 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "(H+L)/2" },
        { value: "hlc3", label: "(H+L+C)/3" },
        { value: "ohlc4", label: "(O+H+L+C)/4" },
      ]},
      { key: "offset", label: "Offset", type: "number", default: 0, min: -500, max: 500 },
      // === Smoothing section (TV-style) ===
      { key: "smoothingType", label: "Smoothing Type", type: "select", default: "none", options: [
        { value: "none", label: "None" },
        { value: "sma", label: "SMA" },
        { value: "sma_bb", label: "SMA + Bollinger Bands" },
        { value: "ema", label: "EMA" },
        { value: "smma", label: "SMMA (RMA)" },
        { value: "wma", label: "WMA" },
        { value: "vwma", label: "VWMA" },
      ]},
      { key: "smoothingLength", label: "Smoothing Length", type: "number", default: 14, min: 1, max: 500 },
      { key: "bbStdDev", label: "BB StdDev", type: "number", default: 2, min: 0.01, max: 10, step: 0.1 },
      // === Style toggles ===
      { key: "showSMA", label: "Show MA", type: "boolean", default: true },
      { key: "showSmoothing", label: "Show SMA-based MA", type: "boolean", default: true },
      { key: "showBBUpper", label: "Show BB Upper", type: "boolean", default: true },
      { key: "showBBLower", label: "Show BB Lower", type: "boolean", default: true },
      { key: "showBBFill", label: "Show BB Background", type: "boolean", default: true },
      // === Colors ===
      { key: "smaColor", label: "MA Color", type: "color", default: "#2962FF" },
      { key: "smoothingColor", label: "SMA-based MA Color", type: "color", default: "#FDD835" },
      { key: "bbUpperColor", label: "BB Upper Color", type: "color", default: "#4CAF50" },
      { key: "bbLowerColor", label: "BB Lower Color", type: "color", default: "#4CAF50" },
      { key: "bbFillColor", label: "BB Fill Color", type: "color", default: "rgba(76, 175, 80, 0.1)" },
    ],
    outputs: [
      { key: "sma", label: "MA", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "smoothing", label: "SMA-based MA", style: "line", defaultColor: "#FDD835", defaultLineWidth: 1 },
      { key: "bbUpper", label: "BB Upper", style: "line", defaultColor: "#4CAF50", defaultLineWidth: 1 },
      { key: "bbLower", label: "BB Lower", style: "line", defaultColor: "#4CAF50", defaultLineWidth: 1 },
    ],
  },
  {
    id: "ema",
    name: "Exponential Moving Average",
    shortName: "EMA",
    category: "moving-average",
    tags: ["trend", "overlay", "classic"],
    description: "Weighted average giving more weight to recent prices",
    panePolicy: "overlay",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "length", label: "Length", type: "number", default: 9, min: 1, max: 500 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
      { key: "offset", label: "Offset", type: "number", default: 0, min: -500, max: 500 },
      // === Smoothing section (TV-style) ===
      { key: "smoothingType", label: "Smoothing Type", type: "select", default: "none", options: [
        { value: "none", label: "None" },
        { value: "sma", label: "SMA" },
        { value: "sma_bb", label: "SMA + Bollinger Bands" },
        { value: "ema", label: "EMA" },
        { value: "smma", label: "SMMA (RMA)" },
        { value: "wma", label: "WMA" },
        { value: "vwma", label: "VWMA" },
      ]},
      { key: "smoothingLength", label: "Smoothing Length", type: "number", default: 14, min: 1, max: 500 },
      { key: "bbStdDev", label: "BB StdDev", type: "number", default: 2, min: 0.01, max: 10, step: 0.1 },
      // === Style toggles ===
      { key: "showEMA", label: "Show EMA", type: "boolean", default: true },
      { key: "showSmoothing", label: "Show Smoothing Line", type: "boolean", default: true },
      { key: "showBBUpper", label: "Show BB Upper", type: "boolean", default: true },
      { key: "showBBLower", label: "Show BB Lower", type: "boolean", default: true },
      { key: "showBBFill", label: "Show BB Background", type: "boolean", default: true },
      // === Colors ===
      { key: "emaColor", label: "EMA Color", type: "color", default: "#2962FF" },
      { key: "smoothingColor", label: "Smoothing Color", type: "color", default: "#FDD835" },
      { key: "bbUpperColor", label: "BB Upper Color", type: "color", default: "#2962FF" },
      { key: "bbLowerColor", label: "BB Lower Color", type: "color", default: "#2962FF" },
      { key: "bbFillColor", label: "BB Fill Color", type: "color", default: "rgba(41, 98, 255, 0.1)" },
    ],
    outputs: [
      { key: "ema", label: "EMA", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "smoothing", label: "Smoothing", style: "line", defaultColor: "#FDD835", defaultLineWidth: 1 },
      { key: "bbUpper", label: "BB Upper", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "bbLower", label: "BB Lower", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
    ],
  },
  {
    id: "smma",
    name: "Smoothed Moving Average",
    shortName: "SMMA",
    category: "moving-average",
    tags: ["trend", "overlay", "wilder", "rma"],
    description: "Wilder's smoothing method, also known as RMA",
    panePolicy: "overlay",
    inputs: [
      { key: "period", label: "Period", type: "number", default: 14, min: 1, max: 500 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
    ],
    outputs: [
      { key: "smma", label: "SMMA", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 2 },
    ],
  },
  {
    id: "wma",
    name: "Weighted Moving Average",
    shortName: "WMA",
    category: "moving-average",
    tags: ["trend", "overlay", "weighted"],
    description: "Linear weighted average, recent prices have more weight",
    panePolicy: "overlay",
    inputs: [
      { key: "period", label: "Period", type: "number", default: 20, min: 1, max: 500 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
    ],
    outputs: [
      { key: "wma", label: "WMA", style: "line", defaultColor: TV_COLORS.purple, defaultLineWidth: 2 },
    ],
  },
  {
    id: "dema",
    name: "Double Exponential Moving Average",
    shortName: "DEMA",
    category: "moving-average",
    tags: ["trend", "overlay", "responsive"],
    description: "Faster EMA with reduced lag: 2×EMA - EMA(EMA)",
    panePolicy: "overlay",
    inputs: [
      { key: "period", label: "Period", type: "number", default: 20, min: 1, max: 500 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
    ],
    outputs: [
      { key: "dema", label: "DEMA", style: "line", defaultColor: TV_COLORS.teal, defaultLineWidth: 2 },
    ],
  },
  {
    id: "tema",
    name: "Triple Exponential Moving Average",
    shortName: "TEMA",
    category: "moving-average",
    tags: ["trend", "overlay", "responsive"],
    description: "Ultra-responsive MA: 3×EMA - 3×EMA(EMA) + EMA(EMA(EMA))",
    panePolicy: "overlay",
    inputs: [
      { key: "period", label: "Period", type: "number", default: 20, min: 1, max: 500 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
    ],
    outputs: [
      { key: "tema", label: "TEMA", style: "line", defaultColor: TV_COLORS.pink, defaultLineWidth: 2 },
    ],
  },
  {
    id: "hma",
    name: "Hull Moving Average",
    shortName: "HMA",
    category: "moving-average",
    tags: ["trend", "overlay", "responsive", "hull"],
    description: "Fast and smooth MA using weighted MAs",
    panePolicy: "overlay",
    inputs: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 500 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
    ],
    outputs: [
      { key: "hma", label: "HMA", style: "line", defaultColor: TV_COLORS.green, defaultLineWidth: 2 },
    ],
  },
  {
    id: "kama",
    name: "Kaufman Adaptive Moving Average",
    shortName: "KAMA",
    category: "moving-average",
    tags: ["trend", "overlay", "adaptive"],
    description: "Adapts to market volatility using efficiency ratio",
    panePolicy: "overlay",
    inputs: [
      { key: "period", label: "Period", type: "number", default: 10, min: 1, max: 200 },
      { key: "fast", label: "Fast", type: "number", default: 2, min: 1, max: 50 },
      { key: "slow", label: "Slow", type: "number", default: 30, min: 5, max: 100 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
    ],
    outputs: [
      { key: "kama", label: "KAMA", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 2 },
    ],
  },
  {
    id: "vwma",
    name: "Volume Weighted Moving Average",
    shortName: "VWMA",
    category: "moving-average",
    tags: ["trend", "overlay", "volume"],
    description: "Moving average weighted by trading volume",
    panePolicy: "overlay",
    inputs: [
      { key: "period", label: "Period", type: "number", default: 20, min: 1, max: 500 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
    ],
    outputs: [
      { key: "vwma", label: "VWMA", style: "line", defaultColor: TV_COLORS.purple, defaultLineWidth: 2 },
    ],
  },
  {
    id: "mcginley",
    name: "McGinley Dynamic",
    shortName: "MD",
    category: "moving-average",
    tags: ["trend", "overlay", "adaptive", "mcginley"],
    description: "Self-adjusting MA that tracks price more closely",
    panePolicy: "overlay",
    inputs: [
      { key: "period", label: "Period", type: "number", default: 14, min: 1, max: 200 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
    ],
    outputs: [
      { key: "mcginley", label: "McGinley", style: "line", defaultColor: TV_COLORS.teal, defaultLineWidth: 2 },
    ],
  },
  {
    id: "alma",
    name: "Arnaud Legoux Moving Average",
    shortName: "ALMA",
    category: "moving-average",
    tags: ["trend", "overlay", "gaussian", "responsive", "alma"],
    description: "Gaussian-weighted MA with adjustable offset and sigma for reduced lag",
    panePolicy: "overlay",
    inputs: [
      { key: "period", label: "Window Size", type: "number", default: 9, min: 1, max: 200 },
      { key: "offset", label: "Offset", type: "number", default: 0.85, min: 0, max: 1, step: 0.01 },
      { key: "sigma", label: "Sigma", type: "number", default: 6, min: 1, max: 20, step: 0.5 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
    ],
    outputs: [
      { key: "alma", label: "ALMA", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 2 },
    ],
  },
  {
    id: "lsma",
    name: "Least Squares Moving Average",
    shortName: "LSMA",
    category: "moving-average",
    tags: ["trend", "overlay", "regression", "linear", "lsma"],
    description: "Linear regression line fitted to price data over a rolling window",
    panePolicy: "overlay",
    inputs: [
      { key: "length", label: "Length", type: "number", default: 25, min: 2, max: 500 },
      { key: "offset", label: "Offset", type: "number", default: 0, min: -100, max: 100 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
    ],
    outputs: [
      { key: "lsma", label: "LSMA", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 2 },
    ],
  },
  {
    id: "maribbon",
    name: "Moving Average Ribbon",
    shortName: "MA Ribbon",
    category: "moving-average",
    tags: ["trend", "overlay", "ribbon", "strength", "multiple", "maribbon"],
    description: "8 MAs showing trend strength - ordered = strong, crossing = weak",
    panePolicy: "overlay",
    inputs: [
      { key: "maType", label: "MA Type", type: "select", default: "ema", options: [
        { value: "ema", label: "EMA" },
        { value: "sma", label: "SMA" },
      ]},
      { key: "basePeriod", label: "Base Period", type: "number", default: 20, min: 5, max: 100 },
      { key: "periodStep", label: "Period Step", type: "number", default: 5, min: 1, max: 20 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
    ],
    outputs: [
      // Gradient colors from green (fastest) to red (slowest) - TV style
      { key: "ma1", label: "MA 1", style: "line", defaultColor: "#22C55E", defaultLineWidth: 1 }, // green-500
      { key: "ma2", label: "MA 2", style: "line", defaultColor: "#84CC16", defaultLineWidth: 1 }, // lime-500
      { key: "ma3", label: "MA 3", style: "line", defaultColor: "#EAB308", defaultLineWidth: 1 }, // yellow-500
      { key: "ma4", label: "MA 4", style: "line", defaultColor: "#F97316", defaultLineWidth: 1 }, // orange-500
      { key: "ma5", label: "MA 5", style: "line", defaultColor: "#EF4444", defaultLineWidth: 1 }, // red-500
      { key: "ma6", label: "MA 6", style: "line", defaultColor: "#EC4899", defaultLineWidth: 1 }, // pink-500
      { key: "ma7", label: "MA 7", style: "line", defaultColor: "#A855F7", defaultLineWidth: 1 }, // purple-500
      { key: "ma8", label: "MA 8", style: "line", defaultColor: "#6366F1", defaultLineWidth: 1 }, // indigo-500
    ],
  },
  {
    id: "maribbon4",
    name: "MA Ribbon (4)",
    shortName: "MA Ribbon 4",
    category: "moving-average",
    tags: ["trend", "overlay", "ribbon", "strength", "maribbon4", "tv-style"],
    description: "4 MAs with custom periods per line - TV-style flexibility",
    panePolicy: "overlay",
    inputs: [
      { key: "maType", label: "MA Type", type: "select", default: "ema", options: [
        { value: "ema", label: "EMA" },
        { value: "sma", label: "SMA" },
      ]},
      { key: "len1", label: "Length 1", type: "number", default: 20, min: 1, max: 500 },
      { key: "len2", label: "Length 2", type: "number", default: 50, min: 1, max: 500 },
      { key: "len3", label: "Length 3", type: "number", default: 100, min: 1, max: 500 },
      { key: "len4", label: "Length 4", type: "number", default: 200, min: 1, max: 500 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
    ],
    outputs: [
      // TV-style colors: yellow → orange → orange-red → red
      { key: "ma1", label: "MA 1", style: "line", defaultColor: "#FFEB3B", defaultLineWidth: 1 }, // yellow
      { key: "ma2", label: "MA 2", style: "line", defaultColor: "#FF9800", defaultLineWidth: 1 }, // orange
      { key: "ma3", label: "MA 3", style: "line", defaultColor: "#FF5722", defaultLineWidth: 1 }, // deep orange
      { key: "ma4", label: "MA 4", style: "line", defaultColor: "#F44336", defaultLineWidth: 1 }, // red
    ],
  },
  {
    id: "sar",
    name: "Parabolic SAR",
    shortName: "SAR",
    category: "trend",
    tags: ["trend", "overlay", "stop-loss", "reversal", "wilder"],
    description: "Stop and Reverse indicator showing potential trend reversals",
    panePolicy: "overlay",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "start", label: "Start", type: "number", default: 0.02, min: 0.001, max: 0.5, step: 0.001 },
      { key: "increment", label: "Increment", type: "number", default: 0.02, min: 0.001, max: 0.5, step: 0.001 },
      { key: "maxValue", label: "Max value", type: "number", default: 0.2, min: 0.01, max: 1, step: 0.01 },
      // === Style section (TV-style) ===
      { key: "plotStyle", label: "Plot Style", type: "select", default: "circles", options: [
        { value: "circles", label: "Circles" },
        { value: "line", label: "Line" },
        { value: "lineWithBreaks", label: "Line with breaks" },
        { value: "stepLine", label: "Step line" },
        { value: "stepLineWithBreaks", label: "Step line with breaks" },
        { value: "cross", label: "Cross" },
        { value: "columns", label: "Columns" },
      ]},
      { key: "priceLine", label: "Price line", type: "boolean", default: false },
      // === Colors ===
      { key: "sarColor", label: "SAR Color", type: "color", default: "#2962FF" },
    ],
    outputs: [
      { key: "sar", label: "SAR", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
    ],
  },
  {
    id: "supertrend",
    name: "Supertrend",
    shortName: "ST",
    category: "trend",
    tags: ["trend", "overlay", "atr", "dynamic-support", "trailing-stop"],
    description: "ATR-based trend following indicator with dynamic support/resistance",
    panePolicy: "overlay",
    inputs: [
      { key: "atrLength", label: "ATR Length", type: "number", default: 10, min: 1, max: 100 },
      { key: "factor", label: "Factor", type: "number", default: 3.0, min: 0.1, max: 10, step: 0.1 },
      { key: "highlight", label: "Highlight Trend", type: "boolean", default: true },
    ],
    outputs: [
      { key: "supertrend_up", label: "Up Trend", style: "line", defaultColor: TV_COLORS.green, defaultLineWidth: 1 },
      { key: "supertrend_down", label: "Down Trend", style: "line", defaultColor: TV_COLORS.red, defaultLineWidth: 1 },
    ],
  },
  {
    id: "ichimoku",
    name: "Ichimoku Cloud",
    shortName: "Ichimoku",
    category: "trend",
    tags: ["trend", "overlay", "cloud", "kumo", "ichimoku", "japanese"],
    description: "Ichimoku Kinko Hyo - Japanese cloud chart with 5 lines and Kumo cloud",
    panePolicy: "overlay",
    inputs: [
      { key: "tenkanPeriod", label: "Conversion Line Length", type: "number", default: 9, min: 1, max: 100 },
      { key: "kijunPeriod", label: "Base Line Length", type: "number", default: 26, min: 1, max: 200 },
      { key: "senkouBPeriod", label: "Leading Span B Length", type: "number", default: 52, min: 1, max: 200 },
      { key: "displacement", label: "Lagging Span", type: "number", default: 26, min: 1, max: 100 },
      // Visibility toggles (TV-style)
      { key: "showTenkan", label: "Conversion Line", type: "boolean", default: true },
      { key: "showKijun", label: "Base Line", type: "boolean", default: true },
      { key: "showChikou", label: "Lagging Span", type: "boolean", default: true },
      { key: "showSpanA", label: "Leading Span A", type: "boolean", default: true },
      { key: "showSpanB", label: "Leading Span B", type: "boolean", default: true },
      { key: "showCloudFill", label: "Plots Background", type: "boolean", default: true },
    ],
    outputs: [
      // TV default colors for Ichimoku (verified against TradingView)
      { key: "tenkan", label: "Conversion Line", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 }, // TV blue
      { key: "kijun", label: "Base Line", style: "line", defaultColor: "#B71C1C", defaultLineWidth: 1 }, // TV dark red
      { key: "senkouA", label: "Leading Span A", style: "line", defaultColor: "#43A047", defaultLineWidth: 1 }, // TV green
      { key: "senkouB", label: "Leading Span B", style: "line", defaultColor: "#FF5252", defaultLineWidth: 1 }, // TV red
      { key: "chikou", label: "Lagging Span", style: "line", defaultColor: "#43A047", defaultLineWidth: 1 }, // TV green (same as Span A)
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Momentum
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "rsi",
    name: "Relative Strength Index",
    shortName: "RSI",
    category: "momentum",
    tags: ["oscillator", "overbought", "oversold"],
    description: "Measures speed and magnitude of price changes (0-100)",
    panePolicy: "separate",
    inputs: [
      // TradingView-style inputs section
      { key: "period", label: "RSI Length", type: "number", default: 14, min: 1, max: 100 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
      { key: "calcDivergence", label: "Calculate Divergence", type: "boolean", default: false },
      { key: "smoothingType", label: "MA Type", type: "select", default: "sma", options: [
        { value: "sma", label: "SMA" },
        { value: "ema", label: "EMA" },
        { value: "rma", label: "SMMA (RMA)" },
        { value: "wma", label: "WMA" },
      ]},
      { key: "smoothingLength", label: "MA Length", type: "number", default: 14, min: 1, max: 100 },
      { key: "bbMultiplier", label: "BB StdDev", type: "number", default: 2, min: 0.1, max: 5, step: 0.1 },
      // Band values
      { key: "upperBandValue", label: "Upper Band", type: "number", default: 70, min: 50, max: 100 },
      { key: "middleBandValue", label: "Middle Band", type: "number", default: 50, min: 20, max: 80 },
      { key: "lowerBandValue", label: "Lower Band", type: "number", default: 30, min: 0, max: 50 },
      // Style: RSI line
      { key: "showRSI", label: "Show RSI", type: "boolean", default: true },
      { key: "rsiColor", label: "RSI Color", type: "color", default: "#7E57C2" },
      { key: "rsiLineWidth", label: "RSI Line Width", type: "number", default: 2, min: 1, max: 4 },
      // Style: RSI-based MA
      { key: "showRSIMA", label: "Show RSI-based MA", type: "boolean", default: true },
      { key: "rsiMAColor", label: "RSI MA Color", type: "color", default: "#F7B924" },
      { key: "rsiMALineWidth", label: "RSI MA Line Width", type: "number", default: 2, min: 1, max: 4 },
      // Style: Upper Band
      { key: "showUpperBand", label: "Show Upper Band", type: "boolean", default: true },
      { key: "upperBandColor", label: "Upper Band Color", type: "color", default: "#B2B5BE" },
      // Style: Middle Band
      { key: "showMiddleBand", label: "Show Middle Band", type: "boolean", default: true },
      { key: "middleBandColor", label: "Middle Band Color", type: "color", default: "#B2B5BE" },
      // Style: Lower Band
      { key: "showLowerBand", label: "Show Lower Band", type: "boolean", default: true },
      { key: "lowerBandColor", label: "Lower Band Color", type: "color", default: "#B2B5BE" },
      // Style: Background fill
      { key: "showBackgroundFill", label: "RSI Background Fill", type: "boolean", default: true },
      { key: "backgroundFillColor", label: "Background Fill Color", type: "color", default: "#7E57C2" },
      { key: "backgroundFillOpacity", label: "Background Fill Opacity", type: "number", default: 0.1, min: 0, max: 1, step: 0.05 },
      // Style: Overbought/Oversold fills
      { key: "showOverboughtFill", label: "Show Overbought Fill", type: "boolean", default: true },
      { key: "overboughtFillColor", label: "Overbought Fill Color", type: "color", default: "#26A69A" },
      { key: "showOversoldFill", label: "Show Oversold Fill", type: "boolean", default: true },
      { key: "oversoldFillColor", label: "Oversold Fill Color", type: "color", default: "#EF5350" },
    ],
    outputs: [
      { key: "rsi", label: "RSI", style: "line", defaultColor: "#7E57C2", defaultLineWidth: 2 },
      { key: "rsiMa", label: "RSI-based MA", style: "line", defaultColor: "#F7B924", defaultLineWidth: 2 },
      { key: "upperBand", label: "Upper Band", style: "line", defaultColor: "#B2B5BE", defaultLineWidth: 1 },
      { key: "middleBand", label: "Middle Band", style: "line", defaultColor: "#B2B5BE", defaultLineWidth: 1 },
      { key: "lowerBand", label: "Lower Band", style: "line", defaultColor: "#B2B5BE", defaultLineWidth: 1 },
    ],
  },
  {
    id: "macd",
    name: "MACD",
    shortName: "MACD",
    category: "momentum",
    tags: ["oscillator", "trend", "divergence"],
    description: "Moving Average Convergence Divergence - trend following momentum",
    panePolicy: "separate",
    inputs: [
      // TradingView-style inputs
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
      { key: "fast", label: "Fast Length", type: "number", default: 12, min: 1, max: 100 },
      { key: "slow", label: "Slow Length", type: "number", default: 26, min: 1, max: 200 },
      { key: "signal", label: "Signal Smoothing", type: "number", default: 9, min: 1, max: 50 },
      { key: "oscMAType", label: "Oscillator MA Type", type: "select", default: "ema", options: [
        { value: "ema", label: "EMA" },
        { value: "sma", label: "SMA" },
      ]},
      { key: "signalMAType", label: "Signal Line MA Type", type: "select", default: "ema", options: [
        { value: "ema", label: "EMA" },
        { value: "sma", label: "SMA" },
      ]},
      // Style: Histogram 4-color scheme (TV-style)
      { key: "histColor0", label: "Histogram Color 0 (Above ↑)", type: "color", default: "#26A69A" },
      { key: "histColor1", label: "Histogram Color 1 (Above ↓)", type: "color", default: "#B2DFDB" },
      { key: "histColor2", label: "Histogram Color 2 (Below ↑)", type: "color", default: "#FFCDD2" },
      { key: "histColor3", label: "Histogram Color 3 (Below ↓)", type: "color", default: "#EF5350" },
      // Zero line settings
      { key: "showZeroLine", label: "Show Zero Line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "histogram", label: "Histogram", style: "histogram", defaultColor: "#26A69A" },
      { key: "macd", label: "MACD", style: "line", defaultColor: "#2962FF", defaultLineWidth: 2 },
      { key: "signal", label: "Signal", style: "line", defaultColor: "#FF6D00", defaultLineWidth: 2 },
    ],
  },
  {
    id: "ao",
    name: "Awesome Oscillator",
    shortName: "AO",
    category: "momentum",
    tags: ["oscillator", "momentum", "histogram"],
    description: "Measures market momentum by comparing 5-period and 34-period SMAs of the median price",
    panePolicy: "separate",
    inputs: [
      // Style options (TV-style)
      { key: "showAO", label: "Show AO", type: "boolean", default: true },
      { key: "fallingColor", label: "Falling", type: "color", default: "#F23645" },
      { key: "growingColor", label: "Growing", type: "color", default: "#089981" },
      // Zero line settings
      { key: "showZeroLine", label: "Show Zero Line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "ao", label: "AO", style: "histogram", defaultColor: "#089981" },
    ],
  },
  {
    id: "adx",
    name: "Average Directional Index",
    shortName: "ADX",
    category: "momentum",
    tags: ["trend-strength", "directional"],
    description: "Measures trend strength regardless of direction (0-100)",
    panePolicy: "separate",
    inputs: [
      { key: "period", label: "Period", type: "number", default: 14, min: 1, max: 100 },
      { key: "smoothing", label: "Smoothing", type: "number", default: 14, min: 1, max: 100 },
    ],
    outputs: [
      { key: "adx", label: "ADX", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 2 },
      { key: "plusDI", label: "+DI", style: "line", defaultColor: TV_COLORS.green, defaultLineWidth: 1 },
      { key: "minusDI", label: "-DI", style: "line", defaultColor: TV_COLORS.red, defaultLineWidth: 1 },
    ],
  },
  {
    id: "dmi",
    name: "Directional Movement Index",
    shortName: "DMI",
    category: "trend",
    tags: ["trend-strength", "directional", "dmi"],
    description: "Shows trend direction and strength via ADX, +DI, -DI",
    panePolicy: "separate",
    inputs: [
      { key: "adxSmoothing", label: "ADX Smoothing", type: "number", default: 14, min: 1, max: 100 },
      { key: "diLength", label: "DI Length", type: "number", default: 14, min: 1, max: 100 },
    ],
    outputs: [
      { key: "adx", label: "ADX", style: "line", defaultColor: TV_COLORS.red, defaultLineWidth: 1 },
      { key: "plusDI", label: "+DI", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "minusDI", label: "-DI", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 1 },
    ],
    docs: {
      definition: "The Directional Movement Index (DMI) quantifies trend direction by plotting the Average Directional Index (ADX) alongside the Positive Directional Indicator (+DI) and Negative Directional Indicator (-DI).",
      explanation: "When +DI is above -DI, prices are trending upward. When -DI is above +DI, prices are trending downward. The ADX line measures trend strength regardless of direction (values above 25 suggest a strong trend).",
      calculations: "+DM = High - prev High (if positive and greater than -DM, else 0)\n-DM = prev Low - Low (if positive and greater than +DM, else 0)\nTR = max(High-Low, |High-prevClose|, |Low-prevClose|)\n+DI = 100 * Wilder(+DM, n) / Wilder(TR, n)\n-DI = 100 * Wilder(-DM, n) / Wilder(TR, n)\nDX = 100 * |+DI - -DI| / (+DI + -DI)\nADX = Wilder(DX, adxSmoothing)",
      takeaways: [
        "ADX > 25 indicates a strong trend",
        "+DI crossing above -DI is bullish",
        "-DI crossing above +DI is bearish",
      ],
      whatToLookFor: [
        "DI crossovers for entry signals",
        "ADX level for trend strength confirmation",
        "Rising ADX = strengthening trend",
      ],
      limitations: [
        "Lagging indicator",
        "ADX can remain high during reversals",
        "Works best in trending markets",
      ],
      goesGoodWith: ["atr", "bb", "macd"],
      summary: "DMI combines directional indicators with trend strength measurement. Use DI crossovers for direction and ADX for strength.",
      commonSettings: "ADX Smoothing: 14, DI Length: 14",
      bestConditions: "Trending markets with clear directional moves",
    },
  },
  {
    id: "vortex",
    name: "Vortex Indicator",
    shortName: "VI",
    category: "trend",
    tags: ["trend", "direction", "vortex"],
    description: "Identifies trend direction using VI+ and VI- crossovers",
    panePolicy: "separate",
    inputs: [
      { key: "length", label: "Length", type: "number", default: 14, min: 1, max: 100 },
    ],
    outputs: [
      { key: "viPlus", label: "VI+", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "viMinus", label: "VI-", style: "line", defaultColor: TV_COLORS.red, defaultLineWidth: 1 },
    ],
    docs: {
      definition: "The Vortex Indicator (VI) identifies the start of a new trend or continuation of an existing trend by comparing positive and negative trend movements.",
      explanation: "VI+ measures upward movement; VI- measures downward movement. When VI+ crosses above VI-, it signals bullish momentum. When VI- crosses above VI+, it signals bearish momentum.",
      calculations: "VM+ = |High - prevLow|\nVM- = |Low - prevHigh|\nTR = max(High-Low, |High-prevClose|, |Low-prevClose|)\nVI+ = sum(VM+, n) / sum(TR, n)\nVI- = sum(VM-, n) / sum(TR, n)",
      takeaways: [
        "VI+ crossing above VI- = bullish signal",
        "VI- crossing above VI+ = bearish signal",
        "Wide spread between VI+ and VI- = strong trend",
      ],
      whatToLookFor: [
        "Crossovers for trend change signals",
        "Divergence from price for reversal hints",
        "Spread width for trend strength",
      ],
      limitations: [
        "Can produce false signals in choppy markets",
        "Lagging during sharp reversals",
        "Works best with trend confirmation",
      ],
      goesGoodWith: ["adx", "dmi", "macd"],
      summary: "Vortex Indicator uses crossovers to identify trend direction. Simple but effective for trend following.",
      commonSettings: "Length: 14",
      bestConditions: "Trending markets with clear swings",
    },
  },
  {
    id: "aroon",
    name: "Aroon",
    shortName: "Aroon",
    category: "trend",
    tags: ["trend", "momentum", "aroon"],
    description: "Measures time since highest high and lowest low to identify trend changes",
    panePolicy: "separate",
    inputs: [
      { key: "length", label: "Length", type: "number", default: 14, min: 1, max: 100 },
    ],
    outputs: [
      { key: "aroonUp", label: "Aroon Up", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "aroonDown", label: "Aroon Down", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 1 },
    ],
    docs: {
      definition: "Aroon measures how long it has been since the highest high and lowest low occurred within a given period, scaled to 0-100.",
      explanation: "Aroon Up measures recency of the period high; Aroon Down measures recency of the period low. Values near 100 indicate the extreme occurred recently, suggesting trend strength.",
      calculations: "Lookback = Length + 1 bars\nbarsSinceHigh = bars since highest high in lookback\nbarsSinceLow = bars since lowest low in lookback\nAroon Up = 100 × (Length - barsSinceHigh) / Length\nAroon Down = 100 × (Length - barsSinceLow) / Length",
      takeaways: [
        "Aroon Up > 70 and Aroon Down < 30 = strong uptrend",
        "Aroon Down > 70 and Aroon Up < 30 = strong downtrend",
        "Both around 50 = consolidation",
      ],
      whatToLookFor: [
        "Crossovers for trend changes",
        "Extreme values (>70 or <30) for trend strength",
        "Parallel movement = range-bound market",
      ],
      limitations: [
        "Sensitive to period selection",
        "May lag during sharp reversals",
        "Best used with confirmation",
      ],
      goesGoodWith: ["aroonosc", "adx", "macd"],
      summary: "Aroon identifies trend strength by measuring time since price extremes. Simple yet effective for trend timing.",
      commonSettings: "Length: 14 or 25",
      bestConditions: "Markets with clear trends or establishing new trends",
    },
  },
  {
    id: "aroonosc",
    name: "Aroon Oscillator",
    shortName: "Aroon Osc",
    category: "trend",
    tags: ["trend", "oscillator", "aroon"],
    description: "Oscillator derived from Aroon Up - Aroon Down, ranging from -100 to +100",
    panePolicy: "separate",
    inputs: [
      { key: "length", label: "Length", type: "number", default: 14, min: 1, max: 100 },
      // Oscillator line coloring (TV-style: sign-based)
      { key: "lineAboveColor", label: "Color Above Zero", type: "color", default: TV_COLORS.green },
      { key: "lineBelowColor", label: "Color Below Zero", type: "color", default: TV_COLORS.red },
      { key: "lineWidth", label: "Line Width", type: "number", default: 1, min: 1, max: 4 },
      // Style inputs for levels
      { key: "showUpperLevel", label: "Upper Level", type: "boolean", default: true },
      { key: "showMiddleLevel", label: "Middle Level", type: "boolean", default: true },
      { key: "showLowerLevel", label: "Lower Level", type: "boolean", default: true },
      { key: "upperLevel", label: "Upper Level Value", type: "number", default: 90, min: 0, max: 100 },
      { key: "lowerLevel", label: "Lower Level Value", type: "number", default: -90, min: -100, max: 0 },
      { key: "upperLevelColor", label: "Upper Level Color", type: "color", default: TV_COLORS.gray },
      { key: "middleLevelColor", label: "Middle Level Color", type: "color", default: TV_COLORS.gray },
      { key: "lowerLevelColor", label: "Lower Level Color", type: "color", default: TV_COLORS.gray },
      // Fill color inputs
      { key: "showFill", label: "Show Fill", type: "boolean", default: true },
      { key: "fillAboveColor", label: "Fill Above Color", type: "color", default: "rgba(38, 166, 154, 0.2)" },
      { key: "fillBelowColor", label: "Fill Below Color", type: "color", default: "rgba(239, 83, 80, 0.2)" },
    ],
    outputs: [
      // Note: Oscillator rendered via canvas overlay with sign-based coloring
      { key: "oscillator", label: "Aroon Osc", style: "line", defaultColor: TV_COLORS.green, defaultLineWidth: 1 },
    ],
    docs: {
      definition: "The Aroon Oscillator is the difference between Aroon Up and Aroon Down, providing a single line oscillator ranging from -100 to +100.",
      explanation: "Positive values indicate bullish trend (recent highs), negative values indicate bearish trend (recent lows). Zero line crossovers signal potential trend changes.",
      calculations: "Aroon Oscillator = Aroon Up - Aroon Down\nRange: [-100, +100]",
      takeaways: [
        "Values > 0 indicate uptrend strength",
        "Values < 0 indicate downtrend strength",
        "Zero crossovers signal trend changes",
      ],
      whatToLookFor: [
        "Zero line crossovers for trend signals",
        "Extreme values (>90 or <-90) for strong trends",
        "Oscillator near zero = consolidation",
      ],
      limitations: [
        "Single line loses some nuance from Aroon pair",
        "Same lag as underlying Aroon",
        "Works best with trend confirmation",
      ],
      goesGoodWith: ["aroon", "adx", "rsi"],
      summary: "Aroon Oscillator simplifies Aroon into a single line. Positive = bullish, negative = bearish, zero crossovers = trend change.",
      commonSettings: "Length: 14 or 25, Levels: +90, 0, -90",
      bestConditions: "Trending markets with clear directional bias",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Volatility
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "bb",
    name: "Bollinger Bands",
    shortName: "BB",
    category: "volatility",
    tags: ["bands", "overlay", "classic"],
    description: "Volatility bands around a moving average",
    panePolicy: "overlay",
    inputs: [
      // TradingView-style inputs
      { key: "length", label: "Length", type: "number", default: 20, min: 1, max: 500 },
      { key: "basisMaType", label: "Basis MA Type", type: "select", default: "sma", options: [
        { value: "sma", label: "SMA" },
        { value: "ema", label: "EMA" },
        { value: "smma", label: "SMMA (RMA)" },
        { value: "wma", label: "WMA" },
        { value: "vwma", label: "VWMA" },
      ]},
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "close", label: "Close" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
      { key: "stdDev", label: "StdDev", type: "number", default: 2, min: 0.001, max: 50, step: 0.5 },
      { key: "offset", label: "Offset", type: "number", default: 0, min: -500, max: 500, step: 1 },
      // Style settings - line visibility toggles
      { key: "showBasis", label: "Basis", type: "boolean", default: true },
      { key: "showUpper", label: "Upper", type: "boolean", default: true },
      { key: "showLower", label: "Lower", type: "boolean", default: true },
      { key: "showBackground", label: "Background", type: "boolean", default: true },
      // Colors (TV defaults)
      { key: "basisColor", label: "Basis Color", type: "color", default: "#2962FF" },
      { key: "upperColor", label: "Upper Color", type: "color", default: "#F23645" },
      { key: "lowerColor", label: "Lower Color", type: "color", default: "#089981" },
      { key: "backgroundColor", label: "Background Color", type: "color", default: "rgba(33, 150, 243, 0.1)" },
      // Line widths
      { key: "basisLineWidth", label: "Basis Line Width", type: "number", default: 1, min: 1, max: 4, step: 1 },
      { key: "upperLineWidth", label: "Upper Line Width", type: "number", default: 1, min: 1, max: 4, step: 1 },
      { key: "lowerLineWidth", label: "Lower Line Width", type: "number", default: 1, min: 1, max: 4, step: 1 },
    ],
    outputs: [
      { key: "upper", label: "Upper", style: "line", defaultColor: "#F23645", defaultLineWidth: 1, bandPair: "lower" },
      { key: "middle", label: "Basis", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "lower", label: "Lower", style: "line", defaultColor: "#089981", defaultLineWidth: 1, bandPair: "upper" },
    ],
  },
  {
    id: "atr",
    name: "Average True Range",
    shortName: "ATR",
    category: "volatility",
    tags: ["range", "stop-loss"],
    description: "Measures market volatility based on true range",
    panePolicy: "separate",
    inputs: [
      // TradingView-style inputs
      { key: "length", label: "Length", type: "number", default: 14, min: 1, max: 100 },
      { key: "smoothing", label: "Smoothing", type: "select", default: "rma", options: [
        { value: "rma", label: "RMA" },
        { value: "sma", label: "SMA" },
        { value: "ema", label: "EMA" },
        { value: "wma", label: "WMA" },
      ]},
      // Style settings
      { key: "showATR", label: "Show ATR", type: "boolean", default: true },
      { key: "atrColor", label: "ATR Color", type: "color", default: "#FF5252" },
      { key: "atrLineWidth", label: "Line Width", type: "number", default: 1, min: 1, max: 4 },
      // Visibility toggles (TV-style)
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
      { key: "inputsInStatusLine", label: "Inputs in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "atr", label: "ATR", style: "line", defaultColor: "#FF5252", defaultLineWidth: 1 },
    ],
  },
  {
    id: "dc",
    name: "Donchian Channels",
    shortName: "DC",
    category: "volatility",
    tags: ["channels", "overlay", "breakout", "bands"],
    description: "Price channels based on highest high and lowest low over N periods",
    panePolicy: "overlay",
    inputs: [
      // === TradingView Inputs section ===
      { key: "length", label: "Length", type: "number", default: 20, min: 1, max: 500 },
      { key: "offset", label: "Offset", type: "number", default: 0, min: -500, max: 500 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: Basis line ===
      { key: "showBasis", label: "Basis", type: "boolean", default: true },
      { key: "basisColor", label: "Basis Color", type: "color", default: "#FF6D00" },
      { key: "basisLineWidth", label: "Basis Line Width", type: "number", default: 1, min: 1, max: 4 },
      // === Style section: Upper line ===
      { key: "showUpper", label: "Upper", type: "boolean", default: true },
      { key: "upperColor", label: "Upper Color", type: "color", default: "#2962FF" },
      { key: "upperLineWidth", label: "Upper Line Width", type: "number", default: 1, min: 1, max: 4 },
      // === Style section: Lower line ===
      { key: "showLower", label: "Lower", type: "boolean", default: true },
      { key: "lowerColor", label: "Lower Color", type: "color", default: "#2962FF" },
      { key: "lowerLineWidth", label: "Lower Line Width", type: "number", default: 1, min: 1, max: 4 },
      // === Style section: Background fill ===
      { key: "showBackground", label: "Background", type: "boolean", default: true },
      { key: "backgroundColor", label: "Background Color", type: "color", default: "rgba(41, 98, 255, 0.1)" },
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
      { key: "inputsInStatusLine", label: "Inputs in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "upper", label: "Upper", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1, bandPair: "lower" },
      { key: "basis", label: "Basis", style: "line", defaultColor: "#FF6D00", defaultLineWidth: 1 },
      { key: "lower", label: "Lower", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1, bandPair: "upper" },
    ],
  },

  // Keltner Channels (KC) - TradingView Parity
  // Volatility channels using EMA/SMA basis with ATR/TR/Range bands
  {
    id: "kc",
    name: "Keltner Channels",
    shortName: "KC",
    category: "volatility",
    tags: ["channels", "overlay", "bands", "keltner", "atr"],
    description: "Volatility channels using a moving average basis with ATR-based bands",
    panePolicy: "overlay",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "length", label: "Length", type: "number", default: 20, min: 1, max: 500 },
      { key: "multiplier", label: "Multiplier", type: "number", default: 2, min: 0.1, max: 50, step: 0.1 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "close", label: "Close" },
        { value: "hl2", label: "(H+L)/2" },
        { value: "hlc3", label: "(H+L+C)/3" },
        { value: "ohlc4", label: "(O+H+L+C)/4" },
        { value: "hlcc4", label: "(H+L+C+C)/4" },
      ]},
      { key: "useExp", label: "Use Exponential MA", type: "boolean", default: true },
      { key: "bandsStyle", label: "Bands Style", type: "select", default: "atr", options: [
        { value: "atr", label: "Average True Range" },
        { value: "tr", label: "True Range" },
        { value: "range", label: "Range" },
      ]},
      { key: "atrLength", label: "ATR Length", type: "number", default: 10, min: 1, max: 200 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: Upper line ===
      { key: "showUpper", label: "Upper", type: "boolean", default: true },
      { key: "upperColor", label: "Upper Color", type: "color", default: "#2962FF" },
      { key: "upperLineWidth", label: "Upper Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "upperLineStyle", label: "Upper Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Basis line ===
      { key: "showBasis", label: "Basis", type: "boolean", default: true },
      { key: "basisColor", label: "Basis Color", type: "color", default: "#2962FF" },
      { key: "basisLineWidth", label: "Basis Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "basisLineStyle", label: "Basis Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Lower line ===
      { key: "showLower", label: "Lower", type: "boolean", default: true },
      { key: "lowerColor", label: "Lower Color", type: "color", default: "#2962FF" },
      { key: "lowerLineWidth", label: "Lower Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "lowerLineStyle", label: "Lower Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Background fill ===
      { key: "showBackground", label: "Background", type: "boolean", default: true },
      { key: "backgroundColor", label: "Background Color", type: "color", default: "rgba(33, 150, 243, 0.05)" },
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
      { key: "inputsInStatusLine", label: "Inputs in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "upper", label: "Upper", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1, bandPair: "lower" },
      { key: "basis", label: "Basis", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "lower", label: "Lower", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1, bandPair: "upper" },
    ],
  },

  // Volatility Stop (VStop) - TradingView Parity
  // Trailing stop indicator that uses ATR-based volatility bands
  {
    id: "vstop",
    name: "Volatility Stop",
    shortName: "VStop",
    category: "volatility",
    tags: ["overlay", "stop", "trailing", "atr", "trend"],
    description: "ATR-based trailing stop that follows price and flips on trend reversals",
    panePolicy: "overlay",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "length", label: "Length", type: "number", default: 20, min: 1, max: 500 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "close", label: "Close" },
        { value: "hl2", label: "(H+L)/2" },
        { value: "hlc3", label: "(H+L+C)/3" },
        { value: "ohlc4", label: "(O+H+L+C)/4" },
        { value: "hlcc4", label: "(H+L+C+C)/4" },
      ]},
      { key: "multiplier", label: "Multiplier", type: "number", default: 2, min: 0.1, max: 50, step: 0.1 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section ===
      { key: "plotStyle", label: "Plot Style", type: "select", default: "cross", options: [
        { value: "cross", label: "Cross" },
        { value: "circles", label: "Circles" },
        { value: "line", label: "Line" },
      ]},
      { key: "uptrendColor", label: "Color 0 (Uptrend)", type: "color", default: "#089981" },
      { key: "downtrendColor", label: "Color 1 (Downtrend)", type: "color", default: "#F23645" },
      { key: "lineWidth", label: "Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "priceLineVisible", label: "Price Line", type: "boolean", default: false },
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
      { key: "inputsInStatusLine", label: "Inputs in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "vstop", label: "VStop", style: "line", defaultColor: "#089981", defaultLineWidth: 1 },
    ],
  },

  // Choppiness Index (CHOP) - TradingView Parity
  // Measures market choppiness/trendiness using ATR ratio
  {
    id: "chop",
    name: "Choppiness Index",
    shortName: "CHOP",
    category: "volatility",
    tags: ["oscillator", "choppiness", "trend", "range", "consolidation"],
    description: "Measures whether the market is choppy (ranging) or trending using ATR and price range",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "length", label: "Length", type: "number", default: 14, min: 1, max: 500 },
      { key: "offset", label: "Offset", type: "number", default: 0, min: -500, max: 500 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: CHOP line ===
      { key: "showChop", label: "CHOP", type: "boolean", default: true },
      { key: "chopColor", label: "CHOP Color", type: "color", default: "#2962FF" },
      { key: "chopLineWidth", label: "CHOP Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "chopLineStyle", label: "CHOP Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Upper Band (61.8) ===
      { key: "showUpperBand", label: "Upper Band", type: "boolean", default: true },
      { key: "upperBandValue", label: "Upper Band Value", type: "number", default: 61.8, min: 0, max: 100, step: 0.1 },
      { key: "upperBandColor", label: "Upper Band Color", type: "color", default: "#787B86" },
      { key: "upperBandLineStyle", label: "Upper Band Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Middle Band (50) ===
      { key: "showMiddleBand", label: "Middle Band", type: "boolean", default: true },
      { key: "middleBandValue", label: "Middle Band Value", type: "number", default: 50, min: 0, max: 100, step: 0.1 },
      { key: "middleBandColor", label: "Middle Band Color", type: "color", default: "#787B86" },
      { key: "middleBandLineStyle", label: "Middle Band Style", type: "select", default: "dotted", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Lower Band (38.2) ===
      { key: "showLowerBand", label: "Lower Band", type: "boolean", default: true },
      { key: "lowerBandValue", label: "Lower Band Value", type: "number", default: 38.2, min: 0, max: 100, step: 0.1 },
      { key: "lowerBandColor", label: "Lower Band Color", type: "color", default: "#787B86" },
      { key: "lowerBandLineStyle", label: "Lower Band Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Background fill ===
      { key: "showBackground", label: "Background", type: "boolean", default: true },
      { key: "backgroundFillColor", label: "Background Color", type: "color", default: "#2962FF" },
      { key: "backgroundFillOpacity", label: "Background Opacity", type: "number", default: 0.1, min: 0, max: 1, step: 0.01 },
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
      { key: "inputsInStatusLine", label: "Inputs in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "chop", label: "CHOP", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "upperBandLine", label: "Upper Band", style: "line", defaultColor: "#787B86", defaultLineWidth: 1 },
      { key: "middleBandLine", label: "Middle Band", style: "line", defaultColor: "#787B86", defaultLineWidth: 1 },
      { key: "lowerBandLine", label: "Lower Band", style: "line", defaultColor: "#787B86", defaultLineWidth: 1 },
    ],
  },

  // Historical Volatility (HV) - TradingView Parity
  // Measures annualized standard deviation of log returns
  {
    id: "hv",
    name: "Historical Volatility",
    shortName: "HV",
    category: "volatility",
    tags: ["oscillator", "volatility", "stdev", "log returns", "annualized"],
    description: "Annualized standard deviation of logarithmic returns, expressed as a percentage",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "length", label: "Length", type: "number", default: 10, min: 1, max: 500 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: HV line ===
      { key: "showHV", label: "HV", type: "boolean", default: true },
      { key: "hvColor", label: "HV Color", type: "color", default: "#2962FF" },
      { key: "hvLineWidth", label: "HV Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "hvLineStyle", label: "HV Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
      { key: "inputsInStatusLine", label: "Inputs in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "hv", label: "HV", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
    ],
  },

  // Bollinger BandWidth (BBW) - TradingView Parity
  // Measures the width of Bollinger Bands as a percentage of the middle band
  {
    id: "bbw",
    name: "Bollinger BandWidth",
    shortName: "BBW",
    category: "volatility",
    tags: ["oscillator", "volatility", "bollinger", "bandwidth", "squeeze"],
    description: "Measures the percentage difference between the upper and lower Bollinger Bands relative to the middle band",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "length", label: "Length", type: "number", default: 20, min: 1, max: 500 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "(H+L)/2" },
        { value: "hlc3", label: "(H+L+C)/3" },
        { value: "ohlc4", label: "(O+H+L+C)/4" },
      ]},
      { key: "stdDev", label: "StdDev", type: "number", default: 2.0, min: 0.1, max: 50, step: 0.1 },
      { key: "highestExpansionLength", label: "Highest Expansion Length", type: "number", default: 125, min: 1, max: 1000 },
      { key: "lowestContractionLength", label: "Lowest Contraction Length", type: "number", default: 125, min: 1, max: 1000 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: BBW line ===
      { key: "showBbw", label: "Bollinger BandWidth", type: "boolean", default: true },
      { key: "bbwColor", label: "BBW Color", type: "color", default: "#2962FF" },
      { key: "bbwLineWidth", label: "BBW Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "bbwLineStyle", label: "BBW Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Highest Expansion line ===
      { key: "showHighestExpansion", label: "Highest Expansion", type: "boolean", default: true },
      { key: "highestExpansionColor", label: "Highest Expansion Color", type: "color", default: "#F23645" },
      { key: "highestExpansionLineWidth", label: "Highest Expansion Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "highestExpansionLineStyle", label: "Highest Expansion Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Lowest Contraction line ===
      { key: "showLowestContraction", label: "Lowest Contraction", type: "boolean", default: true },
      { key: "lowestContractionColor", label: "Lowest Contraction Color", type: "color", default: "#26A69A" },
      { key: "lowestContractionLineWidth", label: "Lowest Contraction Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "lowestContractionLineStyle", label: "Lowest Contraction Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
      { key: "inputsInStatusLine", label: "Inputs in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "bbw", label: "BBW", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "highestExpansion", label: "Highest Expansion", style: "line", defaultColor: "#F23645", defaultLineWidth: 1 },
      { key: "lowestContraction", label: "Lowest Contraction", style: "line", defaultColor: "#26A69A", defaultLineWidth: 1 },
    ],
  },

  // BBTrend - Bollinger Bands Trend (TradingView Parity)
  // Measures trend strength based on short vs long Bollinger Bands relationship
  {
    id: "bbtrend",
    name: "BBTrend",
    shortName: "BBTrend",
    category: "volatility",
    tags: ["oscillator", "volatility", "bollinger", "trend", "histogram"],
    description: "Analyzes trend strength and direction based on two Bollinger Bands calculations",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "shortLength", label: "Short BB Length", type: "number", default: 20, min: 1, max: 500 },
      { key: "longLength", label: "Long BB Length", type: "number", default: 50, min: 1, max: 500 },
      { key: "stdDev", label: "StdDev", type: "number", default: 2.0, min: 0.1, max: 50, step: 0.1 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: BBTrend histogram ===
      { key: "showBbtrend", label: "BBTrend", type: "boolean", default: true },
      { key: "bbtrendPlotStyle", label: "BBTrend Plot Style", type: "select", default: "histogram", options: [
        { value: "histogram", label: "Histogram" },
        { value: "line", label: "Line" },
        { value: "area", label: "Area" },
      ]},
      // 4 colors for histogram (positive increasing, positive decreasing, negative increasing, negative decreasing)
      { key: "color0", label: "Color 0 (Positive, Growing)", type: "color", default: "#26A69A" }, // Dark green
      { key: "color1", label: "Color 1 (Positive, Falling)", type: "color", default: "#B2DFDB" }, // Light green
      { key: "color2", label: "Color 2 (Negative, Falling)", type: "color", default: "#FF5252" }, // Dark red
      { key: "color3", label: "Color 3 (Negative, Rising)", type: "color", default: "#FFCDD2" }, // Light red
      { key: "bbtrendLineWidth", label: "BBTrend Line Width", type: "number", default: 1, min: 1, max: 4 },
      // === Style section: Zero line ===
      { key: "showZeroLine", label: "Zero Line", type: "boolean", default: true },
      { key: "zeroLineColor", label: "Zero Line Color", type: "color", default: "#787B86" },
      { key: "zeroLineStyle", label: "Zero Line Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      { key: "zeroLineValue", label: "Zero Line Value", type: "number", default: 0 },
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
      { key: "inputsInStatusLine", label: "Inputs in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "bbtrend", label: "BBTrend", style: "histogram", defaultColor: "#26A69A", defaultLineWidth: 1 },
      { key: "zeroline", label: "Zero Line", style: "line", defaultColor: "#787B86", defaultLineWidth: 1 },
    ],
  },

  // Ulcer Index - Downside Volatility Indicator (TradingView Parity)
  // Measures RMS of percentage drawdowns from rolling highest
  {
    id: "ulcer",
    name: "Ulcer Index",
    shortName: "Ulcer Index",
    category: "volatility",
    tags: ["oscillator", "volatility", "risk", "drawdown"],
    description: "Measures downside volatility as root mean square of percentage drawdowns",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "close", label: "Close" },
        { value: "hl2", label: "(H+L)/2" },
        { value: "hlc3", label: "(H+L+C)/3" },
        { value: "ohlc4", label: "(O+H+L+C)/4" },
        { value: "hlcc4", label: "(H+L+C+C)/4" },
      ]},
      { key: "length", label: "Length", type: "number", default: 14, min: 1, max: 500 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: Ulcer Index line ===
      { key: "showUlcer", label: "Ulcer Index", type: "boolean", default: true },
      { key: "ulcerColor", label: "Ulcer Color", type: "color", default: "#2962FF" },
      { key: "ulcerLineWidth", label: "Ulcer Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "ulcerLineStyle", label: "Ulcer Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Zero line ===
      { key: "showZero", label: "Zero", type: "boolean", default: true },
      { key: "zeroColor", label: "Zero Color", type: "color", default: "#787B86" },
      { key: "zeroLineStyle", label: "Zero Line Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      { key: "zeroValue", label: "Zero Value", type: "number", default: 0 },
      // === Style section: Plots Background (fill between 0 and ulcer line) ===
      { key: "showBackground", label: "Plots Background", type: "boolean", default: true },
      { key: "backgroundFillColor", label: "Background Fill Color", type: "color", default: "#2962FF" },
      { key: "backgroundFillOpacity", label: "Background Fill Opacity", type: "number", default: 0.1, min: 0, max: 1, step: 0.05 },
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
      { key: "inputsInStatusLine", label: "Inputs in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "ulcer", label: "Ulcer Index", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "zero", label: "Zero", style: "line", defaultColor: "#787B86", defaultLineWidth: 1 },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Volume
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "vwap",
    name: "Volume Weighted Average Price",
    shortName: "VWAP",
    category: "volume",
    tags: ["overlay", "intraday", "institutional", "bands"],
    description: "Average price weighted by volume with standard deviation bands",
    panePolicy: "overlay",
    inputs: [
      // === TradingView Inputs section ===
      { key: "hideOn1DOrAbove", label: "Hide VWAP on 1D or Above", type: "boolean", default: false },
      { key: "anchorPeriod", label: "Anchor Period", type: "select", default: "session", options: [
        { value: "session", label: "Session" },
        { value: "week", label: "Week" },
        { value: "month", label: "Month" },
        { value: "quarter", label: "Quarter" },
        { value: "year", label: "Year" },
      ]},
      { key: "source", label: "Source", type: "select", default: "hlc3", options: [
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "close", label: "Close" },
        { value: "hl2", label: "(H+L)/2" },
        { value: "hlc3", label: "(H+L+C)/3" },
        { value: "ohlc4", label: "(O+H+L+C)/4" },
        { value: "hlcc4", label: "(H+L+C+C)/4" },
      ]},
      { key: "offset", label: "Offset", type: "number", default: 0, min: -100, max: 100 },
      { key: "bandsMode", label: "Bands Calculation Mode", type: "select", default: "stdev", options: [
        { value: "stdev", label: "Standard Deviation" },
        { value: "percentage", label: "Percentage" },
      ]},
      // Bands Multiplier inputs (TV-style)
      { key: "band1Enabled", label: "Band #1", type: "boolean", default: true },
      { key: "bandMultiplier1", label: "Band #1 Multiplier", type: "number", default: 1.0, min: 0.1, max: 50, step: 0.1 },
      { key: "band2Enabled", label: "Band #2", type: "boolean", default: true },
      { key: "bandMultiplier2", label: "Band #2 Multiplier", type: "number", default: 2.0, min: 0.1, max: 50, step: 0.1 },
      { key: "band3Enabled", label: "Band #3", type: "boolean", default: true },
      { key: "bandMultiplier3", label: "Band #3 Multiplier", type: "number", default: 3.0, min: 0.1, max: 50, step: 0.1 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: VWAP line ===
      { key: "showVwap", label: "VWAP", type: "boolean", default: true },
      { key: "vwapColor", label: "VWAP Color", type: "color", default: "#2962FF" },
      { key: "vwapLineWidth", label: "VWAP Line Width", type: "number", default: 1, min: 1, max: 4 },
      // === Style section: Band #1 ===
      { key: "showBand1", label: "Upper/Lower Band #1", type: "boolean", default: true },
      { key: "band1Color", label: "Band #1 Color", type: "color", default: "#4CAF50" },
      // === Style section: Band #2 ===
      { key: "showBand2", label: "Upper/Lower Band #2", type: "boolean", default: true },
      { key: "band2Color", label: "Band #2 Color", type: "color", default: "#808000" },
      // === Style section: Band #3 ===
      { key: "showBand3", label: "Upper/Lower Band #3", type: "boolean", default: true },
      { key: "band3Color", label: "Band #3 Color", type: "color", default: "#00897B" },
      // === Style section: Band Fills ===
      { key: "showFill1", label: "Bands Fill #1", type: "boolean", default: true },
      { key: "fill1Color", label: "Fill #1 Color", type: "color", default: "#4CAF50" },
      { key: "fill1Opacity", label: "Fill #1 Opacity", type: "number", default: 0.1, min: 0, max: 1, step: 0.01 },
      { key: "showFill2", label: "Bands Fill #2", type: "boolean", default: true },
      { key: "fill2Color", label: "Fill #2 Color", type: "color", default: "#808000" },
      { key: "fill2Opacity", label: "Fill #2 Opacity", type: "number", default: 0.1, min: 0, max: 1, step: 0.01 },
      { key: "showFill3", label: "Bands Fill #3", type: "boolean", default: true },
      { key: "fill3Color", label: "Fill #3 Color", type: "color", default: "#00897B" },
      { key: "fill3Opacity", label: "Fill #3 Opacity", type: "number", default: 0.1, min: 0, max: 1, step: 0.01 },
    ],
    outputs: [
      { key: "vwap", label: "VWAP", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "upper1", label: "Upper #1", style: "line", defaultColor: "#4CAF50", defaultLineWidth: 1 },
      { key: "lower1", label: "Lower #1", style: "line", defaultColor: "#4CAF50", defaultLineWidth: 1 },
      { key: "upper2", label: "Upper #2", style: "line", defaultColor: "#808000", defaultLineWidth: 1 },
      { key: "lower2", label: "Lower #2", style: "line", defaultColor: "#808000", defaultLineWidth: 1 },
      { key: "upper3", label: "Upper #3", style: "line", defaultColor: "#00897B", defaultLineWidth: 1 },
      { key: "lower3", label: "Lower #3", style: "line", defaultColor: "#00897B", defaultLineWidth: 1 },
    ],
  },
  {
    id: "avwap",
    name: "Anchored VWAP",
    shortName: "AVWAP",
    category: "volume",
    tags: ["overlay", "anchor", "institutional", "vwap"],
    description: "VWAP anchored to a specific date - never resets",
    panePolicy: "overlay",
    inputs: [
      { key: "anchorDate", label: "Anchor Date", type: "select", default: "first", options: [
        { value: "first", label: "First Bar" },
        { value: "week", label: "Week Ago" },
        { value: "month", label: "Month Ago" },
        { value: "quarter", label: "Quarter Ago" },
        { value: "year", label: "Year Ago" },
      ]},
      { key: "showBands", label: "Show Bands", type: "select", default: "true", options: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ]},
      { key: "bandMultiplier1", label: "Band 1 Mult", type: "number", default: 1.0, min: 0.1, max: 10, step: 0.1 },
      { key: "bandMultiplier2", label: "Band 2 Mult", type: "number", default: 2.0, min: 0.1, max: 10, step: 0.1 },
      { key: "bandMultiplier3", label: "Band 3 Mult", type: "number", default: 3.0, min: 0.1, max: 10, step: 0.1 },
    ],
    outputs: [
      { key: "vwap", label: "AVWAP", style: "line", defaultColor: TV_COLORS.teal, defaultLineWidth: 2 },
      { key: "upper1", label: "Upper 1", style: "line", defaultColor: TV_COLORS.teal, defaultLineWidth: 1 },
      { key: "lower1", label: "Lower 1", style: "line", defaultColor: TV_COLORS.teal, defaultLineWidth: 1 },
      { key: "upper2", label: "Upper 2", style: "line", defaultColor: TV_COLORS.teal, defaultLineWidth: 1 },
      { key: "lower2", label: "Lower 2", style: "line", defaultColor: TV_COLORS.teal, defaultLineWidth: 1 },
      { key: "upper3", label: "Upper 3", style: "line", defaultColor: TV_COLORS.teal, defaultLineWidth: 1 },
      { key: "lower3", label: "Lower 3", style: "line", defaultColor: TV_COLORS.teal, defaultLineWidth: 1 },
    ],
  },
  {
    id: "obv",
    name: "On Balance Volume",
    shortName: "OBV",
    category: "volume",
    tags: ["accumulation", "distribution", "divergence"],
    description: "Cumulative volume based on price direction",
    panePolicy: "separate",
    needsExtendedHistory: true, // OBV is cumulative, needs full history for TV-parity
    inputs: [
      // === Inputs section: Smoothing (TV-style) ===
      { key: "smoothingType", label: "Smoothing Type", type: "select", default: "none", options: [
        { value: "none", label: "None" },
        { value: "sma", label: "SMA" },
        { value: "sma_bb", label: "SMA + Bollinger Bands" },
        { value: "ema", label: "EMA" },
        { value: "smma", label: "SMMA (RMA)" },
        { value: "wma", label: "WMA" },
        { value: "vwma", label: "VWMA" },
      ]},
      { key: "smoothingLength", label: "Length", type: "number", default: 14, min: 1, max: 500 },
      { key: "bbStdDev", label: "BB StdDev", type: "number", default: 2, min: 0.1, max: 10, step: 0.1 },
      // === Inputs section: Calculation (TV-parity, no-op) ===
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: OBV line ===
      { key: "showObv", label: "OBV", type: "boolean", default: true },
      { key: "obvColor", label: "OBV Color", type: "color", default: TV_COLORS.blue },
      { key: "obvLineWidth", label: "OBV Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "obvLineStyle", label: "OBV Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      { key: "obvPlotStyle", label: "OBV Plot Style", type: "select", default: "line", options: [
        { value: "line", label: "Line" },
        { value: "line_breaks", label: "Line with breaks" },
        { value: "step", label: "Step line" },
        { value: "step_breaks", label: "Step line with breaks" },
        { value: "step_diamonds", label: "Step line with diamonds" },
        { value: "histogram", label: "Histogram" },
        { value: "cross", label: "Cross" },
        { value: "area", label: "Area" },
        { value: "area_breaks", label: "Area with breaks" },
        { value: "columns", label: "Columns" },
        { value: "circles", label: "Circles" },
      ]},
      { key: "obvPriceLine", label: "Price Line", type: "boolean", default: true },
      // === Style section: Smoothing line (when smoothingType !== none) ===
      { key: "showSmoothing", label: "Smoothing MA", type: "boolean", default: true },
      { key: "smoothingColor", label: "Smoothing Color", type: "color", default: TV_COLORS.orange },
      { key: "smoothingLineWidth", label: "Smoothing Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "smoothingLineStyle", label: "Smoothing Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: BB lines (when smoothingType === sma_bb) ===
      { key: "showBBUpper", label: "BB Upper", type: "boolean", default: true },
      { key: "showBBLower", label: "BB Lower", type: "boolean", default: true },
      { key: "bbColor", label: "BB Color", type: "color", default: TV_COLORS.blue },
      { key: "bbLineWidth", label: "BB Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "bbLineStyle", label: "BB Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      { key: "showBBFill", label: "BB Fill", type: "boolean", default: true },
      { key: "bbFillColor", label: "BB Fill Color", type: "color", default: TV_COLORS.blue },
      { key: "bbFillOpacity", label: "BB Fill Opacity", type: "number", default: 0.1, min: 0, max: 1, step: 0.05 },
    ],
    outputs: [
      { key: "obv", label: "OBV", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "smoothing", label: "Smoothing MA", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 1 },
      { key: "bbUpper", label: "BB Upper", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "bbLower", label: "BB Lower", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
    ],
  },
  {
    id: "mfi",
    name: "Money Flow Index",
    shortName: "MFI",
    category: "volume",
    tags: ["oscillator", "volume", "overbought", "oversold", "money flow"],
    description: "Volume-weighted RSI measuring buying and selling pressure (0-100)",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "length", label: "Length", type: "number", default: 14, min: 1, max: 100 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: MF line ===
      { key: "showMF", label: "MF", type: "boolean", default: true },
      { key: "mfColor", label: "MF Color", type: "color", default: TV_COLORS.purpleTv },
      { key: "mfLineWidth", label: "MF Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "mfLineStyle", label: "MF Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Overbought Band (80) ===
      { key: "showOverbought", label: "Overbought", type: "boolean", default: true },
      { key: "overboughtValue", label: "Overbought Value", type: "number", default: 80, min: 50, max: 100 },
      { key: "overboughtColor", label: "Overbought Color", type: "color", default: TV_COLORS.gray },
      { key: "overboughtLineStyle", label: "Overbought Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Middle Band (50) ===
      { key: "showMiddleBand", label: "Middle Band", type: "boolean", default: true },
      { key: "middleBandValue", label: "Middle Band Value", type: "number", default: 50, min: 0, max: 100 },
      { key: "middleBandColor", label: "Middle Band Color", type: "color", default: TV_COLORS.gray },
      { key: "middleBandLineStyle", label: "Middle Band Style", type: "select", default: "dotted", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Oversold Band (20) ===
      { key: "showOversold", label: "Oversold", type: "boolean", default: true },
      { key: "oversoldValue", label: "Oversold Value", type: "number", default: 20, min: 0, max: 50 },
      { key: "oversoldColor", label: "Oversold Color", type: "color", default: TV_COLORS.gray },
      { key: "oversoldLineStyle", label: "Oversold Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Background fill ===
      { key: "showBackground", label: "Background", type: "boolean", default: true },
      { key: "backgroundFillColor", label: "Background Color", type: "color", default: TV_COLORS.purpleTv },
      { key: "backgroundFillOpacity", label: "Background Opacity", type: "number", default: 0.1, min: 0, max: 1, step: 0.01 },
    ],
    outputs: [
      { key: "mf", label: "MF", style: "line", defaultColor: TV_COLORS.purpleTv, defaultLineWidth: 1 },
      { key: "overboughtLine", label: "Overbought", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
      { key: "middleBandLine", label: "Middle Band", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
      { key: "oversoldLine", label: "Oversold", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
    ],
  },
  {
    id: "trix",
    name: "TRIX",
    shortName: "TRIX",
    category: "momentum",
    tags: ["oscillator", "trix", "momentum", "triple ema", "percent change"],
    description: "Triple Exponential Average oscillator showing percent change of triple-smoothed EMA",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "length", label: "Length", type: "number", default: 18, min: 1, max: 200 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: TRIX line ===
      { key: "showTrix", label: "TRIX", type: "boolean", default: true },
      { key: "trixColor", label: "TRIX Color", type: "color", default: TV_COLORS.red },
      { key: "trixLineWidth", label: "TRIX Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "trixLineStyle", label: "TRIX Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Zero line ===
      { key: "showZero", label: "Zero", type: "boolean", default: true },
      { key: "zeroValue", label: "Zero Value", type: "number", default: 0, min: -100, max: 100, step: 0.1 },
      { key: "zeroColor", label: "Zero Color", type: "color", default: TV_COLORS.gray },
      { key: "zeroLineStyle", label: "Zero Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
    ],
    outputs: [
      { key: "trix", label: "TRIX", style: "line", defaultColor: TV_COLORS.red, defaultLineWidth: 1 },
      { key: "zeroLine", label: "Zero", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
    ],
  },
  {
    id: "tsi",
    name: "True Strength Index",
    shortName: "TSI",
    category: "momentum",
    tags: ["oscillator", "tsi", "momentum", "double smoothed", "signal line"],
    description: "Double-smoothed momentum oscillator with signal line for crossover signals",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "longLength", label: "Long Length", type: "number", default: 25, min: 1, max: 200 },
      { key: "shortLength", label: "Short Length", type: "number", default: 13, min: 1, max: 100 },
      { key: "signalLength", label: "Signal Length", type: "number", default: 13, min: 1, max: 100 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: TSI line ===
      { key: "showTsi", label: "True Strength Index", type: "boolean", default: true },
      { key: "tsiColor", label: "TSI Color", type: "color", default: TV_COLORS.blue },
      { key: "tsiLineWidth", label: "TSI Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "tsiLineStyle", label: "TSI Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Signal line ===
      { key: "showSignal", label: "Signal", type: "boolean", default: true },
      { key: "signalColor", label: "Signal Color", type: "color", default: TV_COLORS.red },
      { key: "signalLineWidth", label: "Signal Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "signalLineStyle", label: "Signal Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Zero line ===
      { key: "showZero", label: "Zero", type: "boolean", default: true },
      { key: "zeroValue", label: "Zero Value", type: "number", default: 0, min: -100, max: 100, step: 0.1 },
      { key: "zeroColor", label: "Zero Color", type: "color", default: TV_COLORS.gray },
      { key: "zeroLineStyle", label: "Zero Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
    ],
    outputs: [
      { key: "tsi", label: "TSI", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "signal", label: "Signal", style: "line", defaultColor: TV_COLORS.red, defaultLineWidth: 1 },
      { key: "zeroLine", label: "Zero", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
    ],
  },
  {
    id: "smii",
    name: "SMI Ergodic Indicator",
    shortName: "SMII",
    category: "momentum",
    tags: ["oscillator", "smii", "smi", "ergodic", "momentum", "signal line"],
    description: "Double-smoothed momentum oscillator with signal line, similar to TSI but unscaled",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "longLength", label: "Long Length", type: "number", default: 20, min: 1, max: 200 },
      { key: "shortLength", label: "Short Length", type: "number", default: 5, min: 1, max: 100 },
      { key: "signalLength", label: "Signal Line Length", type: "number", default: 5, min: 1, max: 100 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: SMI line ===
      { key: "showSmi", label: "SMI", type: "boolean", default: true },
      { key: "smiColor", label: "SMI Color", type: "color", default: TV_COLORS.blue },
      { key: "smiLineWidth", label: "SMI Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "smiLineStyle", label: "SMI Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Signal line ===
      { key: "showSignal", label: "Signal", type: "boolean", default: true },
      { key: "signalColor", label: "Signal Color", type: "color", default: TV_COLORS.orange },
      { key: "signalLineWidth", label: "Signal Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "signalLineStyle", label: "Signal Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
    ],
    outputs: [
      { key: "smi", label: "SMI", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "signal", label: "Signal", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 1 },
    ],
  },

  // SMI Ergodic Oscillator (SMIO) - TradingView Parity
  // Histogram showing the difference between SMI and its Signal line
  {
    id: "smio",
    name: "SMI Ergodic Oscillator",
    shortName: "SMIO",
    category: "momentum",
    tags: ["oscillator", "smio", "smi", "ergodic", "momentum", "histogram"],
    description: "Histogram showing the difference between SMI and its Signal line (SMI - Signal)",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "longLength", label: "Long Length", type: "number", default: 20, min: 1, max: 200 },
      { key: "shortLength", label: "Short Length", type: "number", default: 5, min: 1, max: 100 },
      { key: "signalLength", label: "Signal Line Length", type: "number", default: 5, min: 1, max: 100 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: Oscillator (single plot) ===
      { key: "showOscillator", label: "SMI Ergodic Oscillator", type: "boolean", default: true },
      { key: "oscillatorColor", label: "Color", type: "color", default: TV_COLORS.red },
      { key: "oscillatorPlotStyle", label: "Plot Style", type: "select", default: "histogram", options: [
        { value: "line", label: "Line" },
        { value: "histogram", label: "Histogram" },
        { value: "columns", label: "Columns" },
        { value: "area", label: "Area" },
        { value: "stepline", label: "Step Line" },
      ]},
      { key: "oscillatorLineWidth", label: "Line Width", type: "number", default: 1, min: 1, max: 4 },
    ],
    outputs: [
      { key: "oscillator", label: "SMI Ergodic Oscillator", style: "histogram", defaultColor: TV_COLORS.red, defaultLineWidth: 1 },
    ],
  },

  // Coppock Curve - TradingView Parity
  // Momentum oscillator: WMA of (ROC(long) + ROC(short))
  {
    id: "coppock",
    name: "Coppock Curve",
    shortName: "Coppock",
    category: "momentum",
    tags: ["oscillator", "coppock", "momentum", "roc", "wma", "trend"],
    description: "Long-term momentum oscillator using weighted moving average of rate of change sums",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "wmaLength", label: "WMA Length", type: "number", default: 10, min: 1, max: 200 },
      { key: "longRocLength", label: "Long RoC Length", type: "number", default: 14, min: 1, max: 200 },
      { key: "shortRocLength", label: "Short RoC Length", type: "number", default: 11, min: 1, max: 200 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: Coppock Curve (single plot) ===
      { key: "showCoppock", label: "Coppock Curve", type: "boolean", default: true },
      { key: "coppockColor", label: "Color", type: "color", default: TV_COLORS.blue },
      { key: "coppockPlotStyle", label: "Plot Style", type: "select", default: "line", options: [
        { value: "line", label: "Line" },
        { value: "lineWithBreaks", label: "Line with Breaks" },
        { value: "stepline", label: "Step Line" },
        { value: "histogram", label: "Histogram" },
        { value: "columns", label: "Columns" },
        { value: "area", label: "Area" },
      ]},
      { key: "coppockLineWidth", label: "Line Width", type: "number", default: 1, min: 1, max: 4 },
    ],
    outputs: [
      { key: "coppock", label: "Coppock Curve", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
    ],
  },

  // Chande Momentum Oscillator (CMO) - TradingView Parity
  // Momentum oscillator bounded -100 to +100
  {
    id: "cmo",
    name: "Chande Momentum Oscillator",
    shortName: "ChandeMO",
    category: "momentum",
    tags: ["oscillator", "cmo", "chande", "momentum", "overbought", "oversold"],
    description: "Momentum oscillator measuring the difference between gains and losses over a period",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "length", label: "Length", type: "number", default: 9, min: 1, max: 200 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
        { value: "hlcc4", label: "HLCC4" },
      ]},
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: CMO line ===
      { key: "showCmo", label: "ChandeMO", type: "boolean", default: true },
      { key: "cmoColor", label: "Color", type: "color", default: TV_COLORS.blue },
      { key: "cmoPlotStyle", label: "Plot Style", type: "select", default: "line", options: [
        { value: "line", label: "Line" },
        { value: "lineWithBreaks", label: "Line with Breaks" },
        { value: "stepline", label: "Step Line" },
        { value: "histogram", label: "Histogram" },
        { value: "columns", label: "Columns" },
        { value: "area", label: "Area" },
      ]},
      { key: "cmoLineWidth", label: "Line Width", type: "number", default: 1, min: 1, max: 4 },
      // === Style section: Zero line ===
      { key: "showZero", label: "Zero Line", type: "boolean", default: true },
      { key: "zeroLevel", label: "Zero Level", type: "number", default: 0, min: -100, max: 100 },
      { key: "zeroColor", label: "Zero Color", type: "color", default: TV_COLORS.gray },
      { key: "zeroLineWidth", label: "Zero Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "zeroLineStyle", label: "Zero Line Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
    ],
    outputs: [
      { key: "cmo", label: "ChandeMO", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "zero", label: "Zero Line", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
    ],
  },

  // Ultimate Oscillator (UO) - TradingView Parity
  // Multi-timeframe momentum oscillator bounded 0 to 100
  {
    id: "uo",
    name: "Ultimate Oscillator",
    shortName: "UO",
    category: "momentum",
    tags: ["oscillator", "uo", "ultimate", "momentum", "overbought", "oversold", "multi-timeframe"],
    description: "Multi-timeframe momentum oscillator using weighted average of three periods",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "fastLength", label: "Fast Length", type: "number", default: 7, min: 1, max: 100 },
      { key: "middleLength", label: "Middle Length", type: "number", default: 14, min: 1, max: 100 },
      { key: "slowLength", label: "Slow Length", type: "number", default: 28, min: 1, max: 200 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: UO line ===
      { key: "showUo", label: "UO", type: "boolean", default: true },
      { key: "uoColor", label: "Color", type: "color", default: TV_COLORS.red },
      { key: "uoPlotStyle", label: "Plot Style", type: "select", default: "line", options: [
        { value: "line", label: "Line" },
        { value: "lineWithBreaks", label: "Line with Breaks" },
        { value: "stepline", label: "Step Line" },
        { value: "histogram", label: "Histogram" },
        { value: "columns", label: "Columns" },
        { value: "area", label: "Area" },
      ]},
      { key: "uoLineWidth", label: "Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "uoLineStyle", label: "Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      { key: "showPriceLine", label: "Price Line", type: "boolean", default: false },
    ],
    outputs: [
      { key: "uo", label: "UO", style: "line", defaultColor: TV_COLORS.red, defaultLineWidth: 1 },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Batch 2: Additional Momentum
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "stoch",
    name: "Stochastic",
    shortName: "Stoch",
    category: "momentum",
    tags: ["oscillator", "overbought", "oversold", "stochastic"],
    description: "Compares closing price to price range over N periods (0-100)",
    panePolicy: "separate",
    inputs: [
      // === TradingView Inputs section ===
      { key: "kLength", label: "%K Length", type: "number", default: 14, min: 1, max: 100 },
      { key: "kSmoothing", label: "%K Smoothing", type: "number", default: 1, min: 1, max: 10 },
      { key: "dSmoothing", label: "%D Smoothing", type: "number", default: 3, min: 1, max: 10 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "dropdown", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: K line ===
      { key: "showK", label: "%K", type: "boolean", default: true },
      { key: "kColor", label: "%K Color", type: "color", default: TV_COLORS.blue },
      { key: "kLineWidth", label: "%K Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "kLineStyle", label: "%K Line Style", type: "dropdown", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: D line ===
      { key: "showD", label: "%D", type: "boolean", default: true },
      { key: "dColor", label: "%D Color", type: "color", default: TV_COLORS.orange },
      { key: "dLineWidth", label: "%D Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "dLineStyle", label: "%D Line Style", type: "dropdown", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Upper Band (80) ===
      { key: "showUpperBand", label: "Upper Band", type: "boolean", default: true },
      { key: "upperBandValue", label: "Upper Band Value", type: "number", default: 80, min: 0, max: 100 },
      { key: "upperBandColor", label: "Upper Band Color", type: "color", default: TV_COLORS.gray },
      { key: "upperBandLineStyle", label: "Upper Band Style", type: "dropdown", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Middle Band (50) ===
      { key: "showMiddleBand", label: "Middle Band", type: "boolean", default: true },
      { key: "middleBandValue", label: "Middle Band Value", type: "number", default: 50, min: 0, max: 100 },
      { key: "middleBandColor", label: "Middle Band Color", type: "color", default: TV_COLORS.gray },
      { key: "middleBandLineStyle", label: "Middle Band Style", type: "dropdown", default: "dotted", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Lower Band (20) ===
      { key: "showLowerBand", label: "Lower Band", type: "boolean", default: true },
      { key: "lowerBandValue", label: "Lower Band Value", type: "number", default: 20, min: 0, max: 100 },
      { key: "lowerBandColor", label: "Lower Band Color", type: "color", default: TV_COLORS.gray },
      { key: "lowerBandLineStyle", label: "Lower Band Style", type: "dropdown", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Background fill ===
      { key: "showBackground", label: "Background", type: "boolean", default: true },
      { key: "backgroundFillColor", label: "Background Color", type: "color", default: TV_COLORS.blue },
      { key: "backgroundFillOpacity", label: "Background Opacity", type: "number", default: 0.1, min: 0, max: 1, step: 0.01 },
    ],
    outputs: [
      { key: "stochK", label: "%K", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "stochD", label: "%D", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 1 },
      { key: "upperBandLine", label: "Upper Band", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
      { key: "middleBandLine", label: "Middle Band", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
      { key: "lowerBandLine", label: "Lower Band", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
    ],
  },
  {
    id: "stochrsi",
    name: "Stochastic RSI",
    shortName: "StochRSI",
    category: "momentum",
    tags: ["oscillator", "rsi", "stochastic", "overbought", "oversold"],
    description: "Stochastic oscillator applied to RSI values (0-100)",
    panePolicy: "separate",
    inputs: [
      // === TradingView Inputs section ===
      { key: "k", label: "K", type: "number", default: 3, min: 1, max: 50 },
      { key: "d", label: "D", type: "number", default: 3, min: 1, max: 50 },
      { key: "rsiLength", label: "RSI Length", type: "number", default: 14, min: 1, max: 100 },
      { key: "stochasticLength", label: "Stochastic Length", type: "number", default: 14, min: 1, max: 100 },
      { key: "source", label: "RSI Source", type: "dropdown", default: "close", options: [
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "close", label: "Close" },
        { value: "hl2", label: "(H+L)/2" },
        { value: "hlc3", label: "(H+L+C)/3" },
        { value: "ohlc4", label: "(O+H+L+C)/4" },
      ]},
      // === Style section: K line ===
      { key: "showK", label: "K", type: "boolean", default: true },
      { key: "kColor", label: "K Color", type: "color", default: TV_COLORS.blue },
      { key: "kLineWidth", label: "K Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "kLineStyle", label: "K Line Style", type: "dropdown", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: D line ===
      { key: "showD", label: "D", type: "boolean", default: true },
      { key: "dColor", label: "D Color", type: "color", default: TV_COLORS.orange },
      { key: "dLineWidth", label: "D Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "dLineStyle", label: "D Line Style", type: "dropdown", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Upper Band (80) ===
      { key: "showUpperBand", label: "Upper Band", type: "boolean", default: true },
      { key: "upperBandValue", label: "Upper Band Value", type: "number", default: 80, min: 0, max: 100 },
      { key: "upperBandColor", label: "Upper Band Color", type: "color", default: TV_COLORS.gray },
      { key: "upperBandLineStyle", label: "Upper Band Style", type: "dropdown", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Middle Band (50) ===
      { key: "showMiddleBand", label: "Middle Band", type: "boolean", default: true },
      { key: "middleBandValue", label: "Middle Band Value", type: "number", default: 50, min: 0, max: 100 },
      { key: "middleBandColor", label: "Middle Band Color", type: "color", default: TV_COLORS.gray },
      { key: "middleBandLineStyle", label: "Middle Band Style", type: "dropdown", default: "dotted", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Lower Band (20) ===
      { key: "showLowerBand", label: "Lower Band", type: "boolean", default: true },
      { key: "lowerBandValue", label: "Lower Band Value", type: "number", default: 20, min: 0, max: 100 },
      { key: "lowerBandColor", label: "Lower Band Color", type: "color", default: TV_COLORS.gray },
      { key: "lowerBandLineStyle", label: "Lower Band Style", type: "dropdown", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Background fill ===
      { key: "showBackground", label: "Background", type: "boolean", default: true },
      { key: "backgroundFillColor", label: "Background Color", type: "color", default: TV_COLORS.blue },
      { key: "backgroundFillOpacity", label: "Background Opacity", type: "number", default: 0.1, min: 0, max: 1, step: 0.01 },
    ],
    outputs: [
      { key: "stochRsiK", label: "K", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "stochRsiD", label: "D", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 1 },
      { key: "upperBandLine", label: "Upper Band", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
      { key: "middleBandLine", label: "Middle Band", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
      { key: "lowerBandLine", label: "Lower Band", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
    ],
  },
  {
    id: "cci",
    name: "Commodity Channel Index",
    shortName: "CCI",
    category: "momentum",
    tags: ["oscillator", "overbought", "oversold", "cci"],
    description: "Measures deviation from statistical mean (unbounded, typically ±200)",
    panePolicy: "separate",
    inputs: [
      // TradingView-style Inputs section
      { key: "length", label: "Length", type: "number", default: 20, min: 1, max: 200 },
      { key: "source", label: "Source", type: "select", default: "hlc3", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
      // Smoothing section (TV-style)
      { key: "smoothingType", label: "Smoothing Type", type: "select", default: "none", options: [
        { value: "none", label: "None" },
        { value: "sma", label: "SMA" },
        { value: "sma_bb", label: "SMA + Bollinger Bands" },
        { value: "ema", label: "EMA" },
        { value: "smma", label: "SMMA (RMA)" },
        { value: "wma", label: "WMA" },
        { value: "vwma", label: "VWMA" },
      ]},
      { key: "smoothingLength", label: "Smoothing Length", type: "number", default: 14, min: 1, max: 100 },
      { key: "bbStdDev", label: "BB StdDev", type: "number", default: 2, min: 0.1, max: 5, step: 0.1 },
      // Style: CCI line
      { key: "showCCI", label: "Show CCI", type: "boolean", default: true },
      { key: "cciColor", label: "CCI Color", type: "color", default: "#2962FF" },
      { key: "cciLineWidth", label: "CCI Line Width", type: "number", default: 1, min: 1, max: 4 },
      // Style: CCI-based MA
      { key: "showCCIMA", label: "Show CCI-based MA", type: "boolean", default: true },
      { key: "cciMAColor", label: "CCI MA Color", type: "color", default: "#FDD835" },
      { key: "cciMALineWidth", label: "CCI MA Line Width", type: "number", default: 1, min: 1, max: 4 },
      // Style: Upper Band (+100)
      { key: "showUpperBand", label: "Show Upper Band", type: "boolean", default: true },
      { key: "upperBandValue", label: "Upper Band Value", type: "number", default: 100, min: 0, max: 500 },
      { key: "upperBandColor", label: "Upper Band Color", type: "color", default: "#787B86" },
      // Style: Middle Band (0)
      { key: "showMiddleBand", label: "Show Middle Band", type: "boolean", default: true },
      { key: "middleBandValue", label: "Middle Band Value", type: "number", default: 0, min: -200, max: 200 },
      { key: "middleBandColor", label: "Middle Band Color", type: "color", default: "#787B86" },
      // Style: Lower Band (-100)
      { key: "showLowerBand", label: "Show Lower Band", type: "boolean", default: true },
      { key: "lowerBandValue", label: "Lower Band Value", type: "number", default: -100, min: -500, max: 0 },
      { key: "lowerBandColor", label: "Lower Band Color", type: "color", default: "#787B86" },
      // Style: Background fill
      { key: "showBackgroundFill", label: "Show Background Fill", type: "boolean", default: true },
      { key: "backgroundFillColor", label: "Background Fill Color", type: "color", default: "#2962FF" },
      { key: "backgroundFillOpacity", label: "Background Fill Opacity", type: "number", default: 0.1, min: 0, max: 1, step: 0.05 },
    ],
    outputs: [
      { key: "cci", label: "CCI", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "cciMa", label: "CCI-based MA", style: "line", defaultColor: "#FDD835", defaultLineWidth: 1 },
      { key: "upperBand", label: "Upper Band", style: "line", defaultColor: "#787B86", defaultLineWidth: 1 },
      { key: "middleBand", label: "Middle Band", style: "line", defaultColor: "#787B86", defaultLineWidth: 1 },
      { key: "lowerBand", label: "Lower Band", style: "line", defaultColor: "#787B86", defaultLineWidth: 1 },
    ],
  },
  {
    id: "roc",
    name: "Rate of Change",
    shortName: "ROC",
    category: "momentum",
    tags: ["oscillator", "momentum", "percentage"],
    description: "Percentage change between current and N periods ago",
    panePolicy: "separate",
    inputs: [
      // Inputs tab - TV parity
      { key: "length", label: "Length", type: "number", default: 9, min: 1, max: 100 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "close", label: "Close" },
        { value: "hl2", label: "(H+L)/2" },
        { value: "hlc3", label: "(H+L+C)/3" },
        { value: "ohlc4", label: "(O+H+L+C)/4" },
      ]},
      // Timeframe placeholder (TV-parity UI, no-op for now)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // Style tab - ROC line
      { key: "rocColor", label: "ROC Color", type: "color", default: "#2962FF" },
      { key: "rocLineWidth", label: "ROC Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "rocLineStyle", label: "ROC Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // Zero line settings
      { key: "showZeroLine", label: "Show Zero Line", type: "boolean", default: true },
      { key: "zeroLineColor", label: "Zero Line Color", type: "color", default: "#787B86" },
      { key: "zeroLineStyle", label: "Zero Line Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
    ],
    outputs: [
      { key: "roc", label: "ROC", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
    ],
  },
  {
    id: "mom",
    name: "Momentum",
    shortName: "MOM",
    category: "momentum",
    tags: ["oscillator", "momentum", "difference"],
    description: "Price difference between current and N periods ago",
    panePolicy: "separate",
    inputs: [
      { key: "period", label: "Period", type: "number", default: 10, min: 1, max: 100 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
      ]},
    ],
    outputs: [
      { key: "mom", label: "Momentum", style: "line", defaultColor: TV_COLORS.purple, defaultLineWidth: 2 },
    ],
  },
  {
    id: "willr",
    name: "Williams %R",
    shortName: "Will%R",
    category: "momentum",
    tags: ["oscillator", "overbought", "oversold", "williams"],
    description: "Inverted stochastic measuring overbought/oversold (0 to -100)",
    panePolicy: "separate",
    inputs: [
      // === Inputs ===
      { key: "length", label: "Length", type: "number", default: 14, min: 1, max: 100 },
      { key: "source", label: "Source", type: "dropdown", default: "hlcc4", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
        { value: "hlcc4", label: "HLCC4" },
      ]},
      // === Style section - Band levels ===
      { key: "upperBand", label: "Upper Band", type: "number", default: -20, min: -100, max: 0 },
      { key: "lowerBand", label: "Lower Band", type: "number", default: -80, min: -100, max: 0 },
      // === Style section - Fill toggles ===
      { key: "showBackgroundFill", label: "Background Fill", type: "boolean", default: true },
      { key: "showOverboughtFill", label: "Overbought Fill", type: "boolean", default: true },
      { key: "showOversoldFill", label: "Oversold Fill", type: "boolean", default: true },
      // === Style section - Colors ===
      { key: "lineColor", label: "Line Color", type: "color", default: TV_COLORS.purpleTv },
      { key: "upperBandColor", label: "Upper Band Color", type: "color", default: TV_COLORS.gray },
      { key: "lowerBandColor", label: "Lower Band Color", type: "color", default: TV_COLORS.gray },
      { key: "backgroundFillColor", label: "Background Color", type: "color", default: TV_COLORS.purpleTv },
      { key: "backgroundFillOpacity", label: "Background Opacity", type: "number", default: 0.06, min: 0, max: 1, step: 0.01 },
      { key: "overboughtFillColor", label: "Overbought Color", type: "color", default: "#26A69A" },
      { key: "oversoldFillColor", label: "Oversold Color", type: "color", default: "#EF5350" },
    ],
    outputs: [
      { key: "willr", label: "%R", style: "line", defaultColor: TV_COLORS.purpleTv, defaultLineWidth: 2 },
      { key: "upperBandLine", label: "Upper Band", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
      { key: "lowerBandLine", label: "Lower Band", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
    ],
  },
  {
    id: "fisher",
    name: "Fisher Transform",
    shortName: "Fisher",
    category: "momentum",
    tags: ["oscillator", "fisher", "transform", "reversal"],
    description: "Identifies extreme prices using Gaussian normal distribution transformation",
    panePolicy: "separate",
    inputs: [
      // === Inputs section ===
      { key: "length", label: "Length", type: "number", default: 9, min: 1, max: 200 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: Fisher line ===
      { key: "showFisher", label: "Fisher", type: "boolean", default: true },
      { key: "fisherColor", label: "Fisher Color", type: "color", default: TV_COLORS.blue },
      { key: "fisherLineWidth", label: "Fisher Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "fisherLineStyle", label: "Fisher Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Trigger line ===
      { key: "showTrigger", label: "Trigger", type: "boolean", default: true },
      { key: "triggerColor", label: "Trigger Color", type: "color", default: TV_COLORS.orange },
      { key: "triggerLineWidth", label: "Trigger Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "triggerLineStyle", label: "Trigger Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Level lines (1.5, 0.75, 0, -0.75, -1.5) ===
      { key: "showLevel1_5", label: "Level 1.5", type: "boolean", default: true },
      { key: "level1_5Value", label: "Level 1.5 Value", type: "number", default: 1.5, min: -10, max: 10, step: 0.1 },
      { key: "level1_5Color", label: "Level 1.5 Color", type: "color", default: TV_COLORS.pink },
      { key: "level1_5LineStyle", label: "Level 1.5 Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      { key: "showLevel0_75", label: "Level 0.75", type: "boolean", default: true },
      { key: "level0_75Value", label: "Level 0.75 Value", type: "number", default: 0.75, min: -10, max: 10, step: 0.1 },
      { key: "level0_75Color", label: "Level 0.75 Color", type: "color", default: TV_COLORS.gray },
      { key: "level0_75LineStyle", label: "Level 0.75 Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      { key: "showLevel0", label: "Level 0", type: "boolean", default: true },
      { key: "level0Value", label: "Level 0 Value", type: "number", default: 0, min: -10, max: 10, step: 0.1 },
      { key: "level0Color", label: "Level 0 Color", type: "color", default: TV_COLORS.gray },
      { key: "level0LineStyle", label: "Level 0 Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      { key: "showLevelNeg0_75", label: "Level -0.75", type: "boolean", default: true },
      { key: "levelNeg0_75Value", label: "Level -0.75 Value", type: "number", default: -0.75, min: -10, max: 10, step: 0.1 },
      { key: "levelNeg0_75Color", label: "Level -0.75 Color", type: "color", default: TV_COLORS.gray },
      { key: "levelNeg0_75LineStyle", label: "Level -0.75 Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      { key: "showLevelNeg1_5", label: "Level -1.5", type: "boolean", default: true },
      { key: "levelNeg1_5Value", label: "Level -1.5 Value", type: "number", default: -1.5, min: -10, max: 10, step: 0.1 },
      { key: "levelNeg1_5Color", label: "Level -1.5 Color", type: "color", default: TV_COLORS.pink },
      { key: "levelNeg1_5LineStyle", label: "Level -1.5 Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Visibility toggles ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
      { key: "inputsInStatusLine", label: "Inputs in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "fisher", label: "Fisher", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "trigger", label: "Trigger", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 1 },
      { key: "level1_5", label: "1.5", style: "line", defaultColor: TV_COLORS.pink, defaultLineWidth: 1 },
      { key: "level0_75", label: "0.75", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
      { key: "level0", label: "0", style: "line", defaultColor: TV_COLORS.pink, defaultLineWidth: 1 },
      { key: "levelNeg0_75", label: "-0.75", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
      { key: "levelNeg1_5", label: "-1.5", style: "line", defaultColor: TV_COLORS.pink, defaultLineWidth: 1 },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Chaikin Money Flow (CMF) - TradingView Parity
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "cmf",
    name: "Chaikin Money Flow",
    shortName: "CMF",
    category: "volume",
    tags: ["oscillator", "volume", "money flow", "accumulation", "distribution"],
    description: "Measures the amount of money flow volume over a specific period, indicating buying or selling pressure",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "length", label: "Length", type: "number", default: 20, min: 1, max: 200 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: CMF line ===
      { key: "showCmf", label: "CMF", type: "boolean", default: true },
      { key: "cmfColor", label: "CMF Color", type: "color", default: TV_COLORS.green },
      { key: "cmfLineWidth", label: "CMF Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "cmfLineStyle", label: "CMF Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Zero line ===
      { key: "showZero", label: "Zero", type: "boolean", default: true },
      { key: "zeroValue", label: "Zero Value", type: "number", default: 0, min: -1, max: 1, step: 0.01 },
      { key: "zeroColor", label: "Zero Color", type: "color", default: TV_COLORS.gray },
      { key: "zeroLineStyle", label: "Zero Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
    ],
    outputs: [
      { key: "cmf", label: "CMF", style: "line", defaultColor: TV_COLORS.green, defaultLineWidth: 1 },
      { key: "zeroLine", label: "Zero", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Price Volume Trend (PVT) - TradingView Parity
  //
  // Cumulative indicator relating price change and volume.
  // Similar to OBV but uses percentage price change instead of binary direction.
  //
  // Formula: PVT[i] = PVT[i-1] + Volume[i] * (Close[i] - Close[i-1]) / Close[i-1]
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "pvt",
    name: "Price Volume Trend",
    shortName: "PVT",
    category: "volume",
    tags: ["volume", "trend", "cumulative", "accumulation", "distribution"],
    description: "Cumulative indicator relating price change and volume",
    panePolicy: "separate",
    needsExtendedHistory: true, // PVT is cumulative, needs full history for TV-parity
    inputs: [
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: PVT line ===
      { key: "showPvt", label: "PVT", type: "boolean", default: true },
      { key: "pvtColor", label: "PVT Color", type: "color", default: TV_COLORS.blue },
      { key: "pvtLineWidth", label: "PVT Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "pvtLineStyle", label: "PVT Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
    ],
    outputs: [
      { key: "pvt", label: "PVT", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Positive Volume Index (PVI) - TradingView Parity
  //
  // Cumulative series that only updates when volume increases compared to 
  // the previous bar. Start value = 1000.
  //
  // Formula:
  //   pvi[0] = 1000
  //   If volume[i] > volume[i-1]: pvi[i] = pvi[i-1] * (1 + (close[i] - close[i-1]) / close[i-1])
  //   Otherwise: pvi[i] = pvi[i-1]
  //   pviEma = EMA(pvi, emaLength)
  //
  // Source: https://www.tradingview.com/support/solutions/43000773006-positive-volume-index-pvi/
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "pvi",
    name: "Positive Volume Index",
    shortName: "PVI",
    category: "volume",
    tags: ["volume", "trend", "cumulative", "smart money"],
    description: "Tracks price change on days when volume increases (uninformed traders active)",
    panePolicy: "separate",
    needsExtendedHistory: true, // PVI is cumulative, needs full history for TV-parity
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "emaLength", label: "EMA Length", type: "number", default: 255, min: 1, max: 500 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: PVI line ===
      { key: "showPvi", label: "PVI", type: "boolean", default: true },
      { key: "pviColor", label: "PVI Color", type: "color", default: TV_COLORS.blue },
      { key: "pviLineWidth", label: "PVI Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "pviLineStyle", label: "PVI Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: EMA line ===
      { key: "showEma", label: "EMA", type: "boolean", default: true },
      { key: "emaColor", label: "EMA Color", type: "color", default: TV_COLORS.orange },
      { key: "emaLineWidth", label: "EMA Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "emaLineStyle", label: "EMA Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
    ],
    outputs: [
      { key: "pvi", label: "PVI", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "pviEma", label: "PVI EMA", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 1 },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Negative Volume Index (NVI) - TradingView Parity
  //
  // Cumulative series that only updates when volume decreases compared to 
  // the previous bar. Start value = 1000. (Sibling of PVI)
  //
  // Formula:
  //   nvi[0] = 1000
  //   If volume[i] < volume[i-1]: nvi[i] = nvi[i-1] * (1 + (close[i] - close[i-1]) / close[i-1])
  //   Otherwise: nvi[i] = nvi[i-1]
  //   nviEma = EMA(nvi, emaLength)
  //
  // Source: https://www.tradingview.com/support/solutions/43000773005-negative-volume-index-nvi/
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "nvi",
    name: "Negative Volume Index",
    shortName: "NVI",
    category: "volume",
    tags: ["volume", "trend", "cumulative", "smart money"],
    description: "Tracks price change on days when volume decreases (smart money active)",
    panePolicy: "separate",
    needsExtendedHistory: true, // NVI is cumulative, needs full history for TV-parity
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "emaLength", label: "EMA Length", type: "number", default: 255, min: 1, max: 500 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: NVI line ===
      { key: "showNvi", label: "NVI", type: "boolean", default: true },
      { key: "nviColor", label: "NVI Color", type: "color", default: TV_COLORS.blue },
      { key: "nviLineWidth", label: "NVI Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "nviLineStyle", label: "NVI Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: EMA line ===
      { key: "showEma", label: "EMA", type: "boolean", default: true },
      { key: "emaColor", label: "EMA Color", type: "color", default: TV_COLORS.orange },
      { key: "emaLineWidth", label: "EMA Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "emaLineStyle", label: "EMA Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
    ],
    outputs: [
      { key: "nvi", label: "NVI", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "nviEma", label: "NVI EMA", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 1 },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Relative Volume at Time (RelVol) - TradingView Parity
  //
  // Compares current volume to historical average at the same time offset 
  // within the anchor period.
  //
  // Formula:
  //   For each bar, find historical bars at same offset in previous N periods.
  //   Cumulative mode: sum volume from anchor start to current offset.
  //   Regular mode: use single bar's volume.
  //   RelVol = currentValue / avg(historicalValues)
  //
  // Source: https://www.tradingview.com/support/solutions/43000705489-relative-volume-at-time/
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "relvol",
    name: "Relative Volume at Time",
    shortName: "RelVol",
    category: "volume",
    tags: ["volume", "relative", "time", "histogram", "intraday"],
    description: "Compares current volume to historical average at the same time of day",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "anchorTimeframe", label: "Anchor Timeframe", type: "select", default: "1D", options: [
        { value: "session", label: "Session" },
        { value: "1D", label: "1 Day" },
        { value: "1W", label: "1 Week" },
        { value: "1M", label: "1 Month" },
      ]},
      { key: "length", label: "Length", type: "number", default: 10, min: 1, max: 100 },
      { key: "calculationMode", label: "Calculation Mode", type: "select", default: "cumulative", options: [
        { value: "cumulative", label: "Cumulative" },
        { value: "regular", label: "Regular" },
      ]},
      // === Style section: Histogram ===
      { key: "showHistogram", label: "Histogram", type: "boolean", default: true },
      { key: "histogramAboveColor", label: "Above Level Color", type: "color", default: TV_COLORS.green },
      { key: "histogramBelowColor", label: "Below Level Color", type: "color", default: TV_COLORS.red },
      // === Style section: Level line ===
      { key: "showLevel", label: "Level", type: "boolean", default: true },
      { key: "levelValue", label: "Level Value", type: "number", default: 1, min: 0, max: 10, step: 0.1 },
      { key: "levelColor", label: "Level Color", type: "color", default: TV_COLORS.gray },
      { key: "levelLineStyle", label: "Level Line Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
    ],
    outputs: [
      { key: "relVol", label: "RelVol", style: "histogram", defaultColor: TV_COLORS.green, defaultLineWidth: 1 },
      { key: "level", label: "Level", style: "line", defaultColor: TV_COLORS.gray, defaultLineWidth: 1 },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Klinger Oscillator - TradingView Parity
  //
  // Measures long-term money flow trends while detecting short-term fluctuations.
  //
  // Formula:
  //   KO = EMA34(VF) - EMA55(VF)
  //   VF = V * [2 * ((dm/cm) - 1)] * Trend * 100
  //   Trend = +1 if (H+L+C) > (prevH+prevL+prevC), else -1
  //   dm = H - L
  //   cm = cm[-1] + dm if Trend == prevTrend, else prevDm + dm
  //   Signal = EMA13(KO)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "klinger",
    name: "Klinger Oscillator",
    shortName: "KO",
    category: "volume",
    tags: ["oscillator", "volume", "money flow", "trend", "divergence"],
    description: "Measures long-term money flow trends with short-term fluctuation detection",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "fastLength", label: "Fast Length", type: "number", default: 34, min: 1, max: 200 },
      { key: "slowLength", label: "Slow Length", type: "number", default: 55, min: 1, max: 300 },
      { key: "signalLength", label: "Signal Length", type: "number", default: 13, min: 1, max: 100 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: Klinger line ===
      { key: "showKlinger", label: "Klinger Oscillator", type: "boolean", default: true },
      { key: "klingerColor", label: "KO Color", type: "color", default: TV_COLORS.blue },
      { key: "klingerLineWidth", label: "KO Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "klingerLineStyle", label: "KO Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Signal line ===
      { key: "showSignal", label: "Signal", type: "boolean", default: true },
      { key: "signalColor", label: "Signal Color", type: "color", default: TV_COLORS.orange },
      { key: "signalLineWidth", label: "Signal Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "signalLineStyle", label: "Signal Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
    ],
    outputs: [
      { key: "klinger", label: "KO", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "signal", label: "Signal", style: "line", defaultColor: TV_COLORS.green, defaultLineWidth: 1 },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Volume Delta - TradingView Parity
  // 
  // Calculates the difference between buying and selling volume using
  // lower-timeframe (intrabar) data. Each chart bar produces an OHLC candle:
  //   - Open = 0 (always starts at zero)
  //   - Close = final cumulative delta for the bar
  //   - High = max cumulative delta reached
  //   - Low = min cumulative delta reached
  //
  // Intrabar classification (TV exact):
  //   - close > open => +volume (buying)
  //   - close < open => -volume (selling)
  //   - close == open (doji): use prev intrabar close comparison
  //
  // ⚠️ PARITY LIMITATION: Requires intrabar data for TV-level accuracy.
  // Current implementation uses chart-bar fallback. Shape matches, values differ.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "volumeDelta",
    name: "Volume Delta",
    shortName: "Vol Δ",
    category: "volume",
    tags: ["volume", "delta", "buying", "selling", "intrabar", "pressure", "approximate"],
    description: "⚠️ Approximate - Buying vs selling volume (requires intrabar data for parity)",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "useCustomTimeframe", label: "Use custom timeframe", type: "boolean", default: false },
      { key: "intrabarTimeframe", label: "Timeframe", type: "select", default: "auto", options: [
        { value: "auto", label: "Auto" },
        { value: "1S", label: "1 Second" },
        { value: "1", label: "1 Minute" },
        { value: "5", label: "5 Minutes" },
        { value: "15", label: "15 Minutes" },
        { value: "30", label: "30 Minutes" },
        { value: "60", label: "1 Hour" },
        { value: "240", label: "4 Hours" },
      ]},
      // === Style section: Body colors ===
      { key: "bodyUpColor", label: "Body Up", type: "color", default: "#26A69A" },
      { key: "bodyDownColor", label: "Body Down", type: "color", default: "#EF5350" },
      // === Style section: Wick colors ===
      { key: "wickUpColor", label: "Wick Up", type: "color", default: "#26A69A" },
      { key: "wickDownColor", label: "Wick Down", type: "color", default: "#EF5350" },
      // === Style section: Border colors ===
      { key: "borderUpColor", label: "Border Up", type: "color", default: "#26A69A" },
      { key: "borderDownColor", label: "Border Down", type: "color", default: "#EF5350" },
      // === Style section: Zero line ===
      { key: "showZeroLine", label: "Show Zero Line", type: "boolean", default: true },
      { key: "zeroLineColor", label: "Zero Line Color", type: "color", default: "#787B86" },
      { key: "zeroLineStyle", label: "Zero Line Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
    ],
    outputs: [
      // Special "candle" style - rendered as OHLC candlestick in indicator pane
      { key: "volumeDelta", label: "Volume Delta", style: "candle", defaultColor: "#26A69A" },
    ],
    docs: {
      definition: "Volume Delta measures the difference between buying volume and selling volume using lower-timeframe (intrabar) data to classify each trade.",
      explanation: "Positive delta indicates more buying pressure, negative delta indicates more selling pressure. The indicator plots OHLC candles where Open=0, Close=cumulative delta, High/Low=running extremes.",
      calculations: "For each intrabar: if close > open, volume is buying (+); if close < open, volume is selling (-). Doji bars use previous close comparison. The final delta is the sum of all signed volumes.",
      takeaways: [
        "Green candles show net buying pressure",
        "Red candles show net selling pressure",
        "Large wicks indicate intra-bar reversals in pressure",
        "Divergence with price may signal trend weakness",
      ],
      whatToLookFor: [
        "Strong delta in direction of trend confirms momentum",
        "Divergence between price and delta may precede reversals",
        "Climax volume with delta reversal can signal exhaustion",
      ],
      limitations: [
        "Requires lower-timeframe data availability",
        "Higher timeframe charts have reduced intrabar coverage",
        "Does not distinguish between market and limit orders",
      ],
      goesGoodWith: ["obv", "vwap", "mfi"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Cumulative Volume Delta (CVD)
  // 
  // TradingView doc: https://www.tradingview.com/support/solutions/43000725058-cumulative-volume-delta/
  //
  // Like Volume Delta but accumulates across bars within an anchor period.
  // Resets at the start of each new anchor period.
  // Auto timeframe rules (TV exact): Seconds→1S, Minutes/Hours→1, Daily→5, Others→60
  //
  // ⚠️ PARITY LIMITATION: Requires intrabar data for TV-level accuracy.
  // Current implementation uses chart-bar fallback. Shape matches, values differ.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "cvd",
    name: "Cumulative Volume Delta",
    shortName: "CVD",
    category: "volume",
    tags: ["volume", "delta", "cumulative", "buying", "selling", "intrabar", "pressure", "approximate"],
    description: "⚠️ Approximate - Cumulative volume delta (requires intrabar data for parity)",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "anchorPeriod", label: "Anchor Period", type: "select", default: "Session", options: [
        { value: "Session", label: "Session" },
        { value: "Week", label: "Week" },
        { value: "Month", label: "Month" },
        { value: "Year", label: "Year" },
        { value: "Decade", label: "Decade" },
        { value: "Century", label: "Century" },
        { value: "Earnings", label: "Earnings" },
        { value: "Dividends", label: "Dividends" },
        { value: "Splits", label: "Splits" },
      ]},
      { key: "useCustomTimeframe", label: "Use custom timeframe", type: "boolean", default: false },
      { key: "customTimeframe", label: "Timeframe", type: "select", default: "auto", options: [
        { value: "auto", label: "Auto" },
        { value: "1S", label: "1 Second" },
        { value: "1", label: "1 Minute" },
        { value: "5", label: "5 Minutes" },
        { value: "15", label: "15 Minutes" },
        { value: "30", label: "30 Minutes" },
        { value: "60", label: "1 Hour" },
        { value: "240", label: "4 Hours" },
      ]},
      // === Style section: Body colors ===
      { key: "bodyUpColor", label: "Body Up", type: "color", default: "#26A69A" },
      { key: "bodyDownColor", label: "Body Down", type: "color", default: "#EF5350" },
      // === Style section: Wick colors ===
      { key: "wickUpColor", label: "Wick Up", type: "color", default: "#26A69A" },
      { key: "wickDownColor", label: "Wick Down", type: "color", default: "#EF5350" },
      // === Style section: Border colors ===
      { key: "borderUpColor", label: "Border Up", type: "color", default: "#26A69A" },
      { key: "borderDownColor", label: "Border Down", type: "color", default: "#EF5350" },
      // === Style section: Level 0 line ===
      { key: "showLevelZero", label: "Show Level 0", type: "boolean", default: true },
      { key: "levelZeroColor", label: "Level 0 Color", type: "color", default: "#787B86" },
      { key: "levelZeroStyle", label: "Level 0 Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
    ],
    outputs: [
      { key: "cvd", label: "CVD", style: "candle", defaultColor: "#26A69A" },
    ],
    docs: {
      definition: "Cumulative Volume Delta (CVD) tracks the running sum of Volume Delta over an anchor period, resetting at each new period.",
      explanation: "CVD accumulates the difference between buying and selling volume within a time period. At each anchor period boundary (e.g., new session, week, month), the accumulation resets to zero.",
      calculations: "For each bar: Classify intrabar volumes as buying (+) or selling (-). CVD opens at previous close (or 0 at period start), closes at open + bar delta, with high/low tracking running extremes.",
      takeaways: [
        "Rising CVD confirms buying pressure in the trend",
        "Falling CVD confirms selling pressure in the trend",
        "Divergence between CVD and price may signal reversals",
        "Anchor period resets help identify intra-period flows",
      ],
      whatToLookFor: [
        "CVD making new highs/lows with price confirms momentum",
        "CVD diverging from price suggests potential reversal",
        "Session CVD resets reveal daily institutional flow patterns",
      ],
      limitations: [
        "Requires intrabar data for accurate classification",
        "Anchor periods like Earnings/Dividends/Splits require event data",
        "Higher timeframe charts have reduced intrabar coverage",
      ],
      goesGoodWith: ["volumeDelta", "obv", "vwap", "mfi"],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Cumulative Volume Index (CVI)
  // 
  // TradingView doc: https://www.tradingview.com/support/solutions/43000589126-cumulative-volume-index-cvi/
  //
  // CVI = Previous CVI + (Advancing Volume – Declining Volume)
  // Requires exchange-level breadth data.
  // 
  // ⚠️ PARITY LIMITATION: True CVI requires real-time breadth data from exchanges
  // (advancing/declining volume for all stocks). Without this API, values will NOT
  // match TradingView. Shape/direction may be similar but absolute values differ.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "cvi",
    name: "Cumulative Volume Index",
    shortName: "CVI",
    category: "volume",
    tags: ["volume", "breadth", "market", "cumulative", "exchange", "approximate"],
    description: "⚠️ Approximate - Cumulative breadth volume (requires exchange data for parity)",
    panePolicy: "separate",
    needsExtendedHistory: true,
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "exchange", label: "Exchange", type: "select", default: "NYSE", options: [
        { value: "NYSE", label: "NYSE" },
        { value: "NASDAQ", label: "NASDAQ" },
        { value: "AMEX", label: "AMEX" },
        { value: "ARCX", label: "ARCX" },
        { value: "US Total", label: "US Total" },
        { value: "DJ", label: "DJ" },
      ]},
      // === Style section ===
      { key: "lineColor", label: "Color", type: "color", default: "#2962FF" },
      { key: "lineWidth", label: "Line Width", type: "number", default: 1, min: 1, max: 5 },
    ],
    outputs: [
      { key: "cvi", label: "CVI", style: "line", defaultColor: "#2962FF" },
    ],
    docs: {
      definition: "Cumulative Volume Index (CVI) measures the running sum of advancing volume minus declining volume for a specific exchange.",
      explanation: "CVI tracks whether more volume is flowing into advancing stocks or declining stocks on an exchange. A rising CVI indicates broad buying pressure; a falling CVI indicates broad selling pressure.",
      calculations: "CVI = Previous CVI + (Advancing Volume − Declining Volume). For each period, advancing volume includes volume of stocks that closed higher, declining volume includes volume of stocks that closed lower.",
      takeaways: [
        "Rising CVI confirms broad market buying pressure",
        "Falling CVI confirms broad market selling pressure",
        "CVI divergence with index price can signal reversals",
        "Works best as a confirmation tool for market direction",
      ],
      whatToLookFor: [
        "CVI making new highs with index confirms uptrend health",
        "CVI diverging from index suggests weakening momentum",
        "Persistent CVI direction shows institutional flow",
      ],
      limitations: [
        "Requires exchange-level breadth data (advancing/declining volume)",
        "Only available for supported exchanges",
        "May lag during intraday due to data update frequency",
      ],
      goesGoodWith: ["obv", "mfi", "cmf"],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Market Breadth: ADR_B (Bars), ADR, ADL
  // 
  // TradingView docs:
  // - ADR_B: https://www.tradingview.com/support/solutions/43000644914-advance-decline-ratio-bars/
  // - ADR: https://www.tradingview.com/support/solutions/43000589093-advance-decline-ratio/
  // - ADL: https://www.tradingview.com/support/solutions/43000589092-advance-decline-line/
  // ─────────────────────────────────────────────────────────────────────────

  // Advance/Decline Ratio (Bars) - ADR_B
  // Counts green vs red bars in rolling window, returns ratio
  {
    id: "adrb",
    name: "Advance/Decline Ratio (Bars)",
    shortName: "ADR_B",
    category: "volume",
    tags: ["breadth", "oscillator", "ratio", "bars", "market-breadth"],
    description: "Ratio of green (up) bars to red (down) bars over N periods",
    panePolicy: "separate",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "length", label: "Length", type: "number", default: 9, min: 1, max: 500 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: ADR_B line ===
      { key: "showLine", label: "ADR_B", type: "boolean", default: true },
      { key: "lineColor", label: "Color", type: "color", default: "#2962FF" },
      { key: "lineWidth", label: "Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "lineStyle", label: "Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Equality line ===
      { key: "showEquality", label: "Equality Line", type: "boolean", default: true },
      { key: "equalityColor", label: "Equality Color", type: "color", default: "#787B86" },
      { key: "equalityValue", label: "Equality Value", type: "number", default: 1 },
      { key: "equalityLineStyle", label: "Equality Line Style", type: "select", default: "dashed", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "adrb", label: "ADR_B", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "equality", label: "Equality Line", style: "line", defaultColor: "#787B86", defaultLineWidth: 1 },
    ],
    docs: {
      definition: "The Advance/Decline Ratio (Bars) counts the number of green (up) and red (down) bars over the past N periods and calculates their ratio.",
      explanation: "A green bar occurs when close > open (bullish candle). A red bar occurs when close < open (bearish candle). Doji bars (close = open) are excluded from the count.",
      calculations: "ADR_B = Green Bars Count / Red Bars Count over the specified length. When Red Bars = 0, the line breaks (NaN).",
      takeaways: [
        "Values > 1 indicate more up bars than down bars (bullish momentum)",
        "Values < 1 indicate more down bars than up bars (bearish momentum)",
        "Value = 1 means equal up and down bars (equilibrium)",
      ],
      whatToLookFor: [
        "Ratio crossing above 1 suggests improving momentum",
        "Ratio crossing below 1 suggests declining momentum",
        "Extreme readings may indicate overbought/oversold conditions",
      ],
      limitations: [
        "Only considers bar direction (open vs close), not magnitude",
        "Does not account for bar size or volume",
        "May produce NaN when no red bars in the window",
      ],
      goesGoodWith: ["rsi", "macd", "adl", "adr"],
    },
  },

  // Advance/Decline Ratio (Breadth) - ADR
  // Ratio of advances to declines based on market breadth data
  {
    id: "adr",
    name: "Advance/Decline Ratio",
    shortName: "ADR",
    category: "volume",
    tags: ["breadth", "oscillator", "ratio", "market-breadth"],
    description: "Ratio of advancing to declining issues based on market breadth",
    panePolicy: "separate",
    inputs: [
      // No inputs section (pure breadth calculation)
      // === Style section ===
      { key: "showLine", label: "ADR", type: "boolean", default: true },
      { key: "lineColor", label: "Color", type: "color", default: "#2962FF" },
      { key: "lineWidth", label: "Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "lineStyle", label: "Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "adr", label: "ADR", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
    ],
    docs: {
      definition: "The Advance/Decline Ratio measures the number of stocks that advanced versus declined for a given period based on market breadth data.",
      explanation: "ADR provides a snapshot of market sentiment by comparing advancing issues (stocks that closed higher than prior close) to declining issues (stocks that closed lower).",
      calculations: "ADR = Advancing Issues / Declining Issues. When Declining Issues = 0, the line breaks (NaN).",
      takeaways: [
        "ADR > 1 means more stocks advanced than declined (bullish breadth)",
        "ADR < 1 means more stocks declined than advanced (bearish breadth)",
        "Extreme readings may signal exhaustion or strong trends",
      ],
      whatToLookFor: [
        "ADR rising while index rises confirms healthy rally",
        "ADR falling while index rises suggests narrow leadership",
        "Divergences between ADR and price can signal reversals",
      ],
      limitations: [
        "Requires market breadth data (advances/declines) from data provider",
        "May not be available for all markets or timeframes",
        "Single snapshot ratio can be volatile",
      ],
      goesGoodWith: ["adl", "adrb", "obv", "cvi"],
    },
  },

  // Advance/Decline Line (Breadth) - ADL
  // Cumulative sum of net advances
  {
    id: "adl",
    name: "Advance/Decline Line",
    shortName: "ADL",
    category: "volume",
    tags: ["breadth", "cumulative", "market-breadth", "trend"],
    description: "Cumulative sum of advancing minus declining issues",
    panePolicy: "separate",
    needsExtendedHistory: true,
    inputs: [
      // No inputs section (pure breadth calculation)
      // === Style section ===
      { key: "showLine", label: "ADL", type: "boolean", default: true },
      { key: "lineColor", label: "Color", type: "color", default: "#2962FF" },
      { key: "lineWidth", label: "Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "lineStyle", label: "Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "adl", label: "ADL", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
    ],
    docs: {
      definition: "The Advance/Decline Line (ADL) is a cumulative measure of market breadth, tracking the running sum of advancing issues minus declining issues.",
      explanation: "ADL helps gauge the underlying strength or weakness of the market by looking at how many stocks are participating in a move rather than just price levels.",
      calculations: "NetAdv = Advances − Declines. ADL[t] = ADL[t−1] + NetAdv[t]. The cumulative sum starts from a historical seed point.",
      takeaways: [
        "Rising ADL indicates broad market participation in the advance",
        "Falling ADL indicates broad market participation in the decline",
        "ADL divergence from index can signal potential reversals",
      ],
      whatToLookFor: [
        "ADL making new highs with index confirms uptrend health",
        "ADL making new lows with index confirms downtrend",
        "Index making new highs while ADL lags suggests narrow rally",
      ],
      limitations: [
        "Requires market breadth data (advances/declines) from data provider",
        "Cumulative nature means level depends on historical starting point",
        "May need extended history for accurate TradingView parity",
      ],
      goesGoodWith: ["adr", "adrb", "obv", "cvi"],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Pivot Points Standard
  // 
  // TradingView doc: https://www.tradingview.com/support/solutions/43000521824-pivot-points-standard/
  //
  // Calculates support and resistance levels based on previous period OHLC.
  // Supports: Traditional, Fibonacci, Woodie, Classic, DM, Camarilla.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "pivotPointsStandard",
    name: "Pivot Points Standard",
    shortName: "Pivots",
    category: "trend",
    tags: ["overlay", "support", "resistance", "pivot", "levels", "sr"],
    description: "Support and resistance levels based on previous period OHLC",
    panePolicy: "overlay",
    inputs: [
      // === Type selection ===
      { key: "pivotType", label: "Type", type: "select", default: "traditional", options: [
        { value: "traditional", label: "Traditional" },
        { value: "fibonacci", label: "Fibonacci" },
        { value: "woodie", label: "Woodie" },
        { value: "classic", label: "Classic" },
        { value: "dm", label: "DM" },
        { value: "camarilla", label: "Camarilla" },
      ]},
      // === Pivot Timeframe ===
      { key: "timeframe", label: "Pivots Timeframe", type: "select", default: "auto", options: [
        { value: "auto", label: "Auto" },
        { value: "1D", label: "Daily" },
        { value: "1W", label: "Weekly" },
        { value: "1M", label: "Monthly" },
        { value: "3M", label: "Quarterly" },
        { value: "12M", label: "Yearly" },
        { value: "24M", label: "Biyearly" },
        { value: "36M", label: "Triyearly" },
        { value: "60M", label: "Quinquennially" },
        { value: "120M", label: "Decennially" },
      ]},
      // === Number of pivots ===
      { key: "pivotsBack", label: "Number of Pivots Back", type: "number", default: 15, min: 1, max: 100 },
      // === Daily-based values ===
      { key: "useDailyBased", label: "Use Daily-based Values", type: "boolean", default: true },
      // === Labels ===
      { key: "showLabels", label: "Show Labels", type: "boolean", default: true },
      { key: "showPrices", label: "Show Prices", type: "boolean", default: true },
      { key: "labelsPosition", label: "Labels Position", type: "select", default: "left", options: [
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
      ]},
      // === Line Width ===
      { key: "lineWidth", label: "Line Width", type: "number", default: 1, min: 1, max: 4 },
      // === Level toggles ===
      { key: "showP", label: "P", type: "boolean", default: true },
      { key: "showS1", label: "S1", type: "boolean", default: true },
      { key: "showS2", label: "S2", type: "boolean", default: true },
      { key: "showS3", label: "S3", type: "boolean", default: true },
      { key: "showS4", label: "S4", type: "boolean", default: true },
      { key: "showS5", label: "S5", type: "boolean", default: true },
      { key: "showR1", label: "R1", type: "boolean", default: true },
      { key: "showR2", label: "R2", type: "boolean", default: true },
      { key: "showR3", label: "R3", type: "boolean", default: true },
      { key: "showR4", label: "R4", type: "boolean", default: true },
      { key: "showR5", label: "R5", type: "boolean", default: true },
      // === Level colors (TV default: orange #FF6D00) ===
      { key: "colorP", label: "P Color", type: "color", default: "#FF6D00" },
      { key: "colorS1", label: "S1 Color", type: "color", default: "#FF6D00" },
      { key: "colorS2", label: "S2 Color", type: "color", default: "#FF6D00" },
      { key: "colorS3", label: "S3 Color", type: "color", default: "#FF6D00" },
      { key: "colorS4", label: "S4 Color", type: "color", default: "#FF6D00" },
      { key: "colorS5", label: "S5 Color", type: "color", default: "#FF6D00" },
      { key: "colorR1", label: "R1 Color", type: "color", default: "#FF6D00" },
      { key: "colorR2", label: "R2 Color", type: "color", default: "#FF6D00" },
      { key: "colorR3", label: "R3 Color", type: "color", default: "#FF6D00" },
      { key: "colorR4", label: "R4 Color", type: "color", default: "#FF6D00" },
      { key: "colorR5", label: "R5 Color", type: "color", default: "#FF6D00" },
    ],
    outputs: [
      // Note: Pivot Points uses special overlay rendering, not standard line series
      { key: "pivot", label: "Pivot Points", style: "line", defaultColor: "#FF6D00", defaultLineWidth: 1 },
    ],
    docs: {
      definition: "Pivot Points Standard calculates support and resistance levels based on the previous period's high, low, and close prices.",
      explanation: "The pivot point (P) acts as a central reference, with support levels (S1-S5) below and resistance levels (R1-R5) above. These levels are used by traders to identify potential reversal points.",
      calculations: "Traditional: P=(H+L+C)/3, R1=2P-L, S1=2P-H, R2=P+(H-L), S2=P-(H-L), etc. Other types (Fibonacci, Woodie, Classic, DM, Camarilla) use different formulas.",
      takeaways: [
        "Pivot point (P) is the primary intraday reference level",
        "Price above P suggests bullish bias, below P suggests bearish",
        "S/R levels provide potential entry, exit, and stop-loss points",
        "Multiple timeframe pivots increase level significance",
      ],
      whatToLookFor: [
        "Price bouncing off pivot levels for entry signals",
        "Breakouts through levels for continuation trades",
        "Confluence with other indicators at pivot levels",
        "R1/S1 as first targets, R2/S2/R3/S3 for extended moves",
      ],
      limitations: [
        "Best for intraday to swing trading timeframes",
        "May be less effective in strongly trending markets",
        "Works best with liquid instruments",
        "Different pivot types suit different market conditions",
      ],
      commonSettings: "Traditional or Fibonacci for equities, Woodie for futures, Camarilla for mean reversion strategies. Daily pivots for intraday, Weekly/Monthly for swing trades.",
      bestConditions: "Range-bound or oscillating markets where price respects historical levels.",
      goesGoodWith: ["bb", "rsi", "vwap", "atr"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Pivot Points High Low (TradingView Parity)
  // Detects swing highs and lows based on left/right bar counts.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "pivotPointsHighLow",
    name: "Pivot Points High Low",
    shortName: "Pivots HL",
    category: "trend",
    tags: ["overlay", "pivot", "swing", "high", "low", "labels"],
    description: "Detect swing highs and lows based on bar count analysis",
    panePolicy: "overlay",
    inputs: [
      { key: "source", label: "Source", type: "select", default: "hl", options: [
        { value: "hl", label: "High/Low" },
        { value: "close", label: "Close" },
      ]},
      { key: "highLeftBars", label: "Pivot High Left Bars", type: "number", default: 10, min: 1, max: 100 },
      { key: "highRightBars", label: "Pivot High Right Bars", type: "number", default: 10, min: 1, max: 100 },
      { key: "lowLeftBars", label: "Pivot Low Left Bars", type: "number", default: 10, min: 1, max: 100 },
      { key: "lowRightBars", label: "Pivot Low Right Bars", type: "number", default: 10, min: 1, max: 100 },
      { key: "showPrices", label: "Show Prices", type: "boolean", default: true },
      { key: "highColor", label: "Pivot High Color", type: "color", default: "#26A69A" },
      { key: "lowColor", label: "Pivot Low Color", type: "color", default: "#EF5350" },
    ],
    outputs: [
      { key: "pivots", label: "Pivots", style: "line", defaultColor: "#787B86", defaultLineWidth: 1 },
    ],
    docs: {
      definition: "Pivot Points High Low identifies significant swing highs and lows in price action using configurable lookback periods.",
      explanation: "A pivot high is confirmed when the high of a bar is greater than the highs of N bars on both left and right sides. A pivot low is confirmed when the low of a bar is lower than the lows of N bars on both sides.",
      calculations: "PivotHigh: high[i] > all highs[i-N..i-1] AND high[i] > all highs[i+1..i+N]. PivotLow: low[i] < all lows[i-N..i-1] AND low[i] < all lows[i+1..i+N].",
      takeaways: [
        "Larger left/right bars values produce fewer but more significant pivots",
        "Smaller values produce more pivots but may include noise",
        "Pivot highs often become resistance, pivot lows become support",
        "The confirmation delay (right bars) prevents repainting",
      ],
      whatToLookFor: [
        "Price levels of prior pivot highs as resistance",
        "Price levels of prior pivot lows as support",
        "Series of higher pivot lows in uptrends",
        "Series of lower pivot highs in downtrends",
      ],
      limitations: [
        "Requires rightBars to pass before pivot is confirmed (lag)",
        "May miss significant levels if parameters are too large",
        "Not predictive - only identifies historical pivots",
      ],
      commonSettings: "10/10 for both high and low is the TradingView default. Increase for fewer, more significant pivots.",
      bestConditions: "Markets with clear swing structure, trending or range-bound.",
      goesGoodWith: ["zigzag", "autoFib", "rsi", "macd"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Zig Zag (TradingView Parity)
  // Swing detection using deviation and depth parameters.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "zigzag",
    name: "Zig Zag",
    shortName: "ZigZag",
    category: "trend",
    tags: ["overlay", "swing", "trend", "reversal", "zigzag"],
    description: "Connect swing highs and lows with a zigzag line based on price deviation",
    panePolicy: "overlay",
    inputs: [
      { key: "deviation", label: "Deviation (%)", type: "number", default: 5, min: 0.1, max: 100, step: 0.1 },
      { key: "depth", label: "Pivot Legs", type: "number", default: 10, min: 1, max: 100 },
      { key: "lineColor", label: "Line Color", type: "color", default: "#2962FF" },
      { key: "lineWidth", label: "Line Width", type: "number", default: 2, min: 1, max: 5 },
      { key: "extendToLastBar", label: "Extend to Last Bar", type: "boolean", default: true },
      { key: "showPrice", label: "Display Reversal Price", type: "boolean", default: true },
      { key: "showVolume", label: "Display Cumulative Volume", type: "boolean", default: true },
      { key: "priceChangeMode", label: "Price Change Display", type: "select", default: "absolute", options: [
        { value: "absolute", label: "Absolute" },
        { value: "percent", label: "Percent" },
      ]},
      { key: "upColor", label: "Up Move Color", type: "color", default: "#26A69A" },
      { key: "downColor", label: "Down Move Color", type: "color", default: "#EF5350" },
    ],
    outputs: [
      { key: "zigzag", label: "Zig Zag", style: "line", defaultColor: "#2962FF", defaultLineWidth: 2 },
    ],
    docs: {
      definition: "Zig Zag connects swing highs and lows, filtering out minor price movements below the deviation threshold.",
      explanation: "The indicator identifies significant price reversals by requiring a minimum percentage move in the opposite direction before confirming a new swing point.",
      calculations: "Starting from first extreme, track current trend direction. When price deviates by >= N% in opposite direction, confirm swing and reverse trend.",
      takeaways: [
        "Higher deviation values produce fewer, more significant swings",
        "Lower deviation values capture more price movements",
        "The last segment can repaint until confirmed",
        "Useful for identifying trend structure and Fibonacci levels",
      ],
      whatToLookFor: [
        "Series of higher highs and higher lows (uptrend)",
        "Series of lower highs and lower lows (downtrend)",
        "Breakout of prior swing levels",
        "Fibonacci retracements of zigzag swings",
      ],
      limitations: [
        "Last segment repaints (changes) as new bars form",
        "Historical swings are fixed but current swing updates in real-time",
        "Not predictive - purely reactive indicator",
      ],
      commonSettings: "5% deviation with 10 depth for daily charts. Lower deviation for intraday.",
      bestConditions: "Trending markets with clear swing structure.",
      goesGoodWith: ["autoFib", "pivotPointsHighLow", "vwap"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Auto Fib Retracement (TradingView Parity)
  // Automatically draws Fibonacci retracement from detected swings.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "autoFib",
    name: "Auto Fib Retracement",
    shortName: "Auto Fib",
    category: "trend",
    tags: ["overlay", "fibonacci", "retracement", "levels", "swing"],
    description: "Automatically draw Fibonacci retracement levels based on detected swings",
    panePolicy: "overlay",
    inputs: [
      { key: "deviation", label: "Deviation (%)", type: "number", default: 3, min: 0.1, max: 100, step: 0.1 },
      { key: "depth", label: "Depth", type: "number", default: 10, min: 1, max: 100 },
      { key: "reverse", label: "Reverse", type: "boolean", default: false },
      { key: "extendLeft", label: "Extend Left", type: "boolean", default: false },
      { key: "extendRight", label: "Extend Right", type: "boolean", default: true },
      { key: "showPrices", label: "Show Prices", type: "boolean", default: true },
      { key: "showLevels", label: "Show Levels", type: "select", default: "values", options: [
        { value: "values", label: "Values" },
        { value: "percent", label: "Percent" },
      ]},
      { key: "labelsPosition", label: "Labels Position", type: "select", default: "left", options: [
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
      ]},
      { key: "backgroundTransparency", label: "Background Transparency", type: "number", default: 85, min: 0, max: 100 },
      { key: "lineWidth", label: "Line Width", type: "number", default: 1, min: 1, max: 4 },
      // Level toggles
      { key: "show0", label: "0", type: "boolean", default: true },
      { key: "show0236", label: "0.236", type: "boolean", default: true },
      { key: "show0382", label: "0.382", type: "boolean", default: true },
      { key: "show05", label: "0.5", type: "boolean", default: true },
      { key: "show0618", label: "0.618", type: "boolean", default: true },
      { key: "show0786", label: "0.786", type: "boolean", default: true },
      { key: "show1", label: "1", type: "boolean", default: true },
      { key: "show1618", label: "1.618", type: "boolean", default: true },
      { key: "show2618", label: "2.618", type: "boolean", default: true },
      { key: "show3618", label: "3.618", type: "boolean", default: true },
      { key: "show4236", label: "4.236", type: "boolean", default: true },
      // Level colors
      { key: "color0", label: "0 Color", type: "color", default: "#787B86" },
      { key: "color0236", label: "0.236 Color", type: "color", default: "#F23645" },
      { key: "color0382", label: "0.382 Color", type: "color", default: "#FF9800" },
      { key: "color05", label: "0.5 Color", type: "color", default: "#4CAF50" },
      { key: "color0618", label: "0.618 Color", type: "color", default: "#2196F3" },
      { key: "color0786", label: "0.786 Color", type: "color", default: "#9C27B0" },
      { key: "color1", label: "1 Color", type: "color", default: "#787B86" },
      { key: "color1618", label: "1.618 Color", type: "color", default: "#00BCD4" },
      { key: "color2618", label: "2.618 Color", type: "color", default: "#FFEB3B" },
      { key: "color3618", label: "3.618 Color", type: "color", default: "#FF5722" },
      { key: "color4236", label: "4.236 Color", type: "color", default: "#795548" },
    ],
    outputs: [
      { key: "fib", label: "Fibonacci Levels", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
    ],
    docs: {
      definition: "Auto Fib Retracement automatically draws Fibonacci retracement levels between the most recent detected swing high and low.",
      explanation: "Uses the same swing detection algorithm as Zig Zag to find significant price swings, then plots standard Fibonacci retracement levels between the anchor points.",
      calculations: "Levels are calculated as: Price = EndPrice - (EndPrice - StartPrice) * Ratio. Standard ratios: 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236.",
      takeaways: [
        "0.618 and 0.382 are the most commonly watched retracement levels",
        "0.5 is not a true Fibonacci number but widely used",
        "Extension levels (1.618+) indicate potential targets beyond the swing",
        "Price often consolidates around Fibonacci levels",
      ],
      whatToLookFor: [
        "Pullbacks to 0.382 or 0.618 levels in strong trends",
        "Confluence of Fib levels with other support/resistance",
        "Price reaction (rejection or breakthrough) at Fib levels",
        "Extensions as profit targets for trend continuation",
      ],
      limitations: [
        "Anchor points update as new swings are detected",
        "Which swings to use is subjective - algorithm may differ from manual drawing",
        "Works best when price respects Fibonacci ratios (not always)",
      ],
      commonSettings: "3% deviation with 10 depth. Show 0.382, 0.5, 0.618, 1.0 as minimum.",
      bestConditions: "Trending markets with clear impulse waves and retracements.",
      goesGoodWith: ["zigzag", "pivotPointsHighLow", "vwap", "bb"],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Envelope (ENV) - TradingView Parity
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "env",
    name: "Envelope",
    shortName: "ENV",
    category: "volatility",
    tags: ["overlay", "bands", "envelope", "channel"],
    description: "Moving average with percentage-based upper and lower bands",
    panePolicy: "overlay",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "length", label: "Length", type: "number", default: 20, min: 1, max: 500 },
      { key: "percent", label: "Percent", type: "number", default: 10, min: 0.01, max: 100, step: 0.1 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "close", label: "Close" },
        { value: "hl2", label: "(H+L)/2" },
        { value: "hlc3", label: "(H+L+C)/3" },
        { value: "ohlc4", label: "(O+H+L+C)/4" },
        { value: "hlcc4", label: "(H+L+C+C)/4" },
      ]},
      { key: "exponential", label: "Exponential", type: "boolean", default: false },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: Basis line ===
      { key: "showBasis", label: "Basis", type: "boolean", default: true },
      { key: "basisColor", label: "Basis Color", type: "color", default: "#FF6D00" },
      { key: "basisLineWidth", label: "Basis Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "basisLineStyle", label: "Basis Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Upper line ===
      { key: "showUpper", label: "Upper", type: "boolean", default: true },
      { key: "upperColor", label: "Upper Color", type: "color", default: "#2962FF" },
      { key: "upperLineWidth", label: "Upper Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "upperLineStyle", label: "Upper Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Lower line ===
      { key: "showLower", label: "Lower", type: "boolean", default: true },
      { key: "lowerColor", label: "Lower Color", type: "color", default: "#2962FF" },
      { key: "lowerLineWidth", label: "Lower Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "lowerLineStyle", label: "Lower Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Background fill ===
      { key: "showBackground", label: "Background", type: "boolean", default: true },
      { key: "backgroundColor", label: "Background Color", type: "color", default: "rgba(33, 150, 243, 0.1)" },
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
      { key: "inputsInStatusLine", label: "Inputs in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "basis", label: "Basis", style: "line", defaultColor: "#FF6D00", defaultLineWidth: 1 },
      { key: "upper", label: "Upper", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1, bandPair: "lower" },
      { key: "lower", label: "Lower", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1, bandPair: "upper" },
    ],
    docs: {
      definition: "Envelope is a technical analysis indicator consisting of two moving averages that form an upper and lower band around a basis line.",
      explanation: "The upper and lower bands are calculated by adding and subtracting a percentage from the basis moving average. This creates a channel that contains price action.",
      calculations: "Basis = MA(source, length) where MA is SMA (default) or EMA if exponential is enabled. Upper = Basis + (Basis × percent/100). Lower = Basis − (Basis × percent/100).",
      takeaways: [
        "Price touching the upper band may indicate overbought conditions",
        "Price touching the lower band may indicate oversold conditions",
        "The envelope width is a fixed percentage, unlike Bollinger Bands which use volatility",
        "Works best in ranging or mean-reverting markets",
      ],
      whatToLookFor: [
        "Price bouncing off the upper or lower bands",
        "Breakouts beyond the envelope bands as potential trend signals",
        "Price oscillating within the envelope in ranging markets",
        "Confluence with other support/resistance levels",
      ],
      limitations: [
        "Fixed percentage bands don't adapt to volatility",
        "May generate false signals in trending markets",
        "Optimal percent setting varies by instrument and timeframe",
      ],
      commonSettings: "20-period SMA with 10% bands for daily charts. Shorter periods and narrower bands for intraday.",
      bestConditions: "Mean-reverting markets or consolidation phases where price tends to oscillate.",
      goesGoodWith: ["rsi", "stoch", "bb", "atr"],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Median Indicator - TradingView Parity
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "median",
    name: "Median",
    shortName: "Median",
    category: "trend",
    tags: ["overlay", "median", "atr", "cloud", "bands"],
    description: "Rolling median with EMA and ATR-based bands",
    panePolicy: "overlay",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "medianSource", label: "Median Source", type: "select", default: "hl2", options: [
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "close", label: "Close" },
        { value: "hl2", label: "(H+L)/2" },
        { value: "hlc3", label: "(H+L+C)/3" },
        { value: "ohlc4", label: "(O+H+L+C)/4" },
        { value: "hlcc4", label: "(H+L+C+C)/4" },
      ]},
      { key: "medianLength", label: "Median Length", type: "number", default: 3, min: 1, max: 500 },
      { key: "atrLength", label: "ATR Length", type: "number", default: 14, min: 1, max: 500 },
      { key: "atrMultiplier", label: "ATR Multiplier", type: "number", default: 2, min: 0.1, max: 50, step: 0.1 },
      // Timeframe placeholders (no-op, TV-parity UI)
      { key: "timeframe", label: "Timeframe", type: "select", default: "chart", options: [
        { value: "chart", label: "Chart" },
      ]},
      { key: "waitForClose", label: "Wait for timeframe closes", type: "boolean", default: true },
      // === Style section: Median line ===
      { key: "showMedian", label: "Median", type: "boolean", default: true },
      { key: "medianColor", label: "Median Color", type: "color", default: "#F23645" },
      { key: "medianLineWidth", label: "Median Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "medianLineStyle", label: "Median Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Median EMA line ===
      { key: "showMedianEma", label: "Median EMA", type: "boolean", default: true },
      { key: "medianEmaColor", label: "Median EMA Color", type: "color", default: "#2962FF" },
      { key: "medianEmaLineWidth", label: "Median EMA Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "medianEmaLineStyle", label: "Median EMA Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Upper band ===
      { key: "showUpper", label: "Upper", type: "boolean", default: true },
      { key: "upperColor", label: "Upper Color", type: "color", default: "#089981" },
      { key: "upperLineWidth", label: "Upper Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "upperLineStyle", label: "Upper Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Lower band ===
      { key: "showLower", label: "Lower", type: "boolean", default: true },
      { key: "lowerColor", label: "Lower Color", type: "color", default: "#9C27B0" },
      { key: "lowerLineWidth", label: "Lower Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "lowerLineStyle", label: "Lower Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Cloud fill (between Median and Median EMA) ===
      { key: "showCloud", label: "Cloud", type: "boolean", default: true },
      { key: "cloudUpColor", label: "Cloud Up Color", type: "color", default: "rgba(8, 153, 129, 0.3)" },
      { key: "cloudDownColor", label: "Cloud Down Color", type: "color", default: "rgba(156, 39, 176, 0.3)" },
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
      { key: "inputsInStatusLine", label: "Inputs in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "median", label: "Median", style: "line", defaultColor: "#F23645", defaultLineWidth: 1 },
      { key: "medianEma", label: "Median EMA", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "upper", label: "Upper", style: "line", defaultColor: "#089981", defaultLineWidth: 1 },
      { key: "lower", label: "Lower", style: "line", defaultColor: "#9C27B0", defaultLineWidth: 1 },
    ],
    docs: {
      definition: "Median is a technical indicator that plots a rolling statistical median with its EMA, plus ATR-based volatility bands.",
      explanation: "The indicator calculates the median of the source over a specified period, then smooths it with an EMA. A cloud fill between the median and its EMA shows trend direction. ATR-based bands provide dynamic support/resistance.",
      calculations: "Median = rolling median(source, length). Median EMA = EMA(Median, length). Upper = Median + ATR × multiplier. Lower = Median − ATR × multiplier.",
      takeaways: [
        "Green cloud indicates uptrend (Median > EMA)",
        "Violet cloud indicates downtrend (Median < EMA)",
        "ATR bands provide dynamic support/resistance levels",
        "Median is less sensitive to outliers than mean",
      ],
      whatToLookFor: [
        "Cloud color change for trend reversal signals",
        "Price bouncing off ATR bands",
        "Median crossing above/below EMA",
        "Band expansion/contraction for volatility changes",
      ],
      limitations: [
        "Short median length can be choppy",
        "ATR bands may lag in fast-moving markets",
        "Cloud color changes may whipsaw in ranges",
      ],
      commonSettings: "Median Length 3, ATR Length 14, ATR Multiplier 2 for daily charts.",
      bestConditions: "Trending markets where median smoothing reduces noise.",
      goesGoodWith: ["atr", "bb", "supertrend", "macd"],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Linear Regression Channel - TradingView Parity
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "linreg",
    name: "Linear Regression Channel",
    shortName: "LinReg",
    category: "trend",
    tags: ["overlay", "regression", "channel", "statistics", "pearson"],
    description: "Linear regression channel with deviation bands and Pearson's R",
    panePolicy: "overlay",
    inputs: [
      // === Inputs section (TV-style) ===
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "close", label: "Close" },
        { value: "hl2", label: "(H+L)/2" },
        { value: "hlc3", label: "(H+L+C)/3" },
        { value: "ohlc4", label: "(O+H+L+C)/4" },
        { value: "hlcc4", label: "(H+L+C+C)/4" },
      ]},
      { key: "count", label: "Count", type: "number", default: 100, min: 2, max: 5000 },
      { key: "upperDeviation", label: "Upper Deviation", type: "number", default: 2, min: 0, max: 50, step: 0.1 },
      { key: "lowerDeviation", label: "Lower Deviation", type: "number", default: 2, min: 0, max: 50, step: 0.1 },
      // === Style section: Regression Line ===
      { key: "showLinreg", label: "Regression Line", type: "boolean", default: true },
      { key: "linregColor", label: "Regression Line Color", type: "color", default: "#2962FF" },
      { key: "linregLineWidth", label: "Regression Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "linregLineStyle", label: "Regression Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Upper Band ===
      { key: "showUpper", label: "Upper Deviation", type: "boolean", default: true },
      { key: "upperColor", label: "Upper Color", type: "color", default: "#F23645" },
      { key: "upperLineWidth", label: "Upper Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "upperLineStyle", label: "Upper Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Lower Band ===
      { key: "showLower", label: "Lower Deviation", type: "boolean", default: true },
      { key: "lowerColor", label: "Lower Color", type: "color", default: "#089981" },
      { key: "lowerLineWidth", label: "Lower Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "lowerLineStyle", label: "Lower Line Style", type: "select", default: "solid", options: [
        { value: "solid", label: "Solid" },
        { value: "dashed", label: "Dashed" },
        { value: "dotted", label: "Dotted" },
      ]},
      // === Style section: Channel Fill ===
      { key: "showFill", label: "Channel Background", type: "boolean", default: true },
      { key: "fillColor", label: "Fill Color", type: "color", default: "rgba(41, 98, 255, 0.1)" },
      // === Style section: Pearson's R ===
      { key: "showPearsonsR", label: "Pearson's R", type: "boolean", default: true },
      { key: "pearsonsRColor", label: "Pearson's R Color", type: "color", default: "#FF6D00" },
      { key: "pearsonsRLineWidth", label: "Pearson's R Line Width", type: "number", default: 1, min: 1, max: 4 },
      // === Visibility toggles (TV-style) ===
      { key: "labelsOnPriceScale", label: "Labels on price scale", type: "boolean", default: true },
      { key: "valuesInStatusLine", label: "Values in status line", type: "boolean", default: true },
      { key: "inputsInStatusLine", label: "Inputs in status line", type: "boolean", default: true },
    ],
    outputs: [
      { key: "linreg", label: "Regression Line", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "upper", label: "Upper Deviation", style: "line", defaultColor: "#F23645", defaultLineWidth: 1 },
      { key: "lower", label: "Lower Deviation", style: "line", defaultColor: "#089981", defaultLineWidth: 1 },
      { key: "pearsonsR", label: "Pearson's R", style: "line", defaultColor: "#FF6D00", defaultLineWidth: 1 },
    ],
    docs: {
      definition: "Linear Regression Channel plots a best-fit line through price data with standard deviation bands.",
      explanation: "The indicator uses least squares regression to find the best-fit line over a specified lookback. Deviation bands show expected price dispersion. Pearson's R measures how well prices fit the linear trend.",
      calculations: "LinReg = least squares best-fit line. Upper = LinReg + stdDev × upperDev. Lower = LinReg − stdDev × lowerDev. R = Pearson correlation coefficient.",
      takeaways: [
        "R near ±1 indicates strong linear trend",
        "R near 0 indicates no linear relationship",
        "Price at bands may signal overbought/oversold",
        "Slope direction shows trend direction",
      ],
      whatToLookFor: [
        "Price bouncing off deviation bands",
        "High R value confirming trend strength",
        "Channel breakouts as reversal signals",
        "Slope changes as early trend signals",
      ],
      limitations: [
        "Repaints as new data arrives",
        "Assumes linear price relationships",
        "Fixed lookback may miss regime changes",
      ],
      commonSettings: "Count 100, Upper/Lower Deviation 2. Source Close.",
      bestConditions: "Trending markets with clear directional bias.",
      goesGoodWith: ["rsi", "bb", "adx", "stoch"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Williams Alligator (TradingView Parity)
  // Three SMMA lines (Jaw, Teeth, Lips) with forward offsets
  // TV Reference: https://www.tradingview.com/support/solutions/43000592305-williams-alligator/
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "williamsAlligator",
    name: "Williams Alligator",
    shortName: "Alligator",
    category: "trend",
    tags: ["overlay", "trend", "williams", "alligator", "smma"],
    description: "Three smoothed moving averages showing market trends and ranges",
    panePolicy: "overlay",
    inputs: [
      // === Inputs section ===
      { key: "jawLength", label: "Jaw Length", type: "number", default: 13, min: 1, max: 100 },
      { key: "teethLength", label: "Teeth Length", type: "number", default: 8, min: 1, max: 100 },
      { key: "lipsLength", label: "Lips Length", type: "number", default: 5, min: 1, max: 100 },
      { key: "jawOffset", label: "Jaw Offset", type: "number", default: 8, min: 0, max: 50 },
      { key: "teethOffset", label: "Teeth Offset", type: "number", default: 5, min: 0, max: 50 },
      { key: "lipsOffset", label: "Lips Offset", type: "number", default: 3, min: 0, max: 50 },
      // === Style toggles ===
      { key: "showJaw", label: "Jaw", type: "boolean", default: true },
      { key: "showTeeth", label: "Teeth", type: "boolean", default: true },
      { key: "showLips", label: "Lips", type: "boolean", default: true },
      // === Colors ===
      { key: "jawColor", label: "Jaw Color", type: "color", default: "#2962FF" },
      { key: "teethColor", label: "Teeth Color", type: "color", default: "#E91E63" },
      { key: "lipsColor", label: "Lips Color", type: "color", default: "#66BB6A" },
      // === Line widths ===
      { key: "jawLineWidth", label: "Jaw Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "teethLineWidth", label: "Teeth Line Width", type: "number", default: 1, min: 1, max: 4 },
      { key: "lipsLineWidth", label: "Lips Line Width", type: "number", default: 1, min: 1, max: 4 },
    ],
    outputs: [
      { key: "jaw", label: "Jaw", style: "line", defaultColor: "#2962FF", defaultLineWidth: 1 },
      { key: "teeth", label: "Teeth", style: "line", defaultColor: "#E91E63", defaultLineWidth: 1 },
      { key: "lips", label: "Lips", style: "line", defaultColor: "#66BB6A", defaultLineWidth: 1 },
    ],
    docs: {
      definition: "The Williams Alligator is a trend-following indicator using three smoothed moving averages (SMMA) with forward offsets.",
      explanation: "The three lines represent the Alligator's Jaw (blue), Teeth (pink), and Lips (green). When lines are intertwined, the Alligator is 'sleeping' (no trend). When lines spread and move in the same direction, the Alligator is 'eating' (trending).",
      calculations: "Jaw = SMMA(hl2, 13) shifted forward 8 bars. Teeth = SMMA(hl2, 8) shifted forward 5 bars. Lips = SMMA(hl2, 5) shifted forward 3 bars.",
      takeaways: [
        "Intertwined lines suggest range-bound market",
        "Spread lines suggest trending market",
        "Lips crossing Teeth crossing Jaw signals trend start",
        "Opposite crossing signals trend end",
      ],
      whatToLookFor: [
        "Lines spreading apart for trend confirmation",
        "Lines converging for consolidation/reversal",
        "Lips above all = bullish, below all = bearish",
        "Use with fractals for entry/exit points",
      ],
      limitations: [
        "Lagging indicator due to smoothing",
        "False signals in choppy markets",
        "Forward offset means last bars are projected",
      ],
      commonSettings: "Default periods (13, 8, 5) and offsets (8, 5, 3).",
      bestConditions: "Trending markets with clear directional movement.",
      goesGoodWith: ["williamsFractals", "rsi", "ao", "adx"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Williams Fractals (TradingView Parity)
  // Pivot high/low markers
  // TV Reference: https://www.tradingview.com/support/solutions/43000591663-williams-fractal/
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "williamsFractals",
    name: "Williams Fractals",
    shortName: "Fractals",
    category: "trend",
    tags: ["overlay", "pivot", "williams", "fractals", "reversal"],
    description: "Identify potential reversal points using pivot high/low detection",
    panePolicy: "overlay",
    inputs: [
      // === Inputs section ===
      { key: "periods", label: "Periods", type: "number", default: 2, min: 1, max: 10 },
      // === Style toggles ===
      { key: "showUpFractals", label: "Up Fractals", type: "boolean", default: true },
      { key: "showDownFractals", label: "Down Fractals", type: "boolean", default: true },
      // === Colors ===
      { key: "upColor", label: "Up Fractal Color", type: "color", default: "#089981" },
      { key: "downColor", label: "Down Fractal Color", type: "color", default: "#F23645" },
    ],
    outputs: [
      { key: "upFractal", label: "Up Fractal", style: "line", defaultColor: "#089981" },
      { key: "downFractal", label: "Down Fractal", style: "line", defaultColor: "#F23645" },
    ],
    docs: {
      definition: "Williams Fractals identify potential turning points by detecting local highs and lows.",
      explanation: "A fractal high (down arrow) forms when the middle bar's high is highest among 2×Periods+1 bars. A fractal low (up arrow) forms when the middle bar's low is lowest. The fractal is drawn at the pivot bar once the right-side bars confirm.",
      calculations: "Fractal High: high[n] > high[n±1..periods]. Fractal Low: low[n] < low[n±1..periods]. Default periods=2 means 5-bar window.",
      takeaways: [
        "Up fractals suggest support levels",
        "Down fractals suggest resistance levels",
        "Combine with Alligator for trade signals",
        "Fractals only appear after confirmation",
      ],
      whatToLookFor: [
        "Breakouts above/below fractal levels",
        "Clusters of fractals as strong zones",
        "Fractals in direction of Alligator trend",
        "Stop loss placement at recent fractals",
      ],
      limitations: [
        "Delayed due to right-side confirmation",
        "Many false fractals in choppy markets",
        "Historical only - don't repaint",
      ],
      commonSettings: "Periods 2 (5-bar pattern).",
      bestConditions: "Trending markets or at major support/resistance.",
      goesGoodWith: ["williamsAlligator", "bb", "rsi", "macd"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // RSI Divergence Indicator (TradingView Parity)
  // RSI with divergence detection
  // TV Reference: https://www.tradingview.com/support/solutions/43000589127-divergence/
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "rsiDivergence",
    name: "RSI Divergence Indicator",
    shortName: "RSI Div",
    category: "momentum",
    tags: ["oscillator", "divergence", "rsi", "momentum", "reversal"],
    description: "RSI oscillator with automatic divergence detection",
    panePolicy: "separate",
    inputs: [
      // === Inputs section ===
      { key: "rsiPeriod", label: "RSI Period", type: "number", default: 14, min: 1, max: 100 },
      { key: "source", label: "RSI Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ]},
      { key: "lbL", label: "Pivot Lookback Left", type: "number", default: 5, min: 1, max: 50 },
      { key: "lbR", label: "Pivot Lookback Right", type: "number", default: 5, min: 1, max: 50 },
      { key: "rangeMax", label: "Max of Lookback Range", type: "number", default: 60, min: 10, max: 200 },
      { key: "rangeMin", label: "Min of Lookback Range", type: "number", default: 5, min: 1, max: 50 },
      // === Divergence toggles ===
      { key: "plotBullish", label: "Plot Bullish", type: "boolean", default: true },
      { key: "plotHiddenBullish", label: "Plot Hidden Bullish", type: "boolean", default: false },
      { key: "plotBearish", label: "Plot Bearish", type: "boolean", default: true },
      { key: "plotHiddenBearish", label: "Plot Hidden Bearish", type: "boolean", default: false },
      // === Label toggles ===
      { key: "showBullLabel", label: "Show Bull Label", type: "boolean", default: true },
      { key: "showBearLabel", label: "Show Bear Label", type: "boolean", default: true },
      // === Background and levels ===
      { key: "showBackground", label: "Show Background", type: "boolean", default: true },
      { key: "showLevels", label: "Show Level Lines", type: "boolean", default: true },
      // === Colors ===
      { key: "rsiColor", label: "RSI Color", type: "color", default: "#7E57C2" },
      { key: "bullColor", label: "Bullish Color", type: "color", default: "#089981" },
      { key: "bearColor", label: "Bearish Color", type: "color", default: "#F23645" },
      // === Level lines ===
      { key: "upperLevel", label: "Upper Level", type: "number", default: 70, min: 50, max: 100 },
      { key: "middleLevel", label: "Middle Level", type: "number", default: 50, min: 0, max: 100 },
      { key: "lowerLevel", label: "Lower Level", type: "number", default: 30, min: 0, max: 50 },
    ],
    outputs: [
      { key: "rsi", label: "RSI", style: "line", defaultColor: "#7E57C2", defaultLineWidth: 1 },
      { key: "upperBand", label: "Upper", style: "line", defaultColor: "#787B86", defaultLineWidth: 1 },
      { key: "middleBand", label: "Middle", style: "line", defaultColor: "#787B86", defaultLineWidth: 1 },
      { key: "lowerBand", label: "Lower", style: "line", defaultColor: "#787B86", defaultLineWidth: 1 },
    ],
    docs: {
      definition: "RSI Divergence Indicator combines RSI oscillator with automatic detection of regular and hidden divergences.",
      explanation: "Regular bullish divergence: price makes lower low, RSI makes higher low (reversal signal). Regular bearish divergence: price makes higher high, RSI makes lower high. Hidden divergences signal trend continuation.",
      calculations: "RSI standard calculation. Divergence detected using pivot detection with configurable lookback ranges.",
      takeaways: [
        "Regular divergence signals potential reversal",
        "Hidden divergence signals continuation",
        "RSI in OB/OS zones strengthens signal",
        "Combine with price action for confirmation",
      ],
      whatToLookFor: [
        "Bullish divergence near oversold for longs",
        "Bearish divergence near overbought for shorts",
        "Hidden bullish in uptrend for continuation",
        "Hidden bearish in downtrend for continuation",
      ],
      limitations: [
        "Divergence can persist before reversal",
        "False signals in strong trends",
        "Pivot detection is backward-looking",
      ],
      commonSettings: "RSI Period 14. Pivot lookback 5/5. Range 5-60.",
      bestConditions: "Range-bound markets or at trend exhaustion.",
      goesGoodWith: ["bb", "macd", "adx", "williamsAlligator"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Knoxville Divergence (Rob Booker)
  // Momentum divergence with RSI gate
  // TV Reference: https://www.tradingview.com/support/solutions/43000591336-rob-booker-knoxville-divergence/
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "knoxvilleDivergence",
    name: "Rob Booker - Knoxville Divergence",
    shortName: "KD",
    category: "momentum",
    tags: ["overlay", "divergence", "momentum", "reversal", "knoxville", "booker"],
    description: "Momentum divergence indicator with RSI overbought/oversold confirmation",
    panePolicy: "overlay",
    inputs: [
      // === Inputs section ===
      { key: "lookback", label: "Bars Back", type: "number", default: 150, min: 10, max: 500 },
      { key: "rsiPeriod", label: "RSI Period", type: "number", default: 21, min: 1, max: 100 },
      { key: "momPeriod", label: "Momentum Period", type: "number", default: 20, min: 1, max: 100 },
      // === Style toggles ===
      { key: "showBullish", label: "Bullish Signals", type: "boolean", default: true },
      { key: "showBearish", label: "Bearish Signals", type: "boolean", default: true },
      { key: "showLines", label: "Show Lines", type: "boolean", default: true },
      // === Colors ===
      { key: "bullColor", label: "Bullish Color", type: "color", default: "#26A69A" },
      { key: "bearColor", label: "Bearish Color", type: "color", default: "#F23645" },
    ],
    outputs: [
      { key: "bullish", label: "+KD", style: "line", defaultColor: "#089981" },
      { key: "bearish", label: "-KD", style: "line", defaultColor: "#F23645" },
    ],
    docs: {
      definition: "Knoxville Divergence (Rob Booker) detects momentum divergence confirmed by RSI overbought/oversold conditions at price extremes.",
      explanation: "Bullish (+KD): price makes new low with momentum divergence while RSI was oversold. Bearish (-KD): price makes new high with momentum divergence while RSI was overbought.",
      calculations: "Find bars where current momentum < prior momentum with higher price (bear) or current momentum > prior momentum with lower price (bull). Confirm with RSI OB/OS gate and extreme price.",
      takeaways: [
        "+KD signals potential bullish reversal",
        "-KD signals potential bearish reversal",
        "RSI gate filters false signals",
        "Works best at market extremes",
      ],
      whatToLookFor: [
        "+KD below price for long entry",
        "-KD above price for short entry",
        "Multiple consecutive signals for strength",
        "Combine with trend indicators",
      ],
      limitations: [
        "Rare signals in trending markets",
        "May miss fast reversals",
        "Requires RSI confirmation",
      ],
      commonSettings: "Bars Back 150. RSI Period 21. Momentum Period 20.",
      bestConditions: "Market tops and bottoms, exhaustion points.",
      goesGoodWith: ["rsi", "williamsAlligator", "bb", "macd"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Volume Profile - Visible Range (VRVP)
  // TV Reference: https://www.tradingview.com/support/solutions/43000703076-visible-range-volume-profile/
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "vrvp",
    name: "Visible Range Volume Profile",
    shortName: "VRVP",
    category: "volume",
    tags: ["overlay", "volume-profile", "poc", "value-area", "distribution"],
    description: "Volume Profile calculated on the visible chart range. Shows POC, VAH, VAL.",
    panePolicy: "overlay",
    inputs: [
      // === Rows section ===
      { key: "rowsLayout", label: "Rows Layout", type: "select", default: "Number of Rows", options: [
        { value: "Number of Rows", label: "Number of Rows" },
        { value: "Ticks Per Row", label: "Ticks Per Row" },
      ]},
      { key: "numRows", label: "Row Size", type: "number", default: 24, min: 1, max: 200 },
      { key: "valueAreaPercent", label: "Value Area Volume (%)", type: "number", default: 70, min: 1, max: 99 },
      // === Style section ===
      { key: "volumeMode", label: "Volume", type: "select", default: "Up/Down", options: [
        { value: "Up/Down", label: "Up/Down" },
        { value: "Total", label: "Total" },
        { value: "Delta", label: "Delta" },
      ]},
      { key: "placement", label: "Placement", type: "select", default: "Left", options: [
        { value: "Left", label: "Left" },
        { value: "Right", label: "Right" },
      ]},
      { key: "widthPercent", label: "Width (%)", type: "number", default: 70, min: 10, max: 100 },
      // === Toggles ===
      { key: "showHistogram", label: "Show Histogram", type: "boolean", default: true },
      { key: "showPOC", label: "Developing POC", type: "boolean", default: true },
      { key: "showVALines", label: "Developing VA", type: "boolean", default: true },
      { key: "showValueArea", label: "Value Area Background", type: "boolean", default: true },
      { key: "extendPOC", label: "Extend POC Right", type: "boolean", default: false },
      { key: "extendVA", label: "Extend VA Right", type: "boolean", default: false },
      // === Colors ===
      { key: "upColor", label: "Up Volume", type: "color", default: "#26A69A" },
      { key: "downColor", label: "Down Volume", type: "color", default: "#EF5350" },
      { key: "pocColor", label: "POC Line", type: "color", default: "#FFEB3B" },
      { key: "vaColor", label: "VA Lines", type: "color", default: "#2962FF" },
      { key: "valueAreaColor", label: "VA Background", type: "color", default: "#2962FF" },
    ],
    outputs: [
      { key: "histogram", label: "Volume Histogram", style: "histogram", defaultColor: "#26A69A" },
      { key: "poc", label: "POC", style: "line", defaultColor: "#FFEB3B" },
      { key: "vah", label: "VAH", style: "line", defaultColor: "#2962FF" },
      { key: "val", label: "VAL", style: "line", defaultColor: "#2962FF" },
    ],
    docs: {
      definition: "Visible Range Volume Profile (VRVP) displays a horizontal histogram showing volume distribution at each price level within the visible chart area.",
      explanation: "The profile updates dynamically as you pan or zoom the chart. POC (Point of Control) marks the price with the highest volume. VAH and VAL define the Value Area containing the specified percentage of volume.",
      calculations: "Fetches lower timeframe bars for the visible range. Distributes volume to price bins based on each bar's high-low range. TV direction rules: up if close>open, down if close<open, ties use previous close comparison.",
      takeaways: [
        "POC is often a key support/resistance level",
        "Value Area (70%) represents fair value zone",
        "Low volume nodes (LVN) suggest potential breakout areas",
        "High volume nodes (HVN) indicate congestion zones",
      ],
      whatToLookFor: [
        "Price rejection at POC levels",
        "Breakouts from Value Area",
        "Price acceptance vs rejection at HVN/LVN",
        "VA expansion/contraction for volatility",
      ],
      limitations: [
        "Requires intraday data for accurate distribution",
        "EODHD limitation: finest resolution is 5m (TV uses 1m)",
        "Recalculates on every pan/zoom (CPU intensive)",
      ],
      commonSettings: "24 rows, 70% Value Area, Up/Down volume mode.",
      bestConditions: "Intraday and swing trading for S/R levels.",
      goesGoodWith: ["vwap", "avwap", "bb", "dc"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Volume Profile - Fixed Range (VPFR)
  // TV Reference: https://www.tradingview.com/support/solutions/43000480324-fixed-range-volume-profile-indicator/
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "vpfr",
    name: "Fixed Range Volume Profile",
    shortName: "VPFR",
    category: "volume",
    tags: ["overlay", "volume-profile", "poc", "value-area", "fixed-range"],
    description: "Volume Profile calculated for a user-specified time range.",
    panePolicy: "overlay",
    inputs: [
      // === Range section ===
      { key: "rangeStart", label: "Start Date/Time", type: "text", default: "" },
      { key: "rangeEnd", label: "End Date/Time", type: "text", default: "" },
      { key: "extendRight", label: "Extend Right", type: "boolean", default: false },
      // === Rows section ===
      { key: "rowsLayout", label: "Rows Layout", type: "select", default: "Number of Rows", options: [
        { value: "Number of Rows", label: "Number of Rows" },
        { value: "Ticks Per Row", label: "Ticks Per Row" },
      ]},
      { key: "numRows", label: "Row Size", type: "number", default: 24, min: 1, max: 200 },
      { key: "valueAreaPercent", label: "Value Area Volume (%)", type: "number", default: 70, min: 1, max: 99 },
      // === Style section ===
      { key: "volumeMode", label: "Volume", type: "select", default: "Up/Down", options: [
        { value: "Up/Down", label: "Up/Down" },
        { value: "Total", label: "Total" },
        { value: "Delta", label: "Delta" },
      ]},
      { key: "placement", label: "Placement", type: "select", default: "Left", options: [
        { value: "Left", label: "Left" },
        { value: "Right", label: "Right" },
      ]},
      { key: "widthPercent", label: "Width (%)", type: "number", default: 70, min: 10, max: 100 },
      // === Toggles ===
      { key: "showHistogram", label: "Show Histogram", type: "boolean", default: true },
      { key: "showPOC", label: "Developing POC", type: "boolean", default: true },
      { key: "showVALines", label: "Developing VA", type: "boolean", default: true },
      { key: "showValueArea", label: "Value Area Background", type: "boolean", default: true },
      { key: "extendPOC", label: "Extend POC Right", type: "boolean", default: false },
      { key: "extendVA", label: "Extend VA Right", type: "boolean", default: false },
      // === Colors ===
      { key: "upColor", label: "Up Volume", type: "color", default: "#26A69A" },
      { key: "downColor", label: "Down Volume", type: "color", default: "#EF5350" },
      { key: "pocColor", label: "POC Line", type: "color", default: "#FFEB3B" },
      { key: "vaColor", label: "VA Lines", type: "color", default: "#2962FF" },
      { key: "valueAreaColor", label: "VA Background", type: "color", default: "#2962FF" },
    ],
    outputs: [
      { key: "histogram", label: "Volume Histogram", style: "histogram", defaultColor: "#26A69A" },
      { key: "poc", label: "POC", style: "line", defaultColor: "#FFEB3B" },
      { key: "vah", label: "VAH", style: "line", defaultColor: "#2962FF" },
      { key: "val", label: "VAL", style: "line", defaultColor: "#2962FF" },
    ],
    docs: {
      definition: "Fixed Range Volume Profile (VPFR) displays volume distribution for a user-specified time range.",
      explanation: "Unlike VRVP which updates with scroll, VPFR stays anchored to specific coordinates. Good for analyzing a specific event or period.",
      calculations: "Same as VRVP but range is user-defined via start/end timestamps.",
      takeaways: [
        "Good for analyzing specific events (earnings, gaps)",
        "Profile remains stable as you scroll",
        "Extend Right continues accumulating volume",
      ],
      whatToLookFor: [
        "Volume distribution around key events",
        "POC as future support/resistance",
      ],
      limitations: [
        "Requires manual range selection",
        "EODHD limited to 5m resolution",
      ],
      commonSettings: "24 rows, 70% Value Area.",
      bestConditions: "Event analysis, swing trading setups.",
      goesGoodWith: ["vwap", "avwap", "vrvp"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Volume Profile - Auto Anchored (AAVP)
  // TV Reference: https://www.tradingview.com/support/solutions/43000703077-auto-anchored-volume-profile/
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "aavp",
    name: "Auto Anchored Volume Profile",
    shortName: "AAVP",
    category: "volume",
    tags: ["overlay", "volume-profile", "poc", "value-area", "auto-anchor"],
    description: "Volume Profile that auto-anchors based on chart timeframe or swing detection.",
    panePolicy: "overlay",
    inputs: [
      // === Anchor section ===
      { key: "anchorPeriod", label: "Anchor Period", type: "select", default: "Auto", options: [
        { value: "Auto", label: "Auto" },
        { value: "Highest High", label: "Highest High" },
        { value: "Lowest Low", label: "Lowest Low" },
        { value: "Highest Volume", label: "Highest Volume" },
        { value: "Session", label: "Session" },
        { value: "Week", label: "Week" },
        { value: "Month", label: "Month" },
        { value: "Quarter", label: "Quarter" },
        { value: "Year", label: "Year" },
      ]},
      { key: "length", label: "Length", type: "number", default: 100, min: 1, max: 5000 },
      // === Rows section ===
      { key: "rowsLayout", label: "Rows Layout", type: "select", default: "Number of Rows", options: [
        { value: "Number of Rows", label: "Number of Rows" },
        { value: "Ticks Per Row", label: "Ticks Per Row" },
      ]},
      { key: "numRows", label: "Row Size", type: "number", default: 24, min: 1, max: 200 },
      { key: "valueAreaPercent", label: "Value Area Volume (%)", type: "number", default: 70, min: 1, max: 99 },
      // === Style section ===
      { key: "volumeMode", label: "Volume", type: "select", default: "Up/Down", options: [
        { value: "Up/Down", label: "Up/Down" },
        { value: "Total", label: "Total" },
        { value: "Delta", label: "Delta" },
      ]},
      { key: "placement", label: "Placement", type: "select", default: "Left", options: [
        { value: "Left", label: "Left" },
        { value: "Right", label: "Right" },
      ]},
      { key: "widthPercent", label: "Width (%)", type: "number", default: 70, min: 10, max: 100 },
      // === Toggles ===
      { key: "showHistogram", label: "Show Histogram", type: "boolean", default: true },
      { key: "showPOC", label: "Developing POC", type: "boolean", default: true },
      { key: "showVALines", label: "Developing VA", type: "boolean", default: true },
      { key: "showValueArea", label: "Value Area Background", type: "boolean", default: true },
      { key: "extendPOC", label: "Extend POC Right", type: "boolean", default: false },
      { key: "extendVA", label: "Extend VA Right", type: "boolean", default: false },
      // === Colors ===
      { key: "upColor", label: "Up Volume", type: "color", default: "#26A69A" },
      { key: "downColor", label: "Down Volume", type: "color", default: "#EF5350" },
      { key: "pocColor", label: "POC Line", type: "color", default: "#FFEB3B" },
      { key: "vaColor", label: "VA Lines", type: "color", default: "#2962FF" },
      { key: "valueAreaColor", label: "VA Background", type: "color", default: "#2962FF" },
    ],
    outputs: [
      { key: "histogram", label: "Volume Histogram", style: "histogram", defaultColor: "#26A69A" },
      { key: "poc", label: "POC", style: "line", defaultColor: "#FFEB3B" },
      { key: "vah", label: "VAH", style: "line", defaultColor: "#2962FF" },
      { key: "val", label: "VAL", style: "line", defaultColor: "#2962FF" },
    ],
    docs: {
      definition: "Auto Anchored Volume Profile (AAVP) automatically determines anchor points based on timeframe or swing detection.",
      explanation: "In 'Auto' mode: Session on intraday, Month on 1D, Quarter on 2D-10D, Year on 11D-60D. Can also anchor to Highest High/Low.",
      calculations: "Anchor start determined by mode, then same VP calculation as VRVP.",
      takeaways: [
        "Adapts automatically to your timeframe",
        "Good for swing traders wanting recent structure",
        "Highest High/Low modes track recent extremes",
      ],
      whatToLookFor: [
        "POC as dynamic support/resistance",
        "Value Area for mean reversion",
      ],
      limitations: [
        "Auto mode may not match your preferred anchor",
        "Length parameter only applies to High/Low modes",
      ],
      commonSettings: "Auto anchor, 24 rows, 70% VA.",
      bestConditions: "Swing trading, trend following.",
      goesGoodWith: ["vwap", "supertrend", "psar"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Session Volume Profile (SVP)
  // TV Reference: https://www.tradingview.com/support/solutions/43000703072-session-volume-profile/
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "svp",
    name: "Session Volume Profile",
    shortName: "SVP",
    category: "volume",
    tags: ["overlay", "volume-profile", "poc", "value-area", "session"],
    description: "Volume Profile calculated per trading session. Shows multiple profiles.",
    panePolicy: "overlay",
    inputs: [
      // === Session section ===
      { key: "sessions", label: "Sessions", type: "select", default: "All", options: [
        { value: "All", label: "All" },
        { value: "Each", label: "Each (pre/market/post)" },
        { value: "Pre-market", label: "Pre-market" },
        { value: "Market", label: "Market" },
        { value: "Post-market", label: "Post-market" },
        { value: "Custom", label: "Custom" },
      ]},
      { key: "customStart", label: "Custom Start", type: "text", default: "09:30" },
      { key: "customEnd", label: "Custom End", type: "text", default: "16:00" },
      { key: "timezone", label: "Timezone", type: "select", default: "Exchange", options: [
        { value: "Exchange", label: "Exchange" },
        { value: "UTC", label: "UTC" },
        { value: "America/New_York", label: "New York" },
        { value: "Europe/London", label: "London" },
      ]},
      // === Rows section ===
      { key: "rowsLayout", label: "Rows Layout", type: "select", default: "Number of Rows", options: [
        { value: "Number of Rows", label: "Number of Rows" },
        { value: "Ticks Per Row", label: "Ticks Per Row" },
      ]},
      { key: "numRows", label: "Row Size", type: "number", default: 24, min: 1, max: 200 },
      { key: "valueAreaPercent", label: "Value Area Volume (%)", type: "number", default: 70, min: 1, max: 99 },
      // === Style section ===
      { key: "volumeMode", label: "Volume", type: "select", default: "Up/Down", options: [
        { value: "Up/Down", label: "Up/Down" },
        { value: "Total", label: "Total" },
        { value: "Delta", label: "Delta" },
      ]},
      { key: "placement", label: "Placement", type: "select", default: "Left", options: [
        { value: "Left", label: "Left" },
        { value: "Right", label: "Right" },
      ]},
      { key: "widthPercent", label: "Width (%)", type: "number", default: 70, min: 10, max: 100 },
      // === Toggles ===
      { key: "showHistogram", label: "Show Histogram", type: "boolean", default: true },
      { key: "showPOC", label: "Developing POC", type: "boolean", default: true },
      { key: "showVALines", label: "Developing VA", type: "boolean", default: true },
      { key: "showValueArea", label: "Value Area Background", type: "boolean", default: true },
      { key: "extendPOC", label: "Extend POC Right", type: "boolean", default: false },
      { key: "extendVA", label: "Extend VA Right", type: "boolean", default: false },
      // === Colors ===
      { key: "upColor", label: "Up Volume", type: "color", default: "#26A69A" },
      { key: "downColor", label: "Down Volume", type: "color", default: "#EF5350" },
      { key: "pocColor", label: "POC Line", type: "color", default: "#FFEB3B" },
      { key: "vaColor", label: "VA Lines", type: "color", default: "#2962FF" },
      { key: "valueAreaColor", label: "VA Background", type: "color", default: "#2962FF" },
    ],
    outputs: [
      { key: "histogram", label: "Volume Histogram", style: "histogram", defaultColor: "#26A69A" },
      { key: "poc", label: "POC", style: "line", defaultColor: "#FFEB3B" },
      { key: "vah", label: "VAH", style: "line", defaultColor: "#2962FF" },
      { key: "val", label: "VAL", style: "line", defaultColor: "#2962FF" },
    ],
    docs: {
      definition: "Session Volume Profile (SVP) displays volume profiles for each trading session.",
      explanation: "Creates separate profiles per session (day). Useful for intraday traders. Session boundaries can be customized.",
      calculations: "Uses fixed LTF table based on chart TF. 6000 row limit. Profiles aligned by year.",
      takeaways: [
        "Shows developing intraday structure",
        "Each session has its own POC/VA",
        "Great for day trading",
      ],
      whatToLookFor: [
        "Yesterday's POC as today's S/R",
        "Session POC migrations",
        "Initial balance breakouts",
      ],
      limitations: [
        "Max 6000 total rows across all profiles",
        "Profiles reset at year boundary",
        "Requires intraday timeframe",
      ],
      commonSettings: "All sessions, 24 rows.",
      bestConditions: "Day trading, intraday support/resistance.",
      goesGoodWith: ["vwap", "avwap", "vrvp"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Session Volume Profile HD (SVP HD)
  // TV Reference: https://www.tradingview.com/support/solutions/43000557450-session-volume-profile-hd/
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "svphd",
    name: "Session Volume Profile HD",
    shortName: "SVP HD",
    category: "volume",
    tags: ["overlay", "volume-profile", "poc", "value-area", "session", "hd"],
    description: "High-definition Session Volume Profile with auto-adjusting detail on zoom.",
    panePolicy: "overlay",
    inputs: [
      // === Session section ===
      { key: "sessions", label: "Sessions", type: "select", default: "All", options: [
        { value: "All", label: "All" },
        { value: "Each", label: "Each (pre/market/post)" },
        { value: "Pre-market", label: "Pre-market" },
        { value: "Market", label: "Market" },
        { value: "Post-market", label: "Post-market" },
        { value: "Custom", label: "Custom" },
      ]},
      { key: "customStart", label: "Custom Start", type: "text", default: "09:30" },
      { key: "customEnd", label: "Custom End", type: "text", default: "16:00" },
      { key: "timezone", label: "Timezone", type: "select", default: "Exchange", options: [
        { value: "Exchange", label: "Exchange" },
        { value: "UTC", label: "UTC" },
        { value: "America/New_York", label: "New York" },
        { value: "Europe/London", label: "London" },
      ]},
      // === Value Area ===
      { key: "valueAreaPercent", label: "Value Area Volume (%)", type: "number", default: 70, min: 1, max: 99 },
      // === Style section ===
      { key: "volumeMode", label: "Volume", type: "select", default: "Up/Down", options: [
        { value: "Up/Down", label: "Up/Down" },
        { value: "Total", label: "Total" },
        { value: "Delta", label: "Delta" },
      ]},
      { key: "placement", label: "Placement", type: "select", default: "Left", options: [
        { value: "Left", label: "Left" },
        { value: "Right", label: "Right" },
      ]},
      { key: "widthPercent", label: "Width (%)", type: "number", default: 70, min: 10, max: 100 },
      // === Toggles ===
      { key: "showHistogram", label: "Show Histogram", type: "boolean", default: true },
      { key: "showPOC", label: "Developing POC", type: "boolean", default: true },
      { key: "showVALines", label: "Developing VA", type: "boolean", default: true },
      { key: "showValueArea", label: "Value Area Background", type: "boolean", default: true },
      { key: "extendPOC", label: "Extend POC Right", type: "boolean", default: false },
      { key: "extendVA", label: "Extend VA Right", type: "boolean", default: false },
      // === Colors ===
      { key: "upColor", label: "Up Volume", type: "color", default: "#26A69A" },
      { key: "downColor", label: "Down Volume", type: "color", default: "#EF5350" },
      { key: "pocColor", label: "POC Line", type: "color", default: "#FFEB3B" },
      { key: "vaColor", label: "VA Lines", type: "color", default: "#2962FF" },
      { key: "valueAreaColor", label: "VA Background", type: "color", default: "#2962FF" },
    ],
    outputs: [
      { key: "histogram", label: "Volume Histogram", style: "histogram", defaultColor: "#26A69A" },
      { key: "poc", label: "POC", style: "line", defaultColor: "#FFEB3B" },
      { key: "vah", label: "VAH", style: "line", defaultColor: "#2962FF" },
      { key: "val", label: "VAL", style: "line", defaultColor: "#2962FF" },
    ],
    docs: {
      definition: "Session Volume Profile HD auto-adjusts row count as you zoom the chart.",
      explanation: "Unlike regular SVP, HD version shows more detail when zoomed in. Uses rough calculation for history, detailed for visible area.",
      calculations: "Rough + detailed dual calculation. Detailed uses VRVP-style LTF selection for visible sessions.",
      takeaways: [
        "More detail when zoomed in",
        "Rough view for historical overview",
        "Best of both worlds",
      ],
      whatToLookFor: [
        "Fine-grained POC levels when zoomed",
        "Broad structure overview when zoomed out",
      ],
      limitations: [
        "More CPU intensive than regular SVP",
        "No Row Size input (auto-calculated)",
      ],
      commonSettings: "All sessions, 70% VA.",
      bestConditions: "Multi-timeframe analysis, detailed intraday work.",
      goesGoodWith: ["vwap", "svp", "vrvp"],
    },
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Periodic Volume Profile (PVP)
  // TV Reference: https://www.tradingview.com/support/solutions/43000703071-periodic-volume-profile/
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "pvp",
    name: "Periodic Volume Profile",
    shortName: "PVP",
    category: "volume",
    tags: ["overlay", "volume-profile", "poc", "value-area", "periodic"],
    description: "Volume Profile calculated per customizable period (day/week/month/etc).",
    panePolicy: "overlay",
    inputs: [
      // === Period section ===
      { key: "periodMultiplier", label: "Period Multiplier", type: "number", default: 1, min: 1, max: 1000 },
      { key: "periodUnit", label: "Period Unit", type: "select", default: "Day", options: [
        { value: "Bar", label: "Bar" },
        { value: "Minute", label: "Minute" },
        { value: "Hour", label: "Hour" },
        { value: "Day", label: "Day" },
        { value: "Week", label: "Week" },
        { value: "Month", label: "Month" },
      ]},
      // === Rows section ===
      { key: "rowsLayout", label: "Rows Layout", type: "select", default: "Number of Rows", options: [
        { value: "Number of Rows", label: "Number of Rows" },
        { value: "Ticks Per Row", label: "Ticks Per Row" },
      ]},
      { key: "numRows", label: "Row Size", type: "number", default: 24, min: 1, max: 200 },
      { key: "valueAreaPercent", label: "Value Area Volume (%)", type: "number", default: 70, min: 1, max: 99 },
      // === Style section ===
      { key: "volumeMode", label: "Volume", type: "select", default: "Up/Down", options: [
        { value: "Up/Down", label: "Up/Down" },
        { value: "Total", label: "Total" },
        { value: "Delta", label: "Delta" },
      ]},
      { key: "placement", label: "Placement", type: "select", default: "Left", options: [
        { value: "Left", label: "Left" },
        { value: "Right", label: "Right" },
      ]},
      { key: "widthPercent", label: "Width (%)", type: "number", default: 70, min: 10, max: 100 },
      // === Toggles ===
      { key: "showHistogram", label: "Show Histogram", type: "boolean", default: true },
      { key: "showPOC", label: "Developing POC", type: "boolean", default: true },
      { key: "showVALines", label: "Developing VA", type: "boolean", default: true },
      { key: "showValueArea", label: "Value Area Background", type: "boolean", default: true },
      { key: "extendPOC", label: "Extend POC Right", type: "boolean", default: false },
      { key: "extendVA", label: "Extend VA Right", type: "boolean", default: false },
      // === Colors ===
      { key: "upColor", label: "Up Volume", type: "color", default: "#26A69A" },
      { key: "downColor", label: "Down Volume", type: "color", default: "#EF5350" },
      { key: "pocColor", label: "POC Line", type: "color", default: "#FFEB3B" },
      { key: "vaColor", label: "VA Lines", type: "color", default: "#2962FF" },
      { key: "valueAreaColor", label: "VA Background", type: "color", default: "#2962FF" },
    ],
    outputs: [
      { key: "histogram", label: "Volume Histogram", style: "histogram", defaultColor: "#26A69A" },
      { key: "poc", label: "POC", style: "line", defaultColor: "#FFEB3B" },
      { key: "vah", label: "VAH", style: "line", defaultColor: "#2962FF" },
      { key: "val", label: "VAL", style: "line", defaultColor: "#2962FF" },
    ],
    docs: {
      definition: "Periodic Volume Profile (PVP) creates profiles for each custom period (e.g., weekly, monthly).",
      explanation: "Similar to SVP but with flexible period definition. Good for higher timeframe analysis.",
      calculations: "Same LTF table as SVP. 6000 row limit. Year boundary alignment.",
      takeaways: [
        "Weekly/monthly profiles for position trading",
        "Customizable period multiplier",
        "Good for swing trading",
      ],
      whatToLookFor: [
        "Weekly POC levels",
        "Monthly Value Areas",
        "Period transitions",
      ],
      limitations: [
        "Max 6000 total rows",
        "Year boundary resets profiles",
      ],
      commonSettings: "1 Week period, 24 rows.",
      bestConditions: "Swing trading, position trading.",
      goesGoodWith: ["vwap", "svp", "vrvp"],
    },
  },
];

// ============================================================================
// Registry Helpers
// ============================================================================

const manifestMap = new Map<string, IndicatorManifest>(
  INDICATOR_MANIFESTS.map(m => [m.id, m])
);

/**
 * All valid indicator kinds - SINGLE SOURCE OF TRUTH
 * Use this to validate indicator kinds and generate types
 * This is the canonical list - all other code should derive from this
 */
export const ALL_INDICATOR_KINDS = INDICATOR_MANIFESTS.map(m => m.id) as readonly [
  "sma", "ema", "smma", "wma", "dema", "tema", "hma", "kama", "vwma", "mcginley", "alma", "lsma", "maribbon", "maribbon4", "sar", "supertrend", "ichimoku",
  "rsi", "macd", "ao", "stoch", "stochrsi", "cci", "roc", "mom", "willr", "fisher",
  "bb", "atr", "dc", "kc", "vstop", "chop", "hv", "bbw", "bbtrend", "ulcer", "adx", "dmi", "vortex", "aroon", "aroonosc", "vwap", "avwap", "obv", "mfi", "trix", "tsi", "smii", "smio", "coppock", "cmo", "uo", "cmf", "pvt", "pvi", "nvi", "relvol", "klinger", "volumeDelta", "cvd", "cvi", "adrb", "adr", "adl", "pivotPointsStandard", "pivotPointsHighLow", "zigzag", "autoFib", "env", "median", "linreg",
  "williamsAlligator", "williamsFractals", "rsiDivergence", "knoxvilleDivergence",
  "vrvp", "vpfr", "aavp", "svp", "svphd", "pvp"
];

/**
 * The canonical IndicatorKind type - derived from manifest
 * NEVER duplicate this list anywhere else!
 */
export type IndicatorKind = typeof ALL_INDICATOR_KINDS[number];

/**
 * Type guard to check if a string is a valid indicator kind
 * Returns true only for the 23 known indicator kinds
 */
export function isValidIndicatorKind(kind: unknown): kind is IndicatorKind {
  return typeof kind === "string" && manifestMap.has(kind);
}

export function getIndicatorManifest(id: string): IndicatorManifest | undefined {
  return manifestMap.get(id);
}

export function getAllIndicators(): IndicatorManifest[] {
  return INDICATOR_MANIFESTS;
}

export function getIndicatorsByCategory(category: IndicatorCategory): IndicatorManifest[] {
  return INDICATOR_MANIFESTS.filter(m => m.category === category);
}

export function searchIndicators(query: string): IndicatorManifest[] {
  const q = query.toLowerCase().trim();
  if (!q) return INDICATOR_MANIFESTS;
  return INDICATOR_MANIFESTS.filter(m => 
    m.id.toLowerCase().includes(q) ||
    m.name.toLowerCase().includes(q) ||
    m.shortName.toLowerCase().includes(q) ||
    m.tags.some(t => t.toLowerCase().includes(q)) ||
    m.category.toLowerCase().includes(q)
  );
}

/**
 * Check if an indicator kind requires extended history for TV-level parity.
 * Used to dynamically increase data fetch limit when cumulative indicators (OBV, etc.) are active.
 */
export function indicatorNeedsExtendedHistory(kind: string): boolean {
  const manifest = getIndicatorManifest(kind);
  return manifest?.needsExtendedHistory === true;
}

export function getDefaultInputs(manifest: IndicatorManifest): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  for (const input of manifest.inputs) {
    result[input.key] = input.default;
  }
  return result;
}

export function getOutputColors(manifest: IndicatorManifest): Record<string, string> {
  const result: Record<string, string> = {};
  for (const output of manifest.outputs) {
    result[output.key] = output.defaultColor;
  }
  return result;
}

// ============================================================================
// Category Metadata (for UI)
// ============================================================================

export const CATEGORY_META: Record<IndicatorCategory, { label: string; icon: string }> = {
  "moving-average": { label: "Moving Averages", icon: "📈" },
  "momentum": { label: "Momentum", icon: "⚡" },
  "volatility": { label: "Volatility", icon: "📊" },
  "volume": { label: "Volume", icon: "📦" },
  "trend": { label: "Trend", icon: "📉" },
};

export const CATEGORY_ORDER: IndicatorCategory[] = [
  "moving-average",
  "momentum",
  "volatility",
  "volume",
  "trend",
];
