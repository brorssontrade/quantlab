/**
 * AroonOscFillOverlay
 * 
 * Canvas overlay that renders the Aroon Oscillator with TradingView-style
 * sign-based coloring for both line and fill.
 * 
 * Visual behavior (TradingView-parity):
 * - Line color: green when value >= 0, red when value < 0
 * - Fill: green transparent fill above 0, red transparent fill below 0
 * - Like SupertrendFillOverlay, we draw the LINE here to get per-segment coloring
 *   (LWC doesn't support per-point line colors)
 * - The LWC oscillator series should be hidden when this overlay is active
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws visible range
 * - Uses theme tokens for colors
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";
import { TV_COLORS } from "../indicators/indicatorManifest";

// TradingView default colors for Aroon Oscillator
const DEFAULT_ABOVE_COLOR = TV_COLORS.green; // #26A69A
const DEFAULT_BELOW_COLOR = TV_COLORS.red;   // #F23645
const DEFAULT_FILL_ABOVE_COLOR = "rgba(38, 166, 154, 0.2)"; // green 20%
const DEFAULT_FILL_BELOW_COLOR = "rgba(239, 83, 80, 0.2)";  // red 20%

export interface AroonOscFillConfig {
  oscillatorValues: Array<{ time: any; value: number }>;
  lineAboveColor: string;
  lineBelowColor: string;
  lineWidth: number;
  showFill: boolean;
  fillAboveColor: string;
  fillBelowColor: string;
}

interface AroonOscFillOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the oscillator line series (for coordinate conversion in separate pane) */
  aroonOscSeriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing (the separate pane container) */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Aroon Oscillator fill configuration */
  aroonOscFillConfig: AroonOscFillConfig | null;
  /** Whether the overlay is enabled */
  enabled?: boolean;
}

/**
 * AroonOscFillOverlay Component
 * 
 * Renders sign-based line coloring and fill for Aroon Oscillator.
 * The overlay draws the LINE itself (like SupertrendFillOverlay) so the
 * corresponding LWC series should be hidden.
 */
export const AroonOscFillOverlay = memo(function AroonOscFillOverlay({
  chartRef,
  aroonOscSeriesRef,
  containerRef,
  aroonOscFillConfig,
  enabled = true,
}: AroonOscFillOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = enabled && aroonOscFillConfig !== null;

  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const aroonOscSeries = aroonOscSeriesRef.current;
      const container = containerRef.current;

      if (!canvas || !chart || !aroonOscSeries || !container || !aroonOscFillConfig || !enabled) {
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

      const {
        oscillatorValues,
        lineAboveColor = DEFAULT_ABOVE_COLOR,
        lineBelowColor = DEFAULT_BELOW_COLOR,
        lineWidth = 1,
        showFill,
        fillAboveColor = DEFAULT_FILL_ABOVE_COLOR,
        fillBelowColor = DEFAULT_FILL_BELOW_COLOR,
      } = aroonOscFillConfig;

      // Build time-indexed map
      const oscMap = new Map<number, number>();
      oscillatorValues.forEach((pt: any) => {
        if ('value' in pt && Number.isFinite(pt.value)) {
          oscMap.set(Number(pt.time), pt.value);
        }
      });

      // Sort times
      const sortedTimes = Array.from(oscMap.keys()).sort((a, b) => a - b);
      if (sortedTimes.length < 2) return;

      // Filter to visible range with buffer
      const visibleTimes: number[] = [];
      for (const time of sortedTimes) {
        const coord = timeScale.timeToCoordinate(time as unknown as Time);
        if (coord !== null && coord >= -50 && coord <= cssWidth + 50) {
          visibleTimes.push(time);
        }
      }

      if (visibleTimes.length < 2) return;

      // Get y coordinate for zero baseline
      const yZero = aroonOscSeries.priceToCoordinate(0);
      if (yZero === null) return;

      ctx.save();

      // ========================================================================
      // Build point array with screen coordinates
      // ========================================================================
      
      interface OscPoint {
        time: number;
        x: number;
        yOsc: number;
        value: number;
      }

      const points: OscPoint[] = [];
      for (const time of visibleTimes) {
        const value = oscMap.get(time);
        if (value === undefined) continue;

        const x = timeScale.timeToCoordinate(time as unknown as Time);
        if (x === null) continue;

        const yOsc = aroonOscSeries.priceToCoordinate(value);
        if (yOsc === null) continue;

        points.push({ time, x, yOsc, value });
      }

      if (points.length < 2) {
        ctx.restore();
        return;
      }

      // ========================================================================
      // Draw filled regions (if enabled)
      // Fill is between oscillator line and zero line, split by sign
      // ========================================================================
      
      if (showFill) {
        // Draw fills by segmenting at sign changes and at the zero crossing point
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];
          
          const sign1 = p1.value >= 0 ? 1 : -1;
          const sign2 = p2.value >= 0 ? 1 : -1;
          
          if (sign1 === sign2) {
            // Same sign - simple fill polygon
            const fillColor = sign1 >= 0 ? fillAboveColor : fillBelowColor;
            ctx.fillStyle = fillColor;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.yOsc);
            ctx.lineTo(p2.x, p2.yOsc);
            ctx.lineTo(p2.x, yZero);
            ctx.lineTo(p1.x, yZero);
            ctx.closePath();
            ctx.fill();
          } else {
            // Sign change - find zero crossing point and draw two triangular regions
            // Linear interpolation to find x where value = 0
            const t = Math.abs(p1.value) / (Math.abs(p1.value) + Math.abs(p2.value));
            const xCross = p1.x + t * (p2.x - p1.x);
            
            // First triangle (p1 to crossing)
            ctx.fillStyle = sign1 >= 0 ? fillAboveColor : fillBelowColor;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.yOsc);
            ctx.lineTo(xCross, yZero);
            ctx.lineTo(p1.x, yZero);
            ctx.closePath();
            ctx.fill();
            
            // Second triangle (crossing to p2)
            ctx.fillStyle = sign2 >= 0 ? fillAboveColor : fillBelowColor;
            ctx.beginPath();
            ctx.moveTo(xCross, yZero);
            ctx.lineTo(p2.x, p2.yOsc);
            ctx.lineTo(p2.x, yZero);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // ========================================================================
      // Draw the line with sign-based coloring
      // Each segment gets its own color based on start point sign
      // (like Supertrend, we draw the line ourselves for per-segment colors)
      // ========================================================================
      
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        
        const sign1 = p1.value >= 0 ? 1 : -1;
        const sign2 = p2.value >= 0 ? 1 : -1;
        
        if (sign1 === sign2) {
          // Same sign - one segment
          ctx.strokeStyle = sign1 >= 0 ? lineAboveColor : lineBelowColor;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.yOsc);
          ctx.lineTo(p2.x, p2.yOsc);
          ctx.stroke();
        } else {
          // Sign change - two segments with crossing point at zero
          const t = Math.abs(p1.value) / (Math.abs(p1.value) + Math.abs(p2.value));
          const xCross = p1.x + t * (p2.x - p1.x);
          
          // First segment (p1 to crossing)
          ctx.strokeStyle = sign1 >= 0 ? lineAboveColor : lineBelowColor;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.yOsc);
          ctx.lineTo(xCross, yZero);
          ctx.stroke();
          
          // Second segment (crossing to p2)
          ctx.strokeStyle = sign2 >= 0 ? lineAboveColor : lineBelowColor;
          ctx.beginPath();
          ctx.moveTo(xCross, yZero);
          ctx.lineTo(p2.x, p2.yOsc);
          ctx.stroke();
        }
      }

      ctx.restore();
    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, aroonOscSeriesRef, containerRef, aroonOscFillConfig, enabled]);

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
  }, [aroonOscFillConfig, scheduleRedraw]);

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
      style={{ zIndex: 10 }} // Above fills, on par with lines
      data-testid="aroon-osc-fill-overlay"
    />
  );
});

export default AroonOscFillOverlay;
