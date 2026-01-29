/**
 * TVBottomBar.tsx
 * 
 * TradingView-style Bottom Bar Component
 * 
 * Layout (left to right):
 * 1. Range presets (1D, 5D, 1M, 6M, YTD, 1Y, 5Y, All) - always readable, not hidden
 * 2. Spacer
 * 3. Scale toggles (Auto, Log, %)
 * 4. Separator  
 * 5. Market status (LIVE/DEMO/OFFLINE)
 * 6. Timezone selector
 * 
 * Contract:
 * - Height: 38-42px (set by parent grid)
 * - Range buttons: visible, readable, small text
 * - Disabled items: labeled badge/tooltip, full contrast (not grayed out illegibly)
 */

import { memo, useCallback } from "react";
import { Clock, Globe, BarChart2, Percent, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { TV_LAYOUT } from "./TVLayoutShell";

// Range preset types
export type RangePreset = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "ALL";

// Scale mode types
export type ScaleMode = "linear" | "log" | "percent";

// Market status types
export type MarketStatus = "LIVE" | "DEMO" | "OFFLINE" | "LOADING";

interface TVBottomBarProps {
  // Range
  activeRange?: RangePreset;
  onRangeChange?: (range: RangePreset) => void;
  /** Which ranges are disabled (e.g., intraday not available) */
  disabledRanges?: RangePreset[];
  
  // Scale mode
  scaleMode?: ScaleMode;
  onScaleModeChange?: (mode: ScaleMode) => void;
  autoScale?: boolean;
  onAutoScaleToggle?: () => void;
  
  // Market status
  marketStatus?: MarketStatus;
  
  // Timezone
  timezone?: string;
  onTimezoneClick?: () => void;
  
  // Time display
  currentTime?: string;
}

const RANGE_PRESETS: RangePreset[] = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"];

/** Range preset button - TV-style text+underline, no background */
function RangeButton({
  range,
  active,
  disabled,
  onClick,
}: {
  range: RangePreset;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      data-testid={`tv-range-${range}`}
      title={disabled ? `${range}: Coming soon (requires historical data)` : `Set range to ${range}`}
      className={cn(
        // TV-style: text only, no background, minimal padding
        "px-2 py-1 text-[11px] font-medium transition-colors",
        "bg-transparent border-b-2 border-transparent",
        // Active: white text with blue underline (exact TV behavior)
        active && !disabled && "text-[#d1d4dc] border-[#2962ff]",
        // Inactive: muted gray text, no underline
        !active && !disabled && "text-[#787b86] hover:text-[#d1d4dc]",
        // Disabled: very muted
        disabled && "text-[#5d606b] cursor-not-allowed"
      )}
      data-active={active}
    >
      {range}
    </button>
  );
}

/** Scale mode toggle button - TV-style minimal */
function ScaleButton({
  mode,
  active,
  onClick,
  children,
  title,
  testId,
}: {
  mode: ScaleMode | "auto";
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title={title}
      className={cn(
        // TV-style: text only, minimal padding
        "px-2 py-1 text-[11px] font-medium transition-colors flex items-center gap-1",
        "bg-transparent border-b-2 border-transparent",
        // Active: white text with blue underline
        active && "text-[#d1d4dc] border-[#2962ff]",
        // Inactive: muted gray text
        !active && "text-[#787b86] hover:text-[#d1d4dc]"
      )}
      data-active={active}
    >
      {children}
    </button>
  );
}

/** Market status badge */
function MarketStatusBadge({ status }: { status: MarketStatus }) {
  const config: Record<MarketStatus, { color: string; label: string }> = {
    LIVE: { color: "bg-[#26a69a]", label: "LIVE" },
    DEMO: { color: "bg-[#ff9800]", label: "DEMO" },
    OFFLINE: { color: "bg-[#f44336]", label: "OFF" },
    LOADING: { color: "bg-[#2962ff] animate-pulse", label: "..." },
  };
  
  const { color, label } = config[status];
  
  return (
    <div
      data-testid="tv-market-status"
      className="flex items-center gap-1 px-1.5 py-0.5 text-[11px]"
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", color)} />
      <span className="text-[#787b86] font-medium">{label}</span>
    </div>
  );
}

/** Separator */
function Separator() {
  return <div className="h-3 w-px bg-[#363a45] mx-1" aria-hidden="true" />;
}

export const TVBottomBar = memo(function TVBottomBar({
  activeRange = "1Y",
  onRangeChange,
  disabledRanges = [],
  scaleMode = "linear",
  onScaleModeChange,
  autoScale = true,
  onAutoScaleToggle,
  marketStatus = "DEMO",
  timezone = "UTC",
  onTimezoneClick,
  currentTime,
}: TVBottomBarProps) {
  const handleRangeClick = useCallback((range: RangePreset) => {
    onRangeChange?.(range);
  }, [onRangeChange]);
  
  return (
    <div
      className="tv-bottom-bar-content flex items-center w-full h-full gap-0.5 px-2"
      data-testid="tv-bottom-bar-content"
    >
      {/* Range presets - ALWAYS VISIBLE AND READABLE */}
      <div className="flex items-center gap-px" data-testid="tv-range-presets">
        {RANGE_PRESETS.map((range) => (
          <RangeButton
            key={range}
            range={range}
            active={activeRange === range}
            disabled={disabledRanges.includes(range)}
            onClick={() => handleRangeClick(range)}
          />
        ))}
      </div>
      
      {/* Spacer */}
      <div className="flex-1" />
      
      {/* Scale toggles */}
      <div className="flex items-center gap-px" data-testid="tv-scale-toggles">
        <ScaleButton
          mode="auto"
          active={autoScale}
          onClick={() => onAutoScaleToggle?.()}
          title="Auto-scale"
          testId="tv-scale-auto"
        >
          Auto
        </ScaleButton>
        <ScaleButton
          mode="log"
          active={scaleMode === "log"}
          onClick={() => onScaleModeChange?.("log")}
          title="Logarithmic scale"
          testId="tv-scale-log"
        >
          Log
        </ScaleButton>
        <ScaleButton
          mode="percent"
          active={scaleMode === "percent"}
          onClick={() => onScaleModeChange?.("percent")}
          title="Percentage scale"
          testId="tv-scale-percent"
        >
          <Percent className="w-2.5 h-2.5" />
        </ScaleButton>
      </div>
      
      <Separator />
      
      {/* Market status */}
      <MarketStatusBadge status={marketStatus} />
      
      <Separator />
      
      {/* Timezone */}
      <button
        type="button"
        onClick={onTimezoneClick}
        data-testid="tv-timezone-btn"
        className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-[#787b86] hover:text-[#d1d4dc] transition-colors"
      >
        <Globe className="w-2.5 h-2.5" />
        <span>{timezone}</span>
      </button>
      
      {/* Current time */}
      {currentTime && (
        <div className="flex items-center gap-1 px-1.5 text-[11px] text-[#5d606b]">
          <Clock className="w-2.5 h-2.5" />
          <span>{currentTime}</span>
        </div>
      )}
    </div>
  );
});

export default TVBottomBar;
