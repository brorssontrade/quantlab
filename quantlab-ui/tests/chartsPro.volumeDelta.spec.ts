/**
 * Volume Delta Indicator Tests
 * 
 * Tests for Volume Delta indicator with TradingView parity:
 * - Appears in Volume category
 * - Renders in separate pane
 * - Has candlestick series + zero line
 * - Default inputs (custom tf OFF, timeframe dropdown)
 * - Style defaults (green/red up/down colors)
 */

import { test, expect } from "@playwright/test";
import { 
  TOPBAR,
  INDICATORS_MODAL, 
  getDump,
  openIndicatorsModal,
  addIndicatorViaModal,
  waitForIndicator
} from "./selectors";
import { gotoChartsPro } from "./helpers";

test.describe("Volume Delta Indicator", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
  });

  test("1. Volume Delta appears in Volume category", async ({ page }) => {
    // Open indicators modal
    await openIndicatorsModal(page);
    
    // Click Volume category
    await page.locator(INDICATORS_MODAL.categoryVolume).click();
    
    // Volume Delta should be visible in the category
    await expect(page.locator(INDICATORS_MODAL.indicatorItem("volumedelta"))).toBeVisible({ timeout: 5000 });
  });

  test("2. Volume Delta can be added and appears in separate pane", async ({ page }) => {
    // Add Volume Delta via modal
    await addIndicatorViaModal(page, "volumedelta");
    
    // Wait for indicator to compute
    await waitForIndicator(page, "volumeDelta");
    
    // Verify in dump
    const dump = await getDump(page);
    expect(dump?.indicators?.length).toBeGreaterThan(0);
    const volDelta = dump?.indicators?.find((i: any) => i.kind === "volumeDelta");
    expect(volDelta).toBeDefined();
    expect(volDelta?.pane).toBe("separate");
  });

  test("3. Volume Delta has candle data and zero line", async ({ page }) => {
    // Add Volume Delta
    await addIndicatorViaModal(page, "volumedelta");
    await waitForIndicator(page, "volumeDelta");
    
    // Verify dump has candle data
    const dump = await getDump(page);
    const volDelta = dump?.indicators?.find((i: any) => i.kind === "volumeDelta");
    
    // Should have _volumeDeltaCandles data
    expect(volDelta?._volumeDeltaCandles).toBeDefined();
    expect(volDelta?._volumeDeltaCandles?.candles?.length).toBeGreaterThan(0);
    
    // Zero line should be present in lines
    const zeroLine = volDelta?.lines?.find((l: any) => l.id === "volumeDeltaZero");
    expect(zeroLine).toBeDefined();
  });

  test("4. Volume Delta default inputs are correct", async ({ page }) => {
    // Add Volume Delta
    await addIndicatorViaModal(page, "volumedelta");
    await waitForIndicator(page, "volumeDelta");
    
    // Verify default params
    const dump = await getDump(page);
    const volDelta = dump?.indicators?.find((i: any) => i.kind === "volumeDelta");
    
    // Default: useCustomTimeframe = false
    expect(volDelta?.params?.useCustomTimeframe).toBe(false);
    // Default: intrabarTimeframe = "auto"
    expect(volDelta?.params?.intrabarTimeframe).toBe("auto");
  });

  test("5. Volume Delta has correct default colors", async ({ page }) => {
    // Add Volume Delta
    await addIndicatorViaModal(page, "volumedelta");
    await waitForIndicator(page, "volumeDelta");
    
    // Verify default colors
    const dump = await getDump(page);
    const volDelta = dump?.indicators?.find((i: any) => i.kind === "volumeDelta");
    const candleConfig = volDelta?._volumeDeltaCandles;
    
    // Up color should be green
    expect(candleConfig?.upColor).toBe("#26A69A");
    // Down color should be red
    expect(candleConfig?.downColor).toBe("#EF5350");
    // Zero line should be gray dashed
    expect(candleConfig?.zeroLineColor).toBe("#787B86");
    expect(candleConfig?.zeroLineStyle).toBe("dashed");
  });

  test("6. Volume Delta candles have correct OHLC structure", async ({ page }) => {
    // Add Volume Delta
    await addIndicatorViaModal(page, "volumedelta");
    await waitForIndicator(page, "volumeDelta");
    
    // Verify candle structure
    const dump = await getDump(page);
    const volDelta = dump?.indicators?.find((i: any) => i.kind === "volumeDelta");
    const candles = volDelta?._volumeDeltaCandles?.candles;
    
    expect(candles?.length).toBeGreaterThan(0);
    
    // Check first non-zero candle structure
    const validCandle = candles?.find((c: any) => c.close !== 0);
    if (validCandle) {
      // Open should always be 0
      expect(validCandle.open).toBe(0);
      // Time should be a valid timestamp
      expect(typeof validCandle.time).toBe("number");
      // Close, High, Low should be numbers
      expect(typeof validCandle.close).toBe("number");
      expect(typeof validCandle.high).toBe("number");
      expect(typeof validCandle.low).toBe("number");
      // No NaN/Infinity
      expect(Number.isFinite(validCandle.close)).toBe(true);
      expect(Number.isFinite(validCandle.high)).toBe(true);
      expect(Number.isFinite(validCandle.low)).toBe(true);
    }
  });

  test("7. Volume Delta uses compact formatter (K/M/B)", async ({ page }) => {
    // Add Volume Delta
    await addIndicatorViaModal(page, "volumedelta");
    await waitForIndicator(page, "volumeDelta");
    
    // Verify compact formatter flag
    const dump = await getDump(page);
    const volDelta = dump?.indicators?.find((i: any) => i.kind === "volumeDelta");
    
    // Should have _compactFormatter = true for K/M/B display
    expect(volDelta?._compactFormatter).toBe(true);
  });
});
