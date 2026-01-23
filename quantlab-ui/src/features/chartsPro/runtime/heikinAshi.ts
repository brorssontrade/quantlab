/**
 * heikinAshi.ts
 *
 * TV-21.1: Heikin Ashi Transformation
 *
 * Pure utility function for transforming OHLC data to Heikin Ashi.
 * Unit-testable without UI dependencies.
 *
 * Heikin Ashi formula:
 * - HA Close = (Open + High + Low + Close) / 4
 * - HA Open = (Previous HA Open + Previous HA Close) / 2
 * - HA High = max(High, HA Open, HA Close)
 * - HA Low = min(Low, HA Open, HA Close)
 *
 * For the first bar, HA Open = (Open + Close) / 2
 */

export interface OhlcBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface HeikinAshiBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Transform a single OHLC bar to Heikin Ashi
 * Requires the previous HA bar's open and close for calculation
 */
export function transformToHeikinAshi(
  current: OhlcBar,
  prevHaOpen: number | null,
  prevHaClose: number | null
): HeikinAshiBar {
  // HA Close = (Open + High + Low + Close) / 4
  const haClose = (current.open + current.high + current.low + current.close) / 4;

  // HA Open: for first bar, use (Open + Close) / 2
  // For subsequent bars, use (prevHaOpen + prevHaClose) / 2
  const haOpen =
    prevHaOpen !== null && prevHaClose !== null
      ? (prevHaOpen + prevHaClose) / 2
      : (current.open + current.close) / 2;

  // HA High = max(High, HA Open, HA Close)
  const haHigh = Math.max(current.high, haOpen, haClose);

  // HA Low = min(Low, HA Open, HA Close)
  const haLow = Math.min(current.low, haOpen, haClose);

  return {
    time: current.time,
    open: haOpen,
    high: haHigh,
    low: haLow,
    close: haClose,
    volume: current.volume,
  };
}

/**
 * Transform an array of OHLC bars to Heikin Ashi bars
 */
export function transformOhlcToHeikinAshi(bars: OhlcBar[]): HeikinAshiBar[] {
  if (!bars || bars.length === 0) return [];

  const result: HeikinAshiBar[] = [];
  let prevHaOpen: number | null = null;
  let prevHaClose: number | null = null;

  for (const bar of bars) {
    const haBar = transformToHeikinAshi(bar, prevHaOpen, prevHaClose);
    result.push(haBar);

    // Update previous values for next iteration
    prevHaOpen = haBar.open;
    prevHaClose = haBar.close;
  }

  return result;
}
