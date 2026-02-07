/**
 * UlcerFillOverlay
 * 
 * Canvas overlay that draws the background fill between the Ulcer Index line and zero.
 * 
 * Visual behavior (TradingView-parity):
 * - Subtle semi-transparent fill between ulcer line and y=0
 * - Fill rendered BELOW lines (z-index lower)
 * - Segmented at data gaps (where ulcer doesn't have values)
 * - Default color: light blue rgba(41, 98, 255, 0.1) (~10% opacity)
 * - Ulcer Index is always >= 0, so fill is above the zero line
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";

interface UlcerFillConfig {
  showBackground: boolean;
  backgroundFillColor: string;
  backgroundFillOpacity: number;
  ulcerValues: Array<{ time: any; value: number }>;
}

interface UlcerFillOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the ulcer line series (for coordinate conversion in separate pane) */
  ulcerSeriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing (the separate pane container) */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Ulcer Index fill configuration */
  ulcerFillConfig: UlcerFillConfig | null;
  /** Whether the overlay is enabled */
  enabled?: boolean;
}

/**
 * Parse color to rgba with opacity
 */
function colorWithOpacity(color: string, opacity: number): string {
  // Handle hex colors
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    let r: number, g: number, b: number;
    
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      return color;
    }
    
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  
  // Handle existing rgba
  if (color.startsWith("rgba")) {
    return color.replace(/[\d.]+\)$/, `${opacity})`);
  }
  
  // Handle rgb
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${opacity})`);
  }
  
  return color;
}

/**
 * UlcerFillOverlay Component
 * 
 * Renders the background fill between Ulcer Index line and zero baseline.
 */
export const UlcerFillOverlay = memo(function UlcerFillOverlay({
  chartRef,
  ulcerSeriesRef,
  containerRef,
  ulcerFillConfig,
  enabled = true,
}: UlcerFillOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = enabled && ulcerFillConfig !== null && ulcerFillConfig.showBackground;

  // Draw the fill
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const ulcerSeries = ulcerSeriesRef.current;
      const container = containerRef.current;

      if (!canvas || !chart || !ulcerSeries || !container || !ulcerFillConfig || !enabled) {
        const ctx = canvas?.getContext("2d");
        if (ctx && canvas) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }

      if (!ulcerFillConfig.showBackground) {
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

      const { backgroundFillColor, backgroundFillOpacity, ulcerValues } = ulcerFillConfig;

      // Build time-indexed map for ulcer values
      const ulcerMap = new Map<number, number>();
      ulcerValues.forEach((pt: any) => {
        if ('value' in pt && Number.isFinite(pt.value)) {
          ulcerMap.set(Number(pt.time), pt.value);
        }
      });

      // Sort times
      const sortedTimes = Array.from(ulcerMap.keys()).sort((a, b) => a - b);
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

      // Get y coordinate for zero baseline
      const yZero = ulcerSeries.priceToCoordinate(0);
      if (yZero === null) return;

      ctx.save();

      // ========================================================================
      // Build fill segments - each segment is where ulcer has consecutive values
      // ========================================================================
      
      type FillSegment = {
        points: Array<{ time: number; x: number; yUlcer: number }>;
      };

      const segments: FillSegment[] = [];
      let currentSegment: FillSegment | null = null;
      let prevTimeIndex: number | null = null;

      for (let i = 0; i < visibleTimes.length; i++) {
        const time = visibleTimes[i];
        const valueUlcer = ulcerMap.get(time);
        
        if (valueUlcer === undefined) continue;

        // Get x coordinate
        const x = timeScale.timeToCoordinate(time as unknown as Time);
        if (x === null) continue;

        // Get y coordinate for ulcer value
        const yUlcer = ulcerSeries.priceToCoordinate(valueUlcer);
        if (yUlcer === null) continue;

        // Check for gap (non-consecutive times)
        const currentTimeIndex = sortedTimes.indexOf(time);
        const hasGap = prevTimeIndex !== null && currentTimeIndex - prevTimeIndex > 1;

        if (hasGap && currentSegment && currentSegment.points.length > 0) {
          segments.push(currentSegment);
          currentSegment = null;
        }

        // Start new segment if needed
        if (currentSegment === null) {
          currentSegment = { points: [] };
        }

        currentSegment.points.push({ time, x, yUlcer });
        prevTimeIndex = currentTimeIndex;
      }

      // Don't forget the last segment
      if (currentSegment && currentSegment.points.length > 0) {
        segments.push(currentSegment);
      }

      // ========================================================================
      // Draw each fill segment as a filled polygon (ulcer line down to zero)
      // ========================================================================
      
      const fillColor = colorWithOpacity(backgroundFillColor, backgroundFillOpacity);
      ctx.fillStyle = fillColor;

      for (const segment of segments) {
        if (segment.points.length < 2) continue;

        ctx.beginPath();

        // Start at first point on ulcer line
        const firstPt = segment.points[0];
        ctx.moveTo(firstPt.x, firstPt.yUlcer);
        
        // Draw along ulcer line (left to right)
        for (let i = 1; i < segment.points.length; i++) {
          ctx.lineTo(segment.points[i].x, segment.points[i].yUlcer);
        }
        
        // Drop down to zero line at the end
        const lastPt = segment.points[segment.points.length - 1];
        ctx.lineTo(lastPt.x, yZero);
        
        // Draw back along zero line (right to left)
        ctx.lineTo(firstPt.x, yZero);
        
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, ulcerSeriesRef, containerRef, ulcerFillConfig, enabled]);

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
  }, [ulcerFillConfig, scheduleRedraw]);

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
      style={{ zIndex: 5 }} // Below lines (10) but above background
      data-testid="ulcer-fill-overlay"
    />
  );
});

export default UlcerFillOverlay;
