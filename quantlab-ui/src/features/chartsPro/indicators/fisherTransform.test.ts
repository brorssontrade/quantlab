/**
 * Fisher Transform Parity Test
 * 
 * This test verifies that computeFisherTransform produces values that match
 * the TradingView/Ehlers reference implementation bar-for-bar.
 * 
 * TradingView Pine Script reference:
 *   hl2 = (high + low) / 2
 *   highestHl2 = ta.highest(hl2, length)
 *   lowestHl2 = ta.lowest(hl2, length)
 *   value := 0.33 * 2 * ((hl2 - lowestHl2) / (highestHl2 - lowestHl2) - 0.5) + 0.67 * nz(value[1])
 *   value := math.max(math.min(value, 0.999), -0.999)
 *   fisher := 0.5 * math.log((1 + value) / (1 - value)) + 0.5 * nz(fisher[1])
 *   trigger := fisher[1]
 */

import { describe, it, expect } from "vitest";
import { computeFisherTransform } from "./compute";

// Fixed OHLC dataset for deterministic testing (20 bars)
// Based on realistic price movements
const REFERENCE_OHLC = [
  { time: 1, open: 100.00, high: 101.50, low: 99.50, close: 101.00, volume: 1000 },
  { time: 2, open: 101.00, high: 102.00, low: 100.50, close: 101.75, volume: 1100 },
  { time: 3, open: 101.75, high: 103.00, low: 101.25, close: 102.50, volume: 1200 },
  { time: 4, open: 102.50, high: 103.50, low: 102.00, close: 103.25, volume: 1300 },
  { time: 5, open: 103.25, high: 104.00, low: 102.75, close: 103.00, volume: 1150 },
  { time: 6, open: 103.00, high: 103.50, low: 101.50, close: 102.00, volume: 1400 },
  { time: 7, open: 102.00, high: 102.50, low: 100.00, close: 100.50, volume: 1600 },
  { time: 8, open: 100.50, high: 101.00, low: 99.00, close: 99.50, volume: 1800 },
  { time: 9, open: 99.50, high: 100.50, low: 98.50, close: 100.00, volume: 1500 },
  { time: 10, open: 100.00, high: 101.50, low: 99.50, close: 101.25, volume: 1300 },
  { time: 11, open: 101.25, high: 102.00, low: 100.75, close: 101.50, volume: 1200 },
  { time: 12, open: 101.50, high: 102.50, low: 101.00, close: 102.25, volume: 1100 },
  { time: 13, open: 102.25, high: 103.00, low: 101.75, close: 102.00, volume: 1050 },
  { time: 14, open: 102.00, high: 102.75, low: 101.25, close: 102.50, volume: 1000 },
  { time: 15, open: 102.50, high: 103.50, low: 102.25, close: 103.00, volume: 1100 },
  { time: 16, open: 103.00, high: 104.00, low: 102.50, close: 103.75, volume: 1200 },
  { time: 17, open: 103.75, high: 104.50, low: 103.25, close: 104.00, volume: 1300 },
  { time: 18, open: 104.00, high: 104.75, low: 103.50, close: 104.25, volume: 1250 },
  { time: 19, open: 104.25, high: 105.00, low: 103.75, close: 104.00, volume: 1150 },
  { time: 20, open: 104.00, high: 104.50, low: 103.00, close: 103.50, volume: 1100 },
];

/**
 * Reference implementation matching TradingView Pine Script exactly
 * This is the "truth" we're comparing against
 */
function referenceFisherTransform(data: typeof REFERENCE_OHLC, length: number = 9) {
  const results: { fisher: number; trigger: number }[] = [];
  
  // Calculate HL2 for all bars
  const hl2Values = data.map(bar => (bar.high + bar.low) / 2);
  
  let value = 0;  // nz(value[1]) starts at 0
  let fish = 0;   // nz(fisher[1]) starts at 0
  let prevFish = 0;
  
  for (let i = 0; i < data.length; i++) {
    if (i < length - 1) {
      results.push({ fisher: NaN, trigger: NaN });
      continue;
    }
    
    // Find highest and lowest HL2 over lookback
    let highestHl2 = -Infinity;
    let lowestHl2 = Infinity;
    for (let j = i - length + 1; j <= i; j++) {
      if (hl2Values[j] > highestHl2) highestHl2 = hl2Values[j];
      if (hl2Values[j] < lowestHl2) lowestHl2 = hl2Values[j];
    }
    
    // Calculate ratio
    let ratio: number;
    if (highestHl2 === lowestHl2) {
      ratio = 0.5;
    } else {
      ratio = (hl2Values[i] - lowestHl2) / (highestHl2 - lowestHl2);
    }
    
    // value := 0.33 * 2 * (ratio - 0.5) + 0.67 * nz(value[1])
    value = 0.66 * (ratio - 0.5) + 0.67 * value;
    
    // Clamp
    if (value > 0.999) value = 0.999;
    if (value < -0.999) value = -0.999;
    
    // fisher := 0.5 * ln((1 + value) / (1 - value)) + 0.5 * nz(fisher[1])
    fish = 0.5 * Math.log((1 + value) / (1 - value)) + 0.5 * fish;
    
    // trigger := fisher[1]
    const trigger = i === length - 1 ? NaN : prevFish;
    
    results.push({ fisher: fish, trigger });
    prevFish = fish;
  }
  
  return results;
}

describe("Fisher Transform Parity", () => {
  it("should match reference implementation bar-for-bar", () => {
    const length = 9;
    
    // Compute using our implementation
    const ourResult = computeFisherTransform(REFERENCE_OHLC as any, length);
    
    // Compute using reference implementation
    const refResult = referenceFisherTransform(REFERENCE_OHLC, length);
    
    // Both should have same length
    expect(ourResult.fisher.length).toBe(refResult.length);
    expect(ourResult.trigger.length).toBe(refResult.length);
    
    // Compare bar-by-bar with high precision
    for (let i = 0; i < refResult.length; i++) {
      const ref = refResult[i];
      const ourFisher = ourResult.fisher[i].value;
      const ourTrigger = ourResult.trigger[i].value;
      
      if (Number.isNaN(ref.fisher)) {
        expect(Number.isNaN(ourFisher)).toBe(true);
      } else {
        // Match within 1e-10 precision
        expect(ourFisher).toBeCloseTo(ref.fisher, 10);
      }
      
      if (Number.isNaN(ref.trigger)) {
        expect(Number.isNaN(ourTrigger)).toBe(true);
      } else {
        expect(ourTrigger).toBeCloseTo(ref.trigger, 10);
      }
    }
  });
  
  it("should produce reasonable Fisher values (typically between -3 and 3)", () => {
    const result = computeFisherTransform(REFERENCE_OHLC as any, 9);
    
    const validFisher = result.fisher
      .filter(p => Number.isFinite(p.value))
      .map(p => p.value);
    
    // Fisher values should be bounded (not diverging to infinity)
    validFisher.forEach(v => {
      expect(v).toBeGreaterThan(-5);
      expect(v).toBeLessThan(5);
    });
    
    // Average should be reasonably centered
    const avg = validFisher.reduce((a, b) => a + b, 0) / validFisher.length;
    expect(avg).toBeGreaterThan(-2);
    expect(avg).toBeLessThan(2);
  });
  
  it("should handle division by zero (when high == low)", () => {
    // Create data where some bars have high == low
    const flatData = [
      { time: 1, open: 100, high: 100, low: 100, close: 100, volume: 1000 },
      { time: 2, open: 100, high: 100, low: 100, close: 100, volume: 1000 },
      { time: 3, open: 100, high: 100, low: 100, close: 100, volume: 1000 },
      { time: 4, open: 100, high: 100, low: 100, close: 100, volume: 1000 },
      { time: 5, open: 100, high: 100, low: 100, close: 100, volume: 1000 },
      { time: 6, open: 100, high: 100, low: 100, close: 100, volume: 1000 },
      { time: 7, open: 100, high: 100, low: 100, close: 100, volume: 1000 },
      { time: 8, open: 100, high: 100, low: 100, close: 100, volume: 1000 },
      { time: 9, open: 100, high: 100, low: 100, close: 100, volume: 1000 },
      { time: 10, open: 100, high: 100, low: 100, close: 100, volume: 1000 },
    ];
    
    const result = computeFisherTransform(flatData as any, 9);
    
    // Should not throw or produce NaN/Infinity for valid bars
    const validFisher = result.fisher.filter(p => Number.isFinite(p.value));
    expect(validFisher.length).toBeGreaterThan(0);
    
    // When all HL2 are the same, ratio is 0.5, value approaches 0
    // So Fisher should be near 0
    const lastFisher = result.fisher[result.fisher.length - 1].value;
    expect(Math.abs(lastFisher)).toBeLessThan(0.5);
  });
  
  it("trigger should equal previous bar's Fisher", () => {
    const result = computeFisherTransform(REFERENCE_OHLC as any, 9);
    
    // For each bar after warmup+1, trigger should equal previous Fisher
    for (let i = 10; i < result.fisher.length; i++) {
      const currentTrigger = result.trigger[i].value;
      const prevFisher = result.fisher[i - 1].value;
      
      if (Number.isFinite(currentTrigger) && Number.isFinite(prevFisher)) {
        expect(currentTrigger).toBeCloseTo(prevFisher, 10);
      }
    }
  });
  
  it("first valid Fisher bar should have NaN trigger", () => {
    const result = computeFisherTransform(REFERENCE_OHLC as any, 9);
    
    // Bar 8 (index 8, length-1) is first valid Fisher bar
    // Its trigger should be NaN (no previous Fisher exists)
    const firstValidIndex = 8; // length - 1
    expect(Number.isFinite(result.fisher[firstValidIndex].value)).toBe(true);
    expect(Number.isNaN(result.trigger[firstValidIndex].value)).toBe(true);
    
    // Bar 9 should have valid trigger = bar 8's Fisher
    expect(Number.isFinite(result.trigger[9].value)).toBe(true);
    expect(result.trigger[9].value).toBeCloseTo(result.fisher[8].value, 10);
  });
});

// Log reference values for manual verification
describe("Fisher Transform Reference Values", () => {
  it("should print last 5 bars for manual comparison with TradingView", () => {
    const result = computeFisherTransform(REFERENCE_OHLC as any, 9);
    const ref = referenceFisherTransform(REFERENCE_OHLC, 9);
    
    console.log("\n=== Fisher Transform Reference Values (last 5 bars) ===");
    for (let i = 15; i < 20; i++) {
      console.log(`Bar ${i + 1}: Fisher=${result.fisher[i].value.toFixed(6)}, Trigger=${result.trigger[i].value.toFixed(6)}`);
    }
    console.log("========================================================\n");
    
    // Just to make the test pass
    expect(true).toBe(true);
  });
});
