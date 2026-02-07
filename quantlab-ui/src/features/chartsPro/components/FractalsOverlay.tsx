/**
 * FractalsOverlay
 * 
 * Canvas overlay that draws Williams Fractals indicator as up/down triangles.
 * 
 * TradingView doc: https://www.tradingview.com/support/solutions/43000591663-williams-fractal/
 * 
 * Visual behavior (TradingView-parity):
 * - Up fractals (green triangles) below bars at fractal lows
 * - Down fractals (red triangles) above bars at fractal highs
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws visible range
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi } from "@/lib/lightweightCharts";
import type { WilliamsFractalPoint } from "../indicators/compute";

// Props interface
interface FractalsOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Fractal high points */
  highs: WilliamsFractalPoint[];
  /** Fractal low points */
  lows: WilliamsFractalPoint[];
  /** Show up fractals */
  showUpFractals: boolean;
  /** Show down fractals */
  showDownFractals: boolean;
  /** Up fractal color */
  upColor: string;
  /** Down fractal color */
  downColor: string;
}

// Triangle size
const TRIANGLE_SIZE = 8;
const TRIANGLE_OFFSET = 4;

/**
 * FractalsOverlay Component
 * 
 * Renders Williams Fractals as up/down triangles.
 */
export const FractalsOverlay = memo(function FractalsOverlay({
  chartRef,
  seriesRef,
  containerRef,
  highs,
  lows,
  showUpFractals,
  showDownFractals,
  upColor,
  downColor,
}: FractalsOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = (showUpFractals && lows.length > 0) || 
                       (showDownFractals && highs.length > 0);

  // Draw triangle helper
  const drawTriangle = useCallback((
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    pointUp: boolean,
    color: string
  ) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    
    if (pointUp) {
      // Triangle pointing up (for fractal lows - below bar)
      ctx.moveTo(x, y - size);
      ctx.lineTo(x - size * 0.7, y);
      ctx.lineTo(x + size * 0.7, y);
    } else {
      // Triangle pointing down (for fractal highs - above bar)
      ctx.moveTo(x, y + size);
      ctx.lineTo(x - size * 0.7, y);
      ctx.lineTo(x + size * 0.7, y);
    }
    
    ctx.closePath();
    ctx.fill();
  }, []);

  // Draw all
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

      // Clear canvas
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const timeScale = chart.timeScale();

      // Draw up fractals (lows) - green triangles below bars
      if (showUpFractals) {
        for (const fractal of lows) {
          const x = timeScale.timeToCoordinate(fractal.time as any);
          const y = series.priceToCoordinate(fractal.price);
          
          if (x === null || y === null) continue;
          
          // Draw triangle below bar (pointing up)
          drawTriangle(ctx, x, y + TRIANGLE_OFFSET + TRIANGLE_SIZE, TRIANGLE_SIZE, true, upColor);
        }
      }

      // Draw down fractals (highs) - red triangles above bars
      if (showDownFractals) {
        for (const fractal of highs) {
          const x = timeScale.timeToCoordinate(fractal.time as any);
          const y = series.priceToCoordinate(fractal.price);
          
          if (x === null || y === null) continue;
          
          // Draw triangle above bar (pointing down)
          drawTriangle(ctx, x, y - TRIANGLE_OFFSET - TRIANGLE_SIZE, TRIANGLE_SIZE, false, downColor);
        }
      }
    } finally {
      isDrawingRef.current = false;
    }
  }, [
    chartRef, seriesRef, containerRef,
    highs, lows,
    showUpFractals, showDownFractals,
    upColor, downColor,
    drawTriangle
  ]);

  // Schedule draw
  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  // Setup subscriptions
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const timeScale = chart.timeScale();
    
    const unsubVisible = timeScale.subscribeVisibleLogicalRangeChange(scheduleDraw);
    const unsubTimeScale = timeScale.subscribeSizeChange(scheduleDraw);

    // Initial draw
    scheduleDraw();

    return () => {
      unsubVisible();
      unsubTimeScale();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [chartRef, scheduleDraw]);

  // Redraw on data change
  useEffect(() => {
    scheduleDraw();
  }, [highs, lows, showUpFractals, showDownFractals, scheduleDraw]);

  if (!shouldRender) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="fractals-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 10,
      }}
    />
  );
});

export default FractalsOverlay;
