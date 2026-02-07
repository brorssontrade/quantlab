/**
 * RsiFillOverlay
 * 
 * Canvas overlay that draws RSI fills:
 * 1. Background fill: subtle band between upper (70) and lower (30) levels
 * 2. Overbought fill: gradient fill when RSI > upper band (green/bullish)
 * 3. Oversold fill: gradient fill when RSI < lower band (red/bearish)
 * 
 * Why canvas overlay:
 * - LWC doesn't support gradient fills between dynamic line and constant level
 * - Clean visual without artifacts
 * - Matches TradingView RSI styling
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws visible range
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";

interface RsiFillConfig {
  showBackgroundFill: boolean;
  backgroundFillColor: string;
  backgroundFillOpacity: number;
  showOverboughtFill: boolean;
  overboughtFillColor: string;
  showOversoldFill: boolean;
  oversoldFillColor: string;
  upperBandValue: number;
  middleBandValue: number;
  lowerBandValue: number;
  rsiValues: Array<{ time: any; value: number }>;
}

interface RsiFillOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the RSI line series (for coordinate conversion in separate pane) */
  rsiSeriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing (the separate pane container) */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** RSI fill configuration */
  rsiFillConfig: RsiFillConfig | null;
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
      return color; // Invalid hex, return as-is
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
 * RsiFillOverlay Component
 * 
 * Renders RSI fills for background band and overbought/oversold zones.
 */
export const RsiFillOverlay = memo(function RsiFillOverlay({
  chartRef,
  rsiSeriesRef,
  containerRef,
  rsiFillConfig,
  enabled = true,
}: RsiFillOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = enabled && rsiFillConfig !== null;

  // Draw fills
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const rsiSeries = rsiSeriesRef.current;
      const container = containerRef.current;

      if (!canvas || !chart || !rsiSeries || !container || !rsiFillConfig || !enabled) {
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

      const {
        showBackgroundFill,
        backgroundFillColor,
        backgroundFillOpacity,
        showOverboughtFill,
        overboughtFillColor,
        showOversoldFill,
        oversoldFillColor,
        upperBandValue,
        lowerBandValue,
        rsiValues,
      } = rsiFillConfig;

      // Build RSI value map (only finite values)
      const rsiMap = new Map<number, number>();
      rsiValues.forEach((pt) => {
        if (Number.isFinite(pt.value)) {
          rsiMap.set(Number(pt.time), pt.value);
        }
      });

      // Get all times
      const allTimes = Array.from(rsiMap.keys()).sort((a, b) => a - b);
      if (allTimes.length < 2) return;

      // Filter to visible range
      const visibleTimes: number[] = [];
      for (const time of allTimes) {
        const coord = timeScale.timeToCoordinate(time as unknown as Time);
        if (coord !== null && coord >= -50 && coord <= cssWidth + 50) {
          visibleTimes.push(time);
        }
      }

      if (visibleTimes.length < 2) return;

      ctx.save();

      // =======================================================================
      // STEP 1: Background fill (between upper and lower band levels)
      // =======================================================================
      if (showBackgroundFill) {
        const upperY = rsiSeries.priceToCoordinate(upperBandValue);
        const lowerY = rsiSeries.priceToCoordinate(lowerBandValue);
        
        if (upperY !== null && lowerY !== null) {
          ctx.fillStyle = colorWithOpacity(backgroundFillColor, backgroundFillOpacity);
          ctx.fillRect(0, upperY, cssWidth, lowerY - upperY);
        }
      }

      // =======================================================================
      // STEP 2: Overbought fill (RSI > upper band, gradient down from RSI to band)
      // =======================================================================
      if (showOverboughtFill) {
        const upperY = rsiSeries.priceToCoordinate(upperBandValue);
        if (upperY !== null) {
          // Build segments where RSI > upper
          type Segment = Array<{ x: number; rsiY: number; bandY: number }>;
          const segments: Segment[] = [];
          let currentSegment: Segment = [];

          for (const time of visibleTimes) {
            const rsiValue = rsiMap.get(time);
            if (rsiValue === undefined) continue;

            const x = timeScale.timeToCoordinate(time as unknown as Time);
            if (x === null) continue;

            if (rsiValue > upperBandValue) {
              const rsiY = rsiSeries.priceToCoordinate(rsiValue);
              if (rsiY !== null) {
                currentSegment.push({ x, rsiY, bandY: upperY });
              }
            } else {
              // End current segment
              if (currentSegment.length > 0) {
                segments.push(currentSegment);
                currentSegment = [];
              }
            }
          }
          // Don't forget last segment
          if (currentSegment.length > 0) {
            segments.push(currentSegment);
          }

          // Draw each overbought segment with gradient fill
          for (const segment of segments) {
            if (segment.length < 2) continue;

            // Find min rsiY (highest RSI point) for gradient
            const minRsiY = Math.min(...segment.map(p => p.rsiY));
            
            // Create gradient from RSI to band level
            const gradient = ctx.createLinearGradient(0, minRsiY, 0, upperY);
            gradient.addColorStop(0, colorWithOpacity(overboughtFillColor, 0.4));
            gradient.addColorStop(1, colorWithOpacity(overboughtFillColor, 0.1));

            // Draw filled polygon: RSI line top, band level bottom
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(segment[0].x, segment[0].rsiY);
            for (const pt of segment) {
              ctx.lineTo(pt.x, pt.rsiY);
            }
            // Go back along band level
            for (let i = segment.length - 1; i >= 0; i--) {
              ctx.lineTo(segment[i].x, segment[i].bandY);
            }
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // =======================================================================
      // STEP 3: Oversold fill (RSI < lower band, gradient up from RSI to band)
      // =======================================================================
      if (showOversoldFill) {
        const lowerY = rsiSeries.priceToCoordinate(lowerBandValue);
        if (lowerY !== null) {
          // Build segments where RSI < lower
          type Segment = Array<{ x: number; rsiY: number; bandY: number }>;
          const segments: Segment[] = [];
          let currentSegment: Segment = [];

          for (const time of visibleTimes) {
            const rsiValue = rsiMap.get(time);
            if (rsiValue === undefined) continue;

            const x = timeScale.timeToCoordinate(time as unknown as Time);
            if (x === null) continue;

            if (rsiValue < lowerBandValue) {
              const rsiY = rsiSeries.priceToCoordinate(rsiValue);
              if (rsiY !== null) {
                currentSegment.push({ x, rsiY, bandY: lowerY });
              }
            } else {
              // End current segment
              if (currentSegment.length > 0) {
                segments.push(currentSegment);
                currentSegment = [];
              }
            }
          }
          // Don't forget last segment
          if (currentSegment.length > 0) {
            segments.push(currentSegment);
          }

          // Draw each oversold segment with gradient fill
          for (const segment of segments) {
            if (segment.length < 2) continue;

            // Find max rsiY (lowest RSI point) for gradient
            const maxRsiY = Math.max(...segment.map(p => p.rsiY));
            
            // Create gradient from band level to RSI
            const gradient = ctx.createLinearGradient(0, lowerY, 0, maxRsiY);
            gradient.addColorStop(0, colorWithOpacity(oversoldFillColor, 0.1));
            gradient.addColorStop(1, colorWithOpacity(oversoldFillColor, 0.4));

            // Draw filled polygon: band level top, RSI line bottom
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(segment[0].x, segment[0].bandY);
            for (const pt of segment) {
              ctx.lineTo(pt.x, pt.bandY);
            }
            // Go back along RSI line
            for (let i = segment.length - 1; i >= 0; i--) {
              ctx.lineTo(segment[i].x, segment[i].rsiY);
            }
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      ctx.restore();
    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, rsiSeriesRef, containerRef, rsiFillConfig, enabled]);

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

  // Redraw when config changes
  useEffect(() => {
    scheduleRedraw();
  }, [rsiFillConfig, scheduleRedraw]);

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
      style={{ zIndex: 5 }} // Below lines (z-index 10) but above background
      data-testid="rsi-fill-overlay"
    />
  );
});

export default RsiFillOverlay;
