/**
 * Generate INDICATOR_PARITY_MATRIX.md from indicatorManifest.ts
 * 
 * This script reads the manifest and generates a canonical parity matrix table.
 * Manual parity columns are preserved if the file already exists.
 * 
 * Usage: npx tsx scripts/generateParityMatrix.ts
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
const OUTPUT_PATH = path.join(WORKSPACE_ROOT, "docs/INDICATOR_PARITY_MATRIX.md");

// VP indicators - marked as WIP
const VP_INDICATORS = new Set(["vrvp", "vpfr", "aavp", "svp", "svphd", "pvp"]);

// Indicators needing external data
const NEEDS_DATA_INDICATORS = new Set(["adl", "adr"]);

// Done indicators (ADR_B is complete)
const DONE_INDICATORS = new Set(["adrb"]);

// ============================================================================
// Types
// ============================================================================

interface ManifestEntry {
  id: string;
  name: string;
  shortName: string;
  category: string;
  panePolicy: string;
  inputCount: number;
  outputCount: number;
}

interface ParityEntry {
  id: string;
  name: string;
  type: string;  // panePolicy
  status: string;  // ✅ OK | ⚠️ Needs Fix | 🚧 WIP | 📊 Needs Data | 🔲 Untested
  compute: string;  // ✅ | ⚠️ | 🔲
  visual: string;
  settings: string;
  tested: string;
  gaps: string;
  lastVerified: string;
}

// ============================================================================
// Manifest Parser
// ============================================================================

function parseManifest(): ManifestEntry[] {
  const content = fs.readFileSync(MANIFEST_PATH, "utf-8");
  
  // Find INDICATOR_MANIFESTS array
  const arrayMatch = content.match(/export\s+const\s+INDICATOR_MANIFESTS\s*:\s*IndicatorManifest\[\]\s*=\s*\[([\s\S]*?)\n\];/);
  if (!arrayMatch) {
    throw new Error("Could not find INDICATOR_MANIFESTS array");
  }
  
  const entries: ManifestEntry[] = [];
  
  // Extract each manifest object
  const manifestRegex = /\{\s*id:\s*"(\w+)"[^}]*name:\s*"([^"]+)"[^}]*shortName:\s*"([^"]+)"[^}]*category:\s*"([^"]+)"[^}]*panePolicy:\s*"([^"]+)"/gs;
  
  // Simpler approach: extract all IDs first, then get details
  const idMatches = [...content.matchAll(/^\s*id:\s*"(\w+)"/gm)];
  
  for (const match of idMatches) {
    const id = match[1];
    
    // Find the full manifest block for this ID
    const blockRegex = new RegExp(`\\{[^{}]*id:\\s*"${id}"[^{}]*\\}`, "s");
    const blockMatch = content.match(blockRegex);
    
    if (blockMatch) {
      const block = blockMatch[0];
      
      const nameMatch = block.match(/name:\s*"([^"]+)"/);
      const shortNameMatch = block.match(/shortName:\s*"([^"]+)"/);
      const categoryMatch = block.match(/category:\s*"([^"]+)"/);
      const panePolicyMatch = block.match(/panePolicy:\s*"([^"]+)"/);
      
      entries.push({
        id,
        name: nameMatch?.[1] ?? id,
        shortName: shortNameMatch?.[1] ?? id.toUpperCase(),
        category: categoryMatch?.[1] ?? "unknown",
        panePolicy: panePolicyMatch?.[1] ?? "separate",
        inputCount: (block.match(/key:/g) ?? []).length,
        outputCount: 0,  // Could parse but not critical
      });
    }
  }
  
  return entries;
}

// ============================================================================
// Status Determination
// ============================================================================

function determineStatus(id: string): string {
  if (VP_INDICATORS.has(id)) return "🚧 WIP";
  if (NEEDS_DATA_INDICATORS.has(id)) return "📊 Needs Data";
  if (DONE_INDICATORS.has(id)) return "✅ OK";
  return "🔲 Untested";
}

function determineParity(id: string): { compute: string; visual: string; settings: string } {
  if (DONE_INDICATORS.has(id)) {
    return { compute: "✅", visual: "✅", settings: "✅" };
  }
  if (VP_INDICATORS.has(id) || NEEDS_DATA_INDICATORS.has(id)) {
    return { compute: "⚠️", visual: "⚠️", settings: "⚠️" };
  }
  return { compute: "🔲", visual: "🔲", settings: "🔲" };
}

// ============================================================================
// Existing Matrix Parser (to preserve manual notes)
// ============================================================================

interface ExistingEntry {
  gaps?: string;
  tested?: string;
  lastVerified?: string;
}

function parseExistingMatrix(): Map<string, ExistingEntry> {
  if (!fs.existsSync(OUTPUT_PATH)) {
    return new Map();
  }
  
  const content = fs.readFileSync(OUTPUT_PATH, "utf-8");
  const map = new Map<string, ExistingEntry>();
  
  // Match table rows: | id | name | type | status | compute | visual | settings | tested | gaps |
  const rowRegex = /^\|\s*(\w+)\s*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|([^|]*)\|([^|]*)\|/gm;
  
  let match;
  while ((match = rowRegex.exec(content)) !== null) {
    const id = match[1].trim();
    if (id && id !== "ID" && id !== "id") {
      map.set(id, {
        tested: match[2]?.trim() ?? "",
        gaps: match[3]?.trim() ?? "",
      });
    }
  }
  
  return map;
}

// ============================================================================
// Matrix Generator
// ============================================================================

function categorizeEntries(entries: ManifestEntry[]): Map<string, ManifestEntry[]> {
  const categories = new Map<string, ManifestEntry[]>();
  
  const categoryOrder = [
    "volume",  // VP suite first
    "moving-average",
    "momentum",
    "trend",
    "volatility",
  ];
  
  for (const entry of entries) {
    let cat = entry.category;
    
    // Special handling for VP indicators
    if (VP_INDICATORS.has(entry.id)) {
      cat = "volume-profile";
    }
    
    if (!categories.has(cat)) {
      categories.set(cat, []);
    }
    categories.get(cat)!.push(entry);
  }
  
  // Sort each category by ID
  for (const [, list] of categories) {
    list.sort((a, b) => a.id.localeCompare(b.id));
  }
  
  return categories;
}

function generateMarkdown(entries: ManifestEntry[], existing: Map<string, ExistingEntry>): string {
  const lines: string[] = [];
  const today = new Date().toISOString().split("T")[0];
  
  lines.push("# Indicator Parity Matrix");
  lines.push("");
  lines.push("> **Auto-generated from indicatorManifest.ts** — Do not edit indicator rows directly.");
  lines.push("> Manual parity notes (Gaps, Tested columns) are preserved on regeneration.");
  lines.push(">");
  lines.push("> **Status Key:**");
  lines.push("> - ✅ OK — Visual, compute, and settings parity verified");
  lines.push("> - ⚠️ Needs Fix — Known issues documented");
  lines.push("> - 🚧 WIP — Under development, not release-ready");
  lines.push("> - 📊 Needs Data — Requires external data provider (breadth, fundamentals, etc.)");
  lines.push("> - 🔲 Untested — Not yet audited");
  lines.push(">");
  lines.push(`> **Generated:** ${today}`);
  lines.push(`> **Total Indicators:** ${entries.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  
  // Summary table
  const vpCount = entries.filter(e => VP_INDICATORS.has(e.id)).length;
  const needsDataCount = entries.filter(e => NEEDS_DATA_INDICATORS.has(e.id)).length;
  const doneCount = entries.filter(e => DONE_INDICATORS.has(e.id)).length;
  const untestedCount = entries.length - vpCount - needsDataCount - doneCount;
  
  lines.push("## Summary");
  lines.push("");
  lines.push("| Status | Count |");
  lines.push("|--------|-------|");
  lines.push(`| ✅ OK | ${doneCount} |`);
  lines.push(`| 🚧 WIP (VP Suite) | ${vpCount} |`);
  lines.push(`| 📊 Needs Data | ${needsDataCount} |`);
  lines.push(`| 🔲 Untested | ${untestedCount} |`);
  lines.push(`| **Total** | **${entries.length}** |`);
  lines.push("");
  lines.push("---");
  lines.push("");
  
  // Group by special status first
  
  // VP Suite (always first, WIP)
  const vpEntries = entries.filter(e => VP_INDICATORS.has(e.id));
  if (vpEntries.length > 0) {
    lines.push("## Volume Profile Suite (🚧 WIP — Paused)");
    lines.push("");
    lines.push("> **Epic:** EPIC-VP in LLM_TASKS.md");
    lines.push("> **Status:** Under development. Paused pending full parity audit.");
    lines.push("");
    lines.push("| ID | Name | Type | Status | Compute | Visual | Settings | Tested | Gaps |");
    lines.push("|----|------|------|--------|---------|--------|----------|--------|------|");
    
    for (const entry of vpEntries) {
      const ex = existing.get(entry.id) ?? {};
      const parity = determineParity(entry.id);
      lines.push(`| ${entry.id} | ${entry.name} | ${entry.panePolicy} | 🚧 WIP | ${parity.compute} | ${parity.visual} | ${parity.settings} | ${ex.tested ?? ""} | ${ex.gaps ?? "See VP-1..VP-13"} |`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  
  // Needs Data (ADL, ADR)
  const needsDataEntries = entries.filter(e => NEEDS_DATA_INDICATORS.has(e.id));
  if (needsDataEntries.length > 0) {
    lines.push("## Market Breadth (📊 Needs Data Provider)");
    lines.push("");
    lines.push("> These require real exchange breadth data (advancing/declining stocks per day).");
    lines.push("");
    lines.push("| ID | Name | Type | Status | Compute | Visual | Settings | Tested | Gaps |");
    lines.push("|----|------|------|--------|---------|--------|----------|--------|------|");
    
    for (const entry of needsDataEntries) {
      const ex = existing.get(entry.id) ?? {};
      lines.push(`| ${entry.id} | ${entry.name} | ${entry.panePolicy} | 📊 Needs Data | ⚠️ | ⚠️ | ⚠️ | ${ex.tested ?? ""} | ${ex.gaps ?? "Needs breadth data"} |`);
    }
    
    // Add ADR_B which is complete
    const adrbEntry = entries.find(e => e.id === "adrb");
    if (adrbEntry) {
      const ex = existing.get("adrb") ?? {};
      lines.push(`| adrb | ${adrbEntry.name} | ${adrbEntry.panePolicy} | ✅ OK | ✅ | ✅ | ✅ | ${ex.tested ?? "META 1D"} | ${ex.gaps ?? ""} |`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  
  // Remaining indicators by category
  const regularEntries = entries.filter(e => 
    !VP_INDICATORS.has(e.id) && 
    !NEEDS_DATA_INDICATORS.has(e.id) &&
    e.id !== "adrb"
  );
  
  const byCategory = categorizeEntries(regularEntries);
  
  const categoryNames: Record<string, string> = {
    "moving-average": "Moving Averages",
    "momentum": "Momentum",
    "trend": "Trend/Direction",
    "volatility": "Volatility",
    "volume": "Volume",
  };
  
  const categoryOrder = ["moving-average", "momentum", "trend", "volatility", "volume"];
  
  for (const cat of categoryOrder) {
    const catEntries = byCategory.get(cat);
    if (!catEntries || catEntries.length === 0) continue;
    
    const catName = categoryNames[cat] ?? cat;
    lines.push(`## ${catName}`);
    lines.push("");
    lines.push("| ID | Name | Type | Status | Compute | Visual | Settings | Tested | Gaps |");
    lines.push("|----|------|------|--------|---------|--------|----------|--------|------|");
    
    for (const entry of catEntries) {
      const ex = existing.get(entry.id) ?? {};
      const status = determineStatus(entry.id);
      const parity = determineParity(entry.id);
      lines.push(`| ${entry.id} | ${entry.name} | ${entry.panePolicy} | ${status} | ${parity.compute} | ${parity.visual} | ${parity.settings} | ${ex.tested ?? ""} | ${ex.gaps ?? ""} |`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  
  // Handle any remaining categories
  for (const [cat, catEntries] of byCategory) {
    if (categoryOrder.includes(cat)) continue;
    if (catEntries.length === 0) continue;
    
    lines.push(`## ${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
    lines.push("");
    lines.push("| ID | Name | Type | Status | Compute | Visual | Settings | Tested | Gaps |");
    lines.push("|----|------|------|--------|---------|--------|----------|--------|------|");
    
    for (const entry of catEntries) {
      const ex = existing.get(entry.id) ?? {};
      const status = determineStatus(entry.id);
      const parity = determineParity(entry.id);
      lines.push(`| ${entry.id} | ${entry.name} | ${entry.panePolicy} | ${status} | ${parity.compute} | ${parity.visual} | ${parity.settings} | ${ex.tested ?? ""} | ${ex.gaps ?? ""} |`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  
  // Audit process documentation
  lines.push("## Parity Audit Process");
  lines.push("");
  lines.push("### Per-Indicator Checklist");
  lines.push("");
  lines.push("1. **Compute Parity** — Values match TradingView with same inputs");
  lines.push("   - Compare last value in status line");
  lines.push("   - Spot-check 2-3 historical values");
  lines.push("   - Known edge cases (first bars, gaps, zero volume)");
  lines.push("");
  lines.push("2. **Visual Parity** — Rendering matches TradingView");
  lines.push("   - Line colors/widths");
  lines.push("   - Histogram colors (up/down)");
  lines.push("   - Bands/fills/opacity");
  lines.push("   - Labels/markers/offsets");
  lines.push("");
  lines.push("3. **Settings Parity** — Inputs/defaults match TradingView");
  lines.push("   - Input names and order");
  lines.push("   - Default values");
  lines.push("   - Min/max/step constraints");
  lines.push("   - Style toggles");
  lines.push("");
  lines.push("### Test Set");
  lines.push("");
  lines.push("| Symbol | Type | Exchange |");
  lines.push("|--------|------|----------|");
  lines.push("| META | Equity | NASDAQ |");
  lines.push("| BTCUSD | Crypto | Binance |");
  lines.push("| EURUSD | FX | OANDA |");
  lines.push("");
  lines.push("| Timeframe | Range |");
  lines.push("|-----------|-------|");
  lines.push("| 1D | 1Y |");
  lines.push("| 1H | 1M |");
  lines.push("| 5m | 1W |");
  lines.push("");
  
  return lines.join("\n");
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log("Parsing indicator manifest...");
  const entries = parseManifest();
  console.log(`Found ${entries.length} indicators`);
  
  console.log("Loading existing parity notes...");
  const existing = parseExistingMatrix();
  console.log(`Preserved ${existing.size} existing entries`);
  
  console.log("Generating markdown...");
  const markdown = generateMarkdown(entries, existing);
  
  console.log(`Writing to ${OUTPUT_PATH}...`);
  fs.writeFileSync(OUTPUT_PATH, markdown, "utf-8");
  
  console.log("✅ Done!");
}

main();
