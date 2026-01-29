/**
 * abcd.ts - ABCD Pattern Geometry Utilities (TV-31.2)
 * 
 * Pure functions for ABCD harmonic pattern calculations.
 * The "AB=CD" relationship: vector AB equals vector CD (scaled by k).
 * 
 * Standard ABCD: k=1 means AB and CD have equal length and direction.
 * Extended ABCD: k≠1 allows for Fibonacci-based extensions (e.g., k=1.272, k=1.618).
 * 
 * Pattern structure:
 *   A ──────> B
 *              \
 *               \
 *                C ──────> D
 * 
 * Where D = C + k*(B - A)
 */

import type { TrendPoint } from "../types";

/** Result of computing point D from A, B, C */
export interface ABCDComputeResult {
  /** Point D computed from AB=CD relationship */
  d: TrendPoint;
  /** Length of AB segment in price units */
  abLen: number;
  /** Length of CD segment in price units */
  cdLen: number;
  /** k factor used (CD = k * AB) */
  k: number;
  /** Time delta from A to B in ms */
  abTimeDelta: number;
  /** Time delta from C to D in ms */
  cdTimeDelta: number;
}

/** Result of solving k from a dragged D position */
export interface ABCDSolveKResult {
  /** Solved k value */
  k: number;
  /** The D position projected onto the valid AB direction line */
  projectedD: TrendPoint;
  /** Whether the drag was valid (D moved in AB direction) */
  valid: boolean;
}

/**
 * Compute point D from points A, B, C using the AB=CD relationship.
 * 
 * Formula: D = C + k * (B - A)
 * 
 * @param a Point A (first swing)
 * @param b Point B (second swing)
 * @param c Point C (third swing)
 * @param k Scale factor (default 1.0 for equal AB and CD)
 * @returns Computed D point and segment lengths
 */
export function computeD(
  a: TrendPoint,
  b: TrendPoint,
  c: TrendPoint,
  k: number = 1.0
): ABCDComputeResult {
  // Vector AB
  const abTimeMs = b.timeMs - a.timeMs;
  const abPrice = b.price - a.price;
  
  // D = C + k * AB
  const d: TrendPoint = {
    timeMs: c.timeMs + k * abTimeMs,
    price: c.price + k * abPrice,
  };
  
  // Compute lengths (Euclidean in price space, time normalized)
  // For simplicity, we use price delta as the primary "length" since
  // that's what traders care about for AB=CD patterns
  const abLen = Math.abs(abPrice);
  const cdLen = Math.abs(k * abPrice);
  
  return {
    d,
    abLen,
    cdLen,
    k,
    abTimeDelta: abTimeMs,
    cdTimeDelta: k * abTimeMs,
  };
}

/**
 * Solve for k given a dragged D position.
 * Projects the dragged D onto the line through C in the AB direction.
 * 
 * This allows users to drag D and have k update meaningfully,
 * rather than breaking the AB=CD relationship entirely.
 * 
 * @param a Point A
 * @param b Point B
 * @param c Point C
 * @param draggedD The position where user dragged D to
 * @returns Solved k and the projected D position
 */
export function solveKFromDraggedD(
  a: TrendPoint,
  b: TrendPoint,
  c: TrendPoint,
  draggedD: TrendPoint
): ABCDSolveKResult {
  // Vector AB
  const abTimeMs = b.timeMs - a.timeMs;
  const abPrice = b.price - a.price;
  
  // Vector CD_dragged (from C to dragged D)
  const cdTimeMs = draggedD.timeMs - c.timeMs;
  const cdPrice = draggedD.price - c.price;
  
  // AB length squared (for projection)
  const abLenSq = abTimeMs * abTimeMs + abPrice * abPrice;
  
  // Handle degenerate case where A and B are the same point
  if (abLenSq < 1e-10) {
    return {
      k: 1.0,
      projectedD: { ...c },
      valid: false,
    };
  }
  
  // Project CD onto AB to find k
  // k = (CD · AB) / (AB · AB)
  const dotProduct = cdTimeMs * abTimeMs + cdPrice * abPrice;
  const k = dotProduct / abLenSq;
  
  // Clamp k to reasonable range (0.1 to 5.0 for practical patterns)
  const clampedK = Math.max(0.1, Math.min(5.0, k));
  
  // Compute the projected D using clamped k
  const projectedD: TrendPoint = {
    timeMs: c.timeMs + clampedK * abTimeMs,
    price: c.price + clampedK * abPrice,
  };
  
  return {
    k: clampedK,
    projectedD,
    valid: k >= 0.1 && k <= 5.0,
  };
}

/**
 * Check if ABCD pattern is bullish (upward) or bearish (downward).
 * Bullish: A < B (price rises from A to B)
 * Bearish: A > B (price falls from A to B)
 */
export function isPatternBullish(a: TrendPoint, b: TrendPoint): boolean {
  return b.price > a.price;
}

/**
 * Compute common Fibonacci k values for ABCD extensions.
 * Standard pattern: k = 1.0
 * Extended patterns: k = 1.272, 1.414, 1.618, 2.0, 2.618
 */
export const ABCD_FIBONACCI_K_VALUES = [
  { k: 0.618, label: "0.618" },
  { k: 0.786, label: "0.786" },
  { k: 1.0, label: "1.0 (AB=CD)" },
  { k: 1.272, label: "1.272" },
  { k: 1.414, label: "1.414" },
  { k: 1.618, label: "1.618" },
  { k: 2.0, label: "2.0" },
  { k: 2.618, label: "2.618" },
] as const;

/**
 * Get the closest Fibonacci k value to a given k.
 */
export function closestFibonacciK(k: number): { k: number; label: string } {
  let closest = ABCD_FIBONACCI_K_VALUES[2]; // Default to 1.0
  let minDist = Math.abs(k - closest.k);
  
  for (const fib of ABCD_FIBONACCI_K_VALUES) {
    const dist = Math.abs(k - fib.k);
    if (dist < minDist) {
      minDist = dist;
      closest = fib;
    }
  }
  
  return closest;
}

/**
 * Format k value for display (e.g., "1.00" or "1.27").
 */
export function formatK(k: number): string {
  return k.toFixed(2);
}

/**
 * Compute all four points for an ABCD pattern.
 * Returns the geometry needed for rendering.
 */
export interface ABCDGeometry {
  a: TrendPoint;
  b: TrendPoint;
  c: TrendPoint;
  d: TrendPoint;
  k: number;
  abLen: number;
  cdLen: number;
  isBullish: boolean;
}

export function computeABCDGeometry(
  a: TrendPoint,
  b: TrendPoint,
  c: TrendPoint,
  k: number = 1.0
): ABCDGeometry {
  const result = computeD(a, b, c, k);
  return {
    a,
    b,
    c,
    d: result.d,
    k: result.k,
    abLen: result.abLen,
    cdLen: result.cdLen,
    isBullish: isPatternBullish(a, b),
  };
}
