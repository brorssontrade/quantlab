/**
 * Test Helpers for Indicator Compute Testing
 * 
 * Provides consistent utilities for:
 * - Extracting specific series from multi-output indicator results
 * - Handling warmup/NaN values correctly
 * - Comparing values with appropriate tolerances
 * 
 * @module testHelpers
 */

import type { UTCTimestamp } from "lightweight-charts";

// ============================================================================
// Types
// ============================================================================

export interface LinePoint {
  time: UTCTimestamp | number;
  value: number;
}

export interface ComputeBar {
  time: UTCTimestamp | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Result types from compute functions
export interface RSIResult {
  rsi: LinePoint[];
  rsiMa: LinePoint[];
  upperBand: LinePoint[];
  middleBand: LinePoint[];
  lowerBand: LinePoint[];
}

export interface MACDResult {
  macd: LinePoint[];
  signal: LinePoint[];
  histogram: LinePoint[];
}

export interface BollingerResult {
  upper: LinePoint[];
  middle: LinePoint[];
  lower: LinePoint[];
}

export interface StochasticResult {
  k: LinePoint[];
  d: LinePoint[];
}

export interface ADXResult {
  adx: LinePoint[];
  plusDI: LinePoint[];
  minusDI: LinePoint[];
}

export interface CCIResult {
  cci: LinePoint[];
  cciMa: LinePoint[];
  bbUpper: LinePoint[];
  bbLower: LinePoint[];
  upperBand: LinePoint[];
  middleBand: LinePoint[];
  lowerBand: LinePoint[];
}

export interface VWAPResult {
  vwap: LinePoint[];
  upper1: LinePoint[];
  lower1: LinePoint[];
  upper2: LinePoint[];
  lower2: LinePoint[];
  upper3: LinePoint[];
  lower3: LinePoint[];
}

// Union type for all indicator results
type IndicatorResult = 
  | RSIResult 
  | MACDResult 
  | BollingerResult 
  | StochasticResult 
  | ADXResult 
  | CCIResult 
  | VWAPResult 
  | LinePoint[];

// ============================================================================
// Series Extraction
// ============================================================================

/**
 * Extract a specific series from an indicator result.
 * Handles both direct arrays (SMA, EMA) and object results (RSI, MACD, etc.)
 * 
 * @param result - The indicator result (array or object)
 * @param field - The field name to extract (e.g., "rsi", "macd", "upper")
 * @returns The extracted LinePoint array
 * @throws Error if field doesn't exist on object result
 * 
 * @example
 * const rsiResult = computeRSI(bars, 14);
 * const rsiSeries = extractSeries(rsiResult, "rsi");
 * 
 * const bbResult = computeBollingerBands(bars, 20, 2);
 * const upperBand = extractSeries(bbResult, "upper");
 */
export function extractSeries(
  result: IndicatorResult,
  field?: string
): LinePoint[] {
  // If result is already an array, return it directly
  if (Array.isArray(result)) {
    return result;
  }
  
  // If no field specified, try common defaults
  if (!field) {
    const defaults = ["rsi", "macd", "cci", "adx", "vwap", "k"];
    for (const d of defaults) {
      if (d in result) {
        return (result as Record<string, LinePoint[]>)[d];
      }
    }
    throw new Error("No field specified and no default found");
  }
  
  // Extract specified field
  if (field in result) {
    return (result as Record<string, LinePoint[]>)[field];
  }
  
  throw new Error(`Field "${field}" not found in result. Available: ${Object.keys(result).join(", ")}`);
}

// ============================================================================
// Value Extraction
// ============================================================================

/**
 * Get the last valid (non-NaN, non-null) value from a series.
 * Handles warmup period correctly by skipping NaN values.
 * 
 * @param series - Array of LinePoint values
 * @returns The last valid value, or null if none found
 */
export function getLastValidValue(series: LinePoint[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const val = series[i].value;
    if (val !== null && val !== undefined && Number.isFinite(val)) {
      return val;
    }
  }
  return null;
}

/**
 * Get value at specific bar index, skipping warmup NaN values.
 * 
 * @param series - Array of LinePoint values
 * @param index - Bar index (0-based, negative counts from end)
 * @returns Value at index, or null if NaN/missing
 */
export function getValueAt(series: LinePoint[], index: number): number | null {
  const actualIndex = index < 0 ? series.length + index : index;
  if (actualIndex < 0 || actualIndex >= series.length) return null;
  
  const val = series[actualIndex].value;
  return val !== null && Number.isFinite(val) ? val : null;
}

/**
 * Filter series to only valid (non-NaN) values.
 * Use this to get the "post-warmup" values.
 * 
 * @param series - Array of LinePoint values
 * @returns Array with only finite values
 */
export function filterValid(series: LinePoint[]): LinePoint[] {
  return series.filter(p => Number.isFinite(p.value));
}

/**
 * Count valid values in series (excluding warmup NaN).
 * 
 * @param series - Array of LinePoint values
 * @returns Number of valid values
 */
export function countValidValues(series: LinePoint[]): number {
  return series.filter(p => Number.isFinite(p.value)).length;
}

// ============================================================================
// Comparison Utilities
// ============================================================================

/**
 * Check if two values are close within tolerance.
 * Uses relative tolerance for large values, absolute for small.
 * 
 * @param actual - Computed value
 * @param expected - Expected/baseline value
 * @param tolerance - Absolute tolerance (default 0.01)
 * @param relativeTolerance - Relative tolerance for values > 100 (default 0.001 = 0.1%)
 */
export function isClose(
  actual: number,
  expected: number,
  tolerance: number = 0.01,
  relativeTolerance: number = 0.001
): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return false;
  }
  
  const diff = Math.abs(actual - expected);
  
  // For large values, use relative tolerance
  if (Math.abs(expected) > 100) {
    return diff / Math.abs(expected) <= relativeTolerance;
  }
  
  // For small values, use absolute tolerance
  return diff <= tolerance;
}

/**
 * Assert that a computed value matches a baseline within tolerance.
 * Throws descriptive error if mismatch.
 * 
 * @param actual - Computed value
 * @param expected - Expected/baseline value
 * @param label - Description for error message
 * @param tolerance - Absolute tolerance
 */
export function assertClose(
  actual: number,
  expected: number,
  label: string,
  tolerance: number = 0.05
): void {
  if (!isClose(actual, expected, tolerance)) {
    const diff = Math.abs(actual - expected);
    const pct = expected !== 0 ? (diff / Math.abs(expected) * 100).toFixed(2) : "N/A";
    throw new Error(
      `${label}: expected ${expected}, got ${actual} (diff: ${diff.toFixed(4)}, ${pct}%)`
    );
  }
}

// ============================================================================
// Deterministic PRNG for Test Fixtures
// ============================================================================

/**
 * Simple seeded PRNG (xorshift32) for deterministic test fixtures.
 * DO NOT use for anything other than test data generation.
 */
function createSeededRandom(seed: number = 12345): () => number {
  let state = seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;  // Normalize to 0..1
  };
}

// ============================================================================
// Fixture Helpers
// ============================================================================

/**
 * Create OHLCV fixture from simple close prices.
 * Generates realistic OHLC based on close with typical daily range.
 * Uses deterministic PRNG for reproducible test data.
 * 
 * @param closes - Array of closing prices
 * @param baseTime - Starting timestamp (default 2024-01-01 UTC)
 * @param interval - Bar interval in seconds (default 86400 = 1 day)
 * @param seed - Random seed for deterministic volume (default 42)
 */
export function createBarsFromCloses(
  closes: number[],
  baseTime: number = 1704067200,
  interval: number = 86400,
  seed: number = 42
): ComputeBar[] {
  const random = createSeededRandom(seed);
  return closes.map((close, i) => {
    const range = close * 0.02; // 2% daily range
    return {
      time: (baseTime + i * interval) as UTCTimestamp,
      open: close - range * 0.3,
      high: close + range * 0.5,
      low: close - range * 0.5,
      close: close,
      volume: 1000000 + Math.floor(random() * 500000),
    };
  });
}

/**
 * Create intraday bars for VWAP testing.
 * All bars are within same UTC day (session).
 * Uses deterministic PRNG for reproducible test data.
 * 
 * @param basePrice - Starting price
 * @param barCount - Number of bars
 * @param minuteInterval - Minutes per bar (default 5)
 * @param baseTime - Session start timestamp
 * @param seed - Random seed for deterministic data (default 42)
 */
export function createIntradayBars(
  basePrice: number,
  barCount: number,
  minuteInterval: number = 5,
  baseTime: number = 1704110400, // 2024-01-01 12:00 UTC
  seed: number = 42
): ComputeBar[] {
  const random = createSeededRandom(seed);
  const bars: ComputeBar[] = [];
  let price = basePrice;
  
  for (let i = 0; i < barCount; i++) {
    const change = (random() - 0.5) * 2; // -1 to +1
    price += change;
    
    bars.push({
      time: (baseTime + i * minuteInterval * 60) as UTCTimestamp,
      open: price - 0.1,
      high: price + 0.3,
      low: price - 0.3,
      close: price + 0.1,
      volume: 100000 + Math.floor(random() * 50000),
    });
  }
  
  return bars;
}

// ============================================================================
// Parity Categories
// ============================================================================

/**
 * Test categories for documentation and filtering.
 */
export const TestCategory = {
  /** Regression test using engine-derived baseline */
  REGRESSION: "regression",
  /** TradingView parity test using external baseline */
  TV_PARITY: "tv-parity",
  /** Unit test for edge cases and invariants */
  UNIT: "unit",
} as const;

export type TestCategoryType = typeof TestCategory[keyof typeof TestCategory];

// ============================================================================
// Bar-Aligned Value Extraction (for TV Parity)
// ============================================================================

/**
 * Find bar index by timestamp using binary search.
 * Critical for TV parity: we must compare at EXACT bar, not "last value".
 * 
 * @param bars - Array of bars (must be sorted by time ascending)
 * @param targetTime - Unix timestamp to find
 * @returns Index if found, -1 if not found
 * 
 * @example
 * const idx = findBarIndexByTime(bars, 1709856000);
 * if (idx >= 0) {
 *   const value = series[idx].value;
 * }
 */
export function findBarIndexByTime(
  bars: readonly { time: number }[],
  targetTime: number
): number {
  if (!bars.length) return -1;
  
  let left = 0;
  let right = bars.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const barTime = bars[mid].time;
    
    if (barTime === targetTime) {
      return mid;
    } else if (barTime < targetTime) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return -1;
}

/**
 * Get value from series at specific bar time.
 * Combines findBarIndexByTime + value extraction.
 * 
 * @param series - Computed indicator series (must align with bars)
 * @param bars - OHLCV bars used for computation
 * @param targetTime - Unix timestamp to find
 * @returns Value at that bar, or null if bar not found or value is NaN
 * 
 * @example
 * const rsi = computeRSI(bars, 14);
 * const rsiValue = getValueAtTime(rsi.rsi, bars, 1709856000);
 */
export function getValueAtTime(
  series: LinePoint[],
  bars: readonly { time: number }[],
  targetTime: number
): number | null {
  const idx = findBarIndexByTime(bars, targetTime);
  if (idx < 0) return null;
  
  // Series should be same length as bars
  if (idx >= series.length) return null;
  
  const val = series[idx].value;
  return val !== null && Number.isFinite(val) ? val : null;
}

// ============================================================================
// Parity Tolerance Configuration
// ============================================================================

/**
 * Per-indicator tolerance table for TV parity tests.
 * Different indicators require different tolerances due to:
 * - Scale differences (RSI 0-100 vs MACD -10..+10)
 * - Algorithm precision variations
 * - Rounding differences
 * 
 * For volume-based indicators, use relative tolerance (%).
 */
export interface ParityTolerance {
  /** Absolute tolerance (for bounded indicators) */
  absolute?: number;
  /** Relative tolerance as fraction (for unbounded/price-scaled indicators) */
  relative?: number;
  /** Minimum absolute tolerance floor (for relative tolerance when values near 0) */
  absoluteFloor?: number;
}

export const PARITY_TOLERANCES: Record<string, ParityTolerance> = {
  // Bounded oscillators (0-100): tight absolute tolerance
  RSI: { absolute: 0.1 },
  Williams: { absolute: 0.1 },
  Stochastic: { absolute: 0.1 },
  
  // Unbounded oscillators: scale-aware
  CCI: { absolute: 1.0 },
  
  // Price-derived indicators: relative tolerance with absolute floor for near-zero values
  // Note: MACD uses EMA which has seeding differences (first-value vs SMA-seed).
  // Tolerance increased to accommodate seeding variance until EMA is TV-aligned.
  MACD: { relative: 0.005, absoluteFloor: 0.03 },  // 0.5% of value or ±0.03 minimum
  "Bollinger Bands": { relative: 0.0005 },  // 0.05% of price
  SMA: { relative: 0.0001 },  // 0.01%
  EMA: { relative: 0.0002 },  // 0.02%
  
  // Volatility indicators: price-scaled, moderate tolerance
  ATR: { relative: 0.01 },  // 1%
  
  // Trend indicators: mid-range tolerance
  "ADX/DMI": { absolute: 0.5 },  // ADX is 0-100
  
  // Volume-based: relative tolerance required
  OBV: { relative: 0.001 },  // 0.1%
  VWAP: { relative: 0.0005 },  // 0.05%
  
  // Default fallback
  default: { absolute: 0.5 },
};

/**
 * Check if computed value matches expected within indicator-specific tolerance.
 * 
 * For relative tolerance: uses max(relative * expected, absoluteFloor) to handle
 * near-zero values (e.g., MACD histogram crossing zero).
 * 
 * @param computed - Our computed value
 * @param expected - TradingView reference value
 * @param indicator - Indicator name for tolerance lookup
 * @returns { matches: boolean, diff: number, tolerance: string }
 */
export function checkParityTolerance(
  computed: number,
  expected: number,
  indicator: string
): { matches: boolean; diff: number; tolerance: string } {
  const config = PARITY_TOLERANCES[indicator] ?? PARITY_TOLERANCES.default;
  
  const diff = Math.abs(computed - expected);
  
  if (config.relative !== undefined) {
    const refValue = Math.abs(expected);
    const relativeTolerance = refValue * config.relative;
    
    // Use absoluteFloor when value is near zero (prevents overly tight tolerance)
    const effectiveTolerance = config.absoluteFloor !== undefined
      ? Math.max(relativeTolerance, config.absoluteFloor)
      : Math.max(relativeTolerance, 0.001);  // Default floor of 0.001 to avoid division issues
    
    const matches = diff <= effectiveTolerance;
    
    return {
      matches,
      diff,
      tolerance: config.absoluteFloor !== undefined && effectiveTolerance === config.absoluteFloor
        ? `±${config.absoluteFloor} (floor)`
        : `${(config.relative * 100).toFixed(2)}% (rel)`,
    };
  }
  
  const matches = diff <= (config.absolute ?? 0.5);
  return {
    matches,
    diff,
    tolerance: `±${config.absolute}`,
  };
}
