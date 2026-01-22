import { test, expect, Page } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

/**
 * TV-12 / TV-18.2: TopBar Actions tests
 * 
 * After TV-18.2:
 * - TopBar Indicators button opens central modal (not RightPanel)
 * - Alerts button opens RightPanel with activeTab=alerts
 * - Objects button opens RightPanel with activeTab=objects
 */

test.describe("TV-12: TopBar Actions - RightPanel", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    // TV-12: Clear RightPanel state to start clean
    await page.evaluate(() => {
      window.localStorage?.setItem("cp.rightPanel.activeTab", "");
    });
    await page.reload();
    await page.waitForTimeout(300);
  });

  test("1. Indicators button opens modal (TV-18.2)", async ({ page }) => {
    // Find and click Indicators button
    const indicatorsButton = page.locator('[data-testid="topbar-indicators-btn"]');
    expect(indicatorsButton).toBeVisible();
    await indicatorsButton.click();
    await page.waitForTimeout(300);

    // TV-18.2: Opens modal, NOT RightPanel
    const dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.modal?.open).toBe(true);
    expect(dump?.ui?.modal?.kind).toBe("indicators");
  });

  test("2. Indicators modal shows search field (TV-18.2)", async ({ page }) => {
    await page.click('[data-testid="topbar-indicators-btn"]');
    await page.waitForTimeout(300);

    // Verify modal opened with search
    await expect(page.locator('[data-testid="indicators-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="indicators-modal-search"]')).toBeVisible();
  });

  test("3. Indicators modal search is focused (TV-18.2)", async ({ page }) => {
    await page.click('[data-testid="topbar-indicators-btn"]');
    await page.waitForTimeout(300);

    // Verify modal opened
    await expect(page.locator('[data-testid="indicators-modal"]')).toBeVisible();

    const searchInput = page.locator('[data-testid="indicators-modal-search"]');
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
    // Set Alerts tab (indicators no longer opens RightPanel)
    await page.click('[data-testid="topbar-alerts-btn"]');
    await page.waitForTimeout(300);

    // Verify set
    let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("alerts");

    // Reload
    await page.reload();
    await page.waitForTimeout(500);

    // Verify persisted
    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("alerts");
  });

  test("8. Indicators modal closes with Escape (TV-18.2)", async ({ page }) => {
    // Open modal
    await page.click('[data-testid="topbar-indicators-btn"]');
    await page.waitForTimeout(300);

    let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.modal?.open).toBe(true);

    // Press Escape to close
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Verify closed
    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.modal?.open).toBe(false);
  });

  test("9. Switching tabs (Objects - Alerts) updates activeTab correctly", async ({
    page,
  }) => {
    // Open Objects
    await page.click('[data-testid="topbar-objects-btn"]');
    await page.waitForTimeout(200);

    let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("objects");

    // Switch to Alerts
    await page.click('[data-testid="topbar-alerts-btn"]');
    await page.waitForTimeout(200);

    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("alerts");
  });

  test("10. Clicking Objects button twice closes RightPanel (toggle)", async ({
    page,
  }) => {
    // Open Objects
    await page.click('[data-testid="topbar-objects-btn"]');
    await page.waitForTimeout(200);

    let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("objects");

    // Click again to close
    await page.click('[data-testid="topbar-objects-btn"]');
    await page.waitForTimeout(200);

    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBeNull();
  });

  test("11. Indicators modal close button works (TV-18.2)", async ({
    page,
  }) => {
    // Open modal
    await page.click('[data-testid="topbar-indicators-btn"]');
    await page.waitForTimeout(300);

    let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.modal?.open).toBe(true);

    // Click X button to close
    await page.click('[data-testid="indicators-modal-close"]');
    await page.waitForTimeout(200);

    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.modal?.open).toBe(false);

    // Verify modal is gone
    await expect(page.locator('[data-testid="indicators-modal"]')).not.toBeVisible();
  });

  test("12. RightPanel visibility matches activeTab state", async ({ page }) => {
    // Initially activeTab should be null (from beforeEach reset)
    let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBeNull();

    // Open Alerts
    await page.click('[data-testid="topbar-alerts-btn"]');
    await page.waitForTimeout(300);

    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("alerts");
    
    const alertsTab = page.locator('[data-testid="rightpanel-tab-alerts"]');
    await expect(alertsTab).toHaveAttribute("aria-pressed", "true");

    // Switch to Objects
    await page.click('[data-testid="topbar-objects-btn"]');
    await page.waitForTimeout(300);

    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.rightPanel?.activeTab).toBe("objects");
    
    const objectsTab = page.locator('[data-testid="rightpanel-tab-objects"]');
    await expect(objectsTab).toHaveAttribute("aria-pressed", "true");
  });
});
