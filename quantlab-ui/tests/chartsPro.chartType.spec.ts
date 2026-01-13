/**
 * TV-3 Steg 1C: Chart Type Switcher Tests
 * 
 * Test chart type switching functionality:
 * - UI menu rendering and interaction
 * - Type switching via UI and QA primitive
 * - dump() contract verification (ui.chartType, render.baseSeriesType)
 * - Data readiness after type switch
 * - No crashes or console errors
 */

import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

// Helper to extract dump data
async function getDump(page: Page): Promise<any> {
  return await page.evaluate(() => {
    const lw = (window as any).__lwcharts;
    if (!lw?.dump) throw new Error("__lwcharts.dump not available");
    return lw.dump();
  });
}

// Helper to wait for base data readiness
async function waitForBaseReady(page: Page, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const dump = await getDump(page);
    if (dump?.data?.baseReady === true) {
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error("Base data did not become ready within timeout");
}

// Helper to set chart type via QA primitive
async function qaSetChartType(page: Page, type: string): Promise<any> {
  return await page.evaluate((t) => {
    const lw = (window as any).__lwcharts;
    if (!lw?._qaSetChartType) throw new Error("_qaSetChartType not available");
    return lw._qaSetChartType(t);
  }, type);
}

test.describe("TV-3 Steg 1C: Chart Type Switcher", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Set API base to local backend
    await page.addInitScript(() => {
      localStorage.setItem("ql/apiBase", "http://127.0.0.1:8000");
    });

    // Log console messages for debugging
    page.on("console", (msg) => console.log("BROWSER:", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.log("PAGEERROR:", err.name, err.message));
    
    // Navigate to app with mock=1
    await page.goto("/?mock=1");
    
    // Navigate to ChartsPro tab
    await gotoChartsPro(page, testInfo);
    
    // Wait for initial data to load
    await waitForBaseReady(page);
  });

  test("should render chart type menu with trigger button", async ({ page }) => {
    // Check that chart type menu container exists
    const menu = page.locator('[data-testid="chart-type-menu"]');
    await expect(menu).toBeVisible();

    // Check that trigger button exists
    const trigger = page.locator('[data-testid="chart-type-trigger"]');
    await expect(trigger).toBeVisible();

    // Trigger should display current chart type
    const triggerText = await trigger.textContent();
    expect(triggerText).toBeTruthy();
  });

  test("should open dropdown menu on trigger click", async ({ page }) => {
    const trigger = page.locator('[data-testid="chart-type-trigger"]');
    await trigger.click();

    // Dropdown should appear
    const dropdown = page.locator('[data-testid="chart-type-dropdown"]');
    await expect(dropdown).toBeVisible();

    // All 7 chart types should be present
    const optionBars = page.locator('[data-testid="charttype-item-bars"]');
    const optionCandles = page.locator('[data-testid="charttype-item-candles"]');
    const optionHollowCandles = page.locator('[data-testid="charttype-item-hollowCandles"]');
    const optionLine = page.locator('[data-testid="charttype-item-line"]');
    const optionArea = page.locator('[data-testid="charttype-item-area"]');
    const optionBaseline = page.locator('[data-testid="charttype-item-baseline"]');
    const optionColumns = page.locator('[data-testid="charttype-item-columns"]');

    await expect(optionBars).toBeVisible();
    await expect(optionCandles).toBeVisible();
    await expect(optionHollowCandles).toBeVisible();
    await expect(optionLine).toBeVisible();
    await expect(optionArea).toBeVisible();
    await expect(optionBaseline).toBeVisible();
    await expect(optionColumns).toBeVisible();
  });

  test("should switch chart type via UI: candles → line → area → bars", async ({ page }) => {
    // Initial state: should be candles (default)
    let dump = await getDump(page);
    expect(dump.ui.chartType).toBe("candles");
    expect(dump.render.baseSeriesType).toBe("Candlestick");
    expect(dump.data.baseReady).toBe(true);

    // Switch to Line
    await page.locator('[data-testid="chart-type-trigger"]').click();
    await page.locator('[data-testid="charttype-item-line"]').click();
    await page.waitForTimeout(500); // Allow series recreation

    dump = await getDump(page);
    expect(dump.ui.chartType).toBe("line");
    expect(dump.render.baseSeriesType).toBe("Line");
    expect(dump.data.baseReady).toBe(true);

    // Switch to Area
    await page.locator('[data-testid="chart-type-trigger"]').click();
    await page.locator('[data-testid="charttype-item-area"]').click();
    await page.waitForTimeout(500);

    dump = await getDump(page);
    expect(dump.ui.chartType).toBe("area");
    expect(dump.render.baseSeriesType).toBe("Area");
    expect(dump.data.baseReady).toBe(true);

    // Switch to Bars
    await page.locator('[data-testid="chart-type-trigger"]').click();
    await page.locator('[data-testid="charttype-item-bars"]').click();
    await page.waitForTimeout(500);

    dump = await getDump(page);
    expect(dump.ui.chartType).toBe("bars");
    expect(dump.render.baseSeriesType).toBe("Bar");
    expect(dump.data.baseReady).toBe(true);
  });

  test("should switch chart type via QA primitive: candles → hollowCandles → baseline → columns", async ({ page }) => {
    // Initial state
    let dump = await getDump(page);
    expect(dump.ui.chartType).toBe("candles");

    // Switch to Hollow Candles via QA
    let result = await qaSetChartType(page, "hollowCandles");
    expect(result.ok).toBe(true);
    expect(result.chartType).toBe("hollowCandles");
    await page.waitForTimeout(500);

    dump = await getDump(page);
    expect(dump.ui.chartType).toBe("hollowCandles");
    expect(dump.render.baseSeriesType).toBe("Hollow Candlestick");
    expect(dump.data.baseReady).toBe(true);

    // Switch to Baseline via QA
    result = await qaSetChartType(page, "baseline");
    expect(result.ok).toBe(true);
    expect(result.chartType).toBe("baseline");
    await page.waitForTimeout(500);

    dump = await getDump(page);
    expect(dump.ui.chartType).toBe("baseline");
    expect(dump.render.baseSeriesType).toBe("Baseline");
    expect(dump.data.baseReady).toBe(true);

    // Switch to Columns via QA
    result = await qaSetChartType(page, "columns");
    expect(result.ok).toBe(true);
    expect(result.chartType).toBe("columns");
    await page.waitForTimeout(500);

    dump = await getDump(page);
    expect(dump.ui.chartType).toBe("columns");
    expect(dump.render.baseSeriesType).toBe("Histogram");
    expect(dump.data.baseReady).toBe(true);
  });

  test("should reject invalid chart type via QA primitive", async ({ page }) => {
    const result = await qaSetChartType(page, "invalid");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid chart type");

    // Chart type should remain unchanged
    const dump = await getDump(page);
    expect(dump.ui.chartType).toBe("candles"); // Still default
  });

  test("should persist chart type in localStorage", async ({ page }) => {
    // Switch to line
    await page.locator('[data-testid="chart-type-trigger"]').click();
    await page.locator('[data-testid="charttype-item-line"]').click();
    await page.waitForTimeout(500);

    // Check localStorage
    const stored = await page.evaluate(() => {
      return localStorage.getItem("chartspro:chartType");
    });
    expect(stored).toBe("line");

    // Reload page and verify chart type is restored
    await page.reload({ waitUntil: "networkidle" });
    await waitForBaseReady(page);

    const dump = await getDump(page);
    expect(dump.ui.chartType).toBe("line");
  });

  test("should maintain data readiness across all chart types", async ({ page }) => {
    const types = ["bars", "candles", "hollowCandles", "line", "area", "baseline", "columns"];

    for (const type of types) {
      await qaSetChartType(page, type);
      await page.waitForTimeout(500);

      const dump = await getDump(page);
      expect(dump.ui.chartType).toBe(type);
      expect(dump.data.baseReady).toBe(true);
      expect(dump.pricePoints).toBeGreaterThan(0);
    }
  });

  test("should not crash or log errors during type switching", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Switch through all types
    const types = ["line", "area", "baseline", "bars", "candles", "hollowCandles", "columns"];
    for (const type of types) {
      await qaSetChartType(page, type);
      await page.waitForTimeout(300);
    }

    // Filter out expected/benign errors (if any)
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes("removeChild") // Known benign error
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("should update dump() contract fields correctly", async ({ page }) => {
    // Test each type's dump() output
    const typeMap: Record<string, string> = {
      bars: "Bar",
      candles: "Candlestick",
      hollowCandles: "Hollow Candlestick",
      line: "Line",
      area: "Area",
      baseline: "Baseline",
      columns: "Histogram",
    };

    for (const [type, displayName] of Object.entries(typeMap)) {
      await qaSetChartType(page, type);
      await page.waitForTimeout(300);

      const dump = await getDump(page);
      expect(dump.ui.chartType).toBe(type);
      expect(dump.render.baseSeriesType).toBe(displayName);
      
      // Verify dump structure
      expect(dump.ui).toBeDefined();
      expect(dump.render).toBeDefined();
      expect(typeof dump.ui.chartType).toBe("string");
      expect(typeof dump.render.baseSeriesType).toBe("string");
    }
  });
});
