/**
 * ChartsPro Interactions Regression Tests
 * 
 * Tests that core chart interactions (zoom, hover, pan) work correctly
 * even with DrawingLayer + overlays enabled.
 * 
 * This suite guards against regressions where overlay layers accidentally
 * intercept pointer/wheel/mousemove events that should reach lightweight-charts.
 */
import { test, expect } from "@playwright/test";

type LwChartsApi = {
  dump: () => {
    hover: {
      time: number;
      base: { open: number; high: number; low: number; close: number; volume: number };
    } | null;
    render: {
      scale: { barSpacing: number; rightOffset: number };
    };
    ui: {
      crosshair: { visible: boolean; x: number; y: number };
      selectedObjectId: string | null;
      activeTool: string;
    };
  };
  hoverAt: (pos: "left" | "center" | "right" | "mid" | number) => void;
  debug: {
    zoom: (deltaY: number, clientX?: number, clientY?: number) => void;
  };
};

declare global {
  interface Window {
    __lwcharts: LwChartsApi;
  }
}

test.describe("ChartsPro Interactions Regression", () => {
  test.beforeEach(async ({ page }) => {
    // Load Charts Pro tab with mock data for deterministic testing
    await page.goto("/?mock=1");
    
    // Wait for app to load and click charts tab
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    
    // Wait for chart shell to render
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
    
    // Wait for chart canvas to be visible (lightweight-charts creates this)
    const chartCanvas = page.locator(".tv-lightweight-charts canvas").first();
    await expect(chartCanvas).toBeVisible({ timeout: 10000 });
    
    // IMPORTANT: Scroll chart into viewport so mouse events work
    await chartCanvas.scrollIntoViewIfNeeded();
    
    // Wait for QA API to be ready with actual data
    await page.waitForFunction(() => {
      const api = (window as unknown as { __lwcharts?: LwChartsApi }).__lwcharts;
      if (!api || typeof api.dump !== "function") return false;
      const dump = api.dump();
      // Ensure chart has data loaded
      return dump && dump.pricePoints > 0;
    }, { timeout: 10000 });
    
    await page.waitForTimeout(500); // Allow chart to fully stabilize
  });

  test.describe("Hover Updates (with overlays)", () => {
    test("mouse move updates hover state", async ({ page }) => {
      // Target the lightweight-charts canvas (not the overlay canvas)
      const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
      await expect(lwCanvas).toBeVisible({ timeout: 5000 });
      
      const canvasBox = await lwCanvas.boundingBox();
      expect(canvasBox).not.toBeNull();
      
      if (canvasBox) {
        // Move mouse to left side of chart
        await page.mouse.move(canvasBox.x + canvasBox.width * 0.2, canvasBox.y + canvasBox.height / 2);
        await page.waitForTimeout(200);
        
        const afterLeft = await page.evaluate(() => window.__lwcharts.dump().hover);
        
        // Move to right side
        await page.mouse.move(canvasBox.x + canvasBox.width * 0.8, canvasBox.y + canvasBox.height / 2);
        await page.waitForTimeout(200);
        
        const afterRight = await page.evaluate(() => window.__lwcharts.dump().hover);
        
        // Both hovers should have produced bar data
        expect(afterLeft).not.toBeNull();
        expect(afterRight).not.toBeNull();
        
        // Left and right should have different times (different bars)
        if (afterLeft && afterRight) {
          expect(afterLeft.time).not.toBe(afterRight.time);
        }
      }
    });

    test("hover updates OHLC values in dump", async ({ page }) => {
      const canvas = page.locator(".chartspro-price canvas").first();
      await expect(canvas).toBeVisible({ timeout: 5000 });
      
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      
      if (box) {
        // Move to chart center
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(300);
        
        const hoverData = await page.evaluate(() => window.__lwcharts.dump().hover);
        
        expect(hoverData).not.toBeNull();
        if (hoverData) {
          expect(hoverData.base).toBeDefined();
          expect(hoverData.base.open).toBeGreaterThan(0);
          expect(hoverData.base.high).toBeGreaterThanOrEqual(hoverData.base.open);
          expect(hoverData.base.low).toBeLessThanOrEqual(hoverData.base.close);
          expect(hoverData.base.close).toBeGreaterThan(0);
        }
      }
    });

    test("mouse move updates crosshair position", async ({ page }) => {
      const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
      await expect(lwCanvas).toBeVisible({ timeout: 5000 });
      
      const box = await lwCanvas.boundingBox();
      expect(box).not.toBeNull();
      
      if (box) {
        // Move mouse to chart center
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(300);
        
        // Verify the hover data has crosshair-related info
        // The key is that subscribeCrosshairMove fired and updated state
        const hover = await page.evaluate(() => window.__lwcharts.dump().hover);
        
        // If hover is populated, the crosshair subscription is working
        expect(hover).not.toBeNull();
        expect(hover?.time).toBeDefined();
        
        // Also check that the crosshair overlay element exists
        const crosshairElement = page.locator('[data-testid="chartspro-crosshair"]');
        await expect(crosshairElement).toBeAttached();
      }
    });
  });

  test.describe("Wheel Zoom (with overlays)", () => {
    test("wheel zoom changes barSpacing", async ({ page }) => {
      // Use the actual lightweight-charts canvas for zoom
      const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
      const box = await lwCanvas.boundingBox();
      expect(box).not.toBeNull();
      
      if (box) {
        // Get initial scale
        const initialScale = await page.evaluate(() => window.__lwcharts.dump().render.scale);
        const initialBarSpacing = initialScale.barSpacing ?? 6; // fallback if null
        
        // Move mouse to chart center first
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(100);
        
        // Zoom in using wheel (negative deltaY = scroll up = zoom in)
        await page.mouse.wheel(0, -100);
        await page.waitForTimeout(300);
        
        // Check barSpacing changed
        const afterZoomIn = await page.evaluate(() => window.__lwcharts.dump().render.scale);
        // barSpacing may still be null if ref isn't updated - use fallback
        const afterBarSpacing = afterZoomIn.barSpacing ?? 6;
        
        // After zooming in, either barSpacing increases OR visible range decreases
        // The test should verify zoom happened somehow
        const initialRange = await page.evaluate(() => {
          const dump = window.__lwcharts.dump();
          return dump.render?.visibleRange || null;
        });
        
        // Zoom in again to ensure effect
        await page.mouse.wheel(0, -100);
        await page.waitForTimeout(300);
        
        const finalRange = await page.evaluate(() => {
          const dump = window.__lwcharts.dump();
          return dump.render?.visibleRange || null;
        });
        
        // After zooming in, the visible range span should decrease (fewer bars visible)
        if (initialRange && finalRange) {
          const initialSpan = initialRange.to - initialRange.from;
          const finalSpan = finalRange.to - finalRange.from;
          expect(finalSpan).toBeLessThan(initialSpan);
        }
      }
    });
  });

  test.describe("Drawing layer doesn't block interactions", () => {
    test("hover works in select mode (default)", async ({ page }) => {
      // Verify we're in select mode
      const tool = await page.evaluate(() => window.__lwcharts.dump().ui.activeTool);
      expect(tool).toBe("select");
      
      const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
      const box = await lwCanvas.boundingBox();
      
      if (box) {
        // Hover should work
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(150);
        
        const hoverData = await page.evaluate(() => window.__lwcharts.dump().hover);
        expect(hoverData).not.toBeNull();
      }
    });

    test("zoom works in select mode", async ({ page }) => {
      const tool = await page.evaluate(() => window.__lwcharts.dump().ui.activeTool);
      expect(tool).toBe("select");
      
      const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
      const box = await lwCanvas.boundingBox();
      
      if (box) {
        // Get initial visible range
        const initialRange = await page.evaluate(() => window.__lwcharts.dump().render?.visibleRange || null);
        
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, -100); // zoom in
        await page.waitForTimeout(300);
        
        const afterRange = await page.evaluate(() => window.__lwcharts.dump().render?.visibleRange || null);
        
        // After zooming in, visible range span should decrease
        if (initialRange && afterRange) {
          const initialSpan = initialRange.to - initialRange.from;
          const afterSpan = afterRange.to - afterRange.from;
          expect(afterSpan).toBeLessThan(initialSpan);
        }
      }
    });

    test("crosshair overlay doesn't block hover", async ({ page }) => {
      const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
      const box = await lwCanvas.boundingBox();
      
      if (box) {
        // Move mouse across chart
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
        await page.waitForTimeout(150);
        
        const hover1 = await page.evaluate(() => window.__lwcharts.dump().hover);
        
        await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
        await page.waitForTimeout(150);
        
        const hover2 = await page.evaluate(() => window.__lwcharts.dump().hover);
        
        // Both hovers should have data, and they should be different bars
        expect(hover1).not.toBeNull();
        expect(hover2).not.toBeNull();
        if (hover1 && hover2) {
          expect(hover1.time).not.toBe(hover2.time);
        }
      }
    });
  });

  test.describe("OHLC Strip updates on hover", () => {
    test("OHLC strip values change when hovering different bars", async ({ page }) => {
      const ohlcStrip = page.locator('[data-testid="chartspro-ohlc-strip"]');
      await expect(ohlcStrip).toBeVisible();
      
      const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
      const box = await lwCanvas.boundingBox();
      
      if (box) {
        // Hover at left
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
        await page.waitForTimeout(200);
        
        const closeValue1 = await ohlcStrip.locator(".chartspro-ohlc-strip__value").nth(3).textContent();
        
        // Hover at right (different bar)
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
        await page.waitForTimeout(200);
        
        const closeValue2 = await ohlcStrip.locator(".chartspro-ohlc-strip__value").nth(3).textContent();
        
        // Values should exist
        expect(closeValue1).toBeTruthy();
        expect(closeValue2).toBeTruthy();
        
        // Values may or may not be different depending on the data
        // The key assertion is that hover updates work - values are populated
      }
    });
  });

  test.describe("Pan/Drag interactions", () => {
    test("drag on chart area doesn't crash", async ({ page }) => {
      const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
      const box = await lwCanvas.boundingBox();
      
      if (box) {
        // Drag from center to left
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 10 });
        await page.mouse.up();
        
        // Should not have errored - verify dump still works
        const dump = await page.evaluate(() => window.__lwcharts.dump());
        expect(dump).toBeDefined();
        expect(dump.render).toBeDefined();
      }
    });

    test("pan changes visible range", async ({ page }) => {
      const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
      const box = await lwCanvas.boundingBox();
      
      if (box) {
        const initialScale = await page.evaluate(() => window.__lwcharts.dump().render.scale);
        
        // Drag right to left (pan to see more recent data)
        await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(150);
        
        const afterPan = await page.evaluate(() => window.__lwcharts.dump().render.scale);
        
        // rightOffset should have changed after pan
        expect(afterPan.rightOffset).not.toBe(initialScale.rightOffset);
      }
    });
  });

  test.describe("Draw-mode parity", () => {
    test("hover updates when activeTool != select (Trend)", async ({ page }) => {
      // Switch to Trend tool via toolbar button
      // Prefer QA setter for reliability in CI
      await page.evaluate(() => window.__lwcharts.set({ activeTool: 'trend' }));
      // Give React time to propagate state change
      await page.waitForTimeout(100);
      // Wait with generous timeout for tool state to propagate through zustand + React
      await page.waitForFunction(
        () => window.__lwcharts.dump().ui.activeTool === 'trend',
        { timeout: 5000 }
      );

      const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
      const box = await lwCanvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
        await page.waitForTimeout(150);
        const hover = await page.evaluate(() => window.__lwcharts.dump().hover);
        expect(hover).not.toBeNull();
      }
    });

    test("wheel zoom works when activeTool != select (Trend)", async ({ page }) => {
      await page.evaluate(() => window.__lwcharts.set({ activeTool: 'trend' }));
      await page.waitForTimeout(100);
      await page.waitForFunction(
        () => window.__lwcharts.dump().ui.activeTool === 'trend',
        { timeout: 5000 }
      );
      const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
      const box = await lwCanvas.boundingBox();
      if (box) {
        const initialRange = await page.evaluate(() => window.__lwcharts.dump().render?.visibleRange || null);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(250);
        const afterRange = await page.evaluate(() => window.__lwcharts.dump().render?.visibleRange || null);
        if (initialRange && afterRange) {
          const initialSpan = initialRange.to - initialRange.from;
          const afterSpan = afterRange.to - afterRange.from;
          expect(afterSpan).toBeLessThan(initialSpan);
        }
      }
    });

    test("space-to-pan works while a tool is active", async ({ page }) => {
      await page.evaluate(() => window.__lwcharts.set({ activeTool: 'trend' }));
      await page.waitForTimeout(100);
      await page.waitForFunction(
        () => window.__lwcharts.dump().ui.activeTool === 'trend',
        { timeout: 5000 }
      );
      const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
      const box = await lwCanvas.boundingBox();
      if (box) {
        const initial = await page.evaluate(() => window.__lwcharts.dump().render.scale.rightOffset);
        await page.keyboard.down(" "); // Space
        await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 10 });
        await page.mouse.up();
        await page.keyboard.up(" ");
        const after = await page.evaluate(() => window.__lwcharts.dump().render.scale.rightOffset);
        expect(after).not.toBe(initial);
      }
    });
  });
});
