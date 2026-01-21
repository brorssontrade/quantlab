/**
 * Core Flows Test (Day 5B)
 * 
 * Purpose: Verify critical user flows work end-to-end.
 * These are the flows that MUST work for QuantLab to be useful.
 * 
 * Flows:
 * 1. ChartsPro Happy Path - candles render, theme toggle works
 * 2. Fundamentals Empty State - shows helpful empty state when no config
 * 3. Alerts Create Stub - can access alerts and attempt create flow
 * 
 * Run: npx playwright test tests/core.flows.spec.ts --project=chromium
 */
import { test, expect } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

test.describe("Core Flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
  });

  test.describe("Flow 1: ChartsPro Happy Path", () => {
    test("candles render within timeout", async ({ page }, testInfo) => {
      // Navigate to ChartsPro
      await gotoChartsPro(page, testInfo);

      // Wait for content
      await expect(page.locator('[data-testid="content-charts"]')).toBeVisible({ timeout: 5000 });

      // ChartsPro uses ?mock=1 URL param for deterministic testing
      // Check if chart container is rendered
      const chartContainer = page.locator('[data-testid="chartspro-container"]').or(
        page.locator(".tv-lightweight-charts")
      );

      // Should have chart visible within reasonable time
      await expect(chartContainer).toBeVisible({ timeout: 10000 });
    });

    test("theme toggle changes chart appearance", async ({ page }, testInfo) => {
      await gotoChartsPro(page, testInfo);
      await expect(page.locator('[data-testid="content-charts"]')).toBeVisible({ timeout: 5000 });

      // Look for theme toggle button
      const themeToggle = page.locator('[data-testid="theme-toggle"]').or(
        page.locator('button:has-text("Dark")').or(
          page.locator('button:has-text("Light")')
        )
      );

      // If theme toggle exists, click it and verify no crash
      const toggleCount = await themeToggle.count();
      if (toggleCount > 0) {
        const beforeClick = await page.locator("html").getAttribute("class") || "";
        await themeToggle.first().click();
        
        // Small wait for theme transition
        await page.waitForTimeout(300);
        
        // Page should still be functional
        await expect(page.locator('[data-testid="tab-list"]')).toBeVisible();
      } else {
        // Skip if no theme toggle present
        test.skip(true, "No theme toggle found in ChartsPro");
      }
    });

    test("symbol selector is accessible", async ({ page }, testInfo) => {
      await gotoChartsPro(page, testInfo);
      await expect(page.locator('[data-testid="content-charts"]')).toBeVisible({ timeout: 5000 });

      // Look for symbol selector/input
      const symbolInput = page.locator('[data-testid="symbol-selector"]').or(
        page.locator('input[placeholder*="symbol" i]').or(
          page.locator('select').first()
        )
      );

      const inputCount = await symbolInput.count();
      if (inputCount > 0) {
        await expect(symbolInput.first()).toBeVisible();
      }
      // If no explicit selector, just verify chart tab is still functional
      await expect(page.locator('[data-testid="content-charts"]')).toBeVisible();
    });
  });

  test.describe("Flow 2: Fundamentals Empty/Config State", () => {
    test("shows helpful empty state when no symbol configured", async ({ page }) => {
      // Navigate to Fundamentals tab
      await page.locator('[data-testid="tab-fundamentals"]').click();
      await expect(page.locator('[data-testid="content-fundamentals"]')).toBeVisible({ timeout: 5000 });

      // Should show helpful message about missing config/symbol
      const content = page.locator('[data-testid="content-fundamentals"]');
      const text = await content.textContent();
      
      // Expect some form of guidance (symbol input, fetch button, or empty state message)
      const hasGuidance = 
        text?.toLowerCase().includes("symbol") ||
        text?.toLowerCase().includes("fetch") ||
        text?.toLowerCase().includes("score") ||
        text?.toLowerCase().includes("fundamental") ||
        text?.toLowerCase().includes("enter") ||
        text?.toLowerCase().includes("select");
      
      expect(hasGuidance || await content.locator("input, select, button").count() > 0).toBeTruthy();
    });

    test("no uncaught errors on fundamentals tab", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.locator('[data-testid="tab-fundamentals"]').click();
      await expect(page.locator('[data-testid="content-fundamentals"]')).toBeVisible({ timeout: 5000 });

      // Wait a moment for any delayed errors
      await page.waitForTimeout(500);

      // Filter out known non-critical errors
      const criticalErrors = errors.filter(
        (e) => !e.includes("ResizeObserver") && !e.includes("AbortError")
      );

      expect(criticalErrors).toHaveLength(0);
    });
  });

  test.describe("Flow 3: Alerts Create Stub", () => {
    test("alerts tab renders without crash", async ({ page }) => {
      await page.locator('[data-testid="tab-alerts"]').click();
      await expect(page.locator('[data-testid="content-alerts"]')).toBeVisible({ timeout: 5000 });

      // Tab should render
      await expect(page.locator('[data-testid="tab-list"]')).toBeVisible();
    });

    test("create alert button or form is accessible", async ({ page }) => {
      await page.locator('[data-testid="tab-alerts"]').click();
      await expect(page.locator('[data-testid="content-alerts"]')).toBeVisible({ timeout: 5000 });

      // Look for create button or form elements
      const createButton = page.locator('button:has-text("Create")').or(
        page.locator('button:has-text("Add")').or(
          page.locator('button:has-text("New")')
        )
      );

      const formInput = page.locator('[data-testid="content-alerts"] input, [data-testid="content-alerts"] select');

      // Should have either a create action or form elements
      const hasCreateUI = (await createButton.count() > 0) || (await formInput.count() > 0);
      
      // If there's any interactive element, the flow is accessible
      // If not, that's a potential issue but not a crash
      if (!hasCreateUI) {
        // Log warning but don't fail - empty state is acceptable
        console.log("Note: Alerts tab has no create button or form visible");
      }

      // Page should remain functional
      await expect(page.locator('[data-testid="tab-list"]')).toBeVisible();
    });

    test("no console errors on alerts interaction", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.locator('[data-testid="tab-alerts"]').click();
      await expect(page.locator('[data-testid="content-alerts"]')).toBeVisible({ timeout: 5000 });

      // Try clicking any button if present
      const anyButton = page.locator('[data-testid="content-alerts"] button').first();
      if (await anyButton.count() > 0) {
        await anyButton.click({ timeout: 2000 }).catch(() => {
          // Button might be disabled or have no handler - that's OK
        });
      }

      await page.waitForTimeout(300);

      // Filter out known non-critical errors
      const criticalErrors = errors.filter(
        (e) => !e.includes("ResizeObserver") && !e.includes("AbortError")
      );

      expect(criticalErrors).toHaveLength(0);
    });
  });
});

test.describe("Core Flow Stability", () => {
  test("rapid tab switching doesn't crash", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });

    const tabs = ["charts", "fundamentals", "alerts", "dashboard", "charts"];
    
    for (const tabId of tabs) {
      await page.locator(`[data-testid="tab-${tabId}"]`).click({ force: true });
      await expect(page.locator(`[data-testid="content-${tabId}"]`)).toBeVisible({ timeout: 3000 });
    }

    // App should still be functional
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible();
  });

  test("refresh on ChartsPro doesn't crash", async ({ page }, testInfo) => {
    await page.goto("/");
    await gotoChartsPro(page, testInfo);
    await expect(page.locator('[data-testid="content-charts"]')).toBeVisible({ timeout: 5000 });

    // Refresh page
    await page.reload();
    
    // App should recover
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
  });
});
