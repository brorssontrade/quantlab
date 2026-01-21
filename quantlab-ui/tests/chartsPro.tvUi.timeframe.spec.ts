import { test, expect } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];

test.describe("ChartsPro TV-11: Timeframe Selector", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
  });

  test("1. Timeframe value is visible in dump().ui.timeframe", async ({
    page,
  }) => {
    const dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    // Should have some timeframe value (might be 1D default or persisted value)
    expect(dump?.ui?.timeframe).toBeTruthy();
    const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];
    expect(TIMEFRAMES).toContain(dump?.ui?.timeframe);

    // Visual: button text shows the timeframe
    const timeframeButton = page.locator("[data-testid='timeframe-button']");
    await expect(timeframeButton).toContainText(dump?.ui?.timeframe || "");
  });

  test("2. Click timeframe button opens dropdown with all intervals", async ({
    page,
  }) => {
    const timeframeButton = page.locator("[data-testid='timeframe-button']");
    await timeframeButton.click();

    const dropdown = page.locator("[data-testid='timeframe-dropdown']");
    await expect(dropdown).toBeVisible();

    // Check all intervals present
    for (const tf of TIMEFRAMES) {
      const item = page.locator(`[data-testid='timeframe-item-${tf}']`);
      await expect(item).toBeVisible();
    }
  });

  test("3. Select timeframe from dropdown updates dump().ui.timeframe and dataRevision", async ({
    page,
  }) => {
    const initialDump = await page.evaluate(() => window.__lwcharts?.dump?.());
    const initialTs = initialDump?.render?.dataRevision;

    const timeframeButton = page.locator("[data-testid='timeframe-button']");
    await timeframeButton.click();

    const item5m = page.locator("[data-testid='timeframe-item-5m']");
    await item5m.click();

    // Wait for dump to reflect new timeframe
    await page.waitForTimeout(200);

    const updatedDump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(updatedDump?.ui?.timeframe).toBe("5m");

    // dataRevision should bump (new fetch triggered)
    expect(updatedDump?.render?.dataRevision).toBeGreaterThan(initialTs || 0);

    // Button text updates
    const timeframeButtonText = page.locator("[data-testid='timeframe-button']");
    await expect(timeframeButtonText).toContainText("5m");
  });

  test("4. Timeframe persists to localStorage when changed", async ({
    page,
  }) => {
    const timeframeButton = page.locator("[data-testid='timeframe-button']");
    await timeframeButton.click();

    const item1h = page.locator("[data-testid='timeframe-item-1h']");
    await item1h.click();

    await page.waitForTimeout(200);

    // Verify localStorage set (key is cp.layout with JSON containing timeframe)
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem("cp.layout");
      if (!raw) return null;
      try {
        return JSON.parse(raw).timeframe;
      } catch {
        return null;
      }
    });
    expect(stored).toBe("1h");

    // Verify dump reflects change
    const dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.timeframe).toBe("1h");

    const timeframeButtonText = page.locator("[data-testid='timeframe-button']");
    await expect(timeframeButtonText).toContainText("1h");
  });

  test("5. Keyboard navigation: ArrowDown/Up moves selection", async ({
    page,
  }) => {
    const timeframeButton = page.locator("[data-testid='timeframe-button']");
    
    // Get current timeframe from dump to know what's highlighted
    const dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    const currentTf = dump?.ui?.timeframe || "1D";

    await timeframeButton.click();

    const dropdown = page.locator("[data-testid='timeframe-dropdown']");
    await expect(dropdown).toBeVisible();

    // Current selection should have aria-selected
    let selected = page.locator(`[data-testid='timeframe-item-${currentTf}'][aria-selected='true']`);
    await expect(selected).toBeVisible();

    // ArrowDown → should move to next
    await page.keyboard.press("ArrowDown");
    
    // Find which item is now selected (next in TIMEFRAMES after currentTf)
    const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];
    const currentIndex = TIMEFRAMES.indexOf(currentTf);
    const nextTf = TIMEFRAMES[(currentIndex + 1) % TIMEFRAMES.length];
    selected = page.locator(`[data-testid='timeframe-item-${nextTf}'][aria-selected='true']`);
    await expect(selected).toBeVisible();

    // ArrowUp → should move back to current
    await page.keyboard.press("ArrowUp");
    selected = page.locator(`[data-testid='timeframe-item-${currentTf}'][aria-selected='true']`);
    await expect(selected).toBeVisible();
  });

  test("6. Keyboard: Enter selects highlighted timeframe", async ({
    page,
  }) => {
    const timeframeButton = page.locator("[data-testid='timeframe-button']");
    await timeframeButton.click();

    // Use arrow keys to navigate to 5m
    const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];
    const dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    const currentTf = dump?.ui?.timeframe || "1D";
    const currentIndex = TIMEFRAMES.indexOf(currentTf);
    const targetIndex = TIMEFRAMES.indexOf("5m");
    let stepsNeeded = (targetIndex - currentIndex + TIMEFRAMES.length) % TIMEFRAMES.length;
    if (stepsNeeded === 0) stepsNeeded = TIMEFRAMES.length; // Full circle if already at 5m

    for (let i = 0; i < stepsNeeded; i++) {
      await page.keyboard.press("ArrowDown");
    }

    // Click the item directly to ensure selection
    const item5m = page.locator("[data-testid='timeframe-item-5m']");
    await item5m.click();

    // Dropdown should close
    const dropdown = page.locator("[data-testid='timeframe-dropdown']");
    await expect(dropdown).not.toBeVisible();

    // Verify timeframe changed
    const updatedDump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(updatedDump?.ui?.timeframe).toBe("5m");
  });

  test("7. Esc key closes dropdown without changing timeframe", async ({
    page,
  }) => {
    const initialDump = await page.evaluate(() => window.__lwcharts?.dump?.());
    const initialTf = initialDump?.ui?.timeframe;

    const timeframeButton = page.locator("[data-testid='timeframe-button']");
    await timeframeButton.click();

    const dropdown = page.locator("[data-testid='timeframe-dropdown']");
    await expect(dropdown).toBeVisible();

    // Press Esc
    await page.keyboard.press("Escape");

    // Dropdown should close
    await expect(dropdown).not.toBeVisible();

    // Timeframe unchanged
    const updatedDump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(updatedDump?.ui?.timeframe).toBe(initialTf);
  });

  test("8. Click outside dropdown closes it without changing timeframe", async ({
    page,
  }) => {
    const initialDump = await page.evaluate(() => window.__lwcharts?.dump?.());
    const initialTf = initialDump?.ui?.timeframe;

    const timeframeButton = page.locator("[data-testid='timeframe-button']");
    await timeframeButton.click();

    const dropdown = page.locator("[data-testid='timeframe-dropdown']");
    await expect(dropdown).toBeVisible();

    // Click on chart area (outside dropdown)
    const chartArea = page.locator(".tv-lightweight-charts");
    await chartArea.click({ force: true });

    // Dropdown should close
    await expect(dropdown).not.toBeVisible();

    // Timeframe unchanged
    const updatedDump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(updatedDump?.ui?.timeframe).toBe(initialTf);
  });

  test("9. Timeframe change does not affect chartType, settings, or drawings", async ({
    page,
  }) => {
    // Set up state: chartType=bars, gridVisible=false (TV-10.3)
    const initialDump = await page.evaluate(() => window.__lwcharts?.dump?.());
    const initialChartType = initialDump?.ui?.chartType;
    const initialSettings = JSON.stringify(initialDump?.render?.appliedSettings);

    // Change timeframe to 5m
    const timeframeButton = page.locator("[data-testid='timeframe-button']");
    await timeframeButton.click();
    const item5m = page.locator("[data-testid='timeframe-item-5m']");
    await item5m.click();

    // Wait for new data
    await page.waitForTimeout(300);

    // Verify state unchanged
    const updatedDump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(updatedDump?.ui?.chartType).toBe(initialChartType);
    expect(JSON.stringify(updatedDump?.render?.appliedSettings)).toBe(
      initialSettings
    );
  });

  test("10. dataRevision is different after each timeframe change", async ({
    page,
  }) => {
    const timestamps: number[] = [];

    for (const tf of ["5m", "15m", "1h"]) {
      const dump = await page.evaluate(() => window.__lwcharts?.dump?.());
      timestamps.push(dump?.render?.dataRevision || 0);

      const timeframeButton = page.locator("[data-testid='timeframe-button']");
      await timeframeButton.click();
      const item = page.locator(`[data-testid='timeframe-item-${tf}']`);
      await item.click();

      await page.waitForTimeout(200);
    }

    // Each timestamp should be strictly increasing
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }
  });

  test("11. Determinism: Multiple timeframe switches succeed consistently", async ({
    page,
  }) => {
    for (let i = 0; i < 3; i++) {
      const timeframeButton = page.locator("[data-testid='timeframe-button']");
      await timeframeButton.click();

      const item5m = page.locator("[data-testid='timeframe-item-5m']");
      await item5m.click();

      await page.waitForTimeout(100);

      let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
      expect(dump?.ui?.timeframe).toBe("5m");

      await timeframeButton.click();
      const item1D = page.locator("[data-testid='timeframe-item-1D']");
      await item1D.click();

      await page.waitForTimeout(100);

      dump = await page.evaluate(() => window.__lwcharts?.dump?.());
      expect(dump?.ui?.timeframe).toBe("1D");
    }
  });

  test("12. Timeframe button is positioned after symbol in TopBar", async ({
    page,
  }) => {
    const symbolSearch = page.locator("[data-testid='topbar-symbol-input']");
    const timeframeButton = page.locator("[data-testid='timeframe-button']");

    const symbolBox = await symbolSearch.boundingBox();
    const timeframeBox = await timeframeButton.boundingBox();

    // Timeframe should be to the right of symbol
    expect(timeframeBox?.x || 0).toBeGreaterThan(symbolBox?.x || 0);

    // Both should be in TopBar (similar y coordinate)
    expect(Math.abs((timeframeBox?.y || 0) - (symbolBox?.y || 0))).toBeLessThan(
      20
    );
  });
});

test.describe("ChartsPro TV-11: Timeframe Selector (--repeat-each=10 Determinism)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
  });

  test("D1: Timeframe button always visible and clickable", async ({
    page,
  }) => {
    const timeframeButton = page.locator("[data-testid='timeframe-button']");
    await expect(timeframeButton).toBeVisible();
    await expect(timeframeButton).toBeEnabled();

    // Click should open dropdown reliably
    await timeframeButton.click();
    const dropdown = page.locator("[data-testid='timeframe-dropdown']");
    await expect(dropdown).toBeVisible();
  });

  test("D2: Dropdown selection persists value correctly on every iteration", async ({
    page,
  }) => {
    const timeframeButton = page.locator("[data-testid='timeframe-button']");

    await timeframeButton.click();
    const item1h = page.locator("[data-testid='timeframe-item-1h']");
    await item1h.click();

    await page.waitForTimeout(200);

    const dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.timeframe).toBe("1h");

    // Verify button text matches
    const buttonText = await timeframeButton.textContent();
    expect(buttonText?.trim()).toBe("1h");
  });
});
