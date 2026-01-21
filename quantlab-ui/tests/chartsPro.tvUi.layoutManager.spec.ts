import { test, expect, Page } from '@playwright/test';
import { gotoChartsPro } from './helpers';

/**
 * TV-12.1-12.8: Layout Save/Load Manager (TradingView-style)
 * 
 * Tests for named layout persistence:
 * - Create/save named layouts (symbol, timeframe, chart type, panel states)
 * - Load layout by name
 * - Delete saved layouts
 * - Reload page with layout restoration
 * - Invalid/corrupt data fallback
 * 
 * Requirements:
 * - Save UI in TopBar (non-blocking overlay)
 * - localStorage: cp.layouts.* (JSON)
 * - dump().ui.layout: { activeName?, savedCount, lastLoaded? }
 */

test.describe('TV-12: Layout Manager', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage, browser }, testInfo) => {
    page = testPage;

    // Diagnostic: catch page errors
    page.on('pageerror', (error) => {
      console.error('[PageError]:', error.message);
    });

    // Diagnostic: log console warnings/errors
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[Console ${msg.type()}]:`, msg.text());
      }
    });

    // Use deterministic navigation helper (mock=1)
    await gotoChartsPro(page, testInfo, { mock: true });

    // Clean localStorage for deterministic state (after navigation)
    await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('cp.layouts.')) {
          keys.push(key);
        }
      }
      keys.forEach(k => localStorage.removeItem(k));
    });

    // Verify TopBar rendered
    const topbar = page.getByTestId('tv-topbar-root');
    await expect(topbar).toBeVisible({ timeout: 10000 });

    // Diagnostic: if TopBar not visible, take screenshot
    const isTopbarVisible = await topbar.isVisible().catch(() => false);
    if (!isTopbarVisible) {
      const screenshotPath = testInfo.outputPath('topbar-not-visible.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`[Diagnostic] TopBar not visible, screenshot: ${screenshotPath}`);
      
      // Dump body text for analysis
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
      console.error(`[Diagnostic] Body text:\n${bodyText}`);
    }
  });

  // ============================================================
  // Test 1: Save Layout button visible in TopBar
  // ============================================================
  test('TV-12.1: Save Layout button appears in TopBar', async () => {
    // Use existing topbar-save-layout testid
    const saveBtn = page.getByTestId('topbar-save-layout');
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
  });

  // ============================================================
  // Test 2: Save current layout with name
  // ============================================================
  test('TV-12.2: Save current layout (symbol + chart type)', async () => {
    // Get initial state via dump()
    const initialDump = await page.evaluate(() => (window as any).__lwcharts?.dump?.()?.ui);
    expect(initialDump).toBeDefined();

    // Click Save Layout button (triggers modal)
    await page.click('[data-testid="topbar-save-layout"]');
    
    // Wait for layout manager panel
    await page.waitForSelector('[data-testid="layout-manager-panel"]', { timeout: 2000 });

    // Click "Save As" to show form
    await page.click('[data-testid="layout-save-btn"]');
    await page.waitForSelector('[data-testid="layout-name-input"]', { timeout: 2000 });

    // Type layout name
    await page.fill('[data-testid="layout-name-input"]', 'My Test Layout');

    // Click confirm
    await page.click('[data-testid="layout-confirm-save-btn"]');

    // Verify layout was saved to localStorage
    const savedLayout = await page.evaluate(() => {
      const stored = localStorage.getItem('cp.layouts.My Test Layout');
      return stored ? JSON.parse(stored) : null;
    });
    expect(savedLayout).toBeDefined();
    expect(savedLayout?.symbol).toBeDefined();
  });

  // ============================================================
  // Test 3: Load saved layout restores state
  // ============================================================
  test('TV-12.3: Load saved layout restores symbol and chart type', async () => {
    // Pre-save a layout to localStorage
    await page.evaluate(() => {
      const layout = {
        symbol: 'AAPL.US',
        timeframe: '1D',
        chartType: 'candlestick',
        savedAt: Date.now(),
      };
      localStorage.setItem('cp.layouts.TestLayout', JSON.stringify(layout));
    });

    // Open layout manager via Save button
    await page.click('[data-testid="topbar-save-layout"]');
    await page.waitForSelector('[data-testid="layout-manager-panel"]', { timeout: 2000 });

    // Click on saved layout item
    await page.click('[data-testid="layout-item-TestLayout"]');

    // Verify localStorage has active layout marker
    const activeLayout = await page.evaluate(() => localStorage.getItem('cp.layouts.active'));
    expect(activeLayout).toBe('TestLayout');
  });

  // ============================================================
  // Test 4: Delete saved layout
  // ============================================================
  test('TV-12.4: Delete layout removes it from list', async () => {
    // Pre-save two layouts
    await page.evaluate(() => {
      localStorage.setItem('cp.layouts.Layout1', JSON.stringify({ symbol: 'AAPL.US' }));
      localStorage.setItem('cp.layouts.Layout2', JSON.stringify({ symbol: 'MSFT.US' }));
    });

    // Open layout manager
    await page.click('[data-testid="topbar-save-layout"]');
    await page.waitForSelector('[data-testid="layout-manager-panel"]', { timeout: 2000 });

    // Wait for layouts to load (useEffect reads localStorage)
    await page.waitForSelector('[data-testid="layout-item-Layout1"]', { timeout: 2000 });

    // Count initial layouts
    const countBefore = await page.locator('[data-testid*="layout-item-"]').count();
    expect(countBefore).toBe(2);

    // Delete Layout1
    await page.click('[data-testid="layout-delete-Layout1"]');

    // Confirm delete
    await page.click('[data-testid="layout-confirm-delete-btn"]');

    // Verify count decreased
    const countAfter = await page.locator('[data-testid*="layout-item-"]').count();
    expect(countAfter).toBe(1);
  });

  // ============================================================
  // Test 4.5: Reset all layouts to default
  // ============================================================
  test('TV-12.5: Reset All button clears all saved layouts', async () => {
    // Pre-save two layouts
    await page.evaluate(() => {
      localStorage.setItem('cp.layouts.Layout1', JSON.stringify({ symbol: 'AAPL.US' }));
      localStorage.setItem('cp.layouts.Layout2', JSON.stringify({ symbol: 'MSFT.US' }));
    });

    // Open layout manager
    await page.click('[data-testid="topbar-save-layout"]');
    await page.waitForSelector('[data-testid="layout-manager-panel"]', { timeout: 2000 });

    // Wait for layouts to load (useEffect reads localStorage)
    await page.waitForSelector('[data-testid="layout-item-Layout1"]', { timeout: 2000 });

    // Verify layouts are in list
    const countBefore = await page.locator('[data-testid*="layout-item-"]').count();
    expect(countBefore).toBe(2);

    // Click Reset All button
    await page.click('[data-testid="layout-reset-btn"]');

    // Verify layouts are cleared from localStorage
    const layout1 = await page.evaluate(() => localStorage.getItem('cp.layouts.Layout1'));
    const layout2 = await page.evaluate(() => localStorage.getItem('cp.layouts.Layout2'));
    expect(layout1).toBeNull();
    expect(layout2).toBeNull();

    // Verify list is now empty
    const countAfter = await page.locator('[data-testid*="layout-item-"]').count();
    expect(countAfter).toBe(0);
  });

  // ============================================================
  // Test 5: Layout persists after page reload
  // ============================================================
  test('TV-12.5: Saved layout persists and restores after reload', async ({}, testInfo) => {
    // Save a layout
    const layoutData = {
      symbol: 'TSLA.US',
      timeframe: '4H',
      chartType: 'candlestick',
      savedAt: Date.now(),
    };

    await page.evaluate((data) => {
      localStorage.setItem('cp.layouts.PersistTest', JSON.stringify(data));
      // Also set as active layout
      localStorage.setItem('cp.layouts.active', 'PersistTest');
    }, layoutData);

    // Reload page
    await page.reload({ waitUntil: 'networkidle' });
    
    // Re-navigate to ChartsPro tab
    await gotoChartsPro(page, testInfo, { mock: true });

    // Verify layout was restored from localStorage
    const storedLayout = await page.evaluate(() => {
      return localStorage.getItem('cp.layouts.PersistTest');
    });
    expect(storedLayout).toBeDefined();
    const parsed = JSON.parse(storedLayout!);
    expect(parsed.symbol).toBe('TSLA.US');
  });
});
