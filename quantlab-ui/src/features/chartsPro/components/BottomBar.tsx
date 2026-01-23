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
  scaleMode = "auto",
  onScaleModeChange,
  onRangeChange,
}: BottomBarProps) {
  const [selectedRange, setSelectedRange] = useState<RangeKey>("1D");
  const [displayMode, setDisplayMode] = useState<ScaleMode>(scaleMode as ScaleMode);
  const [clockText, setClockText] = useState<string>("");
  const [marketSession, setMarketSession] = useState<MarketSessionStatus>("—");
  const [tzDropdownOpen, setTzDropdownOpen] = useState(false);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tzDropdownRef = useRef<HTMLDivElement>(null);

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
  }, [exchangeCode]);

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
        // From Jan 1 of the year containing maxTime (in selected timezone)
        const dateInTz = new Date(maxTime * 1000);
        const yearStr = new Intl.DateTimeFormat("en-US", {
          year: "numeric",
          timeZone: timezoneId,
        }).format(dateInTz);
        const year = parseInt(yearStr, 10);
        // Get Jan 1 of that year in UTC
        const yearStartUnix = Math.floor(Date.UTC(year, 0, 1) / 1000);
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
    [chart, dataBounds, lastBarTime, onRangeChange, timezoneId]
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
        timezoneId: timezoneId,
        marketStatus: marketStatus,
        marketSession: marketSession,
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
  }, [selectedRange, displayMode, timezoneId, marketStatus, marketSession, clockText]);

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
