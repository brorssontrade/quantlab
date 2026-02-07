/**
 * useBreadthData.ts
 * 
 * Hook for fetching market breadth data for ADR/ADL/ADR_B indicators.
 * 
 * Breadth data represents the number of advancing and declining stocks
 * in a market (e.g., NYSE, NASDAQ, combined US) for each trading day.
 * 
 * TradingView uses this data for:
 * - ADR (Advance/Decline Ratio): advances / declines per bar
 * - ADR_B (Advance/Decline Ratio Bars): rolling sum of advances / rolling sum of declines
 * - ADL (Advance/Decline Line): cumulative sum of (advances - declines)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { NormalizedBar } from "../types";
import { getDataMode } from "../runtime/dataClient";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface BreadthBarData {
  time: number;       // Unix timestamp in seconds
  advances: number;   // Number of advancing stocks
  declines: number;   // Number of declining stocks
  unchanged: number;  // Number of unchanged stocks
}

export interface UseBreadthDataParams {
  apiBase: string;
  symbol: string;
  chartBars: NormalizedBar[];
  enabled?: boolean;
}

export interface UseBreadthDataResult {
  /**
   * Array of breadth data points, aligned with chart bar times.
   */
  breadthData: BreadthBarData[];
  
  /**
   * ADL seed value for historical parity (cumulative offset).
   */
  adlSeed: number;
  
  /**
   * Market key used for this symbol (e.g., "US", "NYSE", "NASDAQ").
   */
  marketKey: string | null;
  
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

const BREADTH_CACHE_TTL = 3600_000; // 1 hour (breadth data is daily)

// Module-level cache
const breadthCache = new Map<string, { 
  data: BreadthBarData[]; 
  adlSeed: number;
  marketKey: string;
  timestamp: number;
}>();

// ---------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------

export function useBreadthData(params: UseBreadthDataParams): UseBreadthDataResult {
  const { apiBase, symbol, chartBars, enabled = true } = params;
  
  const [breadthData, setBreadthData] = useState<BreadthBarData[]>([]);
  const [adlSeed, setAdlSeed] = useState(0);
  const [marketKey, setMarketKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  
  // Compute date range from chart bars
  const dateRange = useMemo(() => {
    if (!chartBars.length) return null;
    
    // Get first and last bar times
    const times = chartBars.map(b => b.time).filter(t => typeof t === "number");
    if (!times.length) return null;
    
    const startTime = Math.min(...times);
    const endTime = Math.max(...times);
    
    return {
      start: new Date(startTime * 1000).toISOString(),
      end: new Date(endTime * 1000).toISOString(),
    };
  }, [chartBars]);
  
  // Cache key
  const cacheKey = useMemo(() => {
    if (!symbol || !dateRange) return null;
    return `${symbol}__${dateRange.start}__${dateRange.end}`;
  }, [symbol, dateRange]);
  
  // Fetch function
  const fetchBreadth = useCallback(async () => {
    if (!enabled || !symbol || !dateRange || !cacheKey) {
      return;
    }
    
    // Check mock mode
    const dataMode = getDataMode();
    if (dataMode === "mock") {
      // In mock mode, return empty data
      setBreadthData([]);
      setAdlSeed(0);
      setMarketKey("MOCK");
      return;
    }
    
    // Check cache
    const cached = breadthCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.timestamp < BREADTH_CACHE_TTL) {
      setBreadthData(cached.data);
      setAdlSeed(cached.adlSeed);
      setMarketKey(cached.marketKey);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const url = new URL(`${apiBase}/chart/breadth`);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("timeframe", "1d");
      url.searchParams.set("start", dateRange.start);
      url.searchParams.set("end", dateRange.end);
      url.searchParams.set("limit", "5000");
      
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`Breadth API returned ${response.status}: ${response.statusText}`);
      }
      
      const json = await response.json();
      
      if (json.error) {
        // API returned error message - this is expected if no data
        setError(json.error);
        setBreadthData([]);
        setAdlSeed(json.adlSeed || 0);
        setMarketKey(json.marketKey || null);
        return;
      }
      
      // Parse response
      const rows = (json.rows || []).map((row: { t: string; adv: number; dec: number; unch?: number }) => ({
        time: Math.floor(new Date(row.t).getTime() / 1000),
        advances: row.adv,
        declines: row.dec,
        unchanged: row.unch || 0,
      }));
      
      // Update state
      setBreadthData(rows);
      setAdlSeed(json.adlSeed || 0);
      setMarketKey(json.marketKey || null);
      
      // Update cache
      breadthCache.set(cacheKey, {
        data: rows,
        adlSeed: json.adlSeed || 0,
        marketKey: json.marketKey || "US",
        timestamp: now,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch breadth data";
      setError(message);
      setBreadthData([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, symbol, dateRange, cacheKey, enabled]);
  
  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchBreadth();
  }, [fetchBreadth, reloadTrigger]);
  
  // Reload function
  const reload = useCallback(() => {
    // Clear cache for this key
    if (cacheKey) {
      breadthCache.delete(cacheKey);
    }
    setReloadTrigger(t => t + 1);
  }, [cacheKey]);
  
  return {
    breadthData,
    adlSeed,
    marketKey,
    loading,
    error,
    reload,
  };
}

/**
 * Align breadth data with chart bars by time.
 * 
 * Returns a Map from chart bar time (unix seconds) to breadth data.
 * For daily charts, this is a 1:1 mapping.
 */
export function alignBreadthToChartBars(
  breadthData: BreadthBarData[],
  chartBars: NormalizedBar[],
): Map<number, BreadthBarData> {
  const result = new Map<number, BreadthBarData>();
  
  if (!breadthData.length || !chartBars.length) {
    return result;
  }
  
  // Create a lookup by date (ignoring time within day)
  const breadthByDate = new Map<string, BreadthBarData>();
  for (const bd of breadthData) {
    const date = new Date(bd.time * 1000).toISOString().slice(0, 10);
    breadthByDate.set(date, bd);
  }
  
  // Match chart bars to breadth data
  for (const bar of chartBars) {
    const date = new Date(bar.time * 1000).toISOString().slice(0, 10);
    const breadth = breadthByDate.get(date);
    if (breadth) {
      result.set(bar.time, breadth);
    }
  }
  
  return result;
}

export default useBreadthData;
