/**
 * useAAVP.ts
 * 
 * Hook for Auto Anchored Volume Profile (AAVP) indicator.
 * 
 * Anchor Modes (TV-exact):
 * - Auto: Session/Month/Quarter/Year/Decade based on chart TF
 * - Highest High: Anchor at highest high within Length bars
 * - Lowest Low: Anchor at lowest low within Length bars
 * 
 * TV Reference: https://www.tradingview.com/support/solutions/43000703077-auto-anchored-volume-profile/
 */

import { useEffect, useMemo } from "react";
import type { IChartApi, Time } from "@/lib/lightweightCharts";
import { useLtfData } from "./useLtfData";
import { useVisibleWindow, isValidWindow } from "./useVisibleWindow";
import {
  buildProfile,
  getAutoAnchorPeriod,
  findHighLowAnchor,
  type VolumeProfile,
  type RowsLayout,
  type VPBar,
  type AnchorPeriod,
} from "../indicators/volumeProfileEngine";
import type { VPStyleConfig, VPProfileData } from "../components/VolumeProfileOverlay";
import { formatRangeDebug, ensureAscendingBars, normalizeTime } from "../utils/vpTimeUtils";

// ============================================================================
// Types
// ============================================================================

export type AAVPAnchorMode =
  | "Auto"
  | "Highest High"
  | "Lowest Low";

export interface AAVPConfig {
  /** Enabled state */
  enabled: boolean;
  /** Anchor mode */
  anchorMode: AAVPAnchorMode;
  /** Lookback length for HH/LL modes */
  length: number;
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

export interface UseAAVPResult {
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
    anchorMode: AAVPAnchorMode;
    anchorPeriod: AnchorPeriod | null;
    anchorStart: number;
    anchorPrice: number | null;
    pocPrice: number | null;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: AAVPConfig = {
  enabled: true,
  anchorMode: "Auto",
  length: 20,
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

// ============================================================================
// Helper: Get period start for Auto mode
// ============================================================================

function getPeriodStartForAuto(
  currentTime: number,
  anchorPeriod: AnchorPeriod
): number {
  const date = new Date(currentTime * 1000);
  
  switch (anchorPeriod) {
    case "Session":
      // Start of current day (UTC)
      return Math.floor(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
      ) / 1000);
    
    case "Month":
      return Math.floor(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        1
      ) / 1000);
    
    case "Quarter":
      const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
      return Math.floor(Date.UTC(
        date.getUTCFullYear(),
        quarterMonth,
        1
      ) / 1000);
    
    case "Year":
      return Math.floor(Date.UTC(
        date.getUTCFullYear(),
        0,
        1
      ) / 1000);
    
    case "Decade":
      const decadeYear = Math.floor(date.getUTCFullYear() / 10) * 10;
      return Math.floor(Date.UTC(decadeYear, 0, 1) / 1000);
    
    default:
      return currentTime;
  }
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAAVP(
  chartApi: IChartApi | null,
  apiBase: string,
  symbol: string,
  chartTf: string,
  chartBars: VPBar[], // Current chart bars for HH/LL calculation
  config: Partial<AAVPConfig> = {}
): UseAAVPResult {
  // Merge config with defaults
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
  
  // Ensure bars are in ascending time order
  const orderedBars = useMemo(() => ensureAscendingBars(chartBars), [chartBars]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Use unified visible window hook (single source of truth)
  // ─────────────────────────────────────────────────────────────────────────
  
  const visibleWindow = useVisibleWindow(chartApi, orderedBars, {
    enabled: fullConfig.enabled,
    debounceMs: 100,
    hookName: "AAVP",
  });
  
  const visibleStart = visibleWindow.fromTime;
  const visibleEnd = visibleWindow.toTime;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Calculate Anchor Start
  // ─────────────────────────────────────────────────────────────────────────
  
  const anchorInfo = useMemo(() => {
    // Use visible range as primary source
    if (!fullConfig.enabled || visibleEnd === 0) {
      return { anchorStart: 0, anchorPrice: null, anchorPeriod: null as AnchorPeriod | null };
    }
    
    if (fullConfig.anchorMode === "Auto") {
      // Determine period based on chart TF
      const anchorPeriod = getAutoAnchorPeriod(chartTf);
      const anchorStart = getPeriodStartForAuto(visibleEnd, anchorPeriod);
      // Clamp to visible range if anchor would be before visible start
      const clampedStart = Math.max(anchorStart, visibleStart);
      return { anchorStart: clampedStart, anchorPrice: null, anchorPeriod };
    } else {
      // HH or LL mode - find anchor in ordered bars
      if (orderedBars.length === 0) {
        // Fallback: use visible start as anchor
        return { anchorStart: visibleStart, anchorPrice: null, anchorPeriod: null };
      }
      const { anchorTime, anchorPrice } = findHighLowAnchor(
        orderedBars,
        fullConfig.length,
        fullConfig.anchorMode
      );
      return { anchorStart: anchorTime || visibleStart, anchorPrice, anchorPeriod: null };
    }
  }, [fullConfig.enabled, fullConfig.anchorMode, fullConfig.length, orderedBars, visibleStart, visibleEnd, chartTf]);
  
  const { anchorStart, anchorPrice, anchorPeriod } = anchorInfo;
  const rangeEnd = visibleEnd;
  const hasValidRange = anchorStart > 0 && rangeEnd > anchorStart;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Fetch LTF Data
  // ─────────────────────────────────────────────────────────────────────────
  
  const { ltfBars, ltfTf, loading, error } = useLtfData({
    apiBase,
    symbol,
    rangeStart: anchorStart,
    rangeEnd,
    chartTf,
    enabled: fullConfig.enabled && hasValidRange,
  });
  
  // Filter bars to range
  const filteredBars = useMemo<VPBar[]>(() => {
    if (!hasValidRange) return [];
    return ltfBars.filter(bar => bar.time >= anchorStart && bar.time <= rangeEnd);
  }, [ltfBars, anchorStart, rangeEnd, hasValidRange]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Compute Volume Profile
  // ─────────────────────────────────────────────────────────────────────────
  
  const profile = useMemo<VolumeProfile | null>(() => {
    if (!fullConfig.enabled || filteredBars.length === 0) {
      return null;
    }
    
    const tickSize = 0.01;
    
    return buildProfile({
      bars: filteredBars,
      rowsLayout: fullConfig.rowsLayout,
      numRows: fullConfig.numRows,
      valueAreaPct: fullConfig.valueAreaPercent / 100,
      tickSize,
      ltfTf,
    });
  }, [filteredBars, fullConfig.enabled, fullConfig.numRows, fullConfig.rowsLayout, fullConfig.valueAreaPercent, ltfTf]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Build Output
  // ─────────────────────────────────────────────────────────────────────────
  
  const profiles = useMemo<VPProfileData[]>(() => {
    if (!profile) return [];
    return [{
      profile,
      startTime: anchorStart,
      endTime: rangeEnd,
    }];
  }, [profile, anchorStart, rangeEnd]);
  
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
    ltfBars: filteredBars.length,
    anchorMode: fullConfig.anchorMode,
    anchorPeriod,
    anchorStart,
    anchorPrice,
    pocPrice: profile?.pocPrice ?? null,
    visibleStart,
    visibleEnd,
  }), [ltfTf, filteredBars.length, fullConfig.anchorMode, anchorPeriod, anchorStart, anchorPrice, profile?.pocPrice, visibleStart, visibleEnd]);
  
  // Debug logging
  useEffect(() => {
    if (fullConfig.enabled) {
      console.debug(`[AAVP] anchorMode=${fullConfig.anchorMode}, anchorStart=${anchorStart}, visibleEnd=${visibleEnd}, ltfBars=${filteredBars.length}, profiles=${profiles.length}`);
    }
  }, [fullConfig.enabled, fullConfig.anchorMode, anchorStart, visibleEnd, filteredBars.length, profiles.length]);
  
  return {
    profiles,
    style,
    loading,
    error,
    debug,
  };
}

export default useAAVP;
