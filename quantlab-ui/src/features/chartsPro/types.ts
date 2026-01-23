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

export type DrawingKind = "hline" | "vline" | "trend" | "channel" | "rectangle" | "text" | "priceRange" | "dateRange" | "dateAndPriceRange" | "fibRetracement" | "pitchfork";

export interface DrawingStyle {
  color: string;
  width: number;
  dash?: number[] | null;
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

/** Andrew's Pitchfork - 3-point tool with median line and parallel tines */
export interface Pitchfork extends DrawingBase {
  kind: "pitchfork";
  p1: TrendPoint; // Pivot point (origin of median line)
  p2: TrendPoint; // Left tine anchor (forms one side of the base)
  p3: TrendPoint; // Right tine anchor (forms other side of the base)
}

export type Drawing = HLine | VLine | Trend | Channel | Rectangle | TextDrawing | PriceRange | DateRange | DateAndPriceRange | FibRetracement | Pitchfork;

export interface CompareSeriesConfig {
  id: string;
  symbol: string;
  color: string;
  opacity: number; // 0-1
  hidden?: boolean;
}

export type IndicatorKind = "sma" | "ema" | "rsi" | "macd";

export type IndicatorPane = "price" | "separate";

export interface IndicatorBase {
  id: string;
  kind: IndicatorKind;
  pane: IndicatorPane;
  color: string;
  hidden?: boolean;
}

export interface SmaParams {
  period: number;
}

export interface EmaParams {
  period: number;
}

export interface RsiParams {
  period: number;
}

export interface MacdParams {
  fast: number;
  slow: number;
  signal: number;
}

export type IndicatorParams = SmaParams | EmaParams | RsiParams | MacdParams;

export interface SmaIndicator extends IndicatorBase {
  kind: "sma";
  params: SmaParams;
}

export interface EmaIndicator extends IndicatorBase {
  kind: "ema";
  params: EmaParams;
}

export interface RsiIndicator extends IndicatorBase {
  kind: "rsi";
  params: RsiParams;
}

export interface MacdIndicator extends IndicatorBase {
  kind: "macd";
  params: MacdParams;
}

export type IndicatorInstance = SmaIndicator | EmaIndicator | RsiIndicator | MacdIndicator;

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

export function defaultIndicatorParams(kind: IndicatorKind): IndicatorParams {
  switch (kind) {
    case "ema":
    case "sma":
      return { period: 20 };
    case "rsi":
      return { period: 14 };
    case "macd":
      return { fast: 12, slow: 26, signal: 9 };
    default:
      return { period: 20 };
  }
}

const INDICATOR_LABELS: Record<IndicatorKind, string> = {
  sma: "SMA",
  ema: "EMA",
  rsi: "RSI",
  macd: "MACD",
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
  switch (indicator.kind) {
    case "ema":
    case "sma":
      return `${name}(${indicator.params.period})`;
    case "rsi":
      return `${name}(${indicator.params.period})`;
    case "macd":
      return `${name}(${indicator.params.fast},${indicator.params.slow},${indicator.params.signal})`;
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
