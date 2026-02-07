/**
 * PaneStack - Container for indicator panes below the price chart
 * 
 * Features:
 * - Multiple indicator panes stacked vertically
 * - Resizable dividers between panes (not between price and first pane)
 * - Synced timeScale and crosshair with price chart
 * - TV-style theming
 * - Height clamping to prevent overflow
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { IChartApi } from "lightweight-charts";
import { IndicatorPane } from "./IndicatorPane";
import { PaneDivider } from "./PaneDivider";
import { getSyncController } from "./SyncController";
import { DEFAULT_INDICATOR_PANE_HEIGHT, MIN_PANE_HEIGHT, DIVIDER_HEIGHT } from "./types";
import type { IndicatorInstance } from "../../types";
import type { IndicatorWorkerResponse } from "../../indicators/registryV2";
import type { ChartsTheme } from "../../theme";

// ============================================================================
// Types
// ============================================================================

interface PaneStackProps {
  /** Width of the pane stack */
  width: number;
  /** Maximum height available */
  maxHeight: number;
  /** Chart theme */
  theme: ChartsTheme;
  /** All indicators (we filter for separate pane indicators) */
  indicators: IndicatorInstance[];
  /** Indicator computation results */
  indicatorResults: Record<string, IndicatorWorkerResponse>;
  /** Reference to the price chart for sync */
  priceChartRef: React.RefObject<IChartApi | null>;
  /** Callback to update an indicator */
  onUpdateIndicator?: (id: string, patch: Partial<IndicatorInstance>) => void;
  /** Callback to remove an indicator */
  onRemoveIndicator?: (id: string) => void;
  /** Callback to open indicator settings */
  onOpenIndicatorSettings?: (id: string) => void;
  /** Callback when pane count changes (for hiding price timeScale) */
  onPaneCountChange?: (count: number) => void;
}

interface PaneHeightState {
  [paneId: string]: number;
}

// ============================================================================
// Hook: usePaneHeights - with maxHeight clamping
// ============================================================================

function usePaneHeights(paneIds: string[], maxHeight: number) {
  const [heights, setHeights] = useState<PaneHeightState>({});
  const isResizing = useRef(false);

  // Initialize heights for new panes, with maxHeight clamping
  useEffect(() => {
    setHeights((prev) => {
      const next = { ...prev };
      let changed = false;
      
      // Add missing panes
      paneIds.forEach((id) => {
        if (!(id in next)) {
          next[id] = DEFAULT_INDICATOR_PANE_HEIGHT;
          changed = true;
        }
      });
      
      // Remove deleted panes
      Object.keys(next).forEach((id) => {
        if (!paneIds.includes(id)) {
          delete next[id];
          changed = true;
        }
      });
      
      // Clamp total height to maxHeight if exceeded
      if (changed || paneIds.length > 0) {
        const dividersHeight = Math.max(0, paneIds.length) * DIVIDER_HEIGHT; // +1 for top divider
        const availableForPanes = Math.max(0, maxHeight - dividersHeight);
        const currentTotal = paneIds.reduce(
          (sum, id) => sum + (next[id] ?? DEFAULT_INDICATOR_PANE_HEIGHT),
          0
        );
        
        // If total exceeds available, normalize proportionally
        if (currentTotal > availableForPanes && availableForPanes > 0) {
          const scale = availableForPanes / currentTotal;
          paneIds.forEach((id) => {
            const oldH = next[id] ?? DEFAULT_INDICATOR_PANE_HEIGHT;
            const newH = Math.max(MIN_PANE_HEIGHT, Math.floor(oldH * scale));
            if (newH !== oldH) {
              next[id] = newH;
              changed = true;
            }
          });
        }
      }
      
      return changed ? next : prev;
    });
  }, [paneIds, maxHeight]);

  // Handle divider resize between pane[index-1] and pane[index]
  // dividerIndex 0 = non-draggable top divider (price ↔ pane[0])
  // dividerIndex 1+ = between pane[i-1] and pane[i]
  const handleResize = useCallback(
    (dividerIndex: number, deltaY: number) => {
      // dividerIndex=0 is the top divider (not resizable)
      if (dividerIndex === 0) return;
      if (paneIds.length < 2) return;
      
      setHeights((prev) => {
        const next = { ...prev };
        // Divider at index=1 is between pane[0] and pane[1]
        // Divider at index=i is between pane[i-1] and pane[i]
        const paneAboveIdx = dividerIndex - 1;
        const paneBelowIdx = dividerIndex;
        
        const paneAbove = paneIds[paneAboveIdx];
        const paneBelow = paneIds[paneBelowIdx];
        
        if (!paneAbove || !paneBelow) return prev;
        
        const currentAbove = next[paneAbove] ?? DEFAULT_INDICATOR_PANE_HEIGHT;
        const currentBelow = next[paneBelow] ?? DEFAULT_INDICATOR_PANE_HEIGHT;
        
        // Calculate new heights
        let newAbove = currentAbove + deltaY;
        let newBelow = currentBelow - deltaY;
        
        // Enforce minimum heights
        if (newAbove < MIN_PANE_HEIGHT) {
          newAbove = MIN_PANE_HEIGHT;
          newBelow = currentAbove + currentBelow - MIN_PANE_HEIGHT;
        }
        if (newBelow < MIN_PANE_HEIGHT) {
          newBelow = MIN_PANE_HEIGHT;
          newAbove = currentAbove + currentBelow - MIN_PANE_HEIGHT;
        }
        
        next[paneAbove] = newAbove;
        next[paneBelow] = newBelow;
        
        return next;
      });
    },
    [paneIds]
  );

  const handleResizeStart = useCallback(() => {
    isResizing.current = true;
  }, []);

  const handleResizeEnd = useCallback(() => {
    isResizing.current = false;
  }, []);

  // Calculate total height of all panes + dividers (including top divider)
  const totalHeight = useMemo(() => {
    if (paneIds.length === 0) return 0;
    const panesHeight = paneIds.reduce(
      (sum, id) => sum + (heights[id] ?? DEFAULT_INDICATOR_PANE_HEIGHT),
      0
    );
    // +1 divider for top (price ↔ pane[0]), then one between each pane
    const dividersHeight = paneIds.length * DIVIDER_HEIGHT;
    const total = panesHeight + dividersHeight;
    // Clamp to maxHeight
    return Math.min(total, maxHeight);
  }, [paneIds, heights, maxHeight]);

  return {
    heights,
    totalHeight,
    handleResize,
    handleResizeStart,
    handleResizeEnd,
    isResizing: isResizing.current,
  };
}

// ============================================================================
// PaneStack Component
// ============================================================================

export function PaneStack({
  width,
  maxHeight,
  theme,
  indicators,
  indicatorResults,
  priceChartRef,
  onUpdateIndicator,
  onRemoveIndicator,
  onOpenIndicatorSettings,
  onPaneCountChange,
}: PaneStackProps) {
  const syncController = getSyncController();
  const hasRegisteredPricePane = useRef(false);

  // Filter to only separate pane indicators (not hidden)
  const separateIndicators = useMemo(
    () => indicators.filter((ind) => ind.pane === "separate"),
    [indicators]
  );

  // Group indicators by their ID for individual panes
  // Each indicator gets its own pane
  const paneConfig = useMemo(() => {
    return separateIndicators.map((ind) => ({
      paneId: `ind-pane-${ind.id}`,
      indicators: [ind],
    }));
  }, [separateIndicators]);

  const paneIds = useMemo(
    () => paneConfig.map((p) => p.paneId),
    [paneConfig]
  );

  const {
    heights,
    totalHeight,
    handleResize,
    handleResizeStart,
    handleResizeEnd,
  } = usePaneHeights(paneIds, maxHeight);

  // Register price chart with sync controller
  useEffect(() => {
    const priceChart = priceChartRef.current;
    if (priceChart && !hasRegisteredPricePane.current) {
      syncController.registerPane("price", priceChart);
      hasRegisteredPricePane.current = true;
    }
    
    return () => {
      if (hasRegisteredPricePane.current) {
        syncController.unregisterPane("price");
        hasRegisteredPricePane.current = false;
      }
    };
  }, [priceChartRef, syncController]);

  // Notify parent when pane count changes (for hiding price timeScale)
  useEffect(() => {
    onPaneCountChange?.(paneConfig.length);
  }, [paneConfig.length, onPaneCountChange]);

  // If no separate indicators, render nothing
  if (separateIndicators.length === 0) {
    return null;
  }

  return (
    <div
      className="pane-stack flex flex-col"
      style={{
        width,
        maxHeight,
        height: totalHeight,
        overflow: "hidden",
      }}
      data-testid="indicator-pane-stack"
    >
      {paneConfig.map((pane, index) => {
        const isLast = index === paneConfig.length - 1;
        const paneHeight = heights[pane.paneId] ?? DEFAULT_INDICATOR_PANE_HEIGHT;
        
        return (
          <React.Fragment key={pane.paneId}>
            {/* Divider: index=0 is top (non-draggable), index>0 is between panes */}
            <PaneDivider
              index={index}
              draggable={index > 0} // Only allow drag between indicator panes, not price↔pane[0]
              onResize={handleResize}
              onResizeStart={handleResizeStart}
              onResizeEnd={handleResizeEnd}
            />
            
            {/* Indicator Pane */}
            <IndicatorPane
              paneId={pane.paneId}
              width={width}
              height={paneHeight}
              theme={theme}
              indicators={pane.indicators}
              indicatorResults={indicatorResults}
              showTimeAxis={isLast} // Only show time axis on bottom pane
              onUpdateIndicator={onUpdateIndicator}
              onRemoveIndicator={onRemoveIndicator}
              onOpenSettings={onOpenIndicatorSettings}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default PaneStack;
