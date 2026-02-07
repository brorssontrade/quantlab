#!/usr/bin/env npx tsx
/**
 * TV Parity Baselines Validator
 * 
 * Validates tv-parity-baselines.json for schema correctness:
 * - No duplicate baseline IDs
 * - Canonical timeframes (1D, 1H, 5m, 1m, etc.)
 * - status:"ready" baselines have values with barTime
 * - All values have required fields
 * 
 * Usage:
 *   npx tsx scripts/validateParityBaselines.ts         # Normal mode
 *   npx tsx scripts/validateParityBaselines.ts --ci    # CI mode (exit 1 on error)
 * 
 * Exit codes:
 *   0 = All valid
 *   1 = Validation errors found
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Types (matching tv-parity-baselines.json structure)
// ============================================================================

interface BaselineValue {
  date?: string;
  time?: string;
  barTime?: number;
  field?: string;
  value: number | null;
  note?: string;
}

interface Baseline {
  id: string;
  symbol: string;
  tvSymbol?: string;
  exchange: string;
  timeframe: string;
  indicator: string;
  params: Record<string, any>;
  dateRange?: { start: string; end: string };
  values: BaselineValue[];
  status: "pending" | "ready";
  verified: boolean;
  extractionMethod?: string;
  extractionDate?: string | null;
  fixtureRequired?: string;
}

interface BaselinesFile {
  meta: Record<string, any>;
  extractionProtocol: Record<string, any>;
  baselines: Baseline[];
}

// ============================================================================
// Canonical Timeframes
// ============================================================================

const CANONICAL_TIMEFRAMES = new Set([
  "1m", "3m", "5m", "15m", "30m", "45m",
  "1H", "2H", "3H", "4H",
  "1D", "1W", "1M",
]);

function isCanonicalTimeframe(tf: string): boolean {
  return CANONICAL_TIMEFRAMES.has(tf);
}

function suggestCanonical(tf: string): string {
  const upper = tf.toUpperCase();
  // Common fixes
  if (upper === "5M") return "5m";
  if (upper === "1M" && tf === "1M") return "1m"; // Ambiguous: 1M could be 1 month or 1 minute
  if (upper.endsWith("MIN")) return upper.replace("MIN", "m").toLowerCase();
  if (upper === "1D" || upper === "D") return "1D";
  if (upper === "1H" || upper === "H") return "1H";
  return tf;
}

// ============================================================================
// Validation Logic
// ============================================================================

interface ValidationError {
  type: "error" | "warning";
  baseline?: string;
  message: string;
}

function validateBaselines(baselines: Baseline[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenIds = new Map<string, number>();

  for (let i = 0; i < baselines.length; i++) {
    const b = baselines[i];
    const ctx = `Baseline[${i}] "${b.id}"`;

    // 1. Check for duplicate IDs
    if (seenIds.has(b.id)) {
      errors.push({
        type: "error",
        baseline: b.id,
        message: `Duplicate ID: "${b.id}" (first at index ${seenIds.get(b.id)}, duplicate at index ${i})`,
      });
    } else {
      seenIds.set(b.id, i);
    }

    // 2. Check for canonical timeframe
    if (!isCanonicalTimeframe(b.timeframe)) {
      const suggestion = suggestCanonical(b.timeframe);
      errors.push({
        type: "error",
        baseline: b.id,
        message: `Non-canonical timeframe: "${b.timeframe}". Suggest: "${suggestion}"`,
      });
    }

    // 3. status:"ready" must have values with barTime
    if (b.status === "ready") {
      if (!b.values || b.values.length === 0) {
        errors.push({
          type: "error",
          baseline: b.id,
          message: `status: "ready" but values array is empty or missing`,
        });
      } else {
        // Check each value has barTime
        for (let j = 0; j < b.values.length; j++) {
          const v = b.values[j];
          if (v.barTime === undefined || v.barTime === null) {
            errors.push({
              type: "error",
              baseline: b.id,
              message: `values[${j}] missing barTime (required for bar-aligned comparison)`,
            });
          }
          if (v.value === null) {
            errors.push({
              type: "error",
              baseline: b.id,
              message: `status: "ready" but values[${j}].value is null`,
            });
          }
        }
      }
    }

    // 4. pending baselines should have barTime for future readiness
    if (b.status === "pending" && b.values) {
      for (let j = 0; j < b.values.length; j++) {
        const v = b.values[j];
        if (v.barTime === undefined || v.barTime === null) {
          errors.push({
            type: "warning",
            baseline: b.id,
            message: `values[${j}] missing barTime (add before setting status to "ready")`,
          });
        }
      }
    }

    // 5. Check required fields
    if (!b.symbol) {
      errors.push({
        type: "error",
        baseline: b.id,
        message: `Missing required field: symbol`,
      });
    }
    if (!b.indicator) {
      errors.push({
        type: "error",
        baseline: b.id,
        message: `Missing required field: indicator`,
      });
    }
  }

  return errors;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const ciMode = args.includes("--ci");

  // Load baselines file
  const baselinesPath = path.resolve(
    __dirname,
    "../src/features/chartsPro/indicators/__fixtures__/tv-parity-baselines.json"
  );

  if (!fs.existsSync(baselinesPath)) {
    console.error(`❌ Baselines file not found: ${baselinesPath}`);
    process.exit(1);
  }

  let data: BaselinesFile;
  try {
    const content = fs.readFileSync(baselinesPath, "utf-8");
    data = JSON.parse(content);
  } catch (e) {
    console.error(`❌ Failed to parse baselines JSON: ${e}`);
    process.exit(1);
  }

  // Validate
  const errors = validateBaselines(data.baselines);
  const errorCount = errors.filter(e => e.type === "error").length;
  const warningCount = errors.filter(e => e.type === "warning").length;

  // Report
  console.log("═".repeat(60));
  console.log("📋 TV PARITY BASELINES VALIDATION");
  console.log("═".repeat(60));
  console.log(`\nTotal baselines: ${data.baselines.length}`);
  console.log(`Ready: ${data.baselines.filter(b => b.status === "ready").length}`);
  console.log(`Pending: ${data.baselines.filter(b => b.status === "pending").length}`);

  if (errors.length === 0) {
    console.log("\n✅ All baselines valid!");
    process.exit(0);
  }

  // Print errors
  if (errorCount > 0) {
    console.log(`\n❌ ERRORS (${errorCount}):`);
    errors
      .filter(e => e.type === "error")
      .forEach(e => {
        console.log(`   [${e.baseline || "global"}] ${e.message}`);
      });
  }

  if (warningCount > 0) {
    console.log(`\n⚠️  WARNINGS (${warningCount}):`);
    errors
      .filter(e => e.type === "warning")
      .forEach(e => {
        console.log(`   [${e.baseline || "global"}] ${e.message}`);
      });
  }

  console.log("\n" + "═".repeat(60));

  // Exit code
  if (ciMode && errorCount > 0) {
    console.log("CI mode: failing due to errors");
    process.exit(1);
  }

  process.exit(0);
}

main();
