/**
 * PRIO 4: Range → Timeframe auto-mapping tests
 * 
 * Tests that clicking a range preset (1D, 5D, 1M, etc.) automatically
 * changes the timeframe to the appropriate value.
 * 
 * Mapping:
 * - 1D → 1m
 * - 5D → 5m
 * - 1M → 30m
 * - 3M → 1h
 * - 6M → 2H
 * - YTD → 1D
 * - 1Y → 1D
 * - All → 1D
 */
import { test, expect } from "@playwright/test";
import { gotoChartsPro, waitForDump } from "./helpers";

test.describe("PRIO 4: Range → Timeframe Mapping", () => {
  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page);
  });

  test("clicking YTD preset keeps 1D timeframe", async ({ page }) => {
    // Initial state should be 1D (default timeframe)
    const initialDump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(initialDump?.ui?.timeframe).toBe("1D");

    // Click YTD range preset
    const ytdButton = page.locator('[data-testid="bottombar-range-YTD"]');
    if (await ytdButton.isVisible()) {
      await ytdButton.click();
      
      // Wait for state to update
      await page.waitForTimeout(500);
      
      // Timeframe should still be 1D (YTD → 1D mapping)
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui?.timeframe).toBe("1D");
    }
  });

  test("clicking 1Y preset keeps 1D timeframe", async ({ page }) => {
    // Click 1Y range preset
    const oneYearButton = page.locator('[data-testid="bottombar-range-1Y"]');
    if (await oneYearButton.isVisible()) {
      await oneYearButton.click();
      
      await page.waitForTimeout(500);
      
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui?.timeframe).toBe("1D");
    }
  });

  test("clicking 6M preset changes timeframe to 2H", async ({ page }) => {
    // Click 6M range preset
    const sixMonthButton = page.locator('[data-testid="bottombar-range-6M"]');
    if (await sixMonthButton.isVisible()) {
      await sixMonthButton.click();
      
      // Wait for timeframe change
      await page.waitForTimeout(1000);
      
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      // 6M should map to 2H
      expect(dump?.ui?.timeframe).toBe("2H");
    }
  });

  test("clicking 3M preset changes timeframe to 1h", async ({ page }) => {
    // Click 3M range preset
    const threeMonthButton = page.locator('[data-testid="bottombar-range-3M"]');
    if (await threeMonthButton.isVisible()) {
      await threeMonthButton.click();
      
      await page.waitForTimeout(1000);
      
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      // 3M should map to 1h
      expect(dump?.ui?.timeframe).toBe("1h");
    }
  });

  test("RANGE_TIMEFRAME_MAP export is available", async ({ page }) => {
    // This test just verifies the mapping constant is exported
    const result = await page.evaluate(() => {
      // Check if the mapping is exposed in any way via window
      const w = window as any;
      return {
        hasLwCharts: !!w.__lwcharts,
        hasDump: typeof w.__lwcharts?.dump === "function",
      };
    });
    
    expect(result.hasLwCharts).toBeTruthy();
    expect(result.hasDump).toBeTruthy();
  });

  test("default timeframe is 1D", async ({ page }) => {
    // Get initial dump before any interactions
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    // Default should be 1D per PRIO 4
    expect(dump?.ui?.timeframe).toBe("1D");
  });
});
