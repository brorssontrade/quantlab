/**
 * chartsPro.prio2-5.defaultRange.spec.ts
 * 
 * PRIO 2.5: Verify default "485 days + 1D" is stable
 * 
 * Tests:
 * 1. Initial timeframe = 1D
 * 2. Initial view shows ~485 bars (or available bars if less)
 * 3. Range does NOT reset when toggling inspector
 * 4. Range does NOT reset when adding compare symbol
 * 5. Range does NOT reset when resizing window
 * 6. Range does NOT reset when opening/closing panels
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoChartsPro, waitForChartData } from "./helpers/chartsProNav";
import { TOPBAR, waitForChartReady } from "./selectors";

interface DumpResult {
  ui: {
    timeframe: string;
  };
  render: {
    dataLen: number;
    visibleRange: { from: number; to: number };
    barSpacing: number;
  };
}

async function getDump(page: Page): Promise<DumpResult | null> {
  return page.evaluate(() => (window as any).__lwcharts?.dump?.());
}

async function getVisibleBarCount(page: Page): Promise<number> {
  const dump = await getDump(page);
  if (!dump?.render?.visibleRange) return 0;
  const { from, to } = dump.render.visibleRange;
  return Math.round(to - from);
}

test.describe("PRIO 2.5: Default 485-day Range Stability", () => {
  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page, { mock: true });
    await waitForChartData(page);
  });

  test("1. Initial timeframe is 1D", async ({ page }) => {
    const dump = await getDump(page);
    expect(dump?.ui?.timeframe).toBe("1D");
  });

  test("2. Initial view shows ~485 bars (or max available)", async ({ page }) => {
    const dump = await getDump(page);
    const dataLen = dump?.render?.dataLen ?? 0;
    const visibleRange = dump?.render?.visibleRange;
    
    expect(visibleRange).toBeDefined();
    expect(dataLen).toBeGreaterThan(0);
    
    // Calculate visible bar count
    const visibleBars = Math.round(visibleRange!.to - visibleRange!.from);
    
    // Should show either 485 bars or all available (if < 485)
    // Mock data typically has ~365 bars
    const expectedMax = Math.min(485, dataLen);
    
    // Tolerance: should be within 20% of expected
    expect(visibleBars).toBeGreaterThan(expectedMax * 0.8);
    expect(visibleBars).toBeLessThanOrEqual(dataLen + 10); // Allow small overshoot
    
    console.log(`[PRIO 2.5] dataLen=${dataLen}, visibleBars=${visibleBars}, expectedMax=${expectedMax}`);
  });

  test("3. Range does NOT reset when toggling inspector", async ({ page }) => {
    // Get initial range
    const initialDump = await getDump(page);
    const initialRange = initialDump?.render?.visibleRange;
    expect(initialRange).toBeDefined();
    
    const initialFrom = initialRange!.from;
    const initialTo = initialRange!.to;
    
    // Toggle inspector ON via TopControls
    const inspectorToggle = page.locator('[data-testid="topbar-inspector-toggle"]');
    await inspectorToggle.click();
    await page.waitForTimeout(300); // Wait for animation
    
    // Check range hasn't changed
    let dump = await getDump(page);
    expect(dump?.render?.visibleRange?.from).toBeCloseTo(initialFrom, 0);
    expect(dump?.render?.visibleRange?.to).toBeCloseTo(initialTo, 0);
    
    // Toggle inspector OFF
    await inspectorToggle.click();
    await page.waitForTimeout(300);
    
    // Range should still be the same
    dump = await getDump(page);
    expect(dump?.render?.visibleRange?.from).toBeCloseTo(initialFrom, 0);
    expect(dump?.render?.visibleRange?.to).toBeCloseTo(initialTo, 0);
    
    console.log("[PRIO 2.5] Inspector toggle: range preserved ✓");
  });

  test("4. Range does NOT reset when adding compare symbol", async ({ page }) => {
    // Get initial range
    const initialDump = await getDump(page);
    const initialRange = initialDump?.render?.visibleRange;
    expect(initialRange).toBeDefined();
    
    const initialFrom = initialRange!.from;
    const initialTo = initialRange!.to;
    
    // Add compare symbol via TopControls
    const compareInput = page.locator(TOPBAR.compareInput);
    if (await compareInput.isVisible()) {
      await compareInput.fill("MSFT.US");
      await compareInput.press("Enter");
      
      // Wait for compare data to load
      await page.waitForTimeout(1000);
      
      // Check range hasn't changed significantly
      const dump = await getDump(page);
      expect(dump?.render?.visibleRange?.from).toBeCloseTo(initialFrom, 0);
      expect(dump?.render?.visibleRange?.to).toBeCloseTo(initialTo, 0);
      
      console.log("[PRIO 2.5] Compare add: range preserved ✓");
    } else {
      // Compare input not visible in this mode, skip
      console.log("[PRIO 2.5] Compare input not visible, skipping");
    }
  });

  test("5. Range does NOT reset when resizing window", async ({ page }) => {
    // Get initial range
    const initialDump = await getDump(page);
    const initialRange = initialDump?.render?.visibleRange;
    expect(initialRange).toBeDefined();
    
    const initialFrom = initialRange!.from;
    const initialTo = initialRange!.to;
    
    // Resize window
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.waitForTimeout(300);
    
    // Check range hasn't reset
    let dump = await getDump(page);
    expect(dump?.render?.visibleRange?.from).toBeCloseTo(initialFrom, 0);
    expect(dump?.render?.visibleRange?.to).toBeCloseTo(initialTo, 0);
    
    // Resize again
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.waitForTimeout(300);
    
    dump = await getDump(page);
    expect(dump?.render?.visibleRange?.from).toBeCloseTo(initialFrom, 0);
    expect(dump?.render?.visibleRange?.to).toBeCloseTo(initialTo, 0);
    
    console.log("[PRIO 2.5] Window resize: range preserved ✓");
  });

  test("6. Range does NOT reset when opening/closing right panel tabs", async ({ page }) => {
    // Get initial range
    const initialDump = await getDump(page);
    const initialRange = initialDump?.render?.visibleRange;
    expect(initialRange).toBeDefined();
    
    const initialFrom = initialRange!.from;
    const initialTo = initialRange!.to;
    
    // Click Indicators button to open panel
    const indicatorsBtn = page.locator('[data-testid="topbar-indicators-button"]');
    if (await indicatorsBtn.isVisible()) {
      await indicatorsBtn.click();
      await page.waitForTimeout(300);
      
      // Check range
      let dump = await getDump(page);
      expect(dump?.render?.visibleRange?.from).toBeCloseTo(initialFrom, 0);
      expect(dump?.render?.visibleRange?.to).toBeCloseTo(initialTo, 0);
      
      // Press Escape to close modal
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      
      dump = await getDump(page);
      expect(dump?.render?.visibleRange?.from).toBeCloseTo(initialFrom, 0);
      expect(dump?.render?.visibleRange?.to).toBeCloseTo(initialTo, 0);
      
      console.log("[PRIO 2.5] Panel open/close: range preserved ✓");
    } else {
      console.log("[PRIO 2.5] Indicators button not visible, skipping");
    }
  });

  test("7. Explicit Fit button DOES reset to all history", async ({ page }) => {
    // Get initial range
    const initialDump = await getDump(page);
    const dataLen = initialDump?.render?.dataLen ?? 0;
    
    // Click Fit button (usually in BottomBar or via context)
    // Use __lwcharts.fit() API directly
    await page.evaluate(() => {
      (window as any).__lwcharts?.fit?.();
    });
    await page.waitForTimeout(300);
    
    // After fit, should show ALL data
    const dump = await getDump(page);
    const visibleRange = dump?.render?.visibleRange;
    const visibleBars = Math.round(visibleRange!.to - visibleRange!.from);
    
    // Fit should show approximately all data
    expect(visibleBars).toBeGreaterThanOrEqual(dataLen * 0.9);
    
    console.log(`[PRIO 2.5] Fit button: showing ${visibleBars}/${dataLen} bars ✓`);
  });
});
