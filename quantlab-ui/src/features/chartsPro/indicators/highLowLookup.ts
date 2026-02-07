/**
 * highLowLookup.ts
 * 
 * Shared helper module for geometry/swing-based indicators.
 * Provides deterministic, TradingView-parity pivot and extreme detection.
 * 
 * Used by:
 * - Pivot Points Standard (range extremes for period OHLC)
 * - Pivot Points High Low (pivot detection with left/right legs)
 * - Auto Fib Retracement (swing detection with deviation/depth)
 * - Zig Zag (swing detection with same logic as Auto Fib)
 * 
 * All functions work on index-based arrays for O(1) access.
 * None depend on viewport state - calculations are deterministic.
 */

import type { ComputeBar } from "./compute";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of finding an extreme value in a range.
 */
export interface ExtremeResult {
  /** The extreme value (high or low) */
  value: number;
  /** Bar index where the extreme occurred */
  index: number;
  /** Timestamp of the bar */
  time: number;
}

/**
 * A detected pivot point (high or low).
 */
export interface PivotPoint {
  /** Whether this is a pivot high (true) or pivot low (false) */
  isHigh: boolean;
  /** Price value at the pivot */
  price: number;
  /** Bar index of the pivot */
  index: number;
  /** Timestamp of the pivot bar */
  time: number;
  /** Number of left bars used for confirmation */
  leftBars: number;
  /** Number of right bars used for confirmation */
  rightBars: number;
}

/**
 * A swing point for ZigZag/Auto Fib calculations.
 */
export interface SwingPoint {
  /** Whether this is a swing high (true) or swing low (false) */
  isHigh: boolean;
  /** Price at the swing */
  price: number;
  /** Bar index */
  index: number;
  /** Timestamp */
  time: number;
  /** Cumulative volume from previous swing to this one (optional) */
  cumulativeVolume?: number;
  /** Price change from previous swing (for ZigZag labels) */
  priceChange?: number;
  /** Percent change from previous swing */
  percentChange?: number;
}

// ============================================================================
// Range Extreme Functions
// ============================================================================

/**
 * Find the highest high in a range [startIdx, endIdx] inclusive.
 * 
 * @param bars - Array of OHLC bars
 * @param startIdx - Start index (inclusive)
 * @param endIdx - End index (inclusive)
 * @returns ExtremeResult with highest high value, index, and time
 */
export function highestHigh(
  bars: ComputeBar[],
  startIdx: number,
  endIdx: number
): ExtremeResult | null {
  if (bars.length === 0) return null;
  
  // Clamp indices
  const start = Math.max(0, startIdx);
  const end = Math.min(bars.length - 1, endIdx);
  
  if (start > end) return null;
  
  let maxValue = -Infinity;
  let maxIndex = start;
  let maxTime = bars[start].time as number;
  
  for (let i = start; i <= end; i++) {
    if (bars[i].high > maxValue) {
      maxValue = bars[i].high;
      maxIndex = i;
      maxTime = bars[i].time as number;
    }
  }
  
  return {
    value: maxValue,
    index: maxIndex,
    time: maxTime,
  };
}

/**
 * Find the lowest low in a range [startIdx, endIdx] inclusive.
 * 
 * @param bars - Array of OHLC bars
 * @param startIdx - Start index (inclusive)
 * @param endIdx - End index (inclusive)
 * @returns ExtremeResult with lowest low value, index, and time
 */
export function lowestLow(
  bars: ComputeBar[],
  startIdx: number,
  endIdx: number
): ExtremeResult | null {
  if (bars.length === 0) return null;
  
  // Clamp indices
  const start = Math.max(0, startIdx);
  const end = Math.min(bars.length - 1, endIdx);
  
  if (start > end) return null;
  
  let minValue = Infinity;
  let minIndex = start;
  let minTime = bars[start].time as number;
  
  for (let i = start; i <= end; i++) {
    if (bars[i].low < minValue) {
      minValue = bars[i].low;
      minIndex = i;
      minTime = bars[i].time as number;
    }
  }
  
  return {
    value: minValue,
    index: minIndex,
    time: minTime,
  };
}

/**
 * Find both highest high and lowest low in a range, with their indices.
 * More efficient than calling highestHigh + lowestLow separately.
 * 
 * @param bars - Array of OHLC bars
 * @param startIdx - Start index (inclusive)
 * @param endIdx - End index (inclusive)
 * @returns Object with highest and lowest results
 */
export function rangeExtremes(
  bars: ComputeBar[],
  startIdx: number,
  endIdx: number
): { highest: ExtremeResult; lowest: ExtremeResult } | null {
  if (bars.length === 0) return null;
  
  // Clamp indices
  const start = Math.max(0, startIdx);
  const end = Math.min(bars.length - 1, endIdx);
  
  if (start > end) return null;
  
  let maxValue = -Infinity;
  let maxIndex = start;
  let maxTime = bars[start].time as number;
  
  let minValue = Infinity;
  let minIndex = start;
  let minTime = bars[start].time as number;
  
  for (let i = start; i <= end; i++) {
    if (bars[i].high > maxValue) {
      maxValue = bars[i].high;
      maxIndex = i;
      maxTime = bars[i].time as number;
    }
    if (bars[i].low < minValue) {
      minValue = bars[i].low;
      minIndex = i;
      minTime = bars[i].time as number;
    }
  }
  
  return {
    highest: { value: maxValue, index: maxIndex, time: maxTime },
    lowest: { value: minValue, index: minIndex, time: minTime },
  };
}

// ============================================================================
// Pivot Detection Functions (Pivot Points High Low)
// ============================================================================

/**
 * Check if bar at index i is a pivot high.
 * Pivot high: high[i] is strictly greater than highs on both left and right sides.
 * 
 * TradingView behavior:
 * - Left: high[i] > high[i-1], high[i] > high[i-2], ..., high[i] > high[i-leftBars]
 * - Right: high[i] > high[i+1], high[i] > high[i+2], ..., high[i] > high[i+rightBars]
 * - The pivot is only "confirmed" after rightBars have passed - this determines render timing
 * 
 * @param bars - Array of OHLC bars
 * @param index - Index of the candidate pivot bar
 * @param leftBars - Number of bars to the left to check
 * @param rightBars - Number of bars to the right to check
 * @param useClose - If true, use close price instead of high (for Close mode)
 * @returns true if this bar is a pivot high
 */
export function isPivotHigh(
  bars: ComputeBar[],
  index: number,
  leftBars: number,
  rightBars: number,
  useClose: boolean = false
): boolean {
  // Need enough bars on both sides
  if (index < leftBars || index + rightBars >= bars.length) {
    return false;
  }
  
  const candidateValue = useClose ? bars[index].close : bars[index].high;
  
  // Check left side (must be strictly greater)
  for (let i = 1; i <= leftBars; i++) {
    const leftValue = useClose ? bars[index - i].close : bars[index - i].high;
    if (candidateValue <= leftValue) {
      return false;
    }
  }
  
  // Check right side (must be strictly greater)
  for (let i = 1; i <= rightBars; i++) {
    const rightValue = useClose ? bars[index + i].close : bars[index + i].high;
    if (candidateValue <= rightValue) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if bar at index i is a pivot low.
 * Pivot low: low[i] is strictly less than lows on both left and right sides.
 * 
 * @param bars - Array of OHLC bars
 * @param index - Index of the candidate pivot bar
 * @param leftBars - Number of bars to the left to check
 * @param rightBars - Number of bars to the right to check
 * @param useClose - If true, use close price instead of low (for Close mode)
 * @returns true if this bar is a pivot low
 */
export function isPivotLow(
  bars: ComputeBar[],
  index: number,
  leftBars: number,
  rightBars: number,
  useClose: boolean = false
): boolean {
  // Need enough bars on both sides
  if (index < leftBars || index + rightBars >= bars.length) {
    return false;
  }
  
  const candidateValue = useClose ? bars[index].close : bars[index].low;
  
  // Check left side (must be strictly less)
  for (let i = 1; i <= leftBars; i++) {
    const leftValue = useClose ? bars[index - i].close : bars[index - i].low;
    if (candidateValue >= leftValue) {
      return false;
    }
  }
  
  // Check right side (must be strictly less)
  for (let i = 1; i <= rightBars; i++) {
    const rightValue = useClose ? bars[index + i].close : bars[index + i].low;
    if (candidateValue >= rightValue) {
      return false;
    }
  }
  
  return true;
}

/**
 * Detect all pivot highs and lows in the bar array.
 * 
 * @param bars - Array of OHLC bars
 * @param highLeftBars - Left bars for pivot high detection
 * @param highRightBars - Right bars for pivot high detection
 * @param lowLeftBars - Left bars for pivot low detection
 * @param lowRightBars - Right bars for pivot low detection
 * @param useClose - If true, use close price instead of H/L
 * @returns Array of PivotPoint objects sorted by index
 */
export function detectPivots(
  bars: ComputeBar[],
  highLeftBars: number,
  highRightBars: number,
  lowLeftBars: number,
  lowRightBars: number,
  useClose: boolean = false
): PivotPoint[] {
  const pivots: PivotPoint[] = [];
  
  for (let i = 0; i < bars.length; i++) {
    // Check for pivot high
    if (isPivotHigh(bars, i, highLeftBars, highRightBars, useClose)) {
      pivots.push({
        isHigh: true,
        price: useClose ? bars[i].close : bars[i].high,
        index: i,
        time: bars[i].time as number,
        leftBars: highLeftBars,
        rightBars: highRightBars,
      });
    }
    
    // Check for pivot low
    if (isPivotLow(bars, i, lowLeftBars, lowRightBars, useClose)) {
      pivots.push({
        isHigh: false,
        price: useClose ? bars[i].close : bars[i].low,
        index: i,
        time: bars[i].time as number,
        leftBars: lowLeftBars,
        rightBars: lowRightBars,
      });
    }
  }
  
  // Sort by index (they should already be in order, but be safe)
  pivots.sort((a, b) => a.index - b.index);
  
  return pivots;
}

// ============================================================================
// Swing Detection Functions (ZigZag / Auto Fib)
// ============================================================================

/**
 * Detect swing points using deviation and depth parameters.
 * This is the core algorithm for ZigZag and Auto Fib Retracement.
 * 
 * TradingView ZigZag algorithm:
 * 1. Start from first bar, track current direction (up or down)
 * 2. For each new bar:
 *    - If continuing in same direction, update current extreme
 *    - If price deviates by >= deviation% in opposite direction, confirm swing and reverse
 * 3. Depth parameter controls minimum bars between pivots (confirmatory lag)
 * 4. Last segment "repaints" until confirmed
 * 
 * @param bars - Array of OHLC bars
 * @param deviation - Price deviation for reversals (percentage, e.g., 5 = 5%)
 * @param depth - Minimum bars between pivots (ZigZag "pivot legs")
 * @param extendToLastBar - Whether the last segment extends to the final bar
 * @returns Array of SwingPoint objects in chronological order
 */
export function detectSwings(
  bars: ComputeBar[],
  deviation: number,
  depth: number,
  extendToLastBar: boolean = true
): SwingPoint[] {
  if (bars.length < 2) return [];
  
  const swings: SwingPoint[] = [];
  
  // Track current state
  let isUptrend: boolean | null = null; // null = not yet determined
  let currentExtreme: SwingPoint | null = null;
  let lastConfirmedSwing: SwingPoint | null = null;
  let barsSinceLastSwing = 0;
  
  // Helper to calculate deviation percentage
  const getDeviation = (from: number, to: number): number => {
    if (from === 0) return 0;
    return Math.abs((to - from) / from) * 100;
  };
  
  // Initialize with first bar
  const firstBar = bars[0];
  const firstHigh = firstBar.high;
  const firstLow = firstBar.low;
  
  // We'll determine initial direction after comparing first few bars
  let tentativeHigh: SwingPoint = {
    isHigh: true,
    price: firstHigh,
    index: 0,
    time: firstBar.time as number,
  };
  
  let tentativeLow: SwingPoint = {
    isHigh: false,
    price: firstLow,
    index: 0,
    time: firstBar.time as number,
  };
  
  // Process bars
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const high = bar.high;
    const low = bar.low;
    barsSinceLastSwing++;
    
    // Update tentative extremes if we haven't established direction
    if (isUptrend === null) {
      // Update tentative high
      if (high > tentativeHigh.price) {
        tentativeHigh = {
          isHigh: true,
          price: high,
          index: i,
          time: bar.time as number,
        };
      }
      
      // Update tentative low
      if (low < tentativeLow.price) {
        tentativeLow = {
          isHigh: false,
          price: low,
          index: i,
          time: bar.time as number,
        };
      }
      
      // Check if we can establish initial direction
      const upDeviation = getDeviation(tentativeLow.price, tentativeHigh.price);
      const downDeviation = getDeviation(tentativeHigh.price, tentativeLow.price);
      
      if (upDeviation >= deviation || downDeviation >= deviation) {
        // Establish direction based on which extreme came first
        if (tentativeHigh.index < tentativeLow.index) {
          // High came first → we're in a downtrend (moved down from high to low)
          isUptrend = false;
          swings.push(tentativeHigh);
          lastConfirmedSwing = tentativeHigh;
          currentExtreme = tentativeLow;
          barsSinceLastSwing = i - tentativeLow.index;
        } else {
          // Low came first → we're in an uptrend (moved up from low to high)
          isUptrend = true;
          swings.push(tentativeLow);
          lastConfirmedSwing = tentativeLow;
          currentExtreme = tentativeHigh;
          barsSinceLastSwing = i - tentativeHigh.index;
        }
      }
      continue;
    }
    
    // Direction established - process swing logic
    if (isUptrend) {
      // In uptrend, looking for higher highs or reversal to downtrend
      if (high > currentExtreme!.price) {
        // Found higher high, update current extreme
        currentExtreme = {
          isHigh: true,
          price: high,
          index: i,
          time: bar.time as number,
        };
        barsSinceLastSwing = 0;
      } else {
        // Check for reversal
        const deviationFromHigh = getDeviation(currentExtreme!.price, low);
        
        if (deviationFromHigh >= deviation && barsSinceLastSwing >= depth) {
          // Confirm swing high and reverse to downtrend
          swings.push(currentExtreme!);
          lastConfirmedSwing = currentExtreme!;
          isUptrend = false;
          currentExtreme = {
            isHigh: false,
            price: low,
            index: i,
            time: bar.time as number,
          };
          barsSinceLastSwing = 0;
        }
      }
    } else {
      // In downtrend, looking for lower lows or reversal to uptrend
      if (low < currentExtreme!.price) {
        // Found lower low, update current extreme
        currentExtreme = {
          isHigh: false,
          price: low,
          index: i,
          time: bar.time as number,
        };
        barsSinceLastSwing = 0;
      } else {
        // Check for reversal
        const deviationFromLow = getDeviation(currentExtreme!.price, high);
        
        if (deviationFromLow >= deviation && barsSinceLastSwing >= depth) {
          // Confirm swing low and reverse to uptrend
          swings.push(currentExtreme!);
          lastConfirmedSwing = currentExtreme!;
          isUptrend = true;
          currentExtreme = {
            isHigh: true,
            price: high,
            index: i,
            time: bar.time as number,
          };
          barsSinceLastSwing = 0;
        }
      }
    }
  }
  
  // Handle last swing / extend to last bar
  if (extendToLastBar && currentExtreme && swings.length > 0) {
    // Add the current unconfirmed extreme as the last swing
    // This creates the "repainting" behavior where last segment can move
    const lastBar = bars[bars.length - 1];
    
    // If current extreme is at the last bar, use it
    // Otherwise, create a pseudo-swing at the last bar's extreme
    if (currentExtreme.index === bars.length - 1) {
      swings.push(currentExtreme);
    } else {
      // Extend to last bar using last bar's extreme
      const lastExtreme: SwingPoint = {
        isHigh: currentExtreme.isHigh,
        price: currentExtreme.isHigh ? lastBar.high : lastBar.low,
        index: bars.length - 1,
        time: lastBar.time as number,
      };
      // Only add if different from current extreme
      if (lastExtreme.price !== currentExtreme.price) {
        // Use the more extreme value
        if (currentExtreme.isHigh) {
          lastExtreme.price = Math.max(currentExtreme.price, lastBar.high);
        } else {
          lastExtreme.price = Math.min(currentExtreme.price, lastBar.low);
        }
      }
      swings.push(lastExtreme);
    }
  } else if (currentExtreme && !extendToLastBar) {
    // Add current extreme as potentially unconfirmed swing
    swings.push(currentExtreme);
  }
  
  // Calculate cumulative volumes and price changes
  let cumulativeVolume = 0;
  for (let i = 0; i < swings.length; i++) {
    const swing = swings[i];
    
    if (i === 0) {
      swing.cumulativeVolume = 0;
      swing.priceChange = 0;
      swing.percentChange = 0;
      cumulativeVolume = 0;
    } else {
      const prevSwing = swings[i - 1];
      
      // Calculate volume between swings
      let volumeBetween = 0;
      for (let j = prevSwing.index; j <= swing.index; j++) {
        volumeBetween += bars[j].volume || 0;
      }
      cumulativeVolume += volumeBetween;
      swing.cumulativeVolume = volumeBetween;
      
      // Calculate price change
      swing.priceChange = swing.price - prevSwing.price;
      swing.percentChange = prevSwing.price !== 0 
        ? ((swing.price - prevSwing.price) / prevSwing.price) * 100 
        : 0;
    }
  }
  
  return swings;
}

// ============================================================================
// Fibonacci Level Calculation
// ============================================================================

/**
 * Standard Fibonacci retracement levels.
 * These are the levels TradingView uses by default.
 */
export const FIB_LEVELS = {
  "0": 0,
  "0.236": 0.236,
  "0.382": 0.382,
  "0.5": 0.5,
  "0.618": 0.618,
  "0.786": 0.786,
  "1": 1.0,
  "1.618": 1.618,
  "2.618": 2.618,
  "3.618": 3.618,
  "4.236": 4.236,
} as const;

export type FibLevelKey = keyof typeof FIB_LEVELS;

/**
 * Calculate Fibonacci retracement levels between two price points.
 * 
 * @param startPrice - Starting price (swing anchor)
 * @param endPrice - Ending price (swing anchor)
 * @param reverse - If true, reverse the direction
 * @returns Map of level key to calculated price
 */
export function calculateFibLevels(
  startPrice: number,
  endPrice: number,
  reverse: boolean = false
): Record<FibLevelKey, number> {
  let from = startPrice;
  let to = endPrice;
  
  if (reverse) {
    [from, to] = [to, from];
  }
  
  const range = to - from;
  const levels: Record<string, number> = {};
  
  for (const [key, ratio] of Object.entries(FIB_LEVELS)) {
    // Fib levels are drawn from the end (1.0) back toward start (0)
    // Level at 0.618 means 61.8% retracement from end toward start
    levels[key] = to - range * ratio;
  }
  
  return levels as Record<FibLevelKey, number>;
}

// ============================================================================
// Bar Snapping Utilities (shared with overlays)
// ============================================================================

/**
 * Binary search to find the first bar time >= target.
 * Returns the bar time if found, or -1 if target is beyond all bars.
 * 
 * @param barTimes - Sorted array of bar times (ascending)
 * @param target - Target timestamp
 * @returns Bar time >= target, or -1 if not found
 */
export function findFirstBarAtOrAfter(barTimes: number[], target: number): number {
  if (barTimes.length === 0) return -1;
  
  let left = 0;
  let right = barTimes.length - 1;
  let result = -1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (barTimes[mid] >= target) {
      result = barTimes[mid];
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  
  return result;
}

/**
 * Binary search to find the last bar time < target.
 * Returns the bar time if found, or -1 if target is before all bars.
 * 
 * @param barTimes - Sorted array of bar times (ascending)
 * @param target - Target timestamp
 * @returns Bar time < target, or -1 if not found
 */
export function findLastBarBefore(barTimes: number[], target: number): number {
  if (barTimes.length === 0) return -1;
  
  let left = 0;
  let right = barTimes.length - 1;
  let result = -1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (barTimes[mid] < target) {
      result = barTimes[mid];
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return result;
}

/**
 * Find the bar index closest to a given timestamp.
 * 
 * @param barTimes - Sorted array of bar times (ascending)
 * @param target - Target timestamp
 * @returns Index of closest bar, or -1 if empty
 */
export function findClosestBarIndex(barTimes: number[], target: number): number {
  if (barTimes.length === 0) return -1;
  
  let left = 0;
  let right = barTimes.length - 1;
  
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (barTimes[mid] === target) return mid;
    if (barTimes[mid] < target) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  
  // Check if left-1 is closer than left
  if (left > 0) {
    const leftDiff = Math.abs(barTimes[left] - target);
    const prevDiff = Math.abs(barTimes[left - 1] - target);
    if (prevDiff < leftDiff) return left - 1;
  }
  
  return left;
}
