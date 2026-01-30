/**
 * chartsPro.candleZoom.spec.ts
 * 
 * Test to verify candles are visible at various zoom levels
 */
import { test, expect } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

test.describe("Candle Zoom Visibility", () => {
  test("Candles visible at initial zoom (may be thin)", async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    
    // Wait for chart to be ready
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    }, { timeout: 15000 });
    
    // Get initial bar spacing
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    console.log("[DEBUG] Initial barSpacing:", dump?.render?.barSpacing);
    console.log("[DEBUG] Initial pricePoints:", dump?.render?.pricePoints);
    
    // Sample at initial zoom
    const sampleResults = await page.evaluate(async () => {
      const lwContainer = document.querySelector('.tv-lightweight-charts');
      const canvases = lwContainer ? Array.from(lwContainer.querySelectorAll('canvas')) : [];
      
      let priceCanvas: HTMLCanvasElement | null = null;
      let maxArea = 0;
      for (const canvas of canvases) {
        if (canvas.width < 200 || canvas.height < 200) continue;
        const area = canvas.width * canvas.height;
        if (area > maxArea) {
          maxArea = area;
          priceCanvas = canvas;
        }
      }
      
      if (!priceCanvas) return { error: "No canvas" };
      
      const ctx = priceCanvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return { error: "No context" };
      
      // Scan multiple horizontal lines across the chart
      const colors = new Map<string, number>();
      for (let y = 100; y < priceCanvas.height - 100; y += 50) {
        for (let x = 0; x < priceCanvas.width; x += 1) {
          const data = ctx.getImageData(x, y, 1, 1).data;
          if (data[3] === 0) continue; // Skip transparent
          const key = `${data[0]},${data[1]},${data[2]}`;
          colors.set(key, (colors.get(key) || 0) + 1);
        }
      }
      
      const colorList = Array.from(colors.entries())
        .map(([k, count]) => {
          const [r, g, b] = k.split(',').map(Number);
          return { rgb: { r, g, b }, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
      
      return { uniqueColors: colors.size, topColors: colorList };
    });
    
    console.log("[DEBUG] Initial sample:", JSON.stringify(sampleResults, null, 2));
    
    // Check for candle colors
    const upColor = { r: 38, g: 166, b: 154 }; // #26a69a
    const downColor = { r: 239, g: 83, b: 80 }; // #ef5350
    
    const hasUpColor = sampleResults?.topColors?.some((c: any) => 
      Math.abs(c.rgb.r - upColor.r) < 10 && 
      Math.abs(c.rgb.g - upColor.g) < 10 && 
      Math.abs(c.rgb.b - upColor.b) < 10
    );
    const hasDownColor = sampleResults?.topColors?.some((c: any) => 
      Math.abs(c.rgb.r - downColor.r) < 10 && 
      Math.abs(c.rgb.g - downColor.g) < 10 && 
      Math.abs(c.rgb.b - downColor.b) < 10
    );
    
    console.log("[DEBUG] At initial zoom - hasUpColor:", hasUpColor, "hasDownColor:", hasDownColor);
    
    // Should have at least one candle color even at initial zoom
    expect(hasUpColor || hasDownColor).toBe(true);
  });

  test("Candles visible after zooming in to increase bar spacing", async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    
    // Wait for chart to be ready
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    }, { timeout: 15000 });
    
    // Get initial bar spacing
    let dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    console.log("[DEBUG] Initial barSpacing:", dump?.render?.barSpacing);
    console.log("[DEBUG] Initial visibleRange:", JSON.stringify(dump?.render?.visibleRange));
    
    // Zoom in using chart API (show fewer bars = larger bar spacing)
    await page.evaluate(() => {
      const api = (window as any).__lwcharts;
      const chart = api?.chart;
      if (chart) {
        const timeScale = chart.timeScale();
        // Set visible range to just last 50 bars
        timeScale.setVisibleLogicalRange({ from: -50, to: 0 });
      }
    });
    
    // Wait for render
    await page.waitForTimeout(300);
    
    // Check new bar spacing
    dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    console.log("[DEBUG] After zoom barSpacing:", dump?.render?.barSpacing);
    console.log("[DEBUG] After zoom visibleRange:", JSON.stringify(dump?.render?.visibleRange));
    
    // Now sample pixels - with larger bars we should see candle colors
    const sampleResults = await page.evaluate(async () => {
      const samples: any[] = [];
      
      // Get LightweightCharts canvases (inside tv-lightweight-charts container)
      const lwContainer = document.querySelector('.tv-lightweight-charts');
      const canvases = lwContainer ? Array.from(lwContainer.querySelectorAll('canvas')) : [];
      console.log("[DEBUG] Found", canvases.length, "LW canvases");
      
      // Find the price canvas (larger one, not time axis)
      let priceCanvas: HTMLCanvasElement | null = null;
      let maxArea = 0;
      for (const canvas of canvases) {
        // Skip small canvases (time axis, price scale)
        if (canvas.width < 200 || canvas.height < 200) continue;
        const area = canvas.width * canvas.height;
        if (area > maxArea) {
          maxArea = area;
          priceCanvas = canvas;
        }
      }
      
      if (!priceCanvas) {
        // Fallback: list all canvas sizes
        return { 
          error: "No suitable canvas found", 
          canvasSizes: canvases.map(c => ({ w: c.width, h: c.height }))
        };
      }
      
      console.log("[DEBUG] Price canvas:", priceCanvas.width, "x", priceCanvas.height);
      
      const ctx = priceCanvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return { error: "No context" };
      
      const positions = [
        { x: 0.3, y: 0.3 },
        { x: 0.5, y: 0.3 },
        { x: 0.7, y: 0.3 },
        { x: 0.5, y: 0.5 },
      ];
      
      for (const pos of positions) {
        const x = Math.floor(pos.x * priceCanvas.width);
        const y = Math.floor(pos.y * priceCanvas.height);
        const data = ctx.getImageData(x, y, 1, 1).data;
        samples.push({
          pos,
          x,
          y,
          rgba: { r: data[0], g: data[1], b: data[2], a: data[3] },
        });
      }
      
      // Scan a horizontal line to find unique colors
      const lineY = Math.floor(priceCanvas.height * 0.4);
      const colors = new Map<string, number>();
      for (let x = 0; x < priceCanvas.width; x += 1) {
        const data = ctx.getImageData(x, lineY, 1, 1).data;
        const key = `${data[0]},${data[1]},${data[2]}`;
        colors.set(key, (colors.get(key) || 0) + 1);
      }
      
      // Convert to sorted list
      const colorList = Array.from(colors.entries())
        .map(([k, count]) => {
          const [r, g, b] = k.split(',').map(Number);
          return { rgb: { r, g, b }, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      return { 
        samples, 
        uniqueColorsInLine: colors.size, 
        topColors: colorList,
        canvasSize: { w: priceCanvas.width, h: priceCanvas.height } 
      };
    });
    
    console.log("[DEBUG] Sample results:", JSON.stringify(sampleResults, null, 2));
    
    // Check for candle colors
    const upColor = { r: 38, g: 166, b: 154 }; // #26a69a
    const downColor = { r: 239, g: 83, b: 80 }; // #ef5350
    
    const hasUpColor = sampleResults?.topColors?.some((c: any) => 
      Math.abs(c.rgb.r - upColor.r) < 10 && 
      Math.abs(c.rgb.g - upColor.g) < 10 && 
      Math.abs(c.rgb.b - upColor.b) < 10
    );
    const hasDownColor = sampleResults?.topColors?.some((c: any) => 
      Math.abs(c.rgb.r - downColor.r) < 10 && 
      Math.abs(c.rgb.g - downColor.g) < 10 && 
      Math.abs(c.rgb.b - downColor.b) < 10
    );
    
    console.log("[DEBUG] hasUpColor:", hasUpColor);
    console.log("[DEBUG] hasDownColor:", hasDownColor);
    
    // Should have at least one candle color (up or down)
    expect(hasUpColor || hasDownColor).toBe(true);
  });
});
