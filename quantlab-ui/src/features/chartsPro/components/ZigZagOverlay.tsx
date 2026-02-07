/**
 * ZigZagOverlay
 * 
 * Canvas overlay that draws Zig Zag indicator with line segments and labels.
 * 
 * TradingView doc: https://www.tradingview.com/support/solutions/43000591664-zig-zag/
 * 
 * Visual behavior (TradingView-parity):
 * - Line segments connecting swing highs and lows
 * - Optional price labels at swing points
 * - Optional volume labels at swing points
 * - Price changes in absolute or percent mode
 * - Color coding for up/down swings
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws visible range
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi, Time } from "@/lib/lightweightCharts";

// Line segment data (from compute function)
interface LineSegment {
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
  isUp: boolean;
}

// Props interface
interface ZigZagOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Swing points (from ZigZagSwing compute output) */
  swings: Array<{ 
    time: number; 
    price: number; 
    isHigh: boolean; 
    index: number; 
    priceChange?: number;
    percentChange?: number;
    cumulativeVolume?: number;
  }>;
  /** Line segments */
  lineSegments: LineSegment[];
  /** Line color */
  lineColor: string;
  /** Line width */
  lineWidth: number;
  /** Whether to show price labels */
  showPrice: boolean;
  /** Whether to show volume labels */
  showVolume: boolean;
  /** Price change display mode */
  priceChangeMode: "absolute" | "percent";
  /** Up swing color */
  upColor: string;
  /** Down swing color */
  downColor: string;
}

// Font for labels
const LABEL_FONT = "10px -apple-system, BlinkMacSystemFont, sans-serif";
const LABEL_OFFSET_Y = 10;

/**
 * ZigZagOverlay Component
 * 
 * Renders Zig Zag line segments and labels.
 */
export const ZigZagOverlay = memo(function ZigZagOverlay({
  chartRef,
  seriesRef,
  containerRef,
  swings,
  lineSegments,
  lineColor,
  lineWidth,
  showPrice,
  showVolume,
  priceChangeMode,
  upColor,
  downColor,
}: ZigZagOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = swings.length > 0 || lineSegments.length > 0;

  // Debug logging
  if (process.env.NODE_ENV === "development") {
    console.log(`[ZigZagOverlay] mounting: swings=${swings.length}, segments=${lineSegments.length}, shouldRender=${shouldRender}`);
  }

  // Draw the zig zag
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    if (process.env.NODE_ENV === "development") {
      console.log(`[ZigZagOverlay:draw] Starting draw...`);
    }

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = seriesRef.current;
      const container = containerRef.current;

      if (process.env.NODE_ENV === "development") {
        console.log(`[ZigZagOverlay:draw] refs: canvas=${!!canvas}, chart=${!!chart}, series=${!!series}, container=${!!container}`);
      }

      if (!canvas || !chart || !series || !container) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[ZigZagOverlay:draw] Early return - missing refs`);
        }
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
      if (!visibleRange) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[ZigZagOverlay:draw] No visible range`);
        }
        return;
      }

      if (process.env.NODE_ENV === "development") {
        console.log(`[ZigZagOverlay:draw] Drawing ${lineSegments.length} segments on canvas ${cssWidth}x${cssHeight}`);
      }

      ctx.save();

      // Draw line segments
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      let drawnCount = 0;
      for (const segment of lineSegments) {
        const x1 = timeScale.timeToCoordinate(segment.startTime as unknown as Time);
        const y1 = series.priceToCoordinate(segment.startPrice);
        const x2 = timeScale.timeToCoordinate(segment.endTime as unknown as Time);
        const y2 = series.priceToCoordinate(segment.endPrice);
        
        if (process.env.NODE_ENV === "development") {
          console.log(`[ZigZagOverlay:draw] segment coords: x1=${x1}, y1=${y1}, x2=${x2}, y2=${y2}`);
        }
        
        if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
        
        // Check if segment is at least partially visible
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        if (maxX < -50 || minX > cssWidth + 50) continue;

        // Draw segment
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        drawnCount++;
      }
      
      if (process.env.NODE_ENV === "development") {
        console.log(`[ZigZagOverlay:draw] Drew ${drawnCount} segments`);
      }

      // Draw labels at swing points
      if (showPrice || showVolume) {
        ctx.font = LABEL_FONT;
        ctx.textAlign = "center";

        for (let i = 0; i < swings.length; i++) {
          const swing = swings[i];
          const x = timeScale.timeToCoordinate(swing.time as unknown as Time);
          const y = series.priceToCoordinate(swing.price);
          
          if (x === null || y === null) continue;
          if (x < -50 || x > cssWidth + 50) continue;
          
          // Use pre-computed price change values from compute
          let priceChangeText = "";
          if (showPrice && i > 0) {
            if (priceChangeMode === "percent" && swing.percentChange !== undefined) {
              priceChangeText = `${swing.percentChange >= 0 ? "+" : ""}${swing.percentChange.toFixed(2)}%`;
            } else if (swing.priceChange !== undefined) {
              priceChangeText = `${swing.priceChange >= 0 ? "+" : ""}${swing.priceChange.toFixed(2)}`;
            }
          }
          
          // Build label
          const parts: string[] = [];
          if (priceChangeText) parts.push(priceChangeText);
          if (showVolume && swing.cumulativeVolume !== undefined) {
            parts.push(formatVolume(swing.cumulativeVolume));
          }
          
          if (parts.length === 0) continue;
          
          const text = parts.join(" | ");
          const yOffset = swing.isHigh ? -LABEL_OFFSET_Y : LABEL_OFFSET_Y;
          
          ctx.textBaseline = swing.isHigh ? "bottom" : "top";
          ctx.fillStyle = swing.isHigh ? downColor : upColor; // Color based on direction TO this point
          ctx.fillText(text, x, y + yOffset);
        }
      }

      ctx.restore();
    } finally {
      isDrawingRef.current = false;
    }
  }, [chartRef, seriesRef, containerRef, swings, lineSegments, lineColor, lineWidth, 
      showPrice, showVolume, priceChangeMode, upColor, downColor]);

  // Request animation frame draw
  const scheduleDraw = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // Effect: Subscribe to chart updates
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(scheduleDraw);

    scheduleDraw();

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(scheduleDraw);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [chartRef, scheduleDraw]);

  // Effect: Redraw when data changes
  useEffect(() => {
    scheduleDraw();
  }, [swings, lineSegments, lineColor, lineWidth, showPrice, showVolume, 
      priceChangeMode, upColor, downColor, scheduleDraw]);

  if (!shouldRender) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 14,
      }}
    />
  );
});

// Helper to format volume
function formatVolume(vol: number): string {
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
  return vol.toFixed(0);
}

export default ZigZagOverlay;
