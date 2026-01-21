/**
 * App Tabs Smoke Test (Day 4, updated Day 8)
 * 
 * Purpose: Verify all 15 tabs render without crashes and show appropriate
 * empty states for data-dependent tabs.
 * 
 * Note: Alerts tab was removed in Day 8 - alerts now live inside ChartsPro.
 * 
 * Run: npx playwright test tests/app.tabs.smoke.spec.ts --project=chromium
 */
import { test, expect } from "@playwright/test";

// Tab definitions with expected behavior
const TABS = [
  // PASS tabs - work without backend/config
  { id: "dashboard", status: "PASS", emptyState: null },
  { id: "charts", status: "PASS", emptyState: null },
  { id: "library", status: "PASS", emptyState: null },
  { id: "journal", status: "PASS", emptyState: null },
  { id: "post", status: "PASS", emptyState: null },
  
  // WARN tabs - need backend/config but show clear empty states
  { id: "fundamentals", status: "WARN", emptyState: /symbol|fetch|score|fundamental/i },
  { id: "assistant", status: "WARN", emptyState: /ollama|llm|setup|configure|assistant|question/i },
  { id: "optimize", status: "WARN", emptyState: null }, // Has form, no empty state
  { id: "report", status: "WARN", emptyState: /choose a run|load/i },
  { id: "signals", status: "WARN", emptyState: /no rows|view top-n/i },
  { id: "live", status: "WARN", emptyState: null }, // Has form, table may be empty
  { id: "breadth", status: "WARN", emptyState: /no data loaded/i },
  { id: "movers", status: "WARN", emptyState: /no movers loaded/i },
  { id: "hotlists", status: "WARN", emptyState: /no items loaded/i },
  { id: "pipeline", status: "WARN", emptyState: null }, // Simple trigger, no empty state
] as const;

test.describe("App Tabs Smoke Test", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto("/");
    
    // Wait for app to load
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
  });

  test("all 15 tabs are present in navigation", async ({ page }) => {
    for (const tab of TABS) {
      const trigger = page.locator(`[data-testid="tab-${tab.id}"]`);
      await expect(trigger).toBeVisible();
    }
  });

  test("can navigate to each tab without crash", async ({ page }) => {
    for (const tab of TABS) {
      // Click the tab using force to bypass any intercepts
      await page.locator(`[data-testid="tab-${tab.id}"]`).click({ force: true });
      
      // Wait for content to appear
      const content = page.locator(`[data-testid="content-${tab.id}"]`);
      await expect(content).toBeVisible({ timeout: 5000 });
      
      // Verify no crash - page should still have the tab list
      await expect(page.locator('[data-testid="tab-list"]')).toBeVisible();
    }
  });

  // Individual tab tests for WARN tabs with empty states
  test.describe("WARN tab empty states", () => {
    for (const tab of TABS.filter(t => t.status === "WARN" && t.emptyState)) {
      test(`${tab.id} shows appropriate empty state`, async ({ page }) => {
        // Navigate to tab
        await page.locator(`[data-testid="tab-${tab.id}"]`).click({ force: true });
        
        // Wait for content
        const content = page.locator(`[data-testid="content-${tab.id}"]`);
        await expect(content).toBeVisible({ timeout: 5000 });
        
        // Wait for content to settle
        await page.waitForTimeout(500);
        
        // Check for empty state text
        const text = await content.textContent();
        expect(text?.toLowerCase()).toMatch(tab.emptyState!);
      });
    }
  });

  // PASS tabs should render content immediately
  test.describe("PASS tab rendering", () => {
    test("dashboard renders stat cards", async ({ page }) => {
      await page.locator('[data-testid="tab-dashboard"]').click({ force: true });
      const content = page.locator('[data-testid="content-dashboard"]');
      await expect(content).toBeVisible();
      
      // Wait for content to settle
      await page.waitForTimeout(500);
      
      // Should have strategy count, cost, jobs cards - use first() for multiple matches
      await expect(content.getByText(/strategies/i).first()).toBeVisible();
    });

    test("charts renders ChartsPro shell", async ({ page }) => {
      await page.locator('[data-testid="tab-charts"]').click({ force: true });
      const content = page.locator('[data-testid="content-charts"]');
      await expect(content).toBeVisible();
      
      // Should have the TV shell structure
      await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
    });

    test("library renders without error", async ({ page }) => {
      await page.locator('[data-testid="tab-library"]').click({ force: true });
      const content = page.locator('[data-testid="content-library"]');
      await expect(content).toBeVisible();
      
      // Wait for content to settle
      await page.waitForTimeout(500);
      
      // Library has strategy/indicator sections
      const text = await content.textContent();
      expect(text?.length).toBeGreaterThan(50); // Has meaningful content
    });

    test("journal renders summary cards", async ({ page }) => {
      await page.locator('[data-testid="tab-journal"]').click({ force: true });
      const content = page.locator('[data-testid="content-journal"]');
      await expect(content).toBeVisible();
      
      // Wait for content to settle
      await page.waitForTimeout(500);
      
      // Should have trade count, win rate, PnL cards - look for common patterns
      const text = await content.textContent();
      expect(text).toMatch(/trades|journal|pnl/i);
    });

    test("post renders message input", async ({ page }) => {
      await page.locator('[data-testid="tab-post"]').click({ force: true });
      const content = page.locator('[data-testid="content-post"]');
      await expect(content).toBeVisible();
      
      // Should have input and send button
      await expect(content.getByRole("textbox")).toBeVisible();
      await expect(content.getByRole("button", { name: /send/i })).toBeVisible();
    });
  });

  // Rapid tab switching stress test
  test("survives rapid tab switching", async ({ page }) => {
    // Use a fixed subset to avoid flakiness
    const testTabs = ["dashboard", "charts", "library", "post", "optimize", "report"];
    
    for (const tabId of testTabs) {
      await page.locator(`[data-testid="tab-${tabId}"]`).click({ force: true });
      // Brief wait to allow render
      await page.waitForTimeout(200);
    }
    
    // Should still be functional
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible();
  });
});
