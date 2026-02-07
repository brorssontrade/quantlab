/**
 * LinRegFillOverlay
 * 
 * Canvas overlay that draws the background fill between upper and lower Linear Regression bands.
 * 
 * Visual behavior (TradingView-parity):
 * - Semi-transparent fill between upper and lower deviation bands
 * - Fill rendered BELOW candles and lines (z-index lower)
 * - Segmented at data gaps (where upper/lower don't have values)
 * - Default color: light blue rgba(41, 98, 255, 0.1) (~10% opacity)
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";
import type { IndicatorWorkerResponse } from "../indicators/registryV2";

interface LinRegFillOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** LinReg indicator result */
  linregResult: IndicatorWorkerResponse | null;
  /** Whether the fill is enabled */
  enabled?: boolean;
}

/**
 * LinRegFillOverlay Component
 * 
 * Renders the background fill between upper and lower Linear Regression deviation bands.
 */
export const LinRegFillOverlay = memo(function LinRegFillOverlay({
  chartRef,
  seriesRef,
  containerRef,
  linregResult,
  enabled = true,
}: LinRegFillOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  // Check if we should render
  const shouldRender = enabled && linregResult !== null && (linregResult as any)._linregFill !== undefined;

  // Draw the channel fill
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = seriesRef.current;
      const container = containerRef.current;
      const linregFill = (linregResult as any)?._linregFill;

      if (!canvas || !chart || !series || !container || !linregFill || !enabled) {
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
      const { upper, lower, fillColor } = linregFill;
      
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
        const upVal = upperMap.get(time);
        const loVal = lowerMap.get(time);
        
        if (upVal === undefined || loVal === undefined) {
          // Gap - close current segment
          if (currentSegment && currentSegment.points.length >= 2) {
            segments.push(currentSegment);
          }
          currentSegment = null;
          prevTime = null;
          continue;
        }

        const x = timeScale.timeToCoordinate(time as unknown as Time);
        const yUpper = series.priceToCoordinate(upVal);
        const yLower = series.priceToCoordinate(loVal);

        if (x === null || yUpper === null || yLower === null) {
          // Can't convert coordinates - close segment
          if (currentSegment && currentSegment.points.length >= 2) {
            segments.push(currentSegment);
          }
          currentSegment = null;
          prevTime = null;
          continue;
        }

        // Start new segment if needed
        if (!currentSegment) {
          currentSegment = { points: [] };
        }

        currentSegment.points.push({ time, x, yUpper, yLower });
        prevTime = time;
      }

      // Close final segment
      if (currentSegment && currentSegment.points.length >= 2) {
        segments.push(currentSegment);
      }

      // ========================================================================
      // Draw each segment as a filled polygon
      // ========================================================================
      
      ctx.fillStyle = fillColor || "rgba(41, 98, 255, 0.1)";

      for (const segment of segments) {
        const { points } = segment;
        if (points.length < 2) continue;

        ctx.beginPath();

        // Draw upper line from left to right
        ctx.moveTo(points[0].x, points[0].yUpper);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].yUpper);
        }

        // Draw lower line from right to left (to close the polygon)
        for (let i = points.length - 1; i >= 0; i--) {
          ctx.lineTo(points[i].x, points[i].yLower);
        }

        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();

    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, seriesRef, containerRef, linregResult, enabled]);

  // Trigger redraw when chart updates
  useEffect(() => {
    if (!shouldRender) return;

    const chart = chartRef.current;
    if (!chart) return;

    const handleResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };

    const handleTimeRangeChange = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };

    const handleCrosshairMove = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleTimeRangeChange);
    chart.subscribeCrosshairMove(handleCrosshairMove);
    
    // Initial draw
    draw();

    // Resize observer
    const container = containerRef.current;
    let resizeObserver: ResizeObserver | null = null;
    if (container) {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleTimeRangeChange);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [chartRef, containerRef, draw, shouldRender]);

  // Redraw when linregResult changes
  useEffect(() => {
    if (shouldRender) {
      draw();
    }
  }, [linregResult, draw, shouldRender]);

  // Clear canvas when disabled
  useEffect(() => {
    if (!shouldRender) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }, [shouldRender]);

  if (!shouldRender) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1, // Below candles (zIndex: 2) and lines
      }}
    />
  );
});

export default LinRegFillOverlay;
