import { useEffect, useState, useCallback } from "react";
import type { ChartsTheme } from "../theme";
import type { Tf } from "../types";

export interface LastPriceLineProps {
  lastPrice: number | null;
  lastTime: number | null; // Unix timestamp in seconds
  timeframe: Tf;
  yPosition: number | null; // px from top
  theme: ChartsTheme;
  containerWidth: number;
  className?: string;
}

/** Get the bar duration in seconds for a timeframe */
function getBarDurationSeconds(tf: Tf): number {
  const map: Record<Tf, number> = {
    "1m": 60,
    "5m": 5 * 60,
    "15m": 15 * 60,
    "30m": 30 * 60,
    "1h": 60 * 60,
    "4h": 4 * 60 * 60,
    "1d": 24 * 60 * 60,
    "1w": 7 * 24 * 60 * 60,
    "1M": 30 * 24 * 60 * 60, // approximate
  };
  return map[tf] ?? 60;
}

/** Format countdown to next bar close */
function formatCountdown(secondsRemaining: number): string {
  if (secondsRemaining <= 0) return "00:00";
  
  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = Math.floor(secondsRemaining % 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toPrecision(4);
}

/**
 * Last price line with countdown timer to next bar close.
 * Displays as a horizontal dashed line with price label and countdown.
 */
export function LastPriceLine({
  lastPrice,
  lastTime,
  timeframe,
  yPosition,
  theme,
  containerWidth,
  className = "",
}: LastPriceLineProps) {
  const [countdown, setCountdown] = useState<string>("--:--");

  const updateCountdown = useCallback(() => {
    if (lastTime == null) {
      setCountdown("--:--");
      return;
    }
    
    const barDuration = getBarDurationSeconds(timeframe);
    const now = Math.floor(Date.now() / 1000);
    const barEndTime = lastTime + barDuration;
    const remaining = barEndTime - now;
    
    setCountdown(formatCountdown(remaining));
  }, [lastTime, timeframe]);

  useEffect(() => {
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [updateCountdown]);

  if (lastPrice == null || yPosition == null) {
    return null;
  }

  return (
    <div
      data-testid="chartspro-last-price-line"
      className={`chartspro-last-price-line ${className}`}
      style={{
        top: `${yPosition}px`,
        width: `${containerWidth}px`,
      }}
    >
      {/* Dashed line */}
      <div
        className="chartspro-last-price-line__line"
        style={{
          borderColor: theme.priceLine,
        }}
      />
      
      {/* Price label with countdown */}
      <div
        className="chartspro-last-price-line__label"
        style={{
          backgroundColor: theme.crosshairLabelBg,
          borderColor: theme.priceLine,
          color: theme.axisText,
        }}
      >
        <span className="chartspro-last-price-line__price">
          {formatPrice(lastPrice)}
        </span>
        <span
          className="chartspro-last-price-line__countdown"
          data-testid="chartspro-countdown"
        >
          {countdown}
        </span>
      </div>
    </div>
  );
}
