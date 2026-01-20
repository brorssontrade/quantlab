/**
 * PrimaryControls.tsx
 * Always-visible group: Symbol input + Timeframe selector + Chart Type + Settings
 * These are the core controls that must never be hidden, even on mobile.
 */

import { RefreshCcw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChartTimeframe } from "../../state/controls";
import { ToolGroup } from "./ToolGroup";
import { SymbolSearch } from "./SymbolSearch";
import { ChartTypeSelector } from "./ChartTypeSelector";
import { TimeframeSelector } from "./TimeframeSelector";
import type { ChartType } from "./ChartTypeSelector";

interface PrimaryControlsProps {
  symbol: string;
  onSymbolChange: (value: string) => void;
  timeframe: ChartTimeframe;
  onTimeframeChange: (value: ChartTimeframe) => void;
  chartType: ChartType;
  onChartTypeChange: (value: ChartType) => void;
  onReload: () => void;
  loading?: boolean;
  onSettingsClick?: () => void;
}

export function PrimaryControls({
  symbol,
  onSymbolChange,
  timeframe,
  onTimeframeChange,
  chartType,
  onChartTypeChange,
  onReload,
  loading,
  onSettingsClick,
}: PrimaryControlsProps) {
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center"
      style={{ gap: 'var(--cp-gap-sm)' }}
    >
      {/* Symbol + Reload */}
      <ToolGroup label="Symbol" className="md:flex-1">
        <SymbolSearch value={symbol} onChange={onSymbolChange} />
        <Button
          variant="ghost"
          size="icon"
          onClick={onReload}
          title="Reload data"
          disabled={loading}
          data-testid="topbar-reload-btn"
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </ToolGroup>

      {/* Timeframe Selector (TV-11) */}
      <ToolGroup label="Timeframe" className="md:flex-none">
        <TimeframeSelector
          timeframe={timeframe}
          onChange={onTimeframeChange}
        />
      </ToolGroup>

      {/* Chart Type Selector (TV-10.1) */}
      <ToolGroup label="Type" className="md:flex-none">
        <ChartTypeSelector value={chartType} onChange={onChartTypeChange} />
      </ToolGroup>

      {/* Settings Button (TV-10.2) */}
      {onSettingsClick && (
        <ToolGroup label="Settings" className="md:flex-none">
          <Button
            variant="ghost"
            size="icon"
            onClick={onSettingsClick}
            title="Chart settings"
            data-testid="settings-button"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </ToolGroup>
      )}
    </div>
  );
}
