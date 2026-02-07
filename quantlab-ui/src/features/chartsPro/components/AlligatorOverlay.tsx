/**
 * AlligatorOverlay
 * 
 * Canvas overlay that draws Williams Alligator indicator with forward-shifted lines.
 * 
 * TradingView doc: https://www.tradingview.com/support/solutions/43000592305-williams-alligator/
 * 
 * Visual behavior (TradingView-parity):
 * - Three SMMA lines (Jaw, Teeth, Lips) with forward offsets
 * - Jaw (blue, slowest): SMMA(13) offset +8
 * - Teeth (pink, medium): SMMA(8) offset +5
 * - Lips (green, fastest): SMMA(5) offset +3
 * - Lines extend into whitespace beyond current bar
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws visible range
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi } from "@/lib/lightweightCharts";

// Props interface
interface AlligatorOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Jaw line data (shifted) */
  jaw: Array<{ time: number; value?: number }>;
  /** Teeth line data (shifted) */
  teeth: Array<{ time: number; value?: number }>;
  /** Lips line data (shifted) */
  lips: Array<{ time: number; value?: number }>;
  /** Show jaw line */
  showJaw: boolean;
  /** Show teeth line */
  showTeeth: boolean;
  /** Show lips line */
  showLips: boolean;
  /** Jaw line color */
  jawColor: string;
  /** Teeth line color */
  teethColor: string;
  /** Lips line color */
  lipsColor: string;
  /** Jaw line width */
  jawLineWidth: number;
  /** Teeth line width */
  teethLineWidth: number;
  /** Lips line width */
  lipsLineWidth: number;
}

/**
 * AlligatorOverlay Component
 * 
 * Renders Williams Alligator indicator with forward-shifted lines.
 */
export const AlligatorOverlay = memo(function AlligatorOverlay({
  chartRef,
  seriesRef,
  containerRef,
  jaw,
  teeth,
  lips,
  showJaw,
  showTeeth,
  showLips,
  jawColor,
  teethColor,
  lipsColor,
  jawLineWidth,
  teethLineWidth,
  lipsLineWidth,
}: AlligatorOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = (showJaw && jaw.length > 0) || 
                       (showTeeth && teeth.length > 0) || 
                       (showLips && lips.length > 0);

  // Draw line helper
  const drawLine = useCallback((
    ctx: CanvasRenderingContext2D,
    chart: IChartApi,
    series: ISeriesApi<any>,
    points: Array<{ time: number; value?: number }>,
    color: string,
    lineWidth: number
  ) => {
    const timeScale = chart.timeScale();
    
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    
    let started = false;
    
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (pt.value === undefined || !Number.isFinite(pt.value)) continue;
      
      const x = timeScale.timeToCoordinate(pt.time as any);
      const y = series.priceToCoordinate(pt.value);
      
      if (x === null || y === null) continue;
      
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    if (started) {
      ctx.stroke();
    }
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

      // Draw lines (lips first, then teeth, then jaw - so jaw is on top)
      if (showLips && lips.length > 0) {
        drawLine(ctx, chart, series, lips, lipsColor, lipsLineWidth);
      }
      if (showTeeth && teeth.length > 0) {
        drawLine(ctx, chart, series, teeth, teethColor, teethLineWidth);
      }
      if (showJaw && jaw.length > 0) {
        drawLine(ctx, chart, series, jaw, jawColor, jawLineWidth);
      }
    } finally {
      isDrawingRef.current = false;
    }
  }, [
    chartRef, seriesRef, containerRef,
    jaw, teeth, lips,
    showJaw, showTeeth, showLips,
    jawColor, teethColor, lipsColor,
    jawLineWidth, teethLineWidth, lipsLineWidth,
    drawLine
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
  }, [jaw, teeth, lips, showJaw, showTeeth, showLips, scheduleDraw]);

  if (!shouldRender) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="alligator-overlay"
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

export default AlligatorOverlay;
