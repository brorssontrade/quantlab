/**
 * usePVP.ts
 * 
 * Hook for Periodic Volume Profile (PVP) indicator.
 * 
 * Displays volume profiles for each period (Week/Month/Quarter/Year).
 * Similar to SVP but with configurable period type instead of session.
 * 
 * TV Reference: https://www.tradingview.com/support/solutions/43000703071-periodic-volume-profile/
 */

import { useMemo, useEffect } from "react";
import type { IChartApi, Time } from "@/lib/lightweightCharts";
import { useLtfData } from "./useLtfData";
import { useVisibleWindow, isValidWindow } from "./useVisibleWindow";
import { formatRangeDebug, ensureAscendingBars, normalizeTime } from "../utils/vpTimeUtils";
import {
  buildProfile,
  splitIntoPeriods,
  type VolumeProfile,
  type RowsLayout,
  type VPBar,
  type PeriodBoundary,
  type PeriodType,
} from "../indicators/volumeProfileEngine";
import type { VPStyleConfig, VPProfileData } from "../components/VolumeProfileOverlay";

// ============================================================================
// Types
// ============================================================================

export interface PVPConfig {
  /** Enabled state */
  enabled: boolean;
  /** Period type for profile segmentation */
  periodType: PeriodType;
  /** Rows layout mode */
  rowsLayout: RowsLayout;
  /** Number of rows per period profile */
  numRows: number;
  /** Value area percentage (0-100) */
  valueAreaPercent: number;
  /** Maximum total rows across all periods (TV limit = 6000) */
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

export interface UsePVPResult {
  /** Array of profile data (one per period) */
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
    periodCount: number;
    totalRows: number;
    periodType: PeriodType;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: PVPConfig = {
  enabled: true,
  periodType: "Week",
  rowsLayout: "Number of Rows",
  numRows: 24,
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
// Hook Implementation
// ============================================================================

export function usePVP(
  chartApi: IChartApi | null,
  apiBase: string,
  symbol: string,
  chartTf: string,
  chartBars: Array<{ time: Time | number }>,
  config: Partial<PVPConfig> = {}
): UsePVPResult {
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
    hookName: "PVP",
  });
  
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
  // Split into Periods and Compute Profiles
  // ─────────────────────────────────────────────────────────────────────────
  
  const { profiles, periodCount, totalRows } = useMemo(() => {
    if (!fullConfig.enabled || ltfBars.length === 0) {
      return { profiles: [] as VPProfileData[], periodCount: 0, totalRows: 0 };
    }
    
    // Split bars into periods
    const periods: PeriodBoundary[] = splitIntoPeriods(
      ltfBars,
      fullConfig.periodType,
      fullConfig.maxTotalRows,
      fullConfig.numRows
    );
    
    // Build profile for each period
    const tickSize = 0.01;
    const profileDataList: VPProfileData[] = [];
    let rowsUsed = 0;
    
    for (const period of periods) {
      if (period.bars.length === 0) continue;
      
      const profile = buildProfile({
        bars: period.bars,
        rowsLayout: fullConfig.rowsLayout,
        numRows: fullConfig.numRows,
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
    }
    
    return {
      profiles: profileDataList,
      periodCount: profileDataList.length,
      totalRows: rowsUsed,
    };
  }, [ltfBars, fullConfig, ltfTf]);
  
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
    periodCount,
    totalRows,
    periodType: fullConfig.periodType,
  }), [ltfTf, ltfBars.length, periodCount, totalRows, fullConfig.periodType]);
  
  useEffect(() => {
    if (fullConfig.enabled) {
      console.debug(`[PVP] ${fullConfig.periodType}: rangeStart=${rangeStart}, rangeEnd=${rangeEnd}, periods=${periodCount}, rows=${totalRows}, profiles=${profiles.length}`);
    }
  }, [fullConfig.enabled, fullConfig.periodType, rangeStart, rangeEnd, periodCount, totalRows, profiles.length]);
  
  return {
    profiles,
    style,
    loading,
    error,
    debug,
  };
}

export default usePVP;
