/**
 * PivotPointsOverlay
 * 
 * Canvas overlay that draws horizontal pivot point levels with labels.
 * 
 * TradingView doc: https://www.tradingview.com/support/solutions/43000521824-pivot-points-standard/
 * 
 * Visual behavior (TradingView-parity):
 * - Horizontal segments spanning each pivot period
 * - Lines break at period boundaries (no continuous lines across periods)
 * - Labels on left or right with level name (P, S1, R1, etc.)
 * - Optional price display in labels
 * - Default color: #FF6D00 (TradingView orange)
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws visible range
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";
import type { PivotLevelKey, PivotPeriod } from "../indicators/compute";

// Props interface
interface PivotPointsOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Pivot periods with level values */
  periods: PivotPeriod[];
  /** Valid levels for this pivot type */
  validLevels: PivotLevelKey[];
  /** Whether to show labels */
  showLabels: boolean;
  /** Whether to show prices in labels */
  showPrices: boolean;
  /** Label position: left or right */
  labelsPosition: "left" | "right";
  /** Line width */
  lineWidth: number;
  /** Level visibility settings */
  levelVisibility: Record<PivotLevelKey, boolean>;
  /** Level colors */
  levelColors: Record<PivotLevelKey, string>;
  /** Chart bar times for snapping period boundaries (sorted ascending) */
  barTimes?: number[];
}

// Font for labels (TV uses similar)
const LABEL_FONT = "11px -apple-system, BlinkMacSystemFont, sans-serif";
const LABEL_PADDING = 4;

/**
 * Binary search to find the first bar time >= target.
 * Returns the bar time if found, or -1 if target is beyond all bars.
 */
function findFirstBarAtOrAfter(barTimes: number[], target: number): number {
  if (barTimes.length === 0) return -1;
  
  let left = 0;
  let right = barTimes.length - 1;
  let result = -1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (barTimes[mid] >= target) {
      result = barTimes[mid];
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  
  return result;
}

/**
 * Binary search to find the last bar time < target.
 * Returns the bar time if found, or -1 if target is before all bars.
 */
function findLastBarBefore(barTimes: number[], target: number): number {
  if (barTimes.length === 0) return -1;
  
  let left = 0;
  let right = barTimes.length - 1;
  let result = -1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (barTimes[mid] < target) {
      result = barTimes[mid];
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return result;
}

/**
 * PivotPointsOverlay Component
 * 
 * Renders horizontal pivot point levels with labels.
 */
export const PivotPointsOverlay = memo(function PivotPointsOverlay({
  chartRef,
  seriesRef,
  containerRef,
  periods,
  validLevels,
  showLabels,
  showPrices,
  labelsPosition,
  lineWidth,
  levelVisibility,
  levelColors,
  barTimes = [],
}: PivotPointsOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = periods.length > 0 && validLevels.length > 0;

  // Draw all pivot levels
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = seriesRef.current;
      const container = containerRef.current;

      if (!canvas || !chart || !series || !container) {
        const ctx = canvas?.getContext("2d");
        if (ctx && canvas) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // High-DPI support
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const cssWidth = rect.width;
      const cssHeight = rect.height;
      const pixelWidth = Math.floor(cssWidth * dpr);
      const pixelHeight = Math.floor(cssHeight * dpr);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // Get visible range
      const timeScale = chart.timeScale();
      const visibleRange = timeScale.getVisibleLogicalRange();
      if (!visibleRange) return;

      // Debug: log period count
      if (process.env.NODE_ENV === "development") {
        console.log(`[PivotPointsOverlay] Drawing ${periods.length} periods`);
      }

      ctx.save();
      ctx.font = LABEL_FONT;
      ctx.textBaseline = "middle";

      // Get first and last bar times for boundary detection
      const firstBarTime = barTimes.length > 0 ? barTimes[0] : 0;
      const lastBarTime = barTimes.length > 0 ? barTimes[barTimes.length - 1] : 0;

      // Draw each period
      for (let i = 0; i < periods.length; i++) {
        const period = periods[i];
        const isLastPeriod = i === periods.length - 1;
        const periodStartTime = period.startTime as number;
        const periodEndTime = period.endTime as number;
        
        // Get x coordinates for period start and end
        // timeToCoordinate returns null if the time doesn't exist in chart data
        let xStart = timeScale.timeToCoordinate(period.startTime as unknown as Time);
        let xEnd = timeScale.timeToCoordinate(period.endTime as unknown as Time);
        
        // ===================================================================
        // TV-PARITY: Snap period boundaries to actual chart bars
        // ===================================================================
        
        // Handle xStart:
        // - If periodStart is before first bar → snap to first bar
        // - If null but within data range → find first bar >= periodStart
        if (xStart === null) {
          if (periodStartTime < firstBarTime) {
            // Period starts before our data - snap to first bar
            xStart = timeScale.timeToCoordinate(firstBarTime as unknown as Time);
          } else if (barTimes.length > 0) {
            // Find the first bar at or after periodStart
            const snappedTime = findFirstBarAtOrAfter(barTimes, periodStartTime);
            if (snappedTime !== -1) {
              xStart = timeScale.timeToCoordinate(snappedTime as unknown as Time);
            }
          }
        }
        
        // Handle xEnd:
        // - ONLY the last period should extend to cssWidth (right edge/whitespace)
        // - For historical periods, snap to the first bar of the NEXT period
        if (xEnd === null) {
          if (isLastPeriod) {
            // Last period: extend to right edge (TV behavior for current period)
            xEnd = cssWidth;
          } else {
            // Historical period: find the first bar at or after periodEnd
            // This is typically the first bar of the next period
            if (barTimes.length > 0) {
              const snappedTime = findFirstBarAtOrAfter(barTimes, periodEndTime);
              if (snappedTime !== -1) {
                xEnd = timeScale.timeToCoordinate(snappedTime as unknown as Time);
              } else {
                // No bar found at or after periodEnd - this shouldn't happen for historical
                // periods, but fallback to finding the last bar before periodEnd
                const lastBarBefore = findLastBarBefore(barTimes, periodEndTime);
                if (lastBarBefore !== -1) {
                  xEnd = timeScale.timeToCoordinate(lastBarBefore as unknown as Time);
                }
              }
            }
          }
        }
        
        // Skip if we couldn't resolve coordinates
        if (xStart === null || xEnd === null) continue;
        
        // Skip if completely off-screen
        if (xEnd < -50 || xStart > cssWidth + 50) continue;

        // Clamp to visible canvas area
        const drawXStart = Math.max(xStart, 0);
        const drawXEnd = Math.min(xEnd, cssWidth);
        
        // Skip if no visible segment
        if (drawXEnd <= drawXStart) continue;

        // Draw each level
        for (const levelKey of validLevels) {
          // Check visibility
          if (!levelVisibility[levelKey]) continue;

          const levelValue = period.levels[levelKey];
          if (levelValue === undefined || levelValue === null) continue;

          // Get y coordinate
          const y = series.priceToCoordinate(levelValue);
          if (y === null || y < 0 || y > cssHeight) continue;

          const color = levelColors[levelKey];

          // Draw horizontal line segment
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.beginPath();
          ctx.moveTo(drawXStart, y);
          ctx.lineTo(drawXEnd, y);
          ctx.stroke();

          // Draw label if enabled
          if (showLabels) {
            const labelText = showPrices
              ? `${levelKey} (${formatPrice(levelValue)})`
              : levelKey;
            
            const textWidth = ctx.measureText(labelText).width;
            
            // Position label
            let labelX: number;
            if (labelsPosition === "left") {
              labelX = drawXStart + LABEL_PADDING;
              ctx.textAlign = "left";
            } else {
              labelX = drawXEnd - LABEL_PADDING;
              ctx.textAlign = "right";
            }

            // Draw label background for readability
            const bgPadding = 2;
            const bgX = labelsPosition === "left" 
              ? labelX - bgPadding
              : labelX - textWidth - bgPadding;
            
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.fillRect(bgX, y - 7, textWidth + bgPadding * 2, 14);

            // Draw label text
            ctx.fillStyle = color;
            ctx.fillText(labelText, labelX, y);
          }
        }
      }

      ctx.restore();
    } finally {
      isDrawingRef.current = false;
    }
  }, [
    chartRef, seriesRef, containerRef,
    periods, validLevels, showLabels, showPrices,
    labelsPosition, lineWidth, levelVisibility, levelColors, barTimes
  ]);

  // Schedule draw in RAF
  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  // Subscribe to chart events
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const timeScale = chart.timeScale();
    
    const handleRangeChange = () => scheduleRedraw();
    const handleCrosshairMove = () => scheduleRedraw();
    
    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange);
    chart.subscribeCrosshairMove(handleCrosshairMove);

    scheduleRedraw();

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [chartRef, scheduleRedraw]);

  // Redraw when data changes
  useEffect(() => {
    scheduleRedraw();
  }, [periods, scheduleRedraw]);

  // Redraw on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => scheduleRedraw());
    observer.observe(container);

    return () => observer.disconnect();
  }, [containerRef, scheduleRedraw]);

  if (!shouldRender) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 8 }} // Above cloud overlay (5) but below candles
      data-testid="pivot-points-overlay"
    />
  );
});

/**
 * Format price for display in labels
 * Adapts decimal places based on price magnitude
 */
function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toFixed(2);
  } else if (price >= 100) {
    return price.toFixed(2);
  } else if (price >= 10) {
    return price.toFixed(3);
  } else if (price >= 1) {
    return price.toFixed(4);
  } else {
    return price.toFixed(6);
  }
}

export default PivotPointsOverlay;
