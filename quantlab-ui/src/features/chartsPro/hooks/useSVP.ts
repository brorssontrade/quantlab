/**
 * useSVP.ts
 * 
 * Hook for Session Volume Profile (SVP) indicator.
 * 
 * Displays separate volume profiles for each trading session.
 * 
 * Session Detection:
 * - Uses exchange timezone and session hours
 * - Supports RTH (Regular Trading Hours), ETH (Extended), and All
 * 
 * TV Reference: https://www.tradingview.com/support/solutions/43000703072-session-volume-profile/
 */

import { useMemo, useEffect } from "react";
import type { IChartApi, Time } from "@/lib/lightweightCharts";
import { useLtfData } from "./useLtfData";
import { useVisibleWindow, isValidWindow } from "./useVisibleWindow";
import {
  buildProfile,
  splitIntoPeriods,
  type VolumeProfile,
  type RowsLayout,
  type VPBar,
  type PeriodBoundary,
} from "../indicators/volumeProfileEngine";
import type { VPStyleConfig, VPProfileData } from "../components/VolumeProfileOverlay";
import { formatRangeDebug, ensureAscendingBars, normalizeTime } from "../utils/vpTimeUtils";

// ============================================================================
// Exchange Session Configuration
// ============================================================================

export interface ExchangeSession {
  timezone: string;           // IANA timezone (e.g., "America/New_York")
  rthStart: string;           // RTH start time "HH:MM"
  rthEnd: string;             // RTH end time "HH:MM"
  ethStart?: string;          // ETH start time (pre-market)
  ethEnd?: string;            // ETH end time (post-market)
}

/**
 * Exchange session definitions for common exchanges.
 * Add more as needed for full parity.
 */
export const EXCHANGE_SESSIONS: Record<string, ExchangeSession> = {
  // US Exchanges
  "NYSE": { timezone: "America/New_York", rthStart: "09:30", rthEnd: "16:00", ethStart: "04:00", ethEnd: "20:00" },
  "NASDAQ": { timezone: "America/New_York", rthStart: "09:30", rthEnd: "16:00", ethStart: "04:00", ethEnd: "20:00" },
  "AMEX": { timezone: "America/New_York", rthStart: "09:30", rthEnd: "16:00", ethStart: "04:00", ethEnd: "20:00" },
  "ARCA": { timezone: "America/New_York", rthStart: "09:30", rthEnd: "16:00", ethStart: "04:00", ethEnd: "20:00" },
  "BATS": { timezone: "America/New_York", rthStart: "09:30", rthEnd: "16:00", ethStart: "04:00", ethEnd: "20:00" },
  "CME": { timezone: "America/Chicago", rthStart: "08:30", rthEnd: "15:00" },
  "CBOT": { timezone: "America/Chicago", rthStart: "08:30", rthEnd: "15:00" },
  "NYMEX": { timezone: "America/New_York", rthStart: "09:00", rthEnd: "14:30" },
  "COMEX": { timezone: "America/New_York", rthStart: "08:20", rthEnd: "13:30" },
  
  // European Exchanges
  "LSE": { timezone: "Europe/London", rthStart: "08:00", rthEnd: "16:30" },
  "XETRA": { timezone: "Europe/Berlin", rthStart: "09:00", rthEnd: "17:30" },
  "EURONEXT": { timezone: "Europe/Paris", rthStart: "09:00", rthEnd: "17:30" },
  
  // Nordic
  "OMX": { timezone: "Europe/Stockholm", rthStart: "09:00", rthEnd: "17:30" },
  "OMXS": { timezone: "Europe/Stockholm", rthStart: "09:00", rthEnd: "17:30" },
  
  // Asia-Pacific
  "TSE": { timezone: "Asia/Tokyo", rthStart: "09:00", rthEnd: "15:00" },
  "HKEX": { timezone: "Asia/Hong_Kong", rthStart: "09:30", rthEnd: "16:00" },
  "SSE": { timezone: "Asia/Shanghai", rthStart: "09:30", rthEnd: "15:00" },
  "SZSE": { timezone: "Asia/Shanghai", rthStart: "09:30", rthEnd: "15:00" },
  "ASX": { timezone: "Australia/Sydney", rthStart: "10:00", rthEnd: "16:00" },
  
  // Default (US Eastern)
  "DEFAULT": { timezone: "America/New_York", rthStart: "09:30", rthEnd: "16:00", ethStart: "04:00", ethEnd: "20:00" },
};

export type SessionMode = "RTH" | "ETH" | "All";

// ============================================================================
// Types
// ============================================================================

export interface SVPConfig {
  /** Enabled state */
  enabled: boolean;
  /** Session mode */
  sessionMode: SessionMode;
  /** Exchange for session times (auto-detect or override) */
  exchange?: string;
  /** Rows layout mode */
  rowsLayout: RowsLayout;
  /** Number of rows per session profile */
  numRows: number;
  /** Value area percentage (0-100) */
  valueAreaPercent: number;
  /** Maximum total rows across all sessions (TV limit = 6000) */
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

export interface UseSVPResult {
  /** Array of profile data for VolumeProfileOverlay (one per session) */
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
    sessionCount: number;
    totalRows: number;
    sessionMode: SessionMode;
    exchange: string;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: SVPConfig = {
  enabled: true,
  sessionMode: "RTH",
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

// Debounce time for range changes
const RANGE_DEBOUNCE_MS = 150;

// ============================================================================
// Helper: Detect exchange from symbol
// ============================================================================

function detectExchange(symbol: string): string {
  // Try to extract exchange from symbol format "EXCHANGE:TICKER" or "TICKER.EXCHANGE"
  if (symbol.includes(":")) {
    return symbol.split(":")[0].toUpperCase();
  }
  if (symbol.includes(".")) {
    const suffix = symbol.split(".").pop()?.toUpperCase() || "";
    // Map common suffixes to exchanges
    if (["ST", "SE"].includes(suffix)) return "OMXS";
    if (["L", "LSE"].includes(suffix)) return "LSE";
    if (["DE", "F"].includes(suffix)) return "XETRA";
    if (["HK"].includes(suffix)) return "HKEX";
    if (["T", "JP"].includes(suffix)) return "TSE";
  }
  // Default to US
  return "DEFAULT";
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSVP(
  chartApi: IChartApi | null,
  apiBase: string,
  symbol: string,
  chartTf: string,
  chartBars: Array<{ time: Time | number }>,
  config: Partial<SVPConfig> = {}
): UseSVPResult {
  // Merge config with defaults
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
  
  // Ensure bars are in ascending time order
  const orderedBars = useMemo(() => ensureAscendingBars(chartBars), [chartBars]);
  
  // Detect or use configured exchange
  const exchange = useMemo(() => {
    return fullConfig.exchange || detectExchange(symbol);
  }, [fullConfig.exchange, symbol]);
  
  const sessionInfo = useMemo(() => {
    return EXCHANGE_SESSIONS[exchange] || EXCHANGE_SESSIONS["DEFAULT"];
  }, [exchange]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Use unified visible window hook (single source of truth)
  // ─────────────────────────────────────────────────────────────────────────
  
  const visibleWindow = useVisibleWindow(chartApi, orderedBars, {
    enabled: fullConfig.enabled,
    debounceMs: RANGE_DEBOUNCE_MS,
    hookName: "SVP",
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
  // Split into Sessions and Compute Profiles
  // ─────────────────────────────────────────────────────────────────────────
  
  const { profiles, totalRows, sessionCount } = useMemo(() => {
    if (!fullConfig.enabled || ltfBars.length === 0) {
      return { profiles: [] as VPProfileData[], totalRows: 0, sessionCount: 0 };
    }
    
    // Split bars into sessions
    const periods: PeriodBoundary[] = splitIntoPeriods(
      ltfBars,
      "Session",
      fullConfig.maxTotalRows,
      fullConfig.numRows
    );
    
    // Build profile for each session
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
      totalRows: rowsUsed,
      sessionCount: profileDataList.length,
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
    sessionCount,
    totalRows,
    sessionMode: fullConfig.sessionMode,
    exchange,
  }), [ltfTf, ltfBars.length, sessionCount, totalRows, fullConfig.sessionMode, exchange]);
  
  // Log session info on mount for debugging
  useEffect(() => {
    if (fullConfig.enabled) {
      console.debug(`[SVP] exchange=${exchange}, rangeStart=${rangeStart}, rangeEnd=${rangeEnd}, ltfBars=${ltfBars.length}, profiles=${profiles.length}, sessions=${sessionCount}`);
    }
  }, [fullConfig.enabled, exchange, rangeStart, rangeEnd, ltfBars.length, profiles.length, sessionCount]);
  
  return {
    profiles,
    style,
    loading,
    error,
    debug,
  };
}

export default useSVP;
