import type { Time } from "@/lib/lightweightCharts";

import type { CompareMode } from "../state/compare";
import type { NormalizedBar } from "../types";

export interface BoundsSummary {
  count: number;
  minTime: number | null;
  maxTime: number | null;
}

export function alignAndTransform(
  baseRows: NormalizedBar[],
  cmpRows: NormalizedBar[],
  mode: CompareMode,
  baselineOverride?: number | null,
) {
  const baseTimes = new Set<number>();
  baseRows.forEach((row) => {
    const ts = lwTimeFromNormalized(row);
    if (ts != null) baseTimes.add(ts);
  });
  const aligned: Array<{ time: Time; value: number }> = [];
  const closes = new Map<number, number>();
  let baseline: number | null = null;
  cmpRows.forEach((row) => {
    const ts = lwTimeFromNormalized(row);
    if (ts == null || !baseTimes.has(ts)) return;
    const close = row.close;
    if (!Number.isFinite(close)) return;
    if (baseline == null) baseline = close;
    const anchor = baselineOverride ?? baseline ?? close ?? 1;
    const divisor = anchor === 0 ? 1 : anchor;
    let value = close;
    if (mode === "percent") {
      value = ((close / divisor) - 1) * 100;
    } else if (mode === "indexed") {
      value = (close / divisor) * 100;
    }
    aligned.push({ time: ts as Time, value: mode === "price" ? close : value });
    closes.set(ts, close);
  });
  return { series: aligned, closes };
}

export function describeBarBounds(rows: NormalizedBar[]): BoundsSummary {
  const times: number[] = [];
  rows.forEach((row) => {
    const ts = lwTimeFromNormalized(row);
    if (ts != null) times.push(ts);
  });
  if (!times.length) {
    return { count: 0, minTime: null, maxTime: null };
  }
  return {
    count: times.length,
    minTime: Math.min(...times),
    maxTime: Math.max(...times),
  };
}

export function describePointBounds(points: Array<{ time: Time }>): BoundsSummary {
  const times: number[] = [];
  points.forEach((point) => {
    const value = normalizeTimeKey(point.time);
    if (value != null) times.push(value);
  });
  if (!times.length) {
    return { count: 0, minTime: null, maxTime: null };
  }
  return {
    count: times.length,
    minTime: Math.min(...times),
    maxTime: Math.max(...times),
  };
}

export function lwTimeFromNormalized(row: NormalizedBar): number | null {
  if (typeof row.time === "number" && Number.isFinite(row.time)) {
    return Number(row.time);
  }
  if (typeof row.timestampMs === "number" && Number.isFinite(row.timestampMs)) {
    return Math.floor(row.timestampMs / 1000);
  }
  return null;
}

export function normalizeCompareMode(input: string | null | undefined): CompareMode | null {
  if (!input) return null;
  const value = input.toLowerCase();
  if (value === "percent" || value === "pct" || value === "relative" || value === "overlay") return "percent";
  if (value === "indexed" || value === "index" || value === "base100") return "indexed";
  if (value === "price" || value === "absolute") return "price";
  return null;
}

export function normalizeTimeKey(time: Time | undefined): number | null {
  if (typeof time === "number" && Number.isFinite(time)) {
    return Number(time);
  }
  if (time && typeof time === "object" && "year" in time) {
    return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
  }
  return null;
}

export function buildSmaSeries(rows: NormalizedBar[], length: number) {
  if (length <= 1) {
    return rows
      .map((row) => {
        const ts = lwTimeFromNormalized(row);
        return ts == null ? null : { time: ts as Time, value: row.close };
      })
      .filter(Boolean) as Array<{ time: Time; value: number }>;
  }
  const queue: number[] = [];
  let sum = 0;
  const series: Array<{ time: Time; value: number }> = [];
  rows.forEach((row) => {
    const ts = lwTimeFromNormalized(row);
    if (ts == null || !Number.isFinite(row.close)) return;
    queue.push(row.close);
    sum += row.close;
    if (queue.length > length) {
      sum -= queue.shift() ?? 0;
    }
    if (queue.length === length) {
      series.push({ time: ts as Time, value: sum / length });
    }
  });
  return series;
}

export function buildEmaSeries(rows: NormalizedBar[], length: number) {
  const multiplier = length > 0 ? 2 / (length + 1) : 1;
  const closes: Array<{ time: Time; close: number }> = [];
  rows.forEach((row) => {
    const ts = lwTimeFromNormalized(row);
    if (ts == null || !Number.isFinite(row.close)) return;
    closes.push({ time: ts as Time, close: row.close });
  });
  if (!closes.length) return [];
  const series: Array<{ time: Time; value: number }> = [];
  if (length <= 1) {
    closes.forEach(({ time, close }) => series.push({ time, value: close }));
    return series;
  }
  let ema: number | null = null;
  let seedSum = 0;
  closes.forEach(({ time, close }, idx) => {
    if (ema == null) {
      seedSum += close;
      if (idx === length - 1) {
        ema = seedSum / length;
        series.push({ time, value: ema });
      }
      return;
    }
    ema = (close - ema) * multiplier + ema;
    series.push({ time, value: ema });
  });
  return series;
}

/**
 * Calculate percent-relative values for a series of normalized bars.
 * Given an anchorClose value, returns transformed OHLCV where:
 *   pctValue = ((value / anchor) - 1) * 100
 *
 * If anchorClose is 0 or invalid, returns original bars (no transform).
 */
export function transformToPctBars(bars: NormalizedBar[], anchorClose: number | null): NormalizedBar[] {
  if (!anchorClose || !Number.isFinite(anchorClose) || anchorClose === 0) {
    return bars;
  }
  return bars.map((bar) => ({
    ...bar,
    open: ((bar.open / anchorClose) - 1) * 100,
    high: ((bar.high / anchorClose) - 1) * 100,
    low: ((bar.low / anchorClose) - 1) * 100,
    close: ((bar.close / anchorClose) - 1) * 100,
  }));
}

/**
 * Find the anchor (reference) close value from bars based on a logical index.
 * Used for percent-mode: the "last visible" bar becomes the 0% reference.
 * 
 * anchorIndex can be:
 *   - a number: direct index into bars array
 *   - null/undefined: use the last bar (bars[bars.length - 1])
 */
export function findAnchorClose(bars: NormalizedBar[], anchorIndex: number | null | undefined): number | null {
  if (!bars.length) return null;
  const idx = anchorIndex ?? bars.length - 1;
  const clampedIdx = Math.max(0, Math.min(bars.length - 1, idx));
  const anchorBar = bars[clampedIdx];
  return anchorBar?.close ?? null;
}

/**
 * Transform compare rows to percent relative to its own anchor,
 * aligned/filtered to match base times (for compareScaleMode="percent").
 * 
 * Returns aligned series with percent values relative to compareAnchorClose.
 */
export function alignCompareToPercentMode(
  baseRows: NormalizedBar[],
  cmpRows: NormalizedBar[],
  compareAnchorClose: number | null,
): Array<{ time: Time; value: number }> {
  const baseTimes = new Set<number>();
  baseRows.forEach((row) => {
    const ts = lwTimeFromNormalized(row);
    if (ts != null) baseTimes.add(ts);
  });
  
  if (!compareAnchorClose || !Number.isFinite(compareAnchorClose) || compareAnchorClose === 0) {
    // Invalid anchor, return raw closes as values
    const aligned: Array<{ time: Time; value: number }> = [];
    cmpRows.forEach((row) => {
      const ts = lwTimeFromNormalized(row);
      if (ts == null || !baseTimes.has(ts)) return;
      const close = row.close;
      if (!Number.isFinite(close)) return;
      aligned.push({ time: ts as Time, value: close });
    });
    return aligned;
  }
  
  const aligned: Array<{ time: Time; value: number }> = [];
  cmpRows.forEach((row) => {
    const ts = lwTimeFromNormalized(row);
    if (ts == null || !baseTimes.has(ts)) return;
    const close = row.close;
    if (!Number.isFinite(close)) return;
    const pctValue = ((close / compareAnchorClose) - 1) * 100;
    aligned.push({ time: ts as Time, value: pctValue });
  });
  return aligned;
}

