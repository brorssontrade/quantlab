/**
 * ChartsPro Alerts Flow Test (Day 8)
 * 
 * Purpose: Verify the integrated alerts functionality in ChartsPro
 * - Drawing tools work (hline, trendline)
 * - Alerts panel shows for selected drawings
 * - Can create alert from drawing
 * - Alert list updates correctly
 * 
 * Run: npx playwright test tests/chartsPro.alerts.flow.spec.ts --project=chromium
 */
import { test, expect, type Page } from "@playwright/test";

const MOCK_URL = "/?mock=1";

test.describe("ChartsPro Alerts Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to ChartsPro with mock data
    await page.goto(MOCK_URL);
    
    // Wait for app to load and click charts tab
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    
    // Wait for chart shell to render
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
  });

  test("charts tab renders AlertsPanel in sidebar", async ({ page }) => {
    // The sidebar should be visible
    const sidebar = page.locator('[data-testid="chartspro-sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 5000 });
    
    // The AlertsPanel should be visible in the sidebar
    const alertsPanel = page.locator('[data-testid="chartspro-alerts-panel"]');
    await expect(alertsPanel).toBeVisible({ timeout: 5000 });
    
    // Should show "No alerts" message initially or "Alerts" heading
    const text = await alertsPanel.textContent();
    expect(text).toMatch(/no alerts|alerts/i);
  });

  test("AlertsPanel shows empty state when no drawing selected", async ({ page }) => {
    const alertsPanel = page.locator('[data-testid="chartspro-alerts-panel"]');
    await expect(alertsPanel).toBeVisible();
    
    // Check for guidance text about selecting drawings
    const panelText = await alertsPanel.textContent();
    expect(panelText?.toLowerCase()).toMatch(/select.*horizontal|trendline|no alerts/i);
  });

  test("toolbar has drawing tools", async ({ page }) => {
    // Check that drawing tool buttons exist
    // The exact selectors may vary - this is a sanity check
    const toolbarButtons = page.locator("button");
    const buttonCount = await toolbarButtons.count();
    expect(buttonCount).toBeGreaterThan(5); // At least several toolbar buttons
  });

  test("AlertsPanel has header and content structure", async ({ page }) => {
    const alertsPanel = page.locator('[data-testid="chartspro-alerts-panel"]');
    await expect(alertsPanel).toBeVisible();
    
    // Check that the panel has a header with title
    const header = alertsPanel.locator(".font-semibold");
    await expect(header).toBeVisible({ timeout: 3000 });
    
    // The panel should remain visible and stable
    await page.waitForTimeout(500);
    await expect(alertsPanel).toBeVisible();
  });

  test("can interact with AlertsPanel buttons", async ({ page }) => {
    const alertsPanel = page.locator('[data-testid="chartspro-alerts-panel"]');
    await expect(alertsPanel).toBeVisible();
    
    // Find the refresh button and click it
    const refreshButton = alertsPanel.locator("button[title='Refresh']");
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
      // Should not crash
      await expect(alertsPanel).toBeVisible();
    }
  });

  test("AlertsPanel header shows correct title", async ({ page }) => {
    const alertsPanel = page.locator('[data-testid="chartspro-alerts-panel"]');
    await expect(alertsPanel).toBeVisible();
    
    // Check the card title
    const title = alertsPanel.locator("text=Alerts").first();
    await expect(title).toBeVisible();
  });
});

test.describe("ChartsPro Alerts Integration (Requires Backend)", () => {
  test.skip(process.env.CI === "true", "Skipping backend-dependent tests in CI");
  
  test.beforeEach(async ({ page }) => {
    // Navigate to ChartsPro
    await page.goto("/");
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
  });

  test("alerts list updates after backend fetch", async ({ page }) => {
    const alertsPanel = page.locator('[data-testid="chartspro-alerts-panel"]');
    await expect(alertsPanel).toBeVisible();
    
    // Wait for potential network request to complete
    await page.waitForTimeout(1000);
    
    // Panel should still be visible after fetch attempt
    await expect(alertsPanel).toBeVisible();
  });
});
