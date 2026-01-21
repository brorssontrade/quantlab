/**
 * TV-10.3: Apply Settings to Rendering Tests
 * 
 * Verifies that settings from SettingsPanel actually affect chart rendering.
 * Uses dump().render.appliedSettings for deterministic assertions.
 * 
 * Tests with --repeat-each=10 to ensure determinism.
 */

import { test, expect, type Page } from "@playwright/test";
import { gotoChartsPro, waitForChartData } from "./helpers/chartsProNav";

test.describe("ChartsPro - TV-10.3: Settings Application", () => {
  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page);
    await waitForChartData(page);
    await page.getByTestId("settings-button").waitFor({ state: "visible" });
  });

  test("TV-10.3.1: Initial settings snapshot is captured", async ({ page }) => {
    const dump = await page.evaluate(() => window.__lwcharts.dump());
    
    expect(dump.render.appliedSettings).toBeDefined();
    expect(dump.render.appliedSettings).not.toBeNull();
    expect(dump.render.appliedSettings.chartType).toBe("candles"); // default
    expect(dump.render.appliedSettings.appearance).toBeDefined();
    expect(dump.render.appliedSettings.scales).toBeDefined();
  });

  test("TV-10.3.2: Grid toggle affects rendering", async ({ page }) => {
    // Open settings panel
    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-panel").waitFor({ state: "visible" });
    
    // Get initial grid state
    const initialDump = await page.evaluate(() => window.__lwcharts.dump());
    const initialGridVisible = initialDump.render.appliedSettings?.appearance.gridVisible;
    expect(typeof initialGridVisible).toBe("boolean");
    
    // Toggle grid
    await page.getByTestId("settings-grid-visible").click();
    
    // Wait for settings to apply (short delay for useEffect)
    await page.waitForTimeout(100);
    
    // Verify dump reflects change
    const afterDump = await page.evaluate(() => window.__lwcharts.dump());
    expect(afterDump.render.appliedSettings.appearance.gridVisible).toBe(!initialGridVisible);
  });

  test("TV-10.3.3: Background dark toggle affects rendering", async ({ page }) => {
    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-panel").waitFor({ state: "visible" });
    
    const initialDump = await page.evaluate(() => window.__lwcharts.dump());
    const initialBgDark = initialDump.render.appliedSettings?.appearance.backgroundDark;
    
    await page.getByTestId("settings-background-dark").click();
    await page.waitForTimeout(100);
    
    const afterDump = await page.evaluate(() => window.__lwcharts.dump());
    expect(afterDump.render.appliedSettings.appearance.backgroundDark).toBe(!initialBgDark);
  });

  test("TV-10.3.4: Wick and border toggles work independently", async ({ page }) => {
    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-panel").waitFor({ state: "visible" });
    
    // Toggle wicks off
    await page.getByTestId("settings-wick-visible").click();
    await page.waitForTimeout(100);
    let dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.render.appliedSettings.appearance.wickVisible).toBe(false);
    
    // Toggle borders off (wicks should stay off)
    await page.getByTestId("settings-border-visible").click();
    await page.waitForTimeout(100);
    dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.render.appliedSettings.appearance.wickVisible).toBe(false);
    expect(dump.render.appliedSettings.appearance.borderVisible).toBe(false);
  });

  test("TV-10.3.5: Chart type switch preserves settings", async ({ page }) => {
    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-panel").waitFor({ state: "visible" });
    
    // Toggle grid off
    await page.getByTestId("settings-grid-visible").click();
    await page.waitForTimeout(100);
    let dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.render.appliedSettings.appearance.gridVisible).toBe(false);
    expect(dump.render.appliedSettings.chartType).toBe("candles");
    
    // Close settings panel
    await page.getByTestId("settings-close").click();
    await page.getByTestId("settings-panel").waitFor({ state: "hidden" });
    
    // Switch to line chart
    await page.getByTestId("chart-type-button").click();
    await page.getByTestId("chart-type-option-line").click();
    await page.waitForTimeout(200);
    
    // Verify grid setting persisted but chartType updated
    dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.render.appliedSettings.appearance.gridVisible).toBe(false);
    expect(dump.render.appliedSettings.chartType).toBe("line");
  });

  test("TV-10.3.6: Scale mode updates settings snapshot", async ({ page }) => {
    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-panel").waitFor({ state: "visible" });

    // Switch to log scale
    await page.getByTestId("settings-scale-log").click();
    await page.waitForTimeout(100);

    const dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.render.appliedSettings.scales.mode).toBe("log");
  });

  test("TV-10.3.7: appliedAt timestamp updates on settings change", async ({ page }) => {
    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-panel").waitFor({ state: "visible" });
    
    const dump1 = await page.evaluate(() => window.__lwcharts.dump());
    const ts1 = dump1.render.appliedSettings?.appliedAt;
    expect(typeof ts1).toBe("number");
    expect(ts1).toBeGreaterThan(0);
    
    // Wait a bit then toggle grid
    await page.waitForTimeout(50);
    await page.getByTestId("settings-grid-visible").click();
    await page.waitForTimeout(100);
    
    const dump2 = await page.evaluate(() => window.__lwcharts.dump());
    const ts2 = dump2.render.appliedSettings?.appliedAt;
    expect(ts2).toBeGreaterThan(ts1); // Timestamp should be newer
  });

  test("TV-10.3.8: Settings persist across symbol switch", async ({ page }) => {
    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-panel").waitFor({ state: "visible" });
    
    const initialDump = await page.evaluate(() => window.__lwcharts.dump());
    const initialBgDark = initialDump.render.appliedSettings?.appearance.backgroundDark;

    // Toggle background dark
    await page.getByTestId("settings-background-dark").click();
    await page.waitForTimeout(100);
    let dump = await page.evaluate(() => window.__lwcharts.dump());
    const toggledBg = dump.render.appliedSettings.appearance.backgroundDark;
    expect(toggledBg).toBe(!initialBgDark);
    
    // Close settings, switch symbol
    await page.getByTestId("settings-close").click();
    await page.getByTestId("settings-panel").waitFor({ state: "hidden" });
    await page.getByTestId("topbar-symbol-input").fill("MSFT.US");
    await page.getByTestId("topbar-symbol-input").press("Enter");
    await waitForChartData(page);
    
    // Verify settings persisted
    dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.render.appliedSettings.appearance.backgroundDark).toBe(toggledBg);
  });
});
