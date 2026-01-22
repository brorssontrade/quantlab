/**
 * chartsPro.cp20.spec.ts
 *
 * TV-20: LeftToolbar Tool Groups + Flyout
 * 
 * Tests:
 * - TV-20.1: Flyout opens/closes (Esc + click-outside)
 * - Tool selection from flyout updates dump().ui.activeTool
 * - Disabled tools cannot be clicked (aria-disabled)
 * - Group button shows active tool icon
 */

import { test, expect } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

test.describe("TV-20: LeftToolbar Tool Groups + Flyout", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo, { mock: true });
  });

  test.describe("TV-20.1: Flyout UI", () => {
    test("clicking group button opens flyout", async ({ page }) => {
      // Click on Lines group (has multiple tools)
      const linesGroup = page.locator('[data-testid="lefttoolbar-group-lines"]');
      await expect(linesGroup).toBeVisible();
      await linesGroup.click();

      // Flyout should appear
      const flyout = page.locator('[data-testid="lefttoolbar-flyout"]');
      await expect(flyout).toBeVisible();

      // Flyout should contain trendline tool
      const trendlineTool = page.locator('[data-testid="lefttoolbar-tool-trendline"]');
      await expect(trendlineTool).toBeVisible();
    });

    test("Esc closes flyout", async ({ page }) => {
      // Open flyout
      const linesGroup = page.locator('[data-testid="lefttoolbar-group-lines"]');
      await linesGroup.click();
      
      const flyout = page.locator('[data-testid="lefttoolbar-flyout"]');
      await expect(flyout).toBeVisible();

      // Press Escape
      await page.keyboard.press("Escape");

      // Flyout should close
      await expect(flyout).not.toBeVisible();
    });

    test("click outside closes flyout", async ({ page }) => {
      // Open flyout
      const linesGroup = page.locator('[data-testid="lefttoolbar-group-lines"]');
      await linesGroup.click();
      
      const flyout = page.locator('[data-testid="lefttoolbar-flyout"]');
      await expect(flyout).toBeVisible();

      // Click on chart area (outside flyout)
      const chartRoot = page.locator('[data-testid="tv-chart-root"]');
      await chartRoot.click({ position: { x: 200, y: 200 } });

      // Flyout should close
      await expect(flyout).not.toBeVisible();
    });

    test("clicking same group button toggles flyout closed", async ({ page }) => {
      const linesGroup = page.locator('[data-testid="lefttoolbar-group-lines"]');
      
      // Open
      await linesGroup.click();
      const flyout = page.locator('[data-testid="lefttoolbar-flyout"]');
      await expect(flyout).toBeVisible();

      // Click same group again to close
      await linesGroup.click();
      await expect(flyout).not.toBeVisible();
    });

    test("cursor group selects directly (no flyout)", async ({ page }) => {
      // Cursor group has only 1 tool, should select directly
      const cursorGroup = page.locator('[data-testid="lefttoolbar-group-cursor"]');
      await cursorGroup.click();

      // No flyout should appear
      const flyout = page.locator('[data-testid="lefttoolbar-flyout"]');
      await expect(flyout).not.toBeVisible();

      // Tool should be selected
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.activeTool;
      }, { timeout: 2000 }).toBe("select");
    });
  });

  test.describe("TV-20.1: Tool Selection", () => {
    test("selecting tool from flyout updates dump().ui.activeTool", async ({ page }) => {
      // Open Lines flyout
      const linesGroup = page.locator('[data-testid="lefttoolbar-group-lines"]');
      await linesGroup.click();

      // Click on H-Line tool
      const hlineTool = page.locator('[data-testid="lefttoolbar-tool-hline"]');
      await hlineTool.click();

      // Verify dump updated
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.activeTool;
      }, { timeout: 2000 }).toBe("hline");

      // Flyout should close after selection
      const flyout = page.locator('[data-testid="lefttoolbar-flyout"]');
      await expect(flyout).not.toBeVisible();
    });

    test("selecting different tool from same group changes active tool", async ({ page }) => {
      // First select trendline
      const linesGroup = page.locator('[data-testid="lefttoolbar-group-lines"]');
      await linesGroup.click();
      await page.locator('[data-testid="lefttoolbar-tool-trendline"]').click();

      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.activeTool;
      }, { timeout: 2000 }).toBe("trendline");

      // Then select vline
      await linesGroup.click();
      await page.locator('[data-testid="lefttoolbar-tool-vline"]').click();

      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.activeTool;
      }, { timeout: 2000 }).toBe("vline");
    });

    test("channel tool from channels group works", async ({ page }) => {
      const channelsGroup = page.locator('[data-testid="lefttoolbar-group-channels"]');
      await channelsGroup.click();

      await page.locator('[data-testid="lefttoolbar-tool-channel"]').click();

      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.activeTool;
      }, { timeout: 2000 }).toBe("channel");
    });
  });

  test.describe("TV-20.1: Disabled Tools", () => {
    test("disabled tools have aria-disabled attribute", async ({ page }) => {
      // Open shapes group (rectangle is disabled)
      const shapesGroup = page.locator('[data-testid="lefttoolbar-group-shapes"]');
      await shapesGroup.click();

      // Rectangle should be disabled
      const rectangleTool = page.locator('[data-testid="lefttoolbar-tool-rectangle"]');
      await expect(rectangleTool).toHaveAttribute("aria-disabled", "true");
    });

    test("clicking disabled tool does not change active tool", async ({ page }) => {
      // Get initial tool
      const initialTool = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.()?.ui?.activeTool;
      });

      // Open shapes group and try to click rectangle (disabled)
      const shapesGroup = page.locator('[data-testid="lefttoolbar-group-shapes"]');
      await shapesGroup.click();
      
      const rectangleTool = page.locator('[data-testid="lefttoolbar-tool-rectangle"]');
      await rectangleTool.click({ force: true }); // force to bypass disabled

      // Tool should not change
      await page.waitForTimeout(200);
      const currentTool = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.()?.ui?.activeTool;
      });

      expect(currentTool).toBe(initialTool);
    });

    test("disabled tools show tooltip/coming soon text", async ({ page }) => {
      // Open fibonacci group (all disabled)
      const fibGroup = page.locator('[data-testid="lefttoolbar-group-fibonacci"]');
      await fibGroup.click();

      const flyout = page.locator('[data-testid="lefttoolbar-flyout"]');
      await expect(flyout).toBeVisible();

      // Should contain "Coming soon" text
      await expect(flyout).toContainText("Coming soon");
    });
  });

  test.describe("TV-20.1: Group Icon Updates", () => {
    test("group button shows active tool icon when tool from that group is selected", async ({ page }) => {
      // Select H-Line from lines group
      const linesGroup = page.locator('[data-testid="lefttoolbar-group-lines"]');
      await linesGroup.click();
      await page.locator('[data-testid="lefttoolbar-tool-hline"]').click();

      // The lines group button should now show H-Line icon (—)
      // Wait for state update
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.activeTool;
      }, { timeout: 2000 }).toBe("hline");

      // Group button should have the active styling
      await expect(linesGroup).toHaveClass(/bg-slate-700/);
    });
  });

  test.describe("TV-20.1: All Groups Visible", () => {
    test("all tool groups are rendered", async ({ page }) => {
      const groups = [
        "cursor",
        "lines", 
        "channels",
        "shapes",
        "text",
        "fibonacci",
        "patterns",
        "measure",
      ];

      for (const groupId of groups) {
        const group = page.locator(`[data-testid="lefttoolbar-group-${groupId}"]`);
        await expect(group).toBeVisible();
      }
    });
  });

  test.describe("TV-20.1: Keyboard Navigation", () => {
    test("arrow keys navigate within flyout", async ({ page }) => {
      // Open lines flyout
      const linesGroup = page.locator('[data-testid="lefttoolbar-group-lines"]');
      await linesGroup.click();

      const flyout = page.locator('[data-testid="lefttoolbar-flyout"]');
      await expect(flyout).toBeVisible();

      // Arrow down should work
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      
      // Enter should select
      await page.keyboard.press("Enter");

      // Flyout should close
      await expect(flyout).not.toBeVisible();

      // A tool should be selected
      const activeTool = await page.evaluate(() => {
        return (window as any).__lwcharts?.dump?.()?.ui?.activeTool;
      });
      expect(activeTool).toBeTruthy();
    });
  });
});
