import { test, expect, Page } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

// TV-12: Helper to close Indicators add overlay before clicking TopBar actions
async function closeIndicatorsOverlay(page: Page) {
  const closeBtn = page.locator('[data-testid="indicators-close-overlay"]');
  if (await closeBtn.isVisible()) {
    // Force-click bypasses pointer interception from parent div
    try {
      await closeBtn.click({ force: true });
    } catch (e) {
      // Fallback: use keyboard (Escape key)
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(100);
  }
}

test.describe("TV-12: TopBar Actions - RightPanel", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    // TV-12: Clear RightPanel state to start clean
    await page.evaluate(() => {
      window.localStorage?.setItem("cp.rightPanel.activeTab", "");
      window.localStorage?.setItem("cp.indicators.addOpen", "0");
    });
    await page.reload();
    await page.waitForTimeout(300);
  });

  test("1. Indicators button opens RightPanel with activeTab=indicators", async ({
    page,
  }) => {
    // Find and click Indicators button
    const indicatorsButton = page.locator('[data-testid="topbar-indicators-btn"]');
    expect(indicatorsButton).toBeVisible();
    await indicatorsButton.click();
    await page.waitForTimeout(300);

    // Verify RightPanel opened with correct tab
    const dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("indicators");
  });

  test("2. Indicators button sets addOpen=true (form visible)", async ({
    page,
  }) => {
    await page.click('[data-testid="topbar-indicators-btn"]');
    await page.waitForTimeout(300);

    const dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.indicators?.addOpen).toBe(true);

    // Verify add-form is in DOM (use await for async visibility check)
    const addForm = page.locator('[data-testid="indicators-add-form"]');
    await expect(addForm).toBeVisible({ timeout: 3000 });
  });

  test("3. Indicators search field is focused after button click", async ({
    page,
  }) => {
    await page.click('[data-testid="topbar-indicators-btn"]');
    await page.waitForTimeout(300);

    // Verify overlay opened
    const overlay = page.locator('[data-testid="indicators-overlay"]');
    await expect(overlay).toBeVisible({ timeout: 3000 });

    const searchInput = page.locator('[data-testid="indicators-search"]');
    await expect(searchInput).toBeVisible({ timeout: 2000 });
    await expect(searchInput).toBeFocused();
  });

  test("4. Alerts button opens RightPanel with activeTab=alerts", async ({
    page,
  }) => {
    // Clear any existing drawing to test disabled state
    const alertsButton = page.locator('[data-testid="topbar-alerts-btn"]');
    expect(alertsButton).toBeVisible();
    await alertsButton.click();
    await page.waitForTimeout(300);

    const dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("alerts");
  });

  test("5. Alerts button with active drawing shows create-form", async ({
    page,
  }) => {
    // Wait for chart to be ready
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      const w = dump?.render?.canvas?.w ?? 0;
      const h = dump?.render?.canvas?.h ?? 0;
      return w > 0 && h > 0;
    }, { timeout: 10000 });

    // Create a horizontal line first using LeftToolbar
    await page.click('[data-testid="tool-hline"]');
    await page.waitForTimeout(300);

    // Click chart to place hline using tv-shell (same as alerts.tab tests)
    const chart = page.locator('[data-testid="tv-shell"]');
    const box = await chart.boundingBox();
    if (!box) throw new Error("Chart not found");
    
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.click(x, y);
    await page.waitForTimeout(300);

    // Open Alerts panel
    await page.click('[data-testid="topbar-alerts-btn"]');
    await page.waitForTimeout(300);

    // Click Create button to show form (same pattern as alerts.tab tests)
    await page.click('[data-testid="alerts-create-btn"]');
    await page.waitForTimeout(200);

    // Verify create-form is visible with drawing info
    const createForm = page.locator('[data-testid="alerts-create-form"]');
    await expect(createForm).toBeVisible({ timeout: 3000 });
    
    // Verify it shows the drawing type
    const fromText = createForm.locator('text=/From: (hline|trend)/');
    await expect(fromText).toBeVisible({ timeout: 2000 });
  });

  test("6. Objects button opens RightPanel with activeTab=objects", async ({
    page,
  }) => {
    const objectsButton = page.locator('[data-testid="topbar-objects-btn"]');
    expect(objectsButton).toBeVisible();
    await objectsButton.click();
    await page.waitForTimeout(300);

    const dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("objects");
  });

  test("7. RightPanel activeTab persists across reload", async ({ page }) => {
    // Set Indicators tab
    await page.click('[data-testid="topbar-indicators-btn"]');
    await page.waitForTimeout(300);

    // Verify set
    let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("indicators");

    // Reload
    await page.reload();
    await page.waitForTimeout(500);

    // Verify persisted
    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("indicators");
  });

  test("8. Indicators addOpen=true persists across reload", async ({ page }) => {
    // Open add form
    await page.click('[data-testid="topbar-indicators-btn"]');
    await page.waitForTimeout(300);

    let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.indicators?.addOpen).toBe(true);

    // Reload
    await page.reload();
    await page.waitForTimeout(500);

    // Verify persisted
    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.indicators?.addOpen).toBe(true);
  });

  test("9. Switching tabs (Indicators - Alerts) updates activeTab correctly", async ({
    page,
  }) => {
    // Open Indicators
    await page.click('[data-testid="topbar-indicators-btn"]');
    await page.waitForTimeout(200);

    let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("indicators");

    // Switch to Alerts
    await page.click('[data-testid="topbar-alerts-btn"]');
    await page.waitForTimeout(200);

    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("alerts");
  });

  test("10. Clicking same button twice closes RightPanel (toggle)", async ({
    page,
  }) => {
    // Open Indicators
    await page.click('[data-testid="topbar-indicators-btn"]');
    await page.waitForTimeout(200);

    let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("indicators");

    // Click again to close
    await page.click('[data-testid="topbar-indicators-btn"]');
    await page.waitForTimeout(200);

    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBeNull();
  });

  test("11. Indicators add form can close via X button (addOpen=false)", async ({
    page,
  }) => {
    // Open add form
    await page.click('[data-testid="topbar-indicators-btn"]');
    await page.waitForTimeout(300);

    let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.indicators?.addOpen).toBe(true);

    // Wait for overlay to be visible first
    const overlay = page.locator('[data-testid="indicators-overlay"]');
    await expect(overlay).toBeVisible({ timeout: 3000 });

    // Click close button via JS click (native DOM click works with React handlers)
    // Note: Playwright's force:true doesn't properly trigger React synthetic events
    const closeBtn = page.locator('[data-testid="indicators-close-overlay"]');
    await expect(closeBtn).toBeVisible({ timeout: 2000 });
    
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="indicators-close-overlay"]') as HTMLButtonElement;
      btn?.click();
    });
    await page.waitForTimeout(300);

    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.indicators?.addOpen).toBe(false);

    // Verify overlay is gone
    await expect(page.locator('[data-testid="indicators-add-form"]')).not.toBeVisible();
  });

  test("12. RightPanel visibility matches activeTab state", async ({ page }) => {
    // Note: RightPanel component renders always (never hidden), but activeTab controls content
    // Initially activeTab should be null (from beforeEach reset)
    let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBeNull();

    // Open Indicators
    await page.click('[data-testid="topbar-indicators-btn"]');
    await page.waitForTimeout(300);

    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("indicators");
    
    const indicatorsTab = page.locator('[data-testid="rightpanel-tab-indicators"]');
    await expect(indicatorsTab).toHaveAttribute("aria-pressed", "true");

    // Close Indicators overlay before clicking Alerts
    await closeIndicatorsOverlay(page);
    await page.waitForTimeout(300);

    // Switch to Alerts
    await page.click('[data-testid="topbar-alerts-btn"]');
    await page.waitForTimeout(300);

    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("alerts");
    
    const alertsTab = page.locator('[data-testid="rightpanel-tab-alerts"]');
    await expect(alertsTab).toHaveAttribute("aria-pressed", "true");
  });
});
