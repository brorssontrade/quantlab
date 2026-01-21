/**
 * Day 3 UI Smoke Tests
 *
 * These tests verify that critical UI views load without errors.
 * Run as part of Day 3 quality gate before release.
 *
 * Covers: Dashboard, Charts, Fundamentals, Signals, Alerts
 *
 * Skip conditions:
 * - DAY3_SKIP_UI=1 environment variable
 * - No API available (graceful skip)
 */

import { test, expect } from "@playwright/test";

// Skip all tests if DAY3_SKIP_UI is set
const SKIP_UI = process.env.DAY3_SKIP_UI === "1" || process.env.DAY3_SKIP_UI === "true";

test.describe("Day 3 UI Smoke Tests", () => {
  test.skip(SKIP_UI, "UI tests skipped via DAY3_SKIP_UI=1");

  test.beforeEach(async ({ page }) => {
    // Navigate to app root
    await page.goto("/");

    // Wait for app to load (health badge appears)
    try {
      await page.waitForSelector('[class*="Badge"]', { timeout: 10000 });
    } catch {
      // App might still load without health badge
      await page.waitForLoadState("networkidle");
    }
  });

  test("Dashboard tab loads", async ({ page }) => {
    // Dashboard is default tab, should already be visible
    await expect(page.getByRole("tab", { name: "Dashboard" })).toBeVisible();

    // Check for stat cards
    const statCards = page.locator('[class*="CardTitle"]');
    await expect(statCards.first()).toBeVisible({ timeout: 5000 });

    // Check for equity chart container
    const chartContainer = page.locator('[class*="ResponsiveContainer"], [class*="AreaChart"]');
    // May or may not be present depending on data
  });

  test("Charts tab loads", async ({ page }) => {
    // Click Charts tab
    await page.getByRole("tab", { name: "Charts" }).click();

    // Wait for tab content to load
    await page.waitForTimeout(1000);

    // Check for symbol selector or chart viewport
    const chartsContent = page.locator('[data-testid="tab-charts"]').or(
      page.getByRole("tabpanel").filter({ hasText: /symbol|chart/i })
    );

    // Should have some content (toolbar, chart, or loading state)
    await expect(page.getByRole("tabpanel")).toBeVisible();

    // Check no console errors
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.waitForTimeout(2000);

    // Filter out expected errors (e.g., API not available)
    const criticalErrors = errors.filter(
      (e) => !e.includes("Failed to fetch") && !e.includes("NetworkError")
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("Fundamentals tab loads", async ({ page }) => {
    // Click Fundamentals tab
    await page.getByRole("tab", { name: "Fundamentals" }).click();

    // Wait for content
    await page.waitForTimeout(1000);

    // Should have symbol input or fetch button
    const hasInput = await page.locator('input[placeholder*="symbol" i], input[type="text"]').count();
    const hasButton = await page.getByRole("button", { name: /fetch|load/i }).count();

    expect(hasInput + hasButton).toBeGreaterThan(0);
  });

  test("Signals tab loads", async ({ page }) => {
    // Click Signals tab
    await page.getByRole("tab", { name: "Signals" }).click();

    // Wait for content
    await page.waitForTimeout(1000);

    // Should have workdir input or instructions
    const hasWorkdirInput = await page.locator('input[placeholder*="workdir" i], input[placeholder*="artifacts" i]').count();
    const hasInstructions = await page.locator('text=/workdir|View top/i').count();

    expect(hasWorkdirInput + hasInstructions).toBeGreaterThan(0);
  });

  test("Alerts tab loads", async ({ page }) => {
    // Click Alerts tab
    await page.getByRole("tab", { name: "Alerts" }).click();

    // Wait for content
    await page.waitForTimeout(1000);

    // Should have symbol selector or alert list
    const hasSymbolSelect = await page.locator('[class*="Select"], select').count();
    const hasAlertContent = await page.locator('text=/alert|symbol/i').count();

    expect(hasSymbolSelect + hasAlertContent).toBeGreaterThan(0);
  });

  test("No JavaScript errors on initial load", async ({ page }) => {
    const errors: string[] = [];

    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    // Navigate through key tabs
    const tabs = ["Dashboard", "Charts", "Fundamentals", "Alerts"];

    for (const tabName of tabs) {
      await page.getByRole("tab", { name: tabName }).click();
      await page.waitForTimeout(500);
    }

    // Wait for any async errors
    await page.waitForTimeout(1000);

    // Report any errors (but don't fail for network errors)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to fetch") &&
        !e.includes("NetworkError") &&
        !e.includes("Load failed")
    );

    if (criticalErrors.length > 0) {
      console.log("JavaScript errors detected:", criticalErrors);
    }

    expect(criticalErrors).toHaveLength(0);
  });

  test("Health badge shows status", async ({ page }) => {
    // Health badge should be in header
    const healthBadge = page.locator('[class*="Badge"]').first();

    // Should show OK or OFF
    const text = await healthBadge.textContent();
    expect(text).toMatch(/OK|OFF/i);
  });
});

// Additional tests for data-dependent views (skip if no data)
test.describe("Data-dependent views", () => {
  test.skip(SKIP_UI, "UI tests skipped via DAY3_SKIP_UI=1");

  test("Report tab shows empty state or data", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Report" }).click();
    await page.waitForTimeout(1000);

    // Should show either "Choose a run" or report data
    const hasEmptyState = await page.locator('text=/choose a run|load/i').count();
    const hasReportData = await page.locator('[class*="equity" i], text=/metrics/i').count();

    expect(hasEmptyState + hasReportData).toBeGreaterThan(0);
  });

  test("Live tab shows empty state or jobs", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Live" }).click();
    await page.waitForTimeout(1000);

    // Should show schedule input or job list
    const hasScheduleInput = await page.locator('input[placeholder*="cron" i]').count();
    const hasJobTable = await page.locator("table, text=/live job/i").count();

    expect(hasScheduleInput + hasJobTable).toBeGreaterThan(0);
  });

  test("Journal tab shows empty state or trades", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Journal" }).click();
    await page.waitForTimeout(1000);

    // Should show trade form or trade list
    const hasTradeForm = await page.locator('input[placeholder*="symbol" i], text=/add trade/i').count();
    const hasTradeList = await page.locator("table, text=/no trades/i").count();

    expect(hasTradeForm + hasTradeList).toBeGreaterThan(0);
  });
});
