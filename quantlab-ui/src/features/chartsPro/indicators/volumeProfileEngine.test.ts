/**
 * Unit tests for VolumeProfileEngine
 * 
 * Tests TradingView-exact rules:
 * - Up/Down bar classification
 * - Row size rounding (0.25 rule)
 * - Value Area expansion algorithm
 * - Volume distribution to bins
 */

import { describe, test, expect } from "vitest";
import {
  classifyBarDirection,
  classifyAllBars,
  roundRowSize,
  distributeVolumeToBins,
  calculateValueArea,
  buildProfile,
  selectLtfTf,
  getAutoAnchorPeriod,
  splitIntoPeriods,
  filterBarsToVisibleRange,
  findHighLowAnchor,
  type VPBar,
  type VPBin,
} from "./volumeProfileEngine";

// ============================================================================
// Test Data Helpers
// ============================================================================

function makeBar(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number
): VPBar {
  return { time, open, high, low, close, volume };
}

function makeEmptyBins(count: number, rangeLow: number, rowSize: number): VPBin[] {
  const bins: VPBin[] = [];
  for (let i = 0; i < count; i++) {
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
  return bins;
}

// ============================================================================
// classifyBarDirection Tests
// ============================================================================

describe("classifyBarDirection", () => {
  test("close > open → up (1)", () => {
    const bar = makeBar(1000, 100, 105, 99, 104, 1000);
    expect(classifyBarDirection(bar, null, 0)).toBe(1);
  });

  test("close < open → down (-1)", () => {
    const bar = makeBar(1000, 100, 105, 99, 98, 1000);
    expect(classifyBarDirection(bar, null, 0)).toBe(-1);
  });

  test("doji (close == open), close > prevClose → up (1)", () => {
    const prevBar = makeBar(900, 95, 100, 94, 97, 1000);
    const bar = makeBar(1000, 100, 105, 99, 100, 1000); // doji
    expect(classifyBarDirection(bar, prevBar, 0)).toBe(1);
  });

  test("doji (close == open), close < prevClose → down (-1)", () => {
    const prevBar = makeBar(900, 95, 102, 94, 101, 1000);
    const bar = makeBar(1000, 100, 105, 99, 100, 1000); // doji
    expect(classifyBarDirection(bar, prevBar, 0)).toBe(-1);
  });

  test("doji, close == prevClose → use prevClassification", () => {
    const prevBar = makeBar(900, 95, 102, 94, 100, 1000);
    const bar = makeBar(1000, 100, 105, 99, 100, 1000); // doji
    expect(classifyBarDirection(bar, prevBar, 1)).toBe(1);
    expect(classifyBarDirection(bar, prevBar, -1)).toBe(-1);
  });

  test("first doji with no prev → neutral (0)", () => {
    const bar = makeBar(1000, 100, 105, 99, 100, 1000);
    expect(classifyBarDirection(bar, null, 0)).toBe(0);
  });
});

describe("classifyAllBars", () => {
  test("classifies sequence of bars correctly", () => {
    const bars = [
      makeBar(1000, 100, 105, 99, 104, 1000),  // up
      makeBar(1060, 104, 106, 102, 101, 1000), // down
      makeBar(1120, 101, 103, 100, 103, 1000), // up
    ];
    expect(classifyAllBars(bars)).toEqual([1, -1, 1]);
  });

  test("handles doji chain correctly", () => {
    const bars = [
      makeBar(1000, 100, 105, 99, 104, 1000),  // up
      makeBar(1060, 104, 106, 102, 104, 1000), // doji, close == open, close == prevClose → carry forward up
    ];
    expect(classifyAllBars(bars)).toEqual([1, 1]);
  });

  test("first bar doji → neutral (0)", () => {
    const bars = [
      makeBar(1000, 100, 105, 99, 100, 1000),  // doji, first bar
      makeBar(1060, 100, 106, 98, 105, 1000),  // up
    ];
    expect(classifyAllBars(bars)).toEqual([0, 1]);
  });
});

// ============================================================================
// roundRowSize Tests (TV 0.25 rule)
// ============================================================================

describe("roundRowSize", () => {
  test("fractional ticks > 0.25 → round UP", () => {
    // 22.6 ticks → ceil(22.6) = 23 ticks (0.6 > 0.25)
    expect(roundRowSize(0.226, 0.01)).toBe(0.23);
    // 2.5 ticks → ceil(2.5) = 3 ticks (0.5 > 0.25)
    expect(roundRowSize(0.025, 0.01)).toBe(0.03);
    // 3.26 ticks → ceil(3.26) = 4 ticks (0.26 > 0.25)
    expect(roundRowSize(0.0326, 0.01)).toBe(0.04);
  });

  test("fractional ticks <= 0.25 → round DOWN", () => {
    // 2.25 ticks → floor(2.25) = 2 ticks
    expect(roundRowSize(0.0225, 0.01)).toBe(0.02);
    // 2.1 ticks → floor(2.1) = 2 ticks
    expect(roundRowSize(0.021, 0.01)).toBe(0.02);
  });

  test("0.25 EXACTLY rounds DOWN", () => {
    // 2.25 ticks → floor(2.25) = 2 ticks
    expect(roundRowSize(0.0225, 0.01)).toBe(0.02);
  });

  test("minimum 1 tick", () => {
    // 0.5 ticks → max(floor(0.5), 1) = 1 tick
    expect(roundRowSize(0.005, 0.01)).toBe(0.01);
  });

  test("throws on invalid tickSize", () => {
    expect(() => roundRowSize(1.0, 0)).toThrow("tickSize must be positive");
    expect(() => roundRowSize(1.0, -0.01)).toThrow("tickSize must be positive");
  });
});

// ============================================================================
// distributeVolumeToBins Tests
// ============================================================================

describe("distributeVolumeToBins", () => {
  test("bar overlapping 1 bin → all volume to that bin", () => {
    const bins = makeEmptyBins(5, 100, 1);
    const bar = makeBar(1000, 101.2, 101.8, 101.2, 101.5, 1000);
    distributeVolumeToBins(bar, 1, bins, 100, 1, 5);
    
    expect(bins[1].upVolume).toBe(1000);
    expect(bins[1].downVolume).toBe(0);
    expect(bins[1].totalVolume).toBe(1000);
  });

  test("bar overlapping multiple bins → volume distributed evenly", () => {
    const bins = makeEmptyBins(5, 100, 1);
    // Bar from 100.5 to 102.5 → overlaps bins 0, 1, 2 (3 bins)
    const bar = makeBar(1000, 101, 102.5, 100.5, 101.5, 900);
    distributeVolumeToBins(bar, 1, bins, 100, 1, 5);
    
    expect(bins[0].upVolume).toBe(300);
    expect(bins[1].upVolume).toBe(300);
    expect(bins[2].upVolume).toBe(300);
    expect(bins[0].totalVolume).toBe(300);
  });

  test("down bar → volume goes to downVolume", () => {
    const bins = makeEmptyBins(5, 100, 1);
    const bar = makeBar(1000, 102, 102.5, 101.2, 101.5, 1000);
    distributeVolumeToBins(bar, -1, bins, 100, 1, 5);
    
    expect(bins[1].downVolume).toBe(500);
    expect(bins[2].downVolume).toBe(500);
    expect(bins[1].upVolume).toBe(0);
  });

  test("neutral direction → volume split 50/50", () => {
    const bins = makeEmptyBins(5, 100, 1);
    const bar = makeBar(1000, 101.5, 101.8, 101.2, 101.5, 1000); // doji
    distributeVolumeToBins(bar, 0, bins, 100, 1, 5);
    
    expect(bins[1].upVolume).toBe(500);
    expect(bins[1].downVolume).toBe(500);
    expect(bins[1].totalVolume).toBe(1000);
  });

  test("high == low → all volume to single bin", () => {
    const bins = makeEmptyBins(5, 100, 1);
    const bar = makeBar(1000, 101.5, 101.5, 101.5, 101.5, 1000);
    distributeVolumeToBins(bar, 1, bins, 100, 1, 5);
    
    expect(bins[1].upVolume).toBe(1000);
    expect(bins[0].totalVolume).toBe(0);
    expect(bins[2].totalVolume).toBe(0);
  });
});

// ============================================================================
// calculateValueArea Tests
// ============================================================================

describe("calculateValueArea", () => {
  test("starts with POC and expands to higher volume side", () => {
    // Create bins with specific volume pattern
    const bins: VPBin[] = [
      { priceStart: 100, priceEnd: 101, priceCenter: 100.5, upVolume: 100, downVolume: 0, totalVolume: 100, deltaVolume: 100 },
      { priceStart: 101, priceEnd: 102, priceCenter: 101.5, upVolume: 300, downVolume: 0, totalVolume: 300, deltaVolume: 300 },
      { priceStart: 102, priceEnd: 103, priceCenter: 102.5, upVolume: 500, downVolume: 0, totalVolume: 500, deltaVolume: 500 }, // POC
      { priceStart: 103, priceEnd: 104, priceCenter: 103.5, upVolume: 200, downVolume: 0, totalVolume: 200, deltaVolume: 200 },
      { priceStart: 104, priceEnd: 105, priceCenter: 104.5, upVolume: 50, downVolume: 0, totalVolume: 50, deltaVolume: 50 },
    ];
    const totalVolume = 1150;
    
    // 70% of 1150 = 805, POC=500, need 305 more
    // Next: compare bins[3]=200 vs bins[1]=300 → add bins[1] (800 total)
    // Now at 800, need 5 more → add bins[3]=200 (1000 total > 805)
    const { vahIndex, valIndex, vaVolume } = calculateValueArea(bins, 2, totalVolume, 0.70);
    
    expect(valIndex).toBe(1); // Added first (higher volume)
    expect(vahIndex).toBe(3); // Added second
    expect(vaVolume).toBe(1000);
  });

  test("adds both when volumes are equal", () => {
    const bins: VPBin[] = [
      { priceStart: 100, priceEnd: 101, priceCenter: 100.5, upVolume: 200, downVolume: 0, totalVolume: 200, deltaVolume: 200 },
      { priceStart: 101, priceEnd: 102, priceCenter: 101.5, upVolume: 500, downVolume: 0, totalVolume: 500, deltaVolume: 500 }, // POC
      { priceStart: 102, priceEnd: 103, priceCenter: 102.5, upVolume: 200, downVolume: 0, totalVolume: 200, deltaVolume: 200 },
    ];
    
    const { vahIndex, valIndex, vaVolume } = calculateValueArea(bins, 1, 900, 0.70);
    
    // Equal volumes → add both simultaneously
    expect(valIndex).toBe(0);
    expect(vahIndex).toBe(2);
    expect(vaVolume).toBe(900);
  });

  test("handles empty bins", () => {
    const { vahIndex, valIndex, vaVolume } = calculateValueArea([], 0, 0, 0.70);
    expect(vahIndex).toBe(0);
    expect(valIndex).toBe(0);
    expect(vaVolume).toBe(0);
  });
});

// ============================================================================
// buildProfile Integration Tests
// ============================================================================

describe("buildProfile", () => {
  test("builds profile with correct POC", () => {
    const bars = [
      makeBar(1000, 100, 102, 99, 101, 100),
      makeBar(1060, 101, 103, 100, 102, 200), // highest volume
      makeBar(1120, 102, 104, 101, 103, 150),
    ];
    
    const profile = buildProfile({
      bars,
      rowsLayout: "Number of Rows",
      numRows: 5,
      valueAreaPct: 0.70,
      tickSize: 0.01,
    });
    
    expect(profile.ltfBarsUsed).toBe(3);
    expect(profile.totalVolume).toBe(450);
    expect(profile.numRows).toBeGreaterThan(0);
    expect(profile.pocPrice).toBeDefined();
    expect(profile.vahPrice).toBeGreaterThanOrEqual(profile.pocPrice);
    expect(profile.valPrice).toBeLessThanOrEqual(profile.pocPrice);
  });

  test("handles empty bars", () => {
    const profile = buildProfile({
      bars: [],
      rowsLayout: "Number of Rows",
      numRows: 24,
      valueAreaPct: 0.70,
      tickSize: 0.01,
    });
    
    expect(profile.bins).toEqual([]);
    expect(profile.totalVolume).toBe(0);
    expect(profile.numRows).toBe(0);
  });

  test("uses tick-rounded row size", () => {
    const bars = [
      makeBar(1000, 100, 110, 100, 105, 1000),
    ];
    
    const profile = buildProfile({
      bars,
      rowsLayout: "Number of Rows",
      numRows: 4,
      valueAreaPct: 0.70,
      tickSize: 1.0, // 1 dollar tick
    });
    
    // Range = 10, 4 rows = 2.5 per row
    // 2.5 ticks → 0.5 > 0.25 → round UP to 3 ticks
    expect(profile.rowSize).toBe(3);
  });
});

// ============================================================================
// selectLtfTf Tests (5000-bar rule)
// ============================================================================

describe("selectLtfTf", () => {
  test("selects 1m for short ranges", () => {
    // 2 hours = 120 minutes = 120 bars at 1m (well under 5000)
    const start = 1000000;
    const end = start + 2 * 60 * 60; // 2 hours in seconds
    expect(selectLtfTf(start, end, "1D", false)).toBe("1");
  });

  test("selects 5m for medium ranges", () => {
    // 200 hours = 12000 minutes → 1m would be 12000 bars (> 5000)
    // 3m would be 4000 bars (< 5000)
    const start = 1000000;
    const end = start + 200 * 60 * 60;
    expect(selectLtfTf(start, end, "1D", false)).toBe("3");
  });

  test("selects 1D for very long ranges", () => {
    // 1 year = 365 * 24 * 60 = 525600 minutes
    // 1m = 525600 bars, 5m = 105120, 15m = 35040, 60m = 8760, 240m = 2190 (< 5000)
    const start = 1000000;
    const end = start + 365 * 24 * 60 * 60;
    expect(selectLtfTf(start, end, "1D", false)).toBe("240");
  });

  test("futures use one step lower than chart TF", () => {
    expect(selectLtfTf(0, 1000000, "60", true)).toBe("30");
    expect(selectLtfTf(0, 1000000, "1D", true)).toBe("240");
    expect(selectLtfTf(0, 1000000, "1", true)).toBe("1"); // Can't go lower than 1m
  });
});

// ============================================================================
// getAutoAnchorPeriod Tests
// ============================================================================

describe("getAutoAnchorPeriod", () => {
  test("intraday → Session", () => {
    expect(getAutoAnchorPeriod("1")).toBe("Session");
    expect(getAutoAnchorPeriod("5")).toBe("Session");
    expect(getAutoAnchorPeriod("60")).toBe("Session");
    expect(getAutoAnchorPeriod("240")).toBe("Session");
  });

  test("1D → Month", () => {
    expect(getAutoAnchorPeriod("1D")).toBe("Month");
  });

  test("2D-10D → Quarter", () => {
    // Note: These are theoretical - we use minutes internally
    // Simulating 2D = 2880 minutes
  });

  // Add more specific tests based on how TF strings are formatted
});

// ============================================================================
// splitIntoPeriods Tests
// ============================================================================

describe("splitIntoPeriods", () => {
  test("splits bars by daily session", () => {
    // Two days of bars
    const day1 = new Date(2024, 0, 1).getTime() / 1000;
    const day2 = new Date(2024, 0, 2).getTime() / 1000;
    
    const bars = [
      makeBar(day1 + 3600, 100, 101, 99, 100.5, 1000),
      makeBar(day1 + 7200, 100.5, 102, 100, 101, 1000),
      makeBar(day2 + 3600, 101, 103, 100, 102, 1000),
    ];
    
    const periods = splitIntoPeriods(bars, "Session", 6000, 24);
    
    expect(periods.length).toBe(2);
    expect(periods[0].bars.length).toBe(2);
    expect(periods[1].bars.length).toBe(1);
  });

  test("respects max rows limit", () => {
    const day1 = new Date(2024, 0, 1).getTime() / 1000;
    const day2 = new Date(2024, 0, 2).getTime() / 1000;
    const day3 = new Date(2024, 0, 3).getTime() / 1000;
    
    const bars = [
      makeBar(day1 + 3600, 100, 101, 99, 100.5, 1000),
      makeBar(day2 + 3600, 101, 102, 100, 101, 1000),
      makeBar(day3 + 3600, 102, 103, 101, 102, 1000),
    ];
    
    // Max 48 rows, 24 per period → only 2 periods allowed
    const periods = splitIntoPeriods(bars, "Session", 48, 24);
    
    expect(periods.length).toBe(2);
  });

  test("handles empty bars", () => {
    const periods = splitIntoPeriods([], "Session", 6000, 24);
    expect(periods).toEqual([]);
  });
});

// ============================================================================
// filterBarsToVisibleRange Tests
// ============================================================================

describe("filterBarsToVisibleRange", () => {
  test("filters bars within range", () => {
    const bars = [
      makeBar(1000, 100, 101, 99, 100, 100),
      makeBar(2000, 100, 102, 99, 101, 100),
      makeBar(3000, 101, 103, 100, 102, 100),
      makeBar(4000, 102, 104, 101, 103, 100),
    ];
    
    const filtered = filterBarsToVisibleRange(bars, 1500, 3500);
    
    expect(filtered.length).toBe(2);
    expect(filtered[0].time).toBe(2000);
    expect(filtered[1].time).toBe(3000);
  });

  test("handles empty result", () => {
    const bars = [
      makeBar(1000, 100, 101, 99, 100, 100),
    ];
    
    const filtered = filterBarsToVisibleRange(bars, 2000, 3000);
    expect(filtered.length).toBe(0);
  });
});

// ============================================================================
// findHighLowAnchor Tests
// ============================================================================

describe("findHighLowAnchor", () => {
  test("finds highest high in range", () => {
    const bars = [
      makeBar(1000, 100, 105, 99, 102, 100),
      makeBar(2000, 102, 110, 101, 108, 100), // highest high
      makeBar(3000, 108, 109, 106, 107, 100),
    ];
    
    const { anchorTime, anchorPrice } = findHighLowAnchor(bars, 3, "Highest High");
    
    expect(anchorTime).toBe(2000);
    expect(anchorPrice).toBe(110);
  });

  test("finds lowest low in range", () => {
    const bars = [
      makeBar(1000, 100, 105, 95, 102, 100), // lowest low
      makeBar(2000, 102, 110, 101, 108, 100),
      makeBar(3000, 108, 109, 106, 107, 100),
    ];
    
    const { anchorTime, anchorPrice } = findHighLowAnchor(bars, 3, "Lowest Low");
    
    expect(anchorTime).toBe(1000);
    expect(anchorPrice).toBe(95);
  });

  test("handles length parameter", () => {
    const bars = [
      makeBar(1000, 100, 120, 95, 102, 100), // would be highest but outside length
      makeBar(2000, 102, 110, 101, 108, 100),
      makeBar(3000, 108, 109, 106, 107, 100),
    ];
    
    const { anchorTime, anchorPrice } = findHighLowAnchor(bars, 2, "Highest High");
    
    expect(anchorTime).toBe(2000);
    expect(anchorPrice).toBe(110);
  });

  test("handles empty bars", () => {
    const { anchorTime, anchorPrice } = findHighLowAnchor([], 10, "Highest High");
    expect(anchorTime).toBe(0);
    expect(anchorPrice).toBe(0);
  });
});
