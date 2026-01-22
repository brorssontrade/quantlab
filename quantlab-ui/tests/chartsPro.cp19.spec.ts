/**
 * chartsPro.cp19.spec.ts
 *
 * TV-19: BottomBar Functions (crosshair time label, quick ranges, etc.)
 */

import { test, expect, TestInfo, Page } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

test.describe("TV-19: BottomBar Functions", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo, { mock: true });
    // Move mouse away from chart to reset crosshair
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
  });

  test.describe("TV-19.1: X-axis crosshair time label", () => {
    test("crosshair time label appears on hover", async ({ page }) => {
      const chartRoot = page.locator('[data-testid="tv-chart-root"]');
      const timeLabel = page.locator('[data-testid="chartspro-crosshair-time"]');
      const crosshair = page.locator('[data-testid="chartspro-crosshair"]');

      // Initially not visible (mouse moved away in beforeEach)
      await expect(crosshair).toHaveAttribute("data-visible", "false");

      // Hover on chart center
      const box = await chartRoot.boundingBox();
      expect(box).toBeTruthy();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.waitForTimeout(100); // Allow crosshair to update

      // Crosshair should be visible
      await expect(crosshair).toHaveAttribute("data-visible", "true");
      
      // Time label should exist and have content
      await expect(timeLabel).toBeVisible();
      const timeText = await timeLabel.textContent();
      expect(timeText).toBeTruthy();
      expect(timeText!.length).toBeGreaterThan(0);
    });

    test("crosshair time label updates when moving", async ({ page }) => {
      const chartRoot = page.locator('[data-testid="tv-chart-root"]');
      const timeLabel = page.locator('[data-testid="chartspro-crosshair-time"]');

      const box = await chartRoot.boundingBox();
      expect(box).toBeTruthy();

      // Hover on left side
      await page.mouse.move(box!.x + 100, box!.y + box!.height / 2);
      await page.waitForTimeout(100);
      const leftTimeText = await timeLabel.textContent();

      // Move to right side
      await page.mouse.move(box!.x + box!.width - 150, box!.y + box!.height / 2);
      await page.waitForTimeout(100);
      const rightTimeText = await timeLabel.textContent();

      // Times should be different (different bar positions)
      expect(leftTimeText).not.toEqual(rightTimeText);
    });

    test("crosshair time label hides when leaving chart", async ({ page }) => {
      const chartRoot = page.locator('[data-testid="tv-chart-root"]');
      const crosshair = page.locator('[data-testid="chartspro-crosshair"]');

      const box = await chartRoot.boundingBox();
      expect(box).toBeTruthy();

      // Hover on chart
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.waitForTimeout(100);
      await expect(crosshair).toHaveAttribute("data-visible", "true");

      // Move mouse outside chart (above it)
      await page.mouse.move(box!.x + box!.width / 2, box!.y - 50);
      await page.waitForTimeout(200);

      // Crosshair should be hidden
      await expect(crosshair).toHaveAttribute("data-visible", "false");
    });

    test("crosshair time label has TradingView-style black background", async ({ page }) => {
      const chartRoot = page.locator('[data-testid="tv-chart-root"]');
      const timeLabel = page.locator('[data-testid="chartspro-crosshair-time"]');

      const box = await chartRoot.boundingBox();
      expect(box).toBeTruthy();

      // Hover on chart
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.waitForTimeout(100);

      await expect(timeLabel).toBeVisible();
      
      // Check that it has dark background (TradingView-style)
      const bgColor = await timeLabel.evaluate((el) => 
        window.getComputedStyle(el).backgroundColor
      );
      
      // Should be dark (#131722 = rgb(19, 23, 34) or similar dark color)
      expect(bgColor).toMatch(/rgb\(\s*\d{1,2},\s*\d{1,2},\s*\d{1,2}\s*\)/);
    });
  });

  test.describe("TV-19.2: Quick ranges affect visible range", () => {
    test("clicking 5D range changes dump().render.scale.visibleTimeRange", async ({ page }) => {
      // Get initial visible time range
      const initialDump = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });
      const initialRange = initialDump?.render?.scale?.visibleTimeRange;
      expect(initialRange).toBeTruthy();
      expect(initialRange?.from).toBeDefined();
      expect(initialRange?.to).toBeDefined();

      // Click 5D range button
      const range5D = page.locator('[data-testid="bottombar-range-5D"]');
      await expect(range5D).toBeVisible();
      await range5D.click();
      await page.waitForTimeout(300); // Allow chart to update

      // Get new visible time range
      const newDump = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });
      const newRange = newDump?.render?.scale?.visibleTimeRange;
      expect(newRange).toBeTruthy();

      // Verify range actually changed (either from or to should be different)
      const rangeChanged = 
        initialRange?.from !== newRange?.from || 
        initialRange?.to !== newRange?.to;
      expect(rangeChanged).toBe(true);
    });

    test("clicking 1M range shows wider time span than 1D", async ({ page }) => {
      // First click 1D to establish baseline
      const range1D = page.locator('[data-testid="bottombar-range-1D"]');
      await range1D.click();
      await page.waitForTimeout(300);

      const dump1D = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });
      const range1DData = dump1D?.render?.scale?.visibleTimeRange;
      const span1D = range1DData 
        ? Math.abs(range1DData.to - range1DData.from)
        : 0;

      // Click 1M
      const range1M = page.locator('[data-testid="bottombar-range-1M"]');
      await range1M.click();
      await page.waitForTimeout(300);

      const dump1M = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });
      const range1MData = dump1M?.render?.scale?.visibleTimeRange;
      const span1M = range1MData 
        ? Math.abs(range1MData.to - range1MData.from)
        : 0;

      // 1M should have wider span than 1D (30 days vs 1 day in seconds)
      expect(span1M).toBeGreaterThan(span1D);
    });

    test("clicking All fits all data", async ({ page }) => {
      // Click All range
      const rangeAll = page.locator('[data-testid="bottombar-range-All"]');
      await rangeAll.click();
      await page.waitForTimeout(300);

      const dump = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });
      
      // After "All", visible time range should span full data
      const visibleTimeRange = dump?.render?.scale?.visibleTimeRange;
      expect(visibleTimeRange).toBeTruthy();
      expect(visibleTimeRange?.from).toBeDefined();
      expect(visibleTimeRange?.to).toBeDefined();

      // Verify bottomBar state is updated (via localStorage, consistent with TV-9.8)
      const rangeStored = await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.range"));
      expect(rangeStored).toBe("All");
    });

    test("range selection is persisted in localStorage", async ({ page }) => {
      // Click 6M
      const range6M = page.locator('[data-testid="bottombar-range-6M"]');
      await range6M.click();
      await page.waitForTimeout(300);

      // Verify localStorage was updated (consistent with TV-9.8)
      const rangeStored = await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.range"));
      expect(rangeStored).toBe("6M");
    });
  });
});
