import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tf } from "../types";
import {
  type RangePresetKey,
  type RangePresetResult,
  RANGE_PRESET_KEYS,
  applyRangePreset,
  isRangePresetValid,
  getRangePresetDescription,
  isMonotonic,
  calculateBackfillNeeded,
  type DataBounds,
} from "../utils/rangePresets";

/** Re-export DataBounds for consumers */
export type { DataBounds } from "../utils/rangePresets";

/** Supported timezone identifiers (IANA format) */
export type TimezoneId = "UTC" | "Europe/Stockholm" | "America/New_York";

/** Timezone display names for UI */
const TIMEZONE_LABELS: Record<TimezoneId, string> = {
  "UTC": "UTC",
  "Europe/Stockholm": "Stockholm",
  "America/New_York": "New York",
};

/** Timezone list for selector */
const TIMEZONE_OPTIONS: TimezoneId[] = ["UTC", "Europe/Stockholm", "America/New_York"];

/** Market session status */
export type MarketSessionStatus = "OPEN" | "CLOSED" | "PRE" | "POST" | "—";

/** Market status based on data source state */
type MarketStatus = "LIVE" | "DEMO" | "OFFLINE" | "LOADING";

/** TV-37.2: Scale mode type (linear is default, log and percent are alternatives) */
export type ScaleModeValue = "linear" | "log" | "percent";

/** TV-37.2: Backfill request for windowed fetch */
export interface BackfillRequest {
  /** ISO start timestamp */
  startIso: string;
  /** ISO end timestamp */
  endIso: string;
  /** Target start time (unix seconds) */
  targetStartUnix: number;
  /** Preset that triggered the backfill */
  preset: RangePresetKey;
}

interface BottomBarProps {
  chart: any; // IChartApi | null
  /** Data bounds for bar-index based range (preferred over lastBarTime) */
  dataBounds?: DataBounds | null;
  /** @deprecated Use dataBounds instead. Last bar timestamp (unix seconds) */
  lastBarTime?: number | null;
  /** Timezone ID (IANA format): "UTC" | "Europe/Stockholm" | "America/New_York" */
  timezoneId?: TimezoneId;
  /** Callback when timezone is changed */
  onTimezoneChange?: (tz: TimezoneId) => void;
  /** Market/data status: "LIVE" | "DEMO" | "OFFLINE" | "LOADING" */
  marketStatus?: MarketStatus;
  /** Exchange code for market session detection (e.g., "US", "SS" for Stockholm) */
  exchangeCode?: string;
  /** TV-37.2: Auto-scale toggle (independent of mode) */
  autoScale?: boolean;
  /** TV-37.2: Callback when auto-scale is toggled */
  onAutoScaleChange?: (enabled: boolean) => void;
  /** TV-37.2: Scale mode: "linear" | "log" | "percent" */
  scaleMode?: ScaleModeValue;
  /** TV-37.2: Callback when scale mode changes */
  onScaleModeChange?: (mode: ScaleModeValue) => void;
  onRangeChange?: (rangeKey: string) => void;
  /** TV-37.2: Callback to request data backfill when range needs more history */
  onBackfillRequest?: (request: BackfillRequest) => Promise<void>;
}

/** TV-37.1: Use RangePresetKey from utility */
type RangeKey = RangePresetKey;

/** TV-37.1: Use RANGE_PRESET_KEYS from utility */
const RANGE_KEYS = RANGE_PRESET_KEYS;

/**
 * BottomBar – TradingView-style bottom controls
 * - Quick ranges (1D, 5D, 1M, 6M, YTD, 1Y, All) - TV-37.1
 * - Scale toggles (Auto, Log, %, ADJ) - TV-37.2
 * - Market clock + timezone selector
 * - Market session status (OPEN/CLOSED/PRE/POST/—)
 * 
 * Persists to localStorage: cp.bottomBar.*
 * Exposes dump().ui.bottomBar
 */
export function BottomBar({
  chart,
  dataBounds,
  lastBarTime,
  timezoneId = "UTC",
  onTimezoneChange,
  marketStatus = "OFFLINE",
  exchangeCode,
  autoScale = true,
  onAutoScaleChange,
  scaleMode = "linear",
  onScaleModeChange,
  onRangeChange,
  onBackfillRequest,
}: BottomBarProps) {
  const [selectedRange, setSelectedRange] = useState<RangeKey>("1D");
  // TV-37.2: Local state for UI - synced with props
  const [localAutoScale, setLocalAutoScale] = useState<boolean>(autoScale);
  const [localScaleMode, setLocalScaleMode] = useState<ScaleModeValue>(scaleMode);
  const [clockText, setClockText] = useState<string>("");
  const [marketSession, setMarketSession] = useState<MarketSessionStatus>("—");
  const [tzDropdownOpen, setTzDropdownOpen] = useState(false);
  // TV-37.2: Track if backfill is in progress
  const [backfillLoading, setBackfillLoading] = useState(false);
  // TV-37.2 UX: Track last range apply result for debugging
  const [lastRangeApply, setLastRangeApply] = useState<RangePresetResult | null>(null);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tzDropdownRef = useRef<HTMLDivElement>(null);

  // TV-37.2: Sync local state with props
  useEffect(() => {
    setLocalAutoScale(autoScale);
  }, [autoScale]);

  useEffect(() => {
    setLocalScaleMode(scaleMode);
  }, [scaleMode]);

  // Load persisted range state on mount (autoScale and scaleMode are owned by parent)
  useEffect(() => {
    try {
      const stored = window.localStorage?.getItem("cp.bottomBar.range");
      if (stored && (RANGE_KEYS as string[]).includes(stored)) {
        setSelectedRange(stored as RangeKey);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // TV-37.2 UX: Re-apply range preset when dataBounds changes (timeframe change)
  // This ensures the selected preset (e.g., YTD) is re-applied after data loads
  const prevDataBoundsRef = useRef<DataBounds | null | undefined>(undefined);
  useEffect(() => {
    // Skip on initial mount (undefined -> value) or if no change
    if (prevDataBoundsRef.current === undefined) {
      prevDataBoundsRef.current = dataBounds;
      return;
    }
    
    // Only re-apply if dataBounds actually changed (new data loaded)
    const prevBounds = prevDataBoundsRef.current;
    const boundsChanged = 
      dataBounds?.firstBarTime !== prevBounds?.firstBarTime ||
      dataBounds?.lastBarTime !== prevBounds?.lastBarTime ||
      dataBounds?.dataCount !== prevBounds?.dataCount;
    
    prevDataBoundsRef.current = dataBounds;
    
    if (boundsChanged && dataBounds && chart) {
      // Re-apply the currently selected range preset after a brief delay
      // to allow the chart to settle after data load
      const rafId = requestAnimationFrame(() => {
        applyRangePreset(chart, selectedRange, dataBounds, timezoneId).then((result) => {
          if (result) {
            setLastRangeApply(result);
          }
        });
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [dataBounds, chart, selectedRange, timezoneId]);

  // Update clock every second based on timezoneId
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: timezoneId,
      });
      setClockText(formatter.format(now));
    };
    updateClock();

    clockIntervalRef.current = setInterval(updateClock, 1000);
    return () => {
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
  }, [timezoneId]);

  // Compute market session status based on exchange and current time
  useEffect(() => {
    const computeSession = () => {
      const now = new Date();
      
      // Bail out to "—" if we don't have real-time data (OFFLINE/LOADING)
      // This avoids showing OPEN/PRE/POST when data is stale
      if (marketStatus === "OFFLINE" || marketStatus === "LOADING") {
        setMarketSession("—");
        return;
      }
      
      // Market session hours (simplified, in local exchange time)
      // US markets: 09:30-16:00 ET, pre: 04:00-09:30, post: 16:00-20:00
      // Stockholm: 09:00-17:30 CET
      if (!exchangeCode) {
        setMarketSession("—");
        return;
      }

      const code = exchangeCode.toUpperCase();
      
      if (code === "US" || code === "NYSE" || code === "NASDAQ") {
        // US market hours in America/New_York
        const nyFormatter = new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "numeric",
          hour12: false,
          timeZone: "America/New_York",
        });
        const [hour, minute] = nyFormatter.format(now).split(":").map(Number);
        const mins = hour * 60 + minute;
        
        // Check day of week (0 = Sunday, 6 = Saturday)
        const dayOfWeek = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          setMarketSession("CLOSED");
          return;
        }
        
        if (mins >= 570 && mins < 960) { // 09:30-16:00
          setMarketSession("OPEN");
        } else if (mins >= 240 && mins < 570) { // 04:00-09:30
          setMarketSession("PRE");
        } else if (mins >= 960 && mins < 1200) { // 16:00-20:00
          setMarketSession("POST");
        } else {
          setMarketSession("CLOSED");
        }
      } else if (code === "SS" || code === "ST" || code === "STOCKHOLM" || code === "OMX") {
        // Stockholm market hours
        const sthlmFormatter = new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "numeric",
          hour12: false,
          timeZone: "Europe/Stockholm",
        });
        const [hour, minute] = sthlmFormatter.format(now).split(":").map(Number);
        const mins = hour * 60 + minute;
        
        const dayOfWeek = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Stockholm" })).getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          setMarketSession("CLOSED");
          return;
        }
        
        if (mins >= 540 && mins < 1050) { // 09:00-17:30
          setMarketSession("OPEN");
        } else {
          setMarketSession("CLOSED");
        }
      } else {
        setMarketSession("—");
      }
    };
    
    computeSession();
    const interval = setInterval(computeSession, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [exchangeCode, marketStatus]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tzDropdownRef.current && !tzDropdownRef.current.contains(e.target as Node)) {
        setTzDropdownOpen(false);
      }
    };
    if (tzDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [tzDropdownOpen]);

  // Handle timezone selection
  const handleTimezoneSelect = useCallback((tz: TimezoneId) => {
    setTzDropdownOpen(false);
    if (onTimezoneChange) {
      onTimezoneChange(tz);
    }
  }, [onTimezoneChange]);

  // TV-37.1: Handle range click using applyRangePreset utility
  // Uses TIME-BASED ranges (calendar days, timeframe-agnostic) with stabilization
  // TV-37.2: Now with backfill support for windowed fetch
  const handleRangeClick = useCallback(
    async (range: RangeKey) => {
      // Determine effective bounds
      const bounds: DataBounds | null = dataBounds ?? (lastBarTime && lastBarTime > 0 ? {
        firstBarTime: lastBarTime, // Fallback: same as last
        lastBarTime: lastBarTime,
        dataCount: 1,
        barTimes: [lastBarTime],
      } : null);

      // Update UI state immediately for responsiveness
      setSelectedRange(range);
      try {
        window.localStorage?.setItem("cp.bottomBar.range", range);
      } catch {
        // Ignore storage errors
      }
      if (onRangeChange) onRangeChange(range);

      // TV-37.2: Check if backfill is needed for this range
      const backfillCheck = calculateBackfillNeeded(range, bounds, timezoneId);
      
      if (backfillCheck.needsBackfill && onBackfillRequest && backfillCheck.startIso && backfillCheck.endIso) {
        // Need to fetch more historical data first
        setBackfillLoading(true);
        try {
          await onBackfillRequest({
            startIso: backfillCheck.startIso,
            endIso: backfillCheck.endIso,
            targetStartUnix: backfillCheck.targetStartUnix!,
            preset: range,
          });
          // Range will be applied by the re-apply effect when dataBounds updates
        } catch (err) {
          console.warn("[BottomBar] Backfill failed:", err);
          // Fall through to apply range with current data
        } finally {
          setBackfillLoading(false);
        }
      } else {
        // Apply to chart using stabilized utility (handles rapid clicks)
        // Capture result for debugging
        applyRangePreset(chart, range, bounds, timezoneId).then((result) => {
          if (result) {
            setLastRangeApply(result);
          }
        });
      }
    },
    [chart, dataBounds, lastBarTime, onRangeChange, timezoneId, onBackfillRequest]
  );

  // TV-37.2: Handle auto-scale toggle (independent of mode)
  const handleAutoToggle = useCallback(() => {
    const newValue = !localAutoScale;
    setLocalAutoScale(newValue);
    
    // Apply to chart immediately
    if (chart) {
      try {
        chart.priceScale("right")?.applyOptions({ autoScale: newValue });
      } catch {
        // Ignore if chart not ready
      }
    }
    
    // Notify parent
    if (onAutoScaleChange) onAutoScaleChange(newValue);
  }, [chart, localAutoScale, onAutoScaleChange]);

  // TV-37.2: Handle scale mode change (linear/log/percent)
  const handleScaleModeClick = useCallback(
    (mode: ScaleModeValue) => {
      if (mode === localScaleMode) return; // Already selected
      setLocalScaleMode(mode);
      
      // Apply to chart immediately
      // LWC PriceScaleMode: 0=Normal, 1=Logarithmic, 2=Percentage, 3=IndexedTo100
      if (chart) {
        try {
          const lwcMode = mode === "log" ? 1 : mode === "percent" ? 2 : 0;
          chart.priceScale("right")?.applyOptions({ mode: lwcMode });
        } catch {
          // Ignore if chart not ready
        }
      }
      
      // Notify parent
      if (onScaleModeChange) onScaleModeChange(mode);
    },
    [chart, localScaleMode, onScaleModeChange]
  );

  // TV-37.1 + TV-37.2: Expose dump() state for QA with enhanced range and scale info
  useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window as any;
      
      // Compute effective bounds for dump
      const bounds: DataBounds | null = dataBounds ?? (lastBarTime && lastBarTime > 0 ? {
        firstBarTime: lastBarTime,
        lastBarTime: lastBarTime,
        dataCount: 1,
        barTimes: [lastBarTime],
      } : null);
      
      // Check if barTimes is monotonically increasing (sorted)
      const barTimesMonotonic = bounds?.barTimes ? isMonotonic(bounds.barTimes) : null;
      
      // TV-37.2: Enhanced bottomBar state with separate auto + mode
      const bottomBarState = {
        // Range preset state (TV-37.1)
        rangePreset: selectedRange,
        rangeKey: selectedRange, // Legacy alias
        rangeValid: isRangePresetValid(selectedRange, bounds),
        
        // TV-37.2: Scale state - auto is toggle, mode is linear/log/percent
        scale: {
          auto: localAutoScale,
          mode: localScaleMode,
        },
        // Legacy alias for backwards compatibility
        scaleMode: localAutoScale ? "auto" : localScaleMode,
        
        // Time/market state
        timezoneId: timezoneId,
        marketStatus: marketStatus,
        marketSession: marketSession,
        clockText,
        
        // Data bounds info with monotonicity check
        dataBounds: bounds ? {
          firstBarTime: bounds.firstBarTime,
          lastBarTime: bounds.lastBarTime,
          dataCount: bounds.dataCount,
          barTimesMonotonic,
        } : null,
        
        // Last range apply result for debugging (TV-37.2 UX)
        lastRangeApply: lastRangeApply ? {
          preset: lastRangeApply.preset,
          requestedFrom: lastRangeApply.requestedFrom,
          snappedFrom: lastRangeApply.from,
          to: lastRangeApply.to,
          clamped: lastRangeApply.clamped,
          debug: lastRangeApply.debug,
        } : null,
      };
      
      // Try _applyPatch first (preferred for deep merge)
      if (w.__lwcharts && typeof w.__lwcharts._applyPatch === "function") {
        w.__lwcharts._applyPatch({
          ui: { bottomBar: bottomBarState },
        });
      }
      
      // Also directly set on __lwcharts to ensure availability even if _applyPatch not ready
      if (!w.__lwcharts) w.__lwcharts = {};
      if (!w.__lwcharts._state) w.__lwcharts._state = {};
      if (!w.__lwcharts._state.ui) w.__lwcharts._state.ui = {};
      w.__lwcharts._state.ui.bottomBar = bottomBarState;
      
      // Ensure dump() returns this state
      const existingDump = w.__lwcharts.dump;
      if (typeof existingDump !== "function" || !existingDump._hasBottomBar) {
        const originalDump = existingDump;
        w.__lwcharts.dump = function() {
          const base = typeof originalDump === "function" ? originalDump() : {};
          return {
            ...base,
            ui: {
              ...(base?.ui ?? {}),
              bottomBar: w.__lwcharts._state?.ui?.bottomBar ?? bottomBarState,
            },
          };
        };
        w.__lwcharts.dump._hasBottomBar = true;
      }
    }
  }, [selectedRange, localAutoScale, localScaleMode, timezoneId, marketStatus, marketSession, clockText, dataBounds, lastBarTime, lastRangeApply]);

  // TV-37.1: Compute effective bounds for validity checking
  const effectiveBounds: DataBounds | null = dataBounds ?? (lastBarTime && lastBarTime > 0 ? {
    firstBarTime: lastBarTime,
    lastBarTime: lastBarTime,
    dataCount: 1,
    barTimes: [lastBarTime],
  } : null);

  return (
    <div 
      className="tv-bottombar flex items-center justify-between text-sm" 
      data-testid="bottombar"
      style={{
        // Use CSS token variables for theme parity with RightPanel
        backgroundColor: "var(--cp-panel, var(--cp-panel-bg, rgb(15, 23, 42)))",
        color: "var(--cp-text-secondary, rgb(148, 163, 184))",
        borderTop: "1px solid var(--cp-overlay-toolbar-border, var(--cp-border, rgb(30, 41, 59)))",
        gap: "var(--cp-space-md, var(--cp-gap, 8px))",
        padding: "var(--cp-space-xs, 4px) var(--cp-space-md, 8px)",
      }}
    >
      {/* Left: Range quick-select (TV-37.1) */}
      <div className="flex items-center" style={{ gap: "var(--cp-space-xs, 4px)" }}>
        {RANGE_KEYS.map((range) => {
          const isSelected = selectedRange === range;
          const hasData = chart && (dataBounds?.dataCount ?? 0) > 0;
          const isValid = isRangePresetValid(range, effectiveBounds);
          const canSelect = hasData;
          
          return (
            <button
              key={range}
              data-testid={`bottombar-range-${range}`}
              onClick={() => handleRangeClick(range)}
              disabled={!canSelect}
              className={`cp-icon-btn ${isSelected ? "is-active" : ""}`}
              style={{
                padding: "var(--cp-space-xs, 2px) var(--cp-space-sm, 6px)",
                fontSize: "var(--cp-font-size-xs, 11px)",
                fontWeight: isSelected ? 600 : 500,
                backgroundColor: isSelected 
                  ? "var(--cp-overlay-selection, rgb(59, 130, 246))" 
                  : "rgba(71, 85, 105, 0.4)",
                color: isSelected 
                  ? "white" 
                  : !isValid 
                    ? "rgba(148, 163, 184, 0.5)"
                    : "rgba(226, 232, 240, 0.9)",
                border: isSelected 
                  ? "1px solid transparent" 
                  : "1px solid rgba(100, 116, 139, 0.5)",
                opacity: !canSelect ? 0.4 : 1,
                transition: "all 0.15s ease",
              }}
              title={!canSelect 
                ? "No data available" 
                : !isValid 
                  ? `Not enough data for ${getRangePresetDescription(range)}`
                  : getRangePresetDescription(range)
              }
            >
              {range}
            </button>
          );
        })}
      </div>

      {/* Middle: Scale toggles (TV-37.2) */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--cp-space-xs, 4px)",
        padding: "0 var(--cp-space-md, 8px)",
        borderLeft: "1px solid var(--cp-overlay-toolbar-border, rgba(71, 85, 105, 0.5))",
        borderRight: "1px solid var(--cp-overlay-toolbar-border, rgba(71, 85, 105, 0.5))",
      }}>
        {/* Auto toggle (independent of mode) */}
        <button
          data-testid="bottombar-toggle-auto"
          onClick={handleAutoToggle}
          className={`cp-icon-btn ${localAutoScale ? "is-active" : ""}`}
          style={{
            padding: "var(--cp-space-xs, 2px) var(--cp-space-sm, 6px)",
            fontSize: "var(--cp-font-size-xs, 11px)",
            fontWeight: localAutoScale ? 600 : 500,
            backgroundColor: localAutoScale 
              ? "var(--cp-overlay-selection, rgb(59, 130, 246))" 
              : "rgba(71, 85, 105, 0.4)",
            color: localAutoScale 
              ? "white" 
              : "rgba(226, 232, 240, 0.9)",
            border: localAutoScale 
              ? "1px solid transparent" 
              : "1px solid rgba(100, 116, 139, 0.5)",
            transition: "all 0.15s ease",
          }}
          title={localAutoScale ? "Auto-scale enabled (click to disable)" : "Auto-scale disabled (click to enable)"}
        >
          Auto
        </button>
        
        {/* Divider between Auto toggle and mode buttons */}
        <div style={{
          width: 1,
          height: 16,
          backgroundColor: "var(--cp-overlay-toolbar-border, rgba(71, 85, 105, 0.5))",
          margin: "0 2px",
        }} />
        
        {/* Mode buttons (Log / % / ADJ) - mutually exclusive */}
        {(["log", "percent", "adj"] as const).map((mode) => {
          // For linear, no button is selected in the mode group
          const isSelected = mode !== "adj" && localScaleMode === mode;
          const isDisabled = mode === "adj"; // ADJ not yet implemented (TV-37.3)

          return (
            <button
              key={mode}
              data-testid={`bottombar-toggle-${mode}`}
              onClick={() => {
                if (isDisabled) return;
                // Toggle: if already selected, go back to linear; otherwise select this mode
                if (isSelected) {
                  handleScaleModeClick("linear");
                } else {
                  handleScaleModeClick(mode as ScaleModeValue);
                }
              }}
              disabled={isDisabled}
              className={`cp-icon-btn ${isSelected ? "is-active" : ""}`}
              style={{
                padding: "var(--cp-space-xs, 2px) var(--cp-space-sm, 6px)",
                fontSize: "var(--cp-font-size-xs, 11px)",
                fontWeight: isSelected ? 600 : 500,
                backgroundColor: isDisabled 
                  ? "transparent" 
                  : isSelected 
                    ? "var(--cp-overlay-selection, rgb(59, 130, 246))" 
                    : "rgba(71, 85, 105, 0.4)",
                color: isDisabled 
                  ? "rgba(148, 163, 184, 0.4)" 
                  : isSelected 
                    ? "white" 
                    : "rgba(226, 232, 240, 0.9)",
                border: isDisabled 
                  ? "1px solid rgba(100, 116, 139, 0.3)" 
                  : isSelected 
                    ? "1px solid transparent" 
                    : "1px solid rgba(100, 116, 139, 0.5)",
                opacity: isDisabled ? 0.5 : 1,
                transition: "all 0.15s ease",
              }}
              title={
                isDisabled 
                  ? "Adjusted data: coming soon (TV-37.3)" 
                  : mode === "log" 
                    ? (isSelected ? "Logarithmic scale (click to disable)" : "Enable logarithmic scale")
                    : (isSelected ? "Percent scale (click to disable)" : "Enable percent change scale")
              }
            >
              {mode === "log" ? "Log" : mode === "percent" ? "%" : "ADJ"}
            </button>
          );
        })}
      </div>

      {/* Right: Market session + Clock + Timezone selector */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Market session status (based on exchange hours) */}
        <span 
          data-testid="bottombar-market-session"
          className="text-xs font-medium px-2 py-0.5 rounded"
          style={{
            backgroundColor: marketSession === "OPEN" 
              ? "rgba(34, 197, 94, 0.2)" 
              : marketSession === "PRE" || marketSession === "POST"
                ? "rgba(234, 179, 8, 0.2)" 
                : marketSession === "CLOSED"
                  ? "rgba(239, 68, 68, 0.2)"
                  : "rgba(100, 116, 139, 0.2)",
            color: marketSession === "OPEN" 
              ? "rgb(74, 222, 128)" 
              : marketSession === "PRE" || marketSession === "POST"
                ? "rgb(250, 204, 21)" 
                : marketSession === "CLOSED"
                  ? "rgb(248, 113, 113)"
                  : "rgb(148, 163, 184)",
          }}
        >
          {marketSession === "OPEN" ? "● OPEN" : marketSession === "PRE" ? "◐ PRE" : marketSession === "POST" ? "◑ POST" : marketSession === "CLOSED" ? "○ CLOSED" : "—"}
        </span>

        {/* Data status indicator (LIVE/DEMO/etc) */}
        <span 
          data-testid="bottombar-market-status"
          className="text-xs font-medium px-2 py-0.5 rounded"
          style={{
            backgroundColor: marketStatus === "LIVE" 
              ? "rgba(34, 197, 94, 0.2)" 
              : marketStatus === "DEMO" 
                ? "rgba(234, 179, 8, 0.2)" 
                : marketStatus === "LOADING"
                  ? "rgba(59, 130, 246, 0.2)"
                  : "rgba(239, 68, 68, 0.2)",
            color: marketStatus === "LIVE" 
              ? "rgb(74, 222, 128)" 
              : marketStatus === "DEMO" 
                ? "rgb(250, 204, 21)" 
                : marketStatus === "LOADING"
                  ? "rgb(96, 165, 250)"
                  : "rgb(248, 113, 113)",
          }}
        >
          {marketStatus === "LIVE" ? "● LIVE" : marketStatus === "DEMO" ? "◐ DEMO" : marketStatus === "LOADING" ? "◌ LOADING" : "○ OFFLINE"}
        </span>

        {/* Clock */}
        <span 
          data-testid="bottombar-clock"
          className="font-mono text-xs" 
          style={{ color: "var(--cp-text-primary, rgb(226, 232, 240))" }}
        >
          {clockText || "--:--:--"}
        </span>

        {/* Timezone dropdown selector */}
        <div ref={tzDropdownRef} className="relative">
          <button
            data-testid="bottombar-tz-toggle"
            onClick={() => setTzDropdownOpen(!tzDropdownOpen)}
            className="text-xs px-2 py-0.5 rounded transition-colors hover:bg-slate-700/50 flex items-center gap-1"
            style={{ 
              color: "var(--cp-text-secondary, rgb(148, 163, 184))",
              border: "1px solid var(--cp-border, rgb(51, 65, 85))",
            }}
            title="Select timezone"
          >
            {TIMEZONE_LABELS[timezoneId]}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {/* Dropdown menu */}
          {tzDropdownOpen && (
            <div 
              data-testid="bottombar-tz-dropdown"
              className="absolute bottom-full mb-1 right-0 bg-slate-800 border border-slate-700 rounded shadow-lg z-50"
              style={{ minWidth: "120px" }}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <button
                  key={tz}
                  data-testid={`bottombar-tz-option-${tz.replace("/", "-")}`}
                  onClick={() => handleTimezoneSelect(tz)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 transition-colors"
                  style={{
                    color: tz === timezoneId ? "var(--cp-accent-primary, rgb(168, 85, 247))" : "var(--cp-text-secondary, rgb(148, 163, 184))",
                    fontWeight: tz === timezoneId ? 600 : 400,
                  }}
                >
                  {TIMEZONE_LABELS[tz]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
