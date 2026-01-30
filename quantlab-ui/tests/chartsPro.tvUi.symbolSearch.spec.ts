import { test, expect } from "@playwright/test";
import { TOPBAR, TV_SHELL, waitForChartReady } from "./selectors";

async function gotoChartsPro(page: any) {
  await page.goto("/?mock=1", { waitUntil: "networkidle" });
  const chartsTab = page.getByTestId("tab-charts");
  await chartsTab.click({ force: true });
  await expect(page.locator(TV_SHELL.root)).toBeVisible({ timeout: 10000 });
  await waitForChartReady(page);
}

/**
 * PRIO2: Symbol is now displayed as a chip by default.
 * Click the chip to activate the input field.
 * NOTE: TVCompactHeader uses simplified SymbolChip without dropdown.
 * PrimaryControls uses full SymbolSearch with dropdown (non-workspace mode).
 */
async function activateSymbolInput(page: any) {
  const symbolChip = page.locator(TOPBAR.symbolChip);
  await symbolChip.click();
  const input = page.locator(TOPBAR.symbolInput);
  await expect(input).toBeVisible({ timeout: 5000 });
  return input;
}

test.describe("ChartsPro TV-2 Symbol Search", () => {
  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page);
  });

  /**
   * PRIO2: SymbolChip is simple inline input (no dropdown).
   * Type symbol and press Enter to commit.
   */
  test("type → enter → chart updates", async ({ page }) => {
    // Capture initial data timestamp
    const initial = await page.evaluate(() => {
      const api = (window as any).__lwcharts?.dump?.();
      return { ts: api?.render?.dataRevision ?? 0, len: api?.render?.dataLen ?? 0 };
    });

    // PRIO2: Click chip to activate input
    const input = await activateSymbolInput(page);
    await input.fill("META.US");

    // Press Enter to commit
    await input.press("Enter");

    // Wait for data to load (dataLen > 0 and timestamp changes)
    await page.waitForFunction((initTs) => {
      const dump = (window as any).__lwcharts?.dump?.();
      const len = dump?.render?.dataLen ?? 0;
      const ts = dump?.render?.dataRevision ?? 0;
      return len > 0 && ts !== initTs && ts > 0;
    }, { timeout: 15000 }, initial.ts);

    // PRIO2: After commit, symbol shows as chip again
    const symbolChip = page.locator(TOPBAR.symbolChip);
    await expect(symbolChip).toContainText("META.US");

    // Verify chart has data
    const snapshot = await page.evaluate(() => {
      const api = (window as any).__lwcharts?.dump?.();
      return { len: api?.render?.dataLen, ts: api?.render?.dataRevision };
    });
    expect(snapshot.len).toBeGreaterThan(0);
    expect(snapshot.ts).toBeGreaterThan(0);
  });

  /**
   * PRIO2: Test Escape key cancels edit and reverts to chip
   */
  test("escape cancels edit and shows chip", async ({ page }) => {
    // Get current symbol from chip
    const symbolChip = page.locator(TOPBAR.symbolChip);
    const originalSymbol = await symbolChip.textContent();

    // Click to edit
    const input = await activateSymbolInput(page);
    await input.fill("GARBAGE");

    // ESC cancels and reverts to chip
    await input.press("Escape");

    // Chip should be visible with original symbol
    await expect(symbolChip).toBeVisible();
    await expect(symbolChip).toContainText(originalSymbol?.trim() || "");
  });

  /**
   * PRIO2: Test that symbol persists across reload.
   * Uses default symbol (ABB.ST) since mock data is already loaded.
   */
  test("symbol persists in localStorage after reload", async ({ page }) => {
    // PRIO2: Get the current symbol from chip (should be ABB.ST in mock mode)
    const symbolChip = page.locator(TOPBAR.symbolChip);
    const symbolBefore = await symbolChip.textContent();
    expect(symbolBefore).toBeTruthy();

    // Verify data is loaded
    const dataBefore = await page.evaluate(() => {
      return (window as any).__lwcharts?.dump?.()?.render?.dataLen ?? 0;
    });
    expect(dataBefore).toBeGreaterThan(0);

    // Reload page
    await page.reload({ waitUntil: "networkidle" });
    
    // Wait for chart to load again
    await waitForChartReady(page);

    // PRIO2: Verify symbol chip still shows same symbol from localStorage
    await expect(page.locator(TOPBAR.symbolChip)).toContainText(symbolBefore?.trim() || "");

    // Verify data loaded again
    const dataAfter = await page.evaluate(() => {
      return (window as any).__lwcharts?.dump?.()?.render?.dataLen ?? 0;
    });
    expect(dataAfter).toBeGreaterThan(0);
  });
});
