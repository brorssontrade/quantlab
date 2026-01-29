import type { NormalizedBar } from "../types";
import type { ChartsTheme } from "../theme";

export interface OhlcStripProps {
  symbol: string;
  timeframe: string;
  bar: NormalizedBar | null;
  prevClose: number | null;
  theme: ChartsTheme;
  className?: string;
}

function formatOhlcValue(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1) return value.toFixed(decimals);
  return value.toPrecision(4);
}

function formatVolume(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toString();
}

function formatChange(close: number, prevClose: number | null): { text: string; isPositive: boolean } {
  if (prevClose == null || prevClose === 0 || !Number.isFinite(close)) {
    return { text: "-", isPositive: true };
  }
  const change = close - prevClose;
  const changePct = ((close - prevClose) / prevClose) * 100;
  const sign = change >= 0 ? "+" : "";
  return {
    text: `${sign}${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%)`,
    isPositive: change >= 0,
  };
}

/**
 * TV-35.3: TradingView-style OHLC strip that displays in the top-left corner.
 * Shows symbol, O, H, L, C values with change % on hover.
 * Uses theme typography tokens for consistent styling.
 */
export function OhlcStrip({ symbol, timeframe, bar, prevClose, theme, className = "" }: OhlcStripProps) {
  // TV-35.3: Use theme typography tokens
  const baseStyle = {
    fontFamily: theme.typography.fontFamily.mono,
    fontSize: `${theme.typography.fontSize.md}px`, // 11px for OHLC values
    lineHeight: theme.typography.lineHeight.normal,
  };

  const labelStyle = {
    ...baseStyle,
    color: theme.text.muted,
    fontSize: `${theme.typography.fontSize.sm}px`, // 10px for labels
    fontWeight: theme.typography.fontWeight.normal,
  };

  const symbolStyle = {
    fontFamily: theme.typography.fontFamily.primary,
    fontSize: `${theme.typography.fontSize.lg}px`, // 12px for symbol name
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.text.primary,
  };

  const timeframeStyle = {
    fontFamily: theme.typography.fontFamily.primary,
    fontSize: `${theme.typography.fontSize.sm}px`,
    color: theme.text.muted,
    marginLeft: `${theme.spacing.sm}px`,
  };

  if (!bar) {
    return (
      <div
        data-testid="chartspro-ohlc-strip"
        className={`chartspro-ohlc-strip ${className}`}
        style={{ display: "flex", alignItems: "center", gap: `${theme.spacing.md}px` }}
      >
        <span style={symbolStyle}>{symbol}</span>
        <span style={timeframeStyle}>{timeframe}</span>
      </div>
    );
  }

  const changeInfo = formatChange(bar.close, prevClose);
  const changeColor = changeInfo.isPositive ? theme.candle.upColor : theme.candle.downColor;
  const ohlcColor = bar.close >= bar.open ? theme.candle.upColor : theme.candle.downColor;

  const valueStyle = {
    ...baseStyle,
    color: ohlcColor,
    fontWeight: theme.typography.fontWeight.medium,
  };

  return (
    <div
      data-testid="chartspro-ohlc-strip"
      className={`chartspro-ohlc-strip ${className}`}
      style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: `${theme.spacing.xs}px`,
        flexWrap: "wrap",
      }}
    >
      <span style={symbolStyle}>{symbol}</span>
      <span style={timeframeStyle}>{timeframe}</span>
      
      <span style={{ ...labelStyle, marginLeft: `${theme.spacing.md}px` }}>O</span>
      <span style={valueStyle}>
        {formatOhlcValue(bar.open)}
      </span>
      
      <span style={labelStyle}>H</span>
      <span style={valueStyle}>
        {formatOhlcValue(bar.high)}
      </span>
      
      <span style={labelStyle}>L</span>
      <span style={valueStyle}>
        {formatOhlcValue(bar.low)}
      </span>
      
      <span style={labelStyle}>C</span>
      <span style={valueStyle}>
        {formatOhlcValue(bar.close)}
      </span>
      
      <span
        style={{ 
          ...baseStyle,
          color: changeColor,
          fontWeight: theme.typography.fontWeight.medium,
          marginLeft: `${theme.spacing.sm}px`,
        }}
        data-testid="chartspro-ohlc-change"
      >
        {changeInfo.text}
      </span>
      
      <span style={{ ...labelStyle, marginLeft: `${theme.spacing.md}px` }}>Vol</span>
      <span style={{ ...baseStyle, color: theme.text.secondary }}>
        {formatVolume(bar.volume)}
      </span>
    </div>
  );
}
