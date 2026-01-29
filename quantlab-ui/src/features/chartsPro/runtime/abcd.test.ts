/**
 * abcd.test.ts - Unit tests for ABCD Pattern Geometry (TV-31.2)
 * 
 * Run with: npx vitest run src/features/chartsPro/runtime/abcd.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  computeD,
  solveKFromDraggedD,
  isPatternBullish,
  closestFibonacciK,
  computeABCDGeometry,
  formatK,
} from "./abcd";

describe("ABCD Pattern Geometry", () => {
  // Standard test points
  const A = { timeMs: 1000, price: 100 };
  const B = { timeMs: 2000, price: 120 }; // +1000ms, +20 price (bullish)
  const C = { timeMs: 3000, price: 110 }; // Retracement

  describe("computeD", () => {
    it("computes D with k=1 (standard AB=CD)", () => {
      const result = computeD(A, B, C, 1.0);
      
      // D = C + 1 * (B - A) = (3000, 110) + (1000, 20) = (4000, 130)
      expect(result.d.timeMs).toBe(4000);
      expect(result.d.price).toBe(130);
      expect(result.k).toBe(1.0);
      expect(result.abLen).toBe(20); // |B.price - A.price|
      expect(result.cdLen).toBe(20); // k * abLen
    });

    it("computes D with k=1.5 (extended pattern)", () => {
      const result = computeD(A, B, C, 1.5);
      
      // D = C + 1.5 * (B - A) = (3000, 110) + 1.5*(1000, 20) = (4500, 140)
      expect(result.d.timeMs).toBe(4500);
      expect(result.d.price).toBe(140);
      expect(result.k).toBe(1.5);
      expect(result.cdLen).toBe(30); // 1.5 * 20
    });

    it("computes D with k=0.618 (contracted pattern)", () => {
      const result = computeD(A, B, C, 0.618);
      
      // D = C + 0.618 * (B - A)
      expect(result.d.timeMs).toBeCloseTo(3618, 0);
      expect(result.d.price).toBeCloseTo(122.36, 1);
    });

    it("handles bearish pattern (A > B)", () => {
      const bearishA = { timeMs: 1000, price: 120 };
      const bearishB = { timeMs: 2000, price: 100 }; // Price drops
      const bearishC = { timeMs: 3000, price: 110 };
      
      const result = computeD(bearishA, bearishB, bearishC, 1.0);
      
      // D = (3000, 110) + (1000, -20) = (4000, 90)
      expect(result.d.timeMs).toBe(4000);
      expect(result.d.price).toBe(90);
      expect(result.abLen).toBe(20);
    });

    it("handles zero time delta (vertical pattern)", () => {
      const vertA = { timeMs: 1000, price: 100 };
      const vertB = { timeMs: 1000, price: 120 };
      const vertC = { timeMs: 2000, price: 110 };
      
      const result = computeD(vertA, vertB, vertC, 1.0);
      
      // D = (2000, 110) + (0, 20) = (2000, 130)
      expect(result.d.timeMs).toBe(2000);
      expect(result.d.price).toBe(130);
    });
  });

  describe("solveKFromDraggedD", () => {
    it("solves k=1 when D is dragged to exact AB=CD position", () => {
      const draggedD = { timeMs: 4000, price: 130 }; // Exact D for k=1
      
      const result = solveKFromDraggedD(A, B, C, draggedD);
      
      expect(result.k).toBeCloseTo(1.0, 2);
      expect(result.valid).toBe(true);
    });

    it("solves k=1.5 when D is dragged to extended position", () => {
      const draggedD = { timeMs: 4500, price: 140 }; // D for k=1.5
      
      const result = solveKFromDraggedD(A, B, C, draggedD);
      
      expect(result.k).toBeCloseTo(1.5, 2);
      expect(result.valid).toBe(true);
    });

    it("clamps k to minimum 0.1", () => {
      // Drag D very close to C (would be k~0)
      const draggedD = { timeMs: 3050, price: 111 };
      
      const result = solveKFromDraggedD(A, B, C, draggedD);
      
      expect(result.k).toBe(0.1);
      expect(result.valid).toBe(false);
    });

    it("clamps k to maximum 5.0", () => {
      // Drag D very far (would be k>5)
      const draggedD = { timeMs: 10000, price: 230 };
      
      const result = solveKFromDraggedD(A, B, C, draggedD);
      
      expect(result.k).toBe(5.0);
      expect(result.valid).toBe(false);
    });

    it("projects D onto AB direction when dragged off-axis", () => {
      // Drag D perpendicular to AB direction
      const draggedD = { timeMs: 4000, price: 150 }; // Above the line
      
      const result = solveKFromDraggedD(A, B, C, draggedD);
      
      // Should project to the valid D on the AB direction line
      expect(result.projectedD.timeMs).toBeGreaterThan(C.timeMs);
      expect(result.k).toBeGreaterThan(0);
    });

    it("handles degenerate case where A=B", () => {
      const samePoint = { timeMs: 1000, price: 100 };
      const draggedD = { timeMs: 4000, price: 130 };
      
      const result = solveKFromDraggedD(samePoint, samePoint, C, draggedD);
      
      expect(result.k).toBe(1.0);
      expect(result.valid).toBe(false);
    });
  });

  describe("isPatternBullish", () => {
    it("returns true when B.price > A.price", () => {
      expect(isPatternBullish(A, B)).toBe(true);
    });

    it("returns false when B.price < A.price", () => {
      const bearishB = { timeMs: 2000, price: 80 };
      expect(isPatternBullish(A, bearishB)).toBe(false);
    });

    it("returns false when B.price === A.price", () => {
      const flatB = { timeMs: 2000, price: 100 };
      expect(isPatternBullish(A, flatB)).toBe(false);
    });
  });

  describe("closestFibonacciK", () => {
    it("returns 1.0 for k near 1", () => {
      expect(closestFibonacciK(0.95).k).toBe(1.0);
      expect(closestFibonacciK(1.05).k).toBe(1.0);
    });

    it("returns 1.618 for k near golden ratio", () => {
      expect(closestFibonacciK(1.6).k).toBe(1.618);
      expect(closestFibonacciK(1.65).k).toBe(1.618);
    });

    it("returns 0.618 for k near inverse golden ratio", () => {
      expect(closestFibonacciK(0.6).k).toBe(0.618);
    });

    it("returns 2.618 for large k values", () => {
      expect(closestFibonacciK(2.5).k).toBe(2.618);
    });
  });

  describe("formatK", () => {
    it("formats k with 2 decimal places", () => {
      expect(formatK(1.0)).toBe("1.00");
      expect(formatK(1.618)).toBe("1.62");
      expect(formatK(0.618)).toBe("0.62");
    });
  });

  describe("computeABCDGeometry", () => {
    it("returns complete geometry with all points", () => {
      const geom = computeABCDGeometry(A, B, C, 1.0);
      
      expect(geom.a).toEqual(A);
      expect(geom.b).toEqual(B);
      expect(geom.c).toEqual(C);
      expect(geom.d.timeMs).toBe(4000);
      expect(geom.d.price).toBe(130);
      expect(geom.k).toBe(1.0);
      expect(geom.isBullish).toBe(true);
    });

    it("defaults k to 1.0 when not specified", () => {
      const geom = computeABCDGeometry(A, B, C);
      
      expect(geom.k).toBe(1.0);
    });
  });
});
