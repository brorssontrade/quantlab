/**
 * smoke.dev.spec.ts
 * P0 Smoke Test: Verify dev/preview servers respond correctly
 * 
 * Catches "404/blank app" issues before running full test suite
 * Run: npx playwright test tests/smoke.dev.spec.ts --project=chromium
 */

import { test, expect } from "@playwright/test";

test.describe("P0 Smoke: Server Health", () => {
  test("preview server (4173) serves index.html", async ({ page }) => {
    // This uses baseURL from playwright.config (http://127.0.0.1:4173/)
    await page.goto("/");
    
    // Should load app without 404
    await expect(page.locator("#root")).toBeVisible({ timeout: 5000 });
    
    // Verify main UI elements render
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 5000 });
  });

  test("mock mode works (?mock=1)", async ({ page }) => {
    await page.goto("/?mock=1");
    
    await expect(page.locator("#root")).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 5000 });
  });

  test("ChartsPro tab loads without 404", async ({ page }) => {
    await page.goto("/?mock=1");
    
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 5000 });
    
    // Click ChartsPro tab
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    
    // Should render shell without error
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 5000 });
  });
});
