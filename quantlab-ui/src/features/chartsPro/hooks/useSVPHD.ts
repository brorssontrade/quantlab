/**
 * useSVPHD.ts
 * 
 * Hook for Session Volume Profile HD indicator.
 * 
 * Two-pass rendering for high-definition session profiles:
 * 1. "Rough/Coarse" profiles for historical (non-visible) sessions
 * 2. "Detailed" profiles for visible sessions (higher row count)
 * 
 * TV Reference: https://www.tradingview.com/script/85kk2VNq-Session-Volume-Profile-HD/
 */

import { useMemo, useEffect, useState, useCallback, useRef } from "react";
import type { IChartApi, Time } from "@/lib/lightweightCharts";
import { useLtfData } from "./useLtfData";
import { getVisibleRangeFromBars, formatRangeDebug } from "../utils/vpTimeUtils";
import {
  buildProfile,
  splitIntoPeriods,
  type VolumeProfile,
  type RowsLayout,
  type VPBar,
  type PeriodBoundary,
} from "../indicators/volumeProfileEngine";
import type { VPStyleConfig, VPProfileData } from "../components/VolumeProfileOverlay";
import { EXCHANGE_SESSIONS, type SessionMode } from "./useSVP";

// ============================================================================
// Types
// ============================================================================

export interface SVPHDConfig {
  /** Enabled state */
  enabled: boolean;
  /** Session mode */
  sessionMode: SessionMode;
  /** Exchange for session times */
  exchange?: string;
  /** Rows layout mode */
  rowsLayout: RowsLayout;
  /** Number of rows for COARSE (historical) sessions */
  coarseRows: number;
  /** Number of rows for DETAILED (visible) sessions */
  detailedRows: number;
  /** Value area percentage (0-100) */
  valueAreaPercent: number;
  /** Maximum total rows across all sessions */
  maxTotalRows: number;
  /** Volume display mode */
  volumeMode: "Up/Down" | "Total" | "Delta";
  /** Histogram placement */
  placement: "Left" | "Right";
  /** Histogram width as % of chart */
  widthPercent: number;
  /** Show histogram bars */
  showHistogram: boolean;
  /** Show POC line */
  showPOC: boolean;
  /** Show VA lines */
  showVALines: boolean;
  /** Show VA background shading */
  showValueArea: boolean;
  /** Extend POC across chart */
  extendPOC: boolean;
  /** Extend VA lines across chart */
  extendVA: boolean;
  /** Up volume color */
  upColor: string;
  /** Down volume color */
  downColor: string;
  /** POC line color */
  pocColor: string;
  /** VA lines color */
  vaColor: string;
  /** VA background color */
  valueAreaColor: string;
}

export interface UseSVPHDResult {
  /** Array of profile data (mixed coarse + detailed) */
  profiles: VPProfileData[];
  /** Style config */
  style: VPStyleConfig;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Debug info */
  debug: {
    ltfTf: string;
    ltfBars: number;
    coarseCount: number;
    detailedCount: number;
    totalRows: number;
    sessionMode: SessionMode;
    exchange: string;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: SVPHDConfig = {
  enabled: true,
  sessionMode: "RTH",
  rowsLayout: "Number of Rows",
  coarseRows: 12,       // Fewer rows for historical
  detailedRows: 48,     // More rows for visible
  valueAreaPercent: 70,
  maxTotalRows: 6000,
  volumeMode: "Up/Down",
  placement: "Left",
  widthPercent: 70,
  showHistogram: true,
  showPOC: true,
  showVALines: true,
  showValueArea: true,
  extendPOC: false,
  extendVA: false,
  upColor: "#26A69A",
  downColor: "#EF5350",
  pocColor: "#FFEB3B",
  vaColor: "#2962FF",
  valueAreaColor: "#2962FF",
};

const RANGE_DEBOUNCE_MS = 150;

// ============================================================================
// Helper: Detect exchange from symbol
// ============================================================================

function detectExchange(symbol: string): string {
  if (symbol.includes(":")) {
    return symbol.split(":")[0].toUpperCase();
  }
  if (symbol.includes(".")) {
    const suffix = symbol.split(".").pop()?.toUpperCase() || "";
    if (["ST", "SE"].includes(suffix)) return "OMXS";
    if (["L", "LSE"].includes(suffix)) return "LSE";
    if (["DE", "F"].includes(suffix)) return "XETRA";
    if (["HK"].includes(suffix)) return "HKEX";
    if (["T", "JP"].includes(suffix)) return "TSE";
  }
  return "DEFAULT";
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSVPHD(
  chartApi: IChartApi | null,
  apiBase: string,
  symbol: string,
  chartTf: string,
  chartBars: Array<{ time: Time | number }>,
  config: Partial<SVPHDConfig> = {}
): UseSVPHDResult {
  // Merge config with defaults
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
  
  // Track visible range
  const [rangeStart, setRangeStart] = useState<number>(0);
  const [rangeEnd, setRangeEnd] = useState<number>(0);
  
  // Debounce timer
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const prevRangeRef = useRef<string>("");
  
  // Detect exchange
  const exchange = useMemo(() => {
    return fullConfig.exchange || detectExchange(symbol);
  }, [fullConfig.exchange, symbol]);
  
  const sessionInfo = useMemo(() => {
    return EXCHANGE_SESSIONS[exchange] || EXCHANGE_SESSIONS["DEFAULT"];
  }, [exchange]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Subscribe to Visible Range Changes
  // ─────────────────────────────────────────────────────────────────────────
  
  const updateVisibleRange = useCallback(() => {
    if (!chartApi) {
      console.debug("[useSVPHD] updateVisibleRange: no chart");
      return;
    }
    
    const range = getVisibleRangeFromBars(chartApi, chartBars);
    if (!range) {
      console.debug("[useSVPHD] updateVisibleRange: no valid range", { barsLen: chartBars.length });
      return;
    }
    
    console.debug("[useSVPHD] updateVisibleRange:", formatRangeDebug(range.start, range.end));
    
    const rangeKey = `${range.start}__${range.end}`;
    if (rangeKey === prevRangeRef.current) return;
    prevRangeRef.current = rangeKey;
    
    setRangeStart(range.start);
    setRangeEnd(range.end);
  }, [chartApi, chartBars]);
  
  const debouncedUpdateRange = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      updateVisibleRange();
    }, RANGE_DEBOUNCE_MS);
  }, [updateVisibleRange]);
  
  useEffect(() => {
    if (!chartApi || !fullConfig.enabled) return;
    
    const timeScale = chartApi.timeScale();
    let retryTimeout: NodeJS.Timeout | null = null;
    
    updateVisibleRange();
    
    // Retry after delay if range not captured (handles race with data loading)
    retryTimeout = setTimeout(() => {
      console.debug("[SVP HD] Retry: attempting to capture initial range after delay");
      updateVisibleRange();
    }, 300);
    
    const handleRangeChange = () => debouncedUpdateRange();
    
    timeScale.subscribeVisibleTimeRangeChange(handleRangeChange);
    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange);
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      timeScale.unsubscribeVisibleTimeRangeChange(handleRangeChange);
      timeScale.unsubscribeVisibleLogicalRangeChange(handleRangeChange);
    };
  }, [chartApi, fullConfig.enabled, updateVisibleRange, debouncedUpdateRange]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Fetch LTF Data (need wider range for coarse profiles)
  // ─────────────────────────────────────────────────────────────────────────
  
  // For HD, we need bars beyond visible range for coarse profiles
  // Extend range by 20% on each side for coarse calculation
  const extendedRangeStart = useMemo(() => {
    if (!rangeStart || !rangeEnd) return rangeStart;
    const span = rangeEnd - rangeStart;
    return Math.floor(rangeStart - span * 0.2);
  }, [rangeStart, rangeEnd]);
  
  const { ltfBars, ltfTf, loading, error } = useLtfData({
    apiBase,
    symbol,
    rangeStart: extendedRangeStart,
    rangeEnd,
    chartTf,
    enabled: fullConfig.enabled && rangeStart > 0 && rangeEnd > rangeStart,
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Split into Sessions with Two-Pass (Coarse + Detailed)
  // ─────────────────────────────────────────────────────────────────────────
  
  const { profiles, coarseCount, detailedCount, totalRows } = useMemo(() => {
    if (!fullConfig.enabled || ltfBars.length === 0) {
      return { profiles: [] as VPProfileData[], coarseCount: 0, detailedCount: 0, totalRows: 0 };
    }
    
    // Split all bars into sessions
    const periods: PeriodBoundary[] = splitIntoPeriods(
      ltfBars,
      "Session",
      fullConfig.maxTotalRows,
      fullConfig.coarseRows // Use coarse rows for limit calculation
    );
    
    const tickSize = 0.01;
    const profileDataList: VPProfileData[] = [];
    let rowsUsed = 0;
    let coarse = 0;
    let detailed = 0;
    
    for (const period of periods) {
      if (period.bars.length === 0) continue;
      
      // Determine if session is visible (within rangeStart/rangeEnd)
      const sessionMidpoint = (period.startTime + period.endTime) / 2;
      const isVisible = sessionMidpoint >= rangeStart && sessionMidpoint <= rangeEnd;
      
      // Choose row count based on visibility
      const numRows = isVisible ? fullConfig.detailedRows : fullConfig.coarseRows;
      
      // Check if we'd exceed limit
      if (rowsUsed + numRows > fullConfig.maxTotalRows) {
        break;
      }
      
      const profile = buildProfile({
        bars: period.bars,
        rowsLayout: fullConfig.rowsLayout,
        numRows,
        valueAreaPct: fullConfig.valueAreaPercent / 100,
        tickSize,
        ltfTf,
      });
      
      profileDataList.push({
        profile,
        startTime: period.startTime,
        endTime: period.endTime,
      });
      
      rowsUsed += profile.numRows;
      if (isVisible) {
        detailed++;
      } else {
        coarse++;
      }
    }
    
    return {
      profiles: profileDataList,
      coarseCount: coarse,
      detailedCount: detailed,
      totalRows: rowsUsed,
    };
  }, [ltfBars, fullConfig, ltfTf, rangeStart, rangeEnd]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Build Output
  // ─────────────────────────────────────────────────────────────────────────
  
  const style = useMemo<VPStyleConfig>(() => ({
    upColor: fullConfig.upColor,
    downColor: fullConfig.downColor,
    pocColor: fullConfig.pocColor,
    vahColor: fullConfig.vaColor,
    valColor: fullConfig.vaColor,
    pocWidth: 2,
    vaWidth: 1,
    showValueArea: fullConfig.showValueArea,
    valueAreaColor: fullConfig.valueAreaColor,
    valueAreaOpacity: 0.1,
    widthPercent: fullConfig.widthPercent,
    placement: fullConfig.placement,
    showHistogram: fullConfig.showHistogram,
    volumeMode: fullConfig.volumeMode,
    showPOC: fullConfig.showPOC,
    showVALines: fullConfig.showVALines,
    extendPOC: fullConfig.extendPOC,
    extendVA: fullConfig.extendVA,
  }), [fullConfig]);
  
  const debug = useMemo(() => ({
    ltfTf,
    ltfBars: ltfBars.length,
    coarseCount,
    detailedCount,
    totalRows,
    sessionMode: fullConfig.sessionMode,
    exchange,
  }), [ltfTf, ltfBars.length, coarseCount, detailedCount, totalRows, fullConfig.sessionMode, exchange]);
  
  useEffect(() => {
    if (fullConfig.enabled) {
      console.debug(`[SVP HD] exchange=${exchange}, rangeStart=${rangeStart}, rangeEnd=${rangeEnd}, ltfBars=${ltfBars.length}, profiles=${profiles.length}, coarse=${coarseCount}, detailed=${detailedCount}`);
    }
  }, [fullConfig.enabled, exchange, rangeStart, rangeEnd, ltfBars.length, profiles.length, coarseCount, detailedCount]);
  
  return {
    profiles,
    style,
    loading,
    error,
    debug,
  };
}

export default useSVPHD;
