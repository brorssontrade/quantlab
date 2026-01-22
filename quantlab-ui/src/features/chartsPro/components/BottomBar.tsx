import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tf } from "../types";

/** Data bounds for bar-index based range selection */
interface DataBounds {
  /** First bar time (UTCTimestamp - unix seconds) */
  firstBarTime: number;
  /** Last bar time (UTCTimestamp - unix seconds) */
  lastBarTime: number;
  /** Total number of bars */
  dataCount: number;
  /** Array of all bar times for index-based lookup */
  barTimes: number[];
}

/** Timezone modes */
type TimezoneMode = "UTC" | "Local";

/** Market status based on data source state */
type MarketStatus = "LIVE" | "DEMO" | "OFFLINE" | "LOADING";

interface BottomBarProps {
  chart: any; // IChartApi | null
  /** Data bounds for bar-index based range (preferred over lastBarTime) */
  dataBounds?: DataBounds | null;
  /** @deprecated Use dataBounds instead. Last bar timestamp (unix seconds) */
  lastBarTime?: number | null;
  /** Timezone mode (controlled): "UTC" | "Local" */
  timezoneMode?: TimezoneMode;
  /** Callback when timezone is toggled */
  onTimezoneToggle?: (mode: TimezoneMode) => void;
  /** Market/data status: "LIVE" | "DEMO" | "OFFLINE" | "LOADING" */
  marketStatus?: MarketStatus;
  /** Scale mode: "auto" | "log" | "percent" | "adj" */
  scaleMode?: string;
  onScaleModeChange?: (mode: string) => void;
  onRangeChange?: (rangeKey: string) => void;
}

type RangeKey = "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y" | "All";
type ScaleMode = "auto" | "log" | "percent" | "adj";

const RANGE_KEYS: RangeKey[] = ["1D", "5D", "1M", "6M", "YTD", "1Y", "All"];

/** 
 * Range durations in SECONDS (calendar days, not trading days)
 * This ensures ranges are timeframe-agnostic:
 * - 5D with 1h bars = last 5 days of hourly candles
 * - 5D with 1D bars = last 5 daily candles
 */
const RANGE_SECONDS: Record<RangeKey, number | null> = {
  "1D": 1 * 24 * 60 * 60,      // 86400 seconds
  "5D": 5 * 24 * 60 * 60,      // 432000 seconds
  "1M": 30 * 24 * 60 * 60,     // ~30 days
  "6M": 180 * 24 * 60 * 60,    // ~180 days
  "YTD": null,                  // Special: from Jan 1
  "1Y": 365 * 24 * 60 * 60,    // ~365 days
  All: null,                    // Fit all visible data
};

/**
 * BottomBar – TradingView-style bottom controls
 * - Quick ranges (1D, 5D, 1M, 6M, YTD, 1Y, All)
 * - Scale toggles (Auto, Log, %, ADJ)
 * - Market clock + timezone
 * 
 * Persists to localStorage: cp.bottomBar.*
 * Exposes dump().ui.bottomBar
 */
export function BottomBar({
  chart,
  dataBounds,
  lastBarTime,
  timezoneMode = "UTC",
  onTimezoneToggle,
  marketStatus = "OFFLINE",
  scaleMode = "auto",
  onScaleModeChange,
  onRangeChange,
}: BottomBarProps) {
  const [selectedRange, setSelectedRange] = useState<RangeKey>("1D");
  const [displayMode, setDisplayMode] = useState<ScaleMode>(scaleMode as ScaleMode);
  const [clockText, setClockText] = useState<string>("");
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted state on mount
  useEffect(() => {
    try {
      const stored = window.localStorage?.getItem("cp.bottomBar.range");
      if (stored && (RANGE_KEYS as string[]).includes(stored)) {
        setSelectedRange(stored as RangeKey);
      }
      const storedMode = window.localStorage?.getItem("cp.bottomBar.scaleMode");
      if (storedMode && ["auto", "log", "percent", "adj"].includes(storedMode)) {
        setDisplayMode(storedMode);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Update clock every second based on timezoneMode
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: timezoneMode === "Local" ? undefined : "UTC",
      });
      setClockText(formatter.format(now));
    };
    updateClock();

    clockIntervalRef.current = setInterval(updateClock, 1000);
    return () => {
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
  }, [timezoneMode]);

  // Handle timezone toggle
  const handleTimezoneToggle = useCallback(() => {
    const nextMode: TimezoneMode = timezoneMode === "UTC" ? "Local" : "UTC";
    if (onTimezoneToggle) {
      onTimezoneToggle(nextMode);
    }
  }, [timezoneMode, onTimezoneToggle]);

  // Handle range click - uses TIME-BASED range (calendar days, timeframe-agnostic)
  // 5D = last 5 calendar days, regardless of whether timeframe is 1h or 1D
  const handleRangeClick = useCallback(
    (range: RangeKey) => {
      // Determine effective bounds
      const bounds = dataBounds ?? (lastBarTime && lastBarTime > 0 ? {
        firstBarTime: lastBarTime, // Fallback: same as last
        lastBarTime: lastBarTime,
        dataCount: 1,
        barTimes: [lastBarTime],
      } : null);

      // Validate before state update
      if (!chart || !bounds || bounds.dataCount <= 0) {
        // No data yet: update UI state but skip chart update
        setSelectedRange(range);
        try {
          window.localStorage?.setItem("cp.bottomBar.range", range);
        } catch {
          // Ignore
        }
        if (onRangeChange) onRangeChange(range);
        return;
      }

      setSelectedRange(range);
      try {
        window.localStorage?.setItem("cp.bottomBar.range", range);
      } catch {
        // Ignore
      }
      if (onRangeChange) onRangeChange(range);

      // Apply range to chart using TIME-BASED approach (calendar days)
      const timeScale = chart.timeScale();
      const { firstBarTime: minTime, lastBarTime: maxTime, barTimes } = bounds;

      /**
       * Binary search to find first barTime >= targetUnix
       * Returns the bar time at that index, or minTime if target is before all bars
       */
      const findFirstBarAtOrAfter = (targetUnix: number): number => {
        if (targetUnix <= minTime) return minTime;
        if (targetUnix >= maxTime) return maxTime;
        
        let low = 0;
        let high = barTimes.length - 1;
        
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          if (barTimes[mid] < targetUnix) {
            low = mid + 1;
          } else {
            high = mid;
          }
        }
        
        return barTimes[low] ?? minTime;
      };

      if (range === "All") {
        // Show all bars
        timeScale.setVisibleRange({ from: minTime, to: maxTime });
      } else if (range === "YTD") {
        // From Jan 1 of the year containing maxTime
        const year = timezoneMode === "UTC" 
          ? new Date(maxTime * 1000).getUTCFullYear()
          : new Date(maxTime * 1000).getFullYear();
        const yearStartUnix = timezoneMode === "UTC"
          ? Math.floor(Date.UTC(year, 0, 1) / 1000)
          : Math.floor(new Date(year, 0, 1).getTime() / 1000);
        // Find first bar at or after yearStart
        const fromTime = findFirstBarAtOrAfter(yearStartUnix);
        timeScale.setVisibleRange({ from: fromTime, to: maxTime });
      } else {
        // TIME-BASED range: show last N seconds of data (calendar days)
        const rangeSeconds = RANGE_SECONDS[range];
        if (rangeSeconds === null) {
          // Fallback to all
          timeScale.setVisibleRange({ from: minTime, to: maxTime });
        } else {
          const targetStartUnix = maxTime - rangeSeconds;
          const fromTime = findFirstBarAtOrAfter(targetStartUnix);
          timeScale.setVisibleRange({ from: fromTime, to: maxTime });
        }
      }
    },
    [chart, dataBounds, lastBarTime, onRangeChange, timezoneMode]
  );

  // Handle scale mode toggle
  const handleScaleModeClick = useCallback(
    (mode: ScaleMode) => {
      if (mode === "adj") return; // ADJ disabled
      setDisplayMode(mode);
      try {
        window.localStorage?.setItem("cp.bottomBar.scaleMode", mode);
      } catch {
        // Ignore
      }
      if (onScaleModeChange) onScaleModeChange(mode);
    },
    [onScaleModeChange]
  );

  // Expose dump() state for QA - use direct merge to ensure state is always available
  useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window as any;
      const bottomBarState = {
        rangeKey: selectedRange,
        scaleMode: displayMode,
        timezoneMode: timezoneMode,
        marketStatus: marketStatus,
        clockText,
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
  }, [selectedRange, displayMode, timezoneMode, marketStatus, clockText]);

  return (
    <div className="tv-bottombar flex items-center justify-between text-sm" style={{
      // Use CSS token variables for theme parity with RightPanel
      backgroundColor: "var(--cp-panel-bg, rgb(15, 23, 42))",
      color: "var(--cp-text-secondary, rgb(148, 163, 184))",
      borderTop: "1px solid var(--cp-border, rgb(30, 41, 59))",
      gap: "var(--cp-gap)",
      padding: "var(--cp-pad-sm) var(--cp-pad)",
    }}>
      {/* Left: Range quick-select */}
      <div className="flex items-center" style={{ gap: "var(--cp-gap-sm)" }}>
        {RANGE_KEYS.map((range) => {
          const isSelected = selectedRange === range;
          const canSelect = chart && (dataBounds?.dataCount ?? 0) > 0;
          return (
            <button
              key={range}
              data-testid={`bottombar-range-${range}`}
              onClick={() => handleRangeClick(range)}
              disabled={!canSelect}
              className="px-2 py-1 rounded text-xs font-medium transition-colors"
              style={{
                backgroundColor: isSelected ? "var(--cp-accent-primary, rgb(168, 85, 247))" : "var(--cp-button-bg-idle, rgb(51, 65, 85))",
                color: isSelected ? "white" : "var(--cp-text-secondary, rgb(148, 163, 184))",
                opacity: !canSelect ? 0.5 : 1,
                cursor: !canSelect ? "not-allowed" : "pointer",
              }}
              title={!canSelect ? "No data available" : undefined}
            >
              {range}
            </button>
          );
        })}
      </div>

      {/* Middle: Scale toggles */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--cp-gap-xs)",
        padding: "0 var(--cp-pad)",
        borderLeft: "1px solid var(--cp-border, rgb(30, 41, 59))",
        borderRight: "1px solid var(--cp-border, rgb(30, 41, 59))",
      }}>
        {(["auto", "log", "percent", "adj"] as const).map((mode) => {
          const isSelected = displayMode === mode;
          const isDisabled = mode === "adj"; // ADJ not yet implemented

          return (
            <button
              key={mode}
              data-testid={`bottombar-toggle-${mode}`}
              onClick={() => !isDisabled && handleScaleModeClick(mode as ScaleMode)}
              disabled={isDisabled}
              className="px-2 py-1 rounded text-xs font-medium transition-colors"
              style={{
                backgroundColor: isDisabled ? "transparent" : isSelected ? "var(--cp-accent-secondary, rgb(59, 130, 246))" : "var(--cp-button-bg-idle, rgb(51, 65, 85))",
                color: isDisabled ? "var(--cp-text-disabled, rgb(100, 116, 139))" : isSelected ? "white" : "var(--cp-text-secondary, rgb(148, 163, 184))",
                opacity: isDisabled ? 0.4 : 1,
                cursor: isDisabled ? "not-allowed" : "pointer",
              }}
              title={isDisabled ? "ADJ: coming soon" : undefined}
            >
              {mode === "auto" ? "Auto" : mode === "log" ? "Log" : mode === "percent" ? "%" : "ADJ"}
            </button>
          );
        })}
      </div>

      {/* Right: Market status + Clock + Timezone toggle */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Market status indicator */}
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

        {/* Timezone toggle button */}
        <button
          data-testid="bottombar-tz-toggle"
          onClick={handleTimezoneToggle}
          className="text-xs px-2 py-0.5 rounded transition-colors hover:bg-slate-700/50"
          style={{ 
            color: "var(--cp-text-secondary, rgb(148, 163, 184))",
            border: "1px solid var(--cp-border, rgb(51, 65, 85))",
          }}
          title={`Switch to ${timezoneMode === "UTC" ? "Local" : "UTC"} time`}
        >
          {timezoneMode}
        </button>
      </div>
    </div>
  );
}
