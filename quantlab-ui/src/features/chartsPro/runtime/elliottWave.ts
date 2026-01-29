/**
 * elliottWave.ts - Elliott Wave Impulse Pattern Geometry Utilities (TV-33.2)
 *
 * Pure functions for Elliott Wave Impulse pattern calculations.
 * 
 * Elliott Wave Impulse structure (5 waves, 6 points):
 *
 *               3
 *              /\        5
 *             /  \      /\
 *            /    \    /  \
 *           /      \  4    
 *          /        \/     
 *         1
 *        /
 *       /
 *      0
 *
 * Points: 0 → 1 → 2 → 3 → 4 → 5
 * - Wave 1: 0 → 1 (initial impulse)
 * - Wave 2: 1 → 2 (correction, cannot retrace below 0)
 * - Wave 3: 2 → 3 (strongest impulse, cannot be shortest of 1, 3, 5)
 * - Wave 4: 3 → 4 (correction, cannot overlap wave 1 territory)
 * - Wave 5: 4 → 5 (final impulse)
 *
 * Bullish impulse: p1 > p0 (trending up)
 * Bearish impulse: p1 < p0 (trending down)
 */

import type { TrendPoint } from "../types";

/** Point with x (timeMs) and y (price) for geometry calculations */
export interface Point {
  x: number;  // timeMs
  y: number;  // price
}

/** Handle info for Elliott Wave pattern */
export interface ElliottWaveHandle {
  label: string;
  x: number;
  y: number;
  waveNumber: number;  // 0-5
}

/** Result of Elliott Wave geometry computation */
export interface ElliottWaveGeometry {
  /** All 6 points in order (0-5) */
  points: Point[];
  /** Whether this is a bullish (up) or bearish (down) impulse */
  direction: "bullish" | "bearish";
  /** Wave segments for rendering */
  segments: Array<{ from: Point; to: Point; waveNum: number }>;
  /** Handle positions with labels */
  handles: ElliottWaveHandle[];
}

/**
 * Convert TrendPoint to Point for calculations
 */
export function trendPointToPoint(tp: TrendPoint): Point {
  return { x: tp.timeMs, y: tp.price };
}

/**
 * Determine if an Elliott Wave impulse is bullish (up) or bearish (down)
 * 
 * Bullish: Wave 1 moves up (p1.price > p0.price)
 * Bearish: Wave 1 moves down (p1.price < p0.price)
 */
export function isImpulseBullish(
  p0: TrendPoint | Point,
  p1: TrendPoint | Point
): boolean {
  const p0Price = 'y' in p0 ? p0.y : p0.price;
  const p1Price = 'y' in p1 ? p1.y : p1.price;
  return p1Price > p0Price;
}

/**
 * Get the direction of an Elliott Wave impulse
 */
export function getImpulseDirection(
  p0: TrendPoint | Point,
  p1: TrendPoint | Point
): "bullish" | "bearish" {
  return isImpulseBullish(p0, p1) ? "bullish" : "bearish";
}

/**
 * Compute Elliott Wave geometry from the 6 points
 */
export function computeElliottWaveGeometry(
  p0: TrendPoint,
  p1: TrendPoint,
  p2: TrendPoint,
  p3: TrendPoint,
  p4: TrendPoint,
  p5: TrendPoint
): ElliottWaveGeometry {
  const points: Point[] = [
    trendPointToPoint(p0),
    trendPointToPoint(p1),
    trendPointToPoint(p2),
    trendPointToPoint(p3),
    trendPointToPoint(p4),
    trendPointToPoint(p5),
  ];

  const direction = getImpulseDirection(p0, p1);

  // Create wave segments
  const segments = [
    { from: points[0], to: points[1], waveNum: 1 },
    { from: points[1], to: points[2], waveNum: 2 },
    { from: points[2], to: points[3], waveNum: 3 },
    { from: points[3], to: points[4], waveNum: 4 },
    { from: points[4], to: points[5], waveNum: 5 },
  ];

  // Create handles with wave labels
  const handles: ElliottWaveHandle[] = points.map((p, i) => ({
    label: String(i),
    x: p.x,
    y: p.y,
    waveNumber: i,
  }));

  return {
    points,
    direction,
    segments,
    handles,
  };
}

/**
 * Compute handle positions for Elliott Wave pattern in pixel coordinates
 * Used by DrawingLayer for handlesPx export
 */
export function computeElliottWaveHandles(
  drawing: {
    p0: TrendPoint;
    p1: TrendPoint;
    p2: TrendPoint;
    p3: TrendPoint;
    p4: TrendPoint;
    p5: TrendPoint;
  },
  timeScale: { timeToCoordinate: (time: number) => number | null },
  priceScale: { priceToCoordinate: (price: number) => number | null }
): Array<{ label: string; x: number; y: number }> {
  const points = [drawing.p0, drawing.p1, drawing.p2, drawing.p3, drawing.p4, drawing.p5];
  const labels = ["0", "1", "2", "3", "4", "5"];
  
  const handles: Array<{ label: string; x: number; y: number }> = [];
  
  for (let i = 0; i < points.length; i++) {
    const x = timeScale.timeToCoordinate(points[i].timeMs);
    const y = priceScale.priceToCoordinate(points[i].price);
    if (x != null && y != null) {
      handles.push({ label: labels[i], x, y });
    }
  }
  
  return handles;
}

/**
 * Validate Elliott Wave rules (informational, not enforced)
 * Returns array of rule violations for UI display
 */
export function validateElliottWaveRules(
  p0: TrendPoint,
  p1: TrendPoint,
  p2: TrendPoint,
  p3: TrendPoint,
  p4: TrendPoint,
  p5: TrendPoint
): string[] {
  const violations: string[] = [];
  const isBullish = isImpulseBullish(p0, p1);
  
  // Rule 1: Wave 2 cannot retrace beyond start of wave 1 (point 0)
  if (isBullish) {
    if (p2.price < p0.price) {
      violations.push("Wave 2 retraces below wave 0 origin");
    }
  } else {
    if (p2.price > p0.price) {
      violations.push("Wave 2 retraces above wave 0 origin");
    }
  }
  
  // Rule 2: Wave 4 cannot overlap wave 1 territory
  if (isBullish) {
    // In bullish, wave 4 low should not go below wave 1 high
    if (p4.price < p1.price) {
      violations.push("Wave 4 overlaps wave 1 territory");
    }
  } else {
    // In bearish, wave 4 high should not go above wave 1 low
    if (p4.price > p1.price) {
      violations.push("Wave 4 overlaps wave 1 territory");
    }
  }
  
  // Rule 3: Wave 3 cannot be the shortest of waves 1, 3, and 5
  const wave1Len = Math.abs(p1.price - p0.price);
  const wave3Len = Math.abs(p3.price - p2.price);
  const wave5Len = Math.abs(p5.price - p4.price);
  
  if (wave3Len < wave1Len && wave3Len < wave5Len) {
    violations.push("Wave 3 is the shortest impulse wave");
  }
  
  return violations;
}

/**
 * Get label offset direction based on pattern direction
 * For bullish: impulse waves (1,3,5) labels go above, correction (2,4) below
 * For bearish: opposite
 */
export function getLabelOffset(
  waveNumber: number,
  direction: "bullish" | "bearish",
  baseOffset: number = 14
): number {
  const isImpulseWave = waveNumber === 1 || waveNumber === 3 || waveNumber === 5;
  
  if (direction === "bullish") {
    // Bullish: impulse peaks above (negative offset), corrections below (positive)
    return isImpulseWave ? -baseOffset : baseOffset;
  } else {
    // Bearish: impulse troughs below (positive offset), corrections above (negative)
    return isImpulseWave ? baseOffset : -baseOffset;
  }
}
