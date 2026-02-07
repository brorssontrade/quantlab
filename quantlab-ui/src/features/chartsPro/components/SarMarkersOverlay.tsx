/**
 * SarMarkersOverlay
 * 
 * Canvas overlay that draws SAR markers (circles, cross, diamonds).
 * TradingView renders SAR as discrete markers by default, not a connected line.
 * 
 * Why canvas overlay instead of LWC markers:
 * - LWC markers are designed for sparse events, not thousands of points
 * - Canvas allows efficient rendering of only visible range
 * - DPR-aware for crisp rendering on high-DPI displays
 * - Pixel-grid aligned for sharp markers
 * 
 * Visual behavior (TradingView-parity):
 * - Circles: small filled dots at SAR value
 * - Cross: small "+" at SAR value
 * - Default color: TV blue #2962FF
 * - Markers above candles but pointer-events: none
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";
import type { IndicatorWorkerResponse } from "../indicators/registryV2";

interface SarMarkersOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** SAR indicator result */
  sarResult: IndicatorWorkerResponse | null;
  /** Whether the overlay is enabled */
  enabled?: boolean;
}

/**
 * SarMarkersOverlay Component
 * 
 * Renders SAR markers (circles/cross) on a canvas overlay.
 */
export const SarMarkersOverlay = memo(function SarMarkersOverlay({
  chartRef,
  seriesRef,
  containerRef,
  sarResult,
  enabled = true,
}: SarMarkersOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  // Check if we should render
  const shouldRender = enabled && sarResult !== null && sarResult._sarData !== undefined;

  // Draw the markers
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = seriesRef.current;
      const container = containerRef.current;

      if (!canvas || !chart || !series || !container || !sarResult || !sarResult._sarData || !enabled) {
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

      // Get SAR data
      const { plotStyle, color, lineWidth, points } = sarResult._sarData;

      // Get visible range
      const timeScale = chart.timeScale();
      const visibleRange = timeScale.getVisibleLogicalRange();
      if (!visibleRange) return;

      // Filter to visible range and get coordinates
      const visiblePoints: Array<{ x: number; y: number; isUpTrend: boolean }> = [];
      
      for (const pt of points) {
        const x = timeScale.timeToCoordinate(pt.time as unknown as Time);
        if (x === null || x < -20 || x > cssWidth + 20) continue;
        
        const y = series.priceToCoordinate(pt.value);
        if (y === null) continue;
        
        visiblePoints.push({ x, y, isUpTrend: pt.isUpTrend });
      }

      if (visiblePoints.length === 0) return;

      ctx.save();

      // Determine marker size based on lineWidth
      // TV circles are quite small, roughly 3-4px radius
      const radius = Math.max(2, lineWidth + 1);
      
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, lineWidth);

      if (plotStyle === "circles") {
        // Draw filled circles
        for (const pt of visiblePoints) {
          // Align to pixel grid for crisp rendering
          const x = Math.round(pt.x) + 0.5;
          const y = Math.round(pt.y) + 0.5;
          
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (plotStyle === "cross") {
        // Draw "+" crosses
        const crossSize = radius + 1;
        
        for (const pt of visiblePoints) {
          const x = Math.round(pt.x);
          const y = Math.round(pt.y);
          
          ctx.beginPath();
          // Horizontal line
          ctx.moveTo(x - crossSize, y + 0.5);
          ctx.lineTo(x + crossSize, y + 0.5);
          // Vertical line
          ctx.moveTo(x + 0.5, y - crossSize);
          ctx.lineTo(x + 0.5, y + crossSize);
          ctx.stroke();
        }
      }

      ctx.restore();
    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, seriesRef, containerRef, sarResult, enabled]);

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
    if (!chart || !enabled) return;

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
  }, [chartRef, enabled, scheduleRedraw]);

  // Redraw when data changes
  useEffect(() => {
    scheduleRedraw();
  }, [sarResult, scheduleRedraw]);

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
      style={{ zIndex: 15 }} // Above candles (10) but below UI elements
      data-testid="sar-markers-overlay"
    />
  );
});

export default SarMarkersOverlay;
