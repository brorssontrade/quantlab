/**
 * TVHeader.tsx
 * 
 * TradingView-style Header Component
 * 
 * Layout (left to right):
 * 1. Symbol chip (left-aligned, primary focus)
 * 2. Timeframe selector
 * 3. Chart type selector
 * 4. Separator
 * 5. Indicators / Alerts / Compare buttons
 * 6. Right-aligned: Settings, theme, utilities
 * 
 * Contract:
 * - Height: 48-52px (set by parent grid)
 * - Icon buttons: 28-32px hit area
 * - Minimal vertical padding
 * - All items vertically centered
 */

import { memo } from "react";
import { Settings, Bell, Layers, BarChart3, ChevronDown, Sun, Moon, Download, RefreshCw, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TV_LAYOUT } from "./TVLayoutShell";

interface TVHeaderProps {
  // Symbol
  symbol: string;
  onSymbolClick?: () => void;
  
  // Timeframe (e.g., "1D", "1W")
  timeframe: string;
  onTimeframeClick?: () => void;
  
  // Chart type (e.g., "Candles", "Line")
  chartType: string;
  onChartTypeClick?: () => void;
  
  // Actions
  onIndicatorsClick?: () => void;
  onAlertsClick?: () => void;
  onCompareClick?: () => void;
  onSettingsClick?: () => void;
  
  // Theme
  theme?: "dark" | "light";
  onThemeToggle?: () => void;
  
  // Utilities
  onExport?: () => void;
  onReload?: () => void;
  onFullscreen?: () => void;
  
  // Loading state
  loading?: boolean;
  
  // Custom slots for extensibility
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
}

/** Styled header button with TradingView sizing */
function HeaderButton({
  children,
  onClick,
  active = false,
  className = "",
  title,
  "data-testid": testId,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  title?: string;
  "data-testid"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-testid={testId}
      className={cn(
        "flex items-center justify-center rounded transition-colors",
        "hover:bg-slate-700/50 active:bg-slate-600/50",
        active && "bg-slate-700/70 text-white",
        !active && "text-slate-300",
        className
      )}
      style={{
        minWidth: `${TV_LAYOUT.BUTTON_SIZE}px`,
        height: `${TV_LAYOUT.BUTTON_SIZE}px`,
        padding: `${TV_LAYOUT.BUTTON_PADDING}px`,
      }}
    >
      {children}
    </button>
  );
}

/** Symbol chip with dropdown indicator */
function SymbolChip({ symbol, onClick }: { symbol: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="tv-symbol-chip"
      className={cn(
        "flex items-center gap-1 px-3 py-1 rounded font-semibold text-sm",
        "bg-slate-800/80 hover:bg-slate-700/80 text-white transition-colors"
      )}
    >
      <span>{symbol}</span>
      <ChevronDown className="w-4 h-4 opacity-60" />
    </button>
  );
}

/** Timeframe/ChartType pill selector */
function SelectorPill({ 
  value, 
  onClick, 
  testId,
}: { 
  value: string; 
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
        "bg-transparent hover:bg-slate-700/50 text-slate-300 transition-colors"
      )}
    >
      <span>{value}</span>
      <ChevronDown className="w-3 h-3 opacity-60" />
    </button>
  );
}

/** Vertical separator */
function Separator() {
  return (
    <div 
      className="h-6 w-px bg-slate-700/60 mx-1" 
      aria-hidden="true"
    />
  );
}

export const TVHeader = memo(function TVHeader({
  symbol,
  onSymbolClick,
  timeframe,
  onTimeframeClick,
  chartType,
  onChartTypeClick,
  onIndicatorsClick,
  onAlertsClick,
  onCompareClick,
  onSettingsClick,
  theme = "dark",
  onThemeToggle,
  onExport,
  onReload,
  onFullscreen,
  loading = false,
  leftSlot,
  rightSlot,
}: TVHeaderProps) {
  return (
    <div 
      className="tv-header-content flex items-center w-full h-full px-2 gap-1"
      data-testid="tv-header-content"
    >
      {/* Left section: Symbol + Timeframe + ChartType */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <SymbolChip symbol={symbol} onClick={onSymbolClick} />
        <SelectorPill 
          value={timeframe} 
          onClick={onTimeframeClick} 
          testId="tv-timeframe-pill"
        />
        <SelectorPill 
          value={chartType} 
          onClick={onChartTypeClick}
          testId="tv-charttype-pill"
        />
        {leftSlot}
      </div>
      
      <Separator />
      
      {/* Middle section: Actions */}
      <div className="flex items-center gap-0.5">
        <HeaderButton
          onClick={onIndicatorsClick}
          title="Indicators"
          data-testid="tv-indicators-btn"
        >
          <Layers className="w-4 h-4" />
        </HeaderButton>
        <HeaderButton
          onClick={onAlertsClick}
          title="Alerts"
          data-testid="tv-alerts-btn"
        >
          <Bell className="w-4 h-4" />
        </HeaderButton>
        <HeaderButton
          onClick={onCompareClick}
          title="Compare"
          data-testid="tv-compare-btn"
        >
          <BarChart3 className="w-4 h-4" />
        </HeaderButton>
      </div>
      
      {/* Spacer */}
      <div className="flex-1" />
      
      {/* Right section: Utilities + Settings */}
      <div className="flex items-center gap-0.5">
        {rightSlot}
        
        <HeaderButton
          onClick={onReload}
          title="Reload data"
          data-testid="tv-reload-btn"
          className={loading ? "animate-spin" : ""}
        >
          <RefreshCw className="w-4 h-4" />
        </HeaderButton>
        
        <HeaderButton
          onClick={onExport}
          title="Export"
          data-testid="tv-export-btn"
        >
          <Download className="w-4 h-4" />
        </HeaderButton>
        
        <HeaderButton
          onClick={onThemeToggle}
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          data-testid="tv-theme-btn"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </HeaderButton>
        
        <Separator />
        
        <HeaderButton
          onClick={onSettingsClick}
          title="Settings"
          data-testid="tv-settings-btn"
        >
          <Settings className="w-4 h-4" />
        </HeaderButton>
        
        <HeaderButton
          onClick={onFullscreen}
          title="Fullscreen"
          data-testid="tv-fullscreen-btn"
        >
          <Maximize2 className="w-4 h-4" />
        </HeaderButton>
      </div>
    </div>
  );
});

export default TVHeader;
