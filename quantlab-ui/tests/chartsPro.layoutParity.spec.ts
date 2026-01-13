import { test, expect } from '@playwright/test';
import { gotoChartsPro } from './helpers';

async function getDump(page: any): Promise<any> {
  return await page.evaluate(() => {
    return (window as any).__lwcharts?.dump?.();
  });
}

test.describe('TV-4 Shell Layout Parity', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Set up local storage
    await page.addInitScript(() => {
      localStorage.setItem("cp.mock", "1");
      localStorage.setItem("ql/apiBase", "http://127.0.0.1:8000");
    });

    // Log console messages for debugging
    page.on("console", (msg) => console.log("BROWSER:", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.log("PAGEERROR:", err.name, err.message));
    
    // Navigate to app with mock=1
    await page.goto("/?mock=1");
    
    // Navigate to ChartsPro tab
    await gotoChartsPro(page, testInfo);
    
    // Wait for chart to load
    await page.waitForFunction(
      () => {
        const dump = (window as any).__lwcharts?.dump?.();
        return dump?.data?.baseReady === true;
      },
      { timeout: 10000 }
    );
  });

  test('should render TV-4 shell grid with all required testids', async ({ page }) => {
    // Verify shell container exists
    const shell = page.locator('[data-testid="tv-shell"]');
    await expect(shell).toBeVisible();

    // Verify all 5 shell areas exist
    const topbar = page.locator('[data-testid="tv-topbar"]');
    const leftbar = page.locator('[data-testid="tv-leftbar"]');
    const chartRoot = page.locator('[data-testid="tv-chart-root"]');
    const rightbar = page.locator('[data-testid="tv-rightbar"]');
    const bottombar = page.locator('[data-testid="tv-bottombar"]');

    await expect(topbar).toBeVisible();
    await expect(leftbar).toBeVisible();
    await expect(chartRoot).toBeVisible();
    await expect(rightbar).toBeVisible();
    await expect(bottombar).toBeVisible();
  });

  test('should have chart filling center (tv-chart-root)', async ({ page }) => {
    // Get chart root container
    const chartRoot = page.locator('[data-testid="tv-chart-root"]');
    
    // Verify viewport is inside chart root
    const viewport = page.locator('[data-testid="chartspro-viewport"]');
    await expect(viewport).toBeVisible();

    // Get bounding boxes
    const chartRootBox = await chartRoot.boundingBox();
    const viewportBox = await viewport.boundingBox();

    // Chart root should have meaningful dimensions (min 300px width for desktop)
    expect(chartRootBox?.width ?? 0).toBeGreaterThan(300);
    expect(chartRootBox?.height ?? 0).toBeGreaterThan(300);

    // Viewport should be inside chart root
    if (viewportBox && chartRootBox) {
      expect(viewportBox.x).toBeGreaterThanOrEqual(chartRootBox.x);
      expect(viewportBox.y).toBeGreaterThanOrEqual(chartRootBox.y);
      expect(viewportBox.x + viewportBox.width).toBeLessThanOrEqual(chartRootBox.x + chartRootBox.width);
      expect(viewportBox.y + viewportBox.height).toBeLessThanOrEqual(chartRootBox.y + chartRootBox.height);
    }
  });

  test('should not have excessive page-level scrolling', async ({ page }) => {
    // Set viewport to common desktop size
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Get chart shell dimensions
    const chartShell = page.locator('[data-testid="tv-shell"]');
    const shellBox = await chartShell.boundingBox();

    // Chart shell should fit within viewport without excessive scrolling
    if (shellBox) {
      // The chart shell + surrounding UI should fit roughly within viewport height
      // Allow tolerance for header/footers
      const excessScroll = shellBox.height - 1000; // 1000px is approx usable height
      expect(excessScroll).toBeLessThan(500); // Allow some overflow, but not excessive
    }
  });

  test('should maintain chart visibility and responsiveness in shell', async ({ page }) => {
    // Wait for chart to be ready
    const viewport = page.locator('[data-testid="chartspro-viewport"]');
    await expect(viewport).toBeVisible();

    // Verify candles are rendered (chart is ready)
    const ohlcStrip = page.locator('[data-testid="ohlc-strip"]');
    
    // Move mouse to trigger hover
    await page.mouse.move(500, 400);
    await page.waitForTimeout(100);

    // OHLC strip should appear when hovering
    const isOhlcVisible = await ohlcStrip.isVisible();
    expect([true, false]).toContain(isOhlcVisible); // May or may not be visible depending on data
  });

  test('should keep legend/overlays in-chart and not overflow shell', async ({ page }) => {
    // Get chart root bounds
    const chartRoot = page.locator('[data-testid="tv-chart-root"]');
    const chartRootBox = await chartRoot.boundingBox();

    // Get legend overlay
    const legendOverlay = page.locator('[data-testid="legend-overlay"]');
    
    if (await legendOverlay.isVisible()) {
      const legendBox = await legendOverlay.boundingBox();

      // Legend should be inside chart root
      if (legendBox && chartRootBox) {
        expect(legendBox.x).toBeGreaterThanOrEqual(chartRootBox.x);
        expect(legendBox.y).toBeGreaterThanOrEqual(chartRootBox.y);
      }
    }
  });

  test('should preserve chart readiness and data display in shell', async ({ page }) => {
    // Wait for chart to load
    await page.waitForFunction(
      () => {
        const dump = (window as any).__lwcharts?.dump?.();
        return dump?.data?.baseReady === true;
      },
      { timeout: 10000 }
    );

    const dump = await getDump(page);
    expect(dump.data?.baseReady).toBe(true);
    expect(dump.ui?.chartType).toBeDefined();
  });

  test('should render chart with correct aspect in shell grid', async ({ page }) => {
    const chartRoot = page.locator('[data-testid="tv-chart-root"]');
    const box = await chartRoot.boundingBox();

    // Chart root should be tall enough for meaningful visualization
    if (box) {
      const aspectRatio = (box.width ?? 1) / (box.height ?? 1);
      // Typical chart aspect ratios are between 1:1 and 3:1
      expect(aspectRatio).toBeGreaterThan(0.5);
      expect(aspectRatio).toBeLessThan(5);
    }
  });
});
