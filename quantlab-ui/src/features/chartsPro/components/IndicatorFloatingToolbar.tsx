/**
 * Indicator Floating Toolbar
 * 
 * TradingView-style floating toolbar for each indicator pane.
 * Features:
 * - Indicator name with parameters
 * - Live values display
 * - Show/hide toggle
 * - Settings button (opens indicator settings modal)
 * - Remove button
 * - More menu (future: duplicate, reset, move pane)
 */

import React, { useMemo, useState, useCallback } from "react";
import {
  Eye,
  EyeOff,
  Settings,
  Trash2,
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type { IndicatorInstance, IndicatorPane } from "../types";
import type { IndicatorWorkerResponse } from "../indicators/registryV2";
import { indicatorDisplayName, indicatorParamsSummary } from "../types";
import { getIndicatorManifest } from "../indicators/indicatorManifest";

// ============================================================================
// Types
// ============================================================================

interface IndicatorFloatingToolbarProps {
  indicators: IndicatorInstance[];
  indicatorResults: Record<string, IndicatorWorkerResponse>;
  pane: IndicatorPane;
  containerHeight: number;
  paneTop: number;
  onToggleHidden?: (id: string) => void;
  onEdit?: (id: string) => void;
  onRemove?: (id: string) => void;
  onOpenSettings?: (id: string) => void;
}

interface ToolbarButtonProps {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  variant?: "default" | "danger";
  disabled?: boolean;
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
// Components
// ============================================================================

function ToolbarButton({ onClick, title, children, variant = "default", disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1 rounded transition ${
        disabled
          ? "opacity-40 cursor-not-allowed"
          : variant === "danger"
            ? "hover:bg-red-500/20 hover:text-red-400"
            : "hover:bg-[var(--tv-panel-hover)]"
      }`}
    >
      {children}
    </button>
  );
}

interface IndicatorToolbarItemProps {
  indicator: IndicatorInstance;
  result?: IndicatorWorkerResponse;
  onToggleHidden?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
  onOpenSettings?: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function IndicatorToolbarItem({
  indicator,
  result,
  onToggleHidden,
  onEdit,
  onRemove,
  onOpenSettings,
  isCollapsed,
  onToggleCollapse,
}: IndicatorToolbarItemProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const manifest = getIndicatorManifest(indicator.kind);
  const lines = result?.lines ?? [];
  
  // Get primary output label
  const primaryOutput = manifest?.outputs?.[0];
  
  return (
    <div
      className="group flex items-center gap-1 text-[11px] pointer-events-auto 
                 bg-[var(--tv-panel)] border border-[var(--tv-border)]
                 rounded shadow-sm px-1.5 py-0.5 min-w-0"
      style={{
        // Theme-adaptive: uses CSS vars from tv-tokens.css which switch between themes
        backgroundColor: "var(--tv-panel)",
        borderColor: "var(--tv-border)",
      }}
      data-testid={`indicator-toolbar-${indicator.kind}-${indicator.id}`}
      data-indicator-kind={indicator.kind}
    >
      {/* Color indicator */}
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: indicator.color }}
      />
      
      {/* Name and params */}
      <span 
        className="font-medium truncate cursor-pointer" 
        style={{ color: "var(--tv-text)" }}
        onClick={onToggleCollapse}
        title={`${indicatorDisplayName(indicator.kind)} - Click to ${isCollapsed ? "expand" : "collapse"}`}
      >
        {manifest?.shortName ?? indicatorDisplayName(indicator.kind)}
      </span>
      <span 
        className="text-[10px] flex-shrink-0" 
        style={{ color: "var(--tv-text-muted)" }}
      >
        {indicatorParamsSummary(indicator)}
      </span>
      
      {/* Live values */}
      {!isCollapsed && (
        <span className="flex items-center gap-1.5 ml-1 min-w-0 overflow-hidden">
          {lines.slice(0, 4).map((line) => {
            const lastPoint = line.values[line.values.length - 1];
            return (
              <span
                key={line.id}
                className="font-mono text-[10px] truncate"
                style={{ color: line.color }}
                title={`${line.label}: ${formatValue(lastPoint?.value)}`}
              >
                {formatValue(lastPoint?.value)}
              </span>
            );
          })}
        </span>
      )}

      {/* Action buttons - always visible, tight spacing */}
      <span className="flex items-center gap-0 ml-1 flex-shrink-0">
        {/* Visibility toggle */}
        {onToggleHidden && (
          <ToolbarButton
            onClick={onToggleHidden}
            title={indicator.hidden ? "Show indicator" : "Hide indicator"}
          >
            {indicator.hidden ? (
              <EyeOff className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
            ) : (
              <Eye className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
            )}
          </ToolbarButton>
        )}
        
        {/* Settings */}
        {(onEdit || onOpenSettings) && (
          <ToolbarButton
            onClick={() => (onOpenSettings ?? onEdit)?.()} 
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
          </ToolbarButton>
        )}
        
        {/* Remove */}
        {onRemove && (
          <ToolbarButton
            onClick={onRemove}
            title="Remove indicator"
            variant="danger"
          >
            <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
          </ToolbarButton>
        )}
        
        {/* More menu (placeholder for future features) */}
        <div className="relative">
          <ToolbarButton
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            title="More options"
          >
            <MoreHorizontal className="w-3.5 h-3.5" style={{ color: "var(--tv-text-muted)" }} />
                onClick={() => setShowMoreMenu(false)} 
              />
              {/* Menu */}
              <div
                className="absolute right-0 top-full mt-1 z-50 min-w-[140px] py-1 rounded border shadow-lg"
                style={{
                  backgroundColor: "var(--tv-panel)",
                  borderColor: "var(--tv-border)",
                }}
              >
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--tv-panel-hover)] transition flex items-center gap-2"
                  style={{ color: "var(--tv-text)" }}
                  onClick={() => {
                    setShowMoreMenu(false);
                    // TODO: Implement duplicate
                  }}
                  disabled
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--tv-panel-hover)] transition flex items-center gap-2"
                  style={{ color: "var(--tv-text)" }}
                  onClick={() => {
                    setShowMoreMenu(false);
                    // TODO: Implement reset to defaults
                  }}
                  disabled
                >
                  Reset to defaults
                </button>
                <div className="my-1 border-t" style={{ borderColor: "var(--tv-border)" }} />
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--tv-panel-hover)] transition flex items-center gap-2"
                  style={{ color: "var(--tv-text)" }}
                  onClick={() => {
                    setShowMoreMenu(false);
                    onToggleCollapse();
                  }}
                >
                  {isCollapsed ? "Expand values" : "Collapse values"}
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
// Main Component
// ============================================================================

export function IndicatorFloatingToolbar({
  indicators,
  indicatorResults,
  pane,
  containerHeight,
  paneTop,
  onToggleHidden,
  onEdit,
  onRemove,
  onOpenSettings,
}: IndicatorFloatingToolbarProps) {
  const [collapsedIndicators, setCollapsedIndicators] = useState<Set<string>>(new Set());
  
  const paneIndicators = useMemo(
    () => indicators.filter((ind) => ind.pane === pane),
    [indicators, pane]
  );
  
  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (paneIndicators.length === 0) return null;

  // Position at top-left of pane
  const topPosition = pane === "price" ? 40 : paneTop + 4;

  return (
    <div
      className="absolute left-2 z-20 flex flex-col gap-1 pointer-events-none max-w-[400px]"
      style={{ top: topPosition }}
      data-testid={`indicator-floating-toolbar-${pane}`}
    >
      {paneIndicators.map((indicator) => (
        <IndicatorToolbarItem
          key={indicator.id}
          indicator={indicator}
          result={indicatorResults[indicator.id]}
          onToggleHidden={onToggleHidden ? () => onToggleHidden(indicator.id) : undefined}
          onEdit={onEdit ? () => onEdit(indicator.id) : undefined}
          onRemove={onRemove ? () => onRemove(indicator.id) : undefined}
          onOpenSettings={onOpenSettings ? () => onOpenSettings(indicator.id) : undefined}
          isCollapsed={collapsedIndicators.has(indicator.id)}
          onToggleCollapse={() => toggleCollapse(indicator.id)}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Pane Separator Component
// ============================================================================

interface PaneSeparatorProps {
  paneTop: number;
  width: number;
}

export function PaneSeparator({ paneTop, width }: PaneSeparatorProps) {
  return (
    <div
      className="absolute left-0 h-px pointer-events-none"
      style={{
        top: paneTop,
        width,
        backgroundColor: "var(--tv-border)",
      }}
      data-testid="pane-separator"
    />
  );
}

// ============================================================================
// Export computePanePositions (moved from old component)
// ============================================================================

export function computePanePositions(
  indicators: IndicatorInstance[],
  containerHeight: number
): Map<string, number> {
  const positions = new Map<string, number>();
  
  const separateIndicators = indicators.filter(
    (ind) => !ind.hidden && ind.pane === "separate"
  );
  
  if (separateIndicators.length === 0) return positions;
  
  // Same logic as scaleMargins calculation in ChartViewport
  const MIN_INDICATOR_HEIGHT = 0.10;
  const MAX_INDICATORS_ZONE = 0.45;
  const indicatorCount = separateIndicators.length;
  
  const idealIndicatorZone = Math.min(
    indicatorCount * MIN_INDICATOR_HEIGHT + 0.02,
    MAX_INDICATORS_ZONE
  );
  
  const indicatorZoneStart = 1 - idealIndicatorZone;
  const indicatorZoneEnd = 0.98;
  const indicatorZoneHeight = indicatorZoneEnd - indicatorZoneStart;
  const perIndicatorHeight = indicatorZoneHeight / indicatorCount;
  
  separateIndicators.forEach((ind, index) => {
    const top = indicatorZoneStart + index * perIndicatorHeight;
    positions.set(ind.id, top * containerHeight);
  });
  
  return positions;
}
