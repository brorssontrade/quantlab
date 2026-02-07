/**
 * MedianCloudOverlay
 * 
 * Canvas overlay that draws the cloud fill between Median and Median EMA lines
 * with direction-based coloring.
 * 
 * Visual behavior (TradingView-parity):
 * - Green cloud when Median > Median EMA (bullish)
 * - Violet cloud when Median < Median EMA (bearish)
 * - Cloud color switches at crossing points
 * - Fill rendered BELOW lines (z-index lower)
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";
import type { IndicatorWorkerResponse } from "../indicators/registryV2";

// Default cloud colors (from TradingView)
const DEFAULT_CLOUD_UP_COLOR = "rgba(8, 153, 129, 0.3)";   // green 30%
const DEFAULT_CLOUD_DOWN_COLOR = "rgba(156, 39, 176, 0.3)"; // violet 30%

interface MedianCloudOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Median indicator result */
  medianResult: IndicatorWorkerResponse | null;
  /** Whether the fill is enabled */
  enabled?: boolean;
}

/**
 * MedianCloudOverlay Component
 * 
 * Renders direction-aware cloud fill between Median and Median EMA lines.
 */
export const MedianCloudOverlay = memo(function MedianCloudOverlay({
  chartRef,
  seriesRef,
  containerRef,
  medianResult,
  enabled = true,
}: MedianCloudOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  // Check if we should render
  const medianCloud = (medianResult as any)?._medianCloud;
  const shouldRender = enabled && medianResult !== null && medianCloud !== undefined;

  // Draw the cloud fill
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = seriesRef.current;
      const container = containerRef.current;

      if (!canvas || !chart || !series || !container || !medianCloud || !enabled) {
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

      // Get median and EMA data
      const { median, medianEma, cloudUpColor, cloudDownColor } = medianCloud;
      
      const upColor = cloudUpColor || DEFAULT_CLOUD_UP_COLOR;
      const downColor = cloudDownColor || DEFAULT_CLOUD_DOWN_COLOR;
      
      // Build time-indexed maps for median and EMA values
      const medianMap = new Map<number, number>();
      const emaMap = new Map<number, number>();
      
      median.forEach((pt: any) => {
        if ('value' in pt && Number.isFinite(pt.value)) {
          medianMap.set(Number(pt.time), pt.value);
        }
      });
      medianEma.forEach((pt: any) => {
        if ('value' in pt && Number.isFinite(pt.value)) {
          emaMap.set(Number(pt.time), pt.value);
        }
      });

      // Collect all times where both median and EMA have values
      const allTimes = new Set<number>();
      medianMap.forEach((_, time) => {
        if (emaMap.has(time)) {
          allTimes.add(time);
        }
      });
      
      // Sort times
      const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
      if (sortedTimes.length < 2) return;

      // Filter to visible range
      const visibleTimes: number[] = [];
      for (const time of sortedTimes) {
        const coord = timeScale.timeToCoordinate(time as unknown as Time);
        if (coord !== null && coord >= -50 && coord <= cssWidth + 50) {
          visibleTimes.push(time);
        }
      }

      if (visibleTimes.length < 2) return;

      ctx.save();

      // ========================================================================
      // Build point array with screen coordinates
      // ========================================================================
      
      interface CloudPoint {
        time: number;
        x: number;
        yMedian: number;
        yEma: number;
        medianVal: number;
        emaVal: number;
      }

      const points: CloudPoint[] = [];
      for (const time of visibleTimes) {
        const medianVal = medianMap.get(time);
        const emaVal = emaMap.get(time);
        
        if (medianVal === undefined || emaVal === undefined) continue;

        const x = timeScale.timeToCoordinate(time as unknown as Time);
        if (x === null) continue;

        const yMedian = series.priceToCoordinate(medianVal);
        const yEma = series.priceToCoordinate(emaVal);
        if (yMedian === null || yEma === null) continue;

        points.push({ time, x, yMedian, yEma, medianVal, emaVal });
      }

      if (points.length < 2) {
        ctx.restore();
        return;
      }

      // ========================================================================
      // Draw cloud fills with direction-based coloring
      // Split at crossings where median crosses EMA
      // ========================================================================
      
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        
        // Determine direction: median above or below EMA
        const diff1 = p1.medianVal - p1.emaVal;
        const diff2 = p2.medianVal - p2.emaVal;
        const sign1 = diff1 >= 0 ? 1 : -1;
        const sign2 = diff2 >= 0 ? 1 : -1;
        
        if (sign1 === sign2 || (Math.abs(diff1) < 0.0001 && Math.abs(diff2) < 0.0001)) {
          // Same direction - simple quadrilateral fill
          const fillColor = sign1 >= 0 ? upColor : downColor;
          ctx.fillStyle = fillColor;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.yMedian);
          ctx.lineTo(p2.x, p2.yMedian);
          ctx.lineTo(p2.x, p2.yEma);
          ctx.lineTo(p1.x, p1.yEma);
          ctx.closePath();
          ctx.fill();
        } else {
          // Direction change - find crossing point and draw two triangular regions
          // Linear interpolation to find x where median = ema
          const absDiff1 = Math.abs(diff1);
          const absDiff2 = Math.abs(diff2);
          const t = absDiff1 / (absDiff1 + absDiff2);
          const xCross = p1.x + t * (p2.x - p1.x);
          
          // Calculate y at crossing (average of the two lines at that point)
          const yCrossMedian = p1.yMedian + t * (p2.yMedian - p1.yMedian);
          const yCrossEma = p1.yEma + t * (p2.yEma - p1.yEma);
          const yCross = (yCrossMedian + yCrossEma) / 2;
          
          // First triangle (p1 to crossing)
          ctx.fillStyle = sign1 >= 0 ? upColor : downColor;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.yMedian);
          ctx.lineTo(xCross, yCross);
          ctx.lineTo(p1.x, p1.yEma);
          ctx.closePath();
          ctx.fill();
          
          // Second triangle (crossing to p2)
          ctx.fillStyle = sign2 >= 0 ? upColor : downColor;
          ctx.beginPath();
          ctx.moveTo(xCross, yCross);
          ctx.lineTo(p2.x, p2.yMedian);
          ctx.lineTo(p2.x, p2.yEma);
          ctx.closePath();
          ctx.fill();
        }
      }

      ctx.restore();
    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, seriesRef, containerRef, medianCloud, enabled]);

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
  }, [medianResult, scheduleRedraw]);

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
      style={{ zIndex: 5 }} // Below candles (10) and lines, but above background
      data-testid="median-cloud-overlay"
    />
  );
});

export default MedianCloudOverlay;
