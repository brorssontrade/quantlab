/**
 * chartsProNav.ts
 * Standardized navigation helpers for ChartsPro Playwright tests
 * 
 * Prevents beforeEach drift and ensures consistent test setup
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export type RightPanelTab = "indicators" | "objects" | "alerts";

/**
 * Navigate to ChartsPro tab with optional mock mode and workspace mode
 */
export async function gotoChartsPro(page: Page, options: { mock?: boolean; workspaceMode?: boolean } = {}) {
  // Default to mock mode unless explicitly disabled
  const mockParam = options.mock === false ? "" : "mock=1";
  const workspaceParam = options.workspaceMode !== undefined ? `workspaceMode=${options.workspaceMode}` : "";
  const params = [mockParam, workspaceParam].filter(Boolean).join("&");
  const url = params ? `/?${params}` : "/";

  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Wait for main app to load
  await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });

  // Click ChartsPro tab
  await page.locator('[data-testid="tab-charts"]').click({ force: true });

  // Wait for shell to render
  await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });

  // Ensure chart data + canvas are ready before continuing
  await waitForChartData(page);

  // Small delay for full render
  await page.waitForTimeout(300);
}

/**
 * Switch to a specific RightPanel tab
 * Assumes gotoChartsPro() has already been called
 */
export async function openRightPanelTab(page: Page, tab: RightPanelTab) {
  const tabSelector = `[data-testid="rightpanel-tab-${tab}"]`;
  
  // Wait for tab button to be visible
  await expect(page.locator(tabSelector)).toBeVisible({ timeout: 5000 });
  
  // Click tab
  await page.locator(tabSelector).click();
  
  // Wait for content to render
  await page.waitForTimeout(300);
  
  // Verify tab is active via dump()
  const dump = await page.evaluate(() => {
    if (!window.__lwcharts) return null;
    return window.__lwcharts.dump();
  });
  
  if (dump && dump.ui.rightPanel.activeTab !== tab) {
    throw new Error(`Expected activeTab to be ${tab}, got ${dump.ui.rightPanel.activeTab}`);
  }
}

/**
 * Wait for chart to be fully loaded with data
 */
export async function waitForChartData(page: Page) {
  await page.waitForFunction(() => {
    if (!window.__lwcharts) return false;
    const dump = window.__lwcharts.dump();
    return dump.render.dataLen > 0 && dump.render.canvas.w > 0;
  }, { timeout: 10000 });
}
