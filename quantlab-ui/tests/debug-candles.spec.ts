/**
 * Debug test for invisible candles regression
 * 
 * This test verifies that price series (candlesticks) are actually rendered
 * by sampling pixel colors from the chart canvas.
 */
import { test, expect } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

test.describe("Debug: Candle Visibility", () => {
  test("price series should render visible candles (not just grid)", async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    
    // Wait for chart to be fully ready with data
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    }, { timeout: 15000 });
    
    // Take a screenshot for visual debugging
    await page.screenshot({ path: "test-results/debug-candles-before.png" });
    
    // Get the chart canvas element
    const chartCanvas = page.locator('.chartspro-price canvas').first();
    await expect(chartCanvas).toBeVisible({ timeout: 5000 });
    
    // Get canvas bounding box
    const box = await chartCanvas.boundingBox();
    expect(box).not.toBeNull();
    
    console.log(`[DEBUG] Canvas size: ${box!.width}x${box!.height}`);
    
    // Sample a pixel in the middle of the chart (where candles should be)
    // Get the image data from ALL canvases to understand rendering
    const pixelSample = await page.evaluate(() => {
      // Find ALL chart canvases
      const canvases = document.querySelectorAll('.chartspro-price canvas');
      if (canvases.length === 0) return { error: "No canvas found" };
      
      const canvasInfo: Array<{
        index: number;
        width: number;
        height: number;
        styles: { position: string; zIndex: string; pointerEvents: string };
        uniqueColors: number;
        sampleColors: string[];
        hasGreen: boolean;
        hasRed: boolean;
      }> = [];
      
      for (let idx = 0; idx < canvases.length; idx++) {
        const canvas = canvases[idx] as HTMLCanvasElement;
        const computedStyle = window.getComputedStyle(canvas);
        
        const ctx = canvas.getContext('2d');
        let uniqueColors = 0;
        let sampleColors: string[] = [];
        let hasGreen = false;
        let hasRed = false;
        
        if (ctx && canvas.width > 100 && canvas.height > 100) {
          const x = Math.floor(canvas.width / 2);
          const y = Math.floor(canvas.height / 2);
          
          try {
            const imageData = ctx.getImageData(x - 10, y - 10, 20, 20);
            const pixels = imageData.data;
            
            const colors = new Set<string>();
            for (let i = 0; i < pixels.length; i += 4) {
              const r = pixels[i];
              const g = pixels[i + 1];
              const b = pixels[i + 2];
              colors.add(`${r},${g},${b}`);
              
              // TradingView green: ~38, 166, 154
              if (g > 140 && g < 180 && b > 130 && b < 170 && r < 60) hasGreen = true;
              // TradingView red: ~239, 83, 80
              if (r > 200 && g < 100 && b < 100) hasRed = true;
            }
            
            uniqueColors = colors.size;
            sampleColors = Array.from(colors).slice(0, 5);
          } catch (e) {
            sampleColors = [`Error: ${e}`];
          }
        }
        
        canvasInfo.push({
          index: idx,
          width: canvas.width,
          height: canvas.height,
          styles: {
            position: computedStyle.position,
            zIndex: computedStyle.zIndex,
            pointerEvents: computedStyle.pointerEvents,
          },
          uniqueColors,
          sampleColors,
          hasGreen,
          hasRed,
        });
      }
      
      // Check if any canvas has candlestick colors
      const anyHasGreen = canvasInfo.some(c => c.hasGreen);
      const anyHasRed = canvasInfo.some(c => c.hasRed);
      const totalUniqueColors = canvasInfo.reduce((sum, c) => sum + c.uniqueColors, 0);
      
      return {
        canvasCount: canvases.length,
        canvases: canvasInfo,
        anyHasGreen,
        anyHasRed,
        totalUniqueColors,
      };
    });
    
    // Backwards-compatible expectations
    const pixelSampleCompat = {
      uniqueColors: (pixelSample as any).totalUniqueColors || 1,
      hasGreen: (pixelSample as any).anyHasGreen || false,
      hasRed: (pixelSample as any).anyHasRed || false,
      firstFewColors: [] as string[],
    };

    // PLACEHOLDER for backwards compatibility
    let hasGreen = pixelSampleCompat.hasGreen;
    let hasRed = pixelSampleCompat.hasRed;
    
    // Log all canvases
    for (const c of (pixelSample as any).canvases || []) {
      console.log(`[DEBUG] Canvas ${c.index}: ${c.width}x${c.height}, uniqueColors=${c.uniqueColors}, hasGreen=${c.hasGreen}, hasRed=${c.hasRed}`);
      console.log(`  styles: position=${c.styles.position}, zIndex=${c.styles.zIndex}`);
      console.log(`  sampleColors: ${c.sampleColors.join(', ')}`);
    }
    
    console.log("[DEBUG] Pixel sample result:", JSON.stringify(pixelSample, null, 2));
    
    // We should have multiple colors (not just background)
    if ('totalUniqueColors' in pixelSample) {
      expect(pixelSample.totalUniqueColors).toBeGreaterThan(1);
      
      // At least one candle color should be present across all canvases
      expect(pixelSample.anyHasGreen || pixelSample.anyHasRed).toBe(true);
    } else if ('error' in pixelSample) {
      throw new Error(`Canvas sampling failed: ${(pixelSample as any).error}`);
    }
    
    // Also check dump for candle series data
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    console.log("[DEBUG] Dump render info:", {
      pricePoints: dump?.render?.pricePoints,
      volumePoints: dump?.render?.volumePoints,
      chartType: dump?.chartType,
      theme: dump?.theme,
    });
    
    // Verify data exists
    expect(dump?.render?.pricePoints).toBeGreaterThan(0);
  });
});
