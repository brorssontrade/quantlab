/**
 * VolumeProfileEngine - Shared computation core for all Volume Profile variants
 * 
 * Implements TradingView-exact rules from:
 * - https://www.tradingview.com/support/solutions/43000644896-volume-profile-indicators-basic-concepts/
 * - https://www.tradingview.com/support/solutions/43000703072-session-volume-profile/
 * - https://www.tradingview.com/support/solutions/43000703071-periodic-volume-profile/
 * - https://www.tradingview.com/support/solutions/43000480324-fixed-range-volume-profile-indicator/
 * - https://www.tradingview.com/support/solutions/43000703077-auto-anchored-volume-profile/
 * - https://www.tradingview.com/support/solutions/43000703076-visible-range-volume-profile/
 */

// ============================================================================
// Types
// ============================================================================

/** Single LTF (Lower Time Frame) bar for VP computation */
export interface VPBar {
  time: number;       // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Volume bin at a specific price level */
export interface VPBin {
  priceStart: number;   // Lower edge of price bin
  priceEnd: number;     // Upper edge of price bin
  priceCenter: number;  // Center price for display
  upVolume: number;     // Volume from up bars
  downVolume: number;   // Volume from down bars
  totalVolume: number;  // Total volume in this bin
  deltaVolume: number;  // up - down volume
}

/** Complete volume profile result */
export interface VolumeProfile {
  bins: VPBin[];
  pocIndex: number;     // Index of Point of Control (highest volume bin)
  pocPrice: number;     // POC price level
  vahIndex: number;     // Value Area High bin index
  vahPrice: number;     // Value Area High price
  valIndex: number;     // Value Area Low bin index
  valPrice: number;     // Value Area Low price
  totalVolume: number;  // Total profile volume
  vaVolume: number;     // Volume within Value Area
  rangeHigh: number;    // Profile price range high
  rangeLow: number;     // Profile price range low
  rowSize: number;      // Price per row (bin height)
  numRows: number;      // Number of bins
  ltfBarsUsed: number;  // Number of LTF bars used
  ltfTf: string;        // LTF timeframe used
}

/** Rows layout mode (TV-style) */
export type RowsLayout = 
  | "Number of Rows"
  | "Ticks Per Row";

/** Volume display mode */
export type VolumeMode = 
  | "Up/Down"           // Split by candle direction
  | "Total"             // Total volume only
  | "Delta";            // up - down

/** Profile placement */
export type ProfilePlacement =
  | "Left"
  | "Right";

/** Scale mode for histogram */
export type ScaleMode =
  | "Width (%)"         // Max bin = full width percentage
  | "Fixed Width";      // Fixed pixel width

// ============================================================================
// TV Up/Down Classification Rules (CRUCIAL for parity)
// ============================================================================

/**
 * Determine if a bar is an "up" or "down" bar per TradingView rules:
 * 
 * 1. If close > open → upVolume
 * 2. If close < open → downVolume  
 * 3. If close == open (doji):
 *    - up if close > prevClose
 *    - down if close < prevClose
 *    - else use prevBar's classification (or 0 for first bar)
 * 
 * Returns: 1 for up, -1 for down, 0 for neutral (first bar with no ref)
 */
export function classifyBarDirection(
  bar: VPBar,
  prevBar: VPBar | null,
  prevClassification: number // 1, -1, or 0
): number {
  const { open, close } = bar;
  
  // Primary rule: close vs open
  if (close > open) return 1;  // up
  if (close < open) return -1; // down
  
  // Doji (close == open) - use secondary rules
  if (prevBar !== null) {
    const prevClose = prevBar.close;
    if (close > prevClose) return 1;  // up
    if (close < prevClose) return -1; // down
    // Still tied - use previous bar's classification
    return prevClassification;
  }
  
  // First bar with no comparison - neutral (volume goes nowhere or split)
  return 0;
}

/**
 * Classify all bars in sequence and return array of directions
 */
export function classifyAllBars(bars: VPBar[]): number[] {
  const directions: number[] = [];
  let prevClassification = 0;
  
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const prevBar = i > 0 ? bars[i - 1] : null;
    const dir = classifyBarDirection(bar, prevBar, prevClassification);
    directions.push(dir);
    if (dir !== 0) {
      prevClassification = dir;
    }
  }
  
  return directions;
}

// ============================================================================
// Row Size Rounding (TV-exact)
// ============================================================================

/**
 * Round row size to tick multiples per TradingView rules:
 * - If fractionalTicks > 0.25 → round UP
 * - If fractionalTicks <= 0.25 → round DOWN
 * - 0.25 exactly rounds DOWN
 * 
 * @param rawRowSize - Unrounded row size (range / numRows)
 * @param tickSize - Minimum tick size for the instrument
 * @returns Tick-aligned row size
 */
export function roundRowSize(rawRowSize: number, tickSize: number): number {
  if (tickSize <= 0) {
    throw new Error("tickSize must be positive");
  }
  
  const ticksPerRow = rawRowSize / tickSize;
  const fractionalTicks = ticksPerRow - Math.floor(ticksPerRow);
  
  // TV rule: > 0.25 round up, <= 0.25 round down
  const roundedTicks = fractionalTicks > 0.25 
    ? Math.ceil(ticksPerRow) 
    : Math.floor(ticksPerRow);
  
  // Ensure at least 1 tick per row
  return Math.max(roundedTicks, 1) * tickSize;
}

// ============================================================================
// Volume Distribution to Bins
// ============================================================================

/**
 * Distribute a bar's volume across price bins it overlaps.
 * TradingView distributes volume EVENLY across all overlapping rows.
 * 
 * Edge case: if high == low (single price), all volume goes to one bin.
 * 
 * @param bar - The LTF bar with OHLCV data
 * @param direction - 1 (up), -1 (down), or 0 (split evenly)
 * @param bins - The bins array to update in place
 * @param rangeLow - Profile range low price
 * @param rowSize - Price per row
 * @param numRows - Total number of bins
 */
export function distributeVolumeToBins(
  bar: VPBar,
  direction: number,
  bins: VPBin[],
  rangeLow: number,
  rowSize: number,
  numRows: number
): void {
  const { high, low, volume } = bar;
  
  // Find which bins this bar overlaps
  const startBin = Math.max(0, Math.floor((low - rangeLow) / rowSize));
  const endBin = Math.min(numRows - 1, Math.floor((high - rangeLow) / rowSize));
  
  // Calculate number of bins this bar touches
  const binsOverlapped = endBin - startBin + 1;
  
  // Volume per bin (evenly distributed)
  const volumePerBin = volume / binsOverlapped;
  
  // Distribute volume based on direction
  for (let i = startBin; i <= endBin; i++) {
    if (direction > 0) {
      bins[i].upVolume += volumePerBin;
    } else if (direction < 0) {
      bins[i].downVolume += volumePerBin;
    } else {
      // Neutral: split 50/50
      bins[i].upVolume += volumePerBin / 2;
      bins[i].downVolume += volumePerBin / 2;
    }
    bins[i].totalVolume += volumePerBin;
    bins[i].deltaVolume = bins[i].upVolume - bins[i].downVolume;
  }
}

// ============================================================================
// Value Area Calculation (TV-exact algorithm)
// ============================================================================

/**
 * Calculate Value Area using TradingView's expansion algorithm:
 * 
 * 1. Start with POC (highest volume bin)
 * 2. Look at the bin above and below current VA
 * 3. Add the one with higher volume (if tied, add both)
 * 4. Repeat until VA volume >= valueAreaPct of total
 * 
 * Returns { vahIndex, valIndex } for the Value Area boundaries
 */
export function calculateValueArea(
  bins: VPBin[],
  pocIndex: number,
  totalVolume: number,
  valueAreaPct: number // e.g., 0.70 for 70%
): { vahIndex: number; valIndex: number; vaVolume: number } {
  if (bins.length === 0) {
    return { vahIndex: 0, valIndex: 0, vaVolume: 0 };
  }
  
  const targetVolume = totalVolume * valueAreaPct;
  
  // Start with POC
  let vahIndex = pocIndex;
  let valIndex = pocIndex;
  let vaVolume = bins[pocIndex].totalVolume;
  
  while (vaVolume < targetVolume) {
    // Look at neighbors
    const aboveIndex = vahIndex + 1;
    const belowIndex = valIndex - 1;
    
    const aboveVol = aboveIndex < bins.length ? bins[aboveIndex].totalVolume : 0;
    const belowVol = belowIndex >= 0 ? bins[belowIndex].totalVolume : 0;
    
    // No more bins to add
    if (aboveVol === 0 && belowVol === 0) break;
    
    // Compare and add higher volume side
    if (aboveVol > belowVol) {
      vahIndex = aboveIndex;
      vaVolume += aboveVol;
    } else if (belowVol > aboveVol) {
      valIndex = belowIndex;
      vaVolume += belowVol;
    } else {
      // Equal: add both
      if (aboveVol > 0) {
        vahIndex = aboveIndex;
        vaVolume += aboveVol;
      }
      if (belowVol > 0) {
        valIndex = belowIndex;
        vaVolume += belowVol;
      }
    }
  }
  
  return { vahIndex, valIndex, vaVolume };
}

// ============================================================================
// Main Profile Builder
// ============================================================================

export interface BuildProfileOptions {
  bars: VPBar[];              // LTF bars to analyze
  rangeHigh?: number;         // Override: high price of range (defaults to max high)
  rangeLow?: number;          // Override: low price of range (defaults to min low)
  rowsLayout: RowsLayout;     // "Number of Rows" or "Ticks Per Row"
  numRows?: number;           // Number of rows when layout is "Number of Rows"
  rowSize?: number;           // Tick size when layout is "Ticks Per Row"
  valueAreaPct: number;       // Value Area percentage (0.70 = 70%)
  tickSize: number;           // Instrument tick size for rounding
  ltfTf?: string;             // LTF timeframe used (for metadata)
}

/**
 * Build a complete volume profile from LTF bars.
 * This is the single source of truth for all VP variants.
 */
export function buildProfile(options: BuildProfileOptions): VolumeProfile {
  const {
    bars,
    rowsLayout,
    numRows: inputNumRows = 24,
    rowSize: inputRowSize,
    valueAreaPct = 0.70,
    tickSize,
    ltfTf = "1m",
  } = options;
  
  // Handle empty input
  if (bars.length === 0) {
    return {
      bins: [],
      pocIndex: 0,
      pocPrice: 0,
      vahIndex: 0,
      vahPrice: 0,
      valIndex: 0,
      valPrice: 0,
      totalVolume: 0,
      vaVolume: 0,
      rangeHigh: 0,
      rangeLow: 0,
      rowSize: 0,
      numRows: 0,
      ltfBarsUsed: 0,
      ltfTf,
    };
  }
  
  // Calculate range from bars if not provided
  let rangeHigh = options.rangeHigh ?? -Infinity;
  let rangeLow = options.rangeLow ?? Infinity;
  
  for (const bar of bars) {
    rangeHigh = Math.max(rangeHigh, bar.high);
    rangeLow = Math.min(rangeLow, bar.low);
  }
  
  // Calculate row size and number of rows
  const priceRange = rangeHigh - rangeLow;
  let rowSize: number;
  let numRows: number;
  
  if (rowsLayout === "Number of Rows") {
    numRows = inputNumRows;
    const rawRowSize = priceRange / numRows;
    rowSize = roundRowSize(rawRowSize, tickSize);
    // Recalculate numRows based on rounded row size
    numRows = Math.ceil(priceRange / rowSize);
  } else {
    // Ticks Per Row
    rowSize = inputRowSize ?? tickSize;
    numRows = Math.ceil(priceRange / rowSize);
  }
  
  // Ensure at least 1 row
  numRows = Math.max(numRows, 1);
  
  // Initialize bins
  const bins: VPBin[] = [];
  for (let i = 0; i < numRows; i++) {
    const priceStart = rangeLow + i * rowSize;
    const priceEnd = priceStart + rowSize;
    bins.push({
      priceStart,
      priceEnd,
      priceCenter: (priceStart + priceEnd) / 2,
      upVolume: 0,
      downVolume: 0,
      totalVolume: 0,
      deltaVolume: 0,
    });
  }
  
  // Classify all bars
  const directions = classifyAllBars(bars);
  
  // Distribute volume to bins
  for (let i = 0; i < bars.length; i++) {
    distributeVolumeToBins(bars[i], directions[i], bins, rangeLow, rowSize, numRows);
  }
  
  // Calculate total volume and find POC
  let totalVolume = 0;
  let pocIndex = 0;
  let maxVolume = 0;
  
  for (let i = 0; i < bins.length; i++) {
    totalVolume += bins[i].totalVolume;
    if (bins[i].totalVolume > maxVolume) {
      maxVolume = bins[i].totalVolume;
      pocIndex = i;
    }
  }
  
  // Calculate Value Area
  const { vahIndex, valIndex, vaVolume } = calculateValueArea(
    bins,
    pocIndex,
    totalVolume,
    valueAreaPct
  );
  
  return {
    bins,
    pocIndex,
    pocPrice: bins[pocIndex]?.priceCenter ?? 0,
    vahIndex,
    vahPrice: bins[vahIndex]?.priceEnd ?? 0,
    valIndex,
    valPrice: bins[valIndex]?.priceStart ?? 0,
    totalVolume,
    vaVolume,
    rangeHigh,
    rangeLow,
    rowSize,
    numRows,
    ltfBarsUsed: bars.length,
    ltfTf,
  };
}

// ============================================================================
// LTF Timeframe Selection (5000-bar rule)
// ============================================================================

/**
 * Standard LTF progression used by TradingView for VPFR/AAVP.
 * Listed from finest to coarsest resolution.
 */
export const LTF_PROGRESSION = [
  "1",      // 1 minute
  "3",      // 3 minutes
  "5",      // 5 minutes
  "15",     // 15 minutes
  "30",     // 30 minutes
  "60",     // 1 hour
  "240",    // 4 hours
  "1D",     // 1 day
] as const;

/** Map LTF timeframe to approximate minutes */
export function ltfToMinutes(ltfTf: string): number {
  switch (ltfTf) {
    case "1S": return 1 / 60;
    case "1": return 1;
    case "3": return 3;
    case "5": return 5;
    case "15": return 15;
    case "30": return 30;
    case "60": return 60;
    case "240": return 240;
    case "1D": return 1440;
    default: return 1;
  }
}

/**
 * Select LTF timeframe using TV's 5000-bar rule:
 * - Go through LTF progression from finest to coarsest
 * - Pick the first TF where estimated bars in range < 5000
 * 
 * For futures/spreads: use one step lower than current TF
 * 
 * @param rangeStartTime - Start of range (Unix seconds)
 * @param rangeEndTime - End of range (Unix seconds)
 * @param chartTf - Current chart timeframe
 * @param isFuturesOrSpread - Whether symbol is futures/spread
 * @returns Selected LTF timeframe
 */
export function selectLtfTf(
  rangeStartTime: number,
  rangeEndTime: number,
  chartTf: string,
  isFuturesOrSpread: boolean = false
): string {
  const MAX_BARS = 5000;
  const rangeMins = (rangeEndTime - rangeStartTime) / 60;
  
  // Futures/Spreads: use one step lower than chart TF
  if (isFuturesOrSpread) {
    const chartIdx = [...LTF_PROGRESSION].indexOf(chartTf as typeof LTF_PROGRESSION[number]);
    if (chartIdx > 0) {
      return LTF_PROGRESSION[chartIdx - 1];
    }
    // If chart is already 1m or not in progression, use 1m
    return "1";
  }
  
  // Standard 5000-bar rule
  for (const ltf of LTF_PROGRESSION) {
    const ltfMins = ltfToMinutes(ltf);
    const estimatedBars = rangeMins / ltfMins;
    
    if (estimatedBars < MAX_BARS) {
      return ltf;
    }
  }
  
  // Fallback to coarsest
  return "1D";
}

// ============================================================================
// Auto-Anchor Period Selection (for AAVP)
// ============================================================================

export type AnchorPeriod = 
  | "Auto"
  | "Session"
  | "Month"
  | "Quarter"
  | "Year"
  | "Decade"
  | "Highest High"
  | "Lowest Low";

/**
 * Determine anchor period based on chart timeframe for "Auto" mode.
 * 
 * TV rules:
 * - Intraday (<1D) → Session
 * - 1D → Month
 * - 2D-10D → Quarter
 * - 11D-60D → Year
 * - >60D → Decade
 */
export function getAutoAnchorPeriod(chartTf: string): AnchorPeriod {
  const mins = ltfToMinutes(chartTf);
  const days = mins / 1440;
  
  if (days < 1) return "Session";
  if (days === 1) return "Month";
  if (days >= 2 && days <= 10) return "Quarter";
  if (days >= 11 && days <= 60) return "Year";
  return "Decade";
}

// ============================================================================
// Session/Period Boundaries (for SVP/PVP)
// ============================================================================

export type PeriodType = 
  | "Session"
  | "Week"
  | "Month"
  | "Quarter"
  | "Year";

/**
 * Get period boundaries from bars.
 * Returns array of { startTime, endTime, bars } for each period.
 */
export interface PeriodBoundary {
  startTime: number;
  endTime: number;
  bars: VPBar[];
}

/**
 * Split bars into periods based on period type.
 * 
 * @param bars - All LTF bars
 * @param periodType - Type of period to split by
 * @param maxRows - Maximum total rows across all periods (6000 for TV)
 * @param rowsPerPeriod - Rows per individual period
 * @returns Array of period boundaries with their bars
 */
export function splitIntoPeriods(
  bars: VPBar[],
  periodType: PeriodType,
  maxRows: number = 6000,
  rowsPerPeriod: number = 24
): PeriodBoundary[] {
  if (bars.length === 0) return [];
  
  const periods: PeriodBoundary[] = [];
  let currentPeriod: PeriodBoundary | null = null;
  let totalRows = 0;
  
  for (const bar of bars) {
    const periodStart = getPeriodStart(bar.time * 1000, periodType);
    
    // Check if we need to start a new period
    if (currentPeriod === null || periodStart !== getPeriodStart(currentPeriod.startTime * 1000, periodType)) {
      // Check row limit before adding new period
      if (totalRows + rowsPerPeriod > maxRows) {
        // Stop adding periods - hit the limit
        break;
      }
      
      // Finish previous period
      if (currentPeriod !== null) {
        periods.push(currentPeriod);
      }
      
      // Start new period
      currentPeriod = {
        startTime: bar.time,
        endTime: bar.time,
        bars: [bar],
      };
      totalRows += rowsPerPeriod;
    } else {
      // Add to current period
      currentPeriod.endTime = bar.time;
      currentPeriod.bars.push(bar);
    }
  }
  
  // Add last period
  if (currentPeriod !== null) {
    periods.push(currentPeriod);
  }
  
  return periods;
}

/**
 * Get the start timestamp of the period containing the given date.
 */
function getPeriodStart(timestampMs: number, periodType: PeriodType): number {
  const date = new Date(timestampMs);
  
  switch (periodType) {
    case "Session":
      // Daily session - start of day
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    
    case "Week":
      // Start of week (Sunday)
      const dayOfWeek = date.getDay();
      return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() - dayOfWeek
      ).getTime();
    
    case "Month":
      return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    
    case "Quarter":
      const quarter = Math.floor(date.getMonth() / 3);
      return new Date(date.getFullYear(), quarter * 3, 1).getTime();
    
    case "Year":
      return new Date(date.getFullYear(), 0, 1).getTime();
    
    default:
      return timestampMs;
  }
}

// ============================================================================
// Visible Range Helpers
// ============================================================================

/**
 * Filter bars to those within a visible time range.
 */
export function filterBarsToVisibleRange(
  bars: VPBar[],
  visibleStart: number,
  visibleEnd: number
): VPBar[] {
  return bars.filter(bar => bar.time >= visibleStart && bar.time <= visibleEnd);
}

/**
 * Find highest high / lowest low in a range for AAVP anchoring.
 */
export function findHighLowAnchor(
  bars: VPBar[],
  length: number,
  mode: "Highest High" | "Lowest Low"
): { anchorTime: number; anchorPrice: number } {
  if (bars.length === 0) {
    return { anchorTime: 0, anchorPrice: 0 };
  }
  
  // Look at last N bars
  const lookbackBars = bars.slice(-length);
  
  if (mode === "Highest High") {
    let maxHigh = -Infinity;
    let maxTime = 0;
    for (const bar of lookbackBars) {
      if (bar.high > maxHigh) {
        maxHigh = bar.high;
        maxTime = bar.time;
      }
    }
    return { anchorTime: maxTime, anchorPrice: maxHigh };
  } else {
    let minLow = Infinity;
    let minTime = 0;
    for (const bar of lookbackBars) {
      if (bar.low < minLow) {
        minLow = bar.low;
        minTime = bar.time;
      }
    }
    return { anchorTime: minTime, anchorPrice: minLow };
  }
}

// ============================================================================
// Debug/Logging Helpers
// ============================================================================

export interface VPDebugInfo {
  indicator: string;
  ltfTf: string;
  ltfBarsUsed: number;
  numRows: number;
  rowSize: number;
  pocPrice: number;
  vahPrice: number;
  valPrice: number;
  totalVolume: number;
  vaVolume: number;
}

export function getDebugInfo(profile: VolumeProfile, indicatorName: string): VPDebugInfo {
  return {
    indicator: indicatorName,
    ltfTf: profile.ltfTf,
    ltfBarsUsed: profile.ltfBarsUsed,
    numRows: profile.numRows,
    rowSize: profile.rowSize,
    pocPrice: profile.pocPrice,
    vahPrice: profile.vahPrice,
    valPrice: profile.valPrice,
    totalVolume: profile.totalVolume,
    vaVolume: profile.vaVolume,
  };
}
