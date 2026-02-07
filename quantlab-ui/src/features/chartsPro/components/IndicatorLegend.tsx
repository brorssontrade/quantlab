/**
 * IndicatorLegend - TradingView-style indicator legend
 * 
 * Renders a floating toolbar for indicators on the chart.
 * - Overlay indicators (pane: "price") show in the main chart legend area
 * - Separate pane indicators show in their respective pane headers
 * 
 * Features:
 * - Color dot + name + params
 * - Live values display
 * - Visibility toggle (eye)
 * - Settings (gear) → opens IndicatorSettingsModal
 * - Remove (trash)
 */

import React, { useMemo, useState, useCallback } from "react";
import {
  Eye,
  EyeOff,
  Settings,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { IndicatorInstance } from "../types";
import type { IndicatorWorkerResponse } from "../indicators/registryV2";
import { indicatorDisplayName, indicatorParamsSummary } from "../types";
import { getIndicatorManifest } from "../indicators/indicatorManifest";

// ============================================================================
// Types
// ============================================================================

/** Crosshair values for a single indicator - line id to value/color */
export interface CrosshairLineValue {
  value: number;
  color: string;
}

export type IndicatorCrosshairValues = Record<string, Record<string, CrosshairLineValue | null>>;

interface IndicatorLegendProps {
  indicators: IndicatorInstance[];
  indicatorResults: Record<string, IndicatorWorkerResponse>;
  /** Crosshair values keyed by indicator id, then line id */
  crosshairValues?: IndicatorCrosshairValues;
  onUpdateIndicator?: (id: string, patch: Partial<IndicatorInstance>) => void;
  onRemoveIndicator?: (id: string) => void;
  onOpenSettings?: (id: string) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function formatValue(value: number | null | undefined): string {
  if (value == null) return "–";
  if (Math.abs(value) >= 10000) return value.toFixed(0);
  if (Math.abs(value) >= 1000) return value.toFixed(1);
  if (Math.abs(value) >= 100) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

// ============================================================================
// Single Indicator Legend Item
// ============================================================================

interface IndicatorLegendItemProps {
  indicator: IndicatorInstance;
  result?: IndicatorWorkerResponse;
  /** Crosshair values for this indicator's lines */
  crosshairValues?: Record<string, CrosshairLineValue | null>;
  onToggleHidden?: () => void;
  onRemove?: () => void;
  onOpenSettings?: () => void;
}

function IndicatorLegendItem({
  indicator,
  result,
  crosshairValues,
  onToggleHidden,
  onRemove,
  onOpenSettings,
}: IndicatorLegendItemProps) {
  const [expanded, setExpanded] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const manifest = getIndicatorManifest(indicator.kind);
  const lines = result?.lines ?? [];
  
  const isHidden = indicator.hidden;
  
  return (
    <div
      className="group/legend flex items-center gap-1 text-[11px]
                 rounded px-1.5 py-0.5 min-w-0 transition-colors
                 hover:bg-[var(--tv-panel-hover)]"
      style={{
        backgroundColor: "var(--tv-panel-transparent)",
        opacity: isHidden ? 0.5 : 1,
      }}
      data-testid={`indicator-legend-${indicator.id}`}
      data-indicator-kind={indicator.kind}
    >
      {/* Color dot */}
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: indicator.color }}
      />
      
      {/* Name and params - clickable to expand/collapse */}
      <button
        type="button"
        className="flex items-center gap-1 min-w-0 text-left"
        onClick={() => setExpanded(!expanded)}
        title={`${indicatorDisplayName(indicator.kind)} - Click to ${expanded ? "collapse" : "expand"}`}
      >
        <span 
          className="font-medium truncate" 
          style={{ color: "var(--tv-text)" }}
        >
          {manifest?.shortName ?? indicatorDisplayName(indicator.kind)}
        </span>
        <span 
          className="text-[10px] flex-shrink-0" 
          style={{ color: "var(--tv-text-muted)" }}
        >
          {indicatorParamsSummary(indicator)}
        </span>
        {expanded ? (
          <ChevronUp className="w-3 h-3 flex-shrink-0" style={{ color: "var(--tv-text-muted)" }} />
        ) : (
          <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: "var(--tv-text-muted)" }} />
        )}
      </button>
      
      {/* Live values - only when expanded */}
      {expanded && lines.length > 0 && (
        <span className="flex items-center gap-1.5 ml-1 min-w-0 overflow-hidden">
          {lines.slice(0, 4).map((line) => {
            // Use crosshair value if available, otherwise fall back to last value
            const crosshairVal = crosshairValues?.[line.id];
            const lastPoint = line.values[line.values.length - 1];
            const displayValue = crosshairVal?.value ?? lastPoint?.value;
            const displayColor = crosshairVal?.color ?? line.color;
            return (
              <span
                key={line.id}
                className="font-mono text-[10px] truncate"
                style={{ color: displayColor }}
                title={`${line.label}: ${formatValue(displayValue)}`}
              >
                {formatValue(displayValue)}
              </span>
            );
          })}
        </span>
      )}

      {/* Action buttons - visible on hover (TV style) */}
      <span className="flex items-center gap-0 ml-auto flex-shrink-0 opacity-0 group-hover/legend:opacity-100 transition-opacity">
        {/* Visibility toggle */}
        <button
          type="button"
          onClick={onToggleHidden}
          title={isHidden ? "Show indicator" : "Hide indicator"}
          className="p-1 rounded hover:bg-[var(--tv-panel-hover)] transition"
        >
          {isHidden ? (
            <EyeOff className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
          ) : (
            <Eye className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
          )}
        </button>
        
        {/* Settings */}
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          className="p-1 rounded hover:bg-[var(--tv-panel-hover)] transition"
        >
          <Settings className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
        </button>
        
        {/* Remove */}
        <button
          type="button"
          onClick={onRemove}
          title="Remove indicator"
          className="p-1 rounded hover:bg-red-500/20 hover:text-red-400 transition"
        >
          <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
        </button>
        
        {/* More menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            title="More options"
            className="p-1 rounded hover:bg-[var(--tv-panel-hover)] transition"
          >
            <MoreHorizontal className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
          </button>
          
          {showMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowMenu(false)} 
              />
              <div
                className="absolute right-0 top-full mt-1 z-50 min-w-[140px] py-1 rounded border shadow-lg"
                style={{
                  backgroundColor: "var(--tv-panel)",
                  borderColor: "var(--tv-border)",
                }}
              >
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--tv-panel-hover)] transition"
                  style={{ color: "var(--tv-text-muted)" }}
                  onClick={() => setShowMenu(false)}
                  disabled
                >
                  Duplicate (coming soon)
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--tv-panel-hover)] transition"
                  style={{ color: "var(--tv-text-muted)" }}
                  onClick={() => setShowMenu(false)}
                  disabled
                >
                  Reset to defaults
                </button>
              </div>
            </>
          )}
        </div>
      </span>
    </div>
  );
}

// ============================================================================
// Main Component - Groups indicators by pane
// ============================================================================

export function IndicatorLegend({
  indicators,
  indicatorResults,
  crosshairValues,
  onUpdateIndicator,
  onRemoveIndicator,
  onOpenSettings,
}: IndicatorLegendProps) {
  // Group indicators by pane
  const overlayIndicators = useMemo(
    () => indicators.filter((ind) => ind.pane === "price"),
    [indicators]
  );
  
  const separateIndicators = useMemo(
    () => indicators.filter((ind) => ind.pane === "separate"),
    [indicators]
  );

  const handleToggleHidden = useCallback(
    (id: string) => {
      const indicator = indicators.find((ind) => ind.id === id);
      if (indicator && onUpdateIndicator) {
        onUpdateIndicator(id, { hidden: !indicator.hidden });
      }
    },
    [indicators, onUpdateIndicator]
  );

  if (indicators.length === 0) return null;

  return (
    <>
      {/* Overlay indicators - top-left of price chart */}
      {overlayIndicators.length > 0 && (
        <div
          className="absolute left-2 z-20 flex flex-col gap-0.5 max-w-[350px]"
          style={{ top: 42 }} // Below OHLC strip
          data-testid="indicator-legend-overlay"
        >
          {overlayIndicators.map((indicator) => (
            <IndicatorLegendItem
              key={indicator.id}
              indicator={indicator}
              result={indicatorResults[indicator.id]}
              crosshairValues={crosshairValues?.[indicator.id]}
              onToggleHidden={() => handleToggleHidden(indicator.id)}
              onRemove={() => onRemoveIndicator?.(indicator.id)}
              onOpenSettings={() => onOpenSettings?.(indicator.id)}
            />
          ))}
        </div>
      )}

      {/* Separate pane indicators - these will be positioned by the pane system */}
      {/* For now, render below overlays until multi-pane is implemented */}
      {separateIndicators.length > 0 && (
        <div
          className="absolute left-2 z-20 flex flex-col gap-0.5 max-w-[350px]"
          style={{ top: overlayIndicators.length > 0 ? 42 + overlayIndicators.length * 26 + 8 : 42 }}
          data-testid="indicator-legend-separate"
        >
          <div 
            className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5"
            style={{ color: "var(--tv-text-muted)" }}
          >
            Indicators
          </div>
          {separateIndicators.map((indicator) => (
            <IndicatorLegendItem
              key={indicator.id}
              indicator={indicator}
              result={indicatorResults[indicator.id]}
              crosshairValues={crosshairValues?.[indicator.id]}
              onToggleHidden={() => handleToggleHidden(indicator.id)}
              onRemove={() => onRemoveIndicator?.(indicator.id)}
              onOpenSettings={() => onOpenSettings?.(indicator.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default IndicatorLegend;
