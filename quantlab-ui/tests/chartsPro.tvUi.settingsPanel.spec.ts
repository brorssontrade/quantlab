/**
 * TV-10.2: Settings Gear Panel (Overlay)
 *
 * Scenario: User clicks ⚙️ gear icon → settings panel opens as overlay
 * 
 * Tests:
 * - Open/close via button click
 * - Close via Esc key
 * - Close via click outside
 * - Change candle up color → assert dump().ui.settings
 * - Toggle grid visibility → assert dump().ui.settings
 * - Change scale mode → assert dump().ui.settings
 * - Reload page → settings restored from localStorage
 * 
 * Test pattern: Follow chartsProNav.ts helpers, use ?mock=1 for determinism
 */

import { test, expect } from "@playwright/test";
import { gotoChartsPro, waitForChartData } from "./helpers/chartsProNav";

test.describe("TV-10.2: Settings Panel", () => {
  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page, { mock: true });
    await waitForChartData(page);
    await page.waitForTimeout(500); // Chart stabilization
  });

  test("CP10.1: Settings button opens/closes panel @repeat-each=10", async ({ page }) => {
    // Click settings button to open
    const settingsButton = page.locator('[data-testid="settings-button"]');
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    // Assert panel visible
    const panel = page.locator('[data-testid="settings-panel"]');
    await expect(panel).toBeVisible();

    // Assert sections visible
    await expect(page.locator("text=Appearance")).toBeVisible();
    await expect(page.locator("text=Price Scale")).toBeVisible();

    // Close by clicking X button
    const closeButton = panel.locator('[data-testid="settings-close"]');
    await closeButton.click();
    await expect(panel).not.toBeVisible();
  });

  test("CP10.2: Esc key closes panel @repeat-each=10", async ({ page }) => {
    // Open settings panel
    await page.locator('[data-testid="settings-button"]').click();
    const panel = page.locator('[data-testid="settings-panel"]');
    await expect(panel).toBeVisible();
    await page.waitForTimeout(100); // Wait for panel animation

    // Press Esc
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
  });

  test("CP10.3: Click outside closes panel @repeat-each=10", async ({ page }) => {
    // Open settings panel
    await page.locator('[data-testid="settings-button"]').click();
    const panel = page.locator('[data-testid="settings-panel"]');
    await expect(panel).toBeVisible();

    // Click outside (on chart canvas)
    await page.locator('[data-testid="tv-chart-root"]').click({ position: { x: 100, y: 100 } });
    await expect(panel).not.toBeVisible();
  });

  test("CP10.4: Change candle up color → dump().ui.settings reflects @repeat-each=10", async ({ page }) => {
    // Open panel
    await page.locator('[data-testid="settings-button"]').click();
    await page.waitForTimeout(100);

    // Change candle up color
    const colorInput = page.locator('input[data-testid="settings-candle-up-color"]');
    await colorInput.fill("#00ff00"); // Bright green

    // Close panel
    await page.locator('[data-testid="settings-close"]').click();

    // Assert dump().ui.settings
    const dump = await page.evaluate(() => {
      const w = window as any;
      return w.__lwcharts?.dump?.();
    });

    expect(dump.ui.settings).toBeDefined();
    expect(dump.ui.settings.appearance.candleUpColor).toBe("#00ff00");
  });

  test("CP10.5: Toggle grid visibility → dump().ui.settings reflects @repeat-each=10", async ({ page }) => {
    // Get initial state
    const dumpBefore = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    const gridVisibleBefore = dumpBefore.ui.settings?.appearance.gridVisible ?? true;

    // Open panel
    await page.locator('[data-testid="settings-button"]').click();
    await page.waitForTimeout(100);

    // Toggle grid checkbox
    const gridCheckbox = page.locator('input[data-testid="settings-grid-visible"]');
    await gridCheckbox.click();

    // Close panel
    await page.locator('[data-testid="settings-close"]').click();

    // Assert dump().ui.settings
    const dumpAfter = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dumpAfter.ui.settings.appearance.gridVisible).toBe(!gridVisibleBefore);
  });

  test("CP10.6: Change scale mode → dump().ui.settings reflects @repeat-each=10", async ({ page }) => {
    // Open panel
    await page.locator('[data-testid="settings-button"]').click();
    await page.waitForTimeout(100);

    // Select logarithmic scale
    const logRadio = page.locator('input[data-testid="settings-scale-log"]');
    await logRadio.click();

    // Close panel
    await page.locator('[data-testid="settings-close"]').click();

    // Assert dump().ui.settings
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump.ui.settings.scales.mode).toBe("log");
  });

  test("CP10.7: Settings persist after reload @repeat-each=10", async ({ page }) => {
    // Open panel and change settings
    await page.locator('[data-testid="settings-button"]').click();
    await page.waitForTimeout(100);

    // Change candle down color to purple
    const colorInput = page.locator('input[data-testid="settings-candle-down-color"]');
    await colorInput.fill("#9c27b0");

    // Change scale to percent
    const percentRadio = page.locator('input[data-testid="settings-scale-percent"]');
    await percentRadio.click();

    // Close panel
    await page.locator('[data-testid="settings-close"]').click();

    // Reload page
    await page.reload();
    await gotoChartsPro(page, { mock: true });
    await waitForChartData(page);
    await page.waitForTimeout(500);

    // Assert settings restored
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump.ui.settings.appearance.candleDownColor).toBe("#9c27b0");
    expect(dump.ui.settings.scales.mode).toBe("percent");
  });

  test("CP10.8: All appearance controls functional @repeat-each=10", async ({ page }) => {
    await page.locator('[data-testid="settings-button"]').click();
    await page.waitForTimeout(100);

    // Test all controls
    await page.locator('input[data-testid="settings-candle-up-color"]').fill("#26a69a");
    await page.locator('input[data-testid="settings-candle-down-color"]').fill("#ef5350");

    const wickCheckbox = page.locator('input[data-testid="settings-wick-visible"]');
    const wickStateBefore = await wickCheckbox.isChecked();
    await wickCheckbox.click();

    const borderCheckbox = page.locator('input[data-testid="settings-border-visible"]');
    const borderStateBefore = await borderCheckbox.isChecked();
    await borderCheckbox.click();

    const gridCheckbox = page.locator('input[data-testid="settings-grid-visible"]');
    const gridStateBefore = await gridCheckbox.isChecked();
    await gridCheckbox.click();

    const bgCheckbox = page.locator('input[data-testid="settings-background-dark"]');
    const bgStateBefore = await bgCheckbox.isChecked();
    await bgCheckbox.click();

    // Close and verify
    await page.locator('[data-testid="settings-close"]').click();

    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump.ui.settings.appearance.wickVisible).toBe(!wickStateBefore);
    expect(dump.ui.settings.appearance.borderVisible).toBe(!borderStateBefore);
    expect(dump.ui.settings.appearance.gridVisible).toBe(!gridStateBefore);
    expect(dump.ui.settings.appearance.backgroundDark).toBe(!bgStateBefore);
  });

  test("CP10.9: Settings panel does not affect TopBar height @repeat-each=10", async ({ page }) => {
    // Measure TopBar height before opening panel
    const topBarBefore = await page.locator('[data-testid="tv-topbar-root"]').boundingBox();
    const heightBefore = topBarBefore?.height ?? 0;

    // Open settings panel
    await page.locator('[data-testid="settings-button"]').click();
    await page.waitForTimeout(100); // Animation

    // Measure TopBar height with panel open
    const topBarAfter = await page.locator('[data-testid="tv-topbar-root"]').boundingBox();
    const heightAfter = topBarAfter?.height ?? 0;

    // Assert heights equal (panel is overlay, not layout-affecting)
    expect(heightAfter).toBe(heightBefore);
  });
});
