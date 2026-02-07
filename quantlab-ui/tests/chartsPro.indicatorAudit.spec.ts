/**
 * Indicator Parity Audit Harness
 * 
 * Systematic E2E test that loops through all 82 indicators and:
 * 1. Adds the indicator via modal
 * 2. Waits for computed/ready state
 * 3. Verifies rendering (series data or canvas pixels)
 * 4. Captures baseline screenshot
 * 5. Outputs JSON report with pass/fail + timings
 * 
 * Usage:
 *   npx playwright test chartsPro.indicatorAudit.spec.ts --project=chromium
 * 
 * Options:
 *   --grep "SMA" - Run only specific indicators
 *   AUDIT_SYMBOLS=META.US,BTCUSD - Override test symbols
 *   AUDIT_TFS=1d,1h - Override test timeframes
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { gotoChartsPro } from "./helpers";
import { 
  getDump,
  openIndicatorsModal,
  addIndicatorViaModal,
  waitForIndicator,
  INDICATORS_MODAL,
  TOPBAR
} from "./selectors";

// ============================================================================
// Configuration
// ============================================================================

// Indicators that render via canvas overlay (not LWC series)
const CANVAS_OVERLAY_INDICATORS = new Set([
  "vrvp", "vpfr", "aavp", "svp", "svphd", "pvp",  // Volume Profile
  "williamsFractals",  // Fractal markers
  "knoxvilleDivergence",  // +KD/-KD labels
]);

// Indicators that need extended warmup/compute time
const SLOW_INDICATORS = new Set([
  "ichimoku", "williamsAlligator", "vrvp", "vpfr", "aavp", "svp", "svphd", "pvp"
]);

// Indicators we skip for now (known broken or WIP)
const SKIP_INDICATORS = new Set<string>([
  // VP suite - WIP, paused for parity audit
  "vrvp", "vpfr", "aavp", "svp", "svphd", "pvp",
]);

// Indicators that need external data and will show fallback
const NEEDS_DATA_INDICATORS = new Set([
  "adl", "adr"  // Need market breadth data
]);

// Default test configuration
const DEFAULT_SYMBOLS = ["META.US"];
const DEFAULT_TIMEFRAMES = ["1d"];

// Parse environment overrides
const testSymbols = process.env.AUDIT_SYMBOLS?.split(",") ?? DEFAULT_SYMBOLS;
const testTimeframes = process.env.AUDIT_TFS?.split(",") ?? DEFAULT_TIMEFRAMES;

// ============================================================================
// Test Data - All 82 indicators from manifest
// ============================================================================

const ALL_INDICATORS = [
  // Moving Averages (16)
  "sma", "ema", "smma", "wma", "dema", "tema", "hma", "kama", "vwma", 
  "mcginley", "alma", "lsma", "linreg", "median", "maribbon", "maribbon4",
  
  // Momentum (18)
  "rsi", "macd", "stoch", "stochrsi", "cci", "roc", "mom", "willr",
  "trix", "tsi", "uo", "cmo", "coppock", "ao", "fisher", "smii", "smio", "ulcer",
  
  // Trend/Direction (12)
  "adx", "dmi", "vortex", "aroon", "aroonosc", "supertrend", "sar", 
  "ichimoku", "williamsAlligator", "williamsFractals", "zigzag", "chop",
  
  // Volatility (10)
  "atr", "bb", "bbw", "bbtrend", "dc", "kc", "env", "vstop", "hv", "cvi",
  
  // Volume (12)
  "vwap", "avwap", "obv", "pvt", "cmf", "mfi", "klinger", "cvd", 
  "volumeDelta", "pvi", "nvi", "relvol",
  
  // VP Suite (6) - WIP
  "vrvp", "vpfr", "aavp", "svp", "svphd", "pvp",
  
  // Divergence (2)
  "rsiDivergence", "knoxvilleDivergence",
  
  // Pivot/Levels (3)
  "pivotPointsStandard", "pivotPointsHighLow", "autoFib",
  
  // Market Breadth (3)
  "adrb", "adr", "adl",
];

// ============================================================================
// Types
// ============================================================================

interface AuditResult {
  indicatorId: string;
  symbol: string;
  timeframe: string;
  status: "pass" | "fail" | "skip" | "needs-data";
  hasSeriesData: boolean;
  seriesCount: number;
  computeTimeMs: number;
  renderTimeMs: number;
  errorMessage?: string;
  screenshotPath?: string;
  debugInfo?: Record<string, unknown>;
}

interface AuditReport {
  timestamp: string;
  totalIndicators: number;
  passed: number;
  failed: number;
  skipped: number;
  needsData: number;
  results: AuditResult[];
}

// ============================================================================
// Helpers
// ============================================================================

async function getIndicatorState(page: import("@playwright/test").Page, indicatorId: string) {
  const dump = await getDump(page);
  const indicators = dump?.indicators ?? [];
  return indicators.find((ind: { id: string }) => ind.id === indicatorId);
}

async function waitForIndicatorComputed(
  page: import("@playwright/test").Page,
  indicatorId: string,
  timeoutMs = 10000
): Promise<{ success: boolean; computeTimeMs: number }> {
  const startTime = Date.now();
  
  try {
    await page.waitForFunction(
      (id) => {
        const lwcharts = (window as unknown as { __lwcharts?: { dump: () => { indicators?: Array<{ id: string; state?: string }> } } }).__lwcharts;
        if (!lwcharts) return false;
        const dump = lwcharts.dump();
        const indicator = dump?.indicators?.find((i) => i.id === id);
        return indicator && indicator.state !== "computing";
      },
      indicatorId,
      { timeout: timeoutMs }
    );
    return { success: true, computeTimeMs: Date.now() - startTime };
  } catch {
    return { success: false, computeTimeMs: Date.now() - startTime };
  }
}

async function checkSeriesRendered(
  page: import("@playwright/test").Page,
  indicatorId: string
): Promise<{ hasData: boolean; seriesCount: number }> {
  const dump = await getDump(page);
  const indicator = dump?.indicators?.find((ind: { id: string }) => ind.id === indicatorId);
  
  if (!indicator) {
    return { hasData: false, seriesCount: 0 };
  }
  
  // Check if indicator has series with data
  const series = indicator.series ?? [];
  const hasData = series.some((s: { dataCount?: number }) => (s.dataCount ?? 0) > 0);
  
  return { hasData, seriesCount: series.length };
}

async function checkCanvasRendered(
  page: import("@playwright/test").Page
): Promise<boolean> {
  // Check if any VP-style canvas overlay has non-transparent pixels
  const hasPixels = await page.evaluate(() => {
    const overlays = document.querySelectorAll('[data-testid*="vp-overlay"], .vp-overlay-canvas');
    for (const canvas of overlays) {
      if (canvas instanceof HTMLCanvasElement) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          // Check if any pixel has alpha > 0
          for (let i = 3; i < imageData.data.length; i += 4) {
            if (imageData.data[i] > 0) return true;
          }
        }
      }
    }
    return false;
  });
  
  return hasPixels;
}

// ============================================================================
// Test Suite
// ============================================================================

test.describe("Indicator Parity Audit", () => {
  const results: AuditResult[] = [];
  
  test.afterAll(async () => {
    // Write combined report
    const report: AuditReport = {
      timestamp: new Date().toISOString(),
      totalIndicators: results.length,
      passed: results.filter(r => r.status === "pass").length,
      failed: results.filter(r => r.status === "fail").length,
      skipped: results.filter(r => r.status === "skip").length,
      needsData: results.filter(r => r.status === "needs-data").length,
      results,
    };
    
    const reportPath = path.join(__dirname, "..", "test-results", "indicator-audit-report.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log("\n========================================");
    console.log("  INDICATOR AUDIT SUMMARY");
    console.log("========================================");
    console.log(`Total:     ${report.totalIndicators}`);
    console.log(`Passed:    ${report.passed}`);
    console.log(`Failed:    ${report.failed}`);
    console.log(`Skipped:   ${report.skipped}`);
    console.log(`NeedsData: ${report.needsData}`);
    console.log(`Report:    ${reportPath}`);
    console.log("========================================\n");
  });
  
  // Generate tests for each indicator
  for (const indicatorId of ALL_INDICATORS) {
    for (const symbol of testSymbols) {
      for (const timeframe of testTimeframes) {
        const testName = `${indicatorId} [${symbol}/${timeframe}]`;
        
        // Determine if this should be skipped
        if (SKIP_INDICATORS.has(indicatorId)) {
          test.skip(testName, async () => {
            results.push({
              indicatorId,
              symbol,
              timeframe,
              status: "skip",
              hasSeriesData: false,
              seriesCount: 0,
              computeTimeMs: 0,
              renderTimeMs: 0,
              errorMessage: "WIP - skipped for parity audit",
            });
          });
          continue;
        }
        
        test(testName, async ({ page }, testInfo) => {
          const result: AuditResult = {
            indicatorId,
            symbol,
            timeframe,
            status: "fail",
            hasSeriesData: false,
            seriesCount: 0,
            computeTimeMs: 0,
            renderTimeMs: 0,
          };
          
          try {
            // Navigate to ChartsPro with specified symbol/timeframe
            await gotoChartsPro(page, testInfo, { symbol, timeframe });
            
            // Wait for chart to be ready
            await page.waitForSelector('[data-testid="chart-container"]', { timeout: 10000 });
            await page.waitForTimeout(500);  // Brief settle
            
            const startTime = Date.now();
            
            // Add indicator via modal
            await openIndicatorsModal(page);
            
            // Search for the indicator
            await page.locator(INDICATORS_MODAL.search).fill(indicatorId);
            await page.waitForTimeout(200);
            
            // Click on the indicator item
            const indicatorItem = page.locator(INDICATORS_MODAL.indicatorItem(indicatorId));
            if (await indicatorItem.isVisible()) {
              await indicatorItem.click();
            } else {
              // Try scrolling or using different selector
              await page.keyboard.press("Enter");
            }
            
            // Wait for modal to close
            await expect(page.locator(INDICATORS_MODAL.root)).not.toBeVisible({ timeout: 3000 });
            
            // Wait for indicator to compute
            const timeout = SLOW_INDICATORS.has(indicatorId) ? 15000 : 8000;
            const computeResult = await waitForIndicatorComputed(page, indicatorId, timeout);
            result.computeTimeMs = computeResult.computeTimeMs;
            
            // Wait a bit more for rendering
            await page.waitForTimeout(500);
            result.renderTimeMs = Date.now() - startTime - result.computeTimeMs;
            
            // Check rendering based on indicator type
            if (CANVAS_OVERLAY_INDICATORS.has(indicatorId)) {
              const hasPixels = await checkCanvasRendered(page);
              result.hasSeriesData = hasPixels;
              result.seriesCount = hasPixels ? 1 : 0;
            } else {
              const seriesResult = await checkSeriesRendered(page, indicatorId);
              result.hasSeriesData = seriesResult.hasData;
              result.seriesCount = seriesResult.seriesCount;
            }
            
            // For needs-data indicators, check if we got fallback/mock data
            if (NEEDS_DATA_INDICATORS.has(indicatorId)) {
              result.status = result.hasSeriesData ? "needs-data" : "fail";
              result.errorMessage = "Uses mock/fallback data - needs real breadth provider";
            } else {
              result.status = result.hasSeriesData ? "pass" : "fail";
              if (!result.hasSeriesData) {
                result.errorMessage = "No series data rendered";
              }
            }
            
            // Capture screenshot
            const screenshotDir = path.join(__dirname, "..", "test-results", "baselines", indicatorId);
            fs.mkdirSync(screenshotDir, { recursive: true });
            const screenshotPath = path.join(screenshotDir, `${symbol.replace(/\./g, "-")}_${timeframe}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: false });
            result.screenshotPath = screenshotPath;
            
            // Get debug info from dump
            const dump = await getDump(page);
            result.debugInfo = {
              indicatorCount: dump?.indicators?.length ?? 0,
              dataMode: dump?.state?.dataMode,
              bannerState: dump?.ui?.bannerState,
            };
            
          } catch (error) {
            result.status = "fail";
            result.errorMessage = error instanceof Error ? error.message : String(error);
          }
          
          results.push(result);
          
          // Assert for test pass/fail
          if (result.status === "fail") {
            expect.soft(result.hasSeriesData, `${indicatorId} should render data`).toBe(true);
          }
        });
      }
    }
  }
});

// ============================================================================
// Focused Audit Tests (run specific indicators)
// ============================================================================

test.describe("Focused Audit: Moving Averages", () => {
  const maIndicators = ["sma", "ema", "smma", "wma", "dema", "tema", "hma", "kama", "vwma", "mcginley"];
  
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
  });
  
  for (const indicatorId of maIndicators) {
    test(`${indicatorId} renders with data`, async ({ page }) => {
      await openIndicatorsModal(page);
      await addIndicatorViaModal(page, indicatorId);
      
      // Wait for computation
      await waitForIndicator(page, indicatorId);
      
      // Check series has data
      const { hasData, seriesCount } = await checkSeriesRendered(page, indicatorId);
      
      expect(hasData).toBe(true);
      expect(seriesCount).toBeGreaterThan(0);
    });
  }
});

test.describe("Focused Audit: Momentum", () => {
  const momentumIndicators = ["rsi", "macd", "stoch", "stochrsi", "cci", "roc", "mom", "willr"];
  
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
  });
  
  for (const indicatorId of momentumIndicators) {
    test(`${indicatorId} renders with data`, async ({ page }) => {
      await openIndicatorsModal(page);
      await addIndicatorViaModal(page, indicatorId);
      
      await waitForIndicator(page, indicatorId);
      
      const { hasData, seriesCount } = await checkSeriesRendered(page, indicatorId);
      
      expect(hasData).toBe(true);
      expect(seriesCount).toBeGreaterThan(0);
    });
  }
});

test.describe("Focused Audit: Volatility", () => {
  const volatilityIndicators = ["atr", "bb", "dc", "kc", "env"];
  
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
  });
  
  for (const indicatorId of volatilityIndicators) {
    test(`${indicatorId} renders with data`, async ({ page }) => {
      await openIndicatorsModal(page);
      await addIndicatorViaModal(page, indicatorId);
      
      await waitForIndicator(page, indicatorId);
      
      const { hasData, seriesCount } = await checkSeriesRendered(page, indicatorId);
      
      expect(hasData).toBe(true);
      expect(seriesCount).toBeGreaterThan(0);
    });
  }
});
