/**
 * useVRVP.ts
 * 
 * Hook for Visible Range Volume Profile (VRVP) indicator.
 * 
 * Orchestrates:
 * 1. Subscribe to visible time range changes via useVisibleWindow
 * 2. Fetch LTF bars via useLtfData
 * 3. Compute profile via VolumeProfileEngine
 * 4. Provide data for VolumeProfileOverlay
 * 
 * TV Reference: https://www.tradingview.com/support/solutions/43000703076-visible-range-volume-profile/
 */

import { useEffect, useMemo } from "react";
import type { IChartApi, Time } from "@/lib/lightweightCharts";
import { useLtfData } from "./useLtfData";
import { useVisibleWindow, isValidWindow } from "./useVisibleWindow";
import { buildProfile, type VolumeProfile, type RowsLayout, type VPBar } from "../indicators/volumeProfileEngine";
import type { VPStyleConfig, VPProfileData } from "../components/VolumeProfileOverlay";
import { normalizeTime, ensureAscendingBars, formatRangeDebug } from "../utils/vpTimeUtils";

// ============================================================================
// Types
// ============================================================================

export interface VRVPConfig {
  /** Enabled state */
  enabled: boolean;
  /** Rows layout mode */
  rowsLayout: RowsLayout;
  /** Number of rows or ticks per row */
  numRows: number;
  /** Value area percentage (0-100) */
  valueAreaPercent: number;
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

export interface UseVRVPResult {
  /** Array of profile data for VolumeProfileOverlay */
  profiles: VPProfileData[];
  /** Style config for VolumeProfileOverlay */
  style: VPStyleConfig;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Debug info */
  debug: {
    ltfTf: string;
    ltfBars: number;
    rangeStart: number;
    rangeEnd: number;
    pocPrice: number | null;
    usingFallback: boolean;
    chartBarsTotal: number;
    profilesCount: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: VRVPConfig = {
  enabled: true,
  rowsLayout: "Number of Rows",
  numRows: 24,
  valueAreaPercent: 70,
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

// Debounce time for range changes (ms)
const RANGE_DEBOUNCE_MS = 100;

// ============================================================================
// Hook Implementation
// ============================================================================

export function useVRVP(
  chartApi: IChartApi | null,
  apiBase: string,
  symbol: string,
  chartTf: string,
  chartBars: Array<{ time: Time | number; open: number; high: number; low: number; close: number; volume?: number }>,
  config: Partial<VRVPConfig> = {}
): UseVRVPResult {
  // Merge config with defaults
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
  
  // Ensure bars are in ascending time order
  const orderedBars = useMemo(() => ensureAscendingBars(chartBars), [chartBars]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Use unified visible window hook (single source of truth)
  // ─────────────────────────────────────────────────────────────────────────
  
  const visibleWindow = useVisibleWindow(chartApi, orderedBars, {
    enabled: fullConfig.enabled,
    debounceMs: RANGE_DEBOUNCE_MS,
    hookName: "VRVP",
  });
  
  // Extract range times from window
  const rangeStart = visibleWindow.fromTime;
  const rangeEnd = visibleWindow.toTime;
  const hasValidRange = isValidWindow(visibleWindow);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Fetch LTF Data
  // ─────────────────────────────────────────────────────────────────────────
  
  const { ltfBars, ltfTf, loading, error } = useLtfData({
    apiBase,
    symbol,
    rangeStart,
    rangeEnd,
    chartTf,
    enabled: fullConfig.enabled && hasValidRange,
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Fallback: Convert chartBars to VPBar format when LTF unavailable
  // ─────────────────────────────────────────────────────────────────────────
  
  const fallbackBars = useMemo<VPBar[]>(() => {
    if (ltfBars.length > 0) return []; // LTF available, no fallback needed
    if (!fullConfig.enabled || !hasValidRange) return [];
    
    // Use orderedBars instead of chartBars to ensure ascending order
    return orderedBars
      .filter(bar => {
        const t = normalizeTime(bar.time as Time);
        return t >= rangeStart && t <= rangeEnd;
      })
      .map(bar => ({
        time: normalizeTime(bar.time as Time),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume ?? 1, // Default volume if missing
      }));
  }, [ltfBars.length, fullConfig.enabled, hasValidRange, rangeStart, rangeEnd, orderedBars]);
  
  // Bars to use for profile: LTF if available, else chartBars
  const barsForProfile = ltfBars.length > 0 ? ltfBars : fallbackBars;
  const effectiveLtfTf = ltfBars.length > 0 ? ltfTf : chartTf;
  const usingFallback = ltfBars.length === 0 && fallbackBars.length > 0;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Compute Volume Profile
  // ─────────────────────────────────────────────────────────────────────────
  
  const profile = useMemo<VolumeProfile | null>(() => {
    if (!fullConfig.enabled || barsForProfile.length === 0) {
      console.debug(`[VRVP] No profile: enabled=${fullConfig.enabled}, bars=${barsForProfile.length}, range=${rangeStart}-${rangeEnd}`);
      return null;
    }
    
    // Get tick size (default 0.01 for stocks)
    const tickSize = 0.01;
    
    console.debug(`[VRVP] Building profile: ${barsForProfile.length} bars (${usingFallback ? 'FALLBACK' : effectiveLtfTf})`);
    
    return buildProfile({
      bars: barsForProfile,
      rowsLayout: fullConfig.rowsLayout,
      numRows: fullConfig.numRows,
      valueAreaPct: fullConfig.valueAreaPercent / 100,
      tickSize,
      ltfTf: effectiveLtfTf,
    });
  }, [barsForProfile, fullConfig.enabled, fullConfig.numRows, fullConfig.rowsLayout, fullConfig.valueAreaPercent, effectiveLtfTf, rangeStart, rangeEnd, usingFallback]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Build Output
  // ─────────────────────────────────────────────────────────────────────────
  
  const profiles = useMemo<VPProfileData[]>(() => {
    if (!profile) return [];
    return [{ profile }]; // VRVP has single profile (no time bounds)
  }, [profile]);
  
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
    ltfTf: effectiveLtfTf,
    ltfBars: barsForProfile.length,
    rangeStart,
    rangeEnd,
    rangeDebug: visibleWindow.debugRange,
    priceMin: visibleWindow.priceMin,
    priceMax: visibleWindow.priceMax,
    barsInWindow: visibleWindow.barsInWindow,
    pocPrice: profile?.pocPrice ?? null,
    usingFallback,
    chartBarsTotal: orderedBars.length,
    profilesCount: profile ? 1 : 0,
  }), [effectiveLtfTf, barsForProfile.length, rangeStart, rangeEnd, visibleWindow, profile?.pocPrice, usingFallback, orderedBars.length]);
  
  // Debug effect: log when state changes
  useEffect(() => {
    if (fullConfig.enabled) {
      console.debug(`[VRVP] State: range=${visibleWindow.debugRange}, price=${visibleWindow.priceMin.toFixed(2)}-${visibleWindow.priceMax.toFixed(2)}, bars=${barsForProfile.length}${usingFallback ? ' (fallback)' : ''}, profiles=${profile ? 1 : 0}`);
    }
  }, [fullConfig.enabled, visibleWindow, barsForProfile.length, usingFallback, profile]);
  
  return {
    profiles,
    style,
    loading,
    error,
    debug,
  };
}

export default useVRVP;
