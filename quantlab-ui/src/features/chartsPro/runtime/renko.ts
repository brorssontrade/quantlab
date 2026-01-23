/**
 * renko.ts
 *
 * TV-21.4: Renko Brick Generation
 *
 * Pure utility function for transforming OHLC data to Renko bricks.
 * Unit-testable without UI dependencies.
 *
 * Renko rules:
 * - A new brick is drawn when price moves by the box size
 * - Up brick: close >= previous brick close + boxSize
 * - Down brick: close <= previous brick close - boxSize
 * - Bricks are drawn at fixed box intervals (no time axis, but we use time for chart)
 * - Each brick's OHLC: open = prev close, close = new level, high/low = open/close extremes
 *
 * This implementation uses "close" price for brick calculation (most common).
 */

export interface OhlcBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface RenkoBrick {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  direction: 'up' | 'down';
  volume?: number;
}

export interface RenkoConfig {
  /** Box size in price units (e.g., 1.0 for $1 bricks) */
  boxSize: number;
  /** Use ATR-based box size calculation (optional) */
  useAtr?: boolean;
  /** ATR period for auto box size (default: 14) */
  atrPeriod?: number;
}

/**
 * Calculate ATR (Average True Range) for auto box size
 */
export function calculateAtr(bars: OhlcBar[], period: number = 14): number {
  if (bars.length < 2) return 0;

  const trueRanges: number[] = [];

  for (let i = 1; i < bars.length; i++) {
    const current = bars[i];
    const prev = bars[i - 1];

    // True Range = max(high - low, |high - prev close|, |low - prev close|)
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    );
    trueRanges.push(tr);
  }

  // Simple moving average of TR for ATR
  const relevantTr = trueRanges.slice(-period);
  if (relevantTr.length === 0) return 0;

  return relevantTr.reduce((sum, tr) => sum + tr, 0) / relevantTr.length;
}

/**
 * Round price to nearest box level
 */
function roundToBoxLevel(price: number, boxSize: number, baseLevel: number): number {
  return baseLevel + Math.round((price - baseLevel) / boxSize) * boxSize;
}

/**
 * Transform OHLC data to Renko bricks
 *
 * @param bars - Input OHLC bars (sorted by time ascending)
 * @param config - Renko configuration (boxSize required)
 * @returns Array of Renko bricks
 */
export function transformOhlcToRenko(bars: OhlcBar[], config: RenkoConfig): RenkoBrick[] {
  if (!bars || bars.length === 0) return [];

  let boxSize = config.boxSize;

  // Auto-calculate box size from ATR if requested
  if (config.useAtr) {
    const atrPeriod = config.atrPeriod ?? 14;
    const atr = calculateAtr(bars, atrPeriod);
    if (atr > 0) {
      // Use ATR as box size, rounded to a "nice" number
      boxSize = Math.max(atr, config.boxSize);
    }
  }

  if (boxSize <= 0) {
    throw new Error('Renko boxSize must be positive');
  }

  const bricks: RenkoBrick[] = [];

  // Initialize with first bar's close, rounded to box level
  const firstClose = bars[0].close;
  let currentLevel = roundToBoxLevel(firstClose, boxSize, firstClose);
  let lastDirection: 'up' | 'down' | null = null;

  // Track cumulative volume for each brick
  let accumulatedVolume = 0;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const closePrice = bar.close;
    accumulatedVolume += bar.volume ?? 0;

    // Check for new up bricks
    while (closePrice >= currentLevel + boxSize) {
      const newLevel = currentLevel + boxSize;
      const brick: RenkoBrick = {
        time: bar.time,
        open: currentLevel,
        close: newLevel,
        high: newLevel,
        low: currentLevel,
        direction: 'up',
        volume: accumulatedVolume,
      };
      bricks.push(brick);
      currentLevel = newLevel;
      lastDirection = 'up';
      accumulatedVolume = 0;
    }

    // Check for new down bricks
    while (closePrice <= currentLevel - boxSize) {
      const newLevel = currentLevel - boxSize;
      const brick: RenkoBrick = {
        time: bar.time,
        open: currentLevel,
        close: newLevel,
        high: currentLevel,
        low: newLevel,
        direction: 'down',
        volume: accumulatedVolume,
      };
      bricks.push(brick);
      currentLevel = newLevel;
      lastDirection = 'down';
      accumulatedVolume = 0;
    }
  }

  return bricks;
}

/**
 * Get a suggested box size based on price level
 * (Useful for UI defaults)
 */
export function suggestBoxSize(price: number): number {
  if (price <= 1) return 0.01;
  if (price <= 10) return 0.1;
  if (price <= 100) return 1;
  if (price <= 1000) return 5;
  if (price <= 10000) return 50;
  return 100;
}

/**
 * Convert Renko bricks to LightweightCharts candlestick format
 * (For rendering as candlestick series)
 */
export function renkoToLwCandlestick(bricks: RenkoBrick[]): Array<{
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}> {
  return bricks.map((brick) => ({
    time: brick.time,
    open: brick.open,
    high: brick.high,
    low: brick.low,
    close: brick.close,
  }));
}
