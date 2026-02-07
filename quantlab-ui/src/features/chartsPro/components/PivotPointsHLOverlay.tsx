/**
 * PivotPointsHLOverlay
 * 
 * Canvas overlay that draws pivot high/low markers with labels.
 * 
 * TradingView doc: https://www.tradingview.com/support/solutions/43000666156-pivot-points-high-low/
 * 
 * Visual behavior (TradingView-parity):
 * - "H" labels above pivot highs
 * - "L" labels below pivot lows  
 * - Optional price display
 * - Customizable colors for highs and lows
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws visible range
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";

// Props interface
interface PivotPointsHLOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** All pivot points */
  pivots: Array<{ time: number; price: number; isHigh: boolean; index: number }>;
  /** Whether to show prices in labels */
  showPrices: boolean;
  /** Color for pivot highs */
  highColor: string;
  /** Color for pivot lows */
  lowColor: string;
}

// Font for labels (TV uses similar)
const LABEL_FONT = "11px -apple-system, BlinkMacSystemFont, sans-serif";
const LABEL_PADDING = 4;
const LABEL_OFFSET_Y = 8; // Pixels above/below the price point

/**
 * PivotPointsHLOverlay Component
 * 
 * Renders H/L markers at pivot highs and lows.
 */
export const PivotPointsHLOverlay = memo(function PivotPointsHLOverlay({
  chartRef,
  seriesRef,
  containerRef,
  pivots,
  showPrices,
  highColor,
  lowColor,
}: PivotPointsHLOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = pivots.length > 0;

  // Draw all pivot markers
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

      ctx.save();
      ctx.font = LABEL_FONT;
      ctx.textAlign = "center";

      // Draw each pivot
      for (const pivot of pivots) {
        const x = timeScale.timeToCoordinate(pivot.time as unknown as Time);
        const y = series.priceToCoordinate(pivot.price);
        
        if (x === null || y === null) continue;
        if (x < -50 || x > cssWidth + 50) continue; // Skip if off screen
        
        const color = pivot.isHigh ? highColor : lowColor;
        const label = pivot.isHigh ? "H" : "L";
        const yOffset = pivot.isHigh ? -LABEL_OFFSET_Y : LABEL_OFFSET_Y;
        
        ctx.textBaseline = pivot.isHigh ? "bottom" : "top";
        ctx.fillStyle = color;
        
        // Build label text
        let text = label;
        if (showPrices) {
          text = `${label} ${pivot.price.toFixed(2)}`;
        }
        
        // Draw label
        ctx.fillText(text, x, y + yOffset);
      }

      ctx.restore();
    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, seriesRef, containerRef, pivots, showPrices, highColor, lowColor]);

  // Request animation frame draw
  const scheduleDraw = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // Effect: Subscribe to chart updates
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Subscribe to time scale changes
    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(scheduleDraw);

    // Initial draw
    scheduleDraw();

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(scheduleDraw);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [chartRef, scheduleDraw]);

  // Effect: Redraw when pivots change
  useEffect(() => {
    scheduleDraw();
  }, [pivots, showPrices, highColor, lowColor, scheduleDraw]);

  if (!shouldRender) return null;

  // Transparent overlay canvas
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 15,
      }}
    />
  );
});

export default PivotPointsHLOverlay;
