/**
 * vpTimeUtils.ts
 * 
 * Time normalization utilities for Volume Profile indicators.
 * 
 * LWC Time can be:
 * - number (Unix timestamp in seconds)
 * - string (ISO date string like "2024-01-15")
 * - BusinessDay object like { year: 2024, month: 1, day: 15 }
 * 
 * All VP hooks need Unix seconds (number) for range calculations.
 */

import type { Time, BusinessDay, IChartApi, LogicalRange } from "@/lib/lightweightCharts";
import type { NormalizedBar } from "../types";

/**
 * Check if a Time value is a BusinessDay object
 */
function isBusinessDay(time: Time): time is BusinessDay {
  return (
    typeof time === "object" &&
    time !== null &&
    "year" in time &&
    "month" in time &&
    "day" in time
  );
}

/**
 * Normalize any LWC Time to Unix seconds (number).
 * Handles:
 * - Unix seconds (number < 1e12)
 * - Unix milliseconds (number >= 1e12) → converted to seconds
 * - BusinessDay object { year, month, day }
 * - ISO date string "2024-01-15"
 * 
 * Returns 0 if conversion fails (caller should handle).
 */
export function normalizeTime(time: Time | null | undefined): number {
  if (time === null || time === undefined) return 0;
  
  // Already a number - check if seconds or milliseconds
  if (typeof time === "number") {
    // If > 1e12, treat as milliseconds (timestamps after ~2001 are < 1e12 in seconds)
    if (time > 1e12) {
      return Math.floor(time / 1000);
    }
    return time;
  }
  
  // BusinessDay object { year, month, day }
  if (isBusinessDay(time)) {
    // Create UTC date from BusinessDay
    const d = new Date(Date.UTC(time.year, time.month - 1, time.day, 0, 0, 0));
    return Math.floor(d.getTime() / 1000);
  }
  
  // String (ISO date like "2024-01-15")
  if (typeof time === "string") {
    const d = new Date(time);
    if (!isNaN(d.getTime())) {
      return Math.floor(d.getTime() / 1000);
    }
  }
  
  return 0;
}

/**
 * Get visible range as Unix timestamps using logical range + bars mapping.
 * This is the TV-parity-safe approach: logical range → bar index → bar.time
 * 
 * @param chart The chart API instance
 * @param bars Array of chart bars with time (must be ascending order)
 * @returns { start, end } in Unix seconds, or null if not available
 */
export function getVisibleRangeFromBars(
  chart: IChartApi | null,
  bars: Array<{ time: Time | number }>
): { start: number; end: number } | null {
  if (!chart || bars.length === 0) {
    console.debug("[vpTimeUtils] getVisibleRangeFromBars: no chart or bars");
    return null;
  }
  
  const timeScale = chart.timeScale();
  const logicalRange = timeScale.getVisibleLogicalRange();
  
  if (!logicalRange) {
    console.debug("[vpTimeUtils] getVisibleRangeFromBars: no logicalRange");
    return null;
  }
  
  // Clamp logical indices to valid bar range
  const fromIdx = Math.max(0, Math.floor(logicalRange.from));
  const toIdx = Math.min(bars.length - 1, Math.ceil(logicalRange.to));
  
  if (fromIdx > toIdx || fromIdx >= bars.length) {
    console.debug(`[vpTimeUtils] getVisibleRangeFromBars: invalid indices from=${fromIdx} to=${toIdx} len=${bars.length}`);
    return null;
  }
  
  const startTime = normalizeTime(bars[fromIdx].time as Time);
  const endTime = normalizeTime(bars[toIdx].time as Time);
  
  // Validate: times must be positive and startTime < endTime (ascending order)
  if (startTime <= 0 || endTime <= 0) {
    console.warn(`[vpTimeUtils] getVisibleRangeFromBars: invalid times start=${startTime} end=${endTime}`);
    return null;
  }
  
  // If startTime >= endTime, bars might be in descending order - swap to fix
  if (startTime >= endTime) {
    console.warn(`[vpTimeUtils] getVisibleRangeFromBars: times inverted (descending bars?) start=${startTime} end=${endTime}, swapping`);
    return { start: endTime, end: startTime };
  }
  
  return { start: startTime, end: endTime };
}

/**
 * Get the time of a bar at a specific logical index.
 * Useful for click handling.
 */
export function getTimeAtLogicalIndex(
  chart: IChartApi | null,
  bars: Array<{ time: Time | number }>,
  logicalIndex: number
): number {
  if (!chart || bars.length === 0) return 0;
  
  const idx = Math.max(0, Math.min(bars.length - 1, Math.round(logicalIndex)));
  return normalizeTime(bars[idx].time as Time);
}

/**
 * Convert a chart click event to Unix timestamp.
 * Uses logical index mapping for reliability.
 */
export function normalizeClickTime(
  chart: IChartApi | null,
  bars: Array<{ time: Time | number }>,
  clickTime: Time | undefined
): number {
  // First try direct conversion
  const direct = normalizeTime(clickTime);
  if (direct > 0) return direct;
  
  // Fallback: if we have bars and chart, try to find nearest bar
  if (!chart || !bars.length || !clickTime) return 0;
  
  // Try coordinate mapping if direct failed
  try {
    const timeScale = chart.timeScale();
    const coord = timeScale.timeToCoordinate(clickTime);
    if (coord !== null) {
      const logicalIdx = timeScale.coordinateToLogical(coord);
      if (logicalIdx !== null) {
        return getTimeAtLogicalIndex(chart, bars, logicalIdx);
      }
    }
  } catch {
    // Ignore coordinate mapping errors
  }
  
  return 0;
}

/**
 * Debug helper: format range for logging
 */
export function formatRangeDebug(start: number, end: number): string {
  if (!start || !end) return `invalid(${start}-${end})`;
  const s = new Date(start * 1000).toISOString().slice(0, 10);
  const e = new Date(end * 1000).toISOString().slice(0, 10);
  return `${s} to ${e}`;
}

/**
 * Validate bar array: check order and report issues.
 * Returns info object for debugging.
 */
export function validateBars(
  bars: Array<{ time: Time | number; high?: number; low?: number }>
): {
  count: number;
  firstTime: number;
  lastTime: number;
  firstDate: string;
  lastDate: string;
  isAscending: boolean;
  priceMin: number;
  priceMax: number;
  issues: string[];
} {
  if (bars.length === 0) {
    return {
      count: 0,
      firstTime: 0,
      lastTime: 0,
      firstDate: "none",
      lastDate: "none",
      isAscending: true,
      priceMin: 0,
      priceMax: 0,
      issues: ["No bars"],
    };
  }
  
  const firstTime = normalizeTime(bars[0].time as Time);
  const lastTime = normalizeTime(bars[bars.length - 1].time as Time);
  const isAscending = firstTime < lastTime;
  
  let priceMin = Infinity;
  let priceMax = -Infinity;
  
  for (const bar of bars) {
    if (bar.low !== undefined && bar.low < priceMin) priceMin = bar.low;
    if (bar.high !== undefined && bar.high > priceMax) priceMax = bar.high;
  }
  
  if (!isFinite(priceMin)) priceMin = 0;
  if (!isFinite(priceMax)) priceMax = 0;
  
  const issues: string[] = [];
  if (!isAscending) issues.push("Bars not ascending");
  if (firstTime <= 0) issues.push("Invalid first time");
  if (lastTime <= 0) issues.push("Invalid last time");
  if (priceMin <= 0) issues.push("No valid price min");
  if (priceMax <= 0) issues.push("No valid price max");
  
  return {
    count: bars.length,
    firstTime,
    lastTime,
    firstDate: firstTime > 0 ? new Date(firstTime * 1000).toISOString().slice(0, 10) : "invalid",
    lastDate: lastTime > 0 ? new Date(lastTime * 1000).toISOString().slice(0, 10) : "invalid",
    isAscending,
    priceMin,
    priceMax,
    issues,
  };
}

/**
 * Ensure bar array is in ascending time order.
 * If descending, returns a reversed copy. Otherwise returns original.
 */
export function ensureAscendingBars<T extends { time: Time | number }>(bars: T[]): T[] {
  if (bars.length < 2) return bars;
  
  const firstTime = normalizeTime(bars[0].time as Time);
  const lastTime = normalizeTime(bars[bars.length - 1].time as Time);
  
  if (firstTime > lastTime) {
    console.warn("[vpTimeUtils] ensureAscendingBars: reversing descending bars");
    return [...bars].reverse();
  }
  
  return bars;
}