/**
 * WillrFillOverlay
 * 
 * Canvas overlay that draws Williams %R fills:
 * 1. Background fill: subtle band between upper (-20) and lower (-80) levels
 * 2. Overbought fill: gradient fill when %R > upper band (closer to 0) - GREEN
 * 3. Oversold fill: gradient fill when %R < lower band (closer to -100) - RED
 * 
 * Williams %R scale is INVERTED vs RSI:
 * - %R range: -100 (bottom/oversold) to 0 (top/overbought)
 * - Overbought zone: value > upperBand (e.g., > -20, closer to 0)
 * - Oversold zone: value < lowerBand (e.g., < -80, closer to -100)
 * 
 * Why canvas overlay:
 * - LWC doesn't support gradient fills between dynamic line and constant level
 * - Clean visual without artifacts
 * - Matches TradingView %R styling
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws visible range
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";

interface WillrFillConfig {
  showBackgroundFill: boolean;
  backgroundFillColor: string;
  backgroundFillOpacity: number;
  showOverboughtFill: boolean;
  overboughtFillColor: string;
  showOversoldFill: boolean;
  oversoldFillColor: string;
  upperBandValue: number;  // Default: -20 (overbought threshold)
  lowerBandValue: number;  // Default: -80 (oversold threshold)
  willrValues: Array<{ time: any; value: number }>;
}

interface WillrFillOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the Williams %R line series (for coordinate conversion in separate pane) */
  willrSeriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing (the separate pane container) */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Williams %R fill configuration */
  willrFillConfig: WillrFillConfig | null;
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
 * WillrFillOverlay Component
 * 
 * Renders Williams %R fills for background band and overbought/oversold zones.
 * 
 * IMPORTANT: Williams %R is inverted vs RSI:
 * - Higher values (closer to 0) = Overbought = Green
 * - Lower values (closer to -100) = Oversold = Red
 */
export const WillrFillOverlay = memo(function WillrFillOverlay({
  chartRef,
  willrSeriesRef,
  containerRef,
  willrFillConfig,
  enabled = true,
}: WillrFillOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = enabled && willrFillConfig !== null;

  // Draw fills
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const willrSeries = willrSeriesRef.current;
      const container = containerRef.current;

      if (!canvas || !chart || !willrSeries || !container || !willrFillConfig || !enabled) {
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
        upperBandValue,  // -20 (overbought threshold, closer to 0)
        lowerBandValue,  // -80 (oversold threshold, closer to -100)
        willrValues,
      } = willrFillConfig;

      // Build %R value map (only finite values)
      const willrMap = new Map<number, number>();
      willrValues.forEach((pt) => {
        if (Number.isFinite(pt.value)) {
          willrMap.set(Number(pt.time), pt.value);
        }
      });

      // Get all times
      const allTimes = Array.from(willrMap.keys()).sort((a, b) => a - b);
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
      // For %R: upper (-20) is ABOVE lower (-80) in value but BELOW in Y coordinate
      // =======================================================================
      if (showBackgroundFill) {
        const upperY = willrSeries.priceToCoordinate(upperBandValue);
        const lowerY = willrSeries.priceToCoordinate(lowerBandValue);
        
        if (upperY !== null && lowerY !== null) {
          ctx.fillStyle = colorWithOpacity(backgroundFillColor, backgroundFillOpacity);
          // upperY is smaller (higher on screen) since -20 > -80
          ctx.fillRect(0, upperY, cssWidth, lowerY - upperY);
        }
      }

      // =======================================================================
      // STEP 2: Overbought fill (%R > upper band, i.e., > -20, closer to 0)
      // This is GREEN - bullish zone
      // Fill from %R line UP to the upper band level
      // =======================================================================
      if (showOverboughtFill) {
        const upperY = willrSeries.priceToCoordinate(upperBandValue);
        if (upperY !== null) {
          // Build segments where %R > upper (e.g., -15 > -20)
          type Segment = Array<{ x: number; willrY: number; bandY: number }>;
          const segments: Segment[] = [];
          let currentSegment: Segment = [];

          for (const time of visibleTimes) {
            const willrValue = willrMap.get(time);
            if (willrValue === undefined) continue;

            const x = timeScale.timeToCoordinate(time as unknown as Time);
            if (x === null) continue;

            // Overbought: %R > upperBand (e.g., -10 > -20)
            if (willrValue > upperBandValue) {
              const willrY = willrSeries.priceToCoordinate(willrValue);
              if (willrY !== null) {
                currentSegment.push({ x, willrY, bandY: upperY });
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

            // Find min willrY (highest %R point, closest to 0)
            const minWillrY = Math.min(...segment.map(p => p.willrY));
            
            // Create gradient from %R to band level
            // %R line is ABOVE (smaller Y) the band line for overbought
            const gradient = ctx.createLinearGradient(0, minWillrY, 0, upperY);
            gradient.addColorStop(0, colorWithOpacity(overboughtFillColor, 0.4));
            gradient.addColorStop(1, colorWithOpacity(overboughtFillColor, 0.1));

            // Draw filled polygon: %R line top, band level bottom
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(segment[0].x, segment[0].willrY);
            for (const pt of segment) {
              ctx.lineTo(pt.x, pt.willrY);
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
      // STEP 3: Oversold fill (%R < lower band, i.e., < -80, closer to -100)
      // This is RED - bearish zone
      // Fill from lower band DOWN to %R line
      // =======================================================================
      if (showOversoldFill) {
        const lowerY = willrSeries.priceToCoordinate(lowerBandValue);
        if (lowerY !== null) {
          // Build segments where %R < lower (e.g., -90 < -80)
          type Segment = Array<{ x: number; willrY: number; bandY: number }>;
          const segments: Segment[] = [];
          let currentSegment: Segment = [];

          for (const time of visibleTimes) {
            const willrValue = willrMap.get(time);
            if (willrValue === undefined) continue;

            const x = timeScale.timeToCoordinate(time as unknown as Time);
            if (x === null) continue;

            // Oversold: %R < lowerBand (e.g., -90 < -80)
            if (willrValue < lowerBandValue) {
              const willrY = willrSeries.priceToCoordinate(willrValue);
              if (willrY !== null) {
                currentSegment.push({ x, willrY, bandY: lowerY });
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

            // Find max willrY (lowest %R point, closest to -100)
            const maxWillrY = Math.max(...segment.map(p => p.willrY));
            
            // Create gradient from band level to %R
            // Band line is ABOVE (smaller Y) the %R line for oversold
            const gradient = ctx.createLinearGradient(0, lowerY, 0, maxWillrY);
            gradient.addColorStop(0, colorWithOpacity(oversoldFillColor, 0.1));
            gradient.addColorStop(1, colorWithOpacity(oversoldFillColor, 0.4));

            // Draw filled polygon: band level top, %R line bottom
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(segment[0].x, segment[0].bandY);
            for (const pt of segment) {
              ctx.lineTo(pt.x, pt.bandY);
            }
            // Go back along %R line
            for (let i = segment.length - 1; i >= 0; i--) {
              ctx.lineTo(segment[i].x, segment[i].willrY);
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
  }, [chartRef, willrSeriesRef, containerRef, willrFillConfig, enabled]);

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
  }, [willrFillConfig, scheduleRedraw]);

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
      data-testid="willr-fill-overlay"
    />
  );
});

export default WillrFillOverlay;
