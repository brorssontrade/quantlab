/**
 * AutoFibOverlay
 * 
 * Canvas overlay that draws Auto Fibonacci Retracement levels.
 * 
 * TradingView doc: https://www.tradingview.com/support/solutions/43000594025-auto-fib-retracement/
 * 
 * Visual behavior (TradingView-parity):
 * - Horizontal Fibonacci levels between detected swing points
 * - Background fills between levels (with transparency)
 * - Level labels on left or right
 * - Optional price display
 * - Extend left/right options
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws visible range
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";

// Props interface
interface AutoFibOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Start anchor point of the fib */
  startPoint: { time: number; price: number } | null;
  /** End anchor point of the fib */
  endPoint: { time: number; price: number } | null;
  /** Fibonacci levels with prices and colors */
  levels: Array<{ ratio: number; price: number; color: string }>;
  /** Whether the retracement is upward (base at bottom) */
  isUpward: boolean;
  /** Extend levels to the left */
  extendLeft: boolean;
  /** Extend levels to the right */
  extendRight: boolean;
  /** Show price values */
  showPrices: boolean;
  /** Show level values or percentages */
  showLevels: "values" | "percent";
  /** Labels position */
  labelsPosition: "left" | "right";
  /** Background transparency (0-100) */
  backgroundTransparency: number;
  /** Line width */
  lineWidth: number;
}

// Font for labels
const LABEL_FONT = "11px -apple-system, BlinkMacSystemFont, sans-serif";
const LABEL_PADDING = 4;

/**
 * AutoFibOverlay Component
 * 
 * Renders Fibonacci retracement levels with fills and labels.
 */
export const AutoFibOverlay = memo(function AutoFibOverlay({
  chartRef,
  seriesRef,
  containerRef,
  startPoint,
  endPoint,
  levels,
  isUpward,
  extendLeft,
  extendRight,
  showPrices,
  showLevels,
  labelsPosition,
  backgroundTransparency,
  lineWidth,
}: AutoFibOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = startPoint !== null && endPoint !== null && levels.length > 0;

  // Draw the fib levels
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = seriesRef.current;
      const container = containerRef.current;

      if (!canvas || !chart || !series || !container || !startPoint || !endPoint) {
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

      const timeScale = chart.timeScale();
      const visibleRange = timeScale.getVisibleLogicalRange();
      if (!visibleRange) return;

      ctx.save();

      // Get anchor coordinates
      const startX = timeScale.timeToCoordinate(startPoint.time as unknown as Time);
      const endX = timeScale.timeToCoordinate(endPoint.time as unknown as Time);
      
      if (startX === null || endX === null) {
        ctx.restore();
        return;
      }

      // Determine horizontal extent
      let leftX = Math.min(startX, endX);
      let rightX = Math.max(startX, endX);
      
      if (extendLeft) leftX = 0;
      if (extendRight) rightX = cssWidth;

      // Calculate alpha for fills
      const fillAlpha = 1 - (backgroundTransparency / 100);

      // Sort levels by price for proper fill ordering
      const sortedLevels = [...levels].sort((a, b) => b.price - a.price);

      // Draw background fills between levels
      if (fillAlpha > 0) {
        for (let i = 0; i < sortedLevels.length - 1; i++) {
          const topLevel = sortedLevels[i];
          const bottomLevel = sortedLevels[i + 1];
          
          const topY = series.priceToCoordinate(topLevel.price);
          const bottomY = series.priceToCoordinate(bottomLevel.price);
          
          if (topY === null || bottomY === null) continue;
          
          // Use the top level's color with alpha
          const fillColor = hexToRgba(topLevel.color, fillAlpha);
          ctx.fillStyle = fillColor;
          ctx.fillRect(leftX, topY, rightX - leftX, bottomY - topY);
        }
      }

      // Draw level lines
      ctx.lineWidth = lineWidth;
      ctx.font = LABEL_FONT;
      
      for (const level of levels) {
        const y = series.priceToCoordinate(level.price);
        if (y === null) continue;
        
        // Draw line
        ctx.strokeStyle = level.color;
        ctx.beginPath();
        ctx.moveTo(leftX, y);
        ctx.lineTo(rightX, y);
        ctx.stroke();
        
        // Draw label
        const labelX = labelsPosition === "left" ? leftX + LABEL_PADDING : rightX - LABEL_PADDING;
        ctx.textAlign = labelsPosition === "left" ? "left" : "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = level.color;
        
        // Build label text
        let labelText = "";
        if (showLevels === "percent") {
          labelText = `${(level.ratio * 100).toFixed(1)}%`;
        } else {
          labelText = level.ratio.toString();
        }
        
        if (showPrices) {
          labelText += ` (${level.price.toFixed(2)})`;
        }
        
        ctx.fillText(labelText, labelX, y);
      }

      ctx.restore();
    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, seriesRef, containerRef, startPoint, endPoint, levels, isUpward,
      extendLeft, extendRight, showPrices, showLevels, labelsPosition, 
      backgroundTransparency, lineWidth]);

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

    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(scheduleDraw);

    scheduleDraw();

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(scheduleDraw);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [chartRef, scheduleDraw]);

  // Effect: Redraw when data changes
  useEffect(() => {
    scheduleDraw();
  }, [startPoint, endPoint, levels, extendLeft, extendRight, showPrices, 
      showLevels, labelsPosition, backgroundTransparency, lineWidth, scheduleDraw]);

  if (!shouldRender) return null;

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
        zIndex: 13,
      }}
    />
  );
});

// Helper to convert hex color to rgba
function hexToRgba(hex: string, alpha: number): string {
  // Remove # if present
  const h = hex.replace("#", "");
  
  // Parse hex values
  let r = 0, g = 0, b = 0;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length === 6) {
    r = parseInt(h.substring(0, 2), 16);
    g = parseInt(h.substring(2, 4), 16);
    b = parseInt(h.substring(4, 6), 16);
  }
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default AutoFibOverlay;
