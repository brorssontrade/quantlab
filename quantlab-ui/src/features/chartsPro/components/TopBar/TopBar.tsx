/**
 * TopBar.tsx
 *
 * Main toolbar component for ChartsPro.
 * Organizes controls in TradingView order:
 * 1. Symbol + Timeframe + ChartType + Settings (always visible, primary focus)
 * 2. Theme + Visibility
 * 3. Utility (Magnet, Snap, Layout, Export)
 * 4. Meta information (source, timezone, etc.)
 *
 * Features:
 * - Responsive wrapping (desktop/tablet/mobile)
 * - Tight spacing (--cp-gap-xs, --cp-pad-xs CSS vars)
 * - Scroll on overflow (for narrow viewports)
 * - Backward compatible with old Toolbar props
 */

import { Badge } from "@/components/ui/badge";
import type { ChartMeta, ChartThemeName } from "../../types";
import type { ChartTimeframe, Tool } from "../../state/controls";
import type { ChartType } from "./ChartTypeSelector";
import { PrimaryControls } from "./PrimaryControls";
import { ThemeAndVisibilityControls } from "./ThemeAndVisibilityControls";
import { RightPanelActions } from "./RightPanelActions";
import { UtilityControls } from "./UtilityControls";

interface TopBarProps {
  // Primary
  symbol: string;
  onSymbolChange: (value: string) => void;
  timeframe: ChartTimeframe;
  onTimeframeChange: (value: ChartTimeframe) => void;
  chartType: ChartType;
  onChartTypeChange: (value: ChartType) => void;

  // Settings (TV-10.2)
  onSettingsClick?: () => void;

  /** TV-22.0b: Callback to open Renko settings modal */
  onRenkoSettingsClick?: () => void;

  // TV-12: RightPanel actions
  onIndicatorsClick?: () => void;
  onAlertsClick?: () => void;
  onObjectsClick?: () => void;

  // Theme & Visibility
  theme: ChartThemeName;
  onThemeChange: (value: ChartThemeName) => void;
  showPanelsButton?: boolean;
  onOpenPanelsDrawer?: () => void;

  // Utilities
  magnetEnabled: boolean;
  onMagnetToggle: () => void;
  snapEnabled: boolean;
  onSnapToggle: () => void;
  onSaveLayout: () => void;
  onLoadLayout: () => void;
  onExportPng: () => void;
  onExportCsv: () => void;

  // Reload & Loading
  onReload: () => void;
  loading?: boolean;

  // Meta (display only)
  meta: ChartMeta | null;

  // Responsive
  isCompact?: boolean;

  // Note: drawingTool, onDrawingToolChange will move to LeftToolbar in TV-3
}

export function TopBar({
  symbol,
  onSymbolChange,
  timeframe,
  onTimeframeChange,
  chartType,
  onChartTypeChange,
  onSettingsClick,
  onRenkoSettingsClick,
  onIndicatorsClick,
  onAlertsClick,
  onObjectsClick,
  theme,
  onThemeChange,
  showPanelsButton,
  onOpenPanelsDrawer,
  magnetEnabled,
  onMagnetToggle,
  snapEnabled,
  onSnapToggle,
  onSaveLayout,
  onLoadLayout,
  onExportPng,
  onExportCsv,
  onReload,
  loading,
  meta,
  isCompact = false,
}: TopBarProps) {
  return (
    <div
      className="
        flex flex-col
        border-b border-slate-800/40
        bg-slate-950/40
        data-[compact=true]:gap-1
      "
      style={{
        gap: 'var(--cp-gap-sm)',
        padding: 'var(--cp-pad-sm) var(--cp-pad)',
      }}
      data-compact={isCompact}
      data-testid="tv-topbar-root"
    >
      {/* Row 1: Primary Controls (Symbol + Timeframe + Type + Settings) */}
      <PrimaryControls
        symbol={symbol}
        onSymbolChange={onSymbolChange}
        timeframe={timeframe}
        onTimeframeChange={onTimeframeChange}
        chartType={chartType}
        onChartTypeChange={onChartTypeChange}
        onReload={onReload}
        loading={loading}
        onSettingsClick={onSettingsClick}
        onRenkoSettingsClick={onRenkoSettingsClick}
      />

      {/* Row 2: Theme + RightPanel Actions + Utilities (responsive wrapping) */}
      <div
          className="
            flex flex-col sm:flex-row sm:items-center
            flex-wrap
            min-h-0
          "
          style={{
            gap: 'var(--cp-gap-sm)',
          }}
          data-testid="tv-topbar-controls-row"
        >
        <RightPanelActions
          onIndicatorsClick={onIndicatorsClick}
          onAlertsClick={onAlertsClick}
          onObjectsClick={onObjectsClick}
        />

        <ThemeAndVisibilityControls
          theme={theme}
          onThemeChange={onThemeChange}
          showPanelsButton={showPanelsButton}
          onOpenPanelsDrawer={onOpenPanelsDrawer}
        />

        <UtilityControls
          magnetEnabled={magnetEnabled}
          onMagnetToggle={onMagnetToggle}
          snapEnabled={snapEnabled}
          onSnapToggle={onSnapToggle}
          onSaveLayout={onSaveLayout}
          onLoadLayout={onLoadLayout}
          onExportPng={onExportPng}
          onExportCsv={onExportCsv}
          isCompact={isCompact}
        />
      </div>

      {/* Row 3: Meta Information (source, timezone, cache, fallback) */}
        <div
          className="flex min-h-[24px] flex-wrap text-[11px] text-slate-400"
          style={{ gap: 'var(--cp-gap-sm)' }}
        >
        {meta?.source ? (
          <Badge variant="outline" className="text-[10px]">
            Source: {meta.source}
          </Badge>
        ) : null}
        {meta?.tz ? (
          <Badge variant="outline" className="text-[10px]">
            TZ: {meta.tz}
          </Badge>
        ) : null}
        {typeof meta?.fallback === "boolean" ? (
          <Badge
            variant={meta.fallback ? "destructive" : "outline"}
            className="text-[10px]"
          >
            {meta.fallback ? "Fallback-data" : "Primary feed"}
          </Badge>
        ) : null}
        {meta?.cache ? (
          <Badge variant="outline" className="text-[10px]">
            Cache: {meta.cache}
          </Badge>
        ) : null}
        {!meta && (
          <span className="text-slate-500">Meta visible when data loaded.</span>
        )}
      </div>
    </div>
  );
}
