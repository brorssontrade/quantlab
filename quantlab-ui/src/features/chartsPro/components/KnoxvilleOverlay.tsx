/**
 * KnoxvilleOverlay
 * 
 * Canvas overlay that draws Knoxville Divergence signals.
 * 
 * TradingView doc: https://www.tradingview.com/support/solutions/43000591336-rob-booker-knoxville-divergence/
 * 
 * Visual behavior (TradingView-parity):
 * - Draw divergence lines between start and end bars (main feature)
 * - +KD (green text) below bars at bullish signals
 * - -KD (red text) above bars at bearish signals
 * 
 * Architecture:
 * - Subscribes to timeScale visible range changes
 * - Batches redraws in RAF for performance
 * - Only draws visible range
 */

import { useEffect, useRef, useCallback, memo } from "react";
import type { IChartApi, ISeriesApi } from "@/lib/lightweightCharts";
import type { KnoxvilleDivergenceSignal } from "../indicators/compute";

// Props interface
interface KnoxvilleOverlayProps {
  /** Reference to the LWC chart */
  chartRef: React.RefObject<IChartApi | null>;
  /** Reference to the main price series (for coordinate conversion) */
  seriesRef: React.RefObject<ISeriesApi<any> | null>;
  /** Container element for sizing */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Bullish signals (+KD) */
  bullish: KnoxvilleDivergenceSignal[];
  /** Bearish signals (-KD) */
  bearish: KnoxvilleDivergenceSignal[];
  /** Show bullish signals */
  showBullish: boolean;
  /** Show bearish signals */
  showBearish: boolean;
  /** Show divergence lines */
  showLines: boolean;
  /** Bullish color */
  bullColor: string;
  /** Bearish color */
  bearColor: string;
}

// Text styling
const FONT = "bold 10px -apple-system, BlinkMacSystemFont, sans-serif";
const TEXT_OFFSET = 16;
const LINE_WIDTH = 1;

/**
 * KnoxvilleOverlay Component
 * 
 * Renders Knoxville Divergence signals with divergence lines and +KD/-KD text markers.
 */
export const KnoxvilleOverlay = memo(function KnoxvilleOverlay({
  chartRef,
  seriesRef,
  containerRef,
  bullish,
  bearish,
  showBullish,
  showBearish,
  showLines,
  bullColor,
  bearColor,
}: KnoxvilleOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  const shouldRender = (showBullish && bullish.length > 0) || 
                       (showBearish && bearish.length > 0);

  // Draw all
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const chart = chartRef.current;
      const series = seriesRef.current;
      const container = containerRef.current;

      if (!canvas || !chart || !series || !container) {
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

      // Clear canvas
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const timeScale = chart.timeScale();
      
      // === Draw divergence lines first (behind labels) ===
      if (showLines) {
        ctx.lineWidth = LINE_WIDTH;
        
        // Draw bullish divergence lines (connecting lows)
        if (showBullish) {
          ctx.strokeStyle = bullColor;
          ctx.beginPath();
          for (const signal of bullish) {
            const x1 = timeScale.timeToCoordinate(signal.startTime as any);
            const y1 = series.priceToCoordinate(signal.startPrice);
            const x2 = timeScale.timeToCoordinate(signal.time as any);
            const y2 = series.priceToCoordinate(signal.price);
            
            if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
            }
          }
          ctx.stroke();
        }
        
        // Draw bearish divergence lines (connecting highs)
        if (showBearish) {
          ctx.strokeStyle = bearColor;
          ctx.beginPath();
          for (const signal of bearish) {
            const x1 = timeScale.timeToCoordinate(signal.startTime as any);
            const y1 = series.priceToCoordinate(signal.startPrice);
            const x2 = timeScale.timeToCoordinate(signal.time as any);
            const y2 = series.priceToCoordinate(signal.price);
            
            if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
            }
          }
          ctx.stroke();
        }
      }
      
      // === Draw text labels on top ===
      ctx.font = FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Draw bullish signals (+KD below bar)
      if (showBullish) {
        ctx.fillStyle = bullColor;
        for (const signal of bullish) {
          const x = timeScale.timeToCoordinate(signal.time as any);
          const y = series.priceToCoordinate(signal.price);
          
          if (x === null || y === null) continue;
          
          // Draw +KD below bar
          ctx.fillText("+KD", x, y + TEXT_OFFSET);
        }
      }

      // Draw bearish signals (-KD above bar)
      if (showBearish) {
        ctx.fillStyle = bearColor;
        for (const signal of bearish) {
          const x = timeScale.timeToCoordinate(signal.time as any);
          const y = series.priceToCoordinate(signal.price);
          
          if (x === null || y === null) continue;
          
          // Draw -KD above bar
          ctx.fillText("-KD", x, y - TEXT_OFFSET);
        }
      }
    } finally {
      isDrawingRef.current = false;
    }
  }, [
    chartRef, seriesRef, containerRef,
    bullish, bearish,
    showBullish, showBearish, showLines,
    bullColor, bearColor
  ]);

  // Schedule draw
  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  // Setup subscriptions
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const timeScale = chart.timeScale();
    
    const unsubVisible = timeScale.subscribeVisibleLogicalRangeChange(scheduleDraw);
    const unsubTimeScale = timeScale.subscribeSizeChange(scheduleDraw);

    // Initial draw
    scheduleDraw();

    return () => {
      unsubVisible();
      unsubTimeScale();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [chartRef, scheduleDraw]);

  // Redraw on data change
  useEffect(() => {
    scheduleDraw();
  }, [bullish, bearish, showBullish, showBearish, showLines, scheduleDraw]);

  if (!shouldRender) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="knoxville-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 10,
      }}
    />
  );
});

export default KnoxvilleOverlay;
