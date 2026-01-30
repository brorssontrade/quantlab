import type { UTCTimestamp } from "@/lib/lightweightCharts";

export type EpochMs = number;

export type ChartThemeName = "light" | "dark";

export type Tf = "1m" | "5m" | "15m" | "1h" | "4h" | "1D" | "1W";

export interface RawOhlcvRow {
  t?: string | number;
  ts?: string | number;
  time?: string | number;
  o?: number | string;
  open?: number | string;
  h?: number | string;
  high?: number | string;
  l?: number | string;
  low?: number | string;
  c?: number | string;
  close?: number | string;
  v?: number | string;
  volume?: number | string;
}

export interface NormalizedBar {
  time: UTCTimestamp;
  timestampMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  direction: "up" | "down" | "flat";
}

export interface ChartMeta {
  source?: string;
  fallback?: boolean;
  tz?: string;
  cache?: string;
}

export interface OhlcvResponse {
  rows?: RawOhlcvRow[];
  meta?: Record<string, unknown>;
}

export type DrawingKind = "hline" | "vline" | "trend" | "ray" | "extendedLine" | "channel" | "rectangle" | "circle" | "ellipse" | "triangle" | "callout" | "note" | "text" | "priceRange" | "dateRange" | "dateAndPriceRange" | "fibRetracement" | "fibExtension" | "fibFan" | "pitchfork" | "schiffPitchfork" | "modifiedSchiffPitchfork" | "flatTopChannel" | "flatBottomChannel" | "regressionTrend" | "longPosition" | "shortPosition" | "abcd" | "headAndShoulders" | "elliottWave";

/** Line extension mode for trend-like drawings */
export type LineMode = "segment" | "ray" | "extended";

export interface DrawingStyle {
  color: string;
  width: number;
  dash?: number[] | null;
  /** TV-30.2a: Stroke opacity 0-1, default 1 (fully opaque) */
  opacity?: number;
}

export interface DrawingBase {
  id: string;
  kind: DrawingKind;
  symbol: string;
  tf: Tf;
  createdAt: number;
  updatedAt: number;
  locked?: boolean;
  hidden?: boolean;
  label?: string;
  style?: DrawingStyle;
  z: number;
}

export interface HLine extends DrawingBase {
  kind: "hline";
  price: number;
}

export interface VLine extends DrawingBase {
  kind: "vline";
  timeMs: number;
}

export interface TrendPoint {
  timeMs: number;
  price: number;
}

export interface Trend extends DrawingBase {
  kind: "trend";
  p1: TrendPoint;
  p2: TrendPoint;
  showSlope?: boolean;
  /** TV-24: Line extension mode - "segment" (default), "ray" (p1→∞), "extended" (∞←p1-p2→∞) */
  lineMode?: LineMode;
}

/** Ray - line extending from p1 through p2 to infinity (TV-24) */
export interface Ray extends DrawingBase {
  kind: "ray";
  p1: TrendPoint;
  p2: TrendPoint;
  showSlope?: boolean;
}

/** Extended Line - line extending infinitely in both directions through p1 and p2 (TV-24) */
export interface ExtendedLine extends DrawingBase {
  kind: "extendedLine";
  p1: TrendPoint;
  p2: TrendPoint;
  showSlope?: boolean;
}

/** Parallel Channel - 3-point definition (p1-p2 = baseline, p3 = parallel offset) */
export interface Channel extends DrawingBase {
  kind: "channel";
  p1: TrendPoint; // Baseline start
  p2: TrendPoint; // Baseline end
  p3: TrendPoint; // Offset point defining parallel distance (projects perpendicular to baseline)
}

/** Rectangle zone - two corners define the box */
export interface Rectangle extends DrawingBase {
  kind: "rectangle";
  p1: TrendPoint; // top-left or start corner
  p2: TrendPoint; // bottom-right or end corner
  fillColor?: string;
  fillOpacity?: number; // 0-1, default 0.1
}

/** Text annotation at a specific chart point */
export interface TextDrawing extends DrawingBase {
  kind: "text";
  anchor: TrendPoint; // Position where text is placed
  content: string; // The text content
  fontSize?: number; // Default 12
  fontColor?: string; // Default theme text color
  backgroundColor?: string; // Optional background
}

/** Price Range measurement - two points showing Δprice and Δ% */
export interface PriceRange extends DrawingBase {
  kind: "priceRange";
  p1: TrendPoint; // Start point
  p2: TrendPoint; // End point
}

/** Date Range measurement - two points showing bars count and time span */
export interface DateRange extends DrawingBase {
  kind: "dateRange";
  p1: TrendPoint; // Start point (time + price for positioning)
  p2: TrendPoint; // End point
}

/** Date & Price Range measurement - combined tool showing both time and price deltas */
export interface DateAndPriceRange extends DrawingBase {
  kind: "dateAndPriceRange";
  p1: TrendPoint; // Start point
  p2: TrendPoint; // End point
}

/** Fibonacci Retracement - key levels between two price points */
export interface FibRetracement extends DrawingBase {
  kind: "fibRetracement";
  p1: TrendPoint; // Start point (usually swing low/high)
  p2: TrendPoint; // End point (usually swing high/low)
}

/** Standard Fibonacci ratios for retracement levels */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618] as const;

/** Standard Fibonacci Extension ratios (projected from p3 based on p1→p2 delta) */
export const FIB_EXTENSION_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2, 2.618, 3.618, 4.236] as const;

/** Standard Fibonacci Fan ratios (rays from anchor through ratio-scaled points) */
export const FIB_FAN_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786] as const;

/** Fibonacci Extension - 3 points: p1→p2 defines impulse, p3 is retracement anchor for projection */
export interface FibExtension extends DrawingBase {
  kind: "fibExtension";
  p1: TrendPoint; // Start of impulse move (e.g., swing low)
  p2: TrendPoint; // End of impulse move (e.g., swing high)
  p3: TrendPoint; // Retracement anchor (starting point for extension projection)
}

/** Fibonacci Fan - 2 points: rays emanate from p1 through ratio-scaled positions at p2.time */
export interface FibFan extends DrawingBase {
  kind: "fibFan";
  p1: TrendPoint; // Fan anchor (all rays originate here)
  p2: TrendPoint; // End point (defines the time and base price delta for ratio calculations)
}

/** Andrew's Pitchfork - 3-point tool with median line and parallel tines */
export interface Pitchfork extends DrawingBase {
  kind: "pitchfork";
  p1: TrendPoint; // Pivot point (origin of median line)
  p2: TrendPoint; // Left tine anchor (forms one side of the base)
  p3: TrendPoint; // Right tine anchor (forms other side of the base)
}

/** Schiff Pitchfork - median line starts from midpoint between p1 and base midpoint */
export interface SchiffPitchfork extends DrawingBase {
  kind: "schiffPitchfork";
  p1: TrendPoint; // Original pivot point (used to compute Schiff-shifted anchor)
  p2: TrendPoint; // Left tine anchor
  p3: TrendPoint; // Right tine anchor
}

/** Modified Schiff Pitchfork - median line starts at midpoint X, original p1 Y */
export interface ModifiedSchiffPitchfork extends DrawingBase {
  kind: "modifiedSchiffPitchfork";
  p1: TrendPoint; // Original pivot point (Y used, X shifted to midpoint)
  p2: TrendPoint; // Left tine anchor
  p3: TrendPoint; // Right tine anchor
}

/** Flat Top Channel - 3-point: p1→p2 trend baseline, p3 defines horizontal top */
export interface FlatTopChannel extends DrawingBase {
  kind: "flatTopChannel";
  p1: TrendPoint; // Trend baseline start
  p2: TrendPoint; // Trend baseline end
  p3: TrendPoint; // Point defining horizontal top level (y determines flat top price)
}

/** Flat Bottom Channel - 3-point: p1→p2 trend baseline, p3 defines horizontal bottom */
export interface FlatBottomChannel extends DrawingBase {
  kind: "flatBottomChannel";
  p1: TrendPoint; // Trend baseline start
  p2: TrendPoint; // Trend baseline end
  p3: TrendPoint; // Point defining horizontal bottom level (y determines flat bottom price)
}

/** Regression Trend Channel - 2-point: p1→p2 defines time window for linear regression
 * The regression is calculated on bars within [p1.timeMs, p2.timeMs] and displayed
 * as regression line ± k×stdev (standard deviation) bands */
export interface RegressionTrend extends DrawingBase {
  kind: "regressionTrend";
  p1: TrendPoint; // Start of regression window
  p2: TrendPoint; // End of regression window
}

/** Long Position - 3-point risk/reward visualization (TradingView-style)
 * p1 = Entry, p2 = Stop Loss, p3 = Take Profit
 * Shows green profit zone, red risk zone, and R:R ratio */
export interface LongPosition extends DrawingBase {
  kind: "longPosition";
  p1: TrendPoint; // Entry point (price level where you enter)
  p2: TrendPoint; // Stop Loss (below entry for long)
  p3: TrendPoint; // Take Profit (above entry for long)
}

/** Short Position - 3-point risk/reward visualization (TradingView-style)
 * p1 = Entry, p2 = Stop Loss, p3 = Take Profit
 * Inverted from Long: stop above entry, target below entry */
export interface ShortPosition extends DrawingBase {
  kind: "shortPosition";
  p1: TrendPoint; // Entry point (price level where you enter short)
  p2: TrendPoint; // Stop Loss (above entry for short)
  p3: TrendPoint; // Take Profit (below entry for short)
}

/** ABCD Pattern - 4-point harmonic pattern (TV-31)
 * 3-click workflow: A → B → C, then D is computed as AB projection from C
 * The "AB=CD" relationship: distance A→B equals distance C→D
 * p1 = A (first swing point)
 * p2 = B (second swing point - retracement of A)
 * p3 = C (third swing point - retracement of B)
 * p4 = D (computed: C + (B - A) for bullish, C - (A - B) for bearish)
 * Pattern is bullish if A < B (zigzag up), bearish if A > B (zigzag down)
 */
export interface ABCDPattern extends DrawingBase {
  kind: "abcd";
  p1: TrendPoint; // Point A - first swing
  p2: TrendPoint; // Point B - second swing
  p3: TrendPoint; // Point C - third swing (user-placed)
  p4: TrendPoint; // Point D - fourth swing (computed from AB=CD)
}

/** Head and Shoulders Pattern - 5-point reversal pattern (TV-32)
 * 5-click workflow: LS → Head → RS → NL1 → NL2
 * Classic reversal pattern with three peaks and neckline
 * p1 = Left Shoulder peak
 * p2 = Head peak (highest point)
 * p3 = Right Shoulder peak
 * p4 = Neckline point 1 (typically at left trough)
 * p5 = Neckline point 2 (typically at right trough)
 * Pattern is bearish (top) if Head > LS/RS, bullish (bottom/inverse) if Head < LS/RS
 */
export interface HeadAndShouldersPattern extends DrawingBase {
  kind: "headAndShoulders";
  p1: TrendPoint; // Left Shoulder (LS)
  p2: TrendPoint; // Head (H)
  p3: TrendPoint; // Right Shoulder (RS)
  p4: TrendPoint; // Neckline point 1 (NL1)
  p5: TrendPoint; // Neckline point 2 (NL2)
  /** Whether this is an inverse (bottom) pattern - computed from geometry */
  inverse?: boolean;
}

/** Elliott Wave Impulse Pattern - 6-point impulse wave structure (TV-33)
 * 6-click workflow: 0 → 1 → 2 → 3 → 4 → 5
 * Impulse wave follows Elliott Wave theory:
 * - Wave 1: Initial trend move (0→1)
 * - Wave 2: Retracement, cannot retrace below wave 0 (1→2)
 * - Wave 3: Strongest, longest wave (2→3), cannot be shortest
 * - Wave 4: Retracement, cannot overlap wave 1 territory (3→4)
 * - Wave 5: Final push in trend direction (4→5)
 * 
 * Pattern is bullish if p1 > p0 (upward impulse)
 * Pattern is bearish if p1 < p0 (downward impulse)
 */
export interface ElliottWaveImpulsePattern extends DrawingBase {
  kind: "elliottWave";
  p0: TrendPoint; // Wave 0 - origin point
  p1: TrendPoint; // Wave 1 - end of impulse wave 1
  p2: TrendPoint; // Wave 2 - end of corrective wave 2
  p3: TrendPoint; // Wave 3 - end of impulse wave 3
  p4: TrendPoint; // Wave 4 - end of corrective wave 4
  p5: TrendPoint; // Wave 5 - end of impulse wave 5
  /** Computed: direction of the impulse (bullish = up, bearish = down) */
  direction?: "bullish" | "bearish";
}

/** Circle shape - center point and radius point define the circle
 * p1 = center, p2 = edge point (radius = distance from p1 to p2) */
export interface Circle extends DrawingBase {
  kind: "circle";
  p1: TrendPoint; // Center point
  p2: TrendPoint; // Edge point (defines radius)
  fillColor?: string;
  fillOpacity?: number; // 0-1, default 0.1
}

/** Ellipse shape - center point and two radius points (horizontal and vertical)
 * p1 = center, p2 = edge point (bounding box corner) */
export interface Ellipse extends DrawingBase {
  kind: "ellipse";
  p1: TrendPoint; // Center point
  p2: TrendPoint; // Bounding box corner (defines radiusX and radiusY)
  fillColor?: string;
  fillOpacity?: number; // 0-1, default 0.1
}

/** Triangle shape - 3 vertices define the triangle (TV-25.3)
 * p1, p2, p3 are the three corner points
 * 3-click workflow: click p1 → click p2 → click p3 → commit */
export interface Triangle extends DrawingBase {
  kind: "triangle";
  p1: TrendPoint; // First vertex
  p2: TrendPoint; // Second vertex
  p3: TrendPoint; // Third vertex
  fillColor?: string;
  fillOpacity?: number; // 0-1, default 0.1
}

/** Callout annotation - anchor point with leader line to text box (TV-26)
 * anchor = point on chart being annotated
 * box = position of text box (determines leader line endpoint)
 * 2-click workflow: click anchor → click box → text modal opens */
export interface Callout extends DrawingBase {
  kind: "callout";
  anchor: TrendPoint; // Point being annotated (leader line starts here)
  box: TrendPoint; // Text box position (leader line ends here)
  text: string; // The annotation text content
  fontSize?: number; // Default 12
  fontColor?: string; // Default theme text color
  backgroundColor?: string; // Box background color
  borderColor?: string; // Box border color
}

/** Note annotation - sticky note without leader line (TV-27)
 * anchor = position of note on chart
 * 1-click workflow: click anchor → text modal opens
 * Simpler than Callout: no leader line, just a positioned note */
export interface Note extends DrawingBase {
  kind: "note";
  anchor: TrendPoint; // Position of the note
  text: string; // The note text content
  fontSize?: number; // Default 12
  fontColor?: string; // Default theme text color
  backgroundColor?: string; // Note background color (default: yellow sticky note)
  borderColor?: string; // Note border color
}

export type Drawing = HLine | VLine | Trend | Ray | ExtendedLine | Channel | Rectangle | Circle | Ellipse | Triangle | Callout | Note | TextDrawing | PriceRange | DateRange | DateAndPriceRange | FibRetracement | FibExtension | FibFan | Pitchfork | SchiffPitchfork | ModifiedSchiffPitchfork | FlatTopChannel | FlatBottomChannel | RegressionTrend | LongPosition | ShortPosition | ABCDPattern | HeadAndShouldersPattern | ElliottWaveImpulsePattern;

export interface CompareSeriesConfig {
  id: string;
  symbol: string;
  color: string;
  opacity: number; // 0-1
  hidden?: boolean;
}

// PRIO 3: Extended indicator kinds
export type IndicatorKind = "sma" | "ema" | "rsi" | "macd" | "bb" | "atr" | "adx" | "vwap" | "obv";

export type IndicatorPane = "price" | "separate";

export interface IndicatorBase {
  id: string;
  kind: IndicatorKind;
  pane: IndicatorPane;
  color: string;
  hidden?: boolean;
  // PRIO 3: Generic params - allows any indicator-specific params
  params: Record<string, number | string>;
}

// Legacy specific param interfaces (kept for backwards compatibility)
export interface SmaParams {
  period: number;
  source?: string;
}

export interface EmaParams {
  period: number;
  source?: string;
}

export interface RsiParams {
  period: number;
}

export interface MacdParams {
  fast: number;
  slow: number;
  signal: number;
}

export interface BbParams {
  period: number;
  stdDev: number;
  source?: string;
}

export interface AtrParams {
  period: number;
}

export interface AdxParams {
  period: number;
  smoothing: number;
}

export interface VwapParams {
  anchorPeriod: "session" | "week" | "month";
}

export interface ObvParams {
  // OBV has no params
}

export type IndicatorParams = SmaParams | EmaParams | RsiParams | MacdParams | BbParams | AtrParams | AdxParams | VwapParams | ObvParams;

// PRIO 3: Simplified IndicatorInstance using generic params
export type IndicatorInstance = IndicatorBase;

// Legacy specific indicator types (kept for backwards compatibility)
export interface SmaIndicator extends Omit<IndicatorBase, "params"> {
  kind: "sma";
  params: SmaParams;
}

export interface EmaIndicator extends Omit<IndicatorBase, "params"> {
  kind: "ema";
  params: EmaParams;
}

export interface RsiIndicator extends Omit<IndicatorBase, "params"> {
  kind: "rsi";
  params: RsiParams;
}

export interface MacdIndicator extends Omit<IndicatorBase, "params"> {
  kind: "macd";
  params: MacdParams;
}

export const tsMsToUtc = (ts: EpochMs): UTCTimestamp => Math.floor(ts / 1000) as UTCTimestamp;

export function normalizeRows(rows: RawOhlcvRow[] | undefined | null): NormalizedBar[] {
  if (!Array.isArray(rows)) return [];
  const normalized: NormalizedBar[] = [];
  for (const row of rows) {
    const parsed = normalizeRow(row);
    if (parsed) normalized.push(parsed);
  }
  return normalized;
}

function normalizeRow(row: RawOhlcvRow | undefined | null): NormalizedBar | null {
  if (!row) return null;
  const ts = toTimestamp(row.ts ?? row.t ?? row.time);
  if (!ts) return null;
  const open = toNumber(row.open ?? row.o);
  const high = toNumber(row.high ?? row.h);
  const low = toNumber(row.low ?? row.l);
  const close = toNumber(row.close ?? row.c);
  const volume = toNumber(row.volume ?? row.v);
  if ([open, high, low, close, volume].some((value) => value === null)) {
    return null;
  }
  const direction: NormalizedBar["direction"] =
    close! > open! ? "up" : close! < open! ? "down" : "flat";
  return {
    time: ts.time,
    timestampMs: ts.timestampMs,
    open: open!,
    high: high!,
    low: low!,
    close: close!,
    volume: volume!,
    direction,
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

export function toTimestamp(value: unknown): { time: UTCTimestamp; timestampMs: number } | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    return {
      timestampMs: Math.floor(millis),
      time: Math.floor(millis / 1000) as UTCTimestamp,
    };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return toTimestamp(numeric);
    }
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) return null;
    return {
      timestampMs: parsed,
      time: Math.floor(parsed / 1000) as UTCTimestamp,
    };
  }
  return null;
}

export function timeframeDurationMs(tf: Tf): number {
  switch (tf) {
    case "1m":
      return 60_000;
    case "5m":
      return 5 * 60_000;
    case "15m":
      return 15 * 60_000;
    case "1h":
      return 60 * 60_000;
    case "4h":
      return 4 * 60 * 60_000;
    case "1W":
      return 7 * 24 * 60 * 60_000;
    case "1D":
    default:
      return 24 * 60 * 60_000;
  }
}

export function slopePricePerBar(trend: Trend, tf: Tf): number {
  const duration = timeframeDurationMs(tf);
  const bars = Math.max(1, Math.abs(trend.p2.timeMs - trend.p1.timeMs) / duration);
  return (trend.p2.price - trend.p1.price) / bars;
}

export function slopePercentPerBar(trend: Trend, tf: Tf): number {
  const pricePerBar = slopePricePerBar(trend, tf);
  if (trend.p1.price === 0) return 0;
  return (pricePerBar / trend.p1.price) * 100;
}

export function defaultIndicatorParams(kind: IndicatorKind): Record<string, number | string> {
  switch (kind) {
    case "ema":
    case "sma":
      return { period: 20, source: "close" };
    case "rsi":
      return { period: 14 };
    case "macd":
      return { fast: 12, slow: 26, signal: 9 };
    case "bb":
      return { period: 20, stdDev: 2, source: "close" };
    case "atr":
      return { period: 14 };
    case "adx":
      return { period: 14, smoothing: 14 };
    case "vwap":
      return { anchorPeriod: "session" };
    case "obv":
      return {};
    default:
      return { period: 20 };
  }
}

const INDICATOR_LABELS: Record<IndicatorKind, string> = {
  sma: "SMA",
  ema: "EMA",
  rsi: "RSI",
  macd: "MACD",
  bb: "BB",
  atr: "ATR",
  adx: "ADX",
  vwap: "VWAP",
  obv: "OBV",
};

export function indicatorDisplayName(kind: IndicatorKind) {
  return INDICATOR_LABELS[kind] ?? kind.toUpperCase();
}

/**
 * Generate a human-readable summary of an indicator's parameters.
 * E.g. "EMA(20)", "RSI(14)", "MACD(12,26,9)"
 */
export function indicatorParamsSummary(indicator: IndicatorInstance): string {
  const name = indicatorDisplayName(indicator.kind);
  const params = indicator.params;
  switch (indicator.kind) {
    case "ema":
    case "sma":
      return `${name}(${params.period ?? 20})`;
    case "rsi":
      return `${name}(${params.period ?? 14})`;
    case "macd":
      return `${name}(${params.fast ?? 12},${params.slow ?? 26},${params.signal ?? 9})`;
    case "bb":
      return `${name}(${params.period ?? 20},${params.stdDev ?? 2})`;
    case "atr":
      return `${name}(${params.period ?? 14})`;
    case "adx":
      return `${name}(${params.period ?? 14})`;
    case "vwap":
      return name;
    case "obv":
      return name;
    default:
      return name;
  }
}

export function describeTrend(trend: Trend, tf: Tf) {
  const delta = trend.p2.price - trend.p1.price;
  const pct = trend.p1.price === 0 ? 0 : (delta / trend.p1.price) * 100;
  const duration = timeframeDurationMs(tf);
  const bars = Math.max(1, Math.round(Math.abs(trend.p2.timeMs - trend.p1.timeMs) / duration));
  const pctLabel = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  const priceLabel = `${delta >= 0 ? "+" : "-"}$${Math.abs(delta).toFixed(2)}`;
  const label = `${pctLabel} / ${bars} ${bars === 1 ? "bar" : "bars"} (delta ${priceLabel})`;
  return {
    delta,
    pct,
    bars,
    label,
  };
}
