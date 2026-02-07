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

test.describe("ChartsPro Symbol Search Modal", () => {
  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page);
  });

  /**
   * Test: Modal opens via expand button click
   */
  test("expand button opens modal", async ({ page }) => {
    // Click symbol chip to show input
    await activateSymbolInput(page);
    
    // Click expand button (magnifying glass icon)
    const expandBtn = page.getByTestId("symbol-search-expand");
    await expandBtn.click();
    
    // Modal should be visible
    const modal = page.getByTestId("symbol-search-modal");
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Modal should have search input focused
    const modalInput = modal.locator("input[type='text']");
    await expect(modalInput).toBeFocused();
  });

  /**
   * Test: Modal opens via Ctrl+K keyboard shortcut
   */
  test("Ctrl+K opens modal", async ({ page }) => {
    // Activate symbol input first
    const input = await activateSymbolInput(page);
    
    // Press Ctrl+K
    await input.press("Control+k");
    
    // Modal should be visible
    const modal = page.getByTestId("symbol-search-modal");
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  /**
   * Test: Modal closes on Escape
   */
  test("Escape closes modal", async ({ page }) => {
    // Open modal
    await activateSymbolInput(page);
    await page.getByTestId("symbol-search-expand").click();
    
    const modal = page.getByTestId("symbol-search-modal");
    await expect(modal).toBeVisible();
    
    // Press Escape
    await page.keyboard.press("Escape");
    
    // Modal should be hidden
    await expect(modal).not.toBeVisible();
  });

  /**
   * Test: Selecting symbol from modal updates chart
   */
  test("selecting symbol from modal updates chart", async ({ page }) => {
    // Get initial state
    const initialSymbol = await page.locator(TOPBAR.symbolChip).textContent();
    
    // Open modal
    await activateSymbolInput(page);
    await page.getByTestId("symbol-search-expand").click();
    
    const modal = page.getByTestId("symbol-search-modal");
    await expect(modal).toBeVisible();
    
    // Type search query
    const modalInput = modal.locator("input[type='text']");
    await modalInput.fill("NVDA");
    
    // Wait for search results
    await page.waitForTimeout(300); // debounce
    
    // Click first result (using keyboard)
    await modalInput.press("ArrowDown");
    await modalInput.press("Enter");
    
    // Modal should close
    await expect(modal).not.toBeVisible();
    
    // Symbol chip should update
    const symbolChip = page.locator(TOPBAR.symbolChip);
    await expect(symbolChip).toContainText("NVDA");
  });

  /**
   * Test: Category tabs work
   */
  test("category tabs filter results", async ({ page }) => {
    // Open modal
    await activateSymbolInput(page);
    await page.getByTestId("symbol-search-expand").click();
    
    const modal = page.getByTestId("symbol-search-modal");
    await expect(modal).toBeVisible();
    
    // Click US Stocks tab
    const usTab = modal.getByRole("tab", { name: "US Stocks" });
    await usTab.click();
    
    // Verify tab is selected
    await expect(usTab).toHaveAttribute("aria-selected", "true");
    
    // Results should show (at least one row visible)
    const resultItems = modal.locator("[data-testid^='symbol-result-']");
    await expect(resultItems.first()).toBeVisible({ timeout: 5000 });
  });

  /**
   * Test: Modal shows full symbol universe (>50 symbols)
   * Regression test to prevent shortlist fallback
   */
  test("modal shows > 50 symbols from API", async ({ page }) => {
    // Open modal
    await activateSymbolInput(page);
    await page.getByTestId("symbol-search-expand").click();
    
    const modal = page.getByTestId("symbol-search-modal");
    await expect(modal).toBeVisible();
    
    // Header should show symbol count > 50
    const countSpan = page.getByTestId("symbol-search-count");
    await expect(countSpan).toBeVisible({ timeout: 5000 });
    
    const headerText = await countSpan.textContent();
    const match = headerText?.match(/(\d+) symbols/);
    expect(match).toBeTruthy();
    
    const symbolCount = parseInt(match![1], 10);
    console.log(`[Symbol Search] Modal shows ${symbolCount} symbols`);
    
    // Must have more than the 10-item fallback
    expect(symbolCount).toBeGreaterThan(50);
    
    // Bonus: check that a non-shortlist symbol exists (e.g., SAND.ST)
    // Type to search
    const modalInput = modal.locator("input[type='text']");
    await modalInput.fill("SAND");
    await page.waitForTimeout(300);
    
    // Should find SAND.ST (Sandvik)
    const sandResult = modal.locator("[data-testid='symbol-result-SAND.ST']");
    await expect(sandResult).toBeVisible({ timeout: 3000 });
  });
});
