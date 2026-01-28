/**
 * CP37.drift: State Drift Regression Tests
 * 
 * Verifies that autoScale and scaleMode state stays in sync between
 * BottomBar UI and chart when navigating, changing chartType, or using
 * context actions/QA API.
 * 
 * Run: npx playwright test tests/chartsPro.cp37.drift.spec.ts --project=chromium --repeat-each=3
 */
import { test, expect, Page } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

// Helper: Wait for chart ready and data loaded
async function waitChartReady(page: Page) {
  await page.waitForFunction(
    () => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0 && dump.ui?.bottomBar?.dataBounds?.dataCount > 0;
    },
    { timeout: 15000 }
  );
}

// Helper: Get scale state from dump()
async function getScaleState(page: Page) {
  return page.evaluate(() => {
    const dump = (window as any).__lwcharts?.dump?.();
    return dump?.ui?.bottomBar?.scale ?? null;
  });
}

// Helper: Check chart's actual autoScale state via dump
async function getChartAutoScale(page: Page) {
  return page.evaluate(() => {
    const dump = (window as any).__lwcharts?.dump?.();
    // Verify via render.scale which reflects actual chart state
    return dump?.render?.scale?.autoScale ?? null;
  });
}

// Helper: Click auto toggle button and wait for state update
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

// Helper: Click mode button (log/percent) and wait for state update
async function clickModeButton(page: Page, mode: "log" | "percent"): Promise<void> {
  const before = await getScaleState(page);
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

// ─────────────────────────────────────────────────────────────────────────────
// CP37.drift.1: AutoScale survives chartType change
// ─────────────────────────────────────────────────────────────────────────────
test("CP37.drift.1: autoScale survives chartType change (candles→bars→candles)", async ({ page }) => {
  await gotoChartsPro(page);
  await waitChartReady(page);
  
  // Ensure autoScale is ON (default is true, but toggle to confirm)
  let state = await getScaleState(page);
  if (!state?.auto) {
    await clickAutoToggle(page);
  }
  state = await getScaleState(page);
  expect(state?.auto).toBe(true);
  
  // Change chartType to bars via QA API
  await page.evaluate(() => {
    (window as any).__lwcharts?.set?.({ chartType: "bars" });
  });
  await page.waitForTimeout(500);
  
  // Verify autoScale persists (this is the key test - UI state should persist)
  const afterBars = await getScaleState(page);
  expect(afterBars?.auto).toBe(true);
  
  // Change back to candles
  await page.evaluate(() => {
    (window as any).__lwcharts?.set?.({ chartType: "candles" });
  });
  await page.waitForTimeout(500);
  
  // Still persists
  const afterCandles = await getScaleState(page);
  expect(afterCandles?.auto).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// CP37.drift.2: scaleMode survives symbol change
// ─────────────────────────────────────────────────────────────────────────────
test("CP37.drift.2: scaleMode survives symbol change", async ({ page }) => {
  await gotoChartsPro(page);
  await waitChartReady(page);
  
  // Set to logarithmic mode
  await clickModeButton(page, "log");
  const initial = await getScaleState(page);
  expect(initial?.mode).toBe("log");
  
  // Change symbol via QA API (simulates user action)
  await page.evaluate(() => {
    (window as any).__lwcharts?.set?.({ symbol: "TSLA" });
  });
  await page.waitForTimeout(500);
  
  // Verify scaleMode persists
  const afterChange = await getScaleState(page);
  expect(afterChange?.mode).toBe("log");
});

// ─────────────────────────────────────────────────────────────────────────────
// CP37.drift.3: QA API autoFit syncs UI state
// NOTE: This test verifies that set({ autoFit: true }) syncs BottomBar UI state.
// Uses onAutoScaleChangeRef pattern to avoid stale closures in QA API callbacks.
// ─────────────────────────────────────────────────────────────────────────────
test("CP37.drift.3: QA API autoFit syncs UI state", async ({ page }) => {
  await gotoChartsPro(page);
  await waitChartReady(page);
  
  // Turn OFF autoScale first
  let state = await getScaleState(page);
  if (state?.auto) {
    await clickAutoToggle(page);
  }
  state = await getScaleState(page);
  expect(state?.auto).toBe(false);
  
  // Use QA API to trigger autoFit - this should sync UI state via callback
  await page.evaluate(() => {
    (window as any).__lwcharts?.set?.({ autoFit: true });
  });
  
  // Wait for React state propagation
  await page.waitForFunction(
    () => (window as any).__lwcharts?.dump?.()?.ui?.bottomBar?.scale?.auto === true,
    { timeout: 5000, polling: 100 }
  );
  
  // Verify UI state is now ON
  const afterAutoFit = await getScaleState(page);
  expect(afterAutoFit?.auto).toBe(true);

  // Verify chart state matches
  const chartAuto = await getChartAutoScale(page);
  expect(chartAuto).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// CP37.drift.4: QA API priceRange disables autoScale
// NOTE: This test verifies that set({ priceRange: {...} }) syncs BottomBar UI state.
// Uses onAutoScaleChangeRef pattern to avoid stale closures in QA API callbacks.
// ─────────────────────────────────────────────────────────────────────────────
test("CP37.drift.4: QA API priceRange disables autoScale and syncs UI", async ({ page }) => {
  await gotoChartsPro(page);
  await waitChartReady(page);
  
  // Ensure autoScale is ON first
  let state = await getScaleState(page);
  if (!state?.auto) {
    await clickAutoToggle(page);
  }
  state = await getScaleState(page);
  expect(state?.auto).toBe(true);
  
  // Use QA API to set priceRange (should disable autoScale and sync UI)
  await page.evaluate(() => {
    (window as any).__lwcharts?.set?.({ priceRange: { from: 100, to: 200 } });
  });
  
  // Wait for React state propagation with extended timeout and polling
  await page.waitForFunction(
    () => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.ui?.bottomBar?.scale?.auto === false;
    },
    { timeout: 5000, polling: 100 }
  ).catch(() => null);
  
  // Verify UI state is now OFF
  const afterPriceRange = await getScaleState(page);
  expect(afterPriceRange?.auto).toBe(false);

  // Verify chart state matches
  const chartAuto = await getChartAutoScale(page);
  expect(chartAuto).toBe(false);
});
