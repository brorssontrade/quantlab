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
 * TradingView-style OHLC strip that displays in the top-left corner.
 * Shows symbol, O, H, L, C values with change % on hover.
 */
export function OhlcStrip({ symbol, timeframe, bar, prevClose, theme, className = "" }: OhlcStripProps) {
  if (!bar) {
    return (
      <div
        data-testid="chartspro-ohlc-strip"
        className={`chartspro-ohlc-strip ${className}`}
      >
        <span className="chartspro-ohlc-strip__symbol">{symbol}</span>
        <span className="chartspro-ohlc-strip__timeframe">{timeframe}</span>
      </div>
    );
  }

  const changeInfo = formatChange(bar.close, prevClose);
  const changeColor = changeInfo.isPositive ? theme.candleUp : theme.candleDown;
  const ohlcColor = bar.close >= bar.open ? theme.candleUp : theme.candleDown;

  return (
    <div
      data-testid="chartspro-ohlc-strip"
      className={`chartspro-ohlc-strip ${className}`}
    >
      <span className="chartspro-ohlc-strip__symbol">{symbol}</span>
      <span className="chartspro-ohlc-strip__timeframe">{timeframe}</span>
      
      <span className="chartspro-ohlc-strip__label">O</span>
      <span className="chartspro-ohlc-strip__value" style={{ color: ohlcColor }}>
        {formatOhlcValue(bar.open)}
      </span>
      
      <span className="chartspro-ohlc-strip__label">H</span>
      <span className="chartspro-ohlc-strip__value" style={{ color: ohlcColor }}>
        {formatOhlcValue(bar.high)}
      </span>
      
      <span className="chartspro-ohlc-strip__label">L</span>
      <span className="chartspro-ohlc-strip__value" style={{ color: ohlcColor }}>
        {formatOhlcValue(bar.low)}
      </span>
      
      <span className="chartspro-ohlc-strip__label">C</span>
      <span className="chartspro-ohlc-strip__value" style={{ color: ohlcColor }}>
        {formatOhlcValue(bar.close)}
      </span>
      
      <span
        className="chartspro-ohlc-strip__change"
        style={{ color: changeColor }}
        data-testid="chartspro-ohlc-change"
      >
        {changeInfo.text}
      </span>
      
      <span className="chartspro-ohlc-strip__label">Vol</span>
      <span className="chartspro-ohlc-strip__volume">
        {formatVolume(bar.volume)}
      </span>
    </div>
  );
}
