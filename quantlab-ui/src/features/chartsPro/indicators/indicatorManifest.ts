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

export type OutputStyle = "line" | "histogram" | "area" | "band";

export type PanePolicy = "overlay" | "separate";

export interface InputDef {
  key: string;
  label: string;
  type: "number" | "select" | "color";
  default: number | string;
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
}

// ============================================================================
// TV-Style Colors (TradingView defaults)
// ============================================================================

export const TV_COLORS = {
  blue: "#2962FF",
  orange: "#FF6D00",
  purple: "#9C27B0",
  teal: "#00BCD4",
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
      { key: "sma", label: "SMA", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 2 },
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
      { key: "ema", label: "EMA", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 2 },
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
      { key: "period", label: "Period", type: "number", default: 14, min: 1, max: 100 },
      { key: "overbought", label: "Overbought", type: "number", default: 70, min: 50, max: 100 },
      { key: "oversold", label: "Oversold", type: "number", default: 30, min: 0, max: 50 },
    ],
    outputs: [
      { key: "rsi", label: "RSI", style: "line", defaultColor: TV_COLORS.purple, defaultLineWidth: 2 },
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
      { key: "fast", label: "Fast Length", type: "number", default: 12, min: 1, max: 100 },
      { key: "slow", label: "Slow Length", type: "number", default: 26, min: 1, max: 200 },
      { key: "signal", label: "Signal", type: "number", default: 9, min: 1, max: 50 },
    ],
    outputs: [
      { key: "macd", label: "MACD", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 2 },
      { key: "signal", label: "Signal", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 1 },
      { key: "histogram", label: "Histogram", style: "histogram", defaultColor: TV_COLORS.teal },
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
      { key: "period", label: "Period", type: "number", default: 20, min: 1, max: 200 },
      { key: "stdDev", label: "Std Dev", type: "number", default: 2, min: 0.1, max: 5, step: 0.1 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
      ]},
    ],
    outputs: [
      { key: "upper", label: "Upper", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1, bandPair: "lower" },
      { key: "middle", label: "Middle", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1 },
      { key: "lower", label: "Lower", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 1, bandPair: "upper" },
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
      { key: "period", label: "Period", type: "number", default: 14, min: 1, max: 100 },
    ],
    outputs: [
      { key: "atr", label: "ATR", style: "line", defaultColor: TV_COLORS.teal, defaultLineWidth: 2 },
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
    tags: ["overlay", "intraday", "institutional"],
    description: "Average price weighted by volume - key institutional level",
    panePolicy: "overlay",
    inputs: [
      { key: "anchorPeriod", label: "Anchor", type: "select", default: "session", options: [
        { value: "session", label: "Session" },
        { value: "week", label: "Week" },
        { value: "month", label: "Month" },
      ]},
    ],
    outputs: [
      { key: "vwap", label: "VWAP", style: "line", defaultColor: TV_COLORS.purple, defaultLineWidth: 2 },
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
    inputs: [],
    outputs: [
      { key: "obv", label: "OBV", style: "line", defaultColor: TV_COLORS.teal, defaultLineWidth: 2 },
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
      { key: "kPeriod", label: "%K Period", type: "number", default: 14, min: 1, max: 100 },
      { key: "kSmooth", label: "%K Smooth", type: "number", default: 1, min: 1, max: 10 },
      { key: "dSmooth", label: "%D Smooth", type: "number", default: 3, min: 1, max: 10 },
    ],
    outputs: [
      { key: "k", label: "%K", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 2 },
      { key: "d", label: "%D", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 1 },
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
      { key: "rsiPeriod", label: "RSI Period", type: "number", default: 14, min: 1, max: 100 },
      { key: "stochPeriod", label: "Stoch Period", type: "number", default: 14, min: 1, max: 100 },
      { key: "kSmooth", label: "%K Smooth", type: "number", default: 3, min: 1, max: 10 },
      { key: "dSmooth", label: "%D Smooth", type: "number", default: 3, min: 1, max: 10 },
    ],
    outputs: [
      { key: "k", label: "%K", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 2 },
      { key: "d", label: "%D", style: "line", defaultColor: TV_COLORS.orange, defaultLineWidth: 1 },
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
      { key: "period", label: "Period", type: "number", default: 20, min: 1, max: 200 },
    ],
    outputs: [
      { key: "cci", label: "CCI", style: "line", defaultColor: TV_COLORS.teal, defaultLineWidth: 2 },
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
      { key: "period", label: "Period", type: "number", default: 9, min: 1, max: 100 },
      { key: "source", label: "Source", type: "select", default: "close", options: [
        { value: "close", label: "Close" },
        { value: "open", label: "Open" },
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
      ]},
    ],
    outputs: [
      { key: "roc", label: "ROC", style: "line", defaultColor: TV_COLORS.blue, defaultLineWidth: 2 },
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
      { key: "period", label: "Period", type: "number", default: 14, min: 1, max: 100 },
    ],
    outputs: [
      { key: "willr", label: "%R", style: "line", defaultColor: TV_COLORS.purple, defaultLineWidth: 2 },
    ],
  },
];

// ============================================================================
// Registry Helpers
// ============================================================================

const manifestMap = new Map<string, IndicatorManifest>(
  INDICATOR_MANIFESTS.map(m => [m.id, m])
);

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
    m.name.toLowerCase().includes(q) ||
    m.shortName.toLowerCase().includes(q) ||
    m.tags.some(t => t.toLowerCase().includes(q)) ||
    m.category.toLowerCase().includes(q)
  );
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
