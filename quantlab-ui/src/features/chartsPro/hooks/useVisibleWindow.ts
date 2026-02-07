/**
 * useVisibleWindow.ts
 * 
 * Single source of truth for visible window across all VP indicators.
 * 
 * Key design decisions (TV-parity):
 * 1. Uses getVisibleLogicalRange() + bar index mapping (not getVisibleTimeRange)
 * 2. Re-triggers on: timeScale changes, bar data changes, symbol/TF changes
 * 3. Provides Unix seconds, indices, and bar counts
 * 4. Validates output to prevent "stuck in history" bugs
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, Time } from "@/lib/lightweightCharts";
import { normalizeTime, formatRangeDebug } from "../utils/vpTimeUtils";

// ============================================================================
// Types
// ============================================================================

export interface VisibleWindow {
  /** Start time in Unix seconds */
  fromTime: number;
  /** End time in Unix seconds */
  toTime: number;
  /** Start bar index (0-based, clamped) */
  fromIndex: number;
  /** End bar index (0-based, clamped) */
  toIndex: number;
  /** Number of bars in visible window */
  barsInWindow: number;
  /** Lowest price in visible window */
  priceMin: number;
  /** Highest price in visible window */
  priceMax: number;
  /** Debug: formatted date range */
  debugRange: string;
  /** Debug: last update timestamp */
  lastUpdate: number;
}

export interface UseVisibleWindowOptions {
  /** Enable/disable tracking */
  enabled?: boolean;
  /** Debounce delay in ms */
  debounceMs?: number;
  /** Hook name for logging */
  hookName?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OPTIONS: Required<UseVisibleWindowOptions> = {
  enabled: true,
  debounceMs: 50,
  hookName: "useVisibleWindow",
};

const INITIAL_WINDOW: VisibleWindow = {
  fromTime: 0,
  toTime: 0,
  fromIndex: 0,
  toIndex: 0,
  barsInWindow: 0,
  priceMin: 0,
  priceMax: 0,
  debugRange: "not-initialized",
  lastUpdate: 0,
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function useVisibleWindow(
  chartApi: IChartApi | null,
  chartBars: Array<{ time: Time | number; high?: number; low?: number; open?: number; close?: number }>,
  options: UseVisibleWindowOptions = {}
): VisibleWindow {
  const opts = useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);
  
  // State: the visible window
  const [window, setWindow] = useState<VisibleWindow>(INITIAL_WINDOW);
  
  // Refs for debouncing and dedupe
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const prevKeyRef = useRef<string>("");
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Memoize bars by reference and length (detect data changes)
  const barsFingerprint = useMemo(() => {
    if (chartBars.length === 0) return "empty";
    const first = normalizeTime(chartBars[0].time as Time);
    const last = normalizeTime(chartBars[chartBars.length - 1].time as Time);
    return `${chartBars.length}:${first}:${last}`;
  }, [chartBars]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Core: Compute visible window from chart + bars
  // ─────────────────────────────────────────────────────────────────────────
  
  const computeWindow = useCallback((): VisibleWindow | null => {
    if (!chartApi || chartBars.length === 0) {
      console.debug(`[${opts.hookName}] computeWindow: no chart or bars`);
      return null;
    }
    
    const timeScale = chartApi.timeScale();
    const logicalRange = timeScale.getVisibleLogicalRange();
    
    if (!logicalRange) {
      console.debug(`[${opts.hookName}] computeWindow: no logicalRange yet`);
      return null;
    }
    
    // Clamp indices to valid bar range
    const fromIdx = Math.max(0, Math.floor(logicalRange.from));
    const toIdx = Math.min(chartBars.length - 1, Math.ceil(logicalRange.to));
    
    if (fromIdx > toIdx || fromIdx >= chartBars.length) {
      console.debug(`[${opts.hookName}] computeWindow: invalid indices from=${fromIdx} to=${toIdx} len=${chartBars.length}`);
      return null;
    }
    
    // Get times from bars at these indices
    const fromTime = normalizeTime(chartBars[fromIdx].time as Time);
    const toTime = normalizeTime(chartBars[toIdx].time as Time);
    
    // Handle descending bars by swapping if needed
    const [startTime, endTime] = fromTime <= toTime ? [fromTime, toTime] : [toTime, fromTime];
    const [startIdx, endIdx] = fromTime <= toTime ? [fromIdx, toIdx] : [toIdx, fromIdx];
    
    if (startTime <= 0 || endTime <= 0) {
      console.warn(`[${opts.hookName}] computeWindow: invalid times start=${startTime} end=${endTime}`);
      return null;
    }
    
    // Compute price range in visible window
    let priceMin = Infinity;
    let priceMax = -Infinity;
    
    for (let i = startIdx; i <= endIdx; i++) {
      const bar = chartBars[i];
      if (typeof bar.low === "number" && bar.low < priceMin) priceMin = bar.low;
      if (typeof bar.high === "number" && bar.high > priceMax) priceMax = bar.high;
    }
    
    if (!isFinite(priceMin)) priceMin = 0;
    if (!isFinite(priceMax)) priceMax = 0;
    
    const barsInWindow = endIdx - startIdx + 1;
    
    return {
      fromTime: startTime,
      toTime: endTime,
      fromIndex: startIdx,
      toIndex: endIdx,
      barsInWindow,
      priceMin,
      priceMax,
      debugRange: formatRangeDebug(startTime, endTime),
      lastUpdate: Date.now(),
    };
  }, [chartApi, chartBars, opts.hookName]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Update handler with debounce and dedupe
  // ─────────────────────────────────────────────────────────────────────────
  
  const updateWindow = useCallback(() => {
    const newWindow = computeWindow();
    if (!newWindow) return;
    
    // Dedupe: only update if window actually changed
    const key = `${newWindow.fromTime}:${newWindow.toTime}:${newWindow.barsInWindow}`;
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;
    
    console.debug(`[${opts.hookName}] Window updated: ${newWindow.debugRange}, bars=${newWindow.barsInWindow}, price=${newWindow.priceMin.toFixed(2)}-${newWindow.priceMax.toFixed(2)}`);
    setWindow(newWindow);
  }, [computeWindow, opts.hookName]);
  
  const debouncedUpdate = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(updateWindow, opts.debounceMs);
  }, [updateWindow, opts.debounceMs]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Subscribe to timeScale changes
  // ─────────────────────────────────────────────────────────────────────────
  
  useEffect(() => {
    if (!chartApi || !opts.enabled) {
      return;
    }
    
    const timeScale = chartApi.timeScale();
    
    // Handler for range changes
    const handleRangeChange = () => {
      debouncedUpdate();
    };
    
    // Subscribe
    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange);
    
    // Initial update (may fail if data not loaded yet)
    updateWindow();
    
    // Retry after delay if initial update failed (handles race with data loading)
    retryTimeoutRef.current = setTimeout(() => {
      console.debug(`[${opts.hookName}] Retry: attempting to capture window after delay`);
      updateWindow();
    }, 300);
    
    // Cleanup
    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [chartApi, opts.enabled, opts.hookName, debouncedUpdate, updateWindow]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Re-update when bars change (new data loaded, symbol change, etc.)
  // ─────────────────────────────────────────────────────────────────────────
  
  useEffect(() => {
    if (!chartApi || !opts.enabled) return;
    
    // Bars changed - need to re-compute window
    console.debug(`[${opts.hookName}] Bars fingerprint changed: ${barsFingerprint}`);
    
    // Use RAF to ensure chart has processed new data
    const rafId = requestAnimationFrame(() => {
      updateWindow();
    });
    
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [chartApi, opts.enabled, barsFingerprint, opts.hookName, updateWindow]);
  
  return window;
}

// ============================================================================
// Utility: Check if window is valid
// ============================================================================

export function isValidWindow(w: VisibleWindow): boolean {
  return (
    w.fromTime > 0 &&
    w.toTime > 0 &&
    w.toTime > w.fromTime &&
    w.barsInWindow > 0
  );
}

// ============================================================================
// Utility: Get bars slice for the visible window
// ============================================================================

export function getBarsInWindow<T extends { time: Time | number }>(
  bars: T[],
  window: VisibleWindow
): T[] {
  if (!isValidWindow(window)) return [];
  
  const start = Math.max(0, window.fromIndex);
  const end = Math.min(bars.length - 1, window.toIndex);
  
  if (start > end) return [];
  
  return bars.slice(start, end + 1);
}
