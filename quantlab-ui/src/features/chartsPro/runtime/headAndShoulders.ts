/**
 * headAndShoulders.ts - Head and Shoulders Pattern Geometry Utilities (TV-32.2)
 *
 * Pure functions for Head & Shoulders pattern calculations.
 * 
 * Pattern structure (5 points):
 * - p1: Left Shoulder (LS) - first peak/trough
 * - p2: Head (H) - highest peak (bearish) or lowest trough (inverse)
 * - p3: Right Shoulder (RS) - third peak/trough, typically similar height to LS
 * - p4: Neckline point 1 (NL1) - typically at left trough between LS and Head
 * - p5: Neckline point 2 (NL2) - typically at right trough between Head and RS
 *
 * Classic bearish H&S: LS < Head && RS < Head (Head is highest)
 * Inverse bullish H&S: LS > Head && RS > Head (Head is lowest)
 */

import type { TrendPoint } from "../types";

/** Point with x (timeMs) and y (price) for geometry calculations */
export interface Point {
  x: number;  // timeMs
  y: number;  // price
}

/** Result of H&S geometry computation */
export interface HSGeometry {
  /** Left Shoulder */
  LS: Point;
  /** Head */
  Head: Point;
  /** Right Shoulder */
  RS: Point;
  /** Neckline point 1 */
  NL1: Point;
  /** Neckline point 2 */
  NL2: Point;
  /** Whether this is an inverse (bullish) pattern */
  isInverse: boolean;
  /** Neckline slope: (NL2.y - NL1.y) / (NL2.x - NL1.x) */
  necklineSlope: number;
  /** Target price based on pattern height from neckline */
  targetPrice: number;
  /** Pattern height (distance from head to neckline) */
  patternHeight: number;
}

/**
 * Convert TrendPoint to Point for calculations
 */
export function trendPointToPoint(tp: TrendPoint): Point {
  return { x: tp.timeMs, y: tp.price };
}

/**
 * Compute the price on the neckline at a given time
 * Neckline is the line through NL1 and NL2
 */
export function getNecklinePriceAt(NL1: Point, NL2: Point, timeMs: number): number {
  if (NL2.x === NL1.x) {
    // Vertical neckline (edge case) - return average
    return (NL1.y + NL2.y) / 2;
  }
  const slope = (NL2.y - NL1.y) / (NL2.x - NL1.x);
  return NL1.y + slope * (timeMs - NL1.x);
}

/**
 * Determine if a Head & Shoulders pattern is inverse (bullish) or normal (bearish)
 * 
 * Normal (bearish/top): Head is the highest point (Head.price > LS.price && Head.price > RS.price)
 * Inverse (bullish/bottom): Head is the lowest point (Head.price < LS.price && Head.price < RS.price)
 * 
 * Accepts either Point objects (x, y) or TrendPoint objects (timeMs, price)
 */
export function isPatternInverse(
  LS: Point | { price: number },
  Head: Point | { price: number },
  RS: Point | { price: number }
): boolean {
  // Support both Point (y) and TrendPoint (price) formats
  const lsPrice = 'y' in LS ? LS.y : LS.price;
  const headPrice = 'y' in Head ? Head.y : Head.price;
  const rsPrice = 'y' in RS ? RS.y : RS.price;
  
  // Inverse if head is lower than both shoulders
  return headPrice < lsPrice && headPrice < rsPrice;
}

/**
 * Calculate target price based on pattern height
 * 
 * Target = Neckline price at RS.x ± Pattern height
 * - For bearish (normal): target below neckline
 * - For inverse (bullish): target above neckline
 */
export function calculateTargetPrice(
  Head: Point,
  RS: Point,
  NL1: Point,
  NL2: Point,
  isInverse: boolean
): number {
  // Get neckline price at the head's time position
  const necklinePriceAtHead = getNecklinePriceAt(NL1, NL2, Head.x);
  
  // Pattern height is distance from head to neckline
  const patternHeight = Math.abs(Head.y - necklinePriceAtHead);
  
  // Get neckline price at RS (breakout point)
  const necklinePriceAtRS = getNecklinePriceAt(NL1, NL2, RS.x);
  
  // Target is pattern height projected from neckline in opposite direction of head
  if (isInverse) {
    // Bullish: target above neckline
    return necklinePriceAtRS + patternHeight;
  } else {
    // Bearish: target below neckline
    return necklinePriceAtRS - patternHeight;
  }
}

/**
 * Compute full H&S geometry from 5 TrendPoints
 */
export function computeHSGeometry(
  p1: TrendPoint, // LS
  p2: TrendPoint, // Head
  p3: TrendPoint, // RS
  p4: TrendPoint, // NL1
  p5: TrendPoint  // NL2
): HSGeometry {
  const LS = trendPointToPoint(p1);
  const Head = trendPointToPoint(p2);
  const RS = trendPointToPoint(p3);
  const NL1 = trendPointToPoint(p4);
  const NL2 = trendPointToPoint(p5);
  
  const isInverse = isPatternInverse(LS, Head, RS);
  
  // Neckline slope
  const necklineSlope = NL2.x === NL1.x ? 0 : (NL2.y - NL1.y) / (NL2.x - NL1.x);
  
  // Pattern height
  const necklinePriceAtHead = getNecklinePriceAt(NL1, NL2, Head.x);
  const patternHeight = Math.abs(Head.y - necklinePriceAtHead);
  
  // Target price
  const targetPrice = calculateTargetPrice(Head, RS, NL1, NL2, isInverse);
  
  return {
    LS,
    Head,
    RS,
    NL1,
    NL2,
    isInverse,
    necklineSlope,
    targetPrice,
    patternHeight,
  };
}

/**
 * Validate H&S pattern geometry
 * Returns true if the pattern makes visual sense
 */
export function isValidHSPattern(
  LS: Point,
  Head: Point,
  RS: Point,
  _NL1: Point,
  _NL2: Point
): boolean {
  // Basic temporal ordering: LS < Head < RS (time-wise)
  if (LS.x >= Head.x || Head.x >= RS.x) {
    return false;
  }
  
  // Head should be extreme (highest for bearish, lowest for bullish)
  const isInverse = isPatternInverse(LS, Head, RS);
  if (isInverse) {
    // Inverse: Head should be the lowest
    if (Head.y >= LS.y || Head.y >= RS.y) {
      return false;
    }
  } else {
    // Normal: Head should be the highest
    if (Head.y <= LS.y || Head.y <= RS.y) {
      return false;
    }
  }
  
  // Shoulders should be reasonably balanced (within 50% of each other relative to head)
  const lsDistFromHead = Math.abs(Head.y - LS.y);
  const rsDistFromHead = Math.abs(Head.y - RS.y);
  const ratio = Math.min(lsDistFromHead, rsDistFromHead) / Math.max(lsDistFromHead, rsDistFromHead);
  if (ratio < 0.3) {
    // Very unbalanced shoulders - still valid but maybe less ideal
    // We allow it but could add a warning
  }
  
  return true;
}

/**
 * Format pattern type for display
 */
export function formatPatternType(isInverse: boolean): string {
  return isInverse ? "Inverse H&S (Bullish)" : "H&S (Bearish)";
}

/**
 * Get all handle labels for H&S pattern
 */
export const HS_HANDLE_LABELS = ["LS", "Head", "RS", "NL1", "NL2"] as const;
export type HSHandleLabel = typeof HS_HANDLE_LABELS[number];
