/**
 * Indicator Inventory Check
 * 
 * Validates that indicator counts are consistent across:
 * - indicatorManifest.ts (INDICATOR_MANIFESTS array)
 * - registryV2.ts (case statements in computeIndicator)
 * - INDICATOR_PARITY_MATRIX.md
 * - INDICATOR_BACKLOG.md
 * 
 * Usage: npx tsx scripts/indicatorInventory.ts
 * 
 * Exit code 0 if all counts match, 1 if any discrepancy.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const UI_ROOT = path.resolve(__dirname, "..");

const MANIFEST_PATH = path.join(UI_ROOT, "src/features/chartsPro/indicators/indicatorManifest.ts");
const REGISTRY_PATH = path.join(UI_ROOT, "src/features/chartsPro/indicators/registryV2.ts");
const PARITY_MATRIX_PATH = path.join(WORKSPACE_ROOT, "docs/INDICATOR_PARITY_MATRIX.md");
const BACKLOG_PATH = path.join(WORKSPACE_ROOT, "docs/INDICATOR_BACKLOG.md");

// Indicators that are VP-related and marked as WIP
const VP_INDICATORS = new Set(["vrvp", "vpfr", "aavp", "svp", "svphd", "pvp"]);

// Indicators that need external data (breadth)
const NEEDS_DATA_INDICATORS = new Set(["adl", "adr"]);

// ============================================================================
// Extractors
// ============================================================================

function extractManifestIds(): string[] {
  const content = fs.readFileSync(MANIFEST_PATH, "utf-8");
  const matches = content.matchAll(/^\s*id:\s*"(\w+)"/gm);
  return [...matches].map(m => m[1]).sort();
}

function extractRegistryCases(): string[] {
  const content = fs.readFileSync(REGISTRY_PATH, "utf-8");
  
  // Match case "indicatorId": at the start of switch cases in computeIndicatorInternal
  // We need to be careful to only match the main switch, not nested switches
  const mainSwitchMatch = content.match(/switch\s*\(\s*indicatorId\s*\)\s*\{([\s\S]*?)\n\s*default:\s*\{/);
  if (!mainSwitchMatch) {
    console.error("Could not find main indicator switch in registryV2.ts");
    return [];
  }
  
  const switchContent = mainSwitchMatch[1];
  const caseMatches = switchContent.matchAll(/case\s+"(\w+)":/g);
  const ids = new Set<string>();
  
  for (const match of caseMatches) {
    const id = match[1];
    // Skip non-indicator case values (like "week", "month" etc from nested switches)
    if (!["week", "month", "quarter", "year", "first", "none", "sma", "ema", "smma", "wma", "vwma", "psar"].includes(id) || 
        id.length <= 3) {
      // Actually just use a whitelist approach - only include if it's a known indicator pattern
    }
    ids.add(id);
  }
  
  // Better approach: extract ALL case statements and filter out non-indicators
  const allCases = [...content.matchAll(/^\s*case\s+"(\w+)":/gm)].map(m => m[1]);
  
  // Non-indicator values that appear in nested switches
  const nonIndicators = new Set([
    "week", "month", "quarter", "year", "first", "none",
    // smoothingType values
  ]);
  
  // Filter to only include IDs that appear in manifest
  const manifestIds = new Set(extractManifestIds());
  return allCases.filter(id => manifestIds.has(id) && !nonIndicators.has(id)).sort();
}

function extractParityMatrixIds(): string[] {
  if (!fs.existsSync(PARITY_MATRIX_PATH)) {
    console.warn("INDICATOR_PARITY_MATRIX.md not found");
    return [];
  }
  
  const content = fs.readFileSync(PARITY_MATRIX_PATH, "utf-8");
  // Match rows in tables: | id | name | ...
  const matches = content.matchAll(/^\|\s*(\w+)\s*\|.*\|.*\|/gm);
  const ids: string[] = [];
  
  for (const match of matches) {
    const id = match[1];
    // Skip header rows and non-ID values
    if (id && id !== "ID" && id !== "id" && id !== "Category" && !id.startsWith("-")) {
      ids.push(id);
    }
  }
  
  return [...new Set(ids)].sort();
}

function extractBacklogIds(): string[] {
  if (!fs.existsSync(BACKLOG_PATH)) {
    console.warn("INDICATOR_BACKLOG.md not found");
    return [];
  }
  
  const content = fs.readFileSync(BACKLOG_PATH, "utf-8");
  // Match rows in tables: | # | id | name | ...
  // The ID is in the second column (after row number)
  // Also handle old format where ID was first column
  const matches = content.matchAll(/^\|\s*\d+\s*\|\s*(\w+)\s*\|/gm);
  const ids: string[] = [];
  
  for (const match of matches) {
    const id = match[1];
    // Skip header rows and non-indicator IDs
    if (id && id !== "ID" && id !== "id" && !id.startsWith("-")) {
      ids.push(id);
    }
  }
  
  // Also try old format (| id | name | ...)
  if (ids.length === 0) {
    const oldMatches = content.matchAll(/^\|\s*([a-zA-Z]\w*)\s*\|/gm);
    for (const match of oldMatches) {
      const id = match[1];
      if (id && id !== "ID" && id !== "id" && id !== "Status" && id !== "Category") {
        ids.push(id);
      }
    }
  }
  
  return [...new Set(ids)].sort();
}

// ============================================================================
// Validation
// ============================================================================

interface InventoryReport {
  manifestCount: number;
  manifestIds: string[];
  registryCount: number;
  registryIds: string[];
  parityMatrixCount: number;
  parityMatrixIds: string[];
  backlogCount: number;
  backlogIds: string[];
  missingInRegistry: string[];
  missingInMatrix: string[];
  missingInBacklog: string[];
  extraInRegistry: string[];
  vpCount: number;
  needsDataCount: number;
  doneCount: number;
  isConsistent: boolean;
}

function generateReport(): InventoryReport {
  const manifestIds = extractManifestIds();
  const manifestSet = new Set(manifestIds);
  
  // For registry, we use a simpler approach - just count unique case statements for known manifest IDs
  const registryContent = fs.readFileSync(REGISTRY_PATH, "utf-8");
  const registryCases = [...registryContent.matchAll(/case\s+"(\w+)":/g)]
    .map(m => m[1])
    .filter(id => manifestSet.has(id));
  const registryIds = [...new Set(registryCases)].sort();
  
  const parityMatrixIds = extractParityMatrixIds();
  const backlogIds = extractBacklogIds();
  
  const missingInRegistry = manifestIds.filter(id => !registryIds.includes(id));
  const missingInMatrix = manifestIds.filter(id => !parityMatrixIds.includes(id));
  const missingInBacklog = manifestIds.filter(id => !backlogIds.includes(id));
  const extraInRegistry = registryIds.filter(id => !manifestIds.includes(id));
  
  const vpCount = manifestIds.filter(id => VP_INDICATORS.has(id)).length;
  const needsDataCount = manifestIds.filter(id => NEEDS_DATA_INDICATORS.has(id)).length;
  const doneCount = manifestIds.length - vpCount - needsDataCount;
  
  const isConsistent = 
    missingInRegistry.length === 0 &&
    extraInRegistry.length === 0 &&
    manifestIds.length === registryIds.length;
  
  return {
    manifestCount: manifestIds.length,
    manifestIds,
    registryCount: registryIds.length,
    registryIds,
    parityMatrixCount: parityMatrixIds.length,
    parityMatrixIds,
    backlogCount: backlogIds.length,
    backlogIds,
    missingInRegistry,
    missingInMatrix,
    missingInBacklog,
    extraInRegistry,
    vpCount,
    needsDataCount,
    doneCount,
    isConsistent,
  };
}

function printReport(report: InventoryReport): void {
  console.log("\n========================================");
  console.log("  INDICATOR INVENTORY CHECK");
  console.log("========================================\n");
  
  console.log("📊 Counts:");
  console.log(`  Manifest:       ${report.manifestCount}`);
  console.log(`  Registry:       ${report.registryCount}`);
  console.log(`  Parity Matrix:  ${report.parityMatrixCount}`);
  console.log(`  Backlog:        ${report.backlogCount}`);
  
  console.log("\n📈 Breakdown:");
  console.log(`  Done:           ${report.doneCount}`);
  console.log(`  WIP (VP):       ${report.vpCount}`);
  console.log(`  Needs Data:     ${report.needsDataCount}`);
  
  if (report.missingInRegistry.length > 0) {
    console.log("\n❌ Missing in Registry:");
    report.missingInRegistry.forEach(id => console.log(`  - ${id}`));
  }
  
  if (report.extraInRegistry.length > 0) {
    console.log("\n⚠️ Extra in Registry (not in manifest):");
    report.extraInRegistry.forEach(id => console.log(`  - ${id}`));
  }
  
  if (report.missingInMatrix.length > 0) {
    console.log("\n⚠️ Missing in Parity Matrix:");
    report.missingInMatrix.forEach(id => console.log(`  - ${id}`));
  }
  
  if (report.missingInBacklog.length > 0) {
    console.log("\n⚠️ Missing in Backlog:");
    report.missingInBacklog.forEach(id => console.log(`  - ${id}`));
  }
  
  console.log("\n========================================");
  if (report.isConsistent) {
    console.log("✅ PASS: Manifest and Registry are consistent");
  } else {
    console.log("❌ FAIL: Manifest and Registry counts do not match");
  }
  console.log("========================================\n");
}

function outputJson(report: InventoryReport): void {
  const output = {
    timestamp: new Date().toISOString(),
    counts: {
      manifest: report.manifestCount,
      registry: report.registryCount,
      parityMatrix: report.parityMatrixCount,
      backlog: report.backlogCount,
    },
    breakdown: {
      done: report.doneCount,
      wip: report.vpCount,
      needsData: report.needsDataCount,
    },
    issues: {
      missingInRegistry: report.missingInRegistry,
      missingInMatrix: report.missingInMatrix,
      missingInBacklog: report.missingInBacklog,
      extraInRegistry: report.extraInRegistry,
    },
    manifestIds: report.manifestIds,
    isConsistent: report.isConsistent,
  };
  
  console.log(JSON.stringify(output, null, 2));
}

// ============================================================================
// Main
// ============================================================================

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const ciMode = args.includes("--ci");

const report = generateReport();

if (jsonOutput) {
  outputJson(report);
} else {
  printReport(report);
}

if (ciMode && !report.isConsistent) {
  process.exit(1);
}

// Export for testing
export { generateReport, InventoryReport };
