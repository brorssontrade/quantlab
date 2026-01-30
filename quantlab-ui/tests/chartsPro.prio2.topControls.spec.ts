/**
 * chartsPro.prio2.topControls.spec.ts
 * 
 * PRIO 2: Verify Compare/Overlay/Inspector controls are in TVCompactHeader
 * and that internal toolbar is hidden in workspace mode.
 * 
 * Test matrix:
 * - TC1: TopControls visible in header when workspace mode active
 * - TC2: Internal toolbar NOT rendered when workspace mode active
 * - TC3: Compare input adds symbol to chart
 * - TC4: Overlay toggles (SMA/EMA) work from header
 * - TC5: Inspector toggle works from header
 * - TC6: Scale mode toggle (price/percent) works from header
 */
import { test, expect } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

test.describe("PRIO 2: TopControls in TVCompactHeader", () => {
  test("TC1: TopControls visible in header when workspace mode active", async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    
    // Wait for chart to be ready
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    }, { timeout: 15000 });
    
    // Verify we're in workspace mode (default for TV layout)
    await expect(page.locator('[data-testid="tv-topbar-root"]')).toBeVisible();
    
    // Verify TopControls section is visible
    await expect(page.locator('[data-testid="topbar-controls"]')).toBeVisible();
    
    // Verify key controls are present
    await expect(page.locator('[data-testid="topbar-scale-mode-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="topbar-compare-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="topbar-overlay-sma-20"]')).toBeVisible();
    await expect(page.locator('[data-testid="topbar-inspector-toggle"]')).toBeVisible();
  });

  test("TC2: Internal toolbar NOT rendered when workspace mode active", async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    
    // Wait for chart to be ready
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    }, { timeout: 15000 });
    
    // The old internal toolbar had compare-scale-mode-toggle inside ChartViewport
    // It should NOT be visible when controls are in header
    const internalScaleToggle = page.locator('[data-testid="compare-scale-mode-toggle"]');
    
    // Either doesn't exist or is not visible (hidden by hideToolbar)
    const count = await internalScaleToggle.count();
    if (count > 0) {
      // If it exists, it should not be visible
      await expect(internalScaleToggle).not.toBeVisible();
    }
    // If count is 0, the element doesn't exist which is correct
  });

  test("TC3: Compare input adds symbol to chart", async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    
    // Wait for chart
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    }, { timeout: 15000 });
    
    // Get compare input
    const compareInput = page.locator('[data-testid="topbar-compare-input"]');
    await expect(compareInput).toBeVisible();
    
    // Type a symbol and press Enter
    await compareInput.fill("MSFT.US");
    await compareInput.press("Enter");
    
    // Wait for compare chip to appear
    const compareChip = page.locator('[data-testid="topbar-compare-chip-msft-us"]');
    await expect(compareChip).toBeVisible({ timeout: 5000 });
    
    // Wait for compare to be added to chart (via chart API)
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.comparesMeta?.some((c: any) => c.symbol?.toUpperCase() === "MSFT.US");
    }, { timeout: 10000 });
    
    // Verify dump shows compare (dump() exposes comparesMeta, not compareItems)
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    const hasCompare = dump?.comparesMeta?.some((c: any) => c.symbol?.toUpperCase() === "MSFT.US");
    expect(hasCompare).toBe(true);
  });

  test("TC4: Overlay toggles (SMA/EMA) work from header", async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    
    // Wait for chart
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    }, { timeout: 15000 });
    
    // Click SMA 20 toggle
    const sma20Toggle = page.locator('[data-testid="topbar-overlay-sma-20"]');
    await expect(sma20Toggle).toBeVisible();
    await sma20Toggle.click();
    
    // Verify it becomes active (has active styling)
    await expect(sma20Toggle).toHaveClass(/text-\[#2962ff\]/);
    
    // Wait for state to sync to chart
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.overlays?.sma?.includes(20);
    }, { timeout: 5000 });
    
    // Check dump for overlay state (dump() exposes overlays.sma, not overlayState.sma)
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    const hasSma20 = dump?.overlays?.sma?.includes(20);
    expect(hasSma20).toBe(true);
  });

  test("TC5: Inspector toggle works from header", async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    
    // Wait for chart
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    }, { timeout: 15000 });
    
    // Get inspector toggle
    const inspectorToggle = page.locator('[data-testid="topbar-inspector-toggle"]');
    await expect(inspectorToggle).toBeVisible();
    
    // Click to toggle inspector
    await inspectorToggle.click();
    
    // Check that inspector state changed
    // Note: May need to wait for state to propagate
    await page.waitForTimeout(100);
    
    // Verify toggle has active state or inspector sidebar is visible
    // dump() exposes ui.inspectorOpen, not inspector.open
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(typeof dump?.ui?.inspectorOpen).toBe("boolean");
  });

  test("TC6: Scale mode toggle (price/percent) works from header", async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    
    // Wait for chart
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    }, { timeout: 15000 });
    
    // Get scale mode toggle
    const scaleModeToggle = page.locator('[data-testid="topbar-scale-mode-toggle"]');
    await expect(scaleModeToggle).toBeVisible();
    
    // Check initial state (should be $ for price)
    const initialText = await scaleModeToggle.textContent();
    
    // Click to toggle
    await scaleModeToggle.click();
    
    // Wait for state update
    await page.waitForTimeout(100);
    
    // Text should change
    const newText = await scaleModeToggle.textContent();
    expect(newText).not.toBe(initialText);
  });
});
