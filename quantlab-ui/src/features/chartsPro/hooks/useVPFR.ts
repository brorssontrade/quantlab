/**
 * useVPFR.ts
 * 
 * Hook for Fixed Range Volume Profile (VPFR) indicator.
 * 
 * Orchestrates:
 * 1. User-defined start/end time anchors (via two-click placement)
 * 2. Fetch LTF bars via useLtfData for selected range
 * 3. Compute profile via VolumeProfileEngine
 * 4. Provide data for VolumeProfileOverlay
 * 
 * TV Reference: https://www.tradingview.com/support/solutions/43000480324-fixed-range-volume-profile-indicator/
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { IChartApi, Time } from "@/lib/lightweightCharts";
import { useLtfData } from "./useLtfData";
import { buildProfile, type VolumeProfile, type RowsLayout, type VPBar } from "../indicators/volumeProfileEngine";
import type { VPStyleConfig, VPProfileData } from "../components/VolumeProfileOverlay";
import { normalizeClickTime, formatRangeDebug, normalizeTime, ensureAscendingBars } from "../utils/vpTimeUtils";

// ============================================================================
// Types
// ============================================================================

export interface VPFRConfig {
  /** Enabled state */
  enabled: boolean;
  /** Anchor start time (Unix seconds) */
  anchorStart: number;
  /** Anchor end time (Unix seconds) */
  anchorEnd: number;
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

export type VPFRAnchorState = 
  | 'none'           // Indicator not active
  | 'awaiting_first' // Waiting for first click
  | 'awaiting_second'// Has first anchor, waiting for second
  | 'anchored';      // Both anchors set, rendering profile

export interface UseVPFRResult {
  /** Array of profile data for VolumeProfileOverlay */
  profiles: VPProfileData[];
  /** Style config for VolumeProfileOverlay */
  style: VPStyleConfig;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Anchor placement state */
  anchorState: VPFRAnchorState;
  /** Callback to handle chart clicks for anchor placement (accepts LWC Time) */
  handleChartClick: (time: Time | undefined) => void;
  /** Reset anchors to start over */
  resetAnchors: () => void;
  /** Debug info */
  debug: {
    ltfTf: string;
    ltfBars: number;
    anchorStart: number;
    anchorEnd: number;
    pocPrice: number | null;
    usingFallback: boolean;
    anchorState: VPFRAnchorState;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: VPFRConfig = {
  enabled: true,
  anchorStart: 0,
  anchorEnd: 0,
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
  extendPOC: true, // VPFR extends POC by default
  extendVA: true,  // VPFR extends VA by default
  upColor: "#26A69A",
  downColor: "#EF5350",
  pocColor: "#FFEB3B",
  vaColor: "#2962FF",
  valueAreaColor: "#2962FF",
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function useVPFR(
  chartApi: IChartApi | null,
  apiBase: string,
  symbol: string,
  chartTf: string,
  chartBars: Array<{ time: Time | number; open: number; high: number; low: number; close: number; volume?: number }>,
  config: Partial<VPFRConfig> = {}
): UseVPFRResult {
  // Merge config with defaults
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
  
  // Ensure bars are in ascending time order
  const orderedBars = useMemo(() => ensureAscendingBars(chartBars), [chartBars]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Anchor State Machine (TV behavior: two-click placement)
  // ─────────────────────────────────────────────────────────────────────────
  
  // Internal anchor state (separate from config for interactive placement)
  const [internalAnchorStart, setInternalAnchorStart] = useState<number>(0);
  const [internalAnchorEnd, setInternalAnchorEnd] = useState<number>(0);
  
  // Check if config provides anchors (from saved settings)
  const hasConfigAnchors = fullConfig.anchorStart > 0 && fullConfig.anchorEnd > fullConfig.anchorStart;
  
  // Compute anchor state
  const anchorState = useMemo<VPFRAnchorState>(() => {
    if (!fullConfig.enabled) return 'none';
    // Config anchors take precedence
    if (hasConfigAnchors) return 'anchored';
    // Check internal state
    if (internalAnchorStart > 0 && internalAnchorEnd > internalAnchorStart) return 'anchored';
    if (internalAnchorStart > 0) return 'awaiting_second';
    return 'awaiting_first';
  }, [fullConfig.enabled, hasConfigAnchors, internalAnchorStart, internalAnchorEnd]);
  
  // Use config anchors if set, otherwise use internal anchors
  const rangeStart = hasConfigAnchors ? fullConfig.anchorStart : internalAnchorStart;
  const rangeEnd = hasConfigAnchors ? fullConfig.anchorEnd : internalAnchorEnd;
  const hasValidRange = rangeStart > 0 && rangeEnd > rangeStart;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Click Handlers for Anchor Placement (uses orderedBars for time mapping)
  // ─────────────────────────────────────────────────────────────────────────
  
  const handleChartClick = useCallback((clickTime: Time | undefined) => {
    if (!fullConfig.enabled || hasConfigAnchors) {
      console.debug(`[VPFR] Click ignored: enabled=${fullConfig.enabled}, hasConfigAnchors=${hasConfigAnchors}`);
      return;
    }
    
    // Normalize click time using orderedBars for reliable mapping
    const time = normalizeClickTime(chartApi, orderedBars, clickTime);
    if (time <= 0) {
      console.debug(`[VPFR] Click ignored: could not normalize time from ${clickTime}`);
      return;
    }
    
    console.debug(`[VPFR] Click received: time=${time}, state=${anchorState}`);
    
    if (internalAnchorStart === 0) {
      // First click: set start anchor
      setInternalAnchorStart(time);
      console.debug(`[VPFR] First anchor set: ${time}`);
    } else if (internalAnchorEnd === 0) {
      // Second click: set end anchor
      // Ensure end > start, swap if needed
      if (time > internalAnchorStart) {
        setInternalAnchorEnd(time);
        console.debug(`[VPFR] Second anchor set: ${time}, range: ${formatRangeDebug(internalAnchorStart, time)}`);
      } else {
        // User clicked before start, swap them
        setInternalAnchorEnd(internalAnchorStart);
        setInternalAnchorStart(time);
        console.debug(`[VPFR] Anchors swapped: ${formatRangeDebug(time, internalAnchorStart)}`);
      }
    }
    // If both anchors already set, ignore click (use resetAnchors to restart)
  }, [fullConfig.enabled, hasConfigAnchors, anchorState, internalAnchorStart, internalAnchorEnd, chartApi, orderedBars]);
  
  const resetAnchors = useCallback(() => {
    setInternalAnchorStart(0);
    setInternalAnchorEnd(0);
    console.debug('[VPFR] Anchors reset');
  }, []);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Reset anchors when symbol or timeframe changes (prevents "stuck" anchors)
  // ─────────────────────────────────────────────────────────────────────────
  
  useEffect(() => {
    // Only reset internal anchors (not config anchors) on symbol/TF change
    if (!hasConfigAnchors && (internalAnchorStart > 0 || internalAnchorEnd > 0)) {
      console.debug(`[VPFR] Symbol/TF changed (${symbol}/${chartTf}), resetting internal anchors`);
      setInternalAnchorStart(0);
      setInternalAnchorEnd(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, chartTf]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Fetch LTF Data for Anchor Range
  // ─────────────────────────────────────────────────────────────────────────
  
  const { ltfBars, ltfTf, loading, error } = useLtfData({
    apiBase,
    symbol,
    rangeStart,
    rangeEnd,
    chartTf,
    enabled: fullConfig.enabled && hasValidRange,
  });
  
  // Filter bars to range (useLtfData may return slightly more)
  const filteredBars = useMemo<VPBar[]>(() => {
    if (!hasValidRange) return [];
    return ltfBars.filter(bar => bar.time >= rangeStart && bar.time <= rangeEnd);
  }, [ltfBars, rangeStart, rangeEnd, hasValidRange]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Fallback: Use orderedBars when LTF unavailable
  // ─────────────────────────────────────────────────────────────────────────
  
  const fallbackBars = useMemo<VPBar[]>(() => {
    if (filteredBars.length > 0) return []; // LTF available
    if (!hasValidRange) return [];
    
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
        volume: bar.volume ?? 1,
      }));
  }, [filteredBars.length, hasValidRange, rangeStart, rangeEnd, orderedBars]);
  
  const barsForProfile = filteredBars.length > 0 ? filteredBars : fallbackBars;
  const effectiveLtfTf = filteredBars.length > 0 ? ltfTf : chartTf;
  const usingFallback = filteredBars.length === 0 && fallbackBars.length > 0;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Compute Volume Profile
  // ─────────────────────────────────────────────────────────────────────────
  
  const profile = useMemo<VolumeProfile | null>(() => {
    if (!fullConfig.enabled || barsForProfile.length === 0) {
      if (fullConfig.enabled && hasValidRange) {
        console.debug(`[VPFR] No profile: bars=${barsForProfile.length}, range=${formatRangeDebug(rangeStart, rangeEnd)}`);
      }
      return null;
    }
    
    console.debug(`[VPFR] Building profile: ${barsForProfile.length} bars${usingFallback ? ' (fallback)' : ''}`);
    
    const tickSize = 0.01;
    
    return buildProfile({
      bars: barsForProfile,
      rowsLayout: fullConfig.rowsLayout,
      numRows: fullConfig.numRows,
      valueAreaPct: fullConfig.valueAreaPercent / 100,
      tickSize,
      ltfTf: effectiveLtfTf,
    });
  }, [barsForProfile, fullConfig.enabled, fullConfig.numRows, fullConfig.rowsLayout, fullConfig.valueAreaPercent, effectiveLtfTf, hasValidRange, rangeStart, rangeEnd, usingFallback]);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Build Output
  // ─────────────────────────────────────────────────────────────────────────
  
  const profiles = useMemo<VPProfileData[]>(() => {
    if (!profile) return [];
    // VPFR has single profile with time bounds for proper positioning
    return [{ 
      profile,
      startTime: rangeStart,
      endTime: rangeEnd,
    }];
  }, [profile, rangeStart, rangeEnd]);
  
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
    anchorStart: rangeStart,
    anchorEnd: rangeEnd,
    pocPrice: profile?.pocPrice ?? null,
    usingFallback,
    anchorState,
  }), [effectiveLtfTf, barsForProfile.length, rangeStart, rangeEnd, profile?.pocPrice, usingFallback, anchorState]);
  
  // Debug logging for anchor state
  useEffect(() => {
    if (fullConfig.enabled) {
      console.debug(`[VPFR] State: anchor=${anchorState}, range=${formatRangeDebug(rangeStart, rangeEnd)}, bars=${barsForProfile.length}${usingFallback ? ' (fallback)' : ''}, profiles=${profiles.length}`);
    }
  }, [fullConfig.enabled, anchorState, rangeStart, rangeEnd, barsForProfile.length, usingFallback, profiles.length]);
  
  return {
    profiles,
    style,
    loading,
    error,
    anchorState,
    handleChartClick,
    resetAnchors,
    debug,
  };
}

export default useVPFR;
