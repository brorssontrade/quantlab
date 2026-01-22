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
});
