/**
 * chartsPro.candleVisibility.spec.ts
 * 
 * Regression test for candle visibility in workspace mode with TopControls.
 * After PRIO 2, candles must still render (not just volume/grid).
 */
import { test, expect } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

test.describe("Candle Visibility Regression", () => {
  test("Candles render in workspace mode with TopControls", async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    
    // Wait for chart to be ready with data
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    }, { timeout: 15000 });
    
    // Get the dump to verify data is loaded
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    console.log("[DEBUG] pricePoints:", dump?.pricePoints);
    console.log("[DEBUG] chartType:", dump?.ui?.chartType);
    console.log("[DEBUG] seriesType:", dump?.render?.seriesType);
    console.log("[DEBUG] candlePalette:", JSON.stringify(dump?.render?.candlePalette));
    
    // Verify we have price data
    expect(dump?.pricePoints).toBeGreaterThan(0);
    
    // Check that series is visible
    expect(dump?.render?.seriesType).toBe("candles");
    
    // Sample multiple points across the chart to find candle colors
    const sampleResults = await page.evaluate(async () => {
      const api = (window as any).__lwcharts;
      if (!api?.samplePixel) return { error: "samplePixel not available" };
      
      const samples: any[] = [];
      // Sample across the chart at different positions
      const positions = [
        { x: 0.2, y: 0.3 },
        { x: 0.4, y: 0.3 },
        { x: 0.6, y: 0.3 },
        { x: 0.8, y: 0.3 },
        { x: 0.5, y: 0.2 },
        { x: 0.5, y: 0.4 },
        { x: 0.5, y: 0.5 },
      ];
      
      for (const pos of positions) {
        const result = await api.samplePixel(pos.x, pos.y);
        samples.push({ pos, result });
      }
      
      return { samples };
    });
    
    console.log("[DEBUG] Sample results:", JSON.stringify(sampleResults, null, 2));
    
    // Check if we found any green (#26a69a) or red (#ef5350) pixels
    const upColor = { r: 38, g: 166, b: 154 }; // #26a69a
    const downColor = { r: 239, g: 83, b: 80 }; // #ef5350
    const bgColor = { r: 19, g: 23, b: 34 }; // #131722
    
    const isApproxColor = (px: any, target: any, threshold = 30) => {
      if (!px || px.a === 0) return false;
      return Math.abs(px.r - target.r) < threshold &&
             Math.abs(px.g - target.g) < threshold &&
             Math.abs(px.b - target.b) < threshold;
    };
    
    const samples = sampleResults?.samples ?? [];
    const hasUpColor = samples.some(s => isApproxColor(s.result, upColor));
    const hasDownColor = samples.some(s => isApproxColor(s.result, downColor));
    const allBgColor = samples.every(s => isApproxColor(s.result, bgColor) || s.result?.a === 0);
    
    console.log("[DEBUG] hasUpColor:", hasUpColor);
    console.log("[DEBUG] hasDownColor:", hasDownColor);
    console.log("[DEBUG] allBgColor:", allBgColor);
    
    // We should have at least one candle color, not all background
    expect(allBgColor).toBe(false);
  });

  test("Candles have correct styles after TopControls sync", async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    
    // Wait for chart
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    }, { timeout: 15000 });
    
    // Check that candlestick series exists and has data
    const seriesInfo = await page.evaluate(() => {
      const api = (window as any).__lwcharts;
      const priceSeriesRef = api?.priceSeriesRef?.current;
      if (!priceSeriesRef) return { error: "priceSeriesRef is null" };
      
      // Try to get series options
      try {
        const options = priceSeriesRef.options?.() ?? {};
        return {
          hasRef: true,
          seriesType: priceSeriesRef.seriesType?.() ?? "unknown",
          upColor: options.upColor,
          downColor: options.downColor,
          borderUpColor: options.borderUpColor,
          borderDownColor: options.borderDownColor,
          wickUpColor: options.wickUpColor,
          wickDownColor: options.wickDownColor,
          visible: options.visible,
        };
      } catch (e) {
        return { hasRef: true, error: String(e) };
      }
    });
    
    console.log("[DEBUG] Series info:", JSON.stringify(seriesInfo, null, 2));
    
    expect(seriesInfo.hasRef).toBe(true);
    expect(seriesInfo.error).toBeUndefined();
    
    // Verify colors are set and not transparent
    if (seriesInfo.upColor) {
      expect(seriesInfo.upColor).not.toBe("transparent");
      expect(seriesInfo.visible).not.toBe(false);
    }
  });

  test("TopControls sync does not clear base series data", async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    
    // Wait for initial load
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    }, { timeout: 15000 });
    
    const initialPoints = await page.evaluate(() => {
      return (window as any).__lwcharts?.dump?.()?.pricePoints ?? 0;
    });
    
    console.log("[DEBUG] Initial price points:", initialPoints);
    expect(initialPoints).toBeGreaterThan(0);
    
    // Toggle inspector (triggers sync effect)
    const inspectorToggle = page.locator('[data-testid="topbar-inspector-toggle"]');
    if (await inspectorToggle.count() > 0) {
      await inspectorToggle.click();
      await page.waitForTimeout(200);
    }
    
    // Verify points still exist
    const afterTogglePoints = await page.evaluate(() => {
      return (window as any).__lwcharts?.dump?.()?.pricePoints ?? 0;
    });
    
    console.log("[DEBUG] After toggle price points:", afterTogglePoints);
    expect(afterTogglePoints).toBe(initialPoints);
    
    // Toggle overlay (another sync trigger)
    const sma20Toggle = page.locator('[data-testid="topbar-overlay-sma-20"]');
    if (await sma20Toggle.count() > 0) {
      await sma20Toggle.click();
      await page.waitForTimeout(200);
    }
    
    // Verify points still exist
    const afterOverlayPoints = await page.evaluate(() => {
      return (window as any).__lwcharts?.dump?.()?.pricePoints ?? 0;
    });
    
    console.log("[DEBUG] After overlay price points:", afterOverlayPoints);
    expect(afterOverlayPoints).toBe(initialPoints);
  });
  
  test("Screenshot candles for visual verification", async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    
    // Wait for chart to be ready
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    }, { timeout: 15000 });
    
    // Take screenshot of the chart area
    const chartContainer = page.locator('[data-testid="chartspro-viewport"]');
    if (await chartContainer.count() > 0) {
      const screenshot = await chartContainer.screenshot();
      await testInfo.attach("chart-screenshot", { body: screenshot, contentType: "image/png" });
    } else {
      // Fallback to full page
      const screenshot = await page.screenshot();
      await testInfo.attach("full-page-screenshot", { body: screenshot, contentType: "image/png" });
    }
    
    // Log dump for debugging
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    console.log("[DEBUG] Final dump.render:", JSON.stringify(dump?.render, null, 2));
  });
});
