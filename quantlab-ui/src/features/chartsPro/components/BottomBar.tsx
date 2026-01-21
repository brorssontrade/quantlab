import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tf } from "../types";

interface BottomBarProps {
  chart: any; // IChartApi | null
  /** Last bar timestamp (unix seconds) */
  lastBarTime?: number | null;
  /** Timezone: "UTC" | "Local" */
  timezone?: string;
  /** Scale mode: "auto" | "log" | "percent" | "adj" */
  scaleMode?: string;
  onScaleModeChange?: (mode: string) => void;
  onRangeChange?: (rangeKey: string) => void;
}

type RangeKey = "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y" | "All";
type ScaleMode = "auto" | "log" | "percent" | "adj";

const RANGE_KEYS: RangeKey[] = ["1D", "5D", "1M", "6M", "YTD", "1Y", "All"];

const RANGE_DAYS: Record<RangeKey, number | null> = {
  "1D": 1,
  "5D": 5,
  "1M": 30,
  "6M": 180,
  "YTD": null, // Special handling: start of year
  "1Y": 365,
  All: null, // Fit all visible data
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
  lastBarTime,
  timezone = "UTC",
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

  // Update clock every second
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: timezone === "Local" ? undefined : "UTC",
      });
      setClockText(formatter.format(now));
    };
    updateClock();

    clockIntervalRef.current = setInterval(updateClock, 1000);
    return () => {
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
  }, [timezone]);

  // Handle range click
  const handleRangeClick = useCallback(
    (range: RangeKey) => {
      // Validate before state update
      if (!chart || !lastBarTime || lastBarTime <= 0) {
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

      // Apply range to chart
      if (chart && lastBarTime) {
        const timeScale = chart.timeScale();
        const daysDiff = RANGE_DAYS[range];

        if (range === "All") {
          timeScale.fitContent();
        } else if (daysDiff !== null) {
          const endTime = lastBarTime;
          const startTime = endTime - daysDiff * 24 * 60 * 60; // Seconds to days
          // Clamp to ensure from < to
          timeScale.setVisibleRange({ from: Math.min(startTime, endTime), to: Math.max(startTime, endTime) });
        } else if (range === "YTD") {
          const endTime = lastBarTime;
          const year = timezone === "UTC" 
            ? new Date(endTime * 1000).getUTCFullYear()
            : new Date(endTime * 1000).getFullYear();
          const yearStart = timezone === "UTC"
            ? Math.floor(Date.UTC(year, 0, 1) / 1000)  // Jan 1 00:00 UTC
            : Math.floor(new Date(year, 0, 1).getTime() / 1000); // Jan 1 00:00 Local
          // Clamp
          timeScale.setVisibleRange({ from: Math.min(yearStart, endTime), to: Math.max(yearStart, endTime) });
        }
      }
    },
    [chart, lastBarTime, onRangeChange, timezone]
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

  // Expose dump() state
  useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window as any;
      if (w.__lwcharts && w.__lwcharts._applyPatch) {
        w.__lwcharts._applyPatch({
          ui: {
            bottomBar: {
              rangeKey: selectedRange,
              scaleMode: displayMode,
              tzMode: timezone,
              clockText,
            },
          },
        });
      }
    }
  }, [selectedRange, displayMode, timezone, clockText]);

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
          const canSelect = chart && lastBarTime && lastBarTime > 0;
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

      {/* Right: Clock + Timezone */}
      <div className="flex items-center gap-2 ml-auto">
        <span data-testid="bottombar-tz" className="text-xs" style={{ color: "var(--cp-text-secondary, rgb(148, 163, 184))" }}>
          {timezone}
        </span>
        <span className="font-mono text-xs" style={{ color: "var(--cp-text-primary, rgb(226, 232, 240))" }}>
          {clockText || "--:--:--"}
        </span>
      </div>
    </div>
  );
}
