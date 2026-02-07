/**
 * SupertrendFillOverlay
 * 
 * Canvas overlay that draws:
 * 1. The Supertrend LINE itself (to avoid LWC bridging artifacts)
 * 2. Translucent fill between price and Supertrend line
 * 
 * Why we draw the line here instead of using LWC LineSeries:
 * - LWC creates diagonal "bridges" between non-consecutive points even with WhitespaceData
 * - By drawing in canvas, we have 100% control over segment breaks
 * - We can guarantee NO line is drawn during inactive trend periods
 * 
 * Visual behavior (TV-parity):
 * - Uptrend: green line BELOW price + green fill between line and price
 * - Downtrend: red line ABOVE price + red fill between line and price
 * - At trend flip: line "jumps" to other band, color changes, NO diagonal bridge
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws visible range
 * - Uses theme tokens for colors
 * - Renders ABOVE candles for line visibility
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";
import type { IndicatorWorkerResponse } from "../indicators/registryV2";
import { TV_COLORS } from "../indicators/indicatorManifest";

interface SupertrendFillOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Supertrend indicator result */
  supertrendResult: IndicatorWorkerResponse | null;
  /** OHLC data for price reference */
  ohlcData: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  /** Whether the overlay is enabled */
  enabled?: boolean;
  /** Whether highlight fill is enabled (TV "Highlight Trend" setting) */
  highlight?: boolean;
}

// Semi-transparent colors for fills (TV-style opacity - 15% for subtle look)
const FILL_COLORS = {
  up: `${TV_COLORS.green}26`, // ~15% opacity (hex 26 = 38/255 = 0.149)
  down: `${TV_COLORS.red}26`, // ~15% opacity
};

// Solid line colors
const LINE_COLORS = {
  up: TV_COLORS.green,   // #26A69A
  down: TV_COLORS.red,   // #F23645
};

/**
 * SupertrendFillOverlay Component
 * 
 * CRITICAL: This component now draws BOTH the line AND the fill.
 * The LWC LineSeries for Supertrend should be set to visible: false
 * to avoid duplicate rendering and bridging artifacts.
 */
export const SupertrendFillOverlay = memo(function SupertrendFillOverlay({
  chartRef,
  seriesRef,
  containerRef,
  supertrendResult,
  ohlcData,
  enabled = true,
  highlight = true,
}: SupertrendFillOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  // Always render if enabled (we draw the line even without fill)
  const shouldRender = enabled && supertrendResult !== null;

  // Draw fill polygons and lines
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = seriesRef.current;
      const container = containerRef.current;

      if (!canvas || !chart || !series || !container || !supertrendResult || !enabled) {
        // Clear canvas if disabled
        const ctx = canvas?.getContext("2d");
        if (ctx && canvas) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }

      // Get canvas context
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Get device pixel ratio for crisp rendering
      const dpr = window.devicePixelRatio || 1;

      // Resize canvas to match container
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

      // Clear previous frame
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // Get visible range
      const timeScale = chart.timeScale();
      const visibleRange = timeScale.getVisibleLogicalRange();
      if (!visibleRange) return;

      // Get Supertrend lines
      const upLine = supertrendResult.lines.find((l) => l.id === "supertrend_up");
      const downLine = supertrendResult.lines.find((l) => l.id === "supertrend_down");
      if (!upLine && !downLine) return;

      // Build time-indexed maps for efficient lookup
      // CRITICAL: Only include points that have a finite value (not WhitespaceData)
      const upMap = new Map<number, number>();
      const downMap = new Map<number, number>();
      upLine?.values.forEach((pt: any) => {
        if ('value' in pt && Number.isFinite(pt.value)) {
          upMap.set(Number(pt.time), pt.value);
        }
      });
      downLine?.values.forEach((pt: any) => {
        if ('value' in pt && Number.isFinite(pt.value)) {
          downMap.set(Number(pt.time), pt.value);
        }
      });

      // Build price map
      const priceMap = new Map<number, { open: number; close: number; low: number; high: number }>();
      ohlcData.forEach((bar) => {
        priceMap.set(bar.time, { open: bar.open, close: bar.close, low: bar.low, high: bar.high });
      });

      // Collect ALL times from OHLC data (not just visible, but we'll filter by visible range)
      const allTimes = ohlcData.map(bar => bar.time).sort((a, b) => a - b);

      // Filter to only visible range (with some buffer)
      const visibleTimes: number[] = [];
      allTimes.forEach((time) => {
        const coord = timeScale.timeToCoordinate(time as unknown as Time);
        if (coord !== null && coord >= -50 && coord <= cssWidth + 50) {
          visibleTimes.push(time);
        }
      });

      if (visibleTimes.length < 1) return;

      ctx.save();

      // ========================================================================
      // STEP 1: Draw LINES (segment by segment, NO bridges across trend changes)
      // ========================================================================
      
      // Helper to draw a line segment
      const drawLineSegment = (
        points: Array<{ x: number; y: number }>,
        color: string
      ) => {
        if (points.length < 2) return;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1; // TV uses 1px lines
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
      };

      // Build segments: each segment is a consecutive run of same-trend bars
      type Segment = {
        isUptrend: boolean;
        points: Array<{ x: number; y: number; time: number; stValue: number }>;
      };
      
      const segments: Segment[] = [];
      let currentSegment: Segment | null = null;

      for (const time of visibleTimes) {
        const hasUp = upMap.has(time);
        const hasDown = downMap.has(time);
        
        // Determine trend for this bar (XOR: exactly one should be true)
        let isUptrend: boolean | null = null;
        let stValue: number | null = null;
        
        if (hasUp && !hasDown) {
          isUptrend = true;
          stValue = upMap.get(time)!;
        } else if (hasDown && !hasUp) {
          isUptrend = false;
          stValue = downMap.get(time)!;
        }

        if (isUptrend === null || stValue === null) {
          // No supertrend data for this bar - end current segment
          if (currentSegment && currentSegment.points.length > 0) {
            segments.push(currentSegment);
          }
          currentSegment = null;
          continue;
        }

        // Get x coordinate
        const x = timeScale.timeToCoordinate(time as unknown as Time);
        if (x === null) continue;

        // Get y coordinate
        const y = series.priceToCoordinate(stValue);
        if (y === null) continue;

        // Check if we need to start a new segment (trend changed)
        if (currentSegment !== null && currentSegment.isUptrend !== isUptrend) {
          // Trend changed - save current segment and start new one
          if (currentSegment.points.length > 0) {
            segments.push(currentSegment);
          }
          currentSegment = null;
        }

        // Start new segment if needed
        if (currentSegment === null) {
          currentSegment = {
            isUptrend,
            points: [],
          };
        }

        // Add point to current segment
        currentSegment.points.push({ x, y, time, stValue });
      }

      // Don't forget the last segment
      if (currentSegment && currentSegment.points.length > 0) {
        segments.push(currentSegment);
      }

      // Draw each segment
      for (const segment of segments) {
        const lineColor = segment.isUptrend ? LINE_COLORS.up : LINE_COLORS.down;
        drawLineSegment(
          segment.points.map(p => ({ x: p.x, y: p.y })),
          lineColor
        );
      }

      // ========================================================================
      // STEP 2: Draw FILL (only if highlight is enabled)
      // ========================================================================
      
      if (highlight) {
        for (const segment of segments) {
          const fillColor = segment.isUptrend ? FILL_COLORS.up : FILL_COLORS.down;
          
          if (segment.points.length < 2) continue;

          // Build polygon: top edge (price) forward, bottom edge (ST line) backward
          const topPoints: Array<{ x: number; y: number }> = [];
          const bottomPoints: Array<{ x: number; y: number }> = [];

          for (const pt of segment.points) {
            const priceData = priceMap.get(pt.time);
            if (!priceData) continue;

            const priceY = series.priceToCoordinate(priceData.close);
            if (priceY === null) continue;

            if (segment.isUptrend) {
              // Uptrend: ST is below price
              topPoints.push({ x: pt.x, y: priceY });
              bottomPoints.push({ x: pt.x, y: pt.y });
            } else {
              // Downtrend: ST is above price
              topPoints.push({ x: pt.x, y: pt.y });
              bottomPoints.push({ x: pt.x, y: priceY });
            }
          }

          if (topPoints.length < 2) continue;

          // Draw filled polygon
          ctx.fillStyle = fillColor;
          ctx.beginPath();
          ctx.moveTo(topPoints[0].x, topPoints[0].y);
          for (const pt of topPoints) {
            ctx.lineTo(pt.x, pt.y);
          }
          // Reverse to close polygon
          for (let i = bottomPoints.length - 1; i >= 0; i--) {
            ctx.lineTo(bottomPoints[i].x, bottomPoints[i].y);
          }
          ctx.closePath();
          ctx.fill();
        }
      }

      ctx.restore();
    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, seriesRef, containerRef, supertrendResult, ohlcData, enabled, highlight]);

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

  // Subscribe to timeScale changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !enabled) return;

    const timeScale = chart.timeScale();
    
    // Handler for visible range changes
    const handleRangeChange = () => {
      scheduleRedraw();
    };
    
    // Handler for crosshair changes
    const handleCrosshairMove = () => {
      scheduleRedraw();
    };
    
    // Subscribe
    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange);
    chart.subscribeCrosshairMove(handleCrosshairMove);

    // Initial draw
    scheduleRedraw();

    return () => {
      // Unsubscribe using LWC API
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
  }, [supertrendResult, ohlcData, scheduleRedraw]);

  // Redraw on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      scheduleRedraw();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [containerRef, scheduleRedraw]);

  // Don't render if disabled or no supertrend data
  if (!shouldRender) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }} // Above candles (z-index 0) but below crosshair/tooltips
      data-testid="supertrend-fill-overlay"
    />
  );
});

export default SupertrendFillOverlay;
