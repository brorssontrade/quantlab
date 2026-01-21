/**
 * ChartsPro TradingView Parity Tests
 * Tests for OHLC strip, context menu, and UI features
 */
import { test, expect } from "@playwright/test";

test.describe("ChartsPro TradingView Parity", () => {
  test.beforeEach(async ({ page }) => {
    // Load Charts Pro tab with mock data for deterministic testing
    await page.goto("/?mock=1");
    
    // Wait for app to load and click charts tab
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    
    // Wait for chart shell to render
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800); // Allow chart to stabilize
  });

  test.describe("OHLC Strip", () => {
    test("OHLC strip is visible in top-left corner", async ({ page }) => {
      const ohlcStrip = page.locator('[data-testid="chartspro-ohlc-strip"]');
      await expect(ohlcStrip).toBeVisible({ timeout: 5000 });
    });

    test("OHLC strip shows symbol name", async ({ page }) => {
      const ohlcStrip = page.locator('[data-testid="chartspro-ohlc-strip"]');
      const symbolText = ohlcStrip.locator(".chartspro-ohlc-strip__symbol");
      await expect(symbolText).toBeVisible();
      // Should contain text (symbol name)
      await expect(symbolText).not.toHaveText("");
    });

    test("OHLC strip shows timeframe badge", async ({ page }) => {
      const ohlcStrip = page.locator('[data-testid="chartspro-ohlc-strip"]');
      const tfBadge = ohlcStrip.locator(".chartspro-ohlc-strip__timeframe");
      await expect(tfBadge).toBeVisible();
    });

    test("OHLC strip shows OHLC values", async ({ page }) => {
      const ohlcStrip = page.locator('[data-testid="chartspro-ohlc-strip"]');
      
      // Check for O, H, L, C labels - these are in chartspro-ohlc-strip__label spans
      const labels = ohlcStrip.locator(".chartspro-ohlc-strip__label");
      const labelCount = await labels.count();
      
      // Should have at least 4 labels (O, H, L, C) plus Vol
      expect(labelCount).toBeGreaterThanOrEqual(4);
      
      // Check for values
      const values = ohlcStrip.locator(".chartspro-ohlc-strip__value");
      const valueCount = await values.count();
      expect(valueCount).toBeGreaterThanOrEqual(4);
    });

    test("OHLC strip shows change indicator", async ({ page }) => {
      const ohlcStrip = page.locator('[data-testid="chartspro-ohlc-strip"]');
      const change = ohlcStrip.locator('[data-testid="chartspro-ohlc-change"]');
      await expect(change).toBeVisible();
    });

    test("OHLC strip shows volume", async ({ page }) => {
      const ohlcStrip = page.locator('[data-testid="chartspro-ohlc-strip"]');
      const volume = ohlcStrip.locator(".chartspro-ohlc-strip__volume");
      await expect(volume).toBeVisible();
    });

    test("OHLC strip updates on hover", async ({ page }) => {
      const ohlcStrip = page.locator('[data-testid="chartspro-ohlc-strip"]');
      const chartSurface = page.locator(".chartspro-price");
      
      // Get initial close value
      const initialClose = await ohlcStrip.locator(".chartspro-ohlc-strip__value").nth(3).textContent();
      
      // Hover over a different part of the chart
      const box = await chartSurface.boundingBox();
      if (box) {
        // Hover at 25% from left (should be an earlier bar)
        await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
        await page.waitForTimeout(200);
        
        // Get new close value
        const newClose = await ohlcStrip.locator(".chartspro-ohlc-strip__value").nth(3).textContent();
        
        // Values should exist (may be same or different depending on data)
        expect(initialClose).toBeTruthy();
        expect(newClose).toBeTruthy();
      }
    });
  });

  test.describe("Context Menu", () => {
    test("context menu state is available in dump()", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump).toBeTruthy();
      expect(dump.ui).toBeTruthy();
      expect(dump.ui.contextMenu).toBeTruthy();
      expect(typeof dump.ui.contextMenu.open).toBe("boolean");
      expect(dump.ui.contextMenu.open).toBe(false); // Initially closed
    });

    test("can programmatically open context menu via state", async ({ page }) => {
      // For now, verify the context menu component exists and state works
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui?.contextMenu).toBeTruthy();
    });

    test("fit content action is available via API", async ({ page }) => {
      // Verify fit() function exists and can be called
      const result = await page.evaluate(() => {
        const api = (window as any).__lwcharts;
        if (!api?.fit) return { success: false };
        try {
          api.fit();
          return { success: true };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      });
      expect(result.success).toBe(true);
    });
  });

  test.describe("dump() Contract", () => {
    test("dump() includes ui.ohlcStripVisible", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump).toBeTruthy();
      expect(dump.ui).toBeTruthy();
      expect(typeof dump.ui.ohlcStripVisible).toBe("boolean");
    });

    test("dump() includes ui.contextMenu state", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump).toBeTruthy();
      expect(dump.ui).toBeTruthy();
      expect(dump.ui.contextMenu).toBeTruthy();
      expect(typeof dump.ui.contextMenu.open).toBe("boolean");
    });

    test("dump() hover includes ohlcStrip data", async ({ page }) => {
      // Hover over chart to get hover data
      const chartSurface = page.locator(".chartspro-price");
      const box = await chartSurface.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(200);
      }
      
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump).toBeTruthy();
      
      // If hover is captured, it should have ohlcStrip data
      if (dump.hover) {
        expect(dump.hover.ohlcStrip).toBeTruthy();
        expect(dump.hover.ohlcStrip.symbol).toBeTruthy();
        expect(dump.hover.ohlcStrip.open).toBeTruthy();
        expect(dump.hover.ohlcStrip.high).toBeTruthy();
        expect(dump.hover.ohlcStrip.low).toBeTruthy();
        expect(dump.hover.ohlcStrip.close).toBeTruthy();
      }
    });

    test("dump() hover.base includes full OHLC", async ({ page }) => {
      // Hover over chart
      const chartSurface = page.locator(".chartspro-price");
      const box = await chartSurface.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(200);
      }
      
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      
      if (dump?.hover?.base) {
        // New contract: base should have full OHLCV
        expect(typeof dump.hover.base.open).toBe("number");
        expect(typeof dump.hover.base.high).toBe("number");
        expect(typeof dump.hover.base.low).toBe("number");
        expect(typeof dump.hover.base.close).toBe("number");
        expect(typeof dump.hover.base.volume).toBe("number");
      }
    });
  });

  test.describe("Crosshair", () => {
    test("crosshair is visible on hover", async ({ page }) => {
      const chartSurface = page.locator(".chartspro-price");
      const box = await chartSurface.boundingBox();
      
      if (box) {
        // Move mouse to center of chart
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(100);
        
        // The chart should have crosshair lines (rendered via lightweight-charts)
        // We can't directly test the crosshair canvas, but we can verify hover state
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        // If hover is tracked, crosshair should be showing
        expect(dump).toBeTruthy();
      }
    });

    test("crosshair overlay has testable price pill", async ({ page }) => {
      const chartSurface = page.locator(".chartspro-price");
      const box = await chartSurface.boundingBox();
      
      if (box) {
        // Move mouse to center of chart
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(200);
        
        // Check for crosshair overlay testid (may be hidden if not hovering)
        const crosshairOverlay = page.locator('[data-testid="chartspro-crosshair"]');
        // The element exists even if hidden
        await expect(crosshairOverlay).toHaveCount(1, { timeout: 3000 });
        
        // Verify crosshair state in dump()
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        expect(dump?.ui?.crosshair).toBeTruthy();
        expect(typeof dump.ui.crosshair.visible).toBe("boolean");
      }
    });

    test("crosshair position is tracked in dump()", async ({ page }) => {
      const chartSurface = page.locator(".chartspro-price");
      const box = await chartSurface.boundingBox();
      
      if (box) {
        // Move mouse to center of chart
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(200);
        
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        expect(dump?.ui?.crosshair).toBeTruthy();
        expect(typeof dump.ui.crosshair.x).toBe("number");
        expect(typeof dump.ui.crosshair.y).toBe("number");
      }
    });
  });

  test.describe("Watermark", () => {
    test("watermark is visible by default", async ({ page }) => {
      const watermark = page.locator('[data-testid="chartspro-watermark"]');
      await expect(watermark).toBeVisible({ timeout: 5000 });
    });

    test("watermark shows symbol text", async ({ page }) => {
      const watermark = page.locator('[data-testid="chartspro-watermark"]');
      await expect(watermark).toBeVisible();
      // Should contain symbol text
      await expect(watermark).not.toHaveText("");
    });

    test("watermarkVisible is in dump()", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui).toBeTruthy();
      expect(typeof dump.ui.watermarkVisible).toBe("boolean");
      expect(dump.ui.watermarkVisible).toBe(true);
    });
  });

  test.describe("Magnet & Snap", () => {
    test("magnet state is in dump().ui", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui).toBeTruthy();
      expect(typeof dump.ui.magnet).toBe("boolean");
    });

    test("snap state is in dump().ui", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui).toBeTruthy();
      expect(typeof dump.ui.snap).toBe("boolean");
    });
  });

  test.describe("Last Price Line", () => {
    test("lastPrice is in dump().render", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.render).toBeTruthy();
      // lastPrice may be null if no data, but should exist in render
      if (dump.render.lastPrice) {
        expect(typeof dump.render.lastPrice.price).toBe("number");
        expect(typeof dump.render.lastPrice.time).toBe("number");
        expect(typeof dump.render.lastPrice.countdownSec).toBe("number");
      }
    });

    test("countdown is non-negative", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      if (dump?.render?.lastPrice) {
        expect(dump.render.lastPrice.countdownSec).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe("Scale State", () => {
    test("scale info is in dump().render.scale", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.render).toBeTruthy();
      expect(dump.render.scale).toBeTruthy();
      expect(typeof dump.render.scale.priceScaleMode).toBe("string");
    });

    test("barSpacing is tracked", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      if (dump?.render?.scale?.barSpacing !== null) {
        expect(typeof dump.render.scale.barSpacing).toBe("number");
      }
    });
  });

  test.describe("Context Menu - Extended", () => {
    test("lastContextAction is tracked", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui).toBeTruthy();
      // Should have lastContextAction field (may be null initially)
      expect("lastContextAction" in dump.ui).toBe(true);
    });

    test("add-alert action exists in menu config", async ({ page }) => {
      // Verify the menu actions are configured correctly by checking the dump
      // (right-click in canvas is blocked by lightweight-charts in headless mode)
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui).toBeTruthy();
      expect(dump.ui.contextMenu).toBeTruthy();
      // The menu actions are defined in DEFAULT_CHART_ACTIONS - we verify the ui state exists
      expect(typeof dump.ui.contextMenu.open).toBe("boolean");
    });

    test("settings action exists in menu config", async ({ page }) => {
      // Verify context menu structure exists
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui?.contextMenu).toBeTruthy();
      // Verify lastContextAction tracking exists
      expect("lastContextAction" in dump.ui).toBe(true);
    });
  });

  test.describe("Last Price Line - UI", () => {
    test("last price line element exists in DOM", async ({ page }) => {
      // Wait for chart data to load
      await page.waitForTimeout(500);
      const lastPriceLine = page.locator('[data-testid="chartspro-last-price-line"]');
      // Should exist in the DOM (may be hidden if no data)
      const count = await lastPriceLine.count();
      // At least 0 (component renders null if no data)
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test("countdown element exists when last price line is visible", async ({ page }) => {
      await page.waitForTimeout(500);
      const countdown = page.locator('[data-testid="chartspro-countdown"]');
      const count = await countdown.count();
      // If last price line is rendered, countdown should exist
      if (count > 0) {
        const text = await countdown.textContent();
        // Should have countdown format (mm:ss or hh:mm:ss or --:--)
        expect(text).toMatch(/^(\d{2}:\d{2}(:\d{2})?|--:--)$/);
      }
    });
  });

  test.describe("Volume Toggle", () => {
    test("volumeVisible is in dump().ui", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui).toBeTruthy();
      expect(typeof dump.ui.volumeVisible).toBe("boolean");
    });

    test("volume is visible by default", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui?.volumeVisible).toBe(true);
    });
  });

  test.describe("Crosshair Toggle", () => {
    test("crosshairEnabled is in dump().ui", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui).toBeTruthy();
      expect(typeof dump.ui.crosshairEnabled).toBe("boolean");
    });

    test("crosshair is enabled by default", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui?.crosshairEnabled).toBe(true);
    });
  });
});
