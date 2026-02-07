/**
 * AvwapBandsFillOverlay
 * 
 * Canvas overlay that draws the background fill between AVWAP band pairs.
 * Identical to VwapBandsFillOverlay but for Anchored VWAP.
 * 
 * Supports up to 3 band fill layers (Band #1, #2, #3), each between upper/lower.
 * 
 * Visual behavior (TradingView-parity):
 * - Subtle semi-transparent fill between upper and lower bands for each band pair
 * - Band #1: green fill (#4CAF50)
 * - Band #2: olive fill (#808000)
 * - Band #3: teal fill (#00897B)
 * - Fill rendered BELOW candles and lines (z-index lower)
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";
import type { IndicatorWorkerResponse } from "../indicators/registryV2";

/**
 * AVWAP fill configuration for a single band pair
 */
interface AvwapBandFill {
  enabled: boolean;
  color: string;
  opacity: number;
  upperLineId: string;
  lowerLineId: string;
}

/**
 * Full AVWAP fill configuration from indicator result
 */
interface AvwapFillConfig {
  fills: AvwapBandFill[];
}

interface AvwapBandsFillOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** AVWAP indicator result containing _avwapFill config */
  avwapResult: IndicatorWorkerResponse | null;
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
  
  if (color.startsWith("rgba")) {
    return color.replace(/[\d.]+\)$/, `${opacity})`);
  }
  
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${opacity})`);
  }
  
  return color;
}

/**
 * AvwapBandsFillOverlay Component
 */
export const AvwapBandsFillOverlay = memo(function AvwapBandsFillOverlay({
  chartRef,
  seriesRef,
  containerRef,
  avwapResult,
  enabled = true,
}: AvwapBandsFillOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  // Extract fill config from result
  const fillConfig = avwapResult?._avwapFill as AvwapFillConfig | undefined;
  
  // Check if we should render
  const hasEnabledFill = fillConfig?.fills?.some(f => f.enabled) ?? false;
  const shouldRender = enabled && avwapResult !== null && hasEnabledFill;

  // Draw the band fills
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = seriesRef.current;
      const container = containerRef.current;

      if (!canvas || !chart || !series || !container || !avwapResult || !fillConfig || !enabled) {
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

      const lines = avwapResult.lines;
      if (!lines || lines.length === 0) return;

      // Build lookup for line data by id
      const lineDataMap = new Map<string, Array<{ time: any; value?: number }>>();
      for (const line of lines) {
        lineDataMap.set(line.id, line.values as Array<{ time: any; value?: number }>);
      }

      // Draw each enabled band fill (in reverse order so Band#1 is on top)
      const enabledFills = fillConfig.fills.filter(f => f.enabled);
      
      for (let i = enabledFills.length - 1; i >= 0; i--) {
        const fill = enabledFills[i];
        const upperData = lineDataMap.get(fill.upperLineId);
        const lowerData = lineDataMap.get(fill.lowerLineId);
        
        if (!upperData || !lowerData) continue;

        const upperMap = new Map<number, number>();
        const lowerMap = new Map<number, number>();
        
        upperData.forEach((pt) => {
          if ('value' in pt && Number.isFinite(pt.value)) {
            upperMap.set(Number(pt.time), pt.value!);
          }
        });
        lowerData.forEach((pt) => {
          if ('value' in pt && Number.isFinite(pt.value)) {
            lowerMap.set(Number(pt.time), pt.value!);
          }
        });

        const allTimes = new Set<number>();
        upperMap.forEach((_, time) => {
          if (lowerMap.has(time)) {
            allTimes.add(time);
          }
        });
        
        const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
        if (sortedTimes.length < 2) continue;

        // Filter to visible range
        const visibleTimes: number[] = [];
        for (const time of sortedTimes) {
          const coord = timeScale.timeToCoordinate(time as unknown as Time);
          if (coord !== null && coord >= -50 && coord <= cssWidth + 50) {
            visibleTimes.push(time);
          }
        }

        if (visibleTimes.length < 2) continue;

        ctx.save();

        // Build fill segments
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

          const x = timeScale.timeToCoordinate(time as unknown as Time);
          if (x === null) continue;

          const yUpper = series.priceToCoordinate(valueUpper);
          const yLower = series.priceToCoordinate(valueLower);
          if (yUpper === null || yLower === null) continue;

          // Check for gap in times (handles anchor breaks)
          const hasGap = prevTime !== null && 
            sortedTimes.indexOf(time) - sortedTimes.indexOf(prevTime) > 1;

          if (hasGap && currentSegment && currentSegment.points.length > 0) {
            segments.push(currentSegment);
            currentSegment = null;
          }

          if (currentSegment === null) {
            currentSegment = { points: [] };
          }

          currentSegment.points.push({ time, x, yUpper, yLower });
          prevTime = time;
        }

        if (currentSegment && currentSegment.points.length > 0) {
          segments.push(currentSegment);
        }

        // Draw each fill segment
        ctx.fillStyle = colorWithOpacity(fill.color, fill.opacity);

        for (const segment of segments) {
          if (segment.points.length < 2) continue;

          ctx.beginPath();

          const firstPt = segment.points[0];
          ctx.moveTo(firstPt.x, firstPt.yUpper);
          
          for (let j = 1; j < segment.points.length; j++) {
            ctx.lineTo(segment.points[j].x, segment.points[j].yUpper);
          }
          
          for (let j = segment.points.length - 1; j >= 0; j--) {
            ctx.lineTo(segment.points[j].x, segment.points[j].yLower);
          }
          
          ctx.closePath();
          ctx.fill();
        }

        ctx.restore();
      }
    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, seriesRef, containerRef, avwapResult, fillConfig, enabled]);

  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

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

  useEffect(() => {
    scheduleRedraw();
  }, [avwapResult, scheduleRedraw]);

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
      style={{ zIndex: 5 }}
      data-testid="avwap-bands-fill-overlay"
    />
  );
});

export default AvwapBandsFillOverlay;
