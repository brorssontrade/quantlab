/**
 * useLtfData.ts
 * 
 * Hook for fetching Lower Time Frame (LTF) data for Volume Profile calculations.
 * 
 * LTF data is required for accurate volume distribution across price levels.
 * TradingView uses a 5000-bar rule to select the appropriate LTF resolution.
 * 
 * Currently supports:
 * - 5m (5 minute bars) - finest resolution from EODHD
 * - 1h (1 hour bars)
 * - 1d (daily bars) - fallback for very large ranges
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getDataMode } from "../runtime/dataClient";
import { selectLtfTf } from "../indicators/volumeProfileEngine";
import type { VPBar } from "../indicators/volumeProfileEngine";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface UseLtfDataParams {
  apiBase: string;
  symbol: string;
  /** Start of the range (Unix seconds) */
  rangeStart: number;
  /** End of the range (Unix seconds) */
  rangeEnd: number;
  /** Chart timeframe (for futures LTF selection) */
  chartTf?: string;
  /** Whether symbol is futures/spread */
  isFuturesOrSpread?: boolean;
  /** Override LTF selection (bypass 5000-bar rule) */
  forceLtfTf?: string;
  /** Whether to enable fetching */
  enabled?: boolean;
}

export interface UseLtfDataResult {
  /** Array of LTF bars for VP computation */
  ltfBars: VPBar[];
  /** The LTF timeframe selected/used */
  ltfTf: string;
  /** Number of bars returned */
  barCount: number;
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Trigger a reload */
  reload: () => void;
}

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

const LTF_CACHE_TTL = 300_000; // 5 minutes

// Module-level cache
const ltfCache = new Map<string, { 
  bars: VPBar[]; 
  ltfTf: string;
  timestamp: number;
}>();

// ---------------------------------------------------------------------
// EODHD LTF Mapping
// ---------------------------------------------------------------------

/**
 * Map desired LTF to available EODHD resolution.
 * EODHD only supports: 5m, 1h, 1d
 * 
 * We map TV LTF progression to EODHD:
 * - 1m, 3m, 5m → 5m (coarsest intraday for EODHD)
 * - 15m, 30m, 60m → 1h
 * - 240m, 1D → 1d
 */
function mapLtfToEodhd(ltfTf: string): string {
  switch (ltfTf) {
    case "1":
    case "3":
    case "5":
      return "5m";
    case "15":
    case "30":
    case "60":
      return "1h";
    case "240":
    case "1D":
    default:
      return "1d";
  }
}

// ---------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------

export function useLtfData(params: UseLtfDataParams): UseLtfDataResult {
  const { 
    apiBase, 
    symbol, 
    rangeStart, 
    rangeEnd, 
    chartTf = "D", 
    isFuturesOrSpread = false,
    forceLtfTf,
    enabled = true 
  } = params;
  
  const [ltfBars, setLtfBars] = useState<VPBar[]>([]);
  const [ltfTf, setLtfTf] = useState<string>("5m");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  
  // Calculate LTF selection
  const selectedLtf = useMemo(() => {
    if (forceLtfTf) return forceLtfTf;
    return selectLtfTf(rangeStart, rangeEnd, chartTf, isFuturesOrSpread);
  }, [rangeStart, rangeEnd, chartTf, isFuturesOrSpread, forceLtfTf]);
  
  // Map to EODHD resolution
  const eohdLtf = useMemo(() => mapLtfToEodhd(selectedLtf), [selectedLtf]);
  
  // Cache key
  const cacheKey = useMemo(() => {
    if (!symbol || !rangeStart || !rangeEnd) return null;
    return `${symbol}__${rangeStart}__${rangeEnd}__${eohdLtf}`;
  }, [symbol, rangeStart, rangeEnd, eohdLtf]);
  
  // Fetch function
  const fetchLtf = useCallback(async () => {
    if (!enabled || !symbol || !rangeStart || !rangeEnd || !cacheKey) {
      return;
    }
    
    // Check data mode - use synthetic data in demo mode or when mock param is set
    const dataMode = getDataMode();
    const urlParams = new URLSearchParams(window.location.search);
    const isMockMode = dataMode === "demo" || urlParams.get("mock") === "1";
    
    if (isMockMode) {
      // In demo/mock mode, generate synthetic bars for testing
      const mockBars = generateMockLtfBars(rangeStart, rangeEnd, eohdLtf);
      setLtfBars(mockBars);
      setLtfTf(selectedLtf);
      setLoading(false);
      return;
    }
    
    // Check cache
    const cached = ltfCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < LTF_CACHE_TTL) {
      setLtfBars(cached.bars);
      setLtfTf(cached.ltfTf);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const startIso = new Date(rangeStart * 1000).toISOString();
      const endIso = new Date(rangeEnd * 1000).toISOString();
      
      const url = new URL(`${apiBase}/chart/intrabars`);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("ltfTf", eohdLtf);
      url.searchParams.set("start", startIso);
      url.searchParams.set("end", endIso);
      url.searchParams.set("limit", "10000");
      
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Convert response to VPBar format
      const bars: VPBar[] = (data.rows || []).map((row: any) => ({
        time: Math.floor(new Date(row.t).getTime() / 1000),
        open: row.o,
        high: row.h,
        low: row.l,
        close: row.c,
        volume: row.v,
      }));
      
      // Filter to range
      const filteredBars = bars.filter(
        bar => bar.time >= rangeStart && bar.time <= rangeEnd
      );
      
      // Cache result
      ltfCache.set(cacheKey, {
        bars: filteredBars,
        ltfTf: selectedLtf,
        timestamp: Date.now(),
      });
      
      setLtfBars(filteredBars);
      setLtfTf(selectedLtf);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.warn("[useLtfData] fetch failed:", msg);
      setLtfBars([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, symbol, rangeStart, rangeEnd, cacheKey, eohdLtf, selectedLtf, apiBase]);
  
  // Trigger fetch on deps change
  useEffect(() => {
    fetchLtf();
  }, [fetchLtf, reloadTrigger]);
  
  // Reload function
  const reload = useCallback(() => {
    // Clear cache for this key
    if (cacheKey) {
      ltfCache.delete(cacheKey);
    }
    setReloadTrigger(t => t + 1);
  }, [cacheKey]);
  
  return {
    ltfBars,
    ltfTf,
    barCount: ltfBars.length,
    loading,
    error,
    reload,
  };
}

// ---------------------------------------------------------------------
// Mock Data Generator
// ---------------------------------------------------------------------

/**
 * Generate synthetic LTF bars for mock mode testing.
 */
function generateMockLtfBars(rangeStart: number, rangeEnd: number, ltfTf: string): VPBar[] {
  const bars: VPBar[] = [];
  
  // Determine interval in seconds
  let intervalSecs: number;
  switch (ltfTf) {
    case "5m": intervalSecs = 5 * 60; break;
    case "1h": intervalSecs = 60 * 60; break;
    case "1d": intervalSecs = 24 * 60 * 60; break;
    default: intervalSecs = 5 * 60;
  }
  
  // Generate bars with random walk
  let currentPrice = 100;
  const volatility = 0.02;
  
  for (let t = rangeStart; t <= rangeEnd && bars.length < 5000; t += intervalSecs) {
    const change = (Math.random() - 0.5) * volatility * currentPrice;
    const open = currentPrice;
    const close = currentPrice + change;
    const high = Math.max(open, close) + Math.random() * volatility * currentPrice * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * currentPrice * 0.5;
    const volume = 10000 + Math.random() * 90000;
    
    bars.push({
      time: t,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(volume),
    });
    
    currentPrice = close;
  }
  
  return bars;
}

// ---------------------------------------------------------------------
// Cache Management
// ---------------------------------------------------------------------

/**
 * Clear the LTF cache (useful for testing or memory management)
 */
export function clearLtfCache(): void {
  ltfCache.clear();
}

/**
 * Get cache statistics
 */
export function getLtfCacheStats(): { size: number; keys: string[] } {
  return {
    size: ltfCache.size,
    keys: Array.from(ltfCache.keys()),
  };
}
