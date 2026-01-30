/**
 * PRIO 3: Indicator Pane Legend Component
 * 
 * Renders a TradingView-style legend in each separate indicator pane,
 * showing indicator name, parameters, and live values.
 */

import React, { useMemo } from "react";
import { Eye, EyeOff, Settings, X } from "lucide-react";
import type { IndicatorInstance, IndicatorPane } from "../types";
import type { IndicatorWorkerResponse } from "../indicators/registryV2";
import { indicatorDisplayName, indicatorParamsSummary } from "../types";

interface IndicatorPaneLegendProps {
  indicators: IndicatorInstance[];
  indicatorResults: Record<string, IndicatorWorkerResponse>;
  pane: IndicatorPane;
  containerHeight: number;
  paneTop: number; // Y position of pane top in pixels
  onToggleHidden?: (id: string) => void;
  onEdit?: (id: string) => void;
  onRemove?: (id: string) => void;
}

function formatValue(value: number | null | undefined): string {
  if (value == null) return "–";
  if (Math.abs(value) >= 10000) return value.toFixed(0);
  if (Math.abs(value) >= 1000) return value.toFixed(1);
  if (Math.abs(value) >= 100) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

export function IndicatorPaneLegend({
  indicators,
  indicatorResults,
  pane,
  containerHeight,
  paneTop,
  onToggleHidden,
  onEdit,
  onRemove,
}: IndicatorPaneLegendProps) {
  const paneIndicators = useMemo(
    () => indicators.filter((ind) => ind.pane === pane && !ind.hidden),
    [indicators, pane]
  );

  if (paneIndicators.length === 0) return null;

  return (
    <div
      className="absolute left-2 z-10 flex flex-col gap-0.5 pointer-events-none"
      style={{ top: pane === "price" ? 40 : paneTop + 4 }}
    >
      {paneIndicators.map((indicator) => {
        const result = indicatorResults[indicator.id];
        const lines = result?.lines ?? [];
        
        return (
          <div
            key={indicator.id}
            className="flex items-center gap-1.5 text-[11px] pointer-events-auto 
                       bg-[var(--tv-bg-secondary,#1e222d)]/80 rounded px-1.5 py-0.5
                       hover:bg-[var(--tv-bg-secondary,#1e222d)] transition-colors"
          >
            {/* Color dot */}
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: indicator.color }}
            />
            
            {/* Name + params */}
            <span className="font-medium" style={{ color: "var(--tv-text, #d1d4dc)" }}>
              {indicatorDisplayName(indicator.kind)}
            </span>
            <span className="text-[10px]" style={{ color: "var(--tv-text-muted, #787b86)" }}>
              {indicatorParamsSummary(indicator)}
            </span>
            
            {/* Live values for each line */}
            <span className="flex items-center gap-1 ml-1">
              {lines.slice(0, 3).map((line) => {
                const lastPoint = line.values[line.values.length - 1];
                return (
                  <span
                    key={line.id}
                    className="font-mono text-[10px]"
                    style={{ color: line.color }}
                    title={line.label}
                  >
                    {formatValue(lastPoint?.value)}
                  </span>
                );
              })}
            </span>

            {/* Action buttons (shown on hover via CSS) */}
            <span className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onToggleHidden && (
                <button
                  type="button"
                  onClick={() => onToggleHidden(indicator.id)}
                  className="p-0.5 rounded hover:bg-white/10"
                  title="Hide"
                >
                  <Eye className="w-3 h-3" style={{ color: "var(--tv-text-muted, #787b86)" }} />
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(indicator.id)}
                  className="p-0.5 rounded hover:bg-white/10"
                  title="Settings"
                >
                  <Settings className="w-3 h-3" style={{ color: "var(--tv-text-muted, #787b86)" }} />
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(indicator.id)}
                  className="p-0.5 rounded hover:bg-white/10"
                  title="Remove"
                >
                  <X className="w-3 h-3" style={{ color: "var(--tv-text-muted, #787b86)" }} />
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compute Y positions for each separate indicator pane.
 * Returns a map of indicator ID -> pane top Y position in pixels.
 */
export function computePanePositions(
  indicators: IndicatorInstance[],
  containerHeight: number
): Map<string, number> {
  const positions = new Map<string, number>();
  
  const separateIndicators = indicators.filter(
    (ind) => !ind.hidden && ind.pane === "separate"
  );
  
  if (separateIndicators.length === 0) return positions;
  
  // Same logic as scaleMargins calculation
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
