/**
 * Indicator QA Tests
 * 
 * Verifies that ALL 23 indicators:
 * 1. Have a manifest entry
 * 2. Have a compute function that runs without errors
 * 3. Produce unique output (not falling back to SMA)
 * 4. Have correct kind throughout the pipeline (no coercion)
 */

import { describe, it, expect, beforeAll } from "vitest";
import type { UTCTimestamp } from "@/lib/lightweightCharts";
import { 
  INDICATOR_MANIFESTS, 
  getIndicatorManifest, 
  isValidIndicatorKind,
  ALL_INDICATOR_KINDS,
} from "./indicatorManifest";
import { computeIndicator, type IndicatorKind as RegistryKind } from "./registryV2";
import type { ComputeBar } from "./compute";

// ============================================================================
// Test Fixture
// ============================================================================

function createTestData(count = 100): ComputeBar[] {
  const baseTime = 1700000000;
  const data: ComputeBar[] = [];
  
  // Create realistic trending + oscillating price data
  let price = 100;
  for (let i = 0; i < count; i++) {
    const trend = i * 0.1; // Slow uptrend
    const noise = Math.sin(i * 0.3) * 5; // Oscillation
    const spike = i % 20 === 0 ? 3 : 0; // Occasional spike
    
    price = 100 + trend + noise + spike;
    const range = 2 + Math.random();
    
    data.push({
      time: (baseTime + i * 86400) as UTCTimestamp,
      open: price - 0.5,
      high: price + range / 2,
      low: price - range / 2,
      close: price,
      volume: 1000000 + Math.random() * 500000,
    });
  }
  
  return data;
}

// ============================================================================
// Manifest Sync Tests
// ============================================================================

describe("Indicator Manifest Sync", () => {
  it("has exactly 23 indicators in manifest", () => {
    expect(INDICATOR_MANIFESTS.length).toBe(23);
  });

  it("ALL_INDICATOR_KINDS matches manifest count", () => {
    expect(ALL_INDICATOR_KINDS.length).toBe(23);
  });

  it("every manifest has required fields", () => {
    for (const manifest of INDICATOR_MANIFESTS) {
      expect(manifest.id).toBeTruthy();
      expect(manifest.name).toBeTruthy();
      expect(manifest.shortName).toBeTruthy();
      expect(manifest.category).toBeTruthy();
      expect(manifest.panePolicy).toMatch(/^(overlay|separate)$/);
      expect(Array.isArray(manifest.inputs)).toBe(true);
      expect(Array.isArray(manifest.outputs)).toBe(true);
      expect(manifest.outputs.length).toBeGreaterThan(0);
    }
  });

  it("isValidIndicatorKind returns true for all manifest IDs", () => {
    for (const manifest of INDICATOR_MANIFESTS) {
      expect(isValidIndicatorKind(manifest.id)).toBe(true);
    }
  });

  it("isValidIndicatorKind returns false for invalid kinds", () => {
    expect(isValidIndicatorKind("invalid")).toBe(false);
    expect(isValidIndicatorKind("sma2")).toBe(false);
    expect(isValidIndicatorKind("")).toBe(false);
  });
});

// ============================================================================
// Compute Pipeline Tests (23/23 Gate)
// ============================================================================

describe("Compute Pipeline - 23/23 Gate", () => {
  const testData = createTestData(100);
  const computeResults = new Map<string, { pts: number; lastValue: number }>();

  // Run compute for all indicators first
  beforeAll(async () => {
    for (const manifest of INDICATOR_MANIFESTS) {
      const indicator = {
        id: `test-${manifest.id}`,
        kind: manifest.id as RegistryKind,
        pane: manifest.panePolicy === "overlay" ? "price" : "separate",
        color: "#2962FF",
        params: {} as Record<string, unknown>,
      };
      
      // Fill in default params from manifest
      for (const input of manifest.inputs) {
        indicator.params[input.key] = input.default;
      }

      try {
        const result = computeIndicator({ indicator, data: testData });
        if (result.lines.length > 0 && result.lines[0].values.length > 0) {
          const values = result.lines[0].values;
          computeResults.set(manifest.id, {
            pts: values.length,
            lastValue: values[values.length - 1].value,
          });
        }
      } catch (e) {
        console.error(`Compute failed for ${manifest.id}:`, e);
      }
    }
  });

  it("all 23 indicators produce compute results", () => {
    expect(computeResults.size).toBe(23);
    
    for (const manifest of INDICATOR_MANIFESTS) {
      const result = computeResults.get(manifest.id);
      expect(result, `${manifest.id} should have compute results`).toBeTruthy();
      expect(result!.pts, `${manifest.id} should have data points`).toBeGreaterThan(0);
    }
  });

  it("compute results maintain correct kind (no coercion)", async () => {
    for (const manifest of INDICATOR_MANIFESTS) {
      const indicator = {
        id: `test-${manifest.id}`,
        kind: manifest.id as RegistryKind,
        pane: manifest.panePolicy === "overlay" ? "price" : "separate",
        color: "#2962FF",
        params: {} as Record<string, unknown>,
      };
      
      for (const input of manifest.inputs) {
        indicator.params[input.key] = input.default;
      }

      const result = computeIndicator({ indicator, data: testData });
      
      // Kind must match - NO coercion to SMA
      expect(result.kind).toBe(manifest.id);
    }
  });

  it("similar indicators produce different outputs (no SMA fallback)", () => {
    // Compare MAs that should be different
    const smaResult = computeResults.get("sma");
    const emaResult = computeResults.get("ema");
    const temaResult = computeResults.get("tema");
    const demaResult = computeResults.get("dema");
    const hmaResult = computeResults.get("hma");
    
    // These should all have results
    expect(smaResult).toBeTruthy();
    expect(emaResult).toBeTruthy();
    expect(temaResult).toBeTruthy();
    expect(demaResult).toBeTruthy();
    expect(hmaResult).toBeTruthy();

    // And they should NOT all be identical (within tolerance)
    const tolerance = 0.001;
    
    // SMA vs EMA should differ
    expect(Math.abs(smaResult!.lastValue - emaResult!.lastValue)).toBeGreaterThan(tolerance);
    
    // TEMA vs DEMA should differ
    expect(Math.abs(temaResult!.lastValue - demaResult!.lastValue)).toBeGreaterThan(tolerance);
    
    // TEMA vs SMA should differ (this catches the fallback bug)
    expect(Math.abs(temaResult!.lastValue - smaResult!.lastValue)).toBeGreaterThan(tolerance);
    
    // HMA vs SMA should differ
    expect(Math.abs(hmaResult!.lastValue - smaResult!.lastValue)).toBeGreaterThan(tolerance);
  });

  it("momentum indicators produce different outputs", () => {
    const rsiResult = computeResults.get("rsi");
    const stochResult = computeResults.get("stoch");
    const cciResult = computeResults.get("cci");
    const rocResult = computeResults.get("roc");
    
    expect(rsiResult).toBeTruthy();
    expect(stochResult).toBeTruthy();
    expect(cciResult).toBeTruthy();
    expect(rocResult).toBeTruthy();

    // RSI is 0-100, CCI can be any value, ROC is percentage - they should differ
    const tolerance = 0.1;
    expect(Math.abs(rsiResult!.lastValue - cciResult!.lastValue)).toBeGreaterThan(tolerance);
    expect(Math.abs(rsiResult!.lastValue - rocResult!.lastValue)).toBeGreaterThan(tolerance);
  });
});

// ============================================================================
// Output Summary (for debugging)
// ============================================================================

describe("Indicator Output Summary", () => {
  it("prints compute results for all indicators (diagnostic)", async () => {
    const testData = createTestData(100);
    const results: Array<{ kind: string; pts: number; lastValue: string }> = [];
    
    for (const manifest of INDICATOR_MANIFESTS) {
      const indicator = {
        id: `test-${manifest.id}`,
        kind: manifest.id as RegistryKind,
        pane: manifest.panePolicy === "overlay" ? "price" : "separate",
        color: "#2962FF",
        params: {} as Record<string, unknown>,
      };
      
      for (const input of manifest.inputs) {
        indicator.params[input.key] = input.default;
      }

      try {
        const result = computeIndicator({ indicator, data: testData });
        if (result.lines.length > 0 && result.lines[0].values.length > 0) {
          const values = result.lines[0].values;
          results.push({
            kind: manifest.id,
            pts: values.length,
            lastValue: values[values.length - 1].value.toFixed(4),
          });
        } else {
          results.push({
            kind: manifest.id,
            pts: 0,
            lastValue: "N/A",
          });
        }
      } catch (e) {
        results.push({
          kind: manifest.id,
          pts: -1,
          lastValue: `ERROR: ${e}`,
        });
      }
    }

    // Log summary table
    console.log("\n=== INDICATOR QA SUMMARY ===");
    console.log("| Kind       | Pts | Last Value |");
    console.log("|------------|-----|------------|");
    for (const r of results) {
      console.log(`| ${r.kind.padEnd(10)} | ${String(r.pts).padStart(3)} | ${r.lastValue.padStart(10)} |`);
    }
    console.log("============================\n");

    // All should have results
    const failed = results.filter(r => r.pts <= 0);
    expect(failed.length).toBe(0);
  });
});
