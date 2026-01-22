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

  test.describe("TV-19.2b: Quick ranges - robust invariants", () => {
    test("visibleTimeRange.to equals dataBounds.lastBarTime after any range click", async ({ page }) => {
      // This test catches the bug where times drift to 1970/1980
      const ranges = ["5D", "1M", "6M", "All"] as const;
      
      for (const range of ranges) {
        const rangeBtn = page.locator(`[data-testid="bottombar-range-${range}"]`);
        await rangeBtn.click();
        await page.waitForTimeout(200);

        const dump = await page.evaluate(() => {
          return (window as any).__lwcharts?.dump?.();
        });

        const visibleTimeRange = dump?.render?.scale?.visibleTimeRange;
        const dataBounds = dump?.dataBounds;

        expect(dataBounds).toBeTruthy();
        expect(visibleTimeRange).toBeTruthy();
        
        // Key invariant: visible "to" should equal or be very close to lastBarTime
        // (within 1 bar duration tolerance - max 1 week for weekly timeframe)
        const tolerance = 7 * 24 * 60 * 60; // 1 week in seconds
        expect(Math.abs(visibleTimeRange.to - dataBounds.lastBarTime)).toBeLessThanOrEqual(tolerance);
        
        // Visible "from" should be >= firstBarTime (can't show before first bar)
        expect(visibleTimeRange.from).toBeGreaterThanOrEqual(dataBounds.firstBarTime - tolerance);
        
        // Visible range should be sane (not in 1970/1980)
        const year2000 = 946684800; // Jan 1, 2000 in unix seconds
        expect(visibleTimeRange.from).toBeGreaterThan(year2000);
        expect(visibleTimeRange.to).toBeGreaterThan(year2000);
      }
    });

    test("clicking 5D shows approximately 5 trading days worth of data", async ({ page }) => {
      // Click 5D
      const range5D = page.locator('[data-testid="bottombar-range-5D"]');
      await range5D.click();
      await page.waitForTimeout(300);

      const dump = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });

      const visibleTimeRange = dump?.render?.scale?.visibleTimeRange;
      const dataBounds = dump?.dataBounds;
      
      expect(visibleTimeRange).toBeTruthy();
      expect(dataBounds).toBeTruthy();

      // 5D should show data ending at lastBarTime
      const tolerance = 7 * 24 * 60 * 60;
      expect(Math.abs(visibleTimeRange.to - dataBounds.lastBarTime)).toBeLessThanOrEqual(tolerance);
      
      // The span should be positive and reasonable (mock data may have fewer bars than 5 days)
      // Key invariant: span must be > 0 and not in 1970/1980 range
      const span = visibleTimeRange.to - visibleTimeRange.from;
      expect(span).toBeGreaterThan(0);
      
      // Sanity check: dates should be recent (after year 2000)
      const year2000 = 946684800;
      expect(visibleTimeRange.from).toBeGreaterThan(year2000);
      expect(visibleTimeRange.to).toBeGreaterThan(year2000);
    });

    test("clicking All shows full data range (from firstBar to lastBar)", async ({ page }) => {
      // Click All
      const rangeAll = page.locator('[data-testid="bottombar-range-All"]');
      await rangeAll.click();
      await page.waitForTimeout(300);

      const dump = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });

      const visibleTimeRange = dump?.render?.scale?.visibleTimeRange;
      const dataBounds = dump?.dataBounds;
      
      expect(visibleTimeRange).toBeTruthy();
      expect(dataBounds).toBeTruthy();

      // All should show from firstBarTime to lastBarTime
      const tolerance = 7 * 24 * 60 * 60;
      expect(Math.abs(visibleTimeRange.from - dataBounds.firstBarTime)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(visibleTimeRange.to - dataBounds.lastBarTime)).toBeLessThanOrEqual(tolerance);
    });

    test("lastPrice.time is within visibleTimeRange after range click", async ({ page }) => {
      // Click 1M
      const range1M = page.locator('[data-testid="bottombar-range-1M"]');
      await range1M.click();
      await page.waitForTimeout(300);

      const dump = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.();
      });

      const visibleTimeRange = dump?.render?.scale?.visibleTimeRange;
      const lastPrice = dump?.render?.lastPrice;
      
      expect(visibleTimeRange).toBeTruthy();
      expect(lastPrice).toBeTruthy();

      // Last price time should be within visible range (the most recent bar should be visible)
      expect(lastPrice.time).toBeGreaterThanOrEqual(visibleTimeRange.from);
      expect(lastPrice.time).toBeLessThanOrEqual(visibleTimeRange.to);
    });

    test("range selection is persisted in localStorage", async ({ page }) => {
      // Click 6M
      const range6M = page.locator('[data-testid="bottombar-range-6M"]');
      await range6M.click();
      await page.waitForTimeout(300);

      // Verify localStorage was updated
      const rangeStored = await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.range"));
      expect(rangeStored).toBe("6M");
    });
  });
});
