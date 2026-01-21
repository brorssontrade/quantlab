/**
 * TV-3.10: LeftToolbar Responsive Behavior Tests
 *
 * Verifies:
 * - Desktop (≥768px): Vertical toolbar in grid slot
 * - Mobile (<768px): Floating horizontal pill
 * - Touch-friendly hit areas on mobile
 * - Tool selection works in both layouts
 * - Pill expand/collapse toggle
 */
import { test, expect, Page } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

// Viewport sizes
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
};

test.describe("TV-3.10: LeftToolbar Responsive", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await gotoChartsPro(page);
  });

  // ============================================
  // Desktop Tests (≥768px)
  // ============================================

  test("1. Desktop: vertical toolbar is visible in grid slot", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.waitForTimeout(200);

    const container = page.locator('[data-testid="tv-leftbar-container"]');
    await expect(container).toBeVisible();

    // Should be vertical (flex-col)
    const box = await container.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeGreaterThan(box!.width); // Taller than wide = vertical
  });

  test("2. Desktop: mobile pill is NOT visible", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.waitForTimeout(200);

    const pill = page.locator('[data-testid="tv-leftbar-pill"]');
    await expect(pill).not.toBeVisible();
  });

  test("3. Desktop: tool selection updates dump().ui.activeTool", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.waitForTimeout(200);

    // Click hline tool
    await page.click('[data-testid="tool-hline"]');
    await page.waitForTimeout(100);

    const dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.activeTool).toBe("hline");
  });

  // ============================================
  // Tablet Tests (768px boundary)
  // ============================================

  test("4. Tablet (768px): vertical toolbar is visible (boundary case)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await page.waitForTimeout(200);

    const container = page.locator('[data-testid="tv-leftbar-container"]');
    await expect(container).toBeVisible();
  });

  // ============================================
  // Mobile Tests (<768px)
  // ============================================

  test("5. Mobile: floating pill is visible", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.waitForTimeout(300);

    const pill = page.locator('[data-testid="tv-leftbar-pill"]');
    await expect(pill).toBeVisible();
  });

  test("6. Mobile: vertical toolbar is NOT visible", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.waitForTimeout(300);

    const container = page.locator('[data-testid="tv-leftbar-container"]');
    await expect(container).not.toBeVisible();
  });

  test("7. Mobile: pill is positioned at bottom center", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.waitForTimeout(300);

    const pill = page.locator('[data-testid="tv-leftbar-pill"]');
    const pillBox = await pill.boundingBox();
    expect(pillBox).toBeTruthy();

    // Should be near bottom (within 80px from bottom)
    const viewportHeight = VIEWPORTS.mobile.height;
    expect(pillBox!.y + pillBox!.height).toBeGreaterThan(viewportHeight - 80);

    // Should be roughly centered horizontally (within 50px of center)
    const viewportCenter = VIEWPORTS.mobile.width / 2;
    const pillCenter = pillBox!.x + pillBox!.width / 2;
    expect(Math.abs(pillCenter - viewportCenter)).toBeLessThan(50);
  });

  test("8. Mobile: tool buttons have touch-friendly size (≥40px)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.waitForTimeout(300);

    // Use specific locator within pill to avoid duplicate matches
    const pill = page.locator('[data-testid="tv-leftbar-pill"]');
    const toolButton = pill.locator('[data-testid="tool-hline"]');
    const box = await toolButton.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(box!.height).toBeGreaterThanOrEqual(40);
  });

  test("9. Mobile: tool selection updates dump().ui.activeTool", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.waitForTimeout(300);

    // Click trendline tool in pill (use specific locator)
    const pill = page.locator('[data-testid="tv-leftbar-pill"]');
    await pill.locator('[data-testid="tool-trendline"]').click();
    await page.waitForTimeout(100);

    const dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.activeTool).toBe("trendline");
  });

  test("10. Mobile: pill can be collapsed and expanded", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.waitForTimeout(300);

    const pill = page.locator('[data-testid="tv-leftbar-pill"]');

    // Initially expanded - tool buttons visible
    await expect(pill.locator('[data-testid="tool-hline"]')).toBeVisible();

    // Click collapse toggle
    await pill.locator('[data-testid="tool-pill-toggle"]').click();
    await page.waitForTimeout(200);

    // Tool buttons should be hidden (not in DOM when collapsed)
    await expect(pill.locator('[data-testid="tool-hline"]')).not.toBeVisible();

    // Pill container should still be visible (just smaller)
    await expect(pill).toBeVisible();

    // Click expand toggle
    await pill.locator('[data-testid="tool-pill-toggle"]').click();
    await page.waitForTimeout(200);

    // Tool buttons visible again
    await expect(pill.locator('[data-testid="tool-hline"]')).toBeVisible();
  });

  test("11. Mobile: chart is still interactive (pill at bottom, height < 100px)", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.waitForTimeout(300);

    // Get chart root
    const chartRoot = page.locator('[data-testid="tv-chart-root"]');
    await expect(chartRoot).toBeVisible();

    // Pill should exist and be compact (not blocking most of chart)
    const pill = page.locator('[data-testid="tv-leftbar-pill"]');
    const pillBox = await pill.boundingBox();

    expect(pillBox).toBeTruthy();

    // Pill should be compact height (≤60px is reasonable for horizontal pill)
    expect(pillBox!.height).toBeLessThanOrEqual(60);

    // Pill should be positioned near bottom of viewport (within 100px from bottom)
    const viewportHeight = VIEWPORTS.mobile.height;
    expect(pillBox!.y + pillBox!.height).toBeGreaterThan(viewportHeight - 100);
  });

  // ============================================
  // Viewport Transition Tests
  // ============================================

  test("12. Viewport transition: desktop → mobile shows pill", async ({ page }) => {
    // Start desktop
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.waitForTimeout(200);

    await expect(page.locator('[data-testid="tv-leftbar-container"]')).toBeVisible();
    await expect(page.locator('[data-testid="tv-leftbar-pill"]')).not.toBeVisible();

    // Resize to mobile
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.waitForTimeout(300);

    await expect(page.locator('[data-testid="tv-leftbar-container"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="tv-leftbar-pill"]')).toBeVisible();
  });

  test("13. Viewport transition: mobile → desktop shows vertical toolbar", async ({ page }) => {
    // Start mobile
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.waitForTimeout(300);

    await expect(page.locator('[data-testid="tv-leftbar-pill"]')).toBeVisible();

    // Resize to desktop
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.waitForTimeout(200);

    await expect(page.locator('[data-testid="tv-leftbar-container"]')).toBeVisible();
    await expect(page.locator('[data-testid="tv-leftbar-pill"]')).not.toBeVisible();
  });

  test("14. Tool state preserved across viewport changes", async ({ page }) => {
    // Set tool on desktop (use container-specific locator)
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.waitForTimeout(200);

    const desktopToolbar = page.locator('[data-testid="tv-leftbar-container"]');
    await desktopToolbar.locator('[data-testid="tool-channel"]').click();
    await page.waitForTimeout(100);

    let dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.activeTool).toBe("channel");

    // Resize to mobile
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.waitForTimeout(300);

    // Tool state should be preserved
    dump = await page.evaluate(() => window.__lwcharts?.dump?.());
    expect(dump?.ui?.activeTool).toBe("channel");

    // Active state should be visible in pill (use pill-specific locator)
    const pill = page.locator('[data-testid="tv-leftbar-pill"]');
    const channelBtn = pill.locator('[data-testid="tool-channel"]');
    await expect(channelBtn).toBeVisible();
    // Button should have "active" styling (bg-slate-600)
    await expect(channelBtn).toHaveClass(/bg-slate-600/);
  });
});
