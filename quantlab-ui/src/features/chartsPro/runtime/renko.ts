/**
 * renko.ts
 *
 * TV-21.4: Renko Brick Generation
 * TV-22.0c: Wiring RenkoSettings to transform
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
 * TV-22.0c: Extended Renko settings from ChartsProTab
 */
export interface RenkoSettingsInput {
  mode: "auto" | "fixed";
  fixedBoxSize: number;
  atrPeriod: number;
  autoMinBoxSize: number;
  rounding: "none" | "nice";
}

/**
 * TV-22.0c: Result of Renko transform with metadata for dump()
 */
export interface RenkoTransformResult {
  bricks: RenkoBrick[];
  meta: {
    boxSizeUsed: number;
    modeUsed: "auto" | "fixed";
    atrPeriodUsed: number;
    bricksCount: number;
    roundingUsed: "none" | "nice";
    firstBrick: RenkoBrick | null;
    lastBrick: RenkoBrick | null;
  };
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
 * TV-22.0c: Round to "nice" number (tick-friendly)
 * Examples: 0.0123 -> 0.01, 1.234 -> 1, 12.34 -> 10, 123.4 -> 100
 */
export function roundToNice(value: number): number {
  if (value <= 0) return value;
  
  // Find order of magnitude
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  
  // Round to nice values: 1, 2, 5, 10
  let nice: number;
  if (normalized <= 1.5) nice = 1;
  else if (normalized <= 3.5) nice = 2;
  else if (normalized <= 7.5) nice = 5;
  else nice = 10;
  
  return nice * magnitude;
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
 * TV-22.0c: Transform OHLC data to Renko bricks with full settings support
 *
 * @param bars - Input OHLC bars (sorted by time ascending)
 * @param settings - RenkoSettings from ChartsProTab
 * @returns RenkoTransformResult with bricks and metadata
 */
export function transformOhlcToRenkoWithSettings(
  bars: OhlcBar[],
  settings: RenkoSettingsInput
): RenkoTransformResult {
  const emptyResult: RenkoTransformResult = {
    bricks: [],
    meta: {
      boxSizeUsed: 0,
      modeUsed: settings.mode,
      atrPeriodUsed: settings.atrPeriod,
      bricksCount: 0,
      roundingUsed: settings.rounding,
      firstBrick: null,
      lastBrick: null,
    },
  };

  if (!bars || bars.length === 0) return emptyResult;

  // Calculate box size based on mode
  let boxSize: number;
  
  if (settings.mode === "fixed") {
    boxSize = settings.fixedBoxSize;
  } else {
    // Auto mode: use ATR with min clamp
    const atr = calculateAtr(bars, settings.atrPeriod);
    boxSize = Math.max(atr, settings.autoMinBoxSize);
    
    // If ATR is 0 (not enough data), fall back to price-based suggestion
    if (boxSize <= 0 || !isFinite(boxSize)) {
      const avgPrice = bars.reduce((sum, b) => sum + b.close, 0) / bars.length;
      boxSize = Math.max(suggestBoxSize(avgPrice), settings.autoMinBoxSize);
    }
  }

  // Apply rounding if requested
  if (settings.rounding === "nice") {
    boxSize = roundToNice(boxSize);
  }

  // Ensure box size is positive
  if (boxSize <= 0) {
    boxSize = settings.autoMinBoxSize > 0 ? settings.autoMinBoxSize : 0.01;
  }

  // Use existing transform logic
  const bricks = transformOhlcToRenko(bars, { boxSize });

  return {
    bricks,
    meta: {
      boxSizeUsed: boxSize,
      modeUsed: settings.mode,
      atrPeriodUsed: settings.atrPeriod,
      bricksCount: bricks.length,
      roundingUsed: settings.rounding,
      firstBrick: bricks[0] ?? null,
      lastBrick: bricks[bricks.length - 1] ?? null,
    },
  };
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

// ────────────────────────────────────────────────────────────────────────────────
// TV-22.0d1: Shared Renko Settings Validation
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Default Renko settings (single source of truth)
 */
export const DEFAULT_RENKO_SETTINGS: RenkoSettingsInput = {
  mode: "auto",
  fixedBoxSize: 1,
  atrPeriod: 14,
  autoMinBoxSize: 0.01,
  rounding: "none",
};

/**
 * Validation result for a single field
 */
export interface FieldValidation {
  valid: boolean;
  error?: string;
}

/**
 * Full validation result for RenkoSettings
 */
export interface RenkoSettingsValidation {
  ok: boolean;
  value: RenkoSettingsInput;
  errors: {
    mode?: string;
    fixedBoxSize?: string;
    atrPeriod?: string;
    autoMinBoxSize?: string;
    rounding?: string;
  };
}

/**
 * Raw input for validation (can have strings from form inputs)
 */
export interface RenkoSettingsRaw {
  mode?: unknown;
  fixedBoxSize?: unknown;
  atrPeriod?: unknown;
  autoMinBoxSize?: unknown;
  rounding?: unknown;
}

/**
 * Validate a single field and return parsed value or error
 */
function validateMode(value: unknown): { valid: true; value: "auto" | "fixed" } | { valid: false; error: string } {
  if (value === "auto" || value === "fixed") {
    return { valid: true, value };
  }
  return { valid: false, error: "Mode must be 'auto' or 'fixed'" };
}

function validateFixedBoxSize(value: unknown): { valid: true; value: number } | { valid: false; error: string } {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (typeof num !== "number" || isNaN(num)) {
    return { valid: false, error: "Box size must be a number" };
  }
  if (num <= 0) {
    return { valid: false, error: "Box size must be > 0" };
  }
  if (num > 10000) {
    return { valid: false, error: "Box size must be ≤ 10000" };
  }
  return { valid: true, value: num };
}

function validateAtrPeriod(value: unknown): { valid: true; value: number } | { valid: false; error: string } {
  const num = typeof value === "string" ? parseInt(value, 10) : value;
  if (typeof num !== "number" || isNaN(num)) {
    return { valid: false, error: "ATR period must be a number" };
  }
  if (!Number.isInteger(num)) {
    return { valid: false, error: "ATR period must be an integer" };
  }
  if (num < 1) {
    return { valid: false, error: "ATR period must be ≥ 1" };
  }
  if (num > 200) {
    return { valid: false, error: "ATR period must be ≤ 200" };
  }
  return { valid: true, value: num };
}

function validateAutoMinBoxSize(value: unknown): { valid: true; value: number } | { valid: false; error: string } {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (typeof num !== "number" || isNaN(num)) {
    return { valid: false, error: "Min box size must be a number" };
  }
  if (num < 0) {
    return { valid: false, error: "Min box size must be ≥ 0" };
  }
  if (num > 10000) {
    return { valid: false, error: "Min box size must be ≤ 10000" };
  }
  return { valid: true, value: num };
}

function validateRounding(value: unknown): { valid: true; value: "none" | "nice" } | { valid: false; error: string } {
  if (value === "none" || value === "nice") {
    return { valid: true, value };
  }
  return { valid: false, error: "Rounding must be 'none' or 'nice'" };
}

/**
 * TV-22.0d1: Normalize and validate Renko settings from raw input
 *
 * Returns { ok: true, value, errors: {} } if valid
 * Returns { ok: false, value: defaults, errors: { fieldName: errorMsg } } if invalid
 *
 * Used by:
 * - loadRenkoSettings() in ChartsProTab (from localStorage)
 * - RenkoSettingsModal Save handler (from form inputs)
 */
export function normalizeRenkoSettings(raw: RenkoSettingsRaw): RenkoSettingsValidation {
  const errors: RenkoSettingsValidation["errors"] = {};
  let ok = true;

  // Validate mode
  const modeResult = validateMode(raw.mode);
  const mode = modeResult.valid ? modeResult.value : DEFAULT_RENKO_SETTINGS.mode;
  if (!modeResult.valid) {
    errors.mode = modeResult.error;
    ok = false;
  }

  // Validate fixedBoxSize
  const fixedBoxSizeResult = validateFixedBoxSize(raw.fixedBoxSize);
  const fixedBoxSize = fixedBoxSizeResult.valid ? fixedBoxSizeResult.value : DEFAULT_RENKO_SETTINGS.fixedBoxSize;
  if (!fixedBoxSizeResult.valid) {
    errors.fixedBoxSize = fixedBoxSizeResult.error;
    ok = false;
  }

  // Validate atrPeriod
  const atrPeriodResult = validateAtrPeriod(raw.atrPeriod);
  const atrPeriod = atrPeriodResult.valid ? atrPeriodResult.value : DEFAULT_RENKO_SETTINGS.atrPeriod;
  if (!atrPeriodResult.valid) {
    errors.atrPeriod = atrPeriodResult.error;
    ok = false;
  }

  // Validate autoMinBoxSize
  const autoMinBoxSizeResult = validateAutoMinBoxSize(raw.autoMinBoxSize);
  const autoMinBoxSize = autoMinBoxSizeResult.valid ? autoMinBoxSizeResult.value : DEFAULT_RENKO_SETTINGS.autoMinBoxSize;
  if (!autoMinBoxSizeResult.valid) {
    errors.autoMinBoxSize = autoMinBoxSizeResult.error;
    ok = false;
  }

  // Validate rounding
  const roundingResult = validateRounding(raw.rounding);
  const rounding = roundingResult.valid ? roundingResult.value : DEFAULT_RENKO_SETTINGS.rounding;
  if (!roundingResult.valid) {
    errors.rounding = roundingResult.error;
    ok = false;
  }

  return {
    ok,
    value: { mode, fixedBoxSize, atrPeriod, autoMinBoxSize, rounding },
    errors,
  };
}

/**
 * Validate a single field (for live inline validation)
 */
export function validateRenkoField(
  field: keyof RenkoSettingsInput,
  value: unknown
): FieldValidation {
  switch (field) {
    case "mode": {
      const result = validateMode(value);
      return result.valid ? { valid: true } : { valid: false, error: result.error };
    }
    case "fixedBoxSize": {
      const result = validateFixedBoxSize(value);
      return result.valid ? { valid: true } : { valid: false, error: result.error };
    }
    case "atrPeriod": {
      const result = validateAtrPeriod(value);
      return result.valid ? { valid: true } : { valid: false, error: result.error };
    }
    case "autoMinBoxSize": {
      const result = validateAutoMinBoxSize(value);
      return result.valid ? { valid: true } : { valid: false, error: result.error };
    }
    case "rounding": {
      const result = validateRounding(value);
      return result.valid ? { valid: true } : { valid: false, error: result.error };
    }
    default:
      return { valid: false, error: "Unknown field" };
  }
}
