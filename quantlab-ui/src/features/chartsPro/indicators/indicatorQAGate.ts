/**
 * INDICATOR RUNTIME QA GATE
 * 
 * End-to-end validation that 23/23 indicators are working correctly.
 * Validates:
 * 1. Kind-integrity: result.kind === instance.kind
 * 2. Output-shape: manifest.outputs.length matches result.lines.length
 * 3. Anti-SMA-diff: MA variants produce different values from SMA
 * 
 * Run this in dev console or as a test to verify indicator integrity.
 */

import { 
  ALL_INDICATOR_KINDS, 
  getIndicatorManifest, 
  isValidIndicatorKind,
  type IndicatorKind 
} from "./indicatorManifest";
import { computeIndicator, type ComputeBar, type IndicatorWorkerResponse } from "./registryV2";

// ============================================================================
// Test Data Generator
// ============================================================================

/**
 * Generate mock OHLCV data for testing
 */
function generateMockData(length: number = 100): ComputeBar[] {
  const bars: ComputeBar[] = [];
  let price = 100;
  const now = Date.now();
  
  for (let i = 0; i < length; i++) {
    // Create some price movement
    const change = (Math.random() - 0.5) * 4;
    price = Math.max(10, price + change);
    
    const open = price;
    const close = price + (Math.random() - 0.5) * 2;
    const high = Math.max(open, close) + Math.random() * 1;
    const low = Math.min(open, close) - Math.random() * 1;
    const volume = Math.floor(100000 + Math.random() * 50000);
    
    bars.push({
      time: Math.floor((now - (length - i) * 86400000) / 1000) as any,
      open,
      high,
      low,
      close,
      volume,
    });
  }
  
  return bars;
}

// ============================================================================
// QA Gate Results
// ============================================================================

export interface QAResult {
  kind: IndicatorKind;
  passed: boolean;
  checks: {
    kindIntegrity: { passed: boolean; message: string };
    outputShape: { passed: boolean; expected: number; actual: number; message: string };
    hasValues: { passed: boolean; pointCount: number; message: string };
    antiSmaDiff?: { passed: boolean; smaValue: number | null; thisValue: number | null; diff: number; message: string };
  };
  error?: string;
}

export interface QAGateSummary {
  totalIndicators: number;
  passed: number;
  failed: number;
  results: QAResult[];
  smaReferenceValue: number | null;
  timestamp: string;
}

// ============================================================================
// QA Gate Implementation
// ============================================================================

/**
 * Run QA gate for all indicators
 */
export function runIndicatorQAGate(customData?: ComputeBar[]): QAGateSummary {
  const data = customData ?? generateMockData(200);
  const results: QAResult[] = [];
  let smaReferenceValue: number | null = null;
  
  // First compute SMA as reference
  try {
    const smaResult = computeIndicator("sma", { period: 20 }, data);
    const smaValues = smaResult.lines?.[0]?.values ?? [];
    smaReferenceValue = smaValues.length > 0 ? smaValues[smaValues.length - 1].value : null;
  } catch (e) {
    console.error("Failed to compute SMA reference:", e);
  }
  
  // Test each indicator
  for (const kind of ALL_INDICATOR_KINDS) {
    const result = validateIndicator(kind, data, smaReferenceValue);
    results.push(result);
  }
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  return {
    totalIndicators: ALL_INDICATOR_KINDS.length,
    passed,
    failed,
    results,
    smaReferenceValue,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validate a single indicator
 */
function validateIndicator(
  kind: IndicatorKind, 
  data: ComputeBar[],
  smaReferenceValue: number | null
): QAResult {
  const manifest = getIndicatorManifest(kind);
  
  if (!manifest) {
    return {
      kind,
      passed: false,
      checks: {
        kindIntegrity: { passed: false, message: "No manifest found" },
        outputShape: { passed: false, expected: 0, actual: 0, message: "No manifest" },
        hasValues: { passed: false, pointCount: 0, message: "No manifest" },
      },
      error: `No manifest found for kind: ${kind}`,
    };
  }
  
  // Get default params from manifest
  const defaultParams: Record<string, number> = {};
  for (const input of manifest.inputs) {
    if (typeof input.default === "number") {
      defaultParams[input.key] = input.default;
    }
  }
  
  let computeResult: IndicatorWorkerResponse;
  try {
    computeResult = computeIndicator(kind, defaultParams, data);
  } catch (e) {
    return {
      kind,
      passed: false,
      checks: {
        kindIntegrity: { passed: false, message: "Compute threw exception" },
        outputShape: { passed: false, expected: manifest.outputs.length, actual: 0, message: "Compute failed" },
        hasValues: { passed: false, pointCount: 0, message: "Compute failed" },
      },
      error: String(e),
    };
  }
  
  // Check 1: Kind integrity
  const kindCheck = {
    passed: computeResult.kind === kind,
    message: computeResult.kind === kind 
      ? `Kind matches: ${kind}` 
      : `KIND MISMATCH! Expected ${kind}, got ${computeResult.kind}`,
  };
  
  // Check 2: Output shape
  const expectedOutputs = manifest.outputs.length;
  const actualOutputs = computeResult.lines?.length ?? 0;
  const shapeCheck = {
    passed: actualOutputs >= expectedOutputs,
    expected: expectedOutputs,
    actual: actualOutputs,
    message: actualOutputs >= expectedOutputs
      ? `Outputs match: ${actualOutputs}/${expectedOutputs}`
      : `OUTPUT MISMATCH! Expected ${expectedOutputs}, got ${actualOutputs}`,
  };
  
  // Check 3: Has values
  const primaryLine = computeResult.lines?.[0];
  const pointCount = primaryLine?.values?.length ?? 0;
  const MIN_POINTS = 10; // Should have at least some computed points
  const hasValuesCheck = {
    passed: pointCount >= MIN_POINTS,
    pointCount,
    message: pointCount >= MIN_POINTS
      ? `Has ${pointCount} computed points`
      : `INSUFFICIENT DATA! Only ${pointCount} points (need ${MIN_POINTS}+)`,
  };
  
  // Check 4: Anti-SMA diff (only for MA variants)
  const MA_KINDS: IndicatorKind[] = ["sma", "ema", "smma", "wma", "dema", "tema", "hma", "kama", "vwma", "mcginley"];
  let antiSmaDiff: QAResult["checks"]["antiSmaDiff"];
  
  if (MA_KINDS.includes(kind) && kind !== "sma" && smaReferenceValue !== null) {
    const thisValues = computeResult.lines?.[0]?.values ?? [];
    const thisLastValue = thisValues.length > 0 ? thisValues[thisValues.length - 1].value : null;
    const diff = thisLastValue !== null ? Math.abs(thisLastValue - smaReferenceValue) : 0;
    
    // If diff is very small relative to value, it might be a fallback
    const SUSPICIOUS_THRESHOLD = 0.001; // 0.1% difference
    const relDiff = smaReferenceValue !== 0 ? diff / Math.abs(smaReferenceValue) : diff;
    const isSuspicious = thisLastValue !== null && relDiff < SUSPICIOUS_THRESHOLD;
    
    antiSmaDiff = {
      passed: !isSuspicious,
      smaValue: smaReferenceValue,
      thisValue: thisLastValue,
      diff: relDiff * 100, // as percentage
      message: isSuspicious
        ? `SUSPICIOUS! ${kind.toUpperCase()} value (${thisLastValue?.toFixed(4)}) nearly identical to SMA (${smaReferenceValue?.toFixed(4)}) - possible fallback!`
        : `${kind.toUpperCase()} differs from SMA by ${(relDiff * 100).toFixed(2)}%`,
    };
  }
  
  // Overall pass/fail
  const allChecksPassed = kindCheck.passed && 
                          shapeCheck.passed && 
                          hasValuesCheck.passed &&
                          (antiSmaDiff?.passed ?? true);
  
  return {
    kind,
    passed: allChecksPassed,
    checks: {
      kindIntegrity: kindCheck,
      outputShape: shapeCheck,
      hasValues: hasValuesCheck,
      antiSmaDiff,
    },
  };
}

// ============================================================================
// Console Reporter
// ============================================================================

/**
 * Print QA gate results to console with colors
 */
export function printQAGateResults(summary: QAGateSummary): void {
  console.group("🔬 INDICATOR QA GATE RESULTS");
  console.log(`Timestamp: ${summary.timestamp}`);
  console.log(`Total: ${summary.totalIndicators} | ✅ Passed: ${summary.passed} | ❌ Failed: ${summary.failed}`);
  console.log(`SMA Reference Value: ${summary.smaReferenceValue?.toFixed(4) ?? "N/A"}`);
  console.log("");
  
  // Group by status
  const passed = summary.results.filter(r => r.passed);
  const failed = summary.results.filter(r => !r.passed);
  
  if (failed.length > 0) {
    console.group("❌ FAILED INDICATORS");
    for (const result of failed) {
      console.group(`${result.kind.toUpperCase()}`);
      if (!result.checks.kindIntegrity.passed) {
        console.error(`  Kind: ${result.checks.kindIntegrity.message}`);
      }
      if (!result.checks.outputShape.passed) {
        console.error(`  Shape: ${result.checks.outputShape.message}`);
      }
      if (!result.checks.hasValues.passed) {
        console.error(`  Values: ${result.checks.hasValues.message}`);
      }
      if (result.checks.antiSmaDiff && !result.checks.antiSmaDiff.passed) {
        console.error(`  Anti-SMA: ${result.checks.antiSmaDiff.message}`);
      }
      if (result.error) {
        console.error(`  Error: ${result.error}`);
      }
      console.groupEnd();
    }
    console.groupEnd();
  }
  
  if (passed.length > 0) {
    console.group("✅ PASSED INDICATORS");
    for (const result of passed) {
      const antiSmaMsg = result.checks.antiSmaDiff 
        ? ` | Diff from SMA: ${result.checks.antiSmaDiff.diff.toFixed(2)}%`
        : "";
      console.log(`  ${result.kind.toUpperCase()}: ${result.checks.hasValues.pointCount} pts${antiSmaMsg}`);
    }
    console.groupEnd();
  }
  
  console.groupEnd();
  
  // Final verdict
  if (summary.failed === 0) {
    console.log("🎉 ALL INDICATORS PASSED QA GATE!");
  } else {
    console.error(`⚠️ ${summary.failed} INDICATOR(S) FAILED QA GATE!`);
  }
}

// ============================================================================
// Expose to window for dev testing
// ============================================================================

if (typeof window !== "undefined") {
  (window as any).__indicatorQA = {
    run: () => {
      const summary = runIndicatorQAGate();
      printQAGateResults(summary);
      return summary;
    },
    runSilent: runIndicatorQAGate,
    generateMockData,
    ALL_KINDS: ALL_INDICATOR_KINDS,
  };
  
  console.log("💡 Indicator QA Gate loaded. Run: window.__indicatorQA.run()");
}

export default runIndicatorQAGate;
