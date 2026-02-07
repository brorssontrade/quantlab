/**
 * EnvFillOverlay
 * 
 * Canvas overlay that draws the background fill between upper and lower Envelope bands.
 * 
 * Visual behavior (TradingView-parity):
 * - Semi-transparent fill between upper and lower bands
 * - Fill rendered BELOW candles and lines (z-index lower)
 * - Segmented at data gaps (where upper/lower don't have values)
 * - Default color: light blue rgba(33, 150, 243, 0.1) (~10% opacity)
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";
import type { IndicatorWorkerResponse } from "../indicators/registryV2";

interface EnvFillOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** ENV indicator result */
  envResult: IndicatorWorkerResponse | null;
  /** Whether the fill is enabled */
  enabled?: boolean;
}

/**
 * EnvFillOverlay Component
 * 
 * Renders the background fill between upper and lower Envelope bands.
 */
export const EnvFillOverlay = memo(function EnvFillOverlay({
  chartRef,
  seriesRef,
  containerRef,
  envResult,
  enabled = true,
}: EnvFillOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  // Check if we should render
  const shouldRender = enabled && envResult !== null && (envResult as any)._envFill !== undefined;

  // Draw the envelope fill
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = seriesRef.current;
      const container = containerRef.current;
      const envFill = (envResult as any)?._envFill;

      if (!canvas || !chart || !series || !container || !envFill || !enabled) {
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

      // Get upper and lower band data
      const { upper, lower, backgroundColor } = envFill;
      
      // Build time-indexed maps for upper and lower values
      const upperMap = new Map<number, number>();
      const lowerMap = new Map<number, number>();
      
      upper.forEach((pt: any) => {
        if ('value' in pt && Number.isFinite(pt.value)) {
          upperMap.set(Number(pt.time), pt.value);
        }
      });
      lower.forEach((pt: any) => {
        if ('value' in pt && Number.isFinite(pt.value)) {
          lowerMap.set(Number(pt.time), pt.value);
        }
      });

      // Collect all times where both upper and lower have values
      const allTimes = new Set<number>();
      upperMap.forEach((_, time) => {
        if (lowerMap.has(time)) {
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
      // Build fill segments - each segment is where both upper and lower have values
      // ========================================================================
      
      type FillSegment = {
        points: Array<{ time: number; x: number; yUpper: number; yLower: number }>;
      };

      const segments: FillSegment[] = [];
      let currentSegment: FillSegment | null = null;
      let prevTime: number | null = null;

      for (const time of visibleTimes) {
        const valueUpper = upperMap.get(time);
        const valueLower = lowerMap.get(time);
        
        if (valueUpper === undefined || valueLower === undefined) continue;

        // Get x coordinate
        const x = timeScale.timeToCoordinate(time as unknown as Time);
        if (x === null) continue;

        // Get y coordinates
        const yUpper = series.priceToCoordinate(valueUpper);
        const yLower = series.priceToCoordinate(valueLower);
        if (yUpper === null || yLower === null) continue;

        // Check for gap (non-consecutive times - more than expected spacing)
        const hasGap = prevTime !== null && 
          sortedTimes.indexOf(time) - sortedTimes.indexOf(prevTime) > 1;

        if (hasGap && currentSegment && currentSegment.points.length > 0) {
          // Gap detected - save current segment and start new
          segments.push(currentSegment);
          currentSegment = null;
        }

        // Start new segment if needed
        if (currentSegment === null) {
          currentSegment = { points: [] };
        }

        // Add point to current segment
        currentSegment.points.push({ time, x, yUpper, yLower });
        prevTime = time;
      }

      // Don't forget the last segment
      if (currentSegment && currentSegment.points.length > 0) {
        segments.push(currentSegment);
      }

      // ========================================================================
      // Draw each fill segment as a filled polygon
      // ========================================================================
      
      ctx.fillStyle = backgroundColor;

      for (const segment of segments) {
        if (segment.points.length < 2) continue;

        ctx.beginPath();

        // Start with upper band points (from left to right)
        const firstPt = segment.points[0];
        ctx.moveTo(firstPt.x, firstPt.yUpper);
        
        // Draw along upper band
        for (let i = 1; i < segment.points.length; i++) {
          ctx.lineTo(segment.points[i].x, segment.points[i].yUpper);
        }
        
        // Then back along lower band (in reverse, right to left)
        for (let i = segment.points.length - 1; i >= 0; i--) {
          ctx.lineTo(segment.points[i].x, segment.points[i].yLower);
        }
        
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, seriesRef, containerRef, envResult, enabled]);

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
  }, [envResult, scheduleRedraw]);

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
      data-testid="env-fill-overlay"
    />
  );
});

export default EnvFillOverlay;
