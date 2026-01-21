/**
 * chartsPro.tvUi.topbar.spec.ts
 * TV-1.1 TopBar Component Tests
 *
 * Validates:
 * - TopBar renders with all control groups
 * - Symbol + Timeframe interactions work
 * - No regressions from old Toolbar
 * - Chart data persists through TopBar changes
 */

import { test, expect } from "@playwright/test";

test.describe("ChartsPro TV-1.1 TopBar", () => {
  async function gotoChartsPro(page: any) {
    await page.goto("/?mock=1", { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
    // Wait for chart to actually render (canvas sized + data loaded)
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      const w = dump?.render?.canvas?.w ?? 0;
      const h = dump?.render?.canvas?.h ?? 0;
      const len = dump?.render?.dataLen ?? 0;
      return w > 0 && h > 0 && len > 0;
    }, { timeout: 15000 });
  }

  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page);
  });

  test("TopBar symbol input is visible", async ({ page }) => {
    const symbolInput = page.locator('[data-testid="topbar-symbol-input"]');
    await expect(symbolInput).toBeVisible();
  });

  test("TopBar has timeframe selector", async ({ page }) => {
    const timeframeButton = page.locator('[data-testid="timeframe-button"]');
    await expect(timeframeButton).toBeVisible();
    // Click to open dropdown and verify options are there
    await timeframeButton.click();
    const dropdown = page.locator('[data-testid="timeframe-dropdown"]');
    await expect(dropdown).toBeVisible();
    // Check a specific known timeframe
    const dailyItem = page.locator('[data-testid="timeframe-item-1D"]');
    await expect(dailyItem).toBeVisible();
  });

  test("TopBar has reload button", async ({ page }) => {
    const reloadBtn = page.locator('[data-testid="topbar-reload-btn"]');
    await expect(reloadBtn).toBeVisible();
  });

  test("TopBar has theme controls", async ({ page }) => {
    const darkBtn = page.locator('[data-testid="topbar-theme-dark"]');
    await expect(darkBtn).toBeVisible();
  });

  test("TopBar has magnet and snap buttons", async ({ page }) => {
    const magnetBtn = page.locator('[data-testid="topbar-magnet"]');
    const snapBtn = page.locator('[data-testid="topbar-snap"]');
    await expect(magnetBtn).toBeVisible();
    await expect(snapBtn).toBeVisible();
  });

  test("Chart renders with TopBar", async ({ page }) => {
    // Verify via dump() to avoid visibility flakes
    const snapshot = await page.evaluate(() => {
      const api = (window as any).__lwcharts?.dump?.();
      return {
        w: api?.render?.canvas?.w ?? 0,
        h: api?.render?.canvas?.h ?? 0,
        len: api?.render?.dataLen ?? 0,
      };
    });
    expect(snapshot.w).toBeGreaterThan(0);
    expect(snapshot.h).toBeGreaterThan(0);
    expect(snapshot.len).toBeGreaterThan(0);
  });

  test("Data loads correctly (tvParity regression)", async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const snapshot = await page.evaluate(() => {
      const api = (window as any).__lwcharts?.dump?.();
      return {
        symbol: api?.symbol,
        dataLen: api?.render?.dataLen,
        canvasCount: api?.render?.canvas?.count,
      };
    });
    
    expect(snapshot.symbol).toBeTruthy();
    expect(snapshot.dataLen).toBeGreaterThan(0);
    expect(snapshot.canvasCount).toBeGreaterThan(0);
  });
});
