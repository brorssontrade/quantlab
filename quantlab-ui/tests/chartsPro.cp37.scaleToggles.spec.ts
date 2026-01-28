/**
 * TV-37.2: Scale Toggles Tests - CP37.2
 * 
 * Tests for the BottomBar scale toggles (Auto, Log, %).
 * Auto is a toggle (independent of mode), Log/% are mutually exclusive modes.
 * 
 * dump().ui.bottomBar.scale = { auto: boolean, mode: "linear" | "log" | "percent" }
 */

import { test, expect, type Page } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

/** Wait for chart data to be loaded */
async function waitForChartData(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0 && dump.ui?.bottomBar?.dataBounds?.dataCount > 0;
    },
    { timeout: 15000 }
  );
}

/** Get the current dump state */
async function getDump(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__lwcharts?.dump?.());
}

/** Get bottom bar scale state from dump */
async function getScaleState(page: Page): Promise<{ auto: boolean; mode: string } | null> {
  const dump = await getDump(page);
  return dump?.ui?.bottomBar?.scale ?? null;
}

/** Click Auto toggle button and wait for state update */
async function clickAutoToggle(page: Page): Promise<void> {
  const before = await getScaleState(page);
  const expectedAuto = !before?.auto;
  
  await page.click('[data-testid="bottombar-toggle-auto"]');
  
  // Wait for state to update
  await page.waitForFunction(
    (expected) => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.ui?.bottomBar?.scale?.auto === expected;
    },
    expectedAuto,
    { timeout: 5000 }
  );
}

/** Click a mode button (log/percent) and wait for state update */
async function clickModeButton(page: Page, mode: "log" | "percent"): Promise<void> {
  const before = await getScaleState(page);
  // If already this mode, clicking toggles to linear; otherwise sets to this mode
  const expectedMode = before?.mode === mode ? "linear" : mode;
  
  await page.click(`[data-testid="bottombar-toggle-${mode}"]`);
  
  // Wait for state to update
  await page.waitForFunction(
    (expected) => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.ui?.bottomBar?.scale?.mode === expected;
    },
    expectedMode,
    { timeout: 5000 }
  );
}

/** Clear localStorage before each test to ensure clean state */
async function clearScaleStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage?.removeItem("cp.bottomBar.autoScale");
    window.localStorage?.removeItem("cp.bottomBar.scaleMode");
  });
}

// -----------------------------------------------------------------------------
// TV-37.2 Tests
// -----------------------------------------------------------------------------

test.describe("TV-37.2: Scale Toggles - CP37.2", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto("/?mock=1");
    await gotoChartsPro(page, testInfo);
    await waitForChartData(page);
  });

  test.describe("CP37.2.1: Auto Toggle", () => {
    test("CP37.2.1.1: Auto toggle is independent of mode", async ({ page }) => {
      // Get initial state
      const initial = await getScaleState(page);
      expect(initial).not.toBeNull();
      expect(initial!.auto).toBe(true); // Default is auto enabled
      expect(initial!.mode).toBe("linear"); // Default mode is linear

      // Toggle auto off
      await clickAutoToggle(page);
      const afterOff = await getScaleState(page);
      expect(afterOff!.auto).toBe(false);
      expect(afterOff!.mode).toBe("linear"); // Mode unchanged

      // Set log mode while auto is off
      await clickModeButton(page, "log");
      const withLog = await getScaleState(page);
      expect(withLog!.auto).toBe(false);
      expect(withLog!.mode).toBe("log");

      // Toggle auto back on - mode should remain log
      await clickAutoToggle(page);
      const autoOnWithLog = await getScaleState(page);
      expect(autoOnWithLog!.auto).toBe(true);
      expect(autoOnWithLog!.mode).toBe("log"); // Mode still log
    });

    test("CP37.2.1.2: Auto toggle updates button UI state", async ({ page }) => {
      const autoBtn = page.locator('[data-testid="bottombar-toggle-auto"]');
      
      // Initially active
      await expect(autoBtn).toHaveClass(/is-active/);
      
      // Toggle off
      await clickAutoToggle(page);
      await expect(autoBtn).not.toHaveClass(/is-active/);
      
      // Toggle back on
      await clickAutoToggle(page);
      await expect(autoBtn).toHaveClass(/is-active/);
    });

    test("CP37.2.1.3: Auto toggle persists to localStorage", async ({ page }) => {
      // Toggle auto off
      await clickAutoToggle(page);
      
      // Check localStorage
      const stored = await page.evaluate(() => 
        window.localStorage?.getItem("cp.bottomBar.autoScale")
      );
      expect(stored).toBe("false");
      
      // Toggle back on
      await clickAutoToggle(page);
      const storedOn = await page.evaluate(() => 
        window.localStorage?.getItem("cp.bottomBar.autoScale")
      );
      expect(storedOn).toBe("true");
    });
  });

  test.describe("CP37.2.2: Mode Toggles (Log/%)", () => {
    test("CP37.2.2.1: Log and % are mutually exclusive", async ({ page }) => {
      const initial = await getScaleState(page);
      expect(initial!.mode).toBe("linear");

      // Click Log
      await clickModeButton(page, "log");
      const withLog = await getScaleState(page);
      expect(withLog!.mode).toBe("log");

      // Click % - should switch to percent
      await clickModeButton(page, "percent");
      const withPercent = await getScaleState(page);
      expect(withPercent!.mode).toBe("percent");

      // Log should not be active anymore
      const logBtn = page.locator('[data-testid="bottombar-toggle-log"]');
      await expect(logBtn).not.toHaveClass(/is-active/);
    });

    test("CP37.2.2.2: Clicking active mode button returns to linear", async ({ page }) => {
      // Enable log mode
      await clickModeButton(page, "log");
      let state = await getScaleState(page);
      expect(state!.mode).toBe("log");

      // Click log again - should toggle off to linear
      await clickModeButton(page, "log");
      state = await getScaleState(page);
      expect(state!.mode).toBe("linear");

      // Same for percent
      await clickModeButton(page, "percent");
      state = await getScaleState(page);
      expect(state!.mode).toBe("percent");

      await clickModeButton(page, "percent");
      state = await getScaleState(page);
      expect(state!.mode).toBe("linear");
    });

    test("CP37.2.2.3: Mode persists to localStorage", async ({ page }) => {
      // Set to log
      await clickModeButton(page, "log");
      let stored = await page.evaluate(() => 
        window.localStorage?.getItem("cp.bottomBar.scaleMode")
      );
      expect(stored).toBe("log");

      // Set to percent
      await clickModeButton(page, "percent");
      stored = await page.evaluate(() => 
        window.localStorage?.getItem("cp.bottomBar.scaleMode")
      );
      expect(stored).toBe("percent");

      // Toggle back to linear
      await clickModeButton(page, "percent");
      stored = await page.evaluate(() => 
        window.localStorage?.getItem("cp.bottomBar.scaleMode")
      );
      expect(stored).toBe("linear");
    });

    test("CP37.2.2.4: Mode button UI states update correctly", async ({ page }) => {
      const logBtn = page.locator('[data-testid="bottombar-toggle-log"]');
      const percentBtn = page.locator('[data-testid="bottombar-toggle-percent"]');

      // Initially neither is active
      await expect(logBtn).not.toHaveClass(/is-active/);
      await expect(percentBtn).not.toHaveClass(/is-active/);

      // Click Log
      await clickModeButton(page, "log");
      await expect(logBtn).toHaveClass(/is-active/);
      await expect(percentBtn).not.toHaveClass(/is-active/);

      // Click Percent
      await clickModeButton(page, "percent");
      await expect(logBtn).not.toHaveClass(/is-active/);
      await expect(percentBtn).toHaveClass(/is-active/);
    });
  });

  test.describe("CP37.2.3: ADJ Button", () => {
    test("CP37.2.3.1: ADJ button is disabled", async ({ page }) => {
      const adjBtn = page.locator('[data-testid="bottombar-toggle-adj"]');
      await expect(adjBtn).toBeDisabled();
    });

    test("CP37.2.3.2: ADJ button shows coming soon tooltip", async ({ page }) => {
      const adjBtn = page.locator('[data-testid="bottombar-toggle-adj"]');
      const title = await adjBtn.getAttribute("title");
      expect(title).toContain("coming soon");
    });
  });

  test.describe("CP37.2.4: dump() Contract", () => {
    test("CP37.2.4.1: dump().ui.bottomBar.scale has correct shape", async ({ page }) => {
      const scale = await getScaleState(page);
      expect(scale).not.toBeNull();
      expect(typeof scale!.auto).toBe("boolean");
      expect(["linear", "log", "percent"]).toContain(scale!.mode);
    });

    test("CP37.2.4.2: scale.auto reflects toggle state", async ({ page }) => {
      let scale = await getScaleState(page);
      expect(scale!.auto).toBe(true);

      await clickAutoToggle(page);
      scale = await getScaleState(page);
      expect(scale!.auto).toBe(false);
    });

    test("CP37.2.4.3: scale.mode reflects mode state", async ({ page }) => {
      let scale = await getScaleState(page);
      expect(scale!.mode).toBe("linear");

      await clickModeButton(page, "log");
      scale = await getScaleState(page);
      expect(scale!.mode).toBe("log");

      await clickModeButton(page, "percent");
      scale = await getScaleState(page);
      expect(scale!.mode).toBe("percent");
    });

    test("CP37.2.4.4: legacy scaleMode property still works", async ({ page }) => {
      const dump = await getDump(page);
      // When auto is on and mode is linear, legacy scaleMode should be "auto"
      expect(dump?.ui?.bottomBar?.scaleMode).toBe("auto");

      // Toggle auto off
      await clickAutoToggle(page);
      const dumpAfter = await getDump(page);
      // When auto is off, legacy scaleMode shows the actual mode
      expect(dumpAfter?.ui?.bottomBar?.scaleMode).toBe("linear");

      // Set to log
      await clickModeButton(page, "log");
      const dumpLog = await getDump(page);
      expect(dumpLog?.ui?.bottomBar?.scaleMode).toBe("log");
    });
  });

  test.describe("CP37.2.5: State Persistence", () => {
    test("CP37.2.5.1: autoScale state persists across navigation", async ({ page }, testInfo) => {
      // Toggle auto off
      await clickAutoToggle(page);
      let state = await getScaleState(page);
      expect(state!.auto).toBe(false);

      // Navigate away and back
      await page.goto("/?mock=1");
      await gotoChartsPro(page, testInfo);
      await waitForChartData(page);

      // Check state persisted
      state = await getScaleState(page);
      expect(state!.auto).toBe(false);
    });

    test("CP37.2.5.2: scaleMode state persists across navigation", async ({ page }, testInfo) => {
      // Set to log
      await clickModeButton(page, "log");
      let state = await getScaleState(page);
      expect(state!.mode).toBe("log");

      // Navigate away and back
      await page.goto("/?mock=1");
      await gotoChartsPro(page, testInfo);
      await waitForChartData(page);

      // Check state persisted
      state = await getScaleState(page);
      expect(state!.mode).toBe("log");
    });
  });

  test.describe("CP37.2.6: Regression - Range Presets", () => {
    test("CP37.2.6.1: scale changes don't affect range presets", async ({ page }) => {
      // Get initial range state
      const initialDump = await getDump(page);
      const initialRange = initialDump?.ui?.bottomBar?.rangePreset;

      // Toggle auto
      await clickAutoToggle(page);

      // Set log mode
      await clickModeButton(page, "log");

      // Check range preset unchanged
      const afterDump = await getDump(page);
      expect(afterDump?.ui?.bottomBar?.rangePreset).toBe(initialRange);
    });

    test("CP37.2.6.2: range presets still work after scale changes", async ({ page }) => {
      // Set log mode
      await clickModeButton(page, "log");

      // Click a range preset and wait for it to be applied
      await page.click('[data-testid="bottombar-range-5D"]');
      await page.waitForFunction(
        () => {
          const dump = (window as any).__lwcharts?.dump?.();
          return dump?.ui?.bottomBar?.rangePreset === "5D";
        },
        { timeout: 5000 }
      );

      // Verify range changed
      const dump = await getDump(page);
      expect(dump?.ui?.bottomBar?.rangePreset).toBe("5D");
      
      // Verify scale state unchanged
      expect(dump?.ui?.bottomBar?.scale?.mode).toBe("log");
    });
  });
});
