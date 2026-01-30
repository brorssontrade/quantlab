/**
 * TV-37.1: Range Presets Utility
 * 
 * Provides TradingView-style range presets (1D, 5D, 1M, 6M, YTD, 1Y, All)
 * that work consistently across all timeframes and data sizes.
 * 
 * Key design principles:
 * - Time-based ranges (calendar days), not bar-count based
 * - Always anchor on the last (most recent) bar
 * - Stabilization to prevent flicker on rapid clicks
 * - Works with any timeframe (1m → 1W)
 */

import type { IChartApi, ITimeScaleApi, Time } from "lightweight-charts";

/** Supported range preset keys */
export type RangePresetKey = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "All";

/** All preset keys in display order */
export const RANGE_PRESET_KEYS: RangePresetKey[] = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "All"];

/**
 * PRIO 4: Range → Timeframe auto-mapping
 * 
 * When clicking a range preset, we auto-switch to the optimal timeframe:
 * - 1D → 1m  (intraday detail for day traders)
 * - 5D → 5m  (intraday with context)
 * - 1M → 30m (swing trading view)
 * - 3M → 1H  (medium-term positioning)
 * - 6M → 2H  (longer positioning)
 * - YTD → 1D (year view with daily detail)
 * - 1Y → 1D  (yearly view)
 * - All → 1D (full history at daily)
 */
export const RANGE_TIMEFRAME_MAP: Record<RangePresetKey, string> = {
  "1D": "1m",
  "5D": "5m",
  "1M": "30m",
  "3M": "1h",   // Use lowercase 1h to match TIMEFRAME_OPTIONS
  "6M": "2H",
  "YTD": "1D",
  "1Y": "1D",
  "All": "1D",
};

/** Data bounds required for range calculations */
export interface DataBounds {
  /** First bar time (UTCTimestamp - unix seconds) */
  firstBarTime: number;
  /** Last bar time (UTCTimestamp - unix seconds) */
  lastBarTime: number;
  /** Total number of bars */
  dataCount: number;
  /** Array of all bar times for index-based lookup (optional, enables precise snapping) */
  barTimes?: number[];
}

/** Result of a range preset calculation */
export interface RangePresetResult {
  /** Start time (unix timestamp seconds) */
  from: number;
  /** End time (unix timestamp seconds) */
  to: number;
  /** The preset that was applied */
  preset: RangePresetKey;
  /** Whether the range was clamped due to insufficient data */
  clamped: boolean;
  /** The originally requested from time (before snapping/clamping) */
  requestedFrom: number;
  /** Debug info about the calculation */
  debug?: {
    /** Year extracted for YTD preset */
    ytdYear?: number;
    /** The snap source (barTimes or clamp) */
    snapSource: "barTimes" | "clamp";
    /** Reason for any clamping */
    clampReason?: string;
  };
}

/**
 * Range durations in SECONDS (calendar days, not trading days)
 * This ensures ranges are timeframe-agnostic:
 * - 5D with 1h bars = last 5 days of hourly candles
 * - 5D with 1D bars = last 5 daily candles
 */
const RANGE_SECONDS: Record<RangePresetKey, number | null> = {
  "1D": 1 * 24 * 60 * 60,      // 86400 seconds
  "5D": 5 * 24 * 60 * 60,      // 432000 seconds
  "1M": 30 * 24 * 60 * 60,     // ~30 days
  "3M": 90 * 24 * 60 * 60,     // ~90 days (PRIO 4: added 3M preset)
  "6M": 180 * 24 * 60 * 60,    // ~180 days
  "YTD": null,                  // Special: from Jan 1
  "1Y": 365 * 24 * 60 * 60,    // ~365 days
  "All": null,                  // Fit all visible data
};

/**
 * Binary search to find first barTime >= targetUnix
 * Returns the bar time at that index, or minTime if target is before all bars
 */
function findFirstBarAtOrAfter(
  barTimes: number[],
  targetUnix: number,
  minTime: number,
  maxTime: number
): number {
  if (targetUnix <= minTime) return minTime;
  if (targetUnix >= maxTime) return maxTime;
  
  let low = 0;
  let high = barTimes.length - 1;
  
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (barTimes[mid] < targetUnix) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  
  return barTimes[low] ?? minTime;
}

/**
 * Calculate the time range for a given preset
 * 
 * @param preset - The range preset key
 * @param bounds - Data bounds with first/last bar times
 * @param timezoneId - IANA timezone for YTD calculation (default: "UTC")
 * @returns The calculated range with from/to timestamps
 */
export function calculateRangePreset(
  preset: RangePresetKey,
  bounds: DataBounds,
  timezoneId: string = "UTC"
): RangePresetResult {
  const { firstBarTime: minTime, lastBarTime: maxTime, barTimes } = bounds;
  const hasBarTimes = barTimes && barTimes.length > 0;
  
  // Helper to snap to actual bar time if barTimes array is available
  const snapToBar = (targetUnix: number): number => {
    if (hasBarTimes) {
      return findFirstBarAtOrAfter(barTimes, targetUnix, minTime, maxTime);
    }
    // Without barTimes, just clamp to data range
    return Math.max(minTime, Math.min(targetUnix, maxTime));
  };

  if (preset === "All") {
    return {
      from: minTime,
      to: maxTime,
      preset,
      clamped: false,
      requestedFrom: minTime,
      debug: {
        snapSource: hasBarTimes ? "barTimes" : "clamp",
      },
    };
  }

  if (preset === "YTD") {
    // TV-37.1 FIX: Calculate YTD year from maxTime (lastBarTime), not system time
    // This ensures YTD is always relative to the chart's data, not current date
    const dateInTz = new Date(maxTime * 1000);
    const yearStr = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      timeZone: timezoneId,
    }).format(dateInTz);
    const year = parseInt(yearStr, 10);
    
    // Get Jan 1 00:00:00 of that year in the selected timezone
    // Use Intl.DateTimeFormat to properly handle timezone offset
    const jan1Str = `${year}-01-01T00:00:00`;
    const jan1Date = new Date(jan1Str);
    // Adjust for timezone - get the offset for Jan 1 in the target timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezoneId,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    // For simplicity, use UTC Jan 1 (most accurate for TV-style YTD)
    const yearStartUnix = Math.floor(Date.UTC(year, 0, 1) / 1000);
    const fromTime = snapToBar(yearStartUnix);
    const clamped = yearStartUnix < minTime;
    
    return {
      from: fromTime,
      to: maxTime,
      preset,
      clamped,
      requestedFrom: yearStartUnix,
      debug: {
        ytdYear: year,
        snapSource: hasBarTimes ? "barTimes" : "clamp",
        clampReason: clamped ? `Data starts after Jan 1 ${year}` : undefined,
      },
    };
  }

  // Standard time-based range
  const rangeSeconds = RANGE_SECONDS[preset];
  if (rangeSeconds === null) {
    // Fallback to all
    return {
      from: minTime,
      to: maxTime,
      preset,
      clamped: false,
      requestedFrom: minTime,
      debug: {
        snapSource: hasBarTimes ? "barTimes" : "clamp",
      },
    };
  }

  const targetStartUnix = maxTime - rangeSeconds;
  const fromTime = snapToBar(targetStartUnix);
  const clamped = targetStartUnix < minTime;

  return {
    from: fromTime,
    to: maxTime,
    preset,
    clamped,
    requestedFrom: targetStartUnix,
    debug: {
      snapSource: hasBarTimes ? "barTimes" : "clamp",
      clampReason: clamped ? `Requested ${preset} range exceeds data history` : undefined,
    },
  };
}

/** Pending range application for stabilization */
let pendingRangeApplication: {
  preset: RangePresetKey;
  rafId: number;
} | null = null;

/**
 * Apply a range preset to a chart with stabilization
 * 
 * Uses requestAnimationFrame to batch rapid clicks and prevent
 * visual flicker. Only the last preset in a rapid sequence is applied.
 * 
 * @param chart - The lightweight-charts IChartApi instance
 * @param preset - The range preset to apply
 * @param bounds - Data bounds
 * @param timezoneId - IANA timezone for YTD calculation
 * @returns Promise that resolves when the range is applied
 */
export function applyRangePreset(
  chart: IChartApi | null,
  preset: RangePresetKey,
  bounds: DataBounds | null,
  timezoneId: string = "UTC"
): Promise<RangePresetResult | null> {
  return new Promise((resolve) => {
    // Cancel any pending application
    if (pendingRangeApplication) {
      cancelAnimationFrame(pendingRangeApplication.rafId);
      pendingRangeApplication = null;
    }

    // Validate inputs
    if (!chart || !bounds || bounds.dataCount <= 0) {
      resolve(null);
      return;
    }

    // Schedule application in next frame for stabilization
    const rafId = requestAnimationFrame(() => {
      pendingRangeApplication = null;
      
      try {
        const result = calculateRangePreset(preset, bounds, timezoneId);
        const timeScale = chart.timeScale();
        
        // Apply the range
        timeScale.setVisibleRange({
          from: result.from as Time,
          to: result.to as Time,
        });
        
        resolve(result);
      } catch (error) {
        console.warn("[applyRangePreset] Failed to apply range:", error);
        resolve(null);
      }
    });

    pendingRangeApplication = { preset, rafId };
  });
}

/**
 * Get the human-readable description of a range preset
 */
export function getRangePresetDescription(preset: RangePresetKey): string {
  switch (preset) {
    case "1D": return "1 Day";
    case "5D": return "5 Days";
    case "1M": return "1 Month";
    case "6M": return "6 Months";
    case "YTD": return "Year to Date";
    case "1Y": return "1 Year";
    case "All": return "All Data";
    default: return preset;
  }
}

/**
 * Check if a range preset is valid for given data bounds
 * Returns false if the data doesn't have enough history for meaningful display
 */
export function isRangePresetValid(
  preset: RangePresetKey,
  bounds: DataBounds | null
): boolean {
  if (!bounds || bounds.dataCount <= 0) return false;
  
  // All and YTD are always valid if we have any data
  if (preset === "All" || preset === "YTD") return true;
  
  const rangeSeconds = RANGE_SECONDS[preset];
  if (rangeSeconds === null) return true;
  
  // Check if data spans at least half the requested range
  const dataSpan = bounds.lastBarTime - bounds.firstBarTime;
  return dataSpan >= rangeSeconds * 0.25; // Allow some slack
}

/**
 * Create robust DataBounds from an array of bar times.
 * Ensures barTimes is sorted ascending and min/max are correct even if input is unsorted.
 * 
 * @param times - Array of bar timestamps (unix seconds)
 * @returns DataBounds with guaranteed sorted barTimes, or null if empty
 */
export function createDataBounds(times: number[]): DataBounds | null {
  if (!times || times.length === 0) return null;
  
  // Create sorted copy (ascending order - required for binary search)
  const sortedTimes = [...times].sort((a, b) => a - b);
  
  // Min/max from sorted array (guaranteed correct)
  const firstBarTime = sortedTimes[0];
  const lastBarTime = sortedTimes[sortedTimes.length - 1];
  
  return {
    firstBarTime,
    lastBarTime,
    dataCount: sortedTimes.length,
    barTimes: sortedTimes,
  };
}

/**
 * Check if an array of timestamps is monotonically increasing
 */
export function isMonotonic(times: number[]): boolean {
  if (!times || times.length <= 1) return true;
  for (let i = 1; i < times.length; i++) {
    if (times[i] < times[i - 1]) return false;
  }
  return true;
}
/**
 * TV-37.2: Calculate if backfill is needed for a range preset
 * 
 * Returns the required start timestamp (ISO string) if current data is insufficient,
 * or null if current data already covers the range.
 * 
 * @param preset - Range preset to check
 * @param bounds - Current data bounds
 * @param timezoneId - IANA timezone for YTD calculation
 * @returns Object with needsBackfill flag and start/end ISO strings if needed
 */
export function calculateBackfillNeeded(
  preset: RangePresetKey,
  bounds: DataBounds | null,
  timezoneId: string = "UTC"
): { needsBackfill: boolean; startIso?: string; endIso?: string; targetStartUnix?: number } {
  if (!bounds || bounds.dataCount <= 0) {
    return { needsBackfill: false };
  }

  const { firstBarTime, lastBarTime } = bounds;
  let targetStartUnix: number;

  // Calculate the target range start time
  if (preset === "All") {
    // All preset doesn't need backfill - uses all available data
    return { needsBackfill: false };
  } else if (preset === "YTD") {
    // YTD: Jan 1 of the year containing the last bar
    const lastBarDate = new Date(lastBarTime * 1000);
    const year = lastBarDate.getUTCFullYear();
    const jan1 = new Date(Date.UTC(year, 0, 1));
    targetStartUnix = Math.floor(jan1.getTime() / 1000);
  } else {
    // Other presets: calculate from duration
    const rangeSeconds = RANGE_SECONDS[preset];
    if (rangeSeconds === null) {
      return { needsBackfill: false };
    }
    // Add buffer (10% extra) to avoid edge cases
    const bufferSeconds = Math.floor(rangeSeconds * 0.1);
    targetStartUnix = lastBarTime - rangeSeconds - bufferSeconds;
  }

  // Check if current data covers the target range
  if (firstBarTime <= targetStartUnix) {
    // Already have enough data
    return { needsBackfill: false };
  }

  // Need backfill: convert to ISO strings for API
  const startDate = new Date(targetStartUnix * 1000);
  const endDate = new Date((lastBarTime + 86400) * 1000); // +1 day buffer

  return {
    needsBackfill: true,
    startIso: startDate.toISOString(),
    endIso: endDate.toISOString(),
    targetStartUnix,
  };
}