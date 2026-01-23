/**
 * chartsPro.cp21.spec.ts
 *
 * TV-21: Alternative Chart Types
 * TV-22.0a/c: Renko Settings State + Wiring
 *
 * Tests:
 * - TV-21.1: Heikin Ashi transform logic + integration
 * - TV-21.2: Bars chart type
 * - TV-21.3: Hollow Candles (with style verification)
 * - TV-21.4: Renko brick calculation + integration
 * - TV-22.0a: Renko settings state + persistence
 * - TV-22.0c: Renko settings wiring to transform
 */

import { test, expect } from "@playwright/test";
import { gotoChartsPro } from "./helpers";
import { transformOhlcToHeikinAshi } from "../src/features/chartsPro/runtime/heikinAshi";
import { 
  transformOhlcToRenko, 
  transformOhlcToRenkoWithSettings,
  calculateAtr, 
  suggestBoxSize,
  roundToNice,
} from "../src/features/chartsPro/runtime/renko";

/**
 * Heikin Ashi Transform - Pure Unit Test (Node-side)
 *
 * Uses REAL transformOhlcToHeikinAshi from runtime/heikinAshi.ts
 * If transform changes, this test will fail.
 *
 * Formula:
 * - HA_Close = (O + H + L + C) / 4
 * - HA_Open = (prev_HA_Open + prev_HA_Close) / 2  (first bar: (O + C) / 2)
 * - HA_High = max(H, HA_Open, HA_Close)
 * - HA_Low = min(L, HA_Open, HA_Close)
 */
test.describe("TV-21.1: Heikin Ashi Transform (Unit)", () => {
  // Fixture: 5 OHLC bars with known values
  const FIXTURE_OHLC = [
    { time: 1000, open: 100, high: 110, low: 95, close: 105, volume: 1000 },
    { time: 1001, open: 105, high: 115, low: 100, close: 112, volume: 1200 },
    { time: 1002, open: 112, high: 120, low: 108, close: 118, volume: 1500 },
    { time: 1003, open: 118, high: 125, low: 115, close: 122, volume: 1100 },
    { time: 1004, open: 122, high: 130, low: 118, close: 128, volume: 1300 },
  ];

  // Expected Heikin Ashi values (calculated manually):
  // Bar 0: HA_Close = (100+110+95+105)/4 = 102.5
  //        HA_Open = (100+105)/2 = 102.5 (first bar)
  //        HA_High = max(110, 102.5, 102.5) = 110
  //        HA_Low = min(95, 102.5, 102.5) = 95
  //
  // Bar 1: HA_Close = (105+115+100+112)/4 = 108
  //        HA_Open = (102.5+102.5)/2 = 102.5
  //        HA_High = max(115, 102.5, 108) = 115
  //        HA_Low = min(100, 102.5, 108) = 100
  //
  // Bar 2: HA_Close = (112+120+108+118)/4 = 114.5
  //        HA_Open = (102.5+108)/2 = 105.25
  //        HA_High = max(120, 105.25, 114.5) = 120
  //        HA_Low = min(108, 105.25, 114.5) = 105.25
  //
  // Bar 3: HA_Close = (118+125+115+122)/4 = 120
  //        HA_Open = (105.25+114.5)/2 = 109.875
  //        HA_High = max(125, 109.875, 120) = 125
  //        HA_Low = min(115, 109.875, 120) = 109.875
  //
  // Bar 4: HA_Close = (122+130+118+128)/4 = 124.5
  //        HA_Open = (109.875+120)/2 = 114.9375
  //        HA_High = max(130, 114.9375, 124.5) = 130
  //        HA_Low = min(118, 114.9375, 124.5) = 114.9375

  const EXPECTED_HA = [
    { time: 1000, open: 102.5, high: 110, low: 95, close: 102.5 },
    { time: 1001, open: 102.5, high: 115, low: 100, close: 108 },
    { time: 1002, open: 105.25, high: 120, low: 105.25, close: 114.5 },
    { time: 1003, open: 109.875, high: 125, low: 109.875, close: 120 },
    { time: 1004, open: 114.9375, high: 130, low: 114.9375, close: 124.5 },
  ];

  test("fixture transform produces correct HA values (real util)", async () => {
    // Use REAL transform function from runtime/heikinAshi.ts (Node-side)
    const result = transformOhlcToHeikinAshi(FIXTURE_OHLC);

    // Verify each bar matches expected values
    expect(result.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(result[i].time).toBe(EXPECTED_HA[i].time);
      expect(result[i].open).toBeCloseTo(EXPECTED_HA[i].open, 4);
      expect(result[i].high).toBeCloseTo(EXPECTED_HA[i].high, 4);
      expect(result[i].low).toBeCloseTo(EXPECTED_HA[i].low, 4);
      expect(result[i].close).toBeCloseTo(EXPECTED_HA[i].close, 4);
    }
  });
});

test.describe("TV-21.1: Heikin Ashi Integration", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo, { mock: true });
  });

  test("can switch to Heikin Ashi via ChartTypeSelector", async ({ page }) => {
    // Open chart type dropdown
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await expect(chartTypeBtn).toBeVisible();
    await chartTypeBtn.click();

    // Dropdown should be visible
    const dropdown = page.locator('[data-testid="chart-type-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Click on Heikin Ashi option
    const haOption = page.locator('[data-testid="chart-type-option-heikinAshi"]');
    await expect(haOption).toBeVisible();
    await haOption.click();

    // Dropdown should close
    await expect(dropdown).not.toBeVisible();

    // Verify dump().ui.chartType === "heikinAshi"
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump?.ui?.chartType).toBe("heikinAshi");
  });

  test("Heikin Ashi renders candles (not error state)", async ({ page }) => {
    // Switch to Heikin Ashi
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await chartTypeBtn.click();
    const haOption = page.locator('[data-testid="chart-type-option-heikinAshi"]');
    await haOption.click();

    // State-driven wait: poll dump() until chartType is heikinAshi
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("heikinAshi");

    // Verify chart is still rendering (no error toast, candles visible)
    const errorToast = page.locator('.toast-error');
    await expect(errorToast).not.toBeVisible();

    // The chart root should still exist
    const chartRoot = page.locator('[data-testid="tv-chart-root"]');
    await expect(chartRoot).toBeVisible();

    // Price scale should still be visible (indicates chart rendered)
    const priceScale = page.locator('.tv-lightweight-charts');
    await expect(priceScale).toBeVisible();
  });

  test("switching back to candles restores normal OHLC", async ({ page }) => {
    // Switch to Heikin Ashi
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-heikinAshi"]').click();

    let dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump?.ui?.chartType).toBe("heikinAshi");

    // Switch back to candles
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-candles"]').click();

    dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump?.ui?.chartType).toBe("candles");
  });

  test("default chart type is NOT heikinAshi (tvParity stable)", async ({ page }) => {
    // On load, chartType should be default (candles)
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump?.ui?.chartType).not.toBe("heikinAshi");
    expect(dump?.ui?.chartType).toBe("candles");
  });
});

/**
 * TV-21.2: Bars (OHLC Bars)
 */
test.describe("TV-21.2: Bars Chart Type", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo, { mock: true });
  });

  test("can switch to Bars via ChartTypeSelector", async ({ page }) => {
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await chartTypeBtn.click();
    
    const barsOption = page.locator('[data-testid="chart-type-option-bars"]');
    await expect(barsOption).toBeVisible();
    await barsOption.click();

    // State-driven wait
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("bars");
  });

  test("Bars renders without error", async ({ page }) => {
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-bars"]').click();

    // State-driven wait
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("bars");

    // Chart should still be visible
    await expect(page.locator('[data-testid="tv-chart-root"]')).toBeVisible();
    await expect(page.locator('.tv-lightweight-charts')).toBeVisible();
  });

  test("switching from Bars back to Candles works", async ({ page }) => {
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    
    // Switch to Bars
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-bars"]').click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }).toBe("bars");

    // Switch back to Candles
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-candles"]').click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }).toBe("candles");
  });
});

/**
 * TV-21.3: Hollow Candles
 */
test.describe("TV-21.3: Hollow Candles Chart Type", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo, { mock: true });
  });

  test("can switch to Hollow Candles via ChartTypeSelector", async ({ page }) => {
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await chartTypeBtn.click();
    
    const hollowOption = page.locator('[data-testid="chart-type-option-hollowCandles"]');
    await expect(hollowOption).toBeVisible();
    await hollowOption.click();

    // State-driven wait
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("hollowCandles");
  });

  test("Hollow Candles renders without error", async ({ page }) => {
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-hollowCandles"]').click();

    // State-driven wait
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("hollowCandles");

    // Chart should still be visible
    await expect(page.locator('[data-testid="tv-chart-root"]')).toBeVisible();
    await expect(page.locator('.tv-lightweight-charts')).toBeVisible();
  });

  test("switching from Hollow Candles back to Candles works", async ({ page }) => {
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    
    // Switch to Hollow Candles
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-hollowCandles"]').click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }).toBe("hollowCandles");

    // Switch back to Candles
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-candles"]').click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }).toBe("candles");
  });

  /**
   * TV-21.3b: Style verification
   * Hollow Candles must have upColor === "transparent" (hollow body for up-candles)
   * This verifies the actual lwcharts styling, not just the dropdown state.
   */
  test("Hollow Candles has transparent upColor (style verification)", async ({ page }) => {
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-hollowCandles"]').click();

    // State-driven wait for chartType AND series options to be applied
    // Both must be true: chartType = hollowCandles AND upColor = transparent
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return {
        chartType: dump?.ui?.chartType,
        upColor: dump?.render?.baseSeriesOptions?.upColor,
      };
    }, { timeout: 5000 }).toEqual({
      chartType: "hollowCandles",
      upColor: "transparent",
    });

    // Extra verification: borderUpColor should be the actual visible color
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    const opts = dump?.render?.baseSeriesOptions;
    expect(opts?.borderUpColor).toBeTruthy();
    expect(opts?.borderUpColor).not.toBe("transparent");
  });
});

/**
 * TV-21.4: Renko Brick Calculation (Unit)
 *
 * Uses REAL transformOhlcToRenko from runtime/renko.ts
 *
 * Renko rules:
 * - New up brick when close >= currentLevel + boxSize
 * - New down brick when close <= currentLevel - boxSize
 * - Bricks are drawn at fixed box intervals
 */
test.describe("TV-21.4: Renko Transform (Unit)", () => {
  // Fixture: Price moves in a predictable pattern with boxSize = 5
  // Starting at 100, moving up to 115, then down to 100
  const FIXTURE_OHLC = [
    { time: 1000, open: 100, high: 102, low: 98, close: 100 },   // No brick (start level = 100)
    { time: 1001, open: 100, high: 104, low: 99, close: 103 },   // No brick (< 105)
    { time: 1002, open: 103, high: 108, low: 102, close: 106 },  // Up brick to 105
    { time: 1003, open: 106, high: 112, low: 105, close: 111 },  // Up brick to 110
    { time: 1004, open: 111, high: 117, low: 110, close: 116 },  // Up brick to 115
    { time: 1005, open: 116, high: 118, low: 108, close: 109 },  // Down brick to 110
    { time: 1006, open: 109, high: 110, low: 103, close: 104 },  // Down brick to 105
    { time: 1007, open: 104, high: 106, low: 98, close: 99 },    // Down brick to 100
  ];

  test("fixture transform produces correct Renko bricks (real util)", () => {
    const result = transformOhlcToRenko(FIXTURE_OHLC, { boxSize: 5 });

    // Should produce: 3 up bricks (100→105, 105→110, 110→115)
    // Then 3 down bricks (115→110, 110→105, 105→100)
    expect(result.length).toBe(6);

    // Up bricks
    expect(result[0]).toMatchObject({ open: 100, close: 105, direction: 'up' });
    expect(result[1]).toMatchObject({ open: 105, close: 110, direction: 'up' });
    expect(result[2]).toMatchObject({ open: 110, close: 115, direction: 'up' });

    // Down bricks
    expect(result[3]).toMatchObject({ open: 115, close: 110, direction: 'down' });
    expect(result[4]).toMatchObject({ open: 110, close: 105, direction: 'down' });
    expect(result[5]).toMatchObject({ open: 105, close: 100, direction: 'down' });
  });

  test("empty input returns empty array", () => {
    expect(transformOhlcToRenko([], { boxSize: 5 })).toEqual([]);
  });

  test("throws on invalid boxSize", () => {
    expect(() => transformOhlcToRenko(FIXTURE_OHLC, { boxSize: 0 })).toThrow();
    expect(() => transformOhlcToRenko(FIXTURE_OHLC, { boxSize: -1 })).toThrow();
  });

  test("calculateAtr returns reasonable value", () => {
    const atr = calculateAtr(FIXTURE_OHLC, 5);
    // With our fixture data, ATR should be positive and reasonable
    expect(atr).toBeGreaterThan(0);
    expect(atr).toBeLessThan(20); // Sanity check
  });

  test("suggestBoxSize returns sensible defaults", () => {
    expect(suggestBoxSize(0.5)).toBe(0.01);
    expect(suggestBoxSize(5)).toBe(0.1);
    expect(suggestBoxSize(50)).toBe(1);
    expect(suggestBoxSize(500)).toBe(5);
    expect(suggestBoxSize(5000)).toBe(50);
    expect(suggestBoxSize(50000)).toBe(100);
  });
});

/**
 * TV-21.4: Renko Integration
 */
test.describe("TV-21.4: Renko Integration", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo, { mock: true });
  });

  test("can switch to Renko via ChartTypeSelector", async ({ page }) => {
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await chartTypeBtn.click();

    const renkoOption = page.locator('[data-testid="chart-type-option-renko"]');
    await expect(renkoOption).toBeVisible();
    await renkoOption.click();

    // State-driven wait
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");
  });

  test("Renko renders bricks without error", async ({ page }) => {
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-renko"]').click();

    // State-driven wait
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    // Chart should still be visible
    await expect(page.locator('[data-testid="tv-chart-root"]')).toBeVisible();
    await expect(page.locator('.tv-lightweight-charts')).toBeVisible();

    // Should have data points (bricks)
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump?.render?.pricePoints).toBeGreaterThan(0);
  });

  test("switching from Renko back to Candles works", async ({ page }) => {
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');

    // Switch to Renko
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-renko"]').click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }).toBe("renko");

    // Switch back to Candles
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-candles"]').click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }).toBe("candles");
  });
});

/**
 * TV-22.0a: Renko Settings State + Persistence
 *
 * Tests:
 * - dump().ui.renko exposes current settings
 * - Default settings match expected defaults
 * - Settings persist to localStorage (integration)
 */
test.describe("TV-22.0a: Renko Settings State", () => {
  test("dump().ui.renko exposes default settings", async ({ page }) => {
    // Clear localStorage and navigate
    await page.addInitScript(() => {
      localStorage.removeItem("cp.renko");
    });
    await gotoChartsPro(page, { mock: true });
    await page.waitForSelector('[data-testid="tv-chart-root"]');

    // Wait for chart to be ready
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("candles");

    // Check renko settings are exposed in dump
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump?.ui?.renko).toBeDefined();
    expect(dump.ui.renko).toMatchObject({
      mode: "auto",
      fixedBoxSize: 1,
      atrPeriod: 14,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });
  });

  test("renko settings default behavior unchanged for users who never customize", async ({ page }) => {
    // Clear localStorage and navigate
    await page.addInitScript(() => {
      localStorage.removeItem("cp.renko");
    });
    await gotoChartsPro(page, { mock: true });
    await page.waitForSelector('[data-testid="tv-chart-root"]');

    // Switch to Renko chart type
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-renko"]').click();

    // Wait for Renko chart
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    // Settings should still be defaults (mode: auto)
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump.ui.renko?.mode).toBe("auto");
    
    // Chart should render with auto box size (bricks > 0)
    expect(dump.render?.pricePoints).toBeGreaterThan(0);
  });

  test("localStorage cp.renko persists settings on reload", async ({ page }) => {
    // Pre-seed localStorage with custom settings BEFORE any navigation
    await page.addInitScript(() => {
      localStorage.setItem("cp.renko", JSON.stringify({
        mode: "fixed",
        fixedBoxSize: 2.5,
        atrPeriod: 20,
        autoMinBoxSize: 0.05,
        rounding: "nice",
      }));
    });

    // Navigate to chart
    await gotoChartsPro(page, { mock: true });
    await page.waitForSelector('[data-testid="tv-chart-root"]');

    // Wait for chart to be ready
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("candles");

    // Check persisted settings are loaded
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump.ui.renko).toMatchObject({
      mode: "fixed",
      fixedBoxSize: 2.5,
      atrPeriod: 20,
      autoMinBoxSize: 0.05,
      rounding: "nice",
    });
  });

  test("invalid localStorage falls back to defaults", async ({ page }) => {
    // Set invalid renko settings BEFORE navigation
    await page.addInitScript(() => {
      localStorage.setItem("cp.renko", "not-valid-json{{{");
    });

    // Navigate to chart
    await gotoChartsPro(page, { mock: true });
    await page.waitForSelector('[data-testid="tv-chart-root"]');

    // Wait for chart to be ready
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("candles");

    // Should fall back to defaults
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump.ui.renko?.mode).toBe("auto");
    expect(dump.ui.renko?.fixedBoxSize).toBe(1);
  });
});

/**
 * TV-22.0c: Renko Settings Wiring (Unit Tests)
 *
 * Tests transformOhlcToRenkoWithSettings and roundToNice
 */
test.describe("TV-22.0c: Renko Settings Wiring (Unit)", () => {
  // Same fixture as TV-21.4
  const FIXTURE_OHLC = [
    { time: 1000, open: 100, high: 102, low: 98, close: 100 },
    { time: 1001, open: 100, high: 104, low: 99, close: 103 },
    { time: 1002, open: 103, high: 108, low: 102, close: 106 },
    { time: 1003, open: 106, high: 112, low: 105, close: 111 },
    { time: 1004, open: 111, high: 117, low: 110, close: 116 },
    { time: 1005, open: 116, high: 118, low: 108, close: 109 },
    { time: 1006, open: 109, high: 110, low: 103, close: 104 },
    { time: 1007, open: 104, high: 106, low: 98, close: 99 },
  ];

  test("fixed mode uses fixedBoxSize", () => {
    const result = transformOhlcToRenkoWithSettings(FIXTURE_OHLC, {
      mode: "fixed",
      fixedBoxSize: 5,
      atrPeriod: 14,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });

    expect(result.meta.modeUsed).toBe("fixed");
    expect(result.meta.boxSizeUsed).toBe(5);
    expect(result.meta.bricksCount).toBe(6); // Same as basic transform with boxSize=5
  });

  test("fixed mode with different boxSize changes brick count", () => {
    const resultSmall = transformOhlcToRenkoWithSettings(FIXTURE_OHLC, {
      mode: "fixed",
      fixedBoxSize: 2.5,
      atrPeriod: 14,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });

    const resultLarge = transformOhlcToRenkoWithSettings(FIXTURE_OHLC, {
      mode: "fixed",
      fixedBoxSize: 10,
      atrPeriod: 14,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });

    // Smaller box size = more bricks
    expect(resultSmall.meta.boxSizeUsed).toBe(2.5);
    expect(resultLarge.meta.boxSizeUsed).toBe(10);
    expect(resultSmall.meta.bricksCount).toBeGreaterThan(resultLarge.meta.bricksCount);
  });

  test("auto mode uses ATR-based box size", () => {
    const result = transformOhlcToRenkoWithSettings(FIXTURE_OHLC, {
      mode: "auto",
      fixedBoxSize: 5,
      atrPeriod: 5,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });

    expect(result.meta.modeUsed).toBe("auto");
    expect(result.meta.atrPeriodUsed).toBe(5);
    // Box size should be ATR-based, not the fixedBoxSize
    expect(result.meta.boxSizeUsed).not.toBe(5);
    expect(result.meta.boxSizeUsed).toBeGreaterThan(0);
  });

  test("auto mode clamps to autoMinBoxSize", () => {
    // With a very high min, it should clamp
    const result = transformOhlcToRenkoWithSettings(FIXTURE_OHLC, {
      mode: "auto",
      fixedBoxSize: 1,
      atrPeriod: 14,
      autoMinBoxSize: 100, // Very high min
      rounding: "none",
    });

    expect(result.meta.boxSizeUsed).toBeGreaterThanOrEqual(100);
  });

  test("rounding=nice rounds box size to nice number", () => {
    const resultNone = transformOhlcToRenkoWithSettings(FIXTURE_OHLC, {
      mode: "fixed",
      fixedBoxSize: 3.7,
      atrPeriod: 14,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });

    const resultNice = transformOhlcToRenkoWithSettings(FIXTURE_OHLC, {
      mode: "fixed",
      fixedBoxSize: 3.7,
      atrPeriod: 14,
      autoMinBoxSize: 0.01,
      rounding: "nice",
    });

    expect(resultNone.meta.roundingUsed).toBe("none");
    expect(resultNone.meta.boxSizeUsed).toBe(3.7);

    expect(resultNice.meta.roundingUsed).toBe("nice");
    // 3.7 rounds to nice number (2 or 5)
    expect([1, 2, 5, 10]).toContain(resultNice.meta.boxSizeUsed);
  });

  test("roundToNice produces expected values", () => {
    // Test various inputs - roundToNice rounds to 1, 2, 5, or 10 * magnitude
    // Thresholds: <= 1.5 -> 1, <= 3.5 -> 2, <= 7.5 -> 5, else 10
    expect(roundToNice(0.0123)).toBeCloseTo(0.01, 10); // 1.23 -> 1
    expect(roundToNice(0.025)).toBeCloseTo(0.02, 10);  // 2.5 -> 2
    expect(roundToNice(0.08)).toBeCloseTo(0.1, 10);    // 8 -> 10
    expect(roundToNice(1.5)).toBeCloseTo(1, 10);       // 1.5 at threshold -> 1
    expect(roundToNice(3.5)).toBeCloseTo(2, 10);       // 3.5 at threshold -> 2
    expect(roundToNice(5)).toBeCloseTo(5, 10);         // 5 -> 5
    expect(roundToNice(7.5)).toBeCloseTo(5, 10);       // 7.5 at threshold -> 5
    expect(roundToNice(15)).toBeCloseTo(10, 10);       // 1.5 -> 1 * 10
    expect(roundToNice(25)).toBeCloseTo(20, 10);       // 2.5 -> 2 * 10
    expect(roundToNice(75)).toBeCloseTo(50, 10);       // 7.5 -> 5 * 10
    expect(roundToNice(150)).toBeCloseTo(100, 10);     // 1.5 -> 1 * 100
  });

  test("meta includes first and last brick", () => {
    const result = transformOhlcToRenkoWithSettings(FIXTURE_OHLC, {
      mode: "fixed",
      fixedBoxSize: 5,
      atrPeriod: 14,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });

    expect(result.meta.firstBrick).not.toBeNull();
    expect(result.meta.lastBrick).not.toBeNull();
    expect(result.meta.firstBrick?.direction).toBe("up");
    expect(result.meta.lastBrick?.direction).toBe("down");
  });

  test("empty input returns empty result with null bricks", () => {
    const result = transformOhlcToRenkoWithSettings([], {
      mode: "auto",
      fixedBoxSize: 5,
      atrPeriod: 14,
      autoMinBoxSize: 0.01,
      rounding: "none",
    });

    expect(result.bricks).toEqual([]);
    expect(result.meta.bricksCount).toBe(0);
    expect(result.meta.firstBrick).toBeNull();
    expect(result.meta.lastBrick).toBeNull();
  });
});

/**
 * TV-22.0c: Renko Settings Wiring (Integration Tests)
 *
 * Verifies dump().render.renko reflects actual transform settings
 */
test.describe("TV-22.0c: Renko Settings Wiring (Integration)", () => {
  test("dump().render.renko is null when not in Renko mode", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("cp.renko");
    });
    await gotoChartsPro(page, { mock: true });
    await page.waitForSelector('[data-testid="tv-chart-root"]');

    // Wait for chart to be ready (candles mode)
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("candles");

    // render.renko should be null
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump.render?.renko).toBeNull();
  });

  test("dump().render.renko exposes transform metadata in Renko mode", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("cp.renko");
    });
    await gotoChartsPro(page, { mock: true });
    await page.waitForSelector('[data-testid="tv-chart-root"]');

    // Switch to Renko
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-renko"]').click();

    // Wait for Renko mode
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    // render.renko should have metadata
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump.render?.renko).toBeDefined();
    expect(dump.render.renko).toMatchObject({
      modeUsed: "auto", // Default
      atrPeriodUsed: 14, // Default
      roundingUsed: "none", // Default
    });
    expect(dump.render.renko.boxSizeUsed).toBeGreaterThan(0);
    expect(dump.render.renko.bricksCount).toBeGreaterThan(0);
    expect(dump.render.renko.sample).toBeDefined();
  });

  test("fixed mode settings affect dump().render.renko.boxSizeUsed", async ({ page }) => {
    // Pre-seed with fixed mode settings
    await page.addInitScript(() => {
      localStorage.setItem("cp.renko", JSON.stringify({
        mode: "fixed",
        fixedBoxSize: 2,
        atrPeriod: 14,
        autoMinBoxSize: 0.01,
        rounding: "none",
      }));
    });
    await gotoChartsPro(page, { mock: true });
    await page.waitForSelector('[data-testid="tv-chart-root"]');

    // Switch to Renko
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-renko"]').click();

    // Wait for Renko mode
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    // Should use fixed box size
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump.render?.renko?.modeUsed).toBe("fixed");
    expect(dump.render?.renko?.boxSizeUsed).toBe(2);
  });

  test("rounding=nice affects boxSizeUsed deterministically", async ({ page }) => {
    // Pre-seed with fixed mode + nice rounding
    await page.addInitScript(() => {
      localStorage.setItem("cp.renko", JSON.stringify({
        mode: "fixed",
        fixedBoxSize: 3.7,
        atrPeriod: 14,
        autoMinBoxSize: 0.01,
        rounding: "nice",
      }));
    });
    await gotoChartsPro(page, { mock: true });
    await page.waitForSelector('[data-testid="tv-chart-root"]');

    // Switch to Renko
    const chartTypeBtn = page.locator('[data-testid="chart-type-button"]');
    await chartTypeBtn.click();
    await page.locator('[data-testid="chart-type-option-renko"]').click();

    // Wait for Renko mode
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    // Box size should be rounded to nice (3.7 -> 2 or 5)
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump.render?.renko?.roundingUsed).toBe("nice");
    expect([1, 2, 5, 10]).toContain(dump.render?.renko?.boxSizeUsed);
  });

  test("localStorage settings persist and affect rendering after reload", async ({ page }) => {
    // Pre-seed with specific settings
    await page.addInitScript(() => {
      localStorage.setItem("cp.renko", JSON.stringify({
        mode: "fixed",
        fixedBoxSize: 5,
        atrPeriod: 20,
        autoMinBoxSize: 0.1,
        rounding: "none",
      }));
      localStorage.setItem("cp.chart.type", "renko"); // Also persist chart type
    });
    await gotoChartsPro(page, { mock: true });
    await page.waitForSelector('[data-testid="tv-chart-root"]');

    // Wait for Renko mode (should auto-load from localStorage)
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    // Verify settings were applied to transform
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump.render?.renko).toMatchObject({
      modeUsed: "fixed",
      boxSizeUsed: 5,
      atrPeriodUsed: 20,
      roundingUsed: "none",
    });
    expect(dump.render?.renko?.bricksCount).toBeGreaterThan(0);
  });
});

/**
 * TV-22.0b: Renko Settings Modal UI Tests
 *
 * Tests for the Renko settings modal behavior:
 * - Open/close modal via gear button
 * - Mode switching (auto/fixed)
 * - Save persists to dump().ui.renko
 * - Cancel reverts changes
 * - Esc closes modal
 */
test.describe("TV-22.0b: Renko Settings Modal", () => {
  test("gear button appears when chartType is renko", async ({ page }) => {
    await gotoChartsPro(page);

    // Gear button should not be visible when chart type is not renko
    const gearButton = page.getByTestId("renko-settings-open");
    await expect(gearButton).not.toBeVisible();

    // Switch to renko
    await page.getByTestId("chart-type-button").click();
    await page.getByTestId("chart-type-option-renko").click();

    // Wait for chart type to be renko
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    // Gear button should now be visible
    await expect(gearButton).toBeVisible();
  });

  test("clicking gear button opens renko settings modal", async ({ page }) => {
    await gotoChartsPro(page);

    // Switch to renko
    await page.getByTestId("chart-type-button").click();
    await page.getByTestId("chart-type-option-renko").click();

    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    // Modal should not be visible yet
    await expect(page.getByTestId("renko-settings-modal")).not.toBeVisible();

    // Click gear button
    await page.getByTestId("renko-settings-open").click();

    // Modal should be visible
    await expect(page.getByTestId("renko-settings-modal")).toBeVisible();
  });

  test("modal shows auto/fixed mode buttons", async ({ page }) => {
    await gotoChartsPro(page);

    // Switch to renko and open modal
    await page.getByTestId("chart-type-button").click();
    await page.getByTestId("chart-type-option-renko").click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    await page.getByTestId("renko-settings-open").click();
    await expect(page.getByTestId("renko-settings-modal")).toBeVisible();

    // Mode buttons should be visible
    await expect(page.getByTestId("renko-settings-mode-auto")).toBeVisible();
    await expect(page.getByTestId("renko-settings-mode-fixed")).toBeVisible();

    // Save and cancel buttons should be visible
    await expect(page.getByTestId("renko-settings-save")).toBeVisible();
    await expect(page.getByTestId("renko-settings-cancel")).toBeVisible();
  });

  test("switching to fixed mode shows fixed box size input", async ({ page }) => {
    await gotoChartsPro(page);

    // Switch to renko and open modal
    await page.getByTestId("chart-type-button").click();
    await page.getByTestId("chart-type-option-renko").click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    await page.getByTestId("renko-settings-open").click();
    await expect(page.getByTestId("renko-settings-modal")).toBeVisible();

    // Switch to fixed mode
    await page.getByTestId("renko-settings-mode-fixed").click();

    // Fixed box size input should be visible
    await expect(page.getByTestId("renko-settings-fixed-box-size")).toBeVisible();

    // ATR period input should NOT be visible in fixed mode
    await expect(page.getByTestId("renko-settings-atr-period")).not.toBeVisible();
  });

  test("switching to auto mode shows ATR period input", async ({ page }) => {
    await gotoChartsPro(page);

    // Pre-set to fixed mode via localStorage
    await page.evaluate(() => {
      localStorage.setItem("cp.renko", JSON.stringify({
        mode: "fixed",
        fixedBoxSize: 2,
        atrPeriod: 14,
        autoMinBoxSize: 0.01,
        rounding: "none"
      }));
    });

    await page.reload();
    await gotoChartsPro(page);

    // Switch to renko and open modal
    await page.getByTestId("chart-type-button").click();
    await page.getByTestId("chart-type-option-renko").click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    await page.getByTestId("renko-settings-open").click();
    await expect(page.getByTestId("renko-settings-modal")).toBeVisible();

    // Currently should be in fixed mode
    await expect(page.getByTestId("renko-settings-fixed-box-size")).toBeVisible();

    // Switch to auto mode
    await page.getByTestId("renko-settings-mode-auto").click();

    // ATR period input should be visible
    await expect(page.getByTestId("renko-settings-atr-period")).toBeVisible();
    await expect(page.getByTestId("renko-settings-auto-min-box-size")).toBeVisible();

    // Fixed box size should NOT be visible in auto mode
    await expect(page.getByTestId("renko-settings-fixed-box-size")).not.toBeVisible();
  });

  test("Save updates dump().ui.renko and persists to localStorage", async ({ page }) => {
    await gotoChartsPro(page);

    // Switch to renko
    await page.getByTestId("chart-type-button").click();
    await page.getByTestId("chart-type-option-renko").click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    // Open modal
    await page.getByTestId("renko-settings-open").click();
    await expect(page.getByTestId("renko-settings-modal")).toBeVisible();

    // Switch to fixed mode and set box size
    await page.getByTestId("renko-settings-mode-fixed").click();
    const boxSizeInput = page.getByTestId("renko-settings-fixed-box-size");
    await boxSizeInput.fill("3.5");

    // Switch to nice rounding
    await page.getByTestId("renko-settings-rounding-nice").click();

    // Save
    await page.getByTestId("renko-settings-save").click();

    // Modal should close
    await expect(page.getByTestId("renko-settings-modal")).not.toBeVisible();

    // Verify dump().ui.renko is updated
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.renko;
    }, { timeout: 5000 }).toMatchObject({
      mode: "fixed",
      fixedBoxSize: 3.5,
      rounding: "nice"
    });

    // Verify localStorage is updated
    const stored = await page.evaluate(() => {
      const data = localStorage.getItem("cp.renko");
      return data ? JSON.parse(data) : null;
    });
    expect(stored).toMatchObject({
      mode: "fixed",
      fixedBoxSize: 3.5,
      rounding: "nice"
    });
  });

  test("Cancel reverts changes and does not persist", async ({ page }) => {
    await gotoChartsPro(page);

    // Switch to renko
    await page.getByTestId("chart-type-button").click();
    await page.getByTestId("chart-type-option-renko").click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    // Get initial settings
    const initialSettings = await page.evaluate(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.ui?.renko;
    });

    // Open modal
    await page.getByTestId("renko-settings-open").click();
    await expect(page.getByTestId("renko-settings-modal")).toBeVisible();

    // Make some changes
    await page.getByTestId("renko-settings-mode-fixed").click();
    await page.getByTestId("renko-settings-fixed-box-size").fill("999");
    await page.getByTestId("renko-settings-rounding-nice").click();

    // Cancel
    await page.getByTestId("renko-settings-cancel").click();

    // Modal should close
    await expect(page.getByTestId("renko-settings-modal")).not.toBeVisible();

    // Settings should be unchanged
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.renko;
    }, { timeout: 5000 }).toMatchObject(initialSettings);
  });

  test("Esc key closes modal without saving", async ({ page }) => {
    await gotoChartsPro(page);

    // Switch to renko
    await page.getByTestId("chart-type-button").click();
    await page.getByTestId("chart-type-option-renko").click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    // Get initial settings
    const initialSettings = await page.evaluate(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.ui?.renko;
    });

    // Open modal
    await page.getByTestId("renko-settings-open").click();
    await expect(page.getByTestId("renko-settings-modal")).toBeVisible();

    // Make some changes
    await page.getByTestId("renko-settings-mode-fixed").click();

    // Press Esc
    await page.keyboard.press("Escape");

    // Modal should close
    await expect(page.getByTestId("renko-settings-modal")).not.toBeVisible();

    // Settings should be unchanged
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.renko;
    }, { timeout: 5000 }).toMatchObject(initialSettings);
  });

  test("saved settings affect dump().render.renko when in renko mode", async ({ page }) => {
    await gotoChartsPro(page);

    // Switch to renko
    await page.getByTestId("chart-type-button").click();
    await page.getByTestId("chart-type-option-renko").click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    // Wait for initial render to complete
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.render?.renko?.bricksCount;
    }, { timeout: 5000 }).toBeGreaterThan(0);

    // Open modal and change to fixed mode with specific box size
    await page.getByTestId("renko-settings-open").click();
    await expect(page.getByTestId("renko-settings-modal")).toBeVisible();
    await page.getByTestId("renko-settings-mode-fixed").click();
    await page.getByTestId("renko-settings-fixed-box-size").fill("2.5");
    await page.getByTestId("renko-settings-save").click();

    // Wait for modal to close
    await expect(page.getByTestId("renko-settings-modal")).not.toBeVisible();

    // Verify dump().ui.renko was updated first (this triggers re-render)
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.renko?.mode;
    }, { timeout: 5000 }).toBe("fixed");

    // Verify render reflects the new settings
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.render?.renko?.modeUsed;
    }, { timeout: 5000 }).toBe("fixed");

    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.render?.renko?.boxSizeUsed;
    }, { timeout: 5000 }).toBe(2.5);
  });

  // TV-22.0b1: autoMinBoxSize=0 persistence test
  test("autoMinBoxSize=0 can be saved, persisted, and survives reload", async ({ page }) => {
    await gotoChartsPro(page);

    // Clear localStorage first
    await page.evaluate(() => window.localStorage.removeItem("cp.renko"));

    // Switch to renko and open settings modal
    await page.getByTestId("chart-type-button").click();
    await page.getByTestId("chart-type-option-renko").click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    await page.getByTestId("renko-settings-open").click();
    await expect(page.getByTestId("renko-settings-modal")).toBeVisible();

    // Switch to auto mode (where autoMinBoxSize is relevant)
    await page.getByTestId("renko-settings-mode-auto").click();

    // Set autoMinBoxSize to 0
    const autoMinInput = page.getByTestId("renko-settings-auto-min-box-size");
    await autoMinInput.fill("0");

    // Save
    await page.getByTestId("renko-settings-save").click();
    await expect(page.getByTestId("renko-settings-modal")).not.toBeVisible();

    // Verify dump().ui.renko.autoMinBoxSize is 0
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.renko?.autoMinBoxSize;
    }, { timeout: 5000 }).toBe(0);

    // Verify localStorage has autoMinBoxSize=0
    const storedBefore = await page.evaluate(() => {
      const stored = window.localStorage.getItem("cp.renko");
      return stored ? JSON.parse(stored) : null;
    });
    expect(storedBefore?.autoMinBoxSize).toBe(0);

    // Reload the page
    await page.reload();
    await gotoChartsPro(page);

    // Verify dump().ui.renko.autoMinBoxSize is still 0 after reload
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.renko?.autoMinBoxSize;
    }, { timeout: 5000 }).toBe(0);

    // Open modal again and verify input shows 0
    await page.getByTestId("chart-type-button").click();
    await page.getByTestId("chart-type-option-renko").click();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.ui?.chartType;
    }, { timeout: 5000 }).toBe("renko");

    await page.getByTestId("renko-settings-open").click();
    await expect(page.getByTestId("renko-settings-modal")).toBeVisible();

    // Verify the input field shows 0
    const inputValue = await page.getByTestId("renko-settings-auto-min-box-size").inputValue();
    expect(inputValue).toBe("0");
  });
});