/**
 * IchimokuCloudOverlay
 * 
 * Canvas overlay that draws the Kumo (cloud) fill between Senkou Span A and B.
 * 
 * Why canvas overlay instead of LWC fill:
 * - Cloud needs to change color where A/B cross (green → red segments)
 * - Fill extends into the future (26 bars ahead) - beyond candle data
 * - No diagonal "bridges" between segments
 * 
 * Visual behavior (TradingView-parity):
 * - Bullish cloud (A >= B): green fill with ~15-25% opacity
 * - Bearish cloud (A < B): red fill with ~15-25% opacity
 * - Cloud segmented at A/B crossings - color changes exactly at cross point
 * - Fill rendered BELOW candles and lines (z-index lower)
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws visible range (with buffer for future projection)
 * - Uses TV-matching colors
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";
import type { IndicatorWorkerResponse } from "../indicators/registryV2";

// TradingView Ichimoku cloud colors (with opacity for subtle fill)
// TV uses approximately 15-20% opacity for the cloud fill
const CLOUD_COLORS = {
  bullish: "rgba(76, 175, 80, 0.20)",   // Green ~20% opacity (A >= B)
  bearish: "rgba(255, 82, 82, 0.20)",   // Red ~20% opacity (A < B)
};

interface IchimokuCloudOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Ichimoku indicator result */
  ichimokuResult: IndicatorWorkerResponse | null;
  /** Whether cloud fill is enabled */
  showCloudFill?: boolean;
}

/**
 * IchimokuCloudOverlay Component
 * 
 * Renders the Kumo (cloud) fill between Senkou Span A and Senkou Span B.
 * Cloud changes color based on which span is higher (bullish/bearish).
 */
export const IchimokuCloudOverlay = memo(function IchimokuCloudOverlay({
  chartRef,
  seriesRef,
  containerRef,
  ichimokuResult,
  showCloudFill = true,
}: IchimokuCloudOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = showCloudFill && ichimokuResult !== null;

  // Draw the cloud fill
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = seriesRef.current;
      const container = containerRef.current;

      if (!canvas || !chart || !series || !container || !ichimokuResult || !showCloudFill) {
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

      // Get Senkou Span A and B lines
      const senkouALine = ichimokuResult.lines.find((l) => l.id === "senkouA");
      const senkouBLine = ichimokuResult.lines.find((l) => l.id === "senkouB");
      if (!senkouALine || !senkouBLine) return;

      // Build time-indexed maps for A and B values
      // CRITICAL: Only include points that have a finite value
      const senkouAMap = new Map<number, number>();
      const senkouBMap = new Map<number, number>();
      
      senkouALine.values.forEach((pt: any) => {
        if ('value' in pt && Number.isFinite(pt.value)) {
          senkouAMap.set(Number(pt.time), pt.value);
        }
      });
      senkouBLine.values.forEach((pt: any) => {
        if ('value' in pt && Number.isFinite(pt.value)) {
          senkouBMap.set(Number(pt.time), pt.value);
        }
      });

      // Collect all times where both A and B have values
      const allTimes = new Set<number>();
      senkouAMap.forEach((_, time) => {
        if (senkouBMap.has(time)) {
          allTimes.add(time);
        }
      });
      
      // Sort times
      const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
      if (sortedTimes.length < 2) return;

      // Filter to visible range (with generous buffer for future projection)
      const visibleTimes: number[] = [];
      for (const time of sortedTimes) {
        const coord = timeScale.timeToCoordinate(time as unknown as Time);
        if (coord !== null && coord >= -100 && coord <= cssWidth + 200) {
          visibleTimes.push(time);
        }
      }

      if (visibleTimes.length < 2) return;

      ctx.save();

      // ========================================================================
      // Build cloud segments - each segment is where A >= B or A < B consistently
      // ========================================================================
      
      type CloudSegment = {
        isBullish: boolean;  // A >= B
        points: Array<{ time: number; x: number; yA: number; yB: number }>;
      };

      const segments: CloudSegment[] = [];
      let currentSegment: CloudSegment | null = null;

      for (const time of visibleTimes) {
        const valueA = senkouAMap.get(time);
        const valueB = senkouBMap.get(time);
        
        if (valueA === undefined || valueB === undefined) continue;

        // Get x coordinate
        const x = timeScale.timeToCoordinate(time as unknown as Time);
        if (x === null) continue;

        // Get y coordinates
        const yA = series.priceToCoordinate(valueA);
        const yB = series.priceToCoordinate(valueB);
        if (yA === null || yB === null) continue;

        const isBullish = valueA >= valueB;

        // Check if we need to start a new segment (cloud color changes)
        if (currentSegment !== null && currentSegment.isBullish !== isBullish) {
          // Cloud color changes - find approximate cross point and split
          if (currentSegment.points.length > 0) {
            // Add interpolated crossing point to current segment
            const lastPt = currentSegment.points[currentSegment.points.length - 1];
            const crossX = (lastPt.x + x) / 2;
            const crossY = (lastPt.yA + lastPt.yB + yA + yB) / 4;
            currentSegment.points.push({
              time,
              x: crossX,
              yA: crossY,
              yB: crossY,
            });
            segments.push(currentSegment);
            
            // Start new segment from cross point
            currentSegment = {
              isBullish,
              points: [{
                time,
                x: crossX,
                yA: crossY,
                yB: crossY,
              }],
            };
          }
        }

        // Start new segment if needed
        if (currentSegment === null) {
          currentSegment = {
            isBullish,
            points: [],
          };
        }

        // Add point to current segment
        currentSegment.points.push({ time, x, yA, yB });
      }

      // Don't forget the last segment
      if (currentSegment && currentSegment.points.length > 0) {
        segments.push(currentSegment);
      }

      // ========================================================================
      // Draw each cloud segment as a filled polygon
      // ========================================================================
      
      for (const segment of segments) {
        if (segment.points.length < 2) continue;

        const fillColor = segment.isBullish ? CLOUD_COLORS.bullish : CLOUD_COLORS.bearish;
        
        ctx.fillStyle = fillColor;
        ctx.beginPath();

        // Start with Span A points (top or bottom depending on which is higher)
        const firstPt = segment.points[0];
        ctx.moveTo(firstPt.x, firstPt.yA);
        
        // Draw along Span A
        for (let i = 1; i < segment.points.length; i++) {
          ctx.lineTo(segment.points[i].x, segment.points[i].yA);
        }
        
        // Then back along Span B (in reverse)
        for (let i = segment.points.length - 1; i >= 0; i--) {
          ctx.lineTo(segment.points[i].x, segment.points[i].yB);
        }
        
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, seriesRef, containerRef, ichimokuResult, showCloudFill]);

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
    if (!chart || !showCloudFill) return;

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
  }, [chartRef, showCloudFill, scheduleRedraw]);

  // Redraw when data changes
  useEffect(() => {
    scheduleRedraw();
  }, [ichimokuResult, scheduleRedraw]);

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
      data-testid="ichimoku-cloud-overlay"
    />
  );
});

export default IchimokuCloudOverlay;
