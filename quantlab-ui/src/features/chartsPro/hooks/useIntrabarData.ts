/**
 * useIntrabarData.ts
 * 
 * Hook for fetching lower-timeframe (intrabar) data for Volume Delta/CVD calculations.
 * 
 * TradingView Auto-Timeframe Mapping (approximated with EODHD data):
 * - Daily (D) → 5-minute bars
 * - Weekly (1W) → 1-hour bars
 * - 4-hour (4h) → 1-hour bars
 * - 1-hour (1h) → 5-minute bars
 * - 15-minute (15m) → 5-minute bars
 * - 5-minute (5m) → 5-minute bars
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ChartTimeframe } from "../state/controls";
import type { NormalizedBar } from "../types";
import { getDataMode } from "../runtime/dataClient";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface IntrabarPoint {
  time: number;       // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface UseIntrabarDataParams {
  apiBase: string;
  symbol: string;
  chartTimeframe: ChartTimeframe;
  chartBars: NormalizedBar[];
  enabled?: boolean;
}

export interface UseIntrabarDataResult {
  /**
   * Map from chart bar time (unix seconds) to array of intrabar points.
   * Used for computing Volume Delta: aggregate up/down volume within each bar.
   */
  intrabars: Map<number, IntrabarPoint[]>;
  loading: boolean;
  error: string | null;
  intrabarTf: string | null;
  reload: () => void;
}

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

const INTRABAR_CACHE_TTL = 600_000; // 10 minutes
const MAX_FETCH_RANGE_DAYS = 30; // Limit fetch to last 30 days to avoid huge requests

// Intrabar timeframe mapping (matches backend _INTRABAR_TF_MAP)
const INTRABAR_TF_MAP: Record<string, string> = {
  "D": "5m",
  "1W": "1h",
  "4h": "1h",
  "1h": "5m",
  "15m": "5m",
  "5m": "5m",
};

// Milliseconds per chart timeframe (for bucketing)
const TF_MS: Record<string, number> = {
  "D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "5m": 5 * 60 * 1000,
};

// Module-level cache
const intrabarCache = new Map<string, { data: IntrabarPoint[]; timestamp: number }>();

// ---------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------

function getIntrabarTimeframe(chartTf: ChartTimeframe): string {
  return INTRABAR_TF_MAP[chartTf] || "5m";
}

function getChartBarDurationMs(chartTf: ChartTimeframe): number {
  return TF_MS[chartTf] || TF_MS["D"];
}

/**
 * Bucket intrabar points into chart bars.
 * Each chart bar gets an array of intrabars that fall within its time range.
 */
function bucketIntrabarsToChartBars(
  intrabars: IntrabarPoint[],
  chartBars: NormalizedBar[],
  chartTf: ChartTimeframe
): Map<number, IntrabarPoint[]> {
  const result = new Map<number, IntrabarPoint[]>();
  const durationMs = getChartBarDurationMs(chartTf);
  
  // Create index of chart bar times for fast lookup
  const barTimes = new Set(chartBars.map((b) => b.time));
  
  for (const intrabar of intrabars) {
    // Find which chart bar this intrabar belongs to
    const intrabarTimeMs = intrabar.time * 1000;
    // Floor to chart bar start time
    const chartBarTime = Math.floor(intrabarTimeMs / durationMs) * (durationMs / 1000);
    
    // Only include if we have a matching chart bar
    if (barTimes.has(chartBarTime as NormalizedBar["time"])) {
      if (!result.has(chartBarTime)) {
        result.set(chartBarTime, []);
      }
      result.get(chartBarTime)!.push(intrabar);
    }
  }
  
  return result;
}

// ---------------------------------------------------------------------
// Data Fetching
// ---------------------------------------------------------------------

async function fetchIntrabars(
  apiBase: string,
  symbol: string,
  chartTf: ChartTimeframe,
  start?: string,
  end?: string,
  signal?: AbortSignal
): Promise<IntrabarPoint[]> {
  const baseUrl = apiBase.replace(/\/$/, "");
  const url = new URL(`${baseUrl}/chart/intrabars`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("chartTf", chartTf);
  if (start) url.searchParams.set("start", start);
  if (end) url.searchParams.set("end", end);
  url.searchParams.set("limit", "10000"); // Max intrabars per request

  const response = await fetch(url.toString(), { method: "GET", signal });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Failed to fetch intrabars: ${errorText}`);
  }

  const json = await response.json();
  
  if (json.error) {
    throw new Error(json.error);
  }

  // Map backend response to IntrabarPoint
  const rows = json.rows || [];
  return rows.map((row: { t: string; o: number; h: number; l: number; c: number; v: number }) => ({
    time: Math.floor(new Date(row.t).getTime() / 1000),
    open: row.o,
    high: row.h,
    low: row.l,
    close: row.c,
    volume: row.v,
  }));
}

// ---------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------

export function useIntrabarData({
  apiBase,
  symbol,
  chartTimeframe,
  chartBars,
  enabled = true,
}: UseIntrabarDataParams): UseIntrabarDataResult {
  const [intrabars, setIntrabars] = useState<Map<number, IntrabarPoint[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const safeBase = useMemo(() => apiBase.replace(/\/$/, ""), [apiBase]);
  const normalizedSymbol = symbol.trim().toUpperCase();
  const intrabarTf = useMemo(() => getIntrabarTimeframe(chartTimeframe), [chartTimeframe]);

  const reload = useCallback(() => {
    setReloadTick((tick) => tick + 1);
  }, []);

  // Compute date range from chart bars
  const { startIso, endIso } = useMemo(() => {
    if (chartBars.length === 0) {
      return { startIso: undefined, endIso: undefined };
    }
    
    // Get visible range (last MAX_FETCH_RANGE_DAYS days from most recent bar)
    const sorted = [...chartBars].sort((a, b) => a.time - b.time);
    const latestTime = sorted[sorted.length - 1].time * 1000;
    const earliestAllowed = latestTime - MAX_FETCH_RANGE_DAYS * 24 * 60 * 60 * 1000;
    const earliestTime = Math.max(sorted[0].time * 1000, earliestAllowed);
    
    return {
      startIso: new Date(earliestTime).toISOString(),
      endIso: new Date(latestTime + getChartBarDurationMs(chartTimeframe)).toISOString(),
    };
  }, [chartBars, chartTimeframe]);

  useEffect(() => {
    if (!enabled || !normalizedSymbol || chartBars.length === 0) {
      setIntrabars(new Map());
      setError(null);
      setLoading(false);
      return;
    }

    // Demo mode or mock mode - skip fetch
    const mode = getDataMode();
    if (mode === "demo") {
      setIntrabars(new Map());
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let mounted = true;

    const fetchData = async () => {
      // Check cache first
      const cacheKey = `${normalizedSymbol}:${chartTimeframe}:${startIso}:${endIso}`;
      const cached = intrabarCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < INTRABAR_CACHE_TTL) {
        const bucketed = bucketIntrabarsToChartBars(cached.data, chartBars, chartTimeframe);
        setIntrabars(bucketed);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await fetchIntrabars(
          safeBase,
          normalizedSymbol,
          chartTimeframe,
          startIso,
          endIso,
          controller.signal
        );

        if (!mounted) return;

        // Cache the raw data
        intrabarCache.set(cacheKey, { data, timestamp: Date.now() });

        // Bucket into chart bars
        const bucketed = bucketIntrabarsToChartBars(data, chartBars, chartTimeframe);
        setIntrabars(bucketed);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted || !mounted) return;
        const message = err instanceof Error ? err.message : "Failed to fetch intrabar data";
        setError(message);
        setIntrabars(new Map());
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData().catch(() => {
      // handled above
    });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [
    safeBase,
    normalizedSymbol,
    chartTimeframe,
    chartBars.length, // Re-fetch when bar count changes significantly
    startIso,
    endIso,
    reloadTick,
    enabled,
  ]);

  return { intrabars, loading, error, intrabarTf, reload };
}

// ---------------------------------------------------------------------
// Standalone Fetch Function (for non-hook usage)
// ---------------------------------------------------------------------

export async function fetchIntrabarData(
  apiBase: string,
  symbol: string,
  chartTf: ChartTimeframe,
  chartBars: NormalizedBar[],
  signal?: AbortSignal
): Promise<{
  intrabars: Map<number, IntrabarPoint[]>;
  intrabarTf: string;
  error?: string;
}> {
  const intrabarTf = getIntrabarTimeframe(chartTf);
  
  if (chartBars.length === 0) {
    return { intrabars: new Map(), intrabarTf };
  }

  try {
    const sorted = [...chartBars].sort((a, b) => a.time - b.time);
    const latestTime = sorted[sorted.length - 1].time * 1000;
    const earliestAllowed = latestTime - MAX_FETCH_RANGE_DAYS * 24 * 60 * 60 * 1000;
    const earliestTime = Math.max(sorted[0].time * 1000, earliestAllowed);
    
    const startIso = new Date(earliestTime).toISOString();
    const endIso = new Date(latestTime + getChartBarDurationMs(chartTf)).toISOString();

    const data = await fetchIntrabars(apiBase, symbol, chartTf, startIso, endIso, signal);
    const bucketed = bucketIntrabarsToChartBars(data, chartBars, chartTf);
    
    return { intrabars: bucketed, intrabarTf };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to fetch intrabar data";
    return { intrabars: new Map(), intrabarTf, error };
  }
}
