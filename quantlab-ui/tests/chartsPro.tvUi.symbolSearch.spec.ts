import { test, expect } from "@playwright/test";

async function gotoChartsPro(page: any) {
  await page.goto("/?mock=1", { waitUntil: "networkidle" });
  await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
  await page.locator('[data-testid="tab-charts"]').click({ force: true });
  await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
  await page.waitForFunction(() => {
    const dump = (window as any).__lwcharts?.dump?.();
    const w = dump?.render?.canvas?.w ?? 0;
    const h = dump?.render?.canvas?.h ?? 0;
    const len = dump?.render?.dataLen ?? 0;
    return w > 0 && h > 0 && len > 0;
  }, { timeout: 15000 });
}

test.describe("ChartsPro TV-2 Symbol Search", () => {
  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page);
  });

  test("type → dropdown → select → chart updates", async ({ page }) => {
    // Capture initial data timestamp
    const initial = await page.evaluate(() => {
      const api = (window as any).__lwcharts?.dump?.();
      return { ts: api?.render?.dataRevision ?? 0, len: api?.render?.dataLen ?? 0 };
    });

    const input = page.locator('[data-testid="topbar-symbol-input"]');
    await input.fill(""); // Clear first
    await input.type("META.US", { delay: 30 });
    
    const dropdown = page.locator('[data-testid="symbol-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Press Enter to commit
    await input.press("Enter");

    // Wait for data to load (dataLen > 0 and timestamp changes)
    await page.waitForFunction((initTs) => {
      const dump = (window as any).__lwcharts?.dump?.();
      const len = dump?.render?.dataLen ?? 0;
      const ts = dump?.render?.dataRevision ?? 0;
      return len > 0 && ts !== initTs && ts > 0;
    }, { timeout: 15000 }, initial.ts);

    // Verify input committed
    await expect(input).toHaveValue("META.US");

    // Verify chart has data
    const snapshot = await page.evaluate(() => {
      const api = (window as any).__lwcharts?.dump?.();
      return { len: api?.render?.dataLen, ts: api?.render?.dataRevision };
    });
    expect(snapshot.len).toBeGreaterThan(0);
    expect(snapshot.ts).toBeGreaterThan(0);
  });

  test("keyboard navigation works + esc closes", async ({ page }) => {
    const input = page.locator('[data-testid="topbar-symbol-input"]');
    await input.fill(""); // Clear
    await input.type("M", { delay: 30 });
    
    // Wait for dropdown to appear with suggestions
    await page.waitForTimeout(150);
    const optionCount = await page.locator('[role="option"]').count();
    expect(optionCount).toBeGreaterThan(0);

    // First ArrowDown should set highlight to 0
    await input.press("ArrowDown");
    await page.waitForTimeout(50);
    const selected = await page.locator('[role="option"][aria-selected="true"]').count();
    expect(selected).toBe(1);

    // ESC closes dropdown
    await input.press("Escape");
    await expect(input).toHaveAttribute("aria-expanded", "false");
  });

  test("symbol persists in localStorage after reload", async ({ page }) => {
    const input = page.locator('[data-testid="topbar-symbol-input"]');
    
    // Select a symbol and commit
    await input.fill("");
    await input.type("IBM.US", { delay: 30 });
    const dropdown = page.locator('[data-testid="symbol-dropdown"]');
    await expect(dropdown).toBeVisible();
    await input.press("Enter");

    // Wait for data to load
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return (dump?.render?.dataLen ?? 0) > 0;
    }, { timeout: 15000 });

    // Verify symbol is set
    await expect(input).toHaveValue("IBM.US");

    // Capture dataLen before reload
    const dataBefore = await page.evaluate(() => {
      return (window as any).__lwcharts?.dump?.()?.render?.dataLen ?? 0;
    });
    expect(dataBefore).toBeGreaterThan(0);

    // Reload page
    await page.reload({ waitUntil: "networkidle" });
    
    // Wait for chart to load again
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return (dump?.render?.dataLen ?? 0) > 0;
    }, { timeout: 15000 });

    // Verify symbol is still there from localStorage
    await expect(input).toHaveValue("IBM.US");

    // Verify data loaded for that symbol
    const dataAfter = await page.evaluate(() => {
      return (window as any).__lwcharts?.dump?.()?.render?.dataLen ?? 0;
    });
    expect(dataAfter).toBeGreaterThan(0);
  });
});
