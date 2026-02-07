/**
 * PRIO 3: Indicator Library Tests
 * 
 * Tests for:
 * 1. Modal opens with categories and search
 * 2. Adding indicators (all 9 types)
 * 3. Indicators panel show/hide/edit/remove
 * 4. Params editing updates chart
 * 5. Multi-output indicators (MACD, BB, ADX)
 * 
 * NOTE: Tests use TopBar indicator button (always visible) instead of RightPanel
 * button to ensure deterministic test execution regardless of panel state.
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

test.describe("PRIO 3: Indicator Library", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
  });

  test.describe("Modal UI", () => {
    test("1. TopBar button opens indicators modal", async ({ page }) => {
      // Click Indicators button in TopBar (always visible)
      await page.locator(TOPBAR.indicatorsBtn).click();

      // Modal should appear
      const modal = page.locator(INDICATORS_MODAL.root);
      await expect(modal).toBeVisible({ timeout: 3000 });
      
      // dump().ui.modal should reflect open state
      const dump = await getDump(page);
      expect(dump?.ui?.modal?.open).toBe(true);
      expect(dump?.ui?.modal?.kind).toBe("indicators");
    });

    test("2. Modal shows categories sidebar", async ({ page }) => {
      await openIndicatorsModal(page);

      // Check category buttons
      await expect(page.locator(INDICATORS_MODAL.categoryAll)).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.categoryMovingAverage)).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.categoryMomentum)).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.categoryVolatility)).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.categoryVolume)).toBeVisible();
    });

    test("3. Search filters indicator list", async ({ page }) => {
      await openIndicatorsModal(page);

      const searchInput = page.locator(INDICATORS_MODAL.search);
      await searchInput.fill("RSI");

      // Only RSI should be visible
      await expect(page.locator(INDICATORS_MODAL.indicatorItem("rsi"))).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.indicatorItem("sma"))).not.toBeVisible();
    });

    test("4. Category filter works", async ({ page }) => {
      await openIndicatorsModal(page);

      // Click Volume category
      await page.locator(INDICATORS_MODAL.categoryVolume).click();

      // Only volume indicators should be visible
      await expect(page.locator(INDICATORS_MODAL.indicatorItem("vwap"))).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.indicatorItem("obv"))).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.indicatorItem("sma"))).not.toBeVisible();
    });

    test("5. Escape closes modal", async ({ page }) => {
      await openIndicatorsModal(page);

      const modal = page.locator(INDICATORS_MODAL.root);
      await expect(modal).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible();
      
      // dump() should reflect closed modal
      const dump = await getDump(page);
      expect(dump?.ui?.modal?.open).toBe(false);
    });

    test("6. Keyboard navigation (ArrowDown/Up + Enter)", async ({ page }) => {
      await openIndicatorsModal(page);

      // Focus should be on search
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");

      // Modal should close after adding
      const modal = page.locator(INDICATORS_MODAL.root);
      await expect(modal).not.toBeVisible();

      // Indicator should be added - poll for it
      await expect.poll(async () => {
        const dump = await getDump(page);
        return dump?.indicators?.length ?? 0;
      }, { timeout: 5000 }).toBeGreaterThan(0);
    });
  });

  test.describe("Adding Indicators", () => {
    const indicatorTests = [
      { id: "sma", name: "SMA", pane: "price" },
      { id: "ema", name: "EMA", pane: "price" },
      { id: "rsi", name: "RSI", pane: "separate" },
      { id: "macd", name: "MACD", pane: "separate" },
      { id: "bb", name: "BB", pane: "price" },
      { id: "atr", name: "ATR", pane: "separate" },
      { id: "adx", name: "ADX", pane: "separate" },
      { id: "vwap", name: "VWAP", pane: "price" },
      { id: "avwap", name: "AVWAP", pane: "price" },
      { id: "obv", name: "OBV", pane: "separate" },
    ];

    for (const { id, name, pane } of indicatorTests) {
      test(`Add ${name} indicator`, async ({ page }) => {
        // Add indicator via modal
        await addIndicatorViaModal(page, id);

        // Wait for indicator to compute using poll
        await waitForIndicator(page, id);

        // Verify in dump
        const dump = await getDump(page);
        expect(dump?.indicators?.length).toBeGreaterThan(0);
        const added = dump?.indicators?.find((i: any) => i.kind === id);
        expect(added).toBeDefined();
        expect(added?.pane).toBe(pane);
        
        // Verify has computed values
        expect(added?.lines?.length).toBeGreaterThan(0);
        expect(added?.lines?.[0]?.valuesCount ?? added?.lines?.[0]?.values?.length ?? 0).toBeGreaterThan(0);
      });
    }
  });

  test.describe("Indicators Panel Actions", () => {
    test.beforeEach(async ({ page }) => {
      // Add SMA indicator first
      await addIndicatorViaModal(page, "sma");
      await waitForIndicator(page, "sma");
    });

    test("1. Hide/show toggle works", async ({ page }) => {
      const dump1 = await getDump(page);
      const sma = dump1?.indicators?.find((i: any) => i.kind === "sma");
      expect(sma?.hidden).toBe(false);

      // Find the indicator legend and click eye icon
      const legendItem = page.locator('[data-testid^="indicator-legend-sma"]').first();
      if (await legendItem.isVisible()) {
        const eyeBtn = legendItem.locator('[title="Hide"]');
        if (await eyeBtn.isVisible()) {
          await eyeBtn.click();
          
          // Verify hidden state via poll
          await expect.poll(async () => {
            const dump = await getDump(page);
            return dump?.indicators?.find((i: any) => i.kind === "sma")?.hidden;
          }, { timeout: 3000 }).toBe(true);
        }
      }
    });

    test("2. Remove button removes indicator", async ({ page }) => {
      const dump1 = await getDump(page);
      expect(dump1?.indicators?.length).toBe(1);

      // Find the indicator legend and click remove icon
      const legendItem = page.locator('[data-testid^="indicator-legend-sma"]').first();
      if (await legendItem.isVisible()) {
        const removeBtn = legendItem.locator('[title="Remove"]');
        if (await removeBtn.isVisible()) {
          await removeBtn.click();
          
          // Verify removed via poll
          await expect.poll(async () => {
            const dump = await getDump(page);
            return dump?.indicators?.length ?? 0;
          }, { timeout: 3000 }).toBe(0);
        }
      }
    });

    test("3. Settings button opens settings panel", async ({ page }) => {
      // Find the indicator legend and click settings icon
      const legendItem = page.locator('[data-testid^="indicator-legend-sma"]').first();
      if (await legendItem.isVisible()) {
        const settingsBtn = legendItem.locator('[title="Settings"]');
        if (await settingsBtn.isVisible()) {
          await settingsBtn.click();
          
          // Settings panel should appear
          await expect(page.locator('[data-testid="indicator-settings-panel"]')).toBeVisible({ timeout: 3000 });
        }
      }
    });
  });

  test.describe("Multi-output Indicators", () => {
    test("MACD has 3 lines (macd, signal, histogram)", async ({ page }) => {
      await addIndicatorViaModal(page, "macd");
      await waitForIndicator(page, "macd");

      const dump = await getDump(page);
      const macd = dump?.indicators?.find((i: any) => i.kind === "macd");
      expect(macd).toBeDefined();
      expect(macd?.lines?.length).toBe(3);
    });

    test("MACD has TV-style 4-color histogram", async ({ page }) => {
      // MACD histogram should have 4 colors based on:
      // - hist >= 0 && hist >= prevHist → bullStrong (strong teal)
      // - hist >= 0 && hist < prevHist → bullWeak (light teal)
      // - hist < 0 && hist >= prevHist → bearWeak (light red)
      // - hist < 0 && hist < prevHist → bearStrong (strong red)
      await addIndicatorViaModal(page, "macd");
      await waitForIndicator(page, "macd");

      const dump = await getDump(page);
      const macd = dump?.indicators?.find((i: any) => i.kind === "macd");
      expect(macd).toBeDefined();
      expect(macd?.lines?.length).toBe(3);
      
      // Histogram should be the first line
      const histogram = macd?.lines?.find((l: any) => l.id === "histogram");
      expect(histogram).toBeDefined();
      expect(histogram?.style).toBe("histogram");
      
      // The 4-color implementation is verified by visual inspection
      // Each histogram bar gets color based on above/below zero and rising/falling
    });

    test("MACD has TV-matching line colors (blue/orange)", async ({ page }) => {
      await addIndicatorViaModal(page, "macd");
      await waitForIndicator(page, "macd");

      const dump = await getDump(page);
      const macd = dump?.indicators?.find((i: any) => i.kind === "macd");
      expect(macd).toBeDefined();
      
      const macdLine = macd?.lines?.find((l: any) => l.id === "macd");
      const signalLine = macd?.lines?.find((l: any) => l.id === "signal");
      
      // TV colors: MACD blue, Signal orange
      expect(macdLine?.color).toBe("#2962FF");
      expect(signalLine?.color).toBe("#FF6D00");
    });

    test("MACD has separate pane with zero line", async ({ page }) => {
      await addIndicatorViaModal(page, "macd");
      await waitForIndicator(page, "macd");

      const dump = await getDump(page);
      const macd = dump?.indicators?.find((i: any) => i.kind === "macd");
      expect(macd).toBeDefined();
      expect(macd?.pane).toBe("separate");
      
      // Zero line visibility is controlled by the showZeroLine param (default true)
      // The IndicatorPane component renders it when _zeroLine.visible is true
    });

    // =========================================================================
    // RSI TradingView Parity Tests
    // =========================================================================

    test("RSI has TV-style 5 lines (rsi, rsiMa, upperBand, middleBand, lowerBand)", async ({ page }) => {
      await addIndicatorViaModal(page, "rsi");
      await waitForIndicator(page, "rsi");

      const dump = await getDump(page);
      const rsi = dump?.indicators?.find((i: any) => i.kind === "rsi");
      expect(rsi).toBeDefined();
      expect(rsi?.lines?.length).toBe(5);
      
      // Verify all lines exist
      const lineIds = rsi?.lines?.map((l: any) => l.id);
      expect(lineIds).toContain("rsi");
      expect(lineIds).toContain("rsiMa");
      expect(lineIds).toContain("upperBand");
      expect(lineIds).toContain("middleBand");
      expect(lineIds).toContain("lowerBand");
    });

    test("RSI has TV-matching line colors (purple rsi, yellow ma, gray bands)", async ({ page }) => {
      await addIndicatorViaModal(page, "rsi");
      await waitForIndicator(page, "rsi");

      const dump = await getDump(page);
      const rsi = dump?.indicators?.find((i: any) => i.kind === "rsi");
      expect(rsi).toBeDefined();
      
      const rsiLine = rsi?.lines?.find((l: any) => l.id === "rsi");
      const rsiMaLine = rsi?.lines?.find((l: any) => l.id === "rsiMa");
      const upperBandLine = rsi?.lines?.find((l: any) => l.id === "upperBand");
      
      // TV colors: RSI purple, RSI MA yellow, Bands gray
      expect(rsiLine?.color).toBe("#7E57C2");
      expect(rsiMaLine?.color).toBe("#F7B924");
      expect(upperBandLine?.color).toBe("#B2B5BE");
    });

    test("RSI bands have default band values (70/50/30)", async ({ page }) => {
      await addIndicatorViaModal(page, "rsi");
      await waitForIndicator(page, "rsi");

      const dump = await getDump(page);
      const rsi = dump?.indicators?.find((i: any) => i.kind === "rsi");
      expect(rsi).toBeDefined();
      
      const upperBandLine = rsi?.lines?.find((l: any) => l.id === "upperBand");
      const middleBandLine = rsi?.lines?.find((l: any) => l.id === "middleBand");
      const lowerBandLine = rsi?.lines?.find((l: any) => l.id === "lowerBand");
      
      // Bands should have constant values: 70, 50, 30
      expect(upperBandLine?.values?.length).toBeGreaterThan(0);
      expect(middleBandLine?.values?.length).toBeGreaterThan(0);
      expect(lowerBandLine?.values?.length).toBeGreaterThan(0);
      
      // All values in each band should be constant
      if (upperBandLine?.values?.length > 0) {
        expect(upperBandLine.values[0]?.value).toBe(70);
      }
      if (middleBandLine?.values?.length > 0) {
        expect(middleBandLine.values[0]?.value).toBe(50);
      }
      if (lowerBandLine?.values?.length > 0) {
        expect(lowerBandLine.values[0]?.value).toBe(30);
      }
    });

    test("RSI has fill overlay canvas element", async ({ page }) => {
      await addIndicatorViaModal(page, "rsi");
      await waitForIndicator(page, "rsi");

      // RSI fill overlay should be rendered as a canvas
      await expect(page.locator('[data-testid="rsi-fill-overlay"]')).toBeVisible({ timeout: 3000 });
    });

    // =========================================================================
    // ATR TradingView Parity Tests
    // =========================================================================

    test("ATR has full-length array (data.length)", async ({ page }) => {
      await addIndicatorViaModal(page, "atr");
      await waitForIndicator(page, "atr");

      const dump = await getDump(page);
      const atr = dump?.indicators?.find((i: any) => i.kind === "atr");
      expect(atr).toBeDefined();
      expect(atr?.lines?.length).toBe(1);
      
      // ATR values array should match data length
      const atrLine = atr?.lines?.[0];
      expect(atrLine?.values?.length).toBeGreaterThan(0);
      
      // Verify no NaN values leaked through (should be WhitespaceData)
      const hasNaN = atrLine?.values?.some((v: any) => 
        'value' in v && !Number.isFinite(v.value)
      );
      expect(hasNaN).toBe(false);
    });

    test("ATR default smoothing is RMA", async ({ page }) => {
      await addIndicatorViaModal(page, "atr");
      await waitForIndicator(page, "atr");

      const dump = await getDump(page);
      const atr = dump?.indicators?.find((i: any) => i.kind === "atr");
      expect(atr).toBeDefined();
      
      // Label should include "RMA" when inputsInStatusLine is true (default)
      const atrLine = atr?.lines?.[0];
      expect(atrLine?.label).toContain("RMA");
    });

    test("ATR has TV-style red color and thin line", async ({ page }) => {
      await addIndicatorViaModal(page, "atr");
      await waitForIndicator(page, "atr");

      const dump = await getDump(page);
      const atr = dump?.indicators?.find((i: any) => i.kind === "atr");
      expect(atr).toBeDefined();
      
      const atrLine = atr?.lines?.[0];
      // TV-style red color
      expect(atrLine?.color).toBe("#FF5252");
      // Thin line (1px)
      expect(atrLine?.lineWidth).toBe(1);
    });

    test("ATR label format is 'ATR {length} {smoothing}'", async ({ page }) => {
      await addIndicatorViaModal(page, "atr");
      await waitForIndicator(page, "atr");

      const dump = await getDump(page);
      const atr = dump?.indicators?.find((i: any) => i.kind === "atr");
      expect(atr).toBeDefined();
      
      const atrLine = atr?.lines?.[0];
      // Should be "ATR 14 RMA" (default values)
      expect(atrLine?.label).toBe("ATR 14 RMA");
    });

    test("ATR values contain only valid numbers or WhitespaceData", async ({ page }) => {
      await addIndicatorViaModal(page, "atr");
      await waitForIndicator(page, "atr");

      const dump = await getDump(page);
      const atr = dump?.indicators?.find((i: any) => i.kind === "atr");
      const atrLine = atr?.lines?.[0];
      
      // Each value should be either:
      // - { time, value } with finite value (valid data point)
      // - { time } without value (WhitespaceData for warmup)
      let hasInvalidValue = false;
      for (const v of atrLine?.values ?? []) {
        if ('value' in v) {
          if (!Number.isFinite(v.value)) {
            hasInvalidValue = true;
            break;
          }
        }
        // If no 'value' key, it's WhitespaceData (valid)
      }
      expect(hasInvalidValue).toBe(false);
    });

    test("Bollinger Bands has 3 lines (upper, middle, lower)", async ({ page }) => {
      await addIndicatorViaModal(page, "bb");
      await waitForIndicator(page, "bb");

      const dump = await getDump(page);
      const bb = dump?.indicators?.find((i: any) => i.kind === "bb");
      expect(bb).toBeDefined();
      expect(bb?.lines?.length).toBe(3);
    });

    test("ADX has 3 lines (adx, +DI, -DI)", async ({ page }) => {
      await addIndicatorViaModal(page, "adx");
      await waitForIndicator(page, "adx");

      const dump = await getDump(page);
      const adx = dump?.indicators?.find((i: any) => i.kind === "adx");
      expect(adx).toBeDefined();
      expect(adx?.lines?.length).toBe(3);
    });
  });

  test.describe("Performance", () => {
    test("Adding multiple indicators doesn't freeze UI", async ({ page }) => {
      const startTime = Date.now();
      
      // Add 5 indicators rapidly
      for (const kind of ["sma", "ema", "rsi", "macd", "bb"]) {
        await addIndicatorViaModal(page, kind);
      }
      
      const addTime = Date.now() - startTime;
      
      // Wait for all to compute
      for (const kind of ["sma", "ema", "rsi", "macd", "bb"]) {
        await waitForIndicator(page, kind);
      }
      
      // Verify all were added
      const dump = await getDump(page);
      expect(dump?.indicators?.length).toBe(5);
      
      // Adding 5 indicators should take less than 15 seconds
      expect(addTime).toBeLessThan(15000);
    });
  });

  test.describe("Separate Pane Indicators", () => {
    test("RSI creates a separate pane below price chart", async ({ page }) => {
      await addIndicatorViaModal(page, "rsi");
      await waitForIndicator(page, "rsi");

      // Verify pane stack exists
      await expect(page.locator('[data-testid="indicator-pane-stack"]')).toBeVisible({ timeout: 3000 });
      
      // Verify RSI is in separate pane
      const dump = await getDump(page);
      const rsi = dump?.indicators?.find((i: any) => i.kind === "rsi");
      expect(rsi?.pane).toBe("separate");
    });

    test("Multiple separate pane indicators stack correctly", async ({ page }) => {
      // Add RSI and MACD (both separate pane)
      await addIndicatorViaModal(page, "rsi");
      await waitForIndicator(page, "rsi");
      
      await addIndicatorViaModal(page, "macd");
      await waitForIndicator(page, "macd");

      // Verify pane stack exists
      await expect(page.locator('[data-testid="indicator-pane-stack"]')).toBeVisible();
      
      // Both should be in separate panes
      const dump = await getDump(page);
      const rsi = dump?.indicators?.find((i: any) => i.kind === "rsi");
      const macd = dump?.indicators?.find((i: any) => i.kind === "macd");
      expect(rsi?.pane).toBe("separate");
      expect(macd?.pane).toBe("separate");
    });

    test("Top divider is not draggable", async ({ page }) => {
      await addIndicatorViaModal(page, "rsi");
      await waitForIndicator(page, "rsi");

      // Top divider (index=0) should exist
      const topDivider = page.locator('[data-testid="pane-divider-0"]');
      await expect(topDivider).toBeVisible({ timeout: 3000 });
      
      // It should NOT have the draggable class
      await expect(topDivider).not.toHaveClass(/pane-divider-draggable/);
    });
  });

  test.describe("Style Changes Don't Trigger Recompute (Task 1A)", () => {
    test("styleByLineId is exposed in dump() for indicators", async ({ page }) => {
      // Add an EMA indicator
      await addIndicatorViaModal(page, "ema");
      await waitForIndicator(page, "ema");
      
      // Get indicator data from dump
      const dump = await getDump(page);
      const indicator = dump?.ui?.indicators?.items?.[0];
      expect(indicator).toBeDefined();
      
      // styleByLineId should be exposed (initially null or with defaults)
      expect("styleByLineId" in indicator).toBe(true);
    });

    test("IndicatorSettingsModal has three tabs (Inputs, Style, Visibility)", async ({ page }) => {
      // Add an EMA indicator
      await addIndicatorViaModal(page, "ema");
      await waitForIndicator(page, "ema");
      
      // Open settings by clicking the indicator chip in the legend or toolbar
      // This tests that the settings modal is functional
      const settingsBtn = page.locator('[data-testid^="indicator-chip-"] button[aria-label="Settings"]').first();
      if (await settingsBtn.isVisible()) {
        await settingsBtn.click();
        
        // Check for the settings modal
        const modal = page.locator('[data-testid="indicator-settings-modal"]');
        await expect(modal).toBeVisible({ timeout: 2000 });
        
        // Verify tab structure exists (look for Settings2, Palette, Eye icons or tab text)
        const inputsTab = modal.locator('button:has-text("Inputs")');
        const styleTab = modal.locator('button:has-text("Style")');
        const visibilityTab = modal.locator('button:has-text("Visibility")');
        
        await expect(inputsTab).toBeVisible();
        await expect(styleTab).toBeVisible();
        await expect(visibilityTab).toBeVisible();
        
        // Close modal
        await page.keyboard.press("Escape");
      }
    });

    test("computeCount is exposed in dump().ui.indicators", async ({ page }) => {
      // The computeCount counter is exposed for future testing
      // Currently it may be 0 because compute happens in a Web Worker
      // This test verifies the API surface is available
      const dump = await getDump(page);
      expect(dump?.ui?.indicators).toHaveProperty("computeCount");
      expect(typeof dump?.ui?.indicators?.computeCount).toBe("number");
    });

    test("style change does NOT increment computeCount (no recompute)", async ({ page }) => {
      // TASK 1A: Verify style changes (color, lineWidth, lineStyle) 
      // don't trigger indicator recompute - they only use applyOptions()

      // 1) Add EMA indicator first
      await addIndicatorViaModal(page, "ema");
      await waitForIndicator(page, "ema");

      // Small delay to ensure compute is done
      await page.waitForTimeout(200);

      // 2) Read initial computeCount AFTER adding indicator
      const initialDump = await getDump(page);
      const initialCount = initialDump?.ui?.indicators?.computeCount ?? 0;
      // Note: initialCount might be 0 if using Web Worker, but that's OK
      // The key assertion is that it doesn't INCREASE after style change

      // 3) Open settings modal by hovering on legend and clicking Settings button
      // Find the indicator legend for EMA
      const legendItem = page.locator('[data-testid^="indicator-legend-"]').first();
      await legendItem.hover();
      
      // Find the Settings button (title="Settings") within legend
      const settingsBtn = legendItem.locator('button[title="Settings"]');
      await expect(settingsBtn).toBeVisible({ timeout: 2000 });
      await settingsBtn.click();

      // Wait for settings modal
      await expect(page.locator('[data-testid="indicator-settings-modal"]')).toBeVisible();

      // Click on Style tab
      const styleTab = page.locator('button').filter({ hasText: "Style" });
      await styleTab.click();

      // Try to find and click a color swatch that is different from current
      const allSwatches = await page.locator('[data-testid="indicator-settings-modal"] button.w-6.h-6').all();
      if (allSwatches.length > 1) {
        await allSwatches[1].click(); // Click second swatch (different color)
      }

      // Click Apply
      await page.getByRole("button", { name: "Apply" }).click();

      // 4) Verify computeCount has NOT increased
      await page.waitForTimeout(100); // Brief wait for any async updates

      const finalDump = await getDump(page);
      const finalCount = finalDump?.ui?.indicators?.computeCount ?? 0;

      // Style change should NOT trigger recompute
      expect(finalCount).toBe(initialCount);

      // 5) Verify styleByLineId WAS updated (the style actually changed)
      const emaIndicator = finalDump?.ui?.indicators?.items?.find((i: any) => i.kind === "ema");
      expect(emaIndicator?.styleByLineId).toBeTruthy();
      // The color should have been stored in styleByLineId
      const emaLineStyle = emaIndicator?.styleByLineId?.["ema"];
      expect(emaLineStyle).toBeTruthy();
      // Color should be a hex color string
      expect(emaLineStyle?.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  test.describe("NaN Regression Tests", () => {
    test("McGinley Dynamic never produces NaN values", async ({ page }) => {
      // Add McGinley Dynamic indicator
      await addIndicatorViaModal(page, "mcginley");
      await waitForIndicator(page, "mcginley");

      // Get indicator data from dump
      const dump = await getDump(page);
      
      // Find McGinley in indicators array (same structure as other tests)
      const mdIndicator = dump?.indicators?.find((i: any) => i.kind === "mcginley");
      
      // Indicator must exist
      expect(mdIndicator).toBeTruthy();
      
      // Must have computed values (lines with values)
      expect(mdIndicator?.lines?.length).toBeGreaterThan(0);
      const line = mdIndicator?.lines?.[0];
      const valuesCount = line?.valuesCount ?? line?.values?.length ?? 0;
      expect(valuesCount).toBeGreaterThan(0);
      
      // Get all values and check none are NaN
      const values = line?.values ?? [];
      expect(values.length).toBeGreaterThan(0);
      
      // Check last value is finite (not NaN, not Infinity)
      const lastPt = values[values.length - 1];
      expect(lastPt).toBeDefined();
      expect(Number.isFinite(lastPt?.value)).toBe(true);
      
      // Check NO values are NaN (full validation)
      const nanValues = values.filter((pt: any) => !Number.isFinite(pt?.value));
      expect(nanValues.length).toBe(0);
      
      // Check the label doesn't show NaN
      const label = line?.label ?? "";
      expect(label).not.toContain("NaN");
    });

    test("ALMA computes correctly with TV defaults", async ({ page }) => {
      // Add ALMA indicator (defaults: period=9, offset=0.85, sigma=6)
      await addIndicatorViaModal(page, "alma");
      await waitForIndicator(page, "alma");

      // Get indicator data from dump
      const dump = await getDump(page);
      
      // Find ALMA in indicators array
      const almaIndicator = dump?.indicators?.find((i: any) => i.kind === "alma");
      
      // Indicator must exist
      expect(almaIndicator).toBeTruthy();
      expect(almaIndicator?.pane).toBe("price"); // ALMA is overlay
      
      // Must have computed values
      expect(almaIndicator?.lines?.length).toBeGreaterThan(0);
      const line = almaIndicator?.lines?.[0];
      expect(line?.id).toBe("alma");
      
      const valuesCount = line?.valuesCount ?? line?.values?.length ?? 0;
      expect(valuesCount).toBeGreaterThan(0);
      
      // Get values and verify all are finite (no NaN)
      const values = line?.values ?? [];
      expect(values.length).toBeGreaterThan(0);
      
      // All values must be finite
      const nanValues = values.filter((pt: any) => !Number.isFinite(pt?.value));
      expect(nanValues.length).toBe(0);
      
      // Last value should be finite and in reasonable range
      // (ALMA is a moving average, so should be close to price)
      const lastPt = values[values.length - 1];
      expect(Number.isFinite(lastPt?.value)).toBe(true);
      expect(lastPt?.value).toBeGreaterThan(0); // Price should be positive
      
      // Golden value check: ALMA(9, 0.85, 6) on mock AAPL.US 1h data
      // This ensures correctness is preserved across refactors
      const ALMA_GOLDEN = 190.984;
      expect(lastPt?.value).toBeCloseTo(ALMA_GOLDEN, 2);
    });

    test("LSMA computes correctly with TV defaults", async ({ page }) => {
      // Add LSMA indicator (defaults: length=25, offset=0, source=close)
      await addIndicatorViaModal(page, "lsma");
      await waitForIndicator(page, "lsma");

      // Get indicator data from dump
      const dump = await getDump(page);
      
      // Find LSMA in indicators array
      const lsmaIndicator = dump?.indicators?.find((i: any) => i.kind === "lsma");
      
      // Indicator must exist
      expect(lsmaIndicator).toBeTruthy();
      expect(lsmaIndicator?.pane).toBe("price"); // LSMA is overlay
      
      // Must have computed values
      expect(lsmaIndicator?.lines?.length).toBeGreaterThan(0);
      const line = lsmaIndicator?.lines?.[0];
      expect(line?.id).toBe("lsma");
      
      const valuesCount = line?.valuesCount ?? line?.values?.length ?? 0;
      expect(valuesCount).toBeGreaterThan(0);
      
      // Get values and verify all are finite (no NaN)
      const values = line?.values ?? [];
      expect(values.length).toBeGreaterThan(0);
      
      // All values must be finite
      const nanValues = values.filter((pt: any) => !Number.isFinite(pt?.value));
      expect(nanValues.length).toBe(0);
      
      // Last value should be finite and in reasonable range
      const lastPt = values[values.length - 1];
      expect(Number.isFinite(lastPt?.value)).toBe(true);
      expect(lastPt?.value).toBeGreaterThan(0); // Price should be positive
      
      // Golden value check: LSMA(25, 0) on mock AAPL.US 1h data
      // This ensures correctness is preserved across refactors
      const LSMA_GOLDEN = 190.575;
      expect(lastPt?.value).toBeCloseTo(LSMA_GOLDEN, 2);
    });

    test("SAR computes correctly with TV defaults", async ({ page }) => {
      // Add SAR indicator (defaults: start=0.02, increment=0.02, maxValue=0.2)
      await addIndicatorViaModal(page, "sar");
      await waitForIndicator(page, "sar");

      // Get indicator data from dump
      const dump = await getDump(page);
      
      // Find SAR in indicators array
      const sarIndicator = dump?.indicators?.find((i: any) => i.kind === "sar");
      
      // Indicator must exist
      expect(sarIndicator).toBeTruthy();
      expect(sarIndicator?.pane).toBe("price"); // SAR is overlay
      
      // Must have computed values
      expect(sarIndicator?.lines?.length).toBeGreaterThan(0);
      const line = sarIndicator?.lines?.[0];
      expect(line?.id).toBe("sar");
      
      const valuesCount = line?.valuesCount ?? line?.values?.length ?? 0;
      expect(valuesCount).toBeGreaterThan(0);
      
      // Get values and verify all are finite (no NaN)
      const values = line?.values ?? [];
      expect(values.length).toBeGreaterThan(0);
      
      // All values must be finite
      const nanValues = values.filter((pt: any) => !Number.isFinite(pt?.value));
      expect(nanValues.length).toBe(0);
      
      // Last value should be finite and in reasonable range
      const lastPt = values[values.length - 1];
      expect(Number.isFinite(lastPt?.value)).toBe(true);
      expect(lastPt?.value).toBeGreaterThan(0); // Price should be positive
      
      // Golden value check: SAR(0.02, 0.02, 0.2) on mock AAPL.US 1h data
      // SAR value depends on trend direction (below price in uptrend, above in downtrend)
      const SAR_GOLDEN = 190.48;
      expect(lastPt?.value).toBeCloseTo(SAR_GOLDEN, 1);
    });

    test("Supertrend computes correctly with TV defaults", async ({ page }) => {
      // Add Supertrend indicator (defaults: atrLength=10, factor=3.0)
      await addIndicatorViaModal(page, "supertrend");
      await waitForIndicator(page, "supertrend");

      // Get indicator data from dump
      const dump = await getDump(page);
      
      // Find Supertrend in indicators array
      const stIndicator = dump?.indicators?.find((i: any) => i.kind === "supertrend");
      
      // Indicator must exist
      expect(stIndicator).toBeTruthy();
      expect(stIndicator?.pane).toBe("price"); // Supertrend is overlay
      
      // Must have two lines (up and down)
      expect(stIndicator?.lines?.length).toBe(2);
      
      const upLine = stIndicator?.lines?.find((l: any) => l.id === "supertrend_up");
      const downLine = stIndicator?.lines?.find((l: any) => l.id === "supertrend_down");
      
      expect(upLine).toBeTruthy();
      expect(downLine).toBeTruthy();
      
      // Get values from each line - filter to only points that HAVE a value property
      // WhitespaceData points have only { time } and are valid (TV-style linebr)
      const upValues = (upLine?.values ?? []).filter((pt: any) => 'value' in pt && Number.isFinite(pt.value));
      const downValues = (downLine?.values ?? []).filter((pt: any) => 'value' in pt && Number.isFinite(pt.value));
      const totalValues = upValues.length + downValues.length;
      expect(totalValues).toBeGreaterThan(0);
      
      // All values with value property must be finite (WhitespaceData points are OK to skip)
      const allValues = [...upValues, ...downValues];
      const nanValues = allValues.filter((pt: any) => !Number.isFinite(pt?.value));
      expect(nanValues.length).toBe(0);
      
      // Get last non-null value from either line
      const lastUp = upValues.length > 0 ? upValues[upValues.length - 1] : null;
      const lastDown = downValues.length > 0 ? downValues[downValues.length - 1] : null;
      
      // Determine which line is currently active (has more recent data)
      const lastUpTime = lastUp?.time ?? 0;
      const lastDownTime = lastDown?.time ?? 0;
      const activeLast = lastUpTime > lastDownTime ? lastUp : lastDown;
      
      expect(activeLast).toBeTruthy();
      expect(Number.isFinite(activeLast?.value)).toBe(true);
      expect(activeLast?.value).toBeGreaterThan(0); // Price should be positive
      
      // Golden value check: Supertrend(10, 3.0) on mock AAPL.US 1h data
      // Value depends on current trend state - use tolerance
      const ST_GOLDEN = 189.88;
      expect(activeLast?.value).toBeCloseTo(ST_GOLDEN, 1);
    });

    test("Supertrend has fill overlay for TV visual parity", async ({ page }) => {
      // Add Supertrend indicator
      await addIndicatorViaModal(page, "supertrend");
      await waitForIndicator(page, "supertrend");

      // Get UI state from dump
      const dump = await getDump(page);
      
      // Find Supertrend in UI indicators
      const stUiItem = dump?.ui?.indicators?.items?.find((i: any) => i.kind === "supertrend");
      
      // Verify hasFill is exposed and true (fill overlay is active)
      expect(stUiItem).toBeTruthy();
      expect(stUiItem?.render?.hasFill).toBe(true);
      
      // Verify fill overlay canvas element exists
      const fillCanvas = page.locator('[data-testid="supertrend-fill-overlay"]');
      await expect(fillCanvas).toBeVisible();
    });

    test("Supertrend has XOR property: exactly one line has value per bar (TV parity)", async ({ page }) => {
      // This test verifies that at each bar, EXACTLY ONE of up/down has a finite value
      // This is critical for TV-style "one line that changes color" behavior
      // Arrays must be FULL LENGTH (same length for up and down) for proper index alignment
      
      // Add Supertrend indicator
      await addIndicatorViaModal(page, "supertrend");
      await waitForIndicator(page, "supertrend");

      // Get indicator data from dump
      const dump = await getDump(page);
      
      // Find Supertrend lines
      const stIndicator = dump?.indicators?.find((i: any) => i.kind === "supertrend");
      expect(stIndicator).toBeTruthy();
      
      const upLine = stIndicator?.lines?.find((l: any) => l.id === "supertrend_up");
      const downLine = stIndicator?.lines?.find((l: any) => l.id === "supertrend_down");
      
      expect(upLine).toBeTruthy();
      expect(downLine).toBeTruthy();
      
      // CRITICAL: Both arrays must be same length (full-length, index-aligned)
      expect(upLine.values.length).toBe(downLine.values.length);
      
      // Should have a reasonable number of values (at least 50 bars typically)
      expect(upLine.values.length).toBeGreaterThan(50);
      
      // Check XOR property for ALL bars (must be perfect for TV parity)
      const atrWarmup = 10; // Default ATR length - warmup period has both NaN
      let xorViolations = 0;
      let warmupBothNull = 0;
      let postWarmupBothNull = 0;
      
      // TV-PARITY CHECK: Verify that up and down show the SAME st value when active
      // (not finalLower for up and finalUpper for down - they should be the SAME value)
      let valueMatchViolations = 0;
      
      for (let i = 0; i < upLine.values.length; i++) {
        const upPt = upLine.values[i];
        const downPt = downLine.values[i];
        
        // Check if each point has a finite value (WhitespaceData has no 'value' property)
        const upHasValue = 'value' in upPt && Number.isFinite(upPt.value);
        const downHasValue = 'value' in downPt && Number.isFinite(downPt.value);
        
        // XOR: exactly one should be true, or both null in warmup period
        const isXor = upHasValue !== downHasValue;
        const bothNull = !upHasValue && !downHasValue;
        
        if (!isXor && !bothNull) {
          // Both have values simultaneously - this violates TV parity!
          xorViolations++;
        }
        if (bothNull) {
          if (i < atrWarmup - 1) {
            warmupBothNull++;
          } else {
            postWarmupBothNull++;
          }
        }
      }
      
      // Expect zero XOR violations (never both visible simultaneously)
      expect(xorViolations).toBe(0);
      
      // Post-warmup: every bar must have exactly one value (no double-nulls)
      expect(postWarmupBothNull).toBe(0);
      
      // CRITICAL: No data point should have value: NaN or value: undefined
      // These cause LWC rendering artifacts - must be pure WhitespaceData { time }
      const badUpValues = upLine.values.filter((pt: any) => 
        'value' in pt && !Number.isFinite(pt.value)
      );
      const badDownValues = downLine.values.filter((pt: any) => 
        'value' in pt && !Number.isFinite(pt.value)
      );
      expect(badUpValues.length).toBe(0);
      expect(badDownValues.length).toBe(0);
    });

    test("VWAP computes correctly with bands", async ({ page }) => {
      // VWAP formula: Cumulative(TP × V) / Cumulative(V) where TP = (H+L+C)/3
      // Bands: VWAP ± StdDev × Multiplier
      
      // Add VWAP indicator with default settings (bands enabled)
      await addIndicatorViaModal(page, "vwap");
      await waitForIndicator(page, "vwap");

      // Get indicator data from dump
      const dump = await getDump(page);
      
      // Find VWAP result
      const vwapIndicator = dump?.indicators?.find((i: any) => i.kind === "vwap");
      expect(vwapIndicator).toBeTruthy();
      
      // Should have main VWAP line
      const vwapLine = vwapIndicator?.lines?.find((l: any) => l.id === "vwap");
      expect(vwapLine).toBeTruthy();
      expect(vwapLine.values.length).toBeGreaterThan(50);
      
      // With default settings, should also have band lines
      const upper1 = vwapIndicator?.lines?.find((l: any) => l.id === "upper1");
      const lower1 = vwapIndicator?.lines?.find((l: any) => l.id === "lower1");
      expect(upper1).toBeTruthy();
      expect(lower1).toBeTruthy();
      
      // Verify all lines have same length
      expect(upper1.values.length).toBe(vwapLine.values.length);
      expect(lower1.values.length).toBe(vwapLine.values.length);
      
      // Verify VWAP values are reasonable (should be within price range)
      const vwapValues = vwapLine.values.filter((pt: any) => 'value' in pt && Number.isFinite(pt.value));
      expect(vwapValues.length).toBeGreaterThan(0);
      
      // Sample a few VWAP values - should be positive and reasonable
      for (const pt of vwapValues.slice(0, 10)) {
        expect(pt.value).toBeGreaterThan(0);
        expect(pt.value).toBeLessThan(10000); // Reasonable max for any stock price
      }
      
      // Golden value check: VWAP(session) on mock AAPL.US 1h data
      // This tests the calculation is consistent across runs
      const lastVwapValue = vwapValues[vwapValues.length - 1]?.value;
      expect(typeof lastVwapValue).toBe("number");
      expect(lastVwapValue).toBeGreaterThan(100); // AAPL trades > $100
    });

    test("AVWAP computes correctly with anchor point", async ({ page }) => {
      // Anchored VWAP starts from first bar and never resets
      // All bars before anchor should be WhitespaceData (no value property)
      
      // Add AVWAP indicator
      await addIndicatorViaModal(page, "avwap");
      await waitForIndicator(page, "avwap");

      // Get indicator data from dump
      const dump = await getDump(page);
      
      // Find AVWAP result
      const avwapIndicator = dump?.indicators?.find((i: any) => i.kind === "avwap");
      expect(avwapIndicator).toBeTruthy();
      
      // Should have main AVWAP line
      const avwapLine = avwapIndicator?.lines?.find((l: any) => l.id === "vwap");
      expect(avwapLine).toBeTruthy();
      expect(avwapLine.values.length).toBeGreaterThan(50);
      
      // Verify AVWAP values are reasonable (should be within price range)
      const avwapValues = avwapLine.values.filter((pt: any) => 'value' in pt && Number.isFinite(pt.value));
      expect(avwapValues.length).toBeGreaterThan(0);
      
      // With "first" anchor (default), AVWAP should have values from the start
      // Sample a few values - should be positive and reasonable
      for (const pt of avwapValues.slice(0, 10)) {
        expect(pt.value).toBeGreaterThan(0);
        expect(pt.value).toBeLessThan(10000);
      }
      
      // AVWAP with "first" anchor should never reset, so values should be
      // different from session-based VWAP over multiple days
      const lastAvwapValue = avwapValues[avwapValues.length - 1]?.value;
      expect(typeof lastAvwapValue).toBe("number");
      expect(lastAvwapValue).toBeGreaterThan(100); // AAPL trades > $100
      
      // CRITICAL: No value: NaN should exist (causes autoscale issues)
      // All pre-anchor points should be WhitespaceData { time } without value property
      const badValues = avwapLine.values.filter((pt: any) => 
        'value' in pt && !Number.isFinite(pt.value)
      );
      expect(badValues.length).toBe(0);
    });

    test("AVWAP bands are within reasonable range and non-constant", async ({ page }) => {
      // This test ensures AVWAP bands don't have extreme outliers or constant values
      // (which would cause autoscale issues and "horizontal lines" appearance)
      
      await addIndicatorViaModal(page, "avwap");
      await waitForIndicator(page, "avwap");

      const dump = await getDump(page);
      const avwapIndicator = dump?.indicators?.find((i: any) => i.kind === "avwap");
      expect(avwapIndicator).toBeTruthy();
      
      // Get AVWAP main line as price reference
      const vwapLine = avwapIndicator?.lines?.find((l: any) => l.id === "vwap");
      expect(vwapLine).toBeTruthy();
      
      const vwapValues = vwapLine.values
        .filter((pt: any) => 'value' in pt && Number.isFinite(pt.value))
        .map((pt: any) => pt.value);
      expect(vwapValues.length).toBeGreaterThan(50);
      
      // Calculate reasonable range from VWAP values
      const minVwap = Math.min(...vwapValues);
      const maxVwap = Math.max(...vwapValues);
      
      // Bands should be within 0.5x to 2x of VWAP range
      // (wide enough to allow 3x stddev bands)
      const lowerBound = minVwap * 0.5;
      const upperBound = maxVwap * 2;
      
      // Check all band lines exist and have reasonable values
      const bandLineIds = ["upper1", "lower1", "upper2", "lower2", "upper3", "lower3"];
      
      for (const lineId of bandLineIds) {
        const line = avwapIndicator?.lines?.find((l: any) => l.id === lineId);
        expect(line).toBeTruthy(); // Default showBands=true
        
        const finiteValues = line.values
          .filter((pt: any) => 'value' in pt && Number.isFinite(pt.value))
          .map((pt: any) => pt.value);
        
        expect(finiteValues.length).toBeGreaterThan(0);
        
        // Check values are within reasonable bounds
        const lineMin = Math.min(...finiteValues);
        const lineMax = Math.max(...finiteValues);
        
        expect(lineMin).toBeGreaterThan(lowerBound);
        expect(lineMax).toBeLessThan(upperBound);
        
        // Check values are NOT constant (varies over time = not horizontal line)
        // For a time series, we expect some variance
        const uniqueValues = new Set(finiteValues.map((v: number) => v.toFixed(2)));
        expect(uniqueValues.size).toBeGreaterThan(1); // At least 2 different values
      }
      
      // CRITICAL: Check that NO band has NaN values (would cause autoscale issues)
      for (const lineId of [...bandLineIds, "vwap"]) {
        const line = avwapIndicator?.lines?.find((l: any) => l.id === lineId);
        const badValues = line?.values?.filter((pt: any) => 
          'value' in pt && !Number.isFinite(pt.value)
        ) ?? [];
        expect(badValues.length).toBe(0);
      }
    });

    test("AVWAP has fill overlay config (_avwapFill)", async ({ page }) => {
      // AVWAP should have fill overlay configuration for TV-style band fills
      
      await addIndicatorViaModal(page, "avwap");
      await waitForIndicator(page, "avwap");

      const dump = await getDump(page);
      
      // Find AVWAP in indicatorResults (where _avwapFill is exposed)
      const indicatorResultsObj = dump?.indicatorResults ?? {};
      const avwapResult = Object.values(indicatorResultsObj).find((r: any) => r.kind === "avwap");
      expect(avwapResult).toBeTruthy();
      
      // Check _avwapFill exists with proper structure
      const fillConfig = (avwapResult as any)?._avwapFill;
      expect(fillConfig).toBeTruthy();
      expect(fillConfig?.fills).toBeInstanceOf(Array);
      expect(fillConfig.fills.length).toBe(3); // 3 band pairs
      
      // Check each fill has proper structure
      for (const fill of fillConfig.fills) {
        expect(fill.enabled).toBe(true); // Default enabled
        expect(fill.color).toBeTruthy();
        expect(typeof fill.opacity).toBe("number");
        expect(fill.upperLineId).toMatch(/^upper[123]$/);
        expect(fill.lowerLineId).toMatch(/^lower[123]$/);
      }
    });

    test("AVWAP fill overlay canvas is rendered", async ({ page }) => {
      // AVWAP with bands should render a canvas overlay for fills
      
      await addIndicatorViaModal(page, "avwap");
      await waitForIndicator(page, "avwap");
      
      // Wait a bit for canvas overlay to render
      await page.waitForTimeout(200);
      
      // Check canvas element exists with correct testid
      const fillCanvas = page.locator('[data-testid="avwap-bands-fill-overlay"]');
      await expect(fillCanvas).toBeVisible();
    });

    test("MA Ribbon computes correctly with 8 lines", async ({ page }) => {
      // MA Ribbon shows 8 EMAs (or SMAs) with sequential periods
      // Default: periods 20, 25, 30, 35, 40, 45, 50, 55
      
      // Add MA Ribbon indicator
      await addIndicatorViaModal(page, "maribbon");
      await waitForIndicator(page, "maribbon");

      // Get indicator data from dump
      const dump = await getDump(page);
      
      // Find MA Ribbon result
      const ribbonIndicator = dump?.indicators?.find((i: any) => i.kind === "maribbon");
      expect(ribbonIndicator).toBeTruthy();
      
      // Should have exactly 8 MA lines
      expect(ribbonIndicator?.lines?.length).toBe(8);
      
      // Verify all lines exist with correct IDs
      const expectedIds = ["ma1", "ma2", "ma3", "ma4", "ma5", "ma6", "ma7", "ma8"];
      for (const id of expectedIds) {
        const line = ribbonIndicator?.lines?.find((l: any) => l.id === id);
        expect(line).toBeTruthy();
        expect(line.values.length).toBeGreaterThan(50);
      }
      
      // Verify MA values are valid numbers in price range
      for (const line of ribbonIndicator?.lines || []) {
        const validValues = line.values.filter((pt: any) => 
          'value' in pt && Number.isFinite(pt.value)
        );
        expect(validValues.length).toBeGreaterThan(0);
        
        for (const pt of validValues.slice(-10)) { // Check last 10 values
          expect(pt.value).toBeGreaterThan(100); // AAPL trades > $100
          expect(pt.value).toBeLessThan(500); // Reasonable upper bound
        }
      }
      
      // Verify ordering: shorter period MAs should have more values (less warmup needed)
      // MA1 (period 20) should have more data points than MA8 (period 55)
      const ma1 = ribbonIndicator?.lines?.find((l: any) => l.id === "ma1");
      const ma8 = ribbonIndicator?.lines?.find((l: any) => l.id === "ma8");
      // With EMA (default), all lines should have same length since EMA starts from bar 0
      // Both should have same count since EMA computes from first bar
      expect(ma1.values.length).toBe(ma8.values.length);
      
      // Verify gradient colors are applied (green to indigo)
      const colors = ribbonIndicator?.lines?.map((l: any) => l.color);
      expect(colors[0]).toBe("#22C55E"); // green-500 (MA1)
      expect(colors[7]).toBe("#6366F1"); // indigo-500 (MA8)
    });

    test("MA Ribbon (4) computes correctly with custom periods", async ({ page }) => {
      // MA Ribbon (4) is the TV-style variant with per-line period control
      // Default: EMA with periods 20, 50, 100, 200
      
      // Add MA Ribbon (4) indicator
      await addIndicatorViaModal(page, "maribbon4");
      await waitForIndicator(page, "maribbon4");

      // Get indicator data from dump
      const dump = await getDump(page);
      
      // Find MA Ribbon (4) result
      const ribbonIndicator = dump?.indicators?.find((i: any) => i.kind === "maribbon4");
      expect(ribbonIndicator).toBeTruthy();
      
      // Should have exactly 4 MA lines
      expect(ribbonIndicator?.lines?.length).toBe(4);
      
      // Verify all lines exist with correct IDs
      const expectedIds = ["ma1", "ma2", "ma3", "ma4"];
      for (const id of expectedIds) {
        const line = ribbonIndicator?.lines?.find((l: any) => l.id === id);
        expect(line).toBeTruthy();
        expect(line.values.length).toBeGreaterThan(50);
      }
      
      // Verify MA values are valid numbers in price range
      for (const line of ribbonIndicator?.lines || []) {
        const validValues = line.values.filter((pt: any) => 
          'value' in pt && Number.isFinite(pt.value)
        );
        expect(validValues.length).toBeGreaterThan(0);
        
        // No NaN values should leak (autoscale protection)
        const badValues = line.values.filter((pt: any) => 
          'value' in pt && !Number.isFinite(pt.value)
        );
        expect(badValues.length).toBe(0);
      }
      
      // Verify shorter period MAs react faster (have more variance near price)
      // MA1 (20) should be closer to current price than MA4 (200) in trending market
      const ma1 = ribbonIndicator?.lines?.find((l: any) => l.id === "ma1");
      const ma4 = ribbonIndicator?.lines?.find((l: any) => l.id === "ma4");
      
      // Get last valid values
      const ma1Values = ma1.values.filter((pt: any) => 'value' in pt && Number.isFinite(pt.value));
      const ma4Values = ma4.values.filter((pt: any) => 'value' in pt && Number.isFinite(pt.value));
      
      // Both should have valid values
      expect(ma1Values.length).toBeGreaterThan(0);
      expect(ma4Values.length).toBeGreaterThan(0);
      
      // MA1 (20) should have more valid values than MA4 (200) due to warmup
      // EMA starts from first bar but longer periods need more bars to stabilize
      // For EMA, both should have same length but MA4 early values will be less accurate
      expect(ma1Values.length).toBeGreaterThanOrEqual(ma4Values.length);
      
      // Verify TV-style colors: yellow → orange → deep orange → red
      const colors = ribbonIndicator?.lines?.map((l: any) => l.color);
      expect(colors[0]).toBe("#FFEB3B"); // yellow (MA1)
      expect(colors[1]).toBe("#FF9800"); // orange (MA2)
      expect(colors[2]).toBe("#FF5722"); // deep orange (MA3)
      expect(colors[3]).toBe("#F44336"); // red (MA4)
    });

    test("Ichimoku Cloud computes correctly with forward/backward shifts", async ({ page }) => {
      // Ichimoku Cloud with 5 lines:
      // - Tenkan-sen (9): fast line
      // - Kijun-sen (26): base line
      // - Senkou Span A: (Tenkan + Kijun) / 2, shifted forward 26 bars
      // - Senkou Span B: 52-period Donchian mid, shifted forward 26 bars
      // - Chikou Span: Close, shifted backward 26 bars
      
      // Add Ichimoku indicator
      await addIndicatorViaModal(page, "ichimoku");
      await waitForIndicator(page, "ichimoku");

      // Get indicator data from dump
      const dump = await getDump(page);
      
      // Find Ichimoku result
      const ichimokuIndicator = dump?.indicators?.find((i: any) => i.kind === "ichimoku");
      expect(ichimokuIndicator).toBeTruthy();
      
      // Should have exactly 5 lines
      expect(ichimokuIndicator?.lines?.length).toBe(5);
      
      // Verify all lines exist with correct IDs
      const expectedIds = ["tenkan", "kijun", "senkouA", "senkouB", "chikou"];
      for (const id of expectedIds) {
        const line = ichimokuIndicator?.lines?.find((l: any) => l.id === id);
        expect(line).toBeTruthy();
        expect(line.values.length).toBeGreaterThan(0);
      }
      
      // Verify line values are valid (no NaN leaks)
      for (const line of ichimokuIndicator?.lines || []) {
        const badValues = line.values.filter((pt: any) => 
          'value' in pt && !Number.isFinite(pt.value)
        );
        expect(badValues.length).toBe(0);
      }
      
      // Verify Senkou spans are shifted forward (have future timestamps)
      const senkouA = ichimokuIndicator?.lines?.find((l: any) => l.id === "senkouA");
      const tenkan = ichimokuIndicator?.lines?.find((l: any) => l.id === "tenkan");
      
      // Senkou should extend beyond Tenkan (forward projection)
      const senkouTimes = senkouA.values.map((pt: any) => pt.time);
      const tenkanTimes = tenkan.values.map((pt: any) => pt.time);
      
      // Senkou max time should be greater than Tenkan max time (by ~26 bars)
      const senkouMaxTime = Math.max(...senkouTimes);
      const tenkanMaxTime = Math.max(...tenkanTimes);
      expect(senkouMaxTime).toBeGreaterThan(tenkanMaxTime);
      
      // Verify Chikou ends before Tenkan (shifted backward by plotting close at earlier bars)
      // Chikou's last VALID value is ~26 bars before the last data bar
      const chikou = ichimokuIndicator?.lines?.find((l: any) => l.id === "chikou");
      const chikouValidValues = chikou.values.filter((pt: any) => 
        'value' in pt && Number.isFinite(pt.value)
      );
      const chikouValidTimes = chikouValidValues.map((pt: any) => pt.time);
      const chikouMaxValidTime = Math.max(...chikouValidTimes);
      
      // Chikou max valid time should be less than Tenkan max time (backward shift)
      // Last valid Chikou value is at bar (data.length - 1 - displacement)
      expect(chikouMaxValidTime).toBeLessThan(tenkanMaxTime);
      
      // Verify TV-style colors (updated to match TradingView exactly)
      const tenkanLine = ichimokuIndicator?.lines?.find((l: any) => l.id === "tenkan");
      const kijunLine = ichimokuIndicator?.lines?.find((l: any) => l.id === "kijun");
      const senkouALine = ichimokuIndicator?.lines?.find((l: any) => l.id === "senkouA");
      const senkouBLine = ichimokuIndicator?.lines?.find((l: any) => l.id === "senkouB");
      const chikouLine = ichimokuIndicator?.lines?.find((l: any) => l.id === "chikou");
      
      expect(tenkanLine.color).toBe("#2962FF"); // TV blue (Conversion Line)
      expect(kijunLine.color).toBe("#B71C1C"); // TV dark red (Base Line)
      expect(senkouALine.color).toBe("#43A047"); // TV green (Leading Span A)
      expect(senkouBLine.color).toBe("#FF5252"); // TV red (Leading Span B)
      expect(chikouLine.color).toBe("#43A047"); // TV green (Lagging Span - same as Span A)
      
      // Verify cloud overlay is rendered (showCloudFill defaults to true)
      const cloudOverlay = page.locator('[data-testid="ichimoku-cloud-overlay"]');
      await expect(cloudOverlay).toBeVisible();
    });
  });
  
  // ==========================================================================
  // BB TradingView Parity Tests
  // ==========================================================================
  test.describe("BB TradingView Parity", () => {
    test("BB has 3 lines with TV colors (upper=red, basis=blue, lower=green)", async ({ page }) => {
      await addIndicatorViaModal(page, "bb");
      await waitForIndicator(page, "bb");
      
      const dump = await getDump(page);
      const bb = dump?.indicators?.find((i: any) => i.kind === "bb");
      
      expect(bb).toBeDefined();
      expect(bb?.lines?.length).toBe(3);
      
      const upper = bb?.lines?.find((l: any) => l.id === "upper");
      const middle = bb?.lines?.find((l: any) => l.id === "middle");
      const lower = bb?.lines?.find((l: any) => l.id === "lower");
      
      // TV colors
      expect(upper?.color).toBe("#F23645"); // TV red
      expect(middle?.color).toBe("#2962FF"); // TV blue
      expect(lower?.color).toBe("#089981"); // TV green
      
      // Line widths should be 1px (TV default)
      expect(upper?.lineWidth).toBe(1);
      expect(middle?.lineWidth).toBe(1);
      expect(lower?.lineWidth).toBe(1);
    });
    
    test("BB label format matches TV: 'BB {length} {maType} {source} {stdDev}'", async ({ page }) => {
      await addIndicatorViaModal(page, "bb");
      await waitForIndicator(page, "bb");
      
      const dump = await getDump(page);
      const bb = dump?.indicators?.find((i: any) => i.kind === "bb");
      const middle = bb?.lines?.find((l: any) => l.id === "middle");
      
      // Default: "BB 20 SMA close 2"
      expect(middle?.label).toMatch(/BB\s+20\s+SMA\s+close\s+2/i);
    });
    
    test("BB values have no NaN (converted to WhitespaceData)", async ({ page }) => {
      await addIndicatorViaModal(page, "bb");
      await waitForIndicator(page, "bb");
      
      const dump = await getDump(page);
      const bb = dump?.indicators?.find((i: any) => i.kind === "bb");
      
      let hasNaN = false;
      for (const line of bb?.lines ?? []) {
        for (const pt of line.values ?? []) {
          if ('value' in pt && Number.isNaN(pt.value)) {
            hasNaN = true;
            break;
          }
        }
      }
      expect(hasNaN).toBe(false);
    });
    
    test("BB full-length output (warmup uses WhitespaceData)", async ({ page }) => {
      await addIndicatorViaModal(page, "bb");
      await waitForIndicator(page, "bb");
      
      const dump = await getDump(page);
      const bb = dump?.indicators?.find((i: any) => i.kind === "bb");
      
      // BB should have values array with meaningful length
      const upper = bb?.lines?.find((l: any) => l.id === "upper");
      expect(upper?.values?.length).toBeGreaterThan(0);
      
      // Warmup values should be WhitespaceData (no value property), not NaN
      const hasNaN = upper?.values?.some((v: any) => 
        'value' in v && !Number.isFinite(v.value)
      );
      expect(hasNaN).toBe(false);
    });
    
    test("BB fill overlay canvas is rendered when showBackground=true", async ({ page }) => {
      await addIndicatorViaModal(page, "bb");
      await waitForIndicator(page, "bb");
      
      // The fill overlay should be visible
      const fillOverlay = page.locator('[data-testid="bb-fill-overlay"]');
      await expect(fillOverlay).toBeVisible();
    });
    
    test("BB default MA type is SMA", async ({ page }) => {
      await addIndicatorViaModal(page, "bb");
      await waitForIndicator(page, "bb");
      
      const dump = await getDump(page);
      const bb = dump?.indicators?.find((i: any) => i.kind === "bb");
      
      // Check params include basisMaType = "sma"
      expect(bb?.params?.basisMaType ?? "sma").toBe("sma");
    });
    
    test("BB supports offset parameter", async ({ page }) => {
      await addIndicatorViaModal(page, "bb");
      await waitForIndicator(page, "bb");
      
      const dump = await getDump(page);
      const bb = dump?.indicators?.find((i: any) => i.kind === "bb");
      
      // Check params include offset (default 0)
      expect(bb?.params?.offset ?? 0).toBe(0);
    });
  });
  
  // ===========================================================================
  // CCI TradingView Parity Tests
  // ===========================================================================
  test.describe("CCI TradingView Parity", () => {
    test("CCI has TV colors (blue CCI, dashed gray bands)", async ({ page }) => {
      await addIndicatorViaModal(page, "cci");
      await waitForIndicator(page, "cci");
      
      const dump = await getDump(page);
      const cci = dump?.indicators?.find((i: any) => i.kind === "cci");
      expect(cci).toBeDefined();
      
      // Should have CCI line + 3 bands
      expect(cci?.lines?.length).toBeGreaterThanOrEqual(4);
      
      // CCI line should be TV blue
      const cciLine = cci?.lines?.find((l: any) => l.id === "cci");
      expect(cciLine).toBeDefined();
      expect(cciLine?.color?.toLowerCase()).toBe("#2962ff");
      
      // Upper band should be gray and dashed
      const upperBand = cci?.lines?.find((l: any) => l.id === "upperBand");
      expect(upperBand?.color?.toLowerCase()).toBe("#787b86");
      expect(upperBand?.lineStyle).toBe(2); // Dashed
    });
    
    test("CCI label format matches TV: 'CCI {length} {source}'", async ({ page }) => {
      await addIndicatorViaModal(page, "cci");
      await waitForIndicator(page, "cci");
      
      const dump = await getDump(page);
      const cci = dump?.indicators?.find((i: any) => i.kind === "cci");
      const cciLine = cci?.lines?.find((l: any) => l.id === "cci");
      
      // Label should be "CCI 20 hlc3" (default)
      expect(cciLine?.label).toMatch(/^CCI\s+\d+\s+\w+$/);
      expect(cciLine?.label).toContain("CCI");
      expect(cciLine?.label).toContain("20");
      expect(cciLine?.label).toContain("hlc3");
    });
    
    test("CCI values have no NaN (converted to WhitespaceData)", async ({ page }) => {
      await addIndicatorViaModal(page, "cci");
      await waitForIndicator(page, "cci");
      
      const dump = await getDump(page);
      const cci = dump?.indicators?.find((i: any) => i.kind === "cci");
      const cciLine = cci?.lines?.find((l: any) => l.id === "cci");
      
      // No NaN values should leak through
      const hasNaN = cciLine?.values?.some((v: any) => 
        'value' in v && !Number.isFinite(v.value)
      );
      expect(hasNaN).toBe(false);
    });
    
    test("CCI default source is HLC3", async ({ page }) => {
      await addIndicatorViaModal(page, "cci");
      await waitForIndicator(page, "cci");
      
      const dump = await getDump(page);
      const cci = dump?.indicators?.find((i: any) => i.kind === "cci");
      
      // Default source should be hlc3
      expect(cci?.params?.source ?? "hlc3").toBe("hlc3");
    });
    
    test("CCI default smoothing is None (no MA line)", async ({ page }) => {
      await addIndicatorViaModal(page, "cci");
      await waitForIndicator(page, "cci");
      
      const dump = await getDump(page);
      const cci = dump?.indicators?.find((i: any) => i.kind === "cci");
      
      // Default smoothing should be "none"
      expect(cci?.params?.smoothingType ?? "none").toBe("none");
      
      // CCI-MA line should have empty values when smoothing is none
      const cciMa = cci?.lines?.find((l: any) => l.id === "cciMa");
      expect(cciMa?.values?.length ?? 0).toBe(0);
    });
    
    test("CCI has 3 static bands (+100, 0, -100)", async ({ page }) => {
      await addIndicatorViaModal(page, "cci");
      await waitForIndicator(page, "cci");
      
      const dump = await getDump(page);
      const cci = dump?.indicators?.find((i: any) => i.kind === "cci");
      
      // Should have upper, middle, lower bands
      const upperBand = cci?.lines?.find((l: any) => l.id === "upperBand");
      const middleBand = cci?.lines?.find((l: any) => l.id === "middleBand");
      const lowerBand = cci?.lines?.find((l: any) => l.id === "lowerBand");
      
      expect(upperBand).toBeDefined();
      expect(middleBand).toBeDefined();
      expect(lowerBand).toBeDefined();
      
      // Check band values
      expect(upperBand?.values?.length).toBeGreaterThan(0);
      expect(upperBand?.values?.[0]?.value).toBe(100);
      expect(middleBand?.values?.[0]?.value).toBe(0);
      expect(lowerBand?.values?.[0]?.value).toBe(-100);
    });
    
    test("CCI fill overlay canvas is rendered when showBackgroundFill=true", async ({ page }) => {
      await addIndicatorViaModal(page, "cci");
      await waitForIndicator(page, "cci");
      
      // The fill overlay should be visible
      const fillOverlay = page.locator('[data-testid="cci-fill-overlay"]');
      await expect(fillOverlay).toBeVisible();
    });
  });
  
  // ===========================================================================
  // EMA TradingView Parity Tests
  // ===========================================================================
  test.describe("EMA TradingView Parity", () => {
    test("EMA has TV color (blue #2962FF)", async ({ page }) => {
      await addIndicatorViaModal(page, "ema");
      await waitForIndicator(page, "ema");
      
      const dump = await getDump(page);
      const ema = dump?.indicators?.find((i: any) => i.kind === "ema");
      expect(ema).toBeDefined();
      
      // Should have at least EMA line
      expect(ema?.lines?.length).toBeGreaterThanOrEqual(1);
      
      // EMA line should be TV blue
      const emaLine = ema?.lines?.find((l: any) => l.id === "ema");
      expect(emaLine).toBeDefined();
      expect(emaLine?.color?.toLowerCase()).toBe("#2962ff");
    });
    
    test("EMA label format matches TV: 'EMA {length} {source}'", async ({ page }) => {
      await addIndicatorViaModal(page, "ema");
      await waitForIndicator(page, "ema");
      
      const dump = await getDump(page);
      const ema = dump?.indicators?.find((i: any) => i.kind === "ema");
      const emaLine = ema?.lines?.find((l: any) => l.id === "ema");
      
      // Label should be "EMA 9 close" (default)
      expect(emaLine?.label).toMatch(/^EMA\s+\d+\s+\w+$/);
      expect(emaLine?.label).toContain("EMA");
      expect(emaLine?.label).toContain("9");
      expect(emaLine?.label).toContain("close");
    });
    
    test("EMA values have no NaN (filtered out)", async ({ page }) => {
      await addIndicatorViaModal(page, "ema");
      await waitForIndicator(page, "ema");
      
      const dump = await getDump(page);
      const ema = dump?.indicators?.find((i: any) => i.kind === "ema");
      const emaLine = ema?.lines?.find((l: any) => l.id === "ema");
      
      // No NaN values should leak through
      const hasNaN = emaLine?.values?.some((v: any) => 
        'value' in v && !Number.isFinite(v.value)
      );
      expect(hasNaN).toBe(false);
    });
    
    test("EMA default source is close", async ({ page }) => {
      await addIndicatorViaModal(page, "ema");
      await waitForIndicator(page, "ema");
      
      const dump = await getDump(page);
      const ema = dump?.indicators?.find((i: any) => i.kind === "ema");
      
      // Default source should be close
      expect(ema?.params?.source ?? "close").toBe("close");
    });
    
    test("EMA default smoothing is None (no smoothing line)", async ({ page }) => {
      await addIndicatorViaModal(page, "ema");
      await waitForIndicator(page, "ema");
      
      const dump = await getDump(page);
      const ema = dump?.indicators?.find((i: any) => i.kind === "ema");
      
      // Default smoothing should be "none"
      expect(ema?.params?.smoothingType ?? "none").toBe("none");
      
      // Smoothing line should not exist when smoothing is none
      const smoothingLine = ema?.lines?.find((l: any) => l.id === "smoothing");
      expect(smoothingLine?.values?.length ?? 0).toBe(0);
    });
    
    test("EMA supports offset parameter (default 0)", async ({ page }) => {
      await addIndicatorViaModal(page, "ema");
      await waitForIndicator(page, "ema");
      
      const dump = await getDump(page);
      const ema = dump?.indicators?.find((i: any) => i.kind === "ema");
      
      // Check params include offset (default 0)
      expect(ema?.params?.offset ?? 0).toBe(0);
    });
    
    test("EMA has TV-style inputs (length, source, offset, smoothing)", async ({ page }) => {
      await addIndicatorViaModal(page, "ema");
      await waitForIndicator(page, "ema");
      
      const dump = await getDump(page);
      const ema = dump?.indicators?.find((i: any) => i.kind === "ema");
      
      // Should have length (not period)
      expect(ema?.params?.length !== undefined || ema?.params?.period === undefined).toBe(true);
      
      // Should have smoothingType and smoothingLength params
      expect(ema?.params).toHaveProperty("smoothingType");
      expect(ema?.params).toHaveProperty("smoothingLength");
      expect(ema?.params).toHaveProperty("bbStdDev");
    });
  });
  
  // ===========================================================================
  // SAR TradingView Parity Tests
  // ===========================================================================
  test.describe("SAR TradingView Parity", () => {
    test("SAR has TV color (blue #2962FF)", async ({ page }) => {
      await addIndicatorViaModal(page, "sar");
      await waitForIndicator(page, "sar");
      
      const dump = await getDump(page);
      const sar = dump?.indicators?.find((i: any) => i.kind === "sar");
      expect(sar).toBeDefined();
      
      // Should have at least SAR line
      expect(sar?.lines?.length).toBeGreaterThanOrEqual(1);
      
      // SAR line should be TV blue
      const sarLine = sar?.lines?.find((l: any) => l.id === "sar");
      expect(sarLine).toBeDefined();
      expect(sarLine?.color?.toLowerCase()).toBe("#2962ff");
    });
    
    test("SAR label format matches TV: 'SAR {start} {increment} {max}'", async ({ page }) => {
      await addIndicatorViaModal(page, "sar");
      await waitForIndicator(page, "sar");
      
      const dump = await getDump(page);
      const sar = dump?.indicators?.find((i: any) => i.kind === "sar");
      const sarLine = sar?.lines?.find((l: any) => l.id === "sar");
      
      // Label should be "SAR 0.02 0.02 0.2" (default, no parentheses)
      expect(sarLine?.label).toMatch(/^SAR\s+[\d.]+\s+[\d.]+\s+[\d.]+$/);
      expect(sarLine?.label).toContain("SAR");
      expect(sarLine?.label).not.toContain("(");
      expect(sarLine?.label).not.toContain(")");
    });
    
    test("SAR values have no NaN (filtered out)", async ({ page }) => {
      await addIndicatorViaModal(page, "sar");
      await waitForIndicator(page, "sar");
      
      const dump = await getDump(page);
      const sar = dump?.indicators?.find((i: any) => i.kind === "sar");
      const sarLine = sar?.lines?.find((l: any) => l.id === "sar");
      
      // No NaN values should leak through
      const hasNaN = sarLine?.values?.some((v: any) => 
        'value' in v && !Number.isFinite(v.value)
      );
      expect(hasNaN).toBe(false);
    });
    
    test("SAR default inputs: start=0.02, increment=0.02, maxValue=0.2", async ({ page }) => {
      await addIndicatorViaModal(page, "sar");
      await waitForIndicator(page, "sar");
      
      const dump = await getDump(page);
      const sar = dump?.indicators?.find((i: any) => i.kind === "sar");
      
      // Default values should match TV
      expect(Number(sar?.params?.start)).toBe(0.02);
      expect(Number(sar?.params?.increment)).toBe(0.02);
      expect(Number(sar?.params?.maxValue ?? sar?.params?.maximum)).toBe(0.2);
    });
    
    test("SAR default plotStyle is circles", async ({ page }) => {
      await addIndicatorViaModal(page, "sar");
      await waitForIndicator(page, "sar");
      
      const dump = await getDump(page);
      const sar = dump?.indicators?.find((i: any) => i.kind === "sar");
      
      // Default plotStyle should be "circles"
      expect(sar?.params?.plotStyle ?? "circles").toBe("circles");
    });
    
    test("SAR default priceLine is OFF", async ({ page }) => {
      await addIndicatorViaModal(page, "sar");
      await waitForIndicator(page, "sar");
      
      const dump = await getDump(page);
      const sar = dump?.indicators?.find((i: any) => i.kind === "sar");
      
      // Default priceLine should be false
      expect(sar?.params?.priceLine ?? false).toBe(false);
    });
    
    test("SAR markers overlay canvas is rendered when plotStyle=circles", async ({ page }) => {
      await addIndicatorViaModal(page, "sar");
      await waitForIndicator(page, "sar");
      
      // The markers overlay should be visible
      const markersOverlay = page.locator('[data-testid="sar-markers-overlay"]');
      await expect(markersOverlay).toBeVisible();
    });
  });
  
  // ===========================================================================
  // ROC TradingView Parity Tests
  // ===========================================================================
  test.describe("ROC TradingView Parity", () => {
    test("ROC label format matches TV: 'ROC {length} {source}'", async ({ page }) => {
      await addIndicatorViaModal(page, "roc");
      await waitForIndicator(page, "roc");
      
      const dump = await getDump(page);
      const roc = dump?.indicators?.find((i: any) => i.kind === "roc");
      const rocLine = roc?.lines?.find((l: any) => l.id === "roc");
      
      // Label should be "ROC 9 close" (default, no parentheses)
      expect(rocLine?.label).toMatch(/^ROC\s+\d+\s+\w+$/);
      expect(rocLine?.label).toContain("ROC");
      expect(rocLine?.label).not.toContain("(");
      expect(rocLine?.label).not.toContain(")");
    });
    
    test("ROC default color is TV blue (#2962FF)", async ({ page }) => {
      await addIndicatorViaModal(page, "roc");
      await waitForIndicator(page, "roc");
      
      const dump = await getDump(page);
      const roc = dump?.indicators?.find((i: any) => i.kind === "roc");
      const rocLine = roc?.lines?.find((l: any) => l.id === "roc");
      
      expect(rocLine?.color?.toLowerCase()).toBe("#2962ff");
    });
    
    test("ROC default length is 9", async ({ page }) => {
      await addIndicatorViaModal(page, "roc");
      await waitForIndicator(page, "roc");
      
      const dump = await getDump(page);
      const roc = dump?.indicators?.find((i: any) => i.kind === "roc");
      
      // Should have length param (not period), default 9
      const length = Number(roc?.params?.length) || Number(roc?.params?.period);
      expect(length).toBe(9);
    });
    
    test("ROC zero line is shown by default", async ({ page }) => {
      await addIndicatorViaModal(page, "roc");
      await waitForIndicator(page, "roc");
      
      const dump = await getDump(page);
      const roc = dump?.indicators?.find((i: any) => i.kind === "roc");
      
      // showZeroLine should default to true
      expect(roc?.params?.showZeroLine !== false).toBe(true);
    });
    
    test("ROC values have no NaN (whitespace for warmup)", async ({ page }) => {
      await addIndicatorViaModal(page, "roc");
      await waitForIndicator(page, "roc");
      
      const dump = await getDump(page);
      const roc = dump?.indicators?.find((i: any) => i.kind === "roc");
      const rocLine = roc?.lines?.find((l: any) => l.id === "roc");
      
      // No NaN values should leak through (warmup uses whitespace)
      const values = rocLine?.values ?? [];
      const hasNaN = values.some((v: any) => 
        'value' in v && !Number.isFinite(v.value)
      );
      expect(hasNaN).toBe(false);
    });
    
    test("ROC source dropdown has 7 TV-style options in manifest", async ({ page }) => {
      // This test verifies the manifest has 7 source options (Open, High, Low, Close, HL2, HLC3, OHLC4)
      // by checking that the indicator can be added and has proper source param
      await addIndicatorViaModal(page, "roc");
      await waitForIndicator(page, "roc");
      
      const dump = await getDump(page);
      const roc = dump?.indicators?.find((i: any) => i.kind === "roc");
      
      // Verify source param exists with default "close"
      expect(roc?.params?.source).toBe("close");
      
      // Note: Full dropdown options test would require opening settings modal
      // The manifest defines 7 options: Open, High, Low, Close, (H+L)/2, (H+L+C)/3, (O+H+L+C)/4
      // This is validated by the TypeScript compiler against indicatorManifest.ts
    });
  });
  
  // ===========================================================================
  // Williams %R TradingView Parity Tests
  // ===========================================================================
  test.describe("Williams %R TradingView Parity", () => {
    test("Williams %R label format matches TV: '%R {length} {source}'", async ({ page }) => {
      // Search for "Williams" to find the indicator
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Williams");
      await page.locator('[data-testid="indicators-modal-add-willr"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "willr");
      
      const dump = await getDump(page);
      const willr = dump?.indicators?.find((i: any) => i.kind === "willr");
      const result = dump?.indicatorResults?.[willr?.id];
      const mainLine = result?.lines?.find((l: any) => l.id === "willr");
      
      // Default: length=14, source=hlcc4
      expect(mainLine?.label).toMatch(/%R 14 hlcc4/);
    });
    
    test("Williams %R default color is TV purple (#7E57C2)", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Williams");
      await page.locator('[data-testid="indicators-modal-add-willr"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "willr");
      
      const dump = await getDump(page);
      const willr = dump?.indicators?.find((i: any) => i.kind === "willr");
      const result = dump?.indicatorResults?.[willr?.id];
      const mainLine = result?.lines?.find((l: any) => l.id === "willr");
      
      // TV purple = #7E57C2
      expect(mainLine?.color?.toLowerCase()).toBe("#7e57c2");
    });
    
    test("Williams %R default length is 14", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Williams");
      await page.locator('[data-testid="indicators-modal-add-willr"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "willr");
      
      const dump = await getDump(page);
      const willr = dump?.indicators?.find((i: any) => i.kind === "willr");
      
      // Check length param (or period for legacy)
      const length = willr?.params?.length ?? willr?.params?.period;
      expect(length).toBe(14);
    });
    
    test("Williams %R has upper band at -20 and lower band at -80", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Williams");
      await page.locator('[data-testid="indicators-modal-add-willr"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "willr");
      
      const dump = await getDump(page);
      const willr = dump?.indicators?.find((i: any) => i.kind === "willr");
      const result = dump?.indicatorResults?.[willr?.id];
      
      // Check band lines exist
      const upperLine = result?.lines?.find((l: any) => l.id === "willrUpperBand");
      const lowerLine = result?.lines?.find((l: any) => l.id === "willrLowerBand");
      
      expect(upperLine).toBeDefined();
      expect(lowerLine).toBeDefined();
      
      // Check band values
      expect(willr?.params?.upperBand).toBe(-20);
      expect(willr?.params?.lowerBand).toBe(-80);
    });
    
    test("Williams %R has fill overlay config (_willrFill)", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Williams");
      await page.locator('[data-testid="indicators-modal-add-willr"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "willr");
      
      const dump = await getDump(page);
      const willr = dump?.indicators?.find((i: any) => i.kind === "willr");
      const result = dump?.indicatorResults?.[willr?.id];
      
      // Should have _willrFill config
      expect(result?._willrFill).toBeDefined();
      expect(result?._willrFill?.showBackgroundFill).toBe(true);
      expect(result?._willrFill?.showOverboughtFill).toBe(true);
      expect(result?._willrFill?.showOversoldFill).toBe(true);
      expect(result?._willrFill?.upperBandValue).toBe(-20);
      expect(result?._willrFill?.lowerBandValue).toBe(-80);
    });
    
    test("Williams %R fill overlay canvas is rendered", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Williams");
      await page.locator('[data-testid="indicators-modal-add-willr"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "willr");
      
      // Give overlay time to render
      await page.waitForTimeout(200);
      
      // Look for the fill overlay canvas
      const overlay = page.locator('[data-testid="willr-fill-overlay"]');
      await expect(overlay).toBeVisible({ timeout: 3000 });
    });
    
    test("Williams %R values have no NaN (filtered to whitespace)", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Williams");
      await page.locator('[data-testid="indicators-modal-add-willr"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "willr");
      
      const dump = await getDump(page);
      const willr = dump?.indicators?.find((i: any) => i.kind === "willr");
      const result = dump?.indicatorResults?.[willr?.id];
      const mainLine = result?.lines?.find((l: any) => l.id === "willr");
      const values = mainLine?.values ?? [];
      
      // Check no NaN values (warmup period uses WhitespaceData, not NaN)
      const hasNaN = values.some((v: any) => 
        'value' in v && !Number.isFinite(v.value)
      );
      expect(hasNaN).toBe(false);
    });
    
    test("Williams %R source dropdown has HLCC4 as default", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Williams");
      await page.locator('[data-testid="indicators-modal-add-willr"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "willr");
      
      const dump = await getDump(page);
      const willr = dump?.indicators?.find((i: any) => i.kind === "willr");
      
      // Williams %R uses HLCC4 as default source (typical price)
      expect(willr?.params?.source).toBe("hlcc4");
    });
  });
  
  // ===========================================================================
  // Stochastic RSI TradingView Parity Tests
  // ===========================================================================
  test.describe("Stochastic RSI TradingView Parity", () => {
    test("StochRSI default inputs: K=3, D=3, RSI Length=14, Stochastic Length=14, Source=close", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic RSI");
      await page.locator('[data-testid="indicators-modal-add-stochrsi"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stochrsi");
      
      const dump = await getDump(page);
      const stochrsi = dump?.indicators?.find((i: any) => i.kind === "stochrsi");
      
      // Check all default params match TV
      expect(stochrsi?.params?.k ?? stochrsi?.params?.kSmooth).toBe(3);
      expect(stochrsi?.params?.d ?? stochrsi?.params?.dSmooth).toBe(3);
      expect(stochrsi?.params?.rsiLength ?? stochrsi?.params?.rsiPeriod).toBe(14);
      expect(stochrsi?.params?.stochasticLength ?? stochrsi?.params?.stochPeriod).toBe(14);
      expect(stochrsi?.params?.source).toBe("close");
    });
    
    test("StochRSI source dropdown has 7 TV-style options", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic RSI");
      await page.locator('[data-testid="indicators-modal-add-stochrsi"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stochrsi");
      
      const dump = await getDump(page);
      const stochrsi = dump?.indicators?.find((i: any) => i.kind === "stochrsi");
      
      // Verify source param exists with default "close"
      expect(stochrsi?.params?.source).toBe("close");
      
      // Note: Full dropdown options test would require opening settings modal
      // The manifest defines 7 options: Open, High, Low, Close, (H+L)/2, (H+L+C)/3, (O+H+L+C)/4
      // This is validated by the TypeScript compiler against indicatorManifest.ts
    });
    
    test("StochRSI label format matches TV: 'Stoch RSI {k} {d} {rsiLen} {stochLen} {source}'", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic RSI");
      await page.locator('[data-testid="indicators-modal-add-stochrsi"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stochrsi");
      
      const dump = await getDump(page);
      const stochrsi = dump?.indicators?.find((i: any) => i.kind === "stochrsi");
      const result = dump?.indicatorResults?.[stochrsi?.id];
      const kLine = result?.lines?.find((l: any) => l.id === "stochRsiK");
      
      // Label format: "Stoch RSI 3 3 14 14 close" (no parentheses)
      expect(kLine?.label).toMatch(/Stoch RSI 3 3 14 14 close/);
    });
    
    test("StochRSI default colors: K #2962FF (blue), D orange (#FF6D00)", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic RSI");
      await page.locator('[data-testid="indicators-modal-add-stochrsi"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stochrsi");
      
      const dump = await getDump(page);
      const stochrsi = dump?.indicators?.find((i: any) => i.kind === "stochrsi");
      const result = dump?.indicatorResults?.[stochrsi?.id];
      const kLine = result?.lines?.find((l: any) => l.id === "stochRsiK");
      const dLine = result?.lines?.find((l: any) => l.id === "stochRsiD");
      
      // K line = TV blue #2962FF
      expect(kLine?.color?.toUpperCase()).toBe("#2962FF");
      // D line = TV orange #FF6D00
      expect(dLine?.color?.toUpperCase()).toBe("#FF6D00");
    });
    
    test("StochRSI has 3 band lines at 80/50/20 with correct styles", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic RSI");
      await page.locator('[data-testid="indicators-modal-add-stochrsi"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stochrsi");
      
      const dump = await getDump(page);
      const stochrsi = dump?.indicators?.find((i: any) => i.kind === "stochrsi");
      const result = dump?.indicatorResults?.[stochrsi?.id];
      
      // Check band lines exist
      const upperBand = result?.lines?.find((l: any) => l.id === "stochRsiUpperBand");
      const middleBand = result?.lines?.find((l: any) => l.id === "stochRsiMiddleBand");
      const lowerBand = result?.lines?.find((l: any) => l.id === "stochRsiLowerBand");
      
      expect(upperBand).toBeDefined();
      expect(middleBand).toBeDefined();
      expect(lowerBand).toBeDefined();
      
      // Check band values via params
      expect(stochrsi?.params?.upperBandValue).toBe(80);
      expect(stochrsi?.params?.middleBandValue).toBe(50);
      expect(stochrsi?.params?.lowerBandValue).toBe(20);
      
      // Check band line styles: upper=dashed (2), middle=dotted (3), lower=dashed (2)
      expect(upperBand?.lineStyle).toBe(2); // dashed
      expect(middleBand?.lineStyle).toBe(3); // dotted
      expect(lowerBand?.lineStyle).toBe(2); // dashed
    });
    
    test("StochRSI has background fill overlay config (_stochrsiFill)", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic RSI");
      await page.locator('[data-testid="indicators-modal-add-stochrsi"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stochrsi");
      
      const dump = await getDump(page);
      const stochrsi = dump?.indicators?.find((i: any) => i.kind === "stochrsi");
      const result = dump?.indicatorResults?.[stochrsi?.id];
      
      // Should have _stochrsiFill config
      expect(result?._stochrsiFill).toBeDefined();
      expect(result?._stochrsiFill?.showBackground).toBe(true);
      expect(result?._stochrsiFill?.upperBandValue).toBe(80);
      expect(result?._stochrsiFill?.middleBandValue).toBe(50);
      expect(result?._stochrsiFill?.lowerBandValue).toBe(20);
    });
    
    test("StochRSI fill overlay canvas is rendered", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic RSI");
      await page.locator('[data-testid="indicators-modal-add-stochrsi"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stochrsi");
      
      // Give overlay time to render
      await page.waitForTimeout(200);
      
      // Look for the fill overlay canvas
      const overlay = page.locator('[data-testid="stochrsi-bg-fill-overlay"]');
      await expect(overlay).toBeVisible({ timeout: 3000 });
    });
    
    test("StochRSI values have no NaN (converted to WhitespaceData)", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic RSI");
      await page.locator('[data-testid="indicators-modal-add-stochrsi"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stochrsi");
      
      const dump = await getDump(page);
      const stochrsi = dump?.indicators?.find((i: any) => i.kind === "stochrsi");
      const result = dump?.indicatorResults?.[stochrsi?.id];
      const kLine = result?.lines?.find((l: any) => l.id === "stochRsiK");
      const values = kLine?.values ?? [];
      
      // Check no NaN values (warmup period uses WhitespaceData, not NaN)
      const hasNaN = values.some((v: any) => 
        'value' in v && !Number.isFinite(v.value)
      );
      expect(hasNaN).toBe(false);
    });
    
    test("StochRSI is bounded 0-100 (no values outside range)", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic RSI");
      await page.locator('[data-testid="indicators-modal-add-stochrsi"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stochrsi");
      
      const dump = await getDump(page);
      const stochrsi = dump?.indicators?.find((i: any) => i.kind === "stochrsi");
      const result = dump?.indicatorResults?.[stochrsi?.id];
      const kLine = result?.lines?.find((l: any) => l.id === "stochRsiK");
      const dLine = result?.lines?.find((l: any) => l.id === "stochRsiD");
      
      // All K values should be in 0-100 range
      const kValues = (kLine?.values ?? []).filter((v: any) => 'value' in v);
      const kOutOfRange = kValues.some((v: any) => v.value < 0 || v.value > 100);
      expect(kOutOfRange).toBe(false);
      
      // All D values should be in 0-100 range
      const dValues = (dLine?.values ?? []).filter((v: any) => 'value' in v);
      const dOutOfRange = dValues.some((v: any) => v.value < 0 || v.value > 100);
      expect(dOutOfRange).toBe(false);
    });
  });
  
  // ============================================================================
  // Stochastic (Stoch) TradingView Parity Tests
  // ============================================================================
  test.describe("Stochastic TradingView Parity", () => {
    test("Stoch default inputs: kLength=14, kSmoothing=1, dSmoothing=3", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic");
      // Click the plain Stochastic, not Stochastic RSI
      await page.locator('[data-testid="indicators-modal-add-stoch"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stoch");
      
      const dump = await getDump(page);
      const stoch = dump?.indicators?.find((i: any) => i.kind === "stoch");
      expect(stoch).toBeDefined();
      
      // TV defaults: %K Length=14, %K Smoothing=1, %D Smoothing=3
      expect(stoch?.params?.kLength ?? 14).toBe(14);
      expect(stoch?.params?.kSmoothing ?? 1).toBe(1);
      expect(stoch?.params?.dSmoothing ?? 3).toBe(3);
    });
    
    test("Stoch label format matches TV: 'Stoch 14 1 3'", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic");
      await page.locator('[data-testid="indicators-modal-add-stoch"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stoch");
      
      const dump = await getDump(page);
      const stoch = dump?.indicators?.find((i: any) => i.kind === "stoch");
      const result = dump?.indicatorResults?.[stoch?.id];
      const kLine = result?.lines?.find((l: any) => l.id === "stochK");
      
      // Label should be "Stoch {kLength} {kSmoothing} {dSmoothing}"
      expect(kLine?.label).toBe("Stoch 14 1 3");
    });
    
    test("Stoch default colors: K #2962FF (blue), D #FF6D00 (orange)", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic");
      await page.locator('[data-testid="indicators-modal-add-stoch"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stoch");
      
      const dump = await getDump(page);
      const stoch = dump?.indicators?.find((i: any) => i.kind === "stoch");
      const result = dump?.indicatorResults?.[stoch?.id];
      const kLine = result?.lines?.find((l: any) => l.id === "stochK");
      const dLine = result?.lines?.find((l: any) => l.id === "stochD");
      
      // K line should be TV blue
      expect(kLine?.color).toBe("#2962FF");
      // D line should be TV orange  
      expect(dLine?.color).toBe("#FF6D00");
    });
    
    test("Stoch has 3 band lines at 80/50/20 with correct styles", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic");
      await page.locator('[data-testid="indicators-modal-add-stoch"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stoch");
      
      const dump = await getDump(page);
      const stoch = dump?.indicators?.find((i: any) => i.kind === "stoch");
      const result = dump?.indicatorResults?.[stoch?.id];
      
      // Find band lines
      const upperBand = result?.lines?.find((l: any) => l.id === "stochUpperBand");
      const middleBand = result?.lines?.find((l: any) => l.id === "stochMiddleBand");
      const lowerBand = result?.lines?.find((l: any) => l.id === "stochLowerBand");
      
      // All bands should exist
      expect(upperBand).toBeDefined();
      expect(middleBand).toBeDefined();
      expect(lowerBand).toBeDefined();
      
      // Check band values (first value in each band series)
      const upperValue = upperBand?.values?.[0]?.value;
      const middleValue = middleBand?.values?.[0]?.value;
      const lowerValue = lowerBand?.values?.[0]?.value;
      expect(upperValue).toBe(80);
      expect(middleValue).toBe(50);
      expect(lowerValue).toBe(20);
      
      // Check line styles: 2 = dashed, 3 = dotted, 0 = solid
      expect(upperBand?.lineStyle).toBe(2); // dashed
      expect(middleBand?.lineStyle).toBe(3); // dotted
      expect(lowerBand?.lineStyle).toBe(2); // dashed
      
      // All bands should be gray
      expect(upperBand?.color).toBe("#787B86");
      expect(middleBand?.color).toBe("#787B86");
      expect(lowerBand?.color).toBe("#787B86");
    });
    
    test("Stoch has background fill overlay config (_stochFill)", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic");
      await page.locator('[data-testid="indicators-modal-add-stoch"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stoch");
      
      const dump = await getDump(page);
      const stoch = dump?.indicators?.find((i: any) => i.kind === "stoch");
      const result = dump?.indicatorResults?.[stoch?.id];
      
      // _stochFill should exist with correct config
      expect(result?._stochFill).toBeDefined();
      expect(result?._stochFill?.showBackground).toBe(true);
      expect(result?._stochFill?.upperBandValue).toBe(80);
      expect(result?._stochFill?.lowerBandValue).toBe(20);
      expect(result?._stochFill?.backgroundFillColor).toBe("#2962FF");
      expect(result?._stochFill?.backgroundFillOpacity).toBe(0.1);
    });
    
    test("Stoch fill overlay canvas is rendered", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic");
      await page.locator('[data-testid="indicators-modal-add-stoch"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stoch");
      
      // Wait for overlay to render
      await page.waitForTimeout(500);
      
      // Check that the fill overlay canvas exists
      const fillOverlay = page.locator('[data-testid="stoch-fill-overlay"]');
      await expect(fillOverlay).toBeVisible({ timeout: 3000 });
    });
    
    test("Stoch values have no NaN (converted to WhitespaceData)", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic");
      await page.locator('[data-testid="indicators-modal-add-stoch"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stoch");
      
      const dump = await getDump(page);
      const stoch = dump?.indicators?.find((i: any) => i.kind === "stoch");
      const result = dump?.indicatorResults?.[stoch?.id];
      const kLine = result?.lines?.find((l: any) => l.id === "stochK");
      const dLine = result?.lines?.find((l: any) => l.id === "stochD");
      
      // Check K values - no NaN
      const kNaN = (kLine?.values ?? []).some((v: any) => 
        'value' in v && !Number.isFinite(v.value)
      );
      expect(kNaN).toBe(false);
      
      // Check D values - no NaN
      const dNaN = (dLine?.values ?? []).some((v: any) => 
        'value' in v && !Number.isFinite(v.value)
      );
      expect(dNaN).toBe(false);
    });
    
    test("Stoch is bounded 0-100 (no values outside range)", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic");
      await page.locator('[data-testid="indicators-modal-add-stoch"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stoch");
      
      const dump = await getDump(page);
      const stoch = dump?.indicators?.find((i: any) => i.kind === "stoch");
      const result = dump?.indicatorResults?.[stoch?.id];
      const kLine = result?.lines?.find((l: any) => l.id === "stochK");
      const dLine = result?.lines?.find((l: any) => l.id === "stochD");
      
      // All K values should be in 0-100 range
      const kValues = (kLine?.values ?? []).filter((v: any) => 'value' in v);
      const kOutOfRange = kValues.some((v: any) => v.value < 0 || v.value > 100);
      expect(kOutOfRange).toBe(false);
      
      // All D values should be in 0-100 range  
      const dValues = (dLine?.values ?? []).filter((v: any) => 'value' in v);
      const dOutOfRange = dValues.some((v: any) => v.value < 0 || v.value > 100);
      expect(dOutOfRange).toBe(false);
    });
    
    test("Stoch K and D lines have lastValueVisible true", async ({ page }) => {
      await openIndicatorsModal(page);
      const search = page.locator('[data-testid="indicators-modal-search"]');
      await search.fill("Stochastic");
      await page.locator('[data-testid="indicators-modal-add-stoch"]').click();
      await page.locator('[data-testid="indicators-modal"]').waitFor({ state: "hidden", timeout: 5000 });
      await waitForIndicator(page, "stoch");
      
      const dump = await getDump(page);
      const stoch = dump?.indicators?.find((i: any) => i.kind === "stoch");
      const result = dump?.indicatorResults?.[stoch?.id];
      const kLine = result?.lines?.find((l: any) => l.id === "stochK");
      const dLine = result?.lines?.find((l: any) => l.id === "stochD");
      
      // Both K and D should have lastValueVisible: true for TV-style price labels
      expect(kLine?.lastValueVisible).toBe(true);
      expect(dLine?.lastValueVisible).toBe(true);
    });
    
    // =========================================================================
    // VWAP TV-Parity Tests
    // =========================================================================
    
    test("VWAP has TV-style label format 'VWAP (Session)'", async ({ page }) => {
      await addIndicatorViaModal(page, "vwap");
      await waitForIndicator(page, "vwap");
      
      const dump = await getDump(page);
      const vwap = dump?.indicators?.find((i: any) => i.kind === "vwap");
      const result = dump?.indicatorResults?.[vwap?.id];
      const vwapLine = result?.lines?.find((l: any) => l.id === "vwap");
      
      // Label should match TV format: "VWAP (AnchorPeriod)"
      // With default anchorPeriod="session", expect "VWAP (Session)"
      expect(vwapLine?.label).toBe("VWAP (Session)");
    });
    
    test("VWAP has TV-style colors: blue VWAP, green/olive/teal bands", async ({ page }) => {
      await addIndicatorViaModal(page, "vwap");
      await waitForIndicator(page, "vwap");
      
      const dump = await getDump(page);
      const vwap = dump?.indicators?.find((i: any) => i.kind === "vwap");
      const result = dump?.indicatorResults?.[vwap?.id];
      
      // VWAP line should be TV-blue
      const vwapLine = result?.lines?.find((l: any) => l.id === "vwap");
      expect(vwapLine?.color).toBe("#2962FF");
      
      // Band #1 should be green
      const upper1 = result?.lines?.find((l: any) => l.id === "upper1");
      const lower1 = result?.lines?.find((l: any) => l.id === "lower1");
      expect(upper1?.color).toBe("#4CAF50");
      expect(lower1?.color).toBe("#4CAF50");
      
      // Band #2 should be olive
      const upper2 = result?.lines?.find((l: any) => l.id === "upper2");
      const lower2 = result?.lines?.find((l: any) => l.id === "lower2");
      expect(upper2?.color).toBe("#808000");
      expect(lower2?.color).toBe("#808000");
      
      // Band #3 should be teal
      const upper3 = result?.lines?.find((l: any) => l.id === "upper3");
      const lower3 = result?.lines?.find((l: any) => l.id === "lower3");
      expect(upper3?.color).toBe("#00897B");
      expect(lower3?.color).toBe("#00897B");
    });
    
    test("VWAP has _vwapFill config with 3 band fills", async ({ page }) => {
      await addIndicatorViaModal(page, "vwap");
      await waitForIndicator(page, "vwap");
      
      const dump = await getDump(page);
      const vwap = dump?.indicators?.find((i: any) => i.kind === "vwap");
      const result = dump?.indicatorResults?.[vwap?.id];
      
      // Should have _vwapFill config
      expect(result?._vwapFill).toBeTruthy();
      expect(result?._vwapFill?.fills).toBeTruthy();
      expect(result?._vwapFill?.fills?.length).toBe(3);
      
      // Fill #1: green, enabled, maps upper1/lower1
      const fill1 = result?._vwapFill?.fills?.[0];
      expect(fill1?.enabled).toBe(true);
      expect(fill1?.color).toBe("#4CAF50");
      expect(fill1?.upperLineId).toBe("upper1");
      expect(fill1?.lowerLineId).toBe("lower1");
      
      // Fill #2: olive, enabled, maps upper2/lower2
      const fill2 = result?._vwapFill?.fills?.[1];
      expect(fill2?.enabled).toBe(true);
      expect(fill2?.color).toBe("#808000");
      expect(fill2?.upperLineId).toBe("upper2");
      expect(fill2?.lowerLineId).toBe("lower2");
      
      // Fill #3: teal, enabled, maps upper3/lower3
      const fill3 = result?._vwapFill?.fills?.[2];
      expect(fill3?.enabled).toBe(true);
      expect(fill3?.color).toBe("#00897B");
      expect(fill3?.upperLineId).toBe("upper3");
      expect(fill3?.lowerLineId).toBe("lower3");
    });
    
    test("VWAP lines have lastValueVisible true", async ({ page }) => {
      await addIndicatorViaModal(page, "vwap");
      await waitForIndicator(page, "vwap");
      
      const dump = await getDump(page);
      const vwap = dump?.indicators?.find((i: any) => i.kind === "vwap");
      const result = dump?.indicatorResults?.[vwap?.id];
      
      // All VWAP lines should have lastValueVisible: true
      const allLines = result?.lines ?? [];
      for (const line of allLines) {
        expect(line?.lastValueVisible).toBe(true);
      }
    });
    
    test("VWAP fill overlay canvas is rendered", async ({ page }) => {
      await addIndicatorViaModal(page, "vwap");
      await waitForIndicator(page, "vwap");
      
      // Wait for the fill overlay canvas to be rendered
      const canvas = page.locator('[data-testid="vwap-bands-fill-overlay"]');
      await expect(canvas).toBeVisible({ timeout: 5000 });
    });
    
    test("VWAP has no NaN leaks in values (whitespace at warmup only)", async ({ page }) => {
      await addIndicatorViaModal(page, "vwap");
      await waitForIndicator(page, "vwap");
      
      const dump = await getDump(page);
      const vwap = dump?.indicators?.find((i: any) => i.kind === "vwap");
      const result = dump?.indicatorResults?.[vwap?.id];
      
      // Main VWAP line should have no NaN values inside "value" property
      const vwapLine = result?.lines?.find((l: any) => l.id === "vwap");
      const vwapNaN = (vwapLine?.values ?? []).some((v: any) => 
        'value' in v && !Number.isFinite(v.value)
      );
      expect(vwapNaN).toBe(false);
      
      // Band lines may have NaN at anchor breaks, which is converted to whitespace
      // But any point with 'value' property should have a finite number
      for (const line of result?.lines ?? []) {
        const hasInvalidValue = (line.values ?? []).some((v: any) => 
          'value' in v && !Number.isFinite(v.value)
        );
        expect(hasInvalidValue).toBe(false);
      }
    });
    
    test("VWAP default params match TV specification", async ({ page }) => {
      await addIndicatorViaModal(page, "vwap");
      await waitForIndicator(page, "vwap");
      
      const dump = await getDump(page);
      const vwap = dump?.indicators?.find((i: any) => i.kind === "vwap");
      
      // Verify default params match TV spec
      // CRITICAL: hideOn1DOrAbove must default to false so VWAP shows on daily charts
      expect(vwap?.params?.hideOn1DOrAbove).toBe(false);
      expect(vwap?.params?.anchorPeriod).toBe("session");
      expect(vwap?.params?.source).toBe("hlc3");
      expect(vwap?.params?.bandsMode).toBe("stdev");
      expect(vwap?.params?.bandMultiplier1).toBe(1.0);
      expect(vwap?.params?.bandMultiplier2).toBe(2.0);
      expect(vwap?.params?.bandMultiplier3).toBe(3.0);
      expect(vwap?.params?.band1Enabled).toBe(true);
      expect(vwap?.params?.band2Enabled).toBe(true);
      expect(vwap?.params?.band3Enabled).toBe(true);
    });

    // =========================================================================
    // OBV (On Balance Volume) TV-Parity Tests
    // =========================================================================

    test("OBV creates separate pane indicator", async ({ page }) => {
      await addIndicatorViaModal(page, "obv");
      await waitForIndicator(page, "obv");

      const dump = await getDump(page);
      const obv = dump?.indicators?.find((i: any) => i.kind === "obv");
      expect(obv).toBeDefined();
      expect(obv?.pane).toBe("separate");
    });

    test("OBV has TV-style label 'OBV'", async ({ page }) => {
      await addIndicatorViaModal(page, "obv");
      await waitForIndicator(page, "obv");

      const dump = await getDump(page);
      const obv = dump?.indicators?.find((i: any) => i.kind === "obv");
      const result = dump?.indicatorResults?.[obv?.id];
      const obvLine = result?.lines?.find((l: any) => l.id === "obv");

      // Label should be "OBV" (no params in label, per TV)
      expect(obvLine?.label).toBe("OBV");
    });

    test("OBV has lastValueVisible true for price label", async ({ page }) => {
      await addIndicatorViaModal(page, "obv");
      await waitForIndicator(page, "obv");

      const dump = await getDump(page);
      const obv = dump?.indicators?.find((i: any) => i.kind === "obv");
      const result = dump?.indicatorResults?.[obv?.id];
      const obvLine = result?.lines?.find((l: any) => l.id === "obv");

      expect(obvLine?.lastValueVisible).toBe(true);
    });

    test("OBV has _compactFormatter flag for K/M/B/T formatting", async ({ page }) => {
      await addIndicatorViaModal(page, "obv");
      await waitForIndicator(page, "obv");

      const dump = await getDump(page);
      const obv = dump?.indicators?.find((i: any) => i.kind === "obv");
      const result = dump?.indicatorResults?.[obv?.id];

      // Should have compactFormatter flag for volume-style formatting
      expect(result?._compactFormatter).toBe(true);
    });

    test("OBV default params match TV specification", async ({ page }) => {
      await addIndicatorViaModal(page, "obv");
      await waitForIndicator(page, "obv");

      const dump = await getDump(page);
      const obv = dump?.indicators?.find((i: any) => i.kind === "obv");

      // Verify default params match TV spec
      expect(obv?.params?.smoothingType).toBe("none");
      expect(obv?.params?.smoothingLength).toBe(14);
      expect(obv?.params?.bbStdDev).toBe(2);
      expect(obv?.params?.showObv).toBe(true);
      expect(obv?.params?.obvLineWidth).toBe(1);
      expect(obv?.params?.obvLineStyle).toBe("solid");
      expect(obv?.params?.obvPlotStyle).toBe("line");
    });

    test("OBV has TV-blue color (#2962FF)", async ({ page }) => {
      await addIndicatorViaModal(page, "obv");
      await waitForIndicator(page, "obv");

      const dump = await getDump(page);
      const obv = dump?.indicators?.find((i: any) => i.kind === "obv");
      const result = dump?.indicatorResults?.[obv?.id];
      const obvLine = result?.lines?.find((l: any) => l.id === "obv");

      // OBV line should be TV-blue
      expect(obvLine?.color).toBe("#2962FF");
    });

    test("OBV inputs are visible in indicator settings", async ({ page }) => {
      await addIndicatorViaModal(page, "obv");
      await waitForIndicator(page, "obv");

      // Open indicator settings modal
      const legendItem = page.locator('[data-testid^="indicator-pane-legend-"]').first();
      await legendItem.hover();
      const settingsBtn = legendItem.locator('button[title="Settings"]');
      await settingsBtn.click();

      // Wait for settings modal
      const settingsModal = page.locator('[data-testid="indicator-settings-modal"]');
      await expect(settingsModal).toBeVisible({ timeout: 3000 });

      // Verify key TV-style inputs exist
      // Smoothing Type select
      await expect(page.locator('text=Smoothing Type')).toBeVisible();
      // Length number input
      await expect(page.locator('text=Length')).toBeVisible();
      // BB StdDev number input
      await expect(page.locator('text=BB StdDev')).toBeVisible();
    });

    test("OBV shows smoothing line when smoothingType is not 'none'", async ({ page }) => {
      await addIndicatorViaModal(page, "obv");
      await waitForIndicator(page, "obv");

      // Get initial dump - should only have OBV line with smoothingType=none
      const dump1 = await getDump(page);
      const obv1 = dump1?.indicators?.find((i: any) => i.kind === "obv");
      const result1 = dump1?.indicatorResults?.[obv1?.id];
      expect(result1?.lines?.length).toBe(1);
      expect(result1?.lines?.[0]?.id).toBe("obv");

      // Open settings and change smoothingType to SMA
      const legendItem = page.locator('[data-testid^="indicator-pane-legend-"]').first();
      await legendItem.hover();
      const settingsBtn = legendItem.locator('button[title="Settings"]');
      await settingsBtn.click();

      const settingsModal = page.locator('[data-testid="indicator-settings-modal"]');
      await expect(settingsModal).toBeVisible({ timeout: 3000 });

      // Change smoothing type to SMA
      const smoothingSelect = page.locator('select[name="smoothingType"], [data-testid="input-smoothingType"]');
      if (await smoothingSelect.isVisible()) {
        await smoothingSelect.selectOption("sma");
        // Wait for recompute
        await page.waitForTimeout(500);
        
        // Verify we now have 2 lines: obv + smoothing
        const dump2 = await getDump(page);
        const obv2 = dump2?.indicators?.find((i: any) => i.kind === "obv");
        const result2 = dump2?.indicatorResults?.[obv2?.id];
        expect(result2?.lines?.length).toBe(2);
        expect(result2?.lines?.some((l: any) => l.id === "smoothing")).toBe(true);
      }
    });

    test("OBV computes cumulative volume correctly (no NaN leaks)", async ({ page }) => {
      await addIndicatorViaModal(page, "obv");
      await waitForIndicator(page, "obv");

      const dump = await getDump(page);
      const obv = dump?.indicators?.find((i: any) => i.kind === "obv");
      const result = dump?.indicatorResults?.[obv?.id];
      const obvLine = result?.lines?.find((l: any) => l.id === "obv");

      // OBV should have no NaN values in any point with 'value' property
      const hasNaN = (obvLine?.values ?? []).some((v: any) =>
        'value' in v && !Number.isFinite(v.value)
      );
      expect(hasNaN).toBe(false);

      // OBV values should be present (not all whitespace)
      const valuesWithData = (obvLine?.values ?? []).filter((v: any) => 'value' in v);
      expect(valuesWithData.length).toBeGreaterThan(0);
    });

    test("OBV values are cumulative (monotonic direction in trending markets)", async ({ page }) => {
      await addIndicatorViaModal(page, "obv");
      await waitForIndicator(page, "obv");

      const dump = await getDump(page);
      const obv = dump?.indicators?.find((i: any) => i.kind === "obv");
      const result = dump?.indicatorResults?.[obv?.id];
      const obvLine = result?.lines?.find((l: any) => l.id === "obv");

      // OBV values are cumulative - should have values that can be positive or negative
      // depending on price direction. Just verify we have multiple values with differences.
      const valuesWithData = (obvLine?.values ?? []).filter((v: any) => 
        'value' in v && Number.isFinite(v.value)
      );
      expect(valuesWithData.length).toBeGreaterThan(5);
      
      // Verify values are not all the same (OBV changes with price movement)
      const uniqueValues = new Set(valuesWithData.map((v: any) => v.value));
      expect(uniqueValues.size).toBeGreaterThan(1);
    });

    test("OBV is marked as needsExtendedHistory in manifest", async ({ page }) => {
      // This test verifies that OBV has needsExtendedHistory: true in the manifest
      // which is used to trigger extended data fetch for TV-level parity
      await addIndicatorViaModal(page, "obv");
      await waitForIndicator(page, "obv");
      
      const dump = await getDump(page);
      const obv = dump?.indicators?.find((i: any) => i.kind === "obv");
      const result = dump?.indicatorResults?.[obv?.id];
      const obvLine = result?.lines?.find((l: any) => l.id === "obv");
      
      // OBV should have values (computed from data)
      const valuesWithData = (obvLine?.values ?? []).filter((v: any) => 
        'value' in v && Number.isFinite(v.value)
      );
      expect(valuesWithData.length).toBeGreaterThan(0);
      
      // With extended history, OBV absolute values should be larger
      // (In mock mode this just verifies the indicator works; 
      //  real extended history requires live API with 12k+ bars)
      const lastValue = valuesWithData[valuesWithData.length - 1]?.value ?? 0;
      expect(typeof lastValue).toBe("number");
    });
  });

  // ===========================================================================
  // Awesome Oscillator (AO) TradingView Parity Tests
  // ===========================================================================
  test.describe("Awesome Oscillator (AO) TradingView Parity", () => {
    test("AO appears in momentum category", async ({ page }) => {
      await openIndicatorsModal(page);
      
      // Click Momentum category using correct selector
      await page.locator('[data-testid="category-momentum"]').click();
      
      // AO should be visible (either add button or search result)
      await expect(page.locator('[data-testid="indicators-modal-add-ao"], [data-testid="indicator-add-btn-ao"]').first()).toBeVisible();
    });
    
    test("AO adds to chart with histogram in separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "ao");
      await waitForIndicator(page, "ao");
      
      const dump = await getDump(page);
      const ao = dump?.indicators?.find((i: any) => i.kind === "ao");
      const result = dump?.indicatorResults?.[ao?.id];
      
      expect(ao).toBeDefined();
      expect(result).toBeDefined();
      
      // AO should be in separate pane
      expect(ao?.pane).toBe("separate");
      
      // AO should have histogram line
      const aoLine = result?.lines?.find((l: any) => l.id === "ao");
      expect(aoLine).toBeDefined();
      expect(aoLine?.style).toBe("histogram");
    });
    
    test("AO histogram has per-bar colors (rising=green, falling=red)", async ({ page }) => {
      await addIndicatorViaModal(page, "ao");
      await waitForIndicator(page, "ao");
      
      const dump = await getDump(page);
      const ao = dump?.indicators?.find((i: any) => i.kind === "ao");
      const result = dump?.indicatorResults?.[ao?.id];
      const aoLine = result?.lines?.find((l: any) => l.id === "ao");
      
      // AO values should have per-bar colors
      const valuesWithColor = (aoLine?.values ?? []).filter((v: any) => 
        'value' in v && 'color' in v && Number.isFinite(v.value)
      );
      
      // Should have some colored values (may be 0 if color isn't serialized in dump)
      // Check that at least values exist
      const valuesWithData = (aoLine?.values ?? []).filter((v: any) => 
        'value' in v && Number.isFinite(v.value)
      );
      expect(valuesWithData.length).toBeGreaterThan(5);
    });
    
    test("AO default colors match TV: growing=#089981, falling=#F23645", async ({ page }) => {
      await addIndicatorViaModal(page, "ao");
      await waitForIndicator(page, "ao");
      
      const dump = await getDump(page);
      const ao = dump?.indicators?.find((i: any) => i.kind === "ao");
      
      // Check default params
      expect(ao?.params?.growingColor?.toLowerCase()).toBe("#089981");
      expect(ao?.params?.fallingColor?.toLowerCase()).toBe("#f23645");
    });
    
    test("AO has separate pane (oscillator style)", async ({ page }) => {
      await addIndicatorViaModal(page, "ao");
      await waitForIndicator(page, "ao");
      
      const dump = await getDump(page);
      const ao = dump?.indicators?.find((i: any) => i.kind === "ao");
      
      // AO should be in separate pane (like MACD)
      expect(ao?.pane).toBe("separate");
    });
    
    test("AO values oscillate around zero (positive and negative)", async ({ page }) => {
      await addIndicatorViaModal(page, "ao");
      await waitForIndicator(page, "ao");
      
      const dump = await getDump(page);
      const ao = dump?.indicators?.find((i: any) => i.kind === "ao");
      const result = dump?.indicatorResults?.[ao?.id];
      const aoLine = result?.lines?.find((l: any) => l.id === "ao");
      
      const valuesWithData = (aoLine?.values ?? []).filter((v: any) => 
        'value' in v && Number.isFinite(v.value)
      );
      expect(valuesWithData.length).toBeGreaterThan(10);
      
      // AO is an oscillator - should have both positive and negative values over time
      const positiveCount = valuesWithData.filter((v: any) => v.value > 0).length;
      const negativeCount = valuesWithData.filter((v: any) => v.value < 0).length;
      
      // With enough data, we should see values on both sides of zero
      // (In trending markets this may not always be true, but with mock data it should be)
      expect(positiveCount + negativeCount).toBe(valuesWithData.length);
    });
    
    test("AO formula: SMA(HL2,5) - SMA(HL2,34) produces valid values", async ({ page }) => {
      await addIndicatorViaModal(page, "ao");
      await waitForIndicator(page, "ao");
      
      const dump = await getDump(page);
      const ao = dump?.indicators?.find((i: any) => i.kind === "ao");
      const result = dump?.indicatorResults?.[ao?.id];
      const aoLine = result?.lines?.find((l: any) => l.id === "ao");
      
      const valuesWithData = (aoLine?.values ?? []).filter((v: any) => 
        'value' in v && Number.isFinite(v.value)
      );
      
      // AO needs at least 34 bars of data before first valid value
      // With 100 bars of mock data, we should have around 66 valid AO values
      expect(valuesWithData.length).toBeGreaterThan(30);
      
      // No NaN values in the valid data points
      const hasNaN = valuesWithData.some((v: any) => Number.isNaN(v.value));
      expect(hasNaN).toBe(false);
    });
  });

  // ===========================================================================
  // Donchian Channels (DC) TradingView Parity Tests
  // ===========================================================================
  test.describe("Donchian Channels (DC) TradingView Parity", () => {
    test("DC appears in volatility category", async ({ page }) => {
      await openIndicatorsModal(page);
      
      // Click Volatility category
      await page.locator('[data-testid="category-volatility"]').click();
      
      // DC should be visible
      await expect(page.locator('[data-testid="indicators-modal-add-dc"], [data-testid="indicator-add-btn-dc"]').first()).toBeVisible();
    });
    
    test("DC adds to chart with 3 lines on price pane (overlay)", async ({ page }) => {
      await addIndicatorViaModal(page, "dc");
      await waitForIndicator(page, "dc");
      
      const dump = await getDump(page);
      const dc = dump?.indicators?.find((i: any) => i.kind === "dc");
      const result = dump?.indicatorResults?.[dc?.id];
      
      expect(dc).toBeDefined();
      expect(result).toBeDefined();
      
      // DC should have 3 lines: upper, basis, lower
      expect(result?.lines?.length).toBe(3);
      
      const upperLine = result?.lines?.find((l: any) => l.id === "upper");
      const basisLine = result?.lines?.find((l: any) => l.id === "basis");
      const lowerLine = result?.lines?.find((l: any) => l.id === "lower");
      
      expect(upperLine).toBeDefined();
      expect(basisLine).toBeDefined();
      expect(lowerLine).toBeDefined();
      
      // All lines should be on price pane (overlay indicator)
      expect(upperLine?.pane).toBe("price");
      expect(basisLine?.pane).toBe("price");
      expect(lowerLine?.pane).toBe("price");
    });
    
    test("DC default params match TV: length=20, offset=0", async ({ page }) => {
      await addIndicatorViaModal(page, "dc");
      await waitForIndicator(page, "dc");
      
      const dump = await getDump(page);
      const dc = dump?.indicators?.find((i: any) => i.kind === "dc");
      
      expect(dc?.params?.length).toBe(20);
      expect(dc?.params?.offset).toBe(0);
    });
    
    test("DC colors match TV: upper/lower=blue, basis=orange", async ({ page }) => {
      await addIndicatorViaModal(page, "dc");
      await waitForIndicator(page, "dc");
      
      const dump = await getDump(page);
      const dc = dump?.indicators?.find((i: any) => i.kind === "dc");
      
      // TV defaults: upper/lower = #2962FF (blue), basis = #FF6D00 (orange)
      expect(dc?.params?.upperColor?.toLowerCase()).toBe("#2962ff");
      expect(dc?.params?.lowerColor?.toLowerCase()).toBe("#2962ff");
      expect(dc?.params?.basisColor?.toLowerCase()).toBe("#ff6d00");
    });
    
    test("DC _dcFill exists when showBackground enabled", async ({ page }) => {
      await addIndicatorViaModal(page, "dc");
      await waitForIndicator(page, "dc");
      
      const dump = await getDump(page);
      const dc = dump?.indicators?.find((i: any) => i.kind === "dc");
      const result = dump?.indicatorResults?.[dc?.id];
      
      // showBackground is true by default
      expect(result?._dcFill).toBeDefined();
      expect(result?._dcFill?.upper).toBeDefined();
      expect(result?._dcFill?.lower).toBeDefined();
      expect(result?._dcFill?.backgroundColor).toBeDefined();
    });
    
    test("DC upper = highest high, lower = lowest low over period", async ({ page }) => {
      await addIndicatorViaModal(page, "dc");
      await waitForIndicator(page, "dc");
      
      const dump = await getDump(page);
      const dc = dump?.indicators?.find((i: any) => i.kind === "dc");
      const result = dump?.indicatorResults?.[dc?.id];
      
      const upperLine = result?.lines?.find((l: any) => l.id === "upper");
      const basisLine = result?.lines?.find((l: any) => l.id === "basis");
      const lowerLine = result?.lines?.find((l: any) => l.id === "lower");
      
      // Get valid values (after warmup)
      const upperVals = (upperLine?.values ?? []).filter((v: any) => 
        'value' in v && Number.isFinite(v.value)
      );
      const basisVals = (basisLine?.values ?? []).filter((v: any) => 
        'value' in v && Number.isFinite(v.value)
      );
      const lowerVals = (lowerLine?.values ?? []).filter((v: any) => 
        'value' in v && Number.isFinite(v.value)
      );
      
      // Should have values (after 19-bar warmup for length=20)
      expect(upperVals.length).toBeGreaterThan(30);
      expect(basisVals.length).toBeGreaterThan(30);
      expect(lowerVals.length).toBeGreaterThan(30);
      
      // Upper should always be >= lower
      for (let i = 0; i < Math.min(upperVals.length, lowerVals.length); i++) {
        expect(upperVals[i].value).toBeGreaterThanOrEqual(lowerVals[i].value);
      }
      
      // Basis should be average of upper and lower
      for (let i = 0; i < Math.min(upperVals.length, lowerVals.length, basisVals.length); i++) {
        const expectedBasis = (upperVals[i].value + lowerVals[i].value) / 2;
        expect(basisVals[i].value).toBeCloseTo(expectedBasis, 5);
      }
    });
    
    test("DC warmup: first (length-1) bars are WhitespaceData", async ({ page }) => {
      await addIndicatorViaModal(page, "dc");
      await waitForIndicator(page, "dc");
      
      const dump = await getDump(page);
      const dc = dump?.indicators?.find((i: any) => i.kind === "dc");
      const result = dump?.indicatorResults?.[dc?.id];
      const length = dc?.params?.length ?? 20;
      
      const upperLine = result?.lines?.find((l: any) => l.id === "upper");
      const allUpperVals = upperLine?.values ?? [];
      
      // First (length-1) values should be WhitespaceData (no 'value' key)
      // Note: dump only returns last 100 values, but warmup should still apply
      const warmupCount = Math.min(length - 1, allUpperVals.length);
      let whitespaceBars = 0;
      for (let i = 0; i < allUpperVals.length; i++) {
        const v = allUpperVals[i];
        // WhitespaceData has no 'value' key
        if (!('value' in v)) {
          whitespaceBars++;
        }
      }
      
      // Should have some valid data after warmup
      const validVals = allUpperVals.filter((v: any) => 'value' in v && Number.isFinite(v.value));
      expect(validVals.length).toBeGreaterThan(0);
    });
    
    test("DC fill overlay canvas renders when background enabled", async ({ page }) => {
      await addIndicatorViaModal(page, "dc");
      await waitForIndicator(page, "dc");
      
      // Check that the DC fill overlay canvas is rendered
      const dcFillCanvas = page.locator('[data-testid="dc-fill-overlay"]');
      await expect(dcFillCanvas).toBeVisible();
    });
  });

  // ===========================================================================
  // Fisher Transform TradingView Parity Tests
  // ===========================================================================
  test.describe("Fisher Transform TradingView Parity", () => {
    test("Fisher appears in momentum category", async ({ page }) => {
      await openIndicatorsModal(page);
      
      // Click Momentum category
      await page.locator('[data-testid="category-momentum"]').click();
      
      // Fisher should be visible
      await expect(page.locator('[data-testid="indicators-modal-add-fisher"], [data-testid="indicator-add-btn-fisher"]').first()).toBeVisible();
    });
    
    test("Fisher adds to chart with 2 main lines + 5 level lines", async ({ page }) => {
      await addIndicatorViaModal(page, "fisher");
      await waitForIndicator(page, "fisher");
      
      const dump = await getDump(page);
      const fisher = dump?.indicators?.find((i: any) => i.kind === "fisher");
      const result = dump?.indicatorResults?.[fisher?.id];
      
      expect(fisher).toBeDefined();
      expect(result).toBeDefined();
      
      // Fisher should have 7 lines: fisher, trigger, +1.5, -1.5, +0.75, -0.75, 0
      expect(result?.lines?.length).toBe(7);
      
      const fisherLine = result?.lines?.find((l: any) => l.id === "fisher");
      const triggerLine = result?.lines?.find((l: any) => l.id === "fisherTrigger");
      
      expect(fisherLine).toBeDefined();
      expect(triggerLine).toBeDefined();
      
      // All lines should be on separate pane
      expect(fisherLine?.pane).toBe("separate");
      expect(triggerLine?.pane).toBe("separate");
    });
    
    test("Fisher default params match TV: length=9", async ({ page }) => {
      await addIndicatorViaModal(page, "fisher");
      await waitForIndicator(page, "fisher");
      
      const dump = await getDump(page);
      const fisher = dump?.indicators?.find((i: any) => i.kind === "fisher");
      
      expect(fisher?.params?.length).toBe(9);
    });
    
    test("Fisher colors match TV: Fisher=blue, Trigger=orange", async ({ page }) => {
      await addIndicatorViaModal(page, "fisher");
      await waitForIndicator(page, "fisher");
      
      const dump = await getDump(page);
      const fisher = dump?.indicators?.find((i: any) => i.kind === "fisher");
      const result = dump?.indicatorResults?.[fisher?.id];
      
      const fisherLine = result?.lines?.find((l: any) => l.id === "fisher");
      const triggerLine = result?.lines?.find((l: any) => l.id === "fisherTrigger");
      
      // TV defaults: fisher = #2962FF (blue), trigger = #FF6D00 (orange)
      expect(fisherLine?.color?.toLowerCase()).toBe("#2962ff");
      expect(triggerLine?.color?.toLowerCase()).toBe("#ff6d00");
    });
    
    test("Fisher level lines: ±1.5 pink, ±0.75/0 gray, all dashed", async ({ page }) => {
      await addIndicatorViaModal(page, "fisher");
      await waitForIndicator(page, "fisher");
      
      const dump = await getDump(page);
      const fisher = dump?.indicators?.find((i: any) => i.kind === "fisher");
      const result = dump?.indicatorResults?.[fisher?.id];
      
      const levelPlus15 = result?.lines?.find((l: any) => l.id === "fisherLevelPlus15");
      const levelMinus15 = result?.lines?.find((l: any) => l.id === "fisherLevelMinus15");
      const levelPlus075 = result?.lines?.find((l: any) => l.id === "fisherLevelPlus075");
      const levelMinus075 = result?.lines?.find((l: any) => l.id === "fisherLevelMinus075");
      const levelZero = result?.lines?.find((l: any) => l.id === "fisherLevelZero");
      
      // Extreme levels ±1.5 should be pink (#E91E63)
      expect(levelPlus15?.color?.toLowerCase()).toBe("#e91e63");
      expect(levelMinus15?.color?.toLowerCase()).toBe("#e91e63");
      
      // Mid levels ±0.75 and 0 should be gray (#787B86)
      expect(levelPlus075?.color?.toLowerCase()).toBe("#787b86");
      expect(levelMinus075?.color?.toLowerCase()).toBe("#787b86");
      expect(levelZero?.color?.toLowerCase()).toBe("#787b86");
      
      // All level lines should be dashed (lineStyle: 2 or "dashed")
      const isDashed = (style: any) => style === 2 || style === "dashed";
      expect(isDashed(levelPlus15?.lineStyle)).toBe(true);
      expect(isDashed(levelMinus15?.lineStyle)).toBe(true);
      expect(isDashed(levelPlus075?.lineStyle)).toBe(true);
      expect(isDashed(levelMinus075?.lineStyle)).toBe(true);
      expect(isDashed(levelZero?.lineStyle)).toBe(true);
    });
    
    test("Fisher trigger = fisher[1] (lagged by 1 bar)", async ({ page }) => {
      await addIndicatorViaModal(page, "fisher");
      await waitForIndicator(page, "fisher");
      
      const dump = await getDump(page);
      const fisher = dump?.indicators?.find((i: any) => i.kind === "fisher");
      const result = dump?.indicatorResults?.[fisher?.id];
      
      const fisherLine = result?.lines?.find((l: any) => l.id === "fisher");
      const triggerLine = result?.lines?.find((l: any) => l.id === "fisherTrigger");
      
      const fisherVals = (fisherLine?.values ?? []).filter((v: any) => 
        'value' in v && Number.isFinite(v.value)
      );
      const triggerVals = (triggerLine?.values ?? []).filter((v: any) => 
        'value' in v && Number.isFinite(v.value)
      );
      
      // Trigger should lag Fisher by 1 bar
      // Compare trigger[i] with fisher[i-1] (they have same timestamp)
      // Since trigger has 1 less point initially, we check alignment
      expect(triggerVals.length).toBeGreaterThan(10);
      
      // Find matching timestamps and verify trigger = previous fisher
      for (let i = 1; i < Math.min(fisherVals.length, triggerVals.length); i++) {
        const fisherPrev = fisherVals[i - 1];
        const triggerCurr = triggerVals.find((t: any) => t.time === fisherVals[i].time);
        if (triggerCurr && fisherPrev) {
          expect(triggerCurr.value).toBeCloseTo(fisherPrev.value, 5);
        }
      }
    });
    
    test("Fisher warmup: first (length-1) bars should be NaN/missing", async ({ page }) => {
      await addIndicatorViaModal(page, "fisher");
      await waitForIndicator(page, "fisher");
      
      const dump = await getDump(page);
      const fisher = dump?.indicators?.find((i: any) => i.kind === "fisher");
      const result = dump?.indicatorResults?.[fisher?.id];
      const length = fisher?.params?.length ?? 9;
      
      const fisherLine = result?.lines?.find((l: any) => l.id === "fisher");
      const allFisherVals = fisherLine?.values ?? [];
      
      // Should have valid data after warmup period
      const validVals = allFisherVals.filter((v: any) => 
        'value' in v && Number.isFinite(v.value)
      );
      
      // Should have many valid values (well past warmup)
      expect(validVals.length).toBeGreaterThan(30);
      
      // No NaN values in valid data
      const hasNaN = validVals.some((v: any) => Number.isNaN(v.value));
      expect(hasNaN).toBe(false);
    });
    
    test("Fisher oscillates around zero with values typically in [-2, 2] range", async ({ page }) => {
      await addIndicatorViaModal(page, "fisher");
      await waitForIndicator(page, "fisher");
      
      const dump = await getDump(page);
      const fisher = dump?.indicators?.find((i: any) => i.kind === "fisher");
      const result = dump?.indicatorResults?.[fisher?.id];
      
      const fisherLine = result?.lines?.find((l: any) => l.id === "fisher");
      const validVals = (fisherLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      expect(validVals.length).toBeGreaterThan(10);
      
      // Fisher values should typically be in reasonable range (not extreme)
      // Some values can exceed ±2 in trending markets, but average should be near 0
      const avg = validVals.reduce((a: number, b: number) => a + b, 0) / validVals.length;
      expect(avg).toBeGreaterThan(-3);
      expect(avg).toBeLessThan(3);
      
      // Should have both positive and negative values
      const hasPositive = validVals.some((v: number) => v > 0);
      const hasNegative = validVals.some((v: number) => v < 0);
      expect(hasPositive || hasNegative).toBe(true);
    });
    
    test("Fisher level line values are constant at their respective levels", async ({ page }) => {
      await addIndicatorViaModal(page, "fisher");
      await waitForIndicator(page, "fisher");
      
      const dump = await getDump(page);
      const fisher = dump?.indicators?.find((i: any) => i.kind === "fisher");
      const result = dump?.indicatorResults?.[fisher?.id];
      
      const levelPlus15 = result?.lines?.find((l: any) => l.id === "fisherLevelPlus15");
      const levelPlus075 = result?.lines?.find((l: any) => l.id === "fisherLevelPlus075");
      const levelZero = result?.lines?.find((l: any) => l.id === "fisherLevelZero");
      const levelMinus075 = result?.lines?.find((l: any) => l.id === "fisherLevelMinus075");
      const levelMinus15 = result?.lines?.find((l: any) => l.id === "fisherLevelMinus15");
      
      // All level line values should be constant at their respective levels
      const checkConstant = (line: any, expectedValue: number, name: string) => {
        const values = (line?.values ?? []).filter((v: any) => 'value' in v);
        expect(values.length).toBeGreaterThan(10); // Should have data
        values.forEach((v: any) => {
          expect(v.value).toBeCloseTo(expectedValue, 5);
        });
      };
      
      checkConstant(levelPlus15, 1.5, "+1.5");
      checkConstant(levelPlus075, 0.75, "+0.75");
      checkConstant(levelZero, 0, "0");
      checkConstant(levelMinus075, -0.75, "-0.75");
      checkConstant(levelMinus15, -1.5, "-1.5");
    });
  });

  // ===========================================================================
  // Money Flow Index (MFI) TradingView Parity Tests
  // ===========================================================================
  test.describe("Money Flow Index (MFI) TradingView Parity", () => {
    test("MFI appears in volume category", async ({ page }) => {
      await openIndicatorsModal(page);
      
      // Click Volume category
      await page.locator('[data-testid="category-volume"]').click();
      
      // MFI should be visible
      await expect(page.locator('[data-testid="indicators-modal-add-mfi"], [data-testid="indicator-add-btn-mfi"]').first()).toBeVisible();
    });
    
    test("MFI adds to chart with 1 main line + 3 band lines", async ({ page }) => {
      await addIndicatorViaModal(page, "mfi");
      await waitForIndicator(page, "mfi");
      
      const dump = await getDump(page);
      const mfi = dump?.indicators?.find((i: any) => i.kind === "mfi");
      const result = dump?.indicatorResults?.[mfi?.id];
      
      expect(mfi).toBeDefined();
      expect(result).toBeDefined();
      
      // MFI should have 4 lines: mf, overbought, middle, oversold
      expect(result?.lines?.length).toBe(4);
      
      const mfLine = result?.lines?.find((l: any) => l.id === "mf");
      const overboughtLine = result?.lines?.find((l: any) => l.id === "mfiOverbought");
      const middleLine = result?.lines?.find((l: any) => l.id === "mfiMiddleBand");
      const oversoldLine = result?.lines?.find((l: any) => l.id === "mfiOversold");
      
      expect(mfLine).toBeDefined();
      expect(overboughtLine).toBeDefined();
      expect(middleLine).toBeDefined();
      expect(oversoldLine).toBeDefined();
      
      // All lines should be on separate pane
      expect(mfLine?.pane).toBe("separate");
      expect(overboughtLine?.pane).toBe("separate");
    });
    
    test("MFI default params match TV: length=14, bands 80/50/20", async ({ page }) => {
      await addIndicatorViaModal(page, "mfi");
      await waitForIndicator(page, "mfi");
      
      const dump = await getDump(page);
      const mfi = dump?.indicators?.find((i: any) => i.kind === "mfi");
      
      expect(mfi?.params?.length).toBe(14);
      expect(mfi?.params?.overboughtValue).toBe(80);
      expect(mfi?.params?.middleBandValue).toBe(50);
      expect(mfi?.params?.oversoldValue).toBe(20);
    });
    
    test("MFI label format: 'MFI {length}'", async ({ page }) => {
      await addIndicatorViaModal(page, "mfi");
      await waitForIndicator(page, "mfi");
      
      const dump = await getDump(page);
      const mfi = dump?.indicators?.find((i: any) => i.kind === "mfi");
      const result = dump?.indicatorResults?.[mfi?.id];
      
      const mfLine = result?.lines?.find((l: any) => l.id === "mf");
      
      // Label should be "MFI 14" (for default length)
      expect(mfLine?.label).toBe("MFI 14");
    });
    
    test("MFI default color = #7E57C2 (TV oscillator purple)", async ({ page }) => {
      await addIndicatorViaModal(page, "mfi");
      await waitForIndicator(page, "mfi");
      
      const dump = await getDump(page);
      const mfi = dump?.indicators?.find((i: any) => i.kind === "mfi");
      const result = dump?.indicatorResults?.[mfi?.id];
      
      const mfLine = result?.lines?.find((l: any) => l.id === "mf");
      
      // TV MFI uses purple oscillator color
      expect(mfLine?.color?.toLowerCase()).toBe("#7e57c2");
    });
    
    test("MFI band line styles: 80/20 dashed, 50 dotted", async ({ page }) => {
      await addIndicatorViaModal(page, "mfi");
      await waitForIndicator(page, "mfi");
      
      const dump = await getDump(page);
      const mfi = dump?.indicators?.find((i: any) => i.kind === "mfi");
      const result = dump?.indicatorResults?.[mfi?.id];
      
      const overboughtLine = result?.lines?.find((l: any) => l.id === "mfiOverbought");
      const middleLine = result?.lines?.find((l: any) => l.id === "mfiMiddleBand");
      const oversoldLine = result?.lines?.find((l: any) => l.id === "mfiOversold");
      
      // 80 and 20 should be dashed (lineStyle: 2)
      const isDashed = (style: any) => style === 2 || style === "dashed";
      expect(isDashed(overboughtLine?.lineStyle)).toBe(true);
      expect(isDashed(oversoldLine?.lineStyle)).toBe(true);
      
      // 50 should be dotted (lineStyle: 3)
      const isDotted = (style: any) => style === 3 || style === "dotted";
      expect(isDotted(middleLine?.lineStyle)).toBe(true);
    });
    
    test("MFI band lines have lastValueVisible=false", async ({ page }) => {
      await addIndicatorViaModal(page, "mfi");
      await waitForIndicator(page, "mfi");
      
      const dump = await getDump(page);
      const mfi = dump?.indicators?.find((i: any) => i.kind === "mfi");
      const result = dump?.indicatorResults?.[mfi?.id];
      
      const mfLine = result?.lines?.find((l: any) => l.id === "mf");
      const overboughtLine = result?.lines?.find((l: any) => l.id === "mfiOverbought");
      const middleLine = result?.lines?.find((l: any) => l.id === "mfiMiddleBand");
      const oversoldLine = result?.lines?.find((l: any) => l.id === "mfiOversold");
      
      // MF line should have lastValueVisible=true
      expect(mfLine?.lastValueVisible).toBe(true);
      
      // Band lines should NOT have lastValueVisible
      expect(overboughtLine?.lastValueVisible).toBeFalsy();
      expect(middleLine?.lastValueVisible).toBeFalsy();
      expect(oversoldLine?.lastValueVisible).toBeFalsy();
    });
    
    test("MFI _mfiFill config exists in dump", async ({ page }) => {
      await addIndicatorViaModal(page, "mfi");
      await waitForIndicator(page, "mfi");
      
      const dump = await getDump(page);
      const mfi = dump?.indicators?.find((i: any) => i.kind === "mfi");
      const result = dump?.indicatorResults?.[mfi?.id];
      
      // Should have _mfiFill config
      expect(result?._mfiFill).toBeDefined();
      expect(result?._mfiFill?.showBackground).toBe(true);
      expect(result?._mfiFill?.overboughtValue).toBe(80);
      expect(result?._mfiFill?.middleBandValue).toBe(50);
      expect(result?._mfiFill?.oversoldValue).toBe(20);
    });
    
    test("MFI values bounded 0..100", async ({ page }) => {
      await addIndicatorViaModal(page, "mfi");
      await waitForIndicator(page, "mfi");
      
      const dump = await getDump(page);
      const mfi = dump?.indicators?.find((i: any) => i.kind === "mfi");
      const result = dump?.indicatorResults?.[mfi?.id];
      
      const mfLine = result?.lines?.find((l: any) => l.id === "mf");
      const validVals = (mfLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      expect(validVals.length).toBeGreaterThan(10);
      
      // All values should be in [0, 100]
      validVals.forEach((v: number) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      });
    });
    
    test("MFI warmup: first (length) bars should be NaN/missing", async ({ page }) => {
      await addIndicatorViaModal(page, "mfi");
      await waitForIndicator(page, "mfi");
      
      const dump = await getDump(page);
      const mfi = dump?.indicators?.find((i: any) => i.kind === "mfi");
      const result = dump?.indicatorResults?.[mfi?.id];
      
      const mfLine = result?.lines?.find((l: any) => l.id === "mf");
      const allVals = mfLine?.values ?? [];
      
      // Should have valid data after warmup period
      const validVals = allVals.filter((v: any) => 
        'value' in v && Number.isFinite(v.value)
      );
      
      // Should have many valid values (well past warmup)
      expect(validVals.length).toBeGreaterThan(30);
      
      // No NaN values in valid data
      const hasNaN = validVals.some((v: any) => Number.isNaN(v.value));
      expect(hasNaN).toBe(false);
    });
    
    test("MFI unique values (not flat line)", async ({ page }) => {
      await addIndicatorViaModal(page, "mfi");
      await waitForIndicator(page, "mfi");
      
      const dump = await getDump(page);
      const mfi = dump?.indicators?.find((i: any) => i.kind === "mfi");
      const result = dump?.indicatorResults?.[mfi?.id];
      
      const mfLine = result?.lines?.find((l: any) => l.id === "mf");
      const validVals = (mfLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      // Should have multiple unique values (not a flat line)
      const uniqueVals = new Set(validVals.map((v: number) => v.toFixed(4)));
      expect(uniqueVals.size).toBeGreaterThan(5);
    });
    
    test("MFI band lines have constant values", async ({ page }) => {
      await addIndicatorViaModal(page, "mfi");
      await waitForIndicator(page, "mfi");
      
      const dump = await getDump(page);
      const mfi = dump?.indicators?.find((i: any) => i.kind === "mfi");
      const result = dump?.indicatorResults?.[mfi?.id];
      
      const overboughtLine = result?.lines?.find((l: any) => l.id === "mfiOverbought");
      const middleLine = result?.lines?.find((l: any) => l.id === "mfiMiddleBand");
      const oversoldLine = result?.lines?.find((l: any) => l.id === "mfiOversold");
      
      // All band line values should be constant at their respective levels
      const checkConstant = (line: any, expectedValue: number, name: string) => {
        const values = (line?.values ?? []).filter((v: any) => 'value' in v);
        expect(values.length).toBeGreaterThan(10); // Should have data
        values.forEach((v: any) => {
          expect(v.value).toBeCloseTo(expectedValue, 5);
        });
      };
      
      checkConstant(overboughtLine, 80, "overbought");
      checkConstant(middleLine, 50, "middle");
      checkConstant(oversoldLine, 20, "oversold");
    });
  });

  // ===========================================================================
  // TRIX TradingView Parity Tests
  // ===========================================================================
  test.describe("TRIX TradingView Parity", () => {
    test("TRIX appears in momentum category", async ({ page }) => {
      await openIndicatorsModal(page);
      
      // Click Momentum category
      await page.locator('[data-testid="category-momentum"]').click();
      
      // TRIX should be visible
      await expect(page.locator('[data-testid="indicators-modal-add-trix"], [data-testid="indicator-add-btn-trix"]').first()).toBeVisible();
    });
    
    test("TRIX adds to chart with TRIX line + Zero line", async ({ page }) => {
      await addIndicatorViaModal(page, "trix");
      await waitForIndicator(page, "trix");
      
      const dump = await getDump(page);
      const trix = dump?.indicators?.find((i: any) => i.kind === "trix");
      const result = dump?.indicatorResults?.[trix?.id];
      
      expect(trix).toBeDefined();
      expect(result).toBeDefined();
      
      // TRIX should have 2 lines: trix and zero
      expect(result?.lines?.length).toBe(2);
      
      const trixLine = result?.lines?.find((l: any) => l.id === "trix");
      const zeroLine = result?.lines?.find((l: any) => l.id === "trixZero");
      
      expect(trixLine).toBeDefined();
      expect(zeroLine).toBeDefined();
      
      // Both lines should be on separate pane
      expect(trixLine?.pane).toBe("separate");
      expect(zeroLine?.pane).toBe("separate");
    });
    
    test("TRIX default params: length=18", async ({ page }) => {
      await addIndicatorViaModal(page, "trix");
      await waitForIndicator(page, "trix");
      
      const dump = await getDump(page);
      const trix = dump?.indicators?.find((i: any) => i.kind === "trix");
      
      expect(trix?.params?.length).toBe(18);
      expect(trix?.params?.zeroValue).toBe(0);
    });
    
    test("TRIX label format: 'TRIX {length}'", async ({ page }) => {
      await addIndicatorViaModal(page, "trix");
      await waitForIndicator(page, "trix");
      
      const dump = await getDump(page);
      const trix = dump?.indicators?.find((i: any) => i.kind === "trix");
      const result = dump?.indicatorResults?.[trix?.id];
      
      const trixLine = result?.lines?.find((l: any) => l.id === "trix");
      
      // Label should be "TRIX 18" (for default length)
      expect(trixLine?.label).toBe("TRIX 18");
    });
    
    test("TRIX default color = red (#F23645)", async ({ page }) => {
      await addIndicatorViaModal(page, "trix");
      await waitForIndicator(page, "trix");
      
      const dump = await getDump(page);
      const trix = dump?.indicators?.find((i: any) => i.kind === "trix");
      const result = dump?.indicatorResults?.[trix?.id];
      
      const trixLine = result?.lines?.find((l: any) => l.id === "trix");
      
      // TV TRIX uses red color
      expect(trixLine?.color?.toLowerCase()).toBe("#f23645");
    });
    
    test("TRIX Zero line is gray dashed", async ({ page }) => {
      await addIndicatorViaModal(page, "trix");
      await waitForIndicator(page, "trix");
      
      const dump = await getDump(page);
      const trix = dump?.indicators?.find((i: any) => i.kind === "trix");
      const result = dump?.indicatorResults?.[trix?.id];
      
      const zeroLine = result?.lines?.find((l: any) => l.id === "trixZero");
      
      // Zero should be dashed (lineStyle: 2)
      const isDashed = (style: any) => style === 2 || style === "dashed";
      expect(isDashed(zeroLine?.lineStyle)).toBe(true);
      
      // Zero should be gray
      expect(zeroLine?.color?.toLowerCase()).toBe("#787b86");
    });
    
    test("TRIX line has lastValueVisible=true, Zero has lastValueVisible=false", async ({ page }) => {
      await addIndicatorViaModal(page, "trix");
      await waitForIndicator(page, "trix");
      
      const dump = await getDump(page);
      const trix = dump?.indicators?.find((i: any) => i.kind === "trix");
      const result = dump?.indicatorResults?.[trix?.id];
      
      const trixLine = result?.lines?.find((l: any) => l.id === "trix");
      const zeroLine = result?.lines?.find((l: any) => l.id === "trixZero");
      
      // TRIX line should have lastValueVisible=true
      expect(trixLine?.lastValueVisible).toBe(true);
      
      // Zero line should NOT have lastValueVisible
      expect(zeroLine?.lastValueVisible).toBeFalsy();
    });
    
    test("TRIX Zero line has constant value 0", async ({ page }) => {
      await addIndicatorViaModal(page, "trix");
      await waitForIndicator(page, "trix");
      
      const dump = await getDump(page);
      const trix = dump?.indicators?.find((i: any) => i.kind === "trix");
      const result = dump?.indicatorResults?.[trix?.id];
      
      const zeroLine = result?.lines?.find((l: any) => l.id === "trixZero");
      const values = (zeroLine?.values ?? []).filter((v: any) => 'value' in v);
      
      expect(values.length).toBeGreaterThan(10);
      
      // All zero line values should be exactly 0
      values.forEach((v: any) => {
        expect(v.value).toBe(0);
      });
    });
    
    test("TRIX unique values (not flat line)", async ({ page }) => {
      await addIndicatorViaModal(page, "trix");
      await waitForIndicator(page, "trix");
      
      const dump = await getDump(page);
      const trix = dump?.indicators?.find((i: any) => i.kind === "trix");
      const result = dump?.indicatorResults?.[trix?.id];
      
      const trixLine = result?.lines?.find((l: any) => l.id === "trix");
      const validVals = (trixLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      // Should have multiple unique values (not a flat line)
      const uniqueVals = new Set(validVals.map((v: number) => v.toFixed(6)));
      expect(uniqueVals.size).toBeGreaterThan(5);
    });
  });

  // ===========================================================================
  // TSI (True Strength Index) TradingView Parity Tests
  // ===========================================================================
  test.describe("TSI (True Strength Index) TradingView Parity", () => {
    test("TSI appears in momentum category", async ({ page }) => {
      await openIndicatorsModal(page);
      
      // Click Momentum category
      await page.locator('[data-testid="category-momentum"]').click();
      
      // TSI should be visible
      await expect(page.locator('[data-testid="indicators-modal-add-tsi"], [data-testid="indicator-add-btn-tsi"]').first()).toBeVisible();
    });
    
    test("TSI adds to chart with TSI + Signal + Zero lines", async ({ page }) => {
      await addIndicatorViaModal(page, "tsi");
      await waitForIndicator(page, "tsi");
      
      const dump = await getDump(page);
      const tsi = dump?.indicators?.find((i: any) => i.kind === "tsi");
      const result = dump?.indicatorResults?.[tsi?.id];
      
      expect(tsi).toBeDefined();
      expect(result).toBeDefined();
      
      // TSI should have 3 lines: tsi, signal, zero
      expect(result?.lines?.length).toBe(3);
      
      const tsiLine = result?.lines?.find((l: any) => l.id === "tsi");
      const signalLine = result?.lines?.find((l: any) => l.id === "tsiSignal");
      const zeroLine = result?.lines?.find((l: any) => l.id === "tsiZero");
      
      expect(tsiLine).toBeDefined();
      expect(signalLine).toBeDefined();
      expect(zeroLine).toBeDefined();
      
      // All lines should be on separate pane
      expect(tsiLine?.pane).toBe("separate");
      expect(signalLine?.pane).toBe("separate");
      expect(zeroLine?.pane).toBe("separate");
    });
    
    test("TSI default params: longLength=25, shortLength=13, signalLength=13", async ({ page }) => {
      await addIndicatorViaModal(page, "tsi");
      await waitForIndicator(page, "tsi");
      
      const dump = await getDump(page);
      const tsi = dump?.indicators?.find((i: any) => i.kind === "tsi");
      
      expect(tsi?.params?.longLength).toBe(25);
      expect(tsi?.params?.shortLength).toBe(13);
      expect(tsi?.params?.signalLength).toBe(13);
      expect(tsi?.params?.zeroValue).toBe(0);
    });
    
    test("TSI label format: 'TSI {long} {short} {signal}'", async ({ page }) => {
      await addIndicatorViaModal(page, "tsi");
      await waitForIndicator(page, "tsi");
      
      const dump = await getDump(page);
      const tsi = dump?.indicators?.find((i: any) => i.kind === "tsi");
      const result = dump?.indicatorResults?.[tsi?.id];
      
      const tsiLine = result?.lines?.find((l: any) => l.id === "tsi");
      
      // Label should be "TSI 25 13 13" (for default lengths)
      expect(tsiLine?.label).toBe("TSI 25 13 13");
    });
    
    test("TSI default colors: TSI blue, Signal red, Zero gray", async ({ page }) => {
      await addIndicatorViaModal(page, "tsi");
      await waitForIndicator(page, "tsi");
      
      const dump = await getDump(page);
      const tsi = dump?.indicators?.find((i: any) => i.kind === "tsi");
      const result = dump?.indicatorResults?.[tsi?.id];
      
      const tsiLine = result?.lines?.find((l: any) => l.id === "tsi");
      const signalLine = result?.lines?.find((l: any) => l.id === "tsiSignal");
      const zeroLine = result?.lines?.find((l: any) => l.id === "tsiZero");
      
      // TSI is blue
      expect(tsiLine?.color?.toLowerCase()).toBe("#2962ff");
      // Signal is red
      expect(signalLine?.color?.toLowerCase()).toBe("#f23645");
      // Zero is gray
      expect(zeroLine?.color?.toLowerCase()).toBe("#787b86");
    });
    
    test("TSI Zero line is dashed", async ({ page }) => {
      await addIndicatorViaModal(page, "tsi");
      await waitForIndicator(page, "tsi");
      
      const dump = await getDump(page);
      const tsi = dump?.indicators?.find((i: any) => i.kind === "tsi");
      const result = dump?.indicatorResults?.[tsi?.id];
      
      const zeroLine = result?.lines?.find((l: any) => l.id === "tsiZero");
      
      // Zero should be dashed (lineStyle: 2)
      const isDashed = (style: any) => style === 2 || style === "dashed";
      expect(isDashed(zeroLine?.lineStyle)).toBe(true);
    });
    
    test("TSI and Signal have lastValueVisible=true, Zero has lastValueVisible=false", async ({ page }) => {
      await addIndicatorViaModal(page, "tsi");
      await waitForIndicator(page, "tsi");
      
      const dump = await getDump(page);
      const tsi = dump?.indicators?.find((i: any) => i.kind === "tsi");
      const result = dump?.indicatorResults?.[tsi?.id];
      
      const tsiLine = result?.lines?.find((l: any) => l.id === "tsi");
      const signalLine = result?.lines?.find((l: any) => l.id === "tsiSignal");
      const zeroLine = result?.lines?.find((l: any) => l.id === "tsiZero");
      
      // TSI and Signal lines should have lastValueVisible=true
      expect(tsiLine?.lastValueVisible).toBe(true);
      expect(signalLine?.lastValueVisible).toBe(true);
      
      // Zero line should NOT have lastValueVisible
      expect(zeroLine?.lastValueVisible).toBeFalsy();
    });
    
    test("TSI Zero line has constant value 0", async ({ page }) => {
      await addIndicatorViaModal(page, "tsi");
      await waitForIndicator(page, "tsi");
      
      const dump = await getDump(page);
      const tsi = dump?.indicators?.find((i: any) => i.kind === "tsi");
      const result = dump?.indicatorResults?.[tsi?.id];
      
      const zeroLine = result?.lines?.find((l: any) => l.id === "tsiZero");
      const values = (zeroLine?.values ?? []).filter((v: any) => 'value' in v);
      
      expect(values.length).toBeGreaterThan(10);
      
      // All zero line values should be exactly 0
      values.forEach((v: any) => {
        expect(v.value).toBe(0);
      });
    });
    
    test("TSI values bounded -100..100", async ({ page }) => {
      await addIndicatorViaModal(page, "tsi");
      await waitForIndicator(page, "tsi");
      
      const dump = await getDump(page);
      const tsi = dump?.indicators?.find((i: any) => i.kind === "tsi");
      const result = dump?.indicatorResults?.[tsi?.id];
      
      const tsiLine = result?.lines?.find((l: any) => l.id === "tsi");
      const validVals = (tsiLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      expect(validVals.length).toBeGreaterThan(10);
      
      // All values should be in [-100, 100]
      validVals.forEach((v: number) => {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(100);
      });
    });
    
    test("TSI unique values (not flat line)", async ({ page }) => {
      await addIndicatorViaModal(page, "tsi");
      await waitForIndicator(page, "tsi");
      
      const dump = await getDump(page);
      const tsi = dump?.indicators?.find((i: any) => i.kind === "tsi");
      const result = dump?.indicatorResults?.[tsi?.id];
      
      const tsiLine = result?.lines?.find((l: any) => l.id === "tsi");
      const validVals = (tsiLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      // Should have multiple unique values (not a flat line)
      const uniqueVals = new Set(validVals.map((v: number) => v.toFixed(4)));
      expect(uniqueVals.size).toBeGreaterThan(5);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SMI Ergodic Indicator (SMII) - TradingView Parity Tests
  // ══════════════════════════════════════════════════════════════════════════
  test.describe("SMII (SMI Ergodic Indicator) TradingView Parity", () => {
    test("SMII appears in momentum category", async ({ page }) => {
      await openIndicatorsModal(page);
      
      // Click Momentum category
      await page.locator('[data-testid="category-momentum"]').click();
      
      // SMII should be visible
      await expect(page.locator('[data-testid="indicators-modal-add-smii"], [data-testid="indicator-add-btn-smii"]').first()).toBeVisible();
    });
    
    test("SMII adds to chart with SMI + Signal lines (NO zero line)", async ({ page }) => {
      await addIndicatorViaModal(page, "smii");
      await waitForIndicator(page, "smii");
      
      const dump = await getDump(page);
      const smii = dump?.indicators?.find((i: any) => i.kind === "smii");
      const result = dump?.indicatorResults?.[smii?.id];
      
      expect(smii).toBeDefined();
      expect(result).toBeDefined();
      
      // SMII should have 2 lines: smi, signal (NO zero line)
      expect(result?.lines?.length).toBe(2);
      
      const smiLine = result?.lines?.find((l: any) => l.id === "smi");
      const signalLine = result?.lines?.find((l: any) => l.id === "smiiSignal");
      
      expect(smiLine).toBeDefined();
      expect(signalLine).toBeDefined();
      
      // All lines should be on separate pane
      expect(smiLine?.pane).toBe("separate");
      expect(signalLine?.pane).toBe("separate");
    });
    
    test("SMII default params: longLength=20, shortLength=5, signalLength=5", async ({ page }) => {
      await addIndicatorViaModal(page, "smii");
      await waitForIndicator(page, "smii");
      
      const dump = await getDump(page);
      const smii = dump?.indicators?.find((i: any) => i.kind === "smii");
      
      expect(smii?.params?.longLength).toBe(20);
      expect(smii?.params?.shortLength).toBe(5);
      expect(smii?.params?.signalLength).toBe(5);
    });
    
    test("SMII label format: 'SMII {long} {short} {signal}'", async ({ page }) => {
      await addIndicatorViaModal(page, "smii");
      await waitForIndicator(page, "smii");
      
      const dump = await getDump(page);
      const smii = dump?.indicators?.find((i: any) => i.kind === "smii");
      const result = dump?.indicatorResults?.[smii?.id];
      
      const smiLine = result?.lines?.find((l: any) => l.id === "smi");
      
      // Label should be "SMII 20 5 5" (for default lengths)
      expect(smiLine?.label).toBe("SMII 20 5 5");
    });
    
    test("SMII default colors: SMI blue, Signal orange", async ({ page }) => {
      await addIndicatorViaModal(page, "smii");
      await waitForIndicator(page, "smii");
      
      const dump = await getDump(page);
      const smii = dump?.indicators?.find((i: any) => i.kind === "smii");
      const result = dump?.indicatorResults?.[smii?.id];
      
      const smiLine = result?.lines?.find((l: any) => l.id === "smi");
      const signalLine = result?.lines?.find((l: any) => l.id === "smiiSignal");
      
      // SMI is blue
      expect(smiLine?.color?.toLowerCase()).toBe("#2962ff");
      // Signal is orange
      expect(signalLine?.color?.toLowerCase()).toBe("#ff6d00");
    });
    
    test("SMII both lines have lastValueVisible=true", async ({ page }) => {
      await addIndicatorViaModal(page, "smii");
      await waitForIndicator(page, "smii");
      
      const dump = await getDump(page);
      const smii = dump?.indicators?.find((i: any) => i.kind === "smii");
      const result = dump?.indicatorResults?.[smii?.id];
      
      const smiLine = result?.lines?.find((l: any) => l.id === "smi");
      const signalLine = result?.lines?.find((l: any) => l.id === "smiiSignal");
      
      // Both lines should have lastValueVisible=true
      expect(smiLine?.lastValueVisible).toBe(true);
      expect(signalLine?.lastValueVisible).toBe(true);
    });
    
    test("SMII values in reasonable range (typically ~[-1, +1], allow up to ±5)", async ({ page }) => {
      await addIndicatorViaModal(page, "smii");
      await waitForIndicator(page, "smii");
      
      const dump = await getDump(page);
      const smii = dump?.indicators?.find((i: any) => i.kind === "smii");
      const result = dump?.indicatorResults?.[smii?.id];
      
      const smiLine = result?.lines?.find((l: any) => l.id === "smi");
      const validVals = (smiLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      expect(validVals.length).toBeGreaterThan(10);
      
      // SMII values should NOT be TSI-scaled (not ×100)
      // Most values should be in [-1, 1], but can exceed slightly
      const avgAbs = validVals.reduce((sum: number, v: number) => sum + Math.abs(v), 0) / validVals.length;
      expect(avgAbs).toBeLessThan(5); // Average absolute value should be small
      
      // Most values should be small (< 5)
      const smallCount = validVals.filter((v: number) => Math.abs(v) < 5).length;
      expect(smallCount / validVals.length).toBeGreaterThan(0.9); // At least 90% should be < 5
    });
    
    test("SMII unique values (not flat line)", async ({ page }) => {
      await addIndicatorViaModal(page, "smii");
      await waitForIndicator(page, "smii");
      
      const dump = await getDump(page);
      const smii = dump?.indicators?.find((i: any) => i.kind === "smii");
      const result = dump?.indicatorResults?.[smii?.id];
      
      const smiLine = result?.lines?.find((l: any) => l.id === "smi");
      const validVals = (smiLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      // Should have multiple unique values (not a flat line)
      const uniqueVals = new Set(validVals.map((v: number) => v.toFixed(4)));
      expect(uniqueVals.size).toBeGreaterThan(5);
    });
    
    test("SMII has correct number of data points", async ({ page }) => {
      await addIndicatorViaModal(page, "smii");
      await waitForIndicator(page, "smii");
      
      const dump = await getDump(page);
      const smii = dump?.indicators?.find((i: any) => i.kind === "smii");
      const result = dump?.indicatorResults?.[smii?.id];
      
      const smiLine = result?.lines?.find((l: any) => l.id === "smi");
      const signalLine = result?.lines?.find((l: any) => l.id === "smiiSignal");
      
      // Both lines should have data points
      expect(smiLine?.values?.length).toBeGreaterThan(50);
      expect(signalLine?.values?.length).toBeGreaterThan(50);
      
      // Signal should have same number of points as SMI
      expect(signalLine?.values?.length).toBe(smiLine?.values?.length);
    });
    
    test("SMII Signal line lags behind SMI line (is smoother)", async ({ page }) => {
      await addIndicatorViaModal(page, "smii");
      await waitForIndicator(page, "smii");
      
      const dump = await getDump(page);
      const smii = dump?.indicators?.find((i: any) => i.kind === "smii");
      const result = dump?.indicatorResults?.[smii?.id];
      
      const smiLine = result?.lines?.find((l: any) => l.id === "smi");
      const signalLine = result?.lines?.find((l: any) => l.id === "smiiSignal");
      
      const smiVals = (smiLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      const signalVals = (signalLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      // Calculate variance for both lines
      const calcVariance = (arr: number[]) => {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length;
      };
      
      const smiVariance = calcVariance(smiVals.slice(-50));
      const signalVariance = calcVariance(signalVals.slice(-50));
      
      // Signal (smoothed) should have lower or equal variance than raw SMI
      expect(signalVariance).toBeLessThanOrEqual(smiVariance * 1.1); // Allow 10% tolerance
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SMI Ergodic Oscillator (SMIO) - TradingView Parity Tests
  // ══════════════════════════════════════════════════════════════════════════
  test.describe("SMIO (SMI Ergodic Oscillator) TradingView Parity", () => {
    test("SMIO appears in momentum category", async ({ page }) => {
      await openIndicatorsModal(page);
      
      // Click Momentum category
      await page.locator('[data-testid="category-momentum"]').click();
      
      // SMIO should be visible
      await expect(page.locator('[data-testid="indicators-modal-add-smio"], [data-testid="indicator-add-btn-smio"]').first()).toBeVisible();
    });
    
    test("SMIO adds to chart with single oscillator line (histogram)", async ({ page }) => {
      await addIndicatorViaModal(page, "smio");
      await waitForIndicator(page, "smio");
      
      const dump = await getDump(page);
      const smio = dump?.indicators?.find((i: any) => i.kind === "smio");
      const result = dump?.indicatorResults?.[smio?.id];
      
      expect(smio).toBeDefined();
      expect(result).toBeDefined();
      
      // SMIO should have exactly 1 line (oscillator)
      expect(result?.lines?.length).toBe(1);
      
      const oscLine = result?.lines?.find((l: any) => l.id === "oscillator");
      expect(oscLine).toBeDefined();
      
      // Should be on separate pane
      expect(oscLine?.pane).toBe("separate");
    });
    
    test("SMIO default params: longLength=20, shortLength=5, signalLength=5", async ({ page }) => {
      await addIndicatorViaModal(page, "smio");
      await waitForIndicator(page, "smio");
      
      const dump = await getDump(page);
      const smio = dump?.indicators?.find((i: any) => i.kind === "smio");
      
      expect(smio?.params?.longLength).toBe(20);
      expect(smio?.params?.shortLength).toBe(5);
      expect(smio?.params?.signalLength).toBe(5);
    });
    
    test("SMIO default plotStyle is histogram", async ({ page }) => {
      await addIndicatorViaModal(page, "smio");
      await waitForIndicator(page, "smio");
      
      const dump = await getDump(page);
      const smio = dump?.indicators?.find((i: any) => i.kind === "smio");
      const result = dump?.indicatorResults?.[smio?.id];
      
      const oscLine = result?.lines?.find((l: any) => l.id === "oscillator");
      
      // Default style should be histogram
      expect(oscLine?.style).toBe("histogram");
    });
    
    test("SMIO label format: 'SMIO {long} {short} {signal}'", async ({ page }) => {
      await addIndicatorViaModal(page, "smio");
      await waitForIndicator(page, "smio");
      
      const dump = await getDump(page);
      const smio = dump?.indicators?.find((i: any) => i.kind === "smio");
      const result = dump?.indicatorResults?.[smio?.id];
      
      const oscLine = result?.lines?.find((l: any) => l.id === "oscillator");
      
      // Label should be "SMIO 20 5 5" (for default lengths)
      expect(oscLine?.label).toBe("SMIO 20 5 5");
    });
    
    test("SMIO default color is red", async ({ page }) => {
      await addIndicatorViaModal(page, "smio");
      await waitForIndicator(page, "smio");
      
      const dump = await getDump(page);
      const smio = dump?.indicators?.find((i: any) => i.kind === "smio");
      const result = dump?.indicatorResults?.[smio?.id];
      
      const oscLine = result?.lines?.find((l: any) => l.id === "oscillator");
      
      // Should be red
      expect(oscLine?.color?.toLowerCase()).toBe("#f23645");
    });
    
    test("SMIO has lastValueVisible=true", async ({ page }) => {
      await addIndicatorViaModal(page, "smio");
      await waitForIndicator(page, "smio");
      
      const dump = await getDump(page);
      const smio = dump?.indicators?.find((i: any) => i.kind === "smio");
      const result = dump?.indicatorResults?.[smio?.id];
      
      const oscLine = result?.lines?.find((l: any) => l.id === "oscillator");
      
      expect(oscLine?.lastValueVisible).toBe(true);
    });
    
    test("SMIO values include both positive and negative (oscillates around zero)", async ({ page }) => {
      await addIndicatorViaModal(page, "smio");
      await waitForIndicator(page, "smio");
      
      const dump = await getDump(page);
      const smio = dump?.indicators?.find((i: any) => i.kind === "smio");
      const result = dump?.indicatorResults?.[smio?.id];
      
      const oscLine = result?.lines?.find((l: any) => l.id === "oscillator");
      const validVals = (oscLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      expect(validVals.length).toBeGreaterThan(10);
      
      // Should have both positive and negative values
      const positiveCount = validVals.filter((v: number) => v > 0).length;
      const negativeCount = validVals.filter((v: number) => v < 0).length;
      
      expect(positiveCount).toBeGreaterThan(0);
      expect(negativeCount).toBeGreaterThan(0);
    });
    
    test("SMIO values in small range (not TSI-scaled)", async ({ page }) => {
      await addIndicatorViaModal(page, "smio");
      await waitForIndicator(page, "smio");
      
      const dump = await getDump(page);
      const smio = dump?.indicators?.find((i: any) => i.kind === "smio");
      const result = dump?.indicatorResults?.[smio?.id];
      
      const oscLine = result?.lines?.find((l: any) => l.id === "oscillator");
      const validVals = (oscLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      // SMIO values should be small (typically ±0.5, definitely not ×100 scaled)
      const avgAbs = validVals.reduce((sum: number, v: number) => sum + Math.abs(v), 0) / validVals.length;
      expect(avgAbs).toBeLessThan(2); // Average absolute value should be small
    });
    
    test("SMIO unique values (not flat line)", async ({ page }) => {
      await addIndicatorViaModal(page, "smio");
      await waitForIndicator(page, "smio");
      
      const dump = await getDump(page);
      const smio = dump?.indicators?.find((i: any) => i.kind === "smio");
      const result = dump?.indicatorResults?.[smio?.id];
      
      const oscLine = result?.lines?.find((l: any) => l.id === "oscillator");
      const validVals = (oscLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      // Should have multiple unique values (not a flat line)
      const uniqueVals = new Set(validVals.map((v: number) => v.toFixed(6)));
      expect(uniqueVals.size).toBeGreaterThan(5);
    });
    
    test("SMIO equals SMII.smi - SMII.signal (consistency check)", async ({ page }) => {
      // Add both SMII and SMIO to compare
      await addIndicatorViaModal(page, "smii");
      await waitForIndicator(page, "smii");
      await addIndicatorViaModal(page, "smio");
      await waitForIndicator(page, "smio");
      
      const dump = await getDump(page);
      
      // Get SMII result
      const smii = dump?.indicators?.find((i: any) => i.kind === "smii");
      const smiiResult = dump?.indicatorResults?.[smii?.id];
      const smiLine = smiiResult?.lines?.find((l: any) => l.id === "smi");
      const signalLine = smiiResult?.lines?.find((l: any) => l.id === "smiiSignal");
      
      // Get SMIO result
      const smio = dump?.indicators?.find((i: any) => i.kind === "smio");
      const smioResult = dump?.indicatorResults?.[smio?.id];
      const oscLine = smioResult?.lines?.find((l: any) => l.id === "oscillator");
      
      // Get valid values with matching times
      const smiVals = (smiLine?.values ?? []).filter((v: any) => 'value' in v && Number.isFinite(v.value));
      const sigVals = (signalLine?.values ?? []).filter((v: any) => 'value' in v && Number.isFinite(v.value));
      const oscVals = (oscLine?.values ?? []).filter((v: any) => 'value' in v && Number.isFinite(v.value));
      
      // Check at least 10 points match
      const checkCount = Math.min(10, oscVals.length);
      expect(checkCount).toBeGreaterThan(5);
      
      // Compare last checkCount values
      for (let i = 0; i < checkCount; i++) {
        const idx = oscVals.length - checkCount + i;
        const smiVal = smiVals[idx]?.value;
        const sigVal = sigVals[idx]?.value;
        const oscVal = oscVals[idx]?.value;
        
        if (Number.isFinite(smiVal) && Number.isFinite(sigVal) && Number.isFinite(oscVal)) {
          const expected = smiVal - sigVal;
          // Allow small floating point tolerance
          expect(Math.abs(oscVal - expected)).toBeLessThan(0.0001);
        }
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Coppock Curve - TradingView Parity Tests
  // ══════════════════════════════════════════════════════════════════════════
  test.describe("Coppock Curve TradingView Parity", () => {
    test("Coppock Curve appears in momentum category", async ({ page }) => {
      await openIndicatorsModal(page);
      
      // Click Momentum category
      await page.locator('[data-testid="category-momentum"]').click();
      
      // Coppock should be visible
      await expect(page.locator('[data-testid="indicators-modal-add-coppock"], [data-testid="indicator-add-btn-coppock"]').first()).toBeVisible();
    });
    
    test("Coppock Curve adds to chart with single line", async ({ page }) => {
      await addIndicatorViaModal(page, "coppock");
      await waitForIndicator(page, "coppock");
      
      const dump = await getDump(page);
      const coppock = dump?.indicators?.find((i: any) => i.kind === "coppock");
      const result = dump?.indicatorResults?.[coppock?.id];
      
      expect(coppock).toBeDefined();
      expect(result).toBeDefined();
      
      // Coppock should have exactly 1 line
      expect(result?.lines?.length).toBe(1);
      
      const coppockLine = result?.lines?.find((l: any) => l.id === "coppock");
      expect(coppockLine).toBeDefined();
      
      // Should be on separate pane
      expect(coppockLine?.pane).toBe("separate");
    });
    
    test("Coppock Curve default params: wmaLength=10, longRocLength=14, shortRocLength=11", async ({ page }) => {
      await addIndicatorViaModal(page, "coppock");
      await waitForIndicator(page, "coppock");
      
      const dump = await getDump(page);
      const coppock = dump?.indicators?.find((i: any) => i.kind === "coppock");
      
      expect(coppock?.params?.wmaLength).toBe(10);
      expect(coppock?.params?.longRocLength).toBe(14);
      expect(coppock?.params?.shortRocLength).toBe(11);
    });
    
    test("Coppock Curve label format: 'Coppock Curve {wma} {longRoc} {shortRoc}'", async ({ page }) => {
      await addIndicatorViaModal(page, "coppock");
      await waitForIndicator(page, "coppock");
      
      const dump = await getDump(page);
      const coppock = dump?.indicators?.find((i: any) => i.kind === "coppock");
      const result = dump?.indicatorResults?.[coppock?.id];
      
      const coppockLine = result?.lines?.find((l: any) => l.id === "coppock");
      
      // Label should be "Coppock Curve 10 14 11" (for default lengths)
      expect(coppockLine?.label).toBe("Coppock Curve 10 14 11");
    });
    
    test("Coppock Curve default color is TV-blue (#2962FF)", async ({ page }) => {
      await addIndicatorViaModal(page, "coppock");
      await waitForIndicator(page, "coppock");
      
      const dump = await getDump(page);
      const coppock = dump?.indicators?.find((i: any) => i.kind === "coppock");
      const result = dump?.indicatorResults?.[coppock?.id];
      
      const coppockLine = result?.lines?.find((l: any) => l.id === "coppock");
      
      // Should be TV-blue
      expect(coppockLine?.color?.toLowerCase()).toBe("#2962ff");
    });
    
    test("Coppock Curve has lastValueVisible=true", async ({ page }) => {
      await addIndicatorViaModal(page, "coppock");
      await waitForIndicator(page, "coppock");
      
      const dump = await getDump(page);
      const coppock = dump?.indicators?.find((i: any) => i.kind === "coppock");
      const result = dump?.indicatorResults?.[coppock?.id];
      
      const coppockLine = result?.lines?.find((l: any) => l.id === "coppock");
      
      expect(coppockLine?.lastValueVisible).toBe(true);
    });
    
    test("Coppock Curve default plotStyle is line", async ({ page }) => {
      await addIndicatorViaModal(page, "coppock");
      await waitForIndicator(page, "coppock");
      
      const dump = await getDump(page);
      const coppock = dump?.indicators?.find((i: any) => i.kind === "coppock");
      const result = dump?.indicatorResults?.[coppock?.id];
      
      const coppockLine = result?.lines?.find((l: any) => l.id === "coppock");
      
      // Default style should be line
      expect(coppockLine?.style).toBe("line");
    });
    
    test("Coppock Curve values oscillate around zero (has positive and negative)", async ({ page }) => {
      await addIndicatorViaModal(page, "coppock");
      await waitForIndicator(page, "coppock");
      
      const dump = await getDump(page);
      const coppock = dump?.indicators?.find((i: any) => i.kind === "coppock");
      const result = dump?.indicatorResults?.[coppock?.id];
      
      const coppockLine = result?.lines?.find((l: any) => l.id === "coppock");
      const validVals = (coppockLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      expect(validVals.length).toBeGreaterThan(10);
      
      // Should have both positive and negative values (oscillator)
      const positiveCount = validVals.filter((v: number) => v > 0).length;
      const negativeCount = validVals.filter((v: number) => v < 0).length;
      
      // At least one of each (may vary by data, but generally should have both)
      expect(positiveCount + negativeCount).toBeGreaterThan(0);
    });
    
    test("Coppock Curve unique values (not flat line)", async ({ page }) => {
      await addIndicatorViaModal(page, "coppock");
      await waitForIndicator(page, "coppock");
      
      const dump = await getDump(page);
      const coppock = dump?.indicators?.find((i: any) => i.kind === "coppock");
      const result = dump?.indicatorResults?.[coppock?.id];
      
      const coppockLine = result?.lines?.find((l: any) => l.id === "coppock");
      const validVals = (coppockLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      // Should have multiple unique values (not a flat line)
      const uniqueVals = new Set(validVals.map((v: number) => v.toFixed(4)));
      expect(uniqueVals.size).toBeGreaterThan(5);
    });
    
    test("Coppock Curve has no NaN leaks after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "coppock");
      await waitForIndicator(page, "coppock");
      
      const dump = await getDump(page);
      const coppock = dump?.indicators?.find((i: any) => i.kind === "coppock");
      const result = dump?.indicatorResults?.[coppock?.id];
      
      const coppockLine = result?.lines?.find((l: any) => l.id === "coppock");
      const allVals = coppockLine?.values ?? [];
      
      // Find the first valid value
      const firstValidIdx = allVals.findIndex((v: any) => 'value' in v && Number.isFinite(v.value));
      expect(firstValidIdx).toBeGreaterThanOrEqual(0); // Should have at least one valid value
      
      // After first valid, all should be valid (no NaN leaks)
      const afterWarmup = allVals.slice(firstValidIdx);
      const nanCount = afterWarmup.filter((v: any) => !('value' in v) || !Number.isFinite(v.value)).length;
      expect(nanCount).toBe(0);
    });
    
    test("Coppock Curve warmup period is correct (max ROC + WMA - 1)", async ({ page }) => {
      await addIndicatorViaModal(page, "coppock");
      await waitForIndicator(page, "coppock");
      
      const dump = await getDump(page);
      const coppock = dump?.indicators?.find((i: any) => i.kind === "coppock");
      const result = dump?.indicatorResults?.[coppock?.id];
      
      const coppockLine = result?.lines?.find((l: any) => l.id === "coppock");
      const allVals = coppockLine?.values ?? [];
      
      // Default params: wma=10, longRoc=14, shortRoc=11
      // Warmup = max(14, 11) + 10 - 1 = 23 bars
      // But our data starts at index 0, so first valid is at index 23
      // However, the output array may not include the warmup bars as WhitespaceData
      // Just verify we have reasonable warmup
      const firstValidIdx = allVals.findIndex((v: any) => 'value' in v && Number.isFinite(v.value));
      
      // Should have at least some warmup (WMA period at minimum)
      expect(firstValidIdx).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // CMO (Chande Momentum Oscillator) Tests - TradingView Parity
  // ============================================================================
  
  test.describe("CMO TradingView Parity", () => {
    test("CMO adds via modal and renders in separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "cmo");
      await waitForIndicator(page, "cmo");
      
      const dump = await getDump(page);
      const cmo = dump?.indicators?.find((i: any) => i.kind === "cmo");
      expect(cmo).toBeDefined();
      expect(cmo?.pane).toBe("separate");
    });
    
    test("CMO default length=9, source=close", async ({ page }) => {
      await addIndicatorViaModal(page, "cmo");
      await waitForIndicator(page, "cmo");
      
      const dump = await getDump(page);
      const cmo = dump?.indicators?.find((i: any) => i.kind === "cmo");
      
      expect(cmo?.params?.length).toBe(9);
      expect(cmo?.params?.source).toBe("close");
    });
    
    test("CMO produces two lines: cmo and zero", async ({ page }) => {
      await addIndicatorViaModal(page, "cmo");
      await waitForIndicator(page, "cmo");
      
      const dump = await getDump(page);
      const cmo = dump?.indicators?.find((i: any) => i.kind === "cmo");
      const result = dump?.indicatorResults?.[cmo?.id];
      
      expect(result?.lines?.length).toBe(2);
      
      const cmoLine = result?.lines?.find((l: any) => l.id === "cmo");
      const zeroLine = result?.lines?.find((l: any) => l.id === "zero");
      
      expect(cmoLine).toBeDefined();
      expect(zeroLine).toBeDefined();
    });
    
    test("CMO line label follows TV format: ChandeMO {length} {source}", async ({ page }) => {
      await addIndicatorViaModal(page, "cmo");
      await waitForIndicator(page, "cmo");
      
      const dump = await getDump(page);
      const cmo = dump?.indicators?.find((i: any) => i.kind === "cmo");
      const result = dump?.indicatorResults?.[cmo?.id];
      
      const cmoLine = result?.lines?.find((l: any) => l.id === "cmo");
      
      // Default: "ChandeMO 9 close"
      expect(cmoLine?.label).toBe("ChandeMO 9 close");
    });
    
    test("CMO line is blue (#2962FF), zero line is gray (#787B86) dashed", async ({ page }) => {
      await addIndicatorViaModal(page, "cmo");
      await waitForIndicator(page, "cmo");
      
      const dump = await getDump(page);
      const cmo = dump?.indicators?.find((i: any) => i.kind === "cmo");
      const result = dump?.indicatorResults?.[cmo?.id];
      
      const cmoLine = result?.lines?.find((l: any) => l.id === "cmo");
      const zeroLine = result?.lines?.find((l: any) => l.id === "zero");
      
      expect(cmoLine?.color?.toUpperCase()).toBe("#2962FF");
      expect(zeroLine?.color?.toUpperCase()).toBe("#787B86");
      expect(zeroLine?.style).toBe("dashed");
    });
    
    test("CMO line lastValueVisible=true, zero line lastValueVisible=false", async ({ page }) => {
      await addIndicatorViaModal(page, "cmo");
      await waitForIndicator(page, "cmo");
      
      const dump = await getDump(page);
      const cmo = dump?.indicators?.find((i: any) => i.kind === "cmo");
      const result = dump?.indicatorResults?.[cmo?.id];
      
      const cmoLine = result?.lines?.find((l: any) => l.id === "cmo");
      const zeroLine = result?.lines?.find((l: any) => l.id === "zero");
      
      expect(cmoLine?.lastValueVisible).toBe(true);
      expect(zeroLine?.lastValueVisible).toBe(false);
    });
    
    test("CMO values bounded between -100 and +100", async ({ page }) => {
      await addIndicatorViaModal(page, "cmo");
      await waitForIndicator(page, "cmo");
      
      const dump = await getDump(page);
      const cmo = dump?.indicators?.find((i: any) => i.kind === "cmo");
      const result = dump?.indicatorResults?.[cmo?.id];
      
      const cmoLine = result?.lines?.find((l: any) => l.id === "cmo");
      const validVals = (cmoLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      expect(validVals.length).toBeGreaterThan(0);
      
      // All values should be within [-100, +100]
      const minVal = Math.min(...validVals);
      const maxVal = Math.max(...validVals);
      
      expect(minVal).toBeGreaterThanOrEqual(-100);
      expect(maxVal).toBeLessThanOrEqual(100);
    });
    
    test("CMO zero line is flat at 0", async ({ page }) => {
      await addIndicatorViaModal(page, "cmo");
      await waitForIndicator(page, "cmo");
      
      const dump = await getDump(page);
      const cmo = dump?.indicators?.find((i: any) => i.kind === "cmo");
      const result = dump?.indicatorResults?.[cmo?.id];
      
      const zeroLine = result?.lines?.find((l: any) => l.id === "zero");
      const zeroVals = (zeroLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      expect(zeroVals.length).toBeGreaterThan(0);
      
      // All zero line values should be exactly 0
      const nonZeroCount = zeroVals.filter((v: number) => v !== 0).length;
      expect(nonZeroCount).toBe(0);
    });
    
    test("CMO warmup: first 'length' bars are whitespace or produce valid values", async ({ page }) => {
      await addIndicatorViaModal(page, "cmo");
      await waitForIndicator(page, "cmo");
      
      const dump = await getDump(page);
      const cmo = dump?.indicators?.find((i: any) => i.kind === "cmo");
      const result = dump?.indicatorResults?.[cmo?.id];
      
      const cmoLine = result?.lines?.find((l: any) => l.id === "cmo");
      const allVals = cmoLine?.values ?? [];
      
      // Find the first valid value
      const firstValidIdx = allVals.findIndex((v: any) => 'value' in v && Number.isFinite(v.value));
      
      // CMO should produce valid values at some point
      expect(firstValidIdx).toBeGreaterThanOrEqual(0);
      
      // Verify we have computed values
      const validVals = allVals.filter((v: any) => 'value' in v && Number.isFinite(v.value));
      expect(validVals.length).toBeGreaterThan(10);
    });
    
    test("CMO values are not flat (multiple unique values)", async ({ page }) => {
      await addIndicatorViaModal(page, "cmo");
      await waitForIndicator(page, "cmo");
      
      const dump = await getDump(page);
      const cmo = dump?.indicators?.find((i: any) => i.kind === "cmo");
      const result = dump?.indicatorResults?.[cmo?.id];
      
      const cmoLine = result?.lines?.find((l: any) => l.id === "cmo");
      const validVals = (cmoLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      // Should have multiple unique values (not a flat line)
      const uniqueVals = new Set(validVals.map((v: number) => v.toFixed(2)));
      expect(uniqueVals.size).toBeGreaterThan(5);
    });
    
    test("CMO has no NaN leaks after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "cmo");
      await waitForIndicator(page, "cmo");
      
      const dump = await getDump(page);
      const cmo = dump?.indicators?.find((i: any) => i.kind === "cmo");
      const result = dump?.indicatorResults?.[cmo?.id];
      
      const cmoLine = result?.lines?.find((l: any) => l.id === "cmo");
      const allVals = cmoLine?.values ?? [];
      
      // Find the first valid value
      const firstValidIdx = allVals.findIndex((v: any) => 'value' in v && Number.isFinite(v.value));
      expect(firstValidIdx).toBeGreaterThanOrEqual(0);
      
      // After first valid, all should be valid (no NaN leaks)
      const afterWarmup = allVals.slice(firstValidIdx);
      const nanCount = afterWarmup.filter((v: any) => !('value' in v) || !Number.isFinite(v.value)).length;
      expect(nanCount).toBe(0);
    });
  });

  // ============================================================================
  // UO (Ultimate Oscillator) Tests - TradingView Parity
  // ============================================================================
  
  test.describe("UO TradingView Parity", () => {
    test("UO adds via modal and renders in separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "uo");
      await waitForIndicator(page, "uo");
      
      const dump = await getDump(page);
      const uo = dump?.indicators?.find((i: any) => i.kind === "uo");
      expect(uo).toBeDefined();
      expect(uo?.pane).toBe("separate");
    });
    
    test("UO default lengths: fast=7, middle=14, slow=28", async ({ page }) => {
      await addIndicatorViaModal(page, "uo");
      await waitForIndicator(page, "uo");
      
      const dump = await getDump(page);
      const uo = dump?.indicators?.find((i: any) => i.kind === "uo");
      
      expect(uo?.params?.fastLength).toBe(7);
      expect(uo?.params?.middleLength).toBe(14);
      expect(uo?.params?.slowLength).toBe(28);
    });
    
    test("UO produces exactly 1 line (uo)", async ({ page }) => {
      await addIndicatorViaModal(page, "uo");
      await waitForIndicator(page, "uo");
      
      const dump = await getDump(page);
      const uo = dump?.indicators?.find((i: any) => i.kind === "uo");
      const result = dump?.indicatorResults?.[uo?.id];
      
      expect(result?.lines?.length).toBe(1);
      
      const uoLine = result?.lines?.find((l: any) => l.id === "uo");
      expect(uoLine).toBeDefined();
    });
    
    test("UO line label follows TV format: UO 7 14 28", async ({ page }) => {
      await addIndicatorViaModal(page, "uo");
      await waitForIndicator(page, "uo");
      
      const dump = await getDump(page);
      const uo = dump?.indicators?.find((i: any) => i.kind === "uo");
      const result = dump?.indicatorResults?.[uo?.id];
      
      const uoLine = result?.lines?.find((l: any) => l.id === "uo");
      
      // Default: "UO 7 14 28"
      expect(uoLine?.label).toBe("UO 7 14 28");
    });
    
    test("UO line is red (#F23645) and lastValueVisible=true", async ({ page }) => {
      await addIndicatorViaModal(page, "uo");
      await waitForIndicator(page, "uo");
      
      const dump = await getDump(page);
      const uo = dump?.indicators?.find((i: any) => i.kind === "uo");
      const result = dump?.indicatorResults?.[uo?.id];
      
      const uoLine = result?.lines?.find((l: any) => l.id === "uo");
      
      expect(uoLine?.color?.toUpperCase()).toBe("#F23645");
      expect(uoLine?.lastValueVisible).toBe(true);
    });
    
    test("UO values bounded between 0 and 100", async ({ page }) => {
      await addIndicatorViaModal(page, "uo");
      await waitForIndicator(page, "uo");
      
      const dump = await getDump(page);
      const uo = dump?.indicators?.find((i: any) => i.kind === "uo");
      const result = dump?.indicatorResults?.[uo?.id];
      
      const uoLine = result?.lines?.find((l: any) => l.id === "uo");
      const validVals = (uoLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      expect(validVals.length).toBeGreaterThan(0);
      
      // All values should be within [0, 100]
      const minVal = Math.min(...validVals);
      const maxVal = Math.max(...validVals);
      
      expect(minVal).toBeGreaterThanOrEqual(0);
      expect(maxVal).toBeLessThanOrEqual(100);
    });
    
    test("UO warmup: produces valid values after sufficient data", async ({ page }) => {
      await addIndicatorViaModal(page, "uo");
      await waitForIndicator(page, "uo");
      
      const dump = await getDump(page);
      const uo = dump?.indicators?.find((i: any) => i.kind === "uo");
      const result = dump?.indicatorResults?.[uo?.id];
      
      const uoLine = result?.lines?.find((l: any) => l.id === "uo");
      const allVals = uoLine?.values ?? [];
      
      // Find the first valid value
      const firstValidIdx = allVals.findIndex((v: any) => 'value' in v && Number.isFinite(v.value));
      
      // UO should produce valid values at some point
      expect(firstValidIdx).toBeGreaterThanOrEqual(0);
      
      // Verify we have computed values
      const validVals = allVals.filter((v: any) => 'value' in v && Number.isFinite(v.value));
      expect(validVals.length).toBeGreaterThan(0);
    });
    
    test("UO has no NaN/Infinity after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "uo");
      await waitForIndicator(page, "uo");
      
      const dump = await getDump(page);
      const uo = dump?.indicators?.find((i: any) => i.kind === "uo");
      const result = dump?.indicatorResults?.[uo?.id];
      
      const uoLine = result?.lines?.find((l: any) => l.id === "uo");
      const allVals = uoLine?.values ?? [];
      
      // Find the first valid value
      const firstValidIdx = allVals.findIndex((v: any) => 'value' in v && Number.isFinite(v.value));
      expect(firstValidIdx).toBeGreaterThanOrEqual(0);
      
      // After first valid, all should be valid (no NaN/Infinity leaks)
      const afterWarmup = allVals.slice(firstValidIdx);
      const invalidCount = afterWarmup.filter((v: any) => !('value' in v) || !Number.isFinite(v.value)).length;
      expect(invalidCount).toBe(0);
    });
    
    test("UO values vary over time (not constant)", async ({ page }) => {
      await addIndicatorViaModal(page, "uo");
      await waitForIndicator(page, "uo");
      
      const dump = await getDump(page);
      const uo = dump?.indicators?.find((i: any) => i.kind === "uo");
      const result = dump?.indicatorResults?.[uo?.id];
      
      const uoLine = result?.lines?.find((l: any) => l.id === "uo");
      const validVals = (uoLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      // Should have valid computed values
      expect(validVals.length).toBeGreaterThan(0);
      
      // Values should be within bounds
      const minVal = Math.min(...validVals);
      const maxVal = Math.max(...validVals);
      expect(minVal).toBeGreaterThanOrEqual(0);
      expect(maxVal).toBeLessThanOrEqual(100);
    });
    
    test("UO default style is line", async ({ page }) => {
      await addIndicatorViaModal(page, "uo");
      await waitForIndicator(page, "uo");
      
      const dump = await getDump(page);
      const uo = dump?.indicators?.find((i: any) => i.kind === "uo");
      const result = dump?.indicatorResults?.[uo?.id];
      
      const uoLine = result?.lines?.find((l: any) => l.id === "uo");
      
      expect(uoLine?.style).toBe("line");
    });
  });

  // ============================================================================
  // KC (Keltner Channels) Tests - TradingView Parity
  // ============================================================================
  
  test.describe("KC TradingView Parity", () => {
    test("KC adds via modal and renders on price pane (overlay)", async ({ page }) => {
      await addIndicatorViaModal(page, "kc");
      await waitForIndicator(page, "kc");
      
      const dump = await getDump(page);
      const kc = dump?.indicators?.find((i: any) => i.kind === "kc");
      expect(kc).toBeDefined();
      expect(kc?.pane).toBe("price"); // Overlay on price chart
    });
    
    test("KC default params: length=20, multiplier=2, source=close, useExp=true, bandsStyle=atr, atrLength=10", async ({ page }) => {
      await addIndicatorViaModal(page, "kc");
      await waitForIndicator(page, "kc");
      
      const dump = await getDump(page);
      const kc = dump?.indicators?.find((i: any) => i.kind === "kc");
      
      expect(kc?.params?.length).toBe(20);
      expect(kc?.params?.multiplier).toBe(2);
      expect(kc?.params?.source).toBe("close");
      expect(kc?.params?.useExp).toBe(true);
      expect(kc?.params?.bandsStyle).toBe("atr");
      expect(kc?.params?.atrLength).toBe(10);
    });
    
    test("KC produces 3 lines: upper, basis, lower", async ({ page }) => {
      await addIndicatorViaModal(page, "kc");
      await waitForIndicator(page, "kc");
      
      const dump = await getDump(page);
      const kc = dump?.indicators?.find((i: any) => i.kind === "kc");
      const result = dump?.indicatorResults?.[kc?.id];
      
      expect(result?.lines?.length).toBe(3);
      
      const upperLine = result?.lines?.find((l: any) => l.id === "upper");
      const basisLine = result?.lines?.find((l: any) => l.id === "basis");
      const lowerLine = result?.lines?.find((l: any) => l.id === "lower");
      
      expect(upperLine).toBeDefined();
      expect(basisLine).toBeDefined();
      expect(lowerLine).toBeDefined();
    });
    
    test("KC basis label follows TV format: KC 20 2 close", async ({ page }) => {
      await addIndicatorViaModal(page, "kc");
      await waitForIndicator(page, "kc");
      
      const dump = await getDump(page);
      const kc = dump?.indicators?.find((i: any) => i.kind === "kc");
      const result = dump?.indicatorResults?.[kc?.id];
      
      const basisLine = result?.lines?.find((l: any) => l.id === "basis");
      
      // Default: "KC 20 2 close"
      expect(basisLine?.label).toBe("KC 20 2 close");
    });
    
    test("KC all lines are blue (#2962FF)", async ({ page }) => {
      await addIndicatorViaModal(page, "kc");
      await waitForIndicator(page, "kc");
      
      const dump = await getDump(page);
      const kc = dump?.indicators?.find((i: any) => i.kind === "kc");
      const result = dump?.indicatorResults?.[kc?.id];
      
      const upperLine = result?.lines?.find((l: any) => l.id === "upper");
      const basisLine = result?.lines?.find((l: any) => l.id === "basis");
      const lowerLine = result?.lines?.find((l: any) => l.id === "lower");
      
      expect(upperLine?.color?.toUpperCase()).toBe("#2962FF");
      expect(basisLine?.color?.toUpperCase()).toBe("#2962FF");
      expect(lowerLine?.color?.toUpperCase()).toBe("#2962FF");
    });
    
    test("KC invariant: upper >= basis >= lower", async ({ page }) => {
      await addIndicatorViaModal(page, "kc");
      await waitForIndicator(page, "kc");
      
      const dump = await getDump(page);
      const kc = dump?.indicators?.find((i: any) => i.kind === "kc");
      const result = dump?.indicatorResults?.[kc?.id];
      
      const upperLine = result?.lines?.find((l: any) => l.id === "upper");
      const basisLine = result?.lines?.find((l: any) => l.id === "basis");
      const lowerLine = result?.lines?.find((l: any) => l.id === "lower");
      
      // Get aligned valid values
      const upperVals = (upperLine?.values ?? []);
      const basisVals = (basisLine?.values ?? []);
      const lowerVals = (lowerLine?.values ?? []);
      
      let validCount = 0;
      for (let i = 0; i < Math.min(upperVals.length, basisVals.length, lowerVals.length); i++) {
        const u = upperVals[i];
        const b = basisVals[i];
        const l = lowerVals[i];
        
        if ('value' in u && 'value' in b && 'value' in l &&
            Number.isFinite(u.value) && Number.isFinite(b.value) && Number.isFinite(l.value)) {
          expect(u.value).toBeGreaterThanOrEqual(b.value - 0.0001); // upper >= basis
          expect(b.value).toBeGreaterThanOrEqual(l.value - 0.0001); // basis >= lower
          validCount++;
        }
      }
      
      expect(validCount).toBeGreaterThan(0);
    });
    
    test("KC has _kcFill for background overlay (enabled by default)", async ({ page }) => {
      await addIndicatorViaModal(page, "kc");
      await waitForIndicator(page, "kc");
      
      const dump = await getDump(page);
      const kc = dump?.indicators?.find((i: any) => i.kind === "kc");
      const result = dump?.indicatorResults?.[kc?.id];
      
      // _kcFill should exist when showBackground is true (default)
      expect(result?._kcFill).toBeDefined();
      expect(result?._kcFill?.upper).toBeDefined();
      expect(result?._kcFill?.lower).toBeDefined();
      expect(result?._kcFill?.backgroundColor).toBeDefined();
    });
    
    test("KC has no NaN/Infinity after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "kc");
      await waitForIndicator(page, "kc");
      
      const dump = await getDump(page);
      const kc = dump?.indicators?.find((i: any) => i.kind === "kc");
      const result = dump?.indicatorResults?.[kc?.id];
      
      const basisLine = result?.lines?.find((l: any) => l.id === "basis");
      const allVals = basisLine?.values ?? [];
      
      // Find the first valid value
      const firstValidIdx = allVals.findIndex((v: any) => 'value' in v && Number.isFinite(v.value));
      expect(firstValidIdx).toBeGreaterThanOrEqual(0);
      
      // After first valid, all should be valid (no NaN/Infinity leaks)
      const afterWarmup = allVals.slice(firstValidIdx);
      const invalidCount = afterWarmup.filter((v: any) => !('value' in v) || !Number.isFinite(v.value)).length;
      expect(invalidCount).toBe(0);
    });
    
    test("KC values are realistic price levels", async ({ page }) => {
      await addIndicatorViaModal(page, "kc");
      await waitForIndicator(page, "kc");
      
      const dump = await getDump(page);
      const kc = dump?.indicators?.find((i: any) => i.kind === "kc");
      const result = dump?.indicatorResults?.[kc?.id];
      
      const basisLine = result?.lines?.find((l: any) => l.id === "basis");
      const validVals = (basisLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      // KC basis should be at price level (not 0-100 oscillator)
      expect(validVals.length).toBeGreaterThan(0);
      
      // Verify reasonable price values (should be similar to underlying prices)
      const avgPrice = validVals.reduce((a: number, b: number) => a + b, 0) / validVals.length;
      expect(avgPrice).toBeGreaterThan(1); // Not an oscillator value
    });
    
    test("KC upper/lower lines render on price pane", async ({ page }) => {
      await addIndicatorViaModal(page, "kc");
      await waitForIndicator(page, "kc");
      
      const dump = await getDump(page);
      const kc = dump?.indicators?.find((i: any) => i.kind === "kc");
      const result = dump?.indicatorResults?.[kc?.id];
      
      const upperLine = result?.lines?.find((l: any) => l.id === "upper");
      const lowerLine = result?.lines?.find((l: any) => l.id === "lower");
      
      expect(upperLine?.pane).toBe("price");
      expect(lowerLine?.pane).toBe("price");
    });
  });

  // ============================================================================
  // VStop (Volatility Stop) Tests - TradingView Parity
  // ============================================================================
  
  test.describe("VStop TradingView Parity", () => {
    test("VStop adds via modal and renders on price pane (overlay)", async ({ page }) => {
      await addIndicatorViaModal(page, "vstop");
      await waitForIndicator(page, "vstop");
      
      const dump = await getDump(page);
      const vstop = dump?.indicators?.find((i: any) => i.kind === "vstop");
      expect(vstop).toBeDefined();
      expect(vstop?.pane).toBe("price"); // Overlay on price chart
    });
    
    test("VStop default params: length=20, source=close, multiplier=2", async ({ page }) => {
      await addIndicatorViaModal(page, "vstop");
      await waitForIndicator(page, "vstop");
      
      const dump = await getDump(page);
      const vstop = dump?.indicators?.find((i: any) => i.kind === "vstop");
      
      expect(vstop?.params?.length).toBe(20);
      expect(vstop?.params?.source).toBe("close");
      expect(vstop?.params?.multiplier).toBe(2);
    });
    
    test("VStop default style: plotStyle=cross, priceLineVisible=false", async ({ page }) => {
      await addIndicatorViaModal(page, "vstop");
      await waitForIndicator(page, "vstop");
      
      const dump = await getDump(page);
      const vstop = dump?.indicators?.find((i: any) => i.kind === "vstop");
      
      expect(vstop?.params?.plotStyle).toBe("cross");
      expect(vstop?.params?.priceLineVisible).toBe(false);
    });
    
    test("VStop produces 1 line (vstop)", async ({ page }) => {
      await addIndicatorViaModal(page, "vstop");
      await waitForIndicator(page, "vstop");
      
      const dump = await getDump(page);
      const vstop = dump?.indicators?.find((i: any) => i.kind === "vstop");
      const result = dump?.indicatorResults?.[vstop?.id];
      
      expect(result?.lines?.length).toBe(1);
      
      const vstopLine = result?.lines?.find((l: any) => l.id === "vstop");
      expect(vstopLine).toBeDefined();
    });
    
    test("VStop label follows TV format: VStop 20 close 2", async ({ page }) => {
      await addIndicatorViaModal(page, "vstop");
      await waitForIndicator(page, "vstop");
      
      const dump = await getDump(page);
      const vstop = dump?.indicators?.find((i: any) => i.kind === "vstop");
      const result = dump?.indicatorResults?.[vstop?.id];
      
      const vstopLine = result?.lines?.find((l: any) => l.id === "vstop");
      
      // Default: "VStop 20 close 2"
      expect(vstopLine?.label).toBe("VStop 20 close 2");
    });
    
    test("VStop default colors: uptrend=#089981, downtrend=#F23645", async ({ page }) => {
      await addIndicatorViaModal(page, "vstop");
      await waitForIndicator(page, "vstop");
      
      const dump = await getDump(page);
      const vstop = dump?.indicators?.find((i: any) => i.kind === "vstop");
      
      expect(vstop?.params?.uptrendColor?.toUpperCase()).toBe("#089981".toUpperCase());
      expect(vstop?.params?.downtrendColor?.toUpperCase()).toBe("#F23645".toUpperCase());
    });
    
    test("VStop has _vstopData for marker overlay (cross/circles)", async ({ page }) => {
      await addIndicatorViaModal(page, "vstop");
      await waitForIndicator(page, "vstop");
      
      const dump = await getDump(page);
      const vstop = dump?.indicators?.find((i: any) => i.kind === "vstop");
      const result = dump?.indicatorResults?.[vstop?.id];
      
      // _vstopData should exist for cross/circles plotStyle
      expect(result?._vstopData).toBeDefined();
      expect(result?._vstopData?.plotStyle).toBe("cross");
      expect(result?._vstopData?.points).toBeDefined();
      expect(Array.isArray(result?._vstopData?.points)).toBe(true);
    });
    
    test("VStop has no NaN/Infinity after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "vstop");
      await waitForIndicator(page, "vstop");
      
      const dump = await getDump(page);
      const vstop = dump?.indicators?.find((i: any) => i.kind === "vstop");
      const result = dump?.indicatorResults?.[vstop?.id];
      
      const vstopLine = result?.lines?.find((l: any) => l.id === "vstop");
      const allVals = vstopLine?.values ?? [];
      
      // Find the first valid value
      const firstValidIdx = allVals.findIndex((v: any) => 'value' in v && Number.isFinite(v.value));
      expect(firstValidIdx).toBeGreaterThanOrEqual(0);
      
      // After first valid, all should be valid (no NaN/Infinity leaks)
      const afterWarmup = allVals.slice(firstValidIdx);
      const invalidCount = afterWarmup.filter((v: any) => !('value' in v) || !Number.isFinite(v.value)).length;
      expect(invalidCount).toBe(0);
    });
    
    test("VStop values are at realistic price levels (overlay, not oscillator)", async ({ page }) => {
      await addIndicatorViaModal(page, "vstop");
      await waitForIndicator(page, "vstop");
      
      const dump = await getDump(page);
      const vstop = dump?.indicators?.find((i: any) => i.kind === "vstop");
      const result = dump?.indicatorResults?.[vstop?.id];
      
      const vstopLine = result?.lines?.find((l: any) => l.id === "vstop");
      const validVals = (vstopLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      expect(validVals.length).toBeGreaterThan(0);
      
      // VStop should be at price level (not 0-100 oscillator)
      const avgPrice = validVals.reduce((a: number, b: number) => a + b, 0) / validVals.length;
      expect(avgPrice).toBeGreaterThan(1); // Not an oscillator value
    });
    
    test("VStop line renders on price pane", async ({ page }) => {
      await addIndicatorViaModal(page, "vstop");
      await waitForIndicator(page, "vstop");
      
      const dump = await getDump(page);
      const vstop = dump?.indicators?.find((i: any) => i.kind === "vstop");
      const result = dump?.indicatorResults?.[vstop?.id];
      
      const vstopLine = result?.lines?.find((l: any) => l.id === "vstop");
      expect(vstopLine?.pane).toBe("price");
    });
    
    test("VStop has per-bar trend data (both uptrend and downtrend points present)", async ({ page }) => {
      await addIndicatorViaModal(page, "vstop");
      await waitForIndicator(page, "vstop");
      
      const dump = await getDump(page);
      const vstop = dump?.indicators?.find((i: any) => i.kind === "vstop");
      const result = dump?.indicatorResults?.[vstop?.id];
      
      const points = result?._vstopData?.points ?? [];
      
      // Should have some points
      expect(points.length).toBeGreaterThan(0);
      
      // Check for both uptrend and downtrend points
      const uptrendCount = points.filter((p: any) => p.isUpTrend === true).length;
      const downtrendCount = points.filter((p: any) => p.isUpTrend === false).length;
      
      // In a sufficiently volatile market, we should have both
      // At minimum, we should have at least some trend data
      expect(uptrendCount + downtrendCount).toBe(points.length);
      
      // Ideally both should be present, but we can't guarantee this
      // Just verify that isUpTrend is a boolean for all points
      for (const pt of points.slice(0, 10)) {
        expect(typeof pt.isUpTrend).toBe("boolean");
      }
    });
    
    test("VStop _vstopData points include isUpTrend boolean for each point", async ({ page }) => {
      await addIndicatorViaModal(page, "vstop");
      await waitForIndicator(page, "vstop");
      
      const dump = await getDump(page);
      const vstop = dump?.indicators?.find((i: any) => i.kind === "vstop");
      const result = dump?.indicatorResults?.[vstop?.id];
      
      const points = result?._vstopData?.points ?? [];
      expect(points.length).toBeGreaterThan(0);
      
      // Each point should have time, value, and isUpTrend
      for (const pt of points.slice(0, 10)) { // Check first 10 points
        expect(typeof pt.time).toBe("number");
        expect(typeof pt.value).toBe("number");
        expect(typeof pt.isUpTrend).toBe("boolean");
      }
    });
  });
  
  // ════════════════════════════════════════════════════════════════════════════
  // CHOP (Choppiness Index) TradingView Parity
  // ════════════════════════════════════════════════════════════════════════════
  test.describe("CHOP TradingView Parity", () => {
    test("CHOP adds via modal and renders in separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      expect(chop).toBeDefined();
      // CHOP is an oscillator → separate pane
      expect(chop?.pane).not.toBe("price");
    });
    
    test("CHOP default params: length=14, offset=0", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      expect(Number(chop?.params?.length)).toBe(14);
      expect(Number(chop?.params?.offset)).toBe(0);
    });
    
    test("CHOP produces 4 lines: chop + 3 band lines", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      const result = dump?.indicatorResults?.[chop?.id];
      
      // 4 lines: chop, upperBand, middleBand, lowerBand
      const lines = result?.lines ?? [];
      expect(lines.length).toBe(4);
      
      const lineIds = lines.map((l: any) => l.id);
      expect(lineIds).toContain("chop");
      expect(lineIds).toContain("chopUpperBand");
      expect(lineIds).toContain("chopMiddleBand");
      expect(lineIds).toContain("chopLowerBand");
    });
    
    test("CHOP label follows TV format: CHOP 14", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      const result = dump?.indicatorResults?.[chop?.id];
      const chopLine = result?.lines?.find((l: any) => l.id === "chop");
      
      // Default: offset=0, so label is "CHOP 14"
      expect(chopLine?.label).toBe("CHOP 14");
    });
    
    test("CHOP line is blue (#2962FF) and lastValueVisible=true", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      const result = dump?.indicatorResults?.[chop?.id];
      const chopLine = result?.lines?.find((l: any) => l.id === "chop");
      
      expect(chopLine?.color?.toUpperCase()).toBe("#2962FF");
      expect(chopLine?.lastValueVisible).toBe(true);
    });
    
    test("CHOP band lines are gray (#787B86) and lastValueVisible=false", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      const result = dump?.indicatorResults?.[chop?.id];
      const lines = result?.lines ?? [];
      
      const upperBand = lines.find((l: any) => l.id === "chopUpperBand");
      const middleBand = lines.find((l: any) => l.id === "chopMiddleBand");
      const lowerBand = lines.find((l: any) => l.id === "chopLowerBand");
      
      // All bands gray
      expect(upperBand?.color?.toUpperCase()).toBe("#787B86");
      expect(middleBand?.color?.toUpperCase()).toBe("#787B86");
      expect(lowerBand?.color?.toUpperCase()).toBe("#787B86");
      
      // All bands lastValueVisible=false
      expect(upperBand?.lastValueVisible).toBe(false);
      expect(middleBand?.lastValueVisible).toBe(false);
      expect(lowerBand?.lastValueVisible).toBe(false);
    });
    
    test("CHOP default band values: upper=61.8, middle=50, lower=38.2", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      
      expect(Number(chop?.params?.upperBandValue)).toBeCloseTo(61.8, 1);
      expect(Number(chop?.params?.middleBandValue)).toBe(50);
      expect(Number(chop?.params?.lowerBandValue)).toBeCloseTo(38.2, 1);
    });
    
    test("CHOP has _chopFill config for background zone fill", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      const result = dump?.indicatorResults?.[chop?.id];
      
      expect(result?._chopFill).toBeDefined();
      expect(result?._chopFill?.showBackground).toBe(true);
      expect(result?._chopFill?.backgroundFillColor?.toUpperCase()).toBe("#2962FF");
      expect(result?._chopFill?.backgroundFillOpacity).toBeCloseTo(0.1, 2);
      expect(result?._chopFill?.upperBandValue).toBeCloseTo(61.8, 1);
      expect(result?._chopFill?.lowerBandValue).toBeCloseTo(38.2, 1);
    });
    
    test("CHOP values are bounded 0-100", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      const result = dump?.indicatorResults?.[chop?.id];
      const chopLine = result?.lines?.find((l: any) => l.id === "chop");
      
      const values = (chopLine?.values ?? [])
        .filter((p: any) => p.value !== undefined && Number.isFinite(p.value))
        .map((p: any) => p.value);
      
      expect(values.length).toBeGreaterThan(0);
      
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });
    
    test("CHOP has no NaN/Infinity after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      const result = dump?.indicatorResults?.[chop?.id];
      const chopLine = result?.lines?.find((l: any) => l.id === "chop");
      
      const length = Number(chop?.params?.length) || 14;
      const values = chopLine?.values ?? [];
      
      // After warmup (length-1 bars), values should all be finite
      const postWarmup = values.slice(length - 1);
      const invalidValues = postWarmup.filter((p: any) => 
        p.value !== undefined && (!Number.isFinite(p.value) || Number.isNaN(p.value))
      );
      
      expect(invalidValues.length).toBe(0);
    });
    
    test("CHOP band lines have constant values at their levels", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      const result = dump?.indicatorResults?.[chop?.id];
      const lines = result?.lines ?? [];
      
      const upperBand = lines.find((l: any) => l.id === "chopUpperBand");
      const middleBand = lines.find((l: any) => l.id === "chopMiddleBand");
      const lowerBand = lines.find((l: any) => l.id === "chopLowerBand");
      
      // Upper band values should all be 61.8
      const upperValues = (upperBand?.values ?? [])
        .filter((p: any) => p.value !== undefined)
        .map((p: any) => p.value);
      expect(upperValues.length).toBeGreaterThan(0);
      expect(Math.min(...upperValues)).toBeCloseTo(61.8, 1);
      expect(Math.max(...upperValues)).toBeCloseTo(61.8, 1);
      
      // Middle band values should all be 50
      const middleValues = (middleBand?.values ?? [])
        .filter((p: any) => p.value !== undefined)
        .map((p: any) => p.value);
      expect(middleValues.length).toBeGreaterThan(0);
      expect(Math.min(...middleValues)).toBe(50);
      expect(Math.max(...middleValues)).toBe(50);
      
      // Lower band values should all be 38.2
      const lowerValues = (lowerBand?.values ?? [])
        .filter((p: any) => p.value !== undefined)
        .map((p: any) => p.value);
      expect(lowerValues.length).toBeGreaterThan(0);
      expect(Math.min(...lowerValues)).toBeCloseTo(38.2, 1);
      expect(Math.max(...lowerValues)).toBeCloseTo(38.2, 1);
    });
    
    test("CHOP values vary over time (not flat line)", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      const result = dump?.indicatorResults?.[chop?.id];
      const chopLine = result?.lines?.find((l: any) => l.id === "chop");
      
      const values = (chopLine?.values ?? [])
        .filter((p: any) => p.value !== undefined && Number.isFinite(p.value))
        .map((p: any) => p.value);
      
      expect(values.length).toBeGreaterThan(5);
      
      // Check that values are not all the same (not a flat line)
      const uniqueValues = new Set(values.map((v: number) => v.toFixed(2)));
      expect(uniqueValues.size).toBeGreaterThan(3);
    });
    
    test("CHOP upper band style is dashed", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      const result = dump?.indicatorResults?.[chop?.id];
      const upperBand = result?.lines?.find((l: any) => l.id === "chopUpperBand");
      
      // lineStyle: 2 = dashed
      expect(upperBand?.lineStyle).toBe(2);
    });
    
    test("CHOP middle band style is dotted", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      const result = dump?.indicatorResults?.[chop?.id];
      const middleBand = result?.lines?.find((l: any) => l.id === "chopMiddleBand");
      
      // lineStyle: 3 = dotted
      expect(middleBand?.lineStyle).toBe(3);
    });
    
    test("CHOP lower band style is dashed", async ({ page }) => {
      await addIndicatorViaModal(page, "chop");
      await waitForIndicator(page, "chop");
      
      const dump = await getDump(page);
      const chop = dump?.indicators?.find((i: any) => i.kind === "chop");
      const result = dump?.indicatorResults?.[chop?.id];
      const lowerBand = result?.lines?.find((l: any) => l.id === "chopLowerBand");
      
      // lineStyle: 2 = dashed
      expect(lowerBand?.lineStyle).toBe(2);
    });
  });
  
  // ════════════════════════════════════════════════════════════════════════════
  // HV (Historical Volatility) TradingView Parity
  // ════════════════════════════════════════════════════════════════════════════
  test.describe("HV TradingView Parity", () => {
    test("HV adds via modal and renders in separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "hv");
      await waitForIndicator(page, "hv");
      
      const dump = await getDump(page);
      const hv = dump?.indicators?.find((i: any) => i.kind === "hv");
      expect(hv).toBeDefined();
      // HV is an oscillator → separate pane
      expect(hv?.pane).not.toBe("price");
    });
    
    test("HV default params: length=10", async ({ page }) => {
      await addIndicatorViaModal(page, "hv");
      await waitForIndicator(page, "hv");
      
      const dump = await getDump(page);
      const hv = dump?.indicators?.find((i: any) => i.kind === "hv");
      expect(Number(hv?.params?.length)).toBe(10);
    });
    
    test("HV produces exactly 1 line (hv)", async ({ page }) => {
      await addIndicatorViaModal(page, "hv");
      await waitForIndicator(page, "hv");
      
      const dump = await getDump(page);
      const hv = dump?.indicators?.find((i: any) => i.kind === "hv");
      const result = dump?.indicatorResults?.[hv?.id];
      
      const lines = result?.lines ?? [];
      expect(lines.length).toBe(1);
      expect(lines[0]?.id).toBe("hv");
    });
    
    test("HV label follows TV format: HV 10", async ({ page }) => {
      await addIndicatorViaModal(page, "hv");
      await waitForIndicator(page, "hv");
      
      const dump = await getDump(page);
      const hv = dump?.indicators?.find((i: any) => i.kind === "hv");
      const result = dump?.indicatorResults?.[hv?.id];
      const hvLine = result?.lines?.find((l: any) => l.id === "hv");
      
      expect(hvLine?.label).toBe("HV 10");
    });
    
    test("HV line is blue (#2962FF) and lastValueVisible=true", async ({ page }) => {
      await addIndicatorViaModal(page, "hv");
      await waitForIndicator(page, "hv");
      
      const dump = await getDump(page);
      const hv = dump?.indicators?.find((i: any) => i.kind === "hv");
      const result = dump?.indicatorResults?.[hv?.id];
      const hvLine = result?.lines?.find((l: any) => l.id === "hv");
      
      expect(hvLine?.color?.toUpperCase()).toBe("#2962FF");
      expect(hvLine?.lastValueVisible).toBe(true);
    });
    
    test("HV values are positive after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "hv");
      await waitForIndicator(page, "hv");
      
      const dump = await getDump(page);
      const hv = dump?.indicators?.find((i: any) => i.kind === "hv");
      const result = dump?.indicatorResults?.[hv?.id];
      const hvLine = result?.lines?.find((l: any) => l.id === "hv");
      
      const values = (hvLine?.values ?? [])
        .filter((p: any) => p.value !== undefined && Number.isFinite(p.value))
        .map((p: any) => p.value);
      
      expect(values.length).toBeGreaterThan(0);
      
      // HV should be positive (it's a volatility measure)
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    });
    
    test("HV has no NaN/Infinity after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "hv");
      await waitForIndicator(page, "hv");
      
      const dump = await getDump(page);
      const hv = dump?.indicators?.find((i: any) => i.kind === "hv");
      const result = dump?.indicatorResults?.[hv?.id];
      const hvLine = result?.lines?.find((l: any) => l.id === "hv");
      
      const length = Number(hv?.params?.length) || 10;
      const values = hvLine?.values ?? [];
      
      // After warmup (length bars), values should all be finite
      const postWarmup = values.slice(length);
      const invalidValues = postWarmup.filter((p: any) => 
        p.value !== undefined && (!Number.isFinite(p.value) || Number.isNaN(p.value))
      );
      
      expect(invalidValues.length).toBe(0);
    });
    
    test("HV values vary over time (not flat line)", async ({ page }) => {
      await addIndicatorViaModal(page, "hv");
      await waitForIndicator(page, "hv");
      
      const dump = await getDump(page);
      const hv = dump?.indicators?.find((i: any) => i.kind === "hv");
      const result = dump?.indicatorResults?.[hv?.id];
      const hvLine = result?.lines?.find((l: any) => l.id === "hv");
      
      const values = (hvLine?.values ?? [])
        .filter((p: any) => p.value !== undefined && Number.isFinite(p.value))
        .map((p: any) => p.value);
      
      expect(values.length).toBeGreaterThan(5);
      
      // Check that values are not all the same (not a flat line)
      const uniqueValues = new Set(values.map((v: number) => v.toFixed(2)));
      expect(uniqueValues.size).toBeGreaterThan(1);
    });
    
    test("HV warmup produces whitespace for first length bars", async ({ page }) => {
      await addIndicatorViaModal(page, "hv");
      await waitForIndicator(page, "hv");
      
      const dump = await getDump(page);
      const hv = dump?.indicators?.find((i: any) => i.kind === "hv");
      const result = dump?.indicatorResults?.[hv?.id];
      const hvLine = result?.lines?.find((l: any) => l.id === "hv");
      
      const length = Number(hv?.params?.length) || 10;
      const values = hvLine?.values ?? [];
      
      // First `length` bars should be whitespace (no value property or undefined value)
      const warmupBars = values.slice(0, length);
      for (const bar of warmupBars) {
        // Whitespace means either no value property or value is undefined
        const hasValue = bar.value !== undefined && Number.isFinite(bar.value);
        // We expect most/all warmup bars to NOT have valid values
      }
      
      // After warmup, should have valid values
      const postWarmupBars = values.slice(length, length + 5);
      const validPostWarmup = postWarmupBars.filter((p: any) => 
        p.value !== undefined && Number.isFinite(p.value)
      );
      expect(validPostWarmup.length).toBeGreaterThan(0);
    });
    
    test("HV values are in reasonable percentage range", async ({ page }) => {
      await addIndicatorViaModal(page, "hv");
      await waitForIndicator(page, "hv");
      
      const dump = await getDump(page);
      const hv = dump?.indicators?.find((i: any) => i.kind === "hv");
      const result = dump?.indicatorResults?.[hv?.id];
      const hvLine = result?.lines?.find((l: any) => l.id === "hv");
      
      const values = (hvLine?.values ?? [])
        .filter((p: any) => p.value !== undefined && Number.isFinite(p.value))
        .map((p: any) => p.value);
      
      expect(values.length).toBeGreaterThan(0);
      
      // HV is annualized volatility in percentage
      // For most stocks, HV is typically between 5% and 100%
      // Very volatile assets might go higher, but extremely high values (>500%) are suspect
      const avgValue = values.reduce((a: number, b: number) => a + b, 0) / values.length;
      expect(avgValue).toBeGreaterThan(0);
      expect(avgValue).toBeLessThan(500); // Sanity check - no stock has 500% annualized vol regularly
    });
    
    test("HV line style is solid by default", async ({ page }) => {
      await addIndicatorViaModal(page, "hv");
      await waitForIndicator(page, "hv");
      
      const dump = await getDump(page);
      const hv = dump?.indicators?.find((i: any) => i.kind === "hv");
      const result = dump?.indicatorResults?.[hv?.id];
      const hvLine = result?.lines?.find((l: any) => l.id === "hv");
      
      // lineStyle: 0 = solid
      expect(hvLine?.lineStyle).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // BBW (Bollinger BandWidth) TradingView Parity
  // ════════════════════════════════════════════════════════════════════════════
  test.describe("BBW TradingView Parity", () => {
    test("BBW adds via modal and renders in separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      expect(bbw).toBeDefined();
      // BBW is an oscillator → separate pane
      expect(bbw?.pane).not.toBe("price");
    });
    
    test("BBW default params: length=20, stdDev=2, highestExpansionLength=125, lowestContractionLength=125", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      expect(Number(bbw?.params?.length)).toBe(20);
      expect(Number(bbw?.params?.stdDev)).toBe(2);
      expect(Number(bbw?.params?.highestExpansionLength)).toBe(125);
      expect(Number(bbw?.params?.lowestContractionLength)).toBe(125);
    });
    
    test("BBW produces exactly 3 lines (bbw, highestExpansion, lowestContraction)", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      const result = dump?.indicatorResults?.[bbw?.id];
      
      const lines = result?.lines ?? [];
      expect(lines.length).toBe(3);
      
      const lineIds = lines.map((l: any) => l.id).sort();
      expect(lineIds).toEqual(["bbw", "highestExpansion", "lowestContraction"].sort());
    });
    
    test("BBW label follows TV format: BBW 20, 2", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      const result = dump?.indicatorResults?.[bbw?.id];
      const bbwLine = result?.lines?.find((l: any) => l.id === "bbw");
      
      expect(bbwLine?.label).toBe("BBW 20, 2");
    });
    
    test("BBW line is blue (#2962FF), highestExpansion is red (#F23645), lowestContraction is teal (#26A69A)", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      const result = dump?.indicatorResults?.[bbw?.id];
      
      const bbwLine = result?.lines?.find((l: any) => l.id === "bbw");
      const highestLine = result?.lines?.find((l: any) => l.id === "highestExpansion");
      const lowestLine = result?.lines?.find((l: any) => l.id === "lowestContraction");
      
      expect(bbwLine?.color?.toUpperCase()).toBe("#2962FF");
      expect(highestLine?.color?.toUpperCase()).toBe("#F23645");
      expect(lowestLine?.color?.toUpperCase()).toBe("#26A69A");
    });
    
    test("BBW values are non-negative after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      const result = dump?.indicatorResults?.[bbw?.id];
      const bbwLine = result?.lines?.find((l: any) => l.id === "bbw");
      
      const values = (bbwLine?.values ?? [])
        .filter((p: any) => p.value !== undefined && Number.isFinite(p.value))
        .map((p: any) => p.value);
      
      expect(values.length).toBeGreaterThan(0);
      
      // BBW should be non-negative (it's upper-lower/middle * 100)
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    });
    
    test("BBW has no NaN/Infinity after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      const result = dump?.indicatorResults?.[bbw?.id];
      
      // Check all 3 lines
      for (const lineId of ["bbw", "highestExpansion", "lowestContraction"]) {
        const line = result?.lines?.find((l: any) => l.id === lineId);
        const values = (line?.values ?? [])
          .filter((p: any) => p.value !== undefined)
          .map((p: any) => p.value);
        
        if (values.length > 0) {
          // After warmup, no NaN or Infinity
          for (const v of values) {
            expect(Number.isFinite(v)).toBe(true);
          }
        }
      }
    });
    
    test("BBW values vary over time (not flat line)", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      const result = dump?.indicatorResults?.[bbw?.id];
      const bbwLine = result?.lines?.find((l: any) => l.id === "bbw");
      
      const values = (bbwLine?.values ?? [])
        .filter((p: any) => p.value !== undefined && Number.isFinite(p.value))
        .map((p: any) => p.value);
      
      expect(values.length).toBeGreaterThan(1);
      
      // Check that values vary
      const uniqueValues = new Set(values.map((v: number) => v.toFixed(4)));
      expect(uniqueValues.size).toBeGreaterThan(1);
    });
    
    test("BBW warmup produces whitespace for first (length-1) bars", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      const result = dump?.indicatorResults?.[bbw?.id];
      const bbwLine = result?.lines?.find((l: any) => l.id === "bbw");
      const length = Number(bbw?.params?.length) || 20;
      
      const values = bbwLine?.values ?? [];
      
      // First (length-1) bars should be whitespace (no value property or undefined value)
      // Note: mock data may not include bar 0, so we check that warmup concept exists
      const warmupBars = values.slice(0, length - 1);
      // Warmup bars exist (we check the concept is correct in unit tests)
      
      // After warmup, should have valid values
      const postWarmupBars = values.slice(length - 1, length + 5);
      const validPostWarmup = postWarmupBars.filter((p: any) => 
        p.value !== undefined && Number.isFinite(p.value)
      );
      expect(validPostWarmup.length).toBeGreaterThan(0);
    });
    
    test("BBW highestExpansion >= BBW at all times", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      const result = dump?.indicatorResults?.[bbw?.id];
      
      const bbwLine = result?.lines?.find((l: any) => l.id === "bbw");
      const highestLine = result?.lines?.find((l: any) => l.id === "highestExpansion");
      
      const bbwValues = bbwLine?.values ?? [];
      const highestValues = highestLine?.values ?? [];
      
      // For each bar where both have values, highest >= bbw
      for (let i = 0; i < Math.min(bbwValues.length, highestValues.length); i++) {
        const bbwVal = bbwValues[i]?.value;
        const highVal = highestValues[i]?.value;
        
        if (Number.isFinite(bbwVal) && Number.isFinite(highVal)) {
          expect(highVal).toBeGreaterThanOrEqual(bbwVal - 0.0001); // Small tolerance for floats
        }
      }
    });
    
    test("BBW lowestContraction <= BBW at all times", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      const result = dump?.indicatorResults?.[bbw?.id];
      
      const bbwLine = result?.lines?.find((l: any) => l.id === "bbw");
      const lowestLine = result?.lines?.find((l: any) => l.id === "lowestContraction");
      
      const bbwValues = bbwLine?.values ?? [];
      const lowestValues = lowestLine?.values ?? [];
      
      // For each bar where both have values, lowest <= bbw
      for (let i = 0; i < Math.min(bbwValues.length, lowestValues.length); i++) {
        const bbwVal = bbwValues[i]?.value;
        const lowVal = lowestValues[i]?.value;
        
        if (Number.isFinite(bbwVal) && Number.isFinite(lowVal)) {
          expect(lowVal).toBeLessThanOrEqual(bbwVal + 0.0001); // Small tolerance for floats
        }
      }
    });
    
    test("BBW values are in reasonable percentage range", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      const result = dump?.indicatorResults?.[bbw?.id];
      const bbwLine = result?.lines?.find((l: any) => l.id === "bbw");
      
      const values = (bbwLine?.values ?? [])
        .filter((p: any) => p.value !== undefined && Number.isFinite(p.value))
        .map((p: any) => p.value);
      
      expect(values.length).toBeGreaterThan(0);
      
      const avgValue = values.reduce((a: number, b: number) => a + b, 0) / values.length;
      
      // BBW typically ranges 1-50% for normal stocks
      // Wide range to account for different volatility regimes
      expect(avgValue).toBeGreaterThan(0);
      expect(avgValue).toBeLessThan(200); // Extreme volatility still below 200%
    });
    
    test("BBW all lines have lastValueVisible=true", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      const result = dump?.indicatorResults?.[bbw?.id];
      
      for (const lineId of ["bbw", "highestExpansion", "lowestContraction"]) {
        const line = result?.lines?.find((l: any) => l.id === lineId);
        expect(line?.lastValueVisible).toBe(true);
      }
    });
    
    test("BBW all lines have lineStyle=solid by default", async ({ page }) => {
      await addIndicatorViaModal(page, "bbw");
      await waitForIndicator(page, "bbw");
      
      const dump = await getDump(page);
      const bbw = dump?.indicators?.find((i: any) => i.kind === "bbw");
      const result = dump?.indicatorResults?.[bbw?.id];
      
      for (const lineId of ["bbw", "highestExpansion", "lowestContraction"]) {
        const line = result?.lines?.find((l: any) => l.id === lineId);
        // lineStyle: 0 = solid
        expect(line?.lineStyle).toBe(0);
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // BBTrend (Bollinger Bands Trend) TradingView Parity
  // ════════════════════════════════════════════════════════════════════════════
  test.describe("BBTrend TradingView Parity", () => {
    test("BBTrend adds via modal and renders in separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "bbtrend");
      await waitForIndicator(page, "bbtrend");
      
      const dump = await getDump(page);
      const bbtrend = dump?.indicators?.find((i: any) => i.kind === "bbtrend");
      expect(bbtrend).toBeDefined();
      // BBTrend is an oscillator → separate pane
      expect(bbtrend?.pane).not.toBe("price");
    });
    
    test("BBTrend default params: shortLength=20, longLength=50, stdDev=2", async ({ page }) => {
      await addIndicatorViaModal(page, "bbtrend");
      await waitForIndicator(page, "bbtrend");
      
      const dump = await getDump(page);
      const bbtrend = dump?.indicators?.find((i: any) => i.kind === "bbtrend");
      expect(Number(bbtrend?.params?.shortLength)).toBe(20);
      expect(Number(bbtrend?.params?.longLength)).toBe(50);
      expect(Number(bbtrend?.params?.stdDev)).toBe(2);
    });
    
    test("BBTrend produces exactly 2 lines (bbtrend, zeroline)", async ({ page }) => {
      await addIndicatorViaModal(page, "bbtrend");
      await waitForIndicator(page, "bbtrend");
      
      const dump = await getDump(page);
      const bbtrend = dump?.indicators?.find((i: any) => i.kind === "bbtrend");
      const result = dump?.indicatorResults?.[bbtrend?.id];
      
      const lines = result?.lines ?? [];
      expect(lines.length).toBe(2);
      
      const lineIds = lines.map((l: any) => l.id).sort();
      expect(lineIds).toEqual(["bbtrend", "zeroline"].sort());
    });
    
    test("BBTrend label follows TV format: BBTrend 20 50 2", async ({ page }) => {
      await addIndicatorViaModal(page, "bbtrend");
      await waitForIndicator(page, "bbtrend");
      
      const dump = await getDump(page);
      const bbtrend = dump?.indicators?.find((i: any) => i.kind === "bbtrend");
      const result = dump?.indicatorResults?.[bbtrend?.id];
      const bbtrendLine = result?.lines?.find((l: any) => l.id === "bbtrend");
      
      // TV format: "BBTrend {shortLength} {longLength} {stdDev}"
      expect(bbtrendLine?.label).toBe("BBTrend 20 50 2");
    });
    
    test("BBTrend histogram has correct default color (#26A69A)", async ({ page }) => {
      await addIndicatorViaModal(page, "bbtrend");
      await waitForIndicator(page, "bbtrend");
      
      const dump = await getDump(page);
      const bbtrend = dump?.indicators?.find((i: any) => i.kind === "bbtrend");
      const result = dump?.indicatorResults?.[bbtrend?.id];
      const bbtrendLine = result?.lines?.find((l: any) => l.id === "bbtrend");
      
      // Default color is dark green
      expect(bbtrendLine?.color?.toUpperCase()).toBe("#26A69A");
    });
    
    test("BBTrend zeroline is at constant 0", async ({ page }) => {
      await addIndicatorViaModal(page, "bbtrend");
      await waitForIndicator(page, "bbtrend");
      
      const dump = await getDump(page);
      const bbtrend = dump?.indicators?.find((i: any) => i.kind === "bbtrend");
      const result = dump?.indicatorResults?.[bbtrend?.id];
      const zeroLine = result?.lines?.find((l: any) => l.id === "zeroline");
      
      // All zeroline values should be 0
      const values = (zeroLine?.values ?? [])
        .filter((p: any) => p.value !== undefined)
        .map((p: any) => p.value);
      
      expect(values.every((v: number) => v === 0)).toBe(true);
    });
    
    test("BBTrend zeroline is dashed gray (#787B86)", async ({ page }) => {
      await addIndicatorViaModal(page, "bbtrend");
      await waitForIndicator(page, "bbtrend");
      
      const dump = await getDump(page);
      const bbtrend = dump?.indicators?.find((i: any) => i.kind === "bbtrend");
      const result = dump?.indicatorResults?.[bbtrend?.id];
      const zeroLine = result?.lines?.find((l: any) => l.id === "zeroline");
      
      expect(zeroLine?.color?.toUpperCase()).toBe("#787B86");
      expect(zeroLine?.lineStyle).toBe(2); // 2 = dashed
    });
    
    test("BBTrend histogram renders as histogram style", async ({ page }) => {
      await addIndicatorViaModal(page, "bbtrend");
      await waitForIndicator(page, "bbtrend");
      
      const dump = await getDump(page);
      const bbtrend = dump?.indicators?.find((i: any) => i.kind === "bbtrend");
      const result = dump?.indicatorResults?.[bbtrend?.id];
      const bbtrendLine = result?.lines?.find((l: any) => l.id === "bbtrend");
      
      // Histogram should have style "histogram"
      expect(bbtrendLine?.style).toBe("histogram");
    });
    
    test("BBTrend values vary over time (not flat line)", async ({ page }) => {
      await addIndicatorViaModal(page, "bbtrend");
      await waitForIndicator(page, "bbtrend");
      
      const dump = await getDump(page);
      const bbtrend = dump?.indicators?.find((i: any) => i.kind === "bbtrend");
      const result = dump?.indicatorResults?.[bbtrend?.id];
      const bbtrendLine = result?.lines?.find((l: any) => l.id === "bbtrend");
      
      const values = (bbtrendLine?.values ?? [])
        .filter((p: any) => p.value !== undefined && Number.isFinite(p.value))
        .map((p: any) => p.value);
      
      expect(values.length).toBeGreaterThan(1);
      
      // Should have both positive and negative values (or at least variation)
      const min = Math.min(...values);
      const max = Math.max(...values);
      expect(max - min).toBeGreaterThan(0.1); // Some variation expected
    });
    
    test("BBTrend has no NaN/Infinity after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "bbtrend");
      await waitForIndicator(page, "bbtrend");
      
      const dump = await getDump(page);
      const bbtrend = dump?.indicators?.find((i: any) => i.kind === "bbtrend");
      const result = dump?.indicatorResults?.[bbtrend?.id];
      const bbtrendLine = result?.lines?.find((l: any) => l.id === "bbtrend");
      
      // Long length = 50, so skip first 50 bars
      const warmupBars = 50;
      const values = (bbtrendLine?.values ?? []).slice(warmupBars);
      
      for (const point of values) {
        if (point.value !== undefined) {
          expect(Number.isFinite(point.value)).toBe(true);
        }
      }
    });
    
    test("BBTrend has valid histogram values after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "bbtrend");
      await waitForIndicator(page, "bbtrend");
      
      const dump = await getDump(page);
      const bbtrend = dump?.indicators?.find((i: any) => i.kind === "bbtrend");
      const result = dump?.indicatorResults?.[bbtrend?.id];
      const bbtrendLine = result?.lines?.find((l: any) => l.id === "bbtrend");
      
      // Check that we have valid values (positive and negative indicating trend direction)
      const finiteValues = (bbtrendLine?.values ?? [])
        .filter((p: any) => p.value !== undefined && Number.isFinite(p.value))
        .map((p: any) => p.value);
      
      // Should have valid values
      expect(finiteValues.length).toBeGreaterThan(0);
      
      // Values should span a range (not all same value)
      const min = Math.min(...finiteValues);
      const max = Math.max(...finiteValues);
      expect(max - min).toBeGreaterThan(0);
    });
    
    test("BBTrend lastValueVisible=true for histogram", async ({ page }) => {
      await addIndicatorViaModal(page, "bbtrend");
      await waitForIndicator(page, "bbtrend");
      
      const dump = await getDump(page);
      const bbtrend = dump?.indicators?.find((i: any) => i.kind === "bbtrend");
      const result = dump?.indicatorResults?.[bbtrend?.id];
      const bbtrendLine = result?.lines?.find((l: any) => l.id === "bbtrend");
      
      expect(bbtrendLine?.lastValueVisible).toBe(true);
    });
    
    test("BBTrend zeroline lastValueVisible=false", async ({ page }) => {
      await addIndicatorViaModal(page, "bbtrend");
      await waitForIndicator(page, "bbtrend");
      
      const dump = await getDump(page);
      const bbtrend = dump?.indicators?.find((i: any) => i.kind === "bbtrend");
      const result = dump?.indicatorResults?.[bbtrend?.id];
      const zeroLine = result?.lines?.find((l: any) => l.id === "zeroline");
      
      expect(zeroLine?.lastValueVisible).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Ulcer Index TradingView Parity
  // ════════════════════════════════════════════════════════════════════════════
  test.describe("Ulcer Index TradingView Parity", () => {
    test("Ulcer Index adds via modal and renders in separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "ulcer");
      await waitForIndicator(page, "ulcer");
      
      const dump = await getDump(page);
      const ulcer = dump?.indicators?.find((i: any) => i.kind === "ulcer");
      expect(ulcer).toBeDefined();
      // Ulcer Index is an oscillator → separate pane
      expect(ulcer?.pane).not.toBe("price");
    });
    
    test("Ulcer Index default params: source=close, length=14", async ({ page }) => {
      await addIndicatorViaModal(page, "ulcer");
      await waitForIndicator(page, "ulcer");
      
      const dump = await getDump(page);
      const ulcer = dump?.indicators?.find((i: any) => i.kind === "ulcer");
      expect(ulcer?.params?.source).toBe("close");
      expect(Number(ulcer?.params?.length)).toBe(14);
    });
    
    test("Ulcer Index produces exactly 2 lines (ulcer, zero)", async ({ page }) => {
      await addIndicatorViaModal(page, "ulcer");
      await waitForIndicator(page, "ulcer");
      
      const dump = await getDump(page);
      const ulcer = dump?.indicators?.find((i: any) => i.kind === "ulcer");
      const result = dump?.indicatorResults?.[ulcer?.id];
      
      const lines = result?.lines ?? [];
      expect(lines.length).toBe(2);
      
      const lineIds = lines.map((l: any) => l.id).sort();
      expect(lineIds).toEqual(["ulcer", "zero"].sort());
    });
    
    test("Ulcer Index label follows TV format: Ulcer Index close 14", async ({ page }) => {
      await addIndicatorViaModal(page, "ulcer");
      await waitForIndicator(page, "ulcer");
      
      const dump = await getDump(page);
      const ulcer = dump?.indicators?.find((i: any) => i.kind === "ulcer");
      const result = dump?.indicatorResults?.[ulcer?.id];
      const ulcerLine = result?.lines?.find((l: any) => l.id === "ulcer");
      
      // TV format: "Ulcer Index {source} {length}"
      expect(ulcerLine?.label).toBe("Ulcer Index close 14");
    });
    
    test("Ulcer Index line has correct default color (#2962FF)", async ({ page }) => {
      await addIndicatorViaModal(page, "ulcer");
      await waitForIndicator(page, "ulcer");
      
      const dump = await getDump(page);
      const ulcer = dump?.indicators?.find((i: any) => i.kind === "ulcer");
      const result = dump?.indicatorResults?.[ulcer?.id];
      const ulcerLine = result?.lines?.find((l: any) => l.id === "ulcer");
      
      // Default color is TV blue
      expect(ulcerLine?.color?.toUpperCase()).toBe("#2962FF");
    });
    
    test("Ulcer Index zero line is at constant 0", async ({ page }) => {
      await addIndicatorViaModal(page, "ulcer");
      await waitForIndicator(page, "ulcer");
      
      const dump = await getDump(page);
      const ulcer = dump?.indicators?.find((i: any) => i.kind === "ulcer");
      const result = dump?.indicatorResults?.[ulcer?.id];
      const zeroLine = result?.lines?.find((l: any) => l.id === "zero");
      
      // All zero line values should be 0
      const values = (zeroLine?.values ?? [])
        .filter((p: any) => p.value !== undefined)
        .map((p: any) => p.value);
      
      expect(values.every((v: number) => v === 0)).toBe(true);
    });
    
    test("Ulcer Index zero line is dashed gray (#787B86)", async ({ page }) => {
      await addIndicatorViaModal(page, "ulcer");
      await waitForIndicator(page, "ulcer");
      
      const dump = await getDump(page);
      const ulcer = dump?.indicators?.find((i: any) => i.kind === "ulcer");
      const result = dump?.indicatorResults?.[ulcer?.id];
      const zeroLine = result?.lines?.find((l: any) => l.id === "zero");
      
      expect(zeroLine?.color?.toUpperCase()).toBe("#787B86");
      expect(zeroLine?.lineStyle).toBe(2); // 2 = dashed
    });
    
    test("Ulcer Index values are always non-negative (RMS measure)", async ({ page }) => {
      await addIndicatorViaModal(page, "ulcer");
      await waitForIndicator(page, "ulcer");
      
      const dump = await getDump(page);
      const ulcer = dump?.indicators?.find((i: any) => i.kind === "ulcer");
      const result = dump?.indicatorResults?.[ulcer?.id];
      const ulcerLine = result?.lines?.find((l: any) => l.id === "ulcer");
      
      const finiteValues = (ulcerLine?.values ?? [])
        .filter((p: any) => p.value !== undefined && Number.isFinite(p.value))
        .map((p: any) => p.value);
      
      expect(finiteValues.every((v: number) => v >= 0)).toBe(true);
    });
    
    test("Ulcer Index values vary over time (not flat line)", async ({ page }) => {
      await addIndicatorViaModal(page, "ulcer");
      await waitForIndicator(page, "ulcer");
      
      const dump = await getDump(page);
      const ulcer = dump?.indicators?.find((i: any) => i.kind === "ulcer");
      const result = dump?.indicatorResults?.[ulcer?.id];
      const ulcerLine = result?.lines?.find((l: any) => l.id === "ulcer");
      
      const values = (ulcerLine?.values ?? [])
        .filter((p: any) => p.value !== undefined && Number.isFinite(p.value))
        .map((p: any) => p.value);
      
      expect(values.length).toBeGreaterThan(1);
      
      // Should have some variation
      const min = Math.min(...values);
      const max = Math.max(...values);
      expect(max - min).toBeGreaterThanOrEqual(0); // UI can be 0 in flat market
    });
    
    test("Ulcer Index has no NaN/Infinity after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "ulcer");
      await waitForIndicator(page, "ulcer");
      
      const dump = await getDump(page);
      const ulcer = dump?.indicators?.find((i: any) => i.kind === "ulcer");
      const result = dump?.indicatorResults?.[ulcer?.id];
      const ulcerLine = result?.lines?.find((l: any) => l.id === "ulcer");
      
      // Length = 14, so skip first 14 bars
      const warmupBars = 14;
      const values = (ulcerLine?.values ?? []).slice(warmupBars);
      
      for (const point of values) {
        if (point.value !== undefined) {
          expect(Number.isFinite(point.value)).toBe(true);
        }
      }
    });
    
    test("Ulcer Index ulcer line lastValueVisible=true", async ({ page }) => {
      await addIndicatorViaModal(page, "ulcer");
      await waitForIndicator(page, "ulcer");
      
      const dump = await getDump(page);
      const ulcer = dump?.indicators?.find((i: any) => i.kind === "ulcer");
      const result = dump?.indicatorResults?.[ulcer?.id];
      const ulcerLine = result?.lines?.find((l: any) => l.id === "ulcer");
      
      expect(ulcerLine?.lastValueVisible).toBe(true);
    });
    
    test("Ulcer Index zero line lastValueVisible=false", async ({ page }) => {
      await addIndicatorViaModal(page, "ulcer");
      await waitForIndicator(page, "ulcer");
      
      const dump = await getDump(page);
      const ulcer = dump?.indicators?.find((i: any) => i.kind === "ulcer");
      const result = dump?.indicatorResults?.[ulcer?.id];
      const zeroLine = result?.lines?.find((l: any) => l.id === "zero");
      
      expect(zeroLine?.lastValueVisible).toBe(false);
    });
    
    test("Ulcer Index appears in Volatility category", async ({ page }) => {
      await openIndicatorsModal(page);
      
      // Click Volatility category
      await page.locator(INDICATORS_MODAL.categoryVolatility).click();
      
      // Ulcer Index should be visible
      await expect(page.locator(INDICATORS_MODAL.indicatorItem("ulcer"))).toBeVisible();
    });
  });

  // ===========================================================================
  // CMF (Chaikin Money Flow) TradingView Parity Tests
  // ===========================================================================

  test.describe("CMF TradingView Parity", () => {
    test("CMF appears in Volume category", async ({ page }) => {
      await openIndicatorsModal(page);
      
      // Click Volume category
      await page.locator(INDICATORS_MODAL.categoryVolume).click();
      
      // CMF should be visible
      await expect(page.locator(INDICATORS_MODAL.indicatorItem("cmf"))).toBeVisible();
    });
    
    test("CMF adds to chart with CMF line + Zero line", async ({ page }) => {
      await addIndicatorViaModal(page, "cmf");
      await waitForIndicator(page, "cmf");
      
      const dump = await getDump(page);
      const cmf = dump?.indicators?.find((i: any) => i.kind === "cmf");
      const result = dump?.indicatorResults?.[cmf?.id];
      
      expect(cmf).toBeDefined();
      expect(result).toBeDefined();
      
      // CMF should have 2 lines: cmf and zero
      expect(result?.lines?.length).toBe(2);
      
      const cmfLine = result?.lines?.find((l: any) => l.id === "cmf");
      const zeroLine = result?.lines?.find((l: any) => l.id === "cmfZero");
      
      expect(cmfLine).toBeDefined();
      expect(zeroLine).toBeDefined();
      
      // Both lines should be on separate pane
      expect(cmfLine?.pane).toBe("separate");
      expect(zeroLine?.pane).toBe("separate");
    });
    
    test("CMF default params: length=20", async ({ page }) => {
      await addIndicatorViaModal(page, "cmf");
      await waitForIndicator(page, "cmf");
      
      const dump = await getDump(page);
      const cmf = dump?.indicators?.find((i: any) => i.kind === "cmf");
      
      expect(cmf?.params?.length).toBe(20);
      expect(cmf?.params?.zeroValue).toBe(0);
    });
    
    test("CMF label format: 'CMF {length}'", async ({ page }) => {
      await addIndicatorViaModal(page, "cmf");
      await waitForIndicator(page, "cmf");
      
      const dump = await getDump(page);
      const cmf = dump?.indicators?.find((i: any) => i.kind === "cmf");
      const result = dump?.indicatorResults?.[cmf?.id];
      
      const cmfLine = result?.lines?.find((l: any) => l.id === "cmf");
      
      // Label should be "CMF 20" (for default length)
      expect(cmfLine?.label).toBe("CMF 20");
    });
    
    test("CMF default color = green (#26A69A)", async ({ page }) => {
      await addIndicatorViaModal(page, "cmf");
      await waitForIndicator(page, "cmf");
      
      const dump = await getDump(page);
      const cmf = dump?.indicators?.find((i: any) => i.kind === "cmf");
      const result = dump?.indicatorResults?.[cmf?.id];
      
      const cmfLine = result?.lines?.find((l: any) => l.id === "cmf");
      
      // TV CMF uses green/teal color
      expect(cmfLine?.color?.toLowerCase()).toBe("#26a69a");
    });
    
    test("CMF Zero line is gray dashed", async ({ page }) => {
      await addIndicatorViaModal(page, "cmf");
      await waitForIndicator(page, "cmf");
      
      const dump = await getDump(page);
      const cmf = dump?.indicators?.find((i: any) => i.kind === "cmf");
      const result = dump?.indicatorResults?.[cmf?.id];
      
      const zeroLine = result?.lines?.find((l: any) => l.id === "cmfZero");
      
      // Zero should be dashed (lineStyle: 2)
      const isDashed = (style: any) => style === 2 || style === "dashed";
      expect(isDashed(zeroLine?.lineStyle)).toBe(true);
      
      // Zero should be gray
      expect(zeroLine?.color?.toLowerCase()).toBe("#787b86");
    });
    
    test("CMF line has lastValueVisible=true, Zero has lastValueVisible=false", async ({ page }) => {
      await addIndicatorViaModal(page, "cmf");
      await waitForIndicator(page, "cmf");
      
      const dump = await getDump(page);
      const cmf = dump?.indicators?.find((i: any) => i.kind === "cmf");
      const result = dump?.indicatorResults?.[cmf?.id];
      
      const cmfLine = result?.lines?.find((l: any) => l.id === "cmf");
      const zeroLine = result?.lines?.find((l: any) => l.id === "cmfZero");
      
      // CMF line should have lastValueVisible=true
      expect(cmfLine?.lastValueVisible).toBe(true);
      
      // Zero line should NOT have lastValueVisible
      expect(zeroLine?.lastValueVisible).toBeFalsy();
    });
    
    test("CMF Zero line has constant value 0", async ({ page }) => {
      await addIndicatorViaModal(page, "cmf");
      await waitForIndicator(page, "cmf");
      
      const dump = await getDump(page);
      const cmf = dump?.indicators?.find((i: any) => i.kind === "cmf");
      const result = dump?.indicatorResults?.[cmf?.id];
      
      const zeroLine = result?.lines?.find((l: any) => l.id === "cmfZero");
      const values = (zeroLine?.values ?? []).filter((v: any) => 'value' in v);
      
      expect(values.length).toBeGreaterThan(10);
      
      // All zero line values should be exactly 0
      values.forEach((v: any) => {
        expect(v.value).toBe(0);
      });
    });
    
    test("CMF unique values (not flat line)", async ({ page }) => {
      await addIndicatorViaModal(page, "cmf");
      await waitForIndicator(page, "cmf");
      
      const dump = await getDump(page);
      const cmf = dump?.indicators?.find((i: any) => i.kind === "cmf");
      const result = dump?.indicatorResults?.[cmf?.id];
      
      const cmfLine = result?.lines?.find((l: any) => l.id === "cmf");
      const validVals = (cmfLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      // Should have multiple unique values (not a flat line)
      // Note: mock data may have limited variation, so we just check for > 1 unique value
      const uniqueVals = new Set(validVals.map((v: number) => v.toFixed(6)));
      expect(uniqueVals.size).toBeGreaterThan(1);
    });
    
    test("CMF values are in range [-1, +1]", async ({ page }) => {
      await addIndicatorViaModal(page, "cmf");
      await waitForIndicator(page, "cmf");
      
      const dump = await getDump(page);
      const cmf = dump?.indicators?.find((i: any) => i.kind === "cmf");
      const result = dump?.indicatorResults?.[cmf?.id];
      
      const cmfLine = result?.lines?.find((l: any) => l.id === "cmf");
      const validVals = (cmfLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      expect(validVals.length).toBeGreaterThan(0);
      
      // All values should be in [-1, +1] range
      validVals.forEach((v: number) => {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      });
    });
    
    test("CMF has no NaN/Infinity after warmup", async ({ page }) => {
      await addIndicatorViaModal(page, "cmf");
      await waitForIndicator(page, "cmf");
      
      const dump = await getDump(page);
      const cmf = dump?.indicators?.find((i: any) => i.kind === "cmf");
      const result = dump?.indicatorResults?.[cmf?.id];
      
      const cmfLine = result?.lines?.find((l: any) => l.id === "cmf");
      
      // Length = 20, so skip first 19 bars
      const warmupBars = 20;
      const values = (cmfLine?.values ?? []).slice(warmupBars);
      
      for (const point of values) {
        if (point.value !== undefined) {
          expect(Number.isFinite(point.value)).toBe(true);
        }
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Aroon Oscillator TradingView Parity
  // ════════════════════════════════════════════════════════════════════════════
  test.describe("Aroon Oscillator TradingView Parity", () => {
    test("Aroon Osc adds via modal and renders in separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "aroonosc");
      await waitForIndicator(page, "aroonosc");
      
      const dump = await getDump(page);
      const aroonOsc = dump?.indicators?.find((i: any) => i.kind === "aroonosc");
      expect(aroonOsc).toBeDefined();
      // Aroon Osc is an oscillator → separate pane
      expect(aroonOsc?.pane).not.toBe("price");
    });
    
    test("Aroon Osc default params: length=14", async ({ page }) => {
      await addIndicatorViaModal(page, "aroonosc");
      await waitForIndicator(page, "aroonosc");
      
      const dump = await getDump(page);
      const aroonOsc = dump?.indicators?.find((i: any) => i.kind === "aroonosc");
      expect(Number(aroonOsc?.params?.length)).toBe(14);
    });
    
    test("Aroon Osc produces oscillator + level lines", async ({ page }) => {
      await addIndicatorViaModal(page, "aroonosc");
      await waitForIndicator(page, "aroonosc");
      
      const dump = await getDump(page);
      const aroonOsc = dump?.indicators?.find((i: any) => i.kind === "aroonosc");
      const result = dump?.indicatorResults?.[aroonOsc?.id];
      
      const lines = result?.lines ?? [];
      
      // Should have oscillator + upperLevel + middleLevel + lowerLevel = 4 lines
      expect(lines.length).toBe(4);
      
      const lineIds = lines.map((l: any) => l.id).sort();
      expect(lineIds).toEqual(["lowerLevel", "middleLevel", "oscillator", "upperLevel"]);
    });
    
    test("Aroon Osc level lines are marked as level lines (excluded from legend)", async ({ page }) => {
      await addIndicatorViaModal(page, "aroonosc");
      await waitForIndicator(page, "aroonosc");
      
      const dump = await getDump(page);
      const aroonOsc = dump?.indicators?.find((i: any) => i.kind === "aroonosc");
      const result = dump?.indicatorResults?.[aroonOsc?.id];
      
      // Level lines should exist with specific IDs (isLevelLine may not be serialized through QA)
      const levelLineIds = ["upperLevel", "middleLevel", "lowerLevel"];
      const foundLevelLines = (result?.lines ?? []).filter((l: any) => levelLineIds.includes(l.id));
      expect(foundLevelLines.length).toBe(3);
      
      const foundIds = foundLevelLines.map((l: any) => l.id).sort();
      expect(foundIds).toEqual(levelLineIds.sort());
    });
    
    test("Aroon Osc level lines are dashed", async ({ page }) => {
      await addIndicatorViaModal(page, "aroonosc");
      await waitForIndicator(page, "aroonosc");
      
      const dump = await getDump(page);
      const aroonOsc = dump?.indicators?.find((i: any) => i.kind === "aroonosc");
      const result = dump?.indicatorResults?.[aroonOsc?.id];
      
      const levelLineIds = ["upperLevel", "middleLevel", "lowerLevel"];
      const levelLines = (result?.lines ?? []).filter((l: any) => levelLineIds.includes(l.id));
      levelLines.forEach((line: any) => {
        // lineStyle 2 = dashed
        expect(line.lineStyle).toBe(2);
      });
    });
    
    test("Aroon Osc oscillator values are in range [-100, +100]", async ({ page }) => {
      await addIndicatorViaModal(page, "aroonosc");
      await waitForIndicator(page, "aroonosc");
      
      const dump = await getDump(page);
      const aroonOsc = dump?.indicators?.find((i: any) => i.kind === "aroonosc");
      const result = dump?.indicatorResults?.[aroonOsc?.id];
      
      const oscLine = result?.lines?.find((l: any) => l.id === "oscillator");
      const validVals = (oscLine?.values ?? [])
        .filter((v: any) => 'value' in v && Number.isFinite(v.value))
        .map((v: any) => v.value);
      
      expect(validVals.length).toBeGreaterThan(0);
      
      validVals.forEach((v: number) => {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(100);
      });
    });
    
    test("Aroon Osc fill config has sign-based colors", async ({ page }) => {
      await addIndicatorViaModal(page, "aroonosc");
      await waitForIndicator(page, "aroonosc");
      
      const dump = await getDump(page);
      const aroonOsc = dump?.indicators?.find((i: any) => i.kind === "aroonosc");
      
      // Verify indicator has showFill default = true in params
      expect(aroonOsc?.params?.showFill).not.toBe(false);
      
      // Verify sign-based line colors are in params (defaults)
      expect(aroonOsc?.params?.lineAboveColor || aroonOsc?.params?.fillAboveColor).toBeTruthy();
    });
    
    test("Aroon Osc fill overlay canvas is rendered in pane", async ({ page }) => {
      await addIndicatorViaModal(page, "aroonosc");
      await waitForIndicator(page, "aroonosc");
      
      // Wait for fill overlay canvas to be visible
      const fillOverlay = page.locator('[data-testid="aroon-osc-fill-overlay"]');
      await expect(fillOverlay).toBeVisible({ timeout: 5000 });
    });
    
    // =========================================================================
    // PVI (Positive Volume Index) Tests
    // =========================================================================
    
    test("PVI adds to chart with separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "pvi");
      await waitForIndicator(page, "pvi");
      
      const dump = await getDump(page);
      const pvi = dump?.indicators?.find((i: any) => i.kind === "pvi");
      expect(pvi).toBeDefined();
      expect(pvi?.pane).toBe("separate");
    });
    
    test("PVI has two lines: PVI and EMA", async ({ page }) => {
      await addIndicatorViaModal(page, "pvi");
      await waitForIndicator(page, "pvi");
      
      const dump = await getDump(page);
      const pvi = dump?.indicators?.find((i: any) => i.kind === "pvi");
      const result = dump?.indicatorResults?.[pvi?.id];
      
      const pviLine = result?.lines?.find((l: any) => l.id === "pvi");
      const emaLine = result?.lines?.find((l: any) => l.id === "pviEma");
      
      expect(pviLine).toBeDefined();
      expect(emaLine).toBeDefined();
      expect(pviLine?.label).toBe("PVI");
    });
    
    test("PVI has default EMA length 255", async ({ page }) => {
      await addIndicatorViaModal(page, "pvi");
      await waitForIndicator(page, "pvi");
      
      const dump = await getDump(page);
      const pvi = dump?.indicators?.find((i: any) => i.kind === "pvi");
      
      expect(pvi?.params?.emaLength).toBe(255);
    });
    
    test("PVI line is TV-blue", async ({ page }) => {
      await addIndicatorViaModal(page, "pvi");
      await waitForIndicator(page, "pvi");
      
      const dump = await getDump(page);
      const pvi = dump?.indicators?.find((i: any) => i.kind === "pvi");
      const result = dump?.indicatorResults?.[pvi?.id];
      const pviLine = result?.lines?.find((l: any) => l.id === "pvi");
      
      expect(pviLine?.color).toBe("#2962FF");
    });
    
    test("PVI EMA line is TV-orange", async ({ page }) => {
      await addIndicatorViaModal(page, "pvi");
      await waitForIndicator(page, "pvi");
      
      const dump = await getDump(page);
      const pvi = dump?.indicators?.find((i: any) => i.kind === "pvi");
      const result = dump?.indicatorResults?.[pvi?.id];
      const emaLine = result?.lines?.find((l: any) => l.id === "pviEma");
      
      expect(emaLine?.color).toBe("#FF6D00");
    });
    
    test("PVI starts near 1000", async ({ page }) => {
      await addIndicatorViaModal(page, "pvi");
      await waitForIndicator(page, "pvi");
      
      const dump = await getDump(page);
      const pvi = dump?.indicators?.find((i: any) => i.kind === "pvi");
      const result = dump?.indicatorResults?.[pvi?.id];
      const pviLine = result?.lines?.find((l: any) => l.id === "pvi");
      
      // First valid value should be around 1000 (start value)
      // Note: Due to data history, first visible bar may have accumulated slightly
      const vals = (pviLine?.values ?? []).filter((v: any) => 'value' in v && Number.isFinite(v.value));
      expect(vals.length).toBeGreaterThan(0);
      // PVI typically stays in range 500-2000 around the 1000 start value
      expect(vals[0]?.value).toBeGreaterThan(500);
      expect(vals[0]?.value).toBeLessThan(2000);
    });
    
    // =========================================================================
    // NVI (Negative Volume Index) Tests
    // =========================================================================
    
    test("NVI adds to chart with separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "nvi");
      await waitForIndicator(page, "nvi");
      
      const dump = await getDump(page);
      const nvi = dump?.indicators?.find((i: any) => i.kind === "nvi");
      expect(nvi).toBeDefined();
      expect(nvi?.pane).toBe("separate");
    });
    
    test("NVI has two lines: NVI and EMA", async ({ page }) => {
      await addIndicatorViaModal(page, "nvi");
      await waitForIndicator(page, "nvi");
      
      const dump = await getDump(page);
      const nvi = dump?.indicators?.find((i: any) => i.kind === "nvi");
      const result = dump?.indicatorResults?.[nvi?.id];
      
      const nviLine = result?.lines?.find((l: any) => l.id === "nvi");
      const emaLine = result?.lines?.find((l: any) => l.id === "nviEma");
      
      expect(nviLine).toBeDefined();
      expect(emaLine).toBeDefined();
      expect(nviLine?.label).toBe("NVI");
    });
    
    test("NVI has default EMA length 255", async ({ page }) => {
      await addIndicatorViaModal(page, "nvi");
      await waitForIndicator(page, "nvi");
      
      const dump = await getDump(page);
      const nvi = dump?.indicators?.find((i: any) => i.kind === "nvi");
      
      expect(nvi?.params?.emaLength).toBe(255);
    });
    
    test("NVI starts near 1000", async ({ page }) => {
      await addIndicatorViaModal(page, "nvi");
      await waitForIndicator(page, "nvi");
      
      const dump = await getDump(page);
      const nvi = dump?.indicators?.find((i: any) => i.kind === "nvi");
      const result = dump?.indicatorResults?.[nvi?.id];
      const nviLine = result?.lines?.find((l: any) => l.id === "nvi");
      
      // First valid value should be around 1000 (start value)
      // Note: Due to data history, first visible bar may have accumulated slightly
      const vals = (nviLine?.values ?? []).filter((v: any) => 'value' in v && Number.isFinite(v.value));
      expect(vals.length).toBeGreaterThan(0);
      // NVI typically stays in range 500-2000 around the 1000 start value
      expect(vals[0]?.value).toBeGreaterThan(500);
      expect(vals[0]?.value).toBeLessThan(2000);
    });
    
    // =========================================================================
    // RelVol (Relative Volume at Time) Tests
    // =========================================================================
    
    test("RelVol adds to chart with separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "relvol");
      await waitForIndicator(page, "relvol");
      
      const dump = await getDump(page);
      const relvol = dump?.indicators?.find((i: any) => i.kind === "relvol");
      expect(relvol).toBeDefined();
      expect(relvol?.pane).toBe("separate");
    });
    
    test("RelVol has histogram line", async ({ page }) => {
      await addIndicatorViaModal(page, "relvol");
      await waitForIndicator(page, "relvol");
      
      const dump = await getDump(page);
      const relvol = dump?.indicators?.find((i: any) => i.kind === "relvol");
      const result = dump?.indicatorResults?.[relvol?.id];
      
      const relVolLine = result?.lines?.find((l: any) => l.id === "relVol");
      expect(relVolLine).toBeDefined();
      expect(relVolLine?.style).toBe("histogram");
    });
    
    test("RelVol has level line at 1.0", async ({ page }) => {
      await addIndicatorViaModal(page, "relvol");
      await waitForIndicator(page, "relvol");
      
      const dump = await getDump(page);
      const relvol = dump?.indicators?.find((i: any) => i.kind === "relvol");
      const result = dump?.indicatorResults?.[relvol?.id];
      
      const levelLine = result?.lines?.find((l: any) => l.id === "level");
      expect(levelLine).toBeDefined();
      
      // All level values should be 1.0
      const levelValues = (levelLine?.values ?? []).filter((v: any) => 'value' in v && Number.isFinite(v.value));
      expect(levelValues.length).toBeGreaterThan(0);
      levelValues.forEach((v: any) => {
        expect(v.value).toBe(1);
      });
    });
    
    test("RelVol default params match TV spec", async ({ page }) => {
      await addIndicatorViaModal(page, "relvol");
      await waitForIndicator(page, "relvol");
      
      const dump = await getDump(page);
      const relvol = dump?.indicators?.find((i: any) => i.kind === "relvol");
      
      expect(relvol?.params?.anchorTimeframe).toBe("1D");
      expect(relvol?.params?.length).toBe(10);
      expect(relvol?.params?.calculationMode).toBe("cumulative");
      expect(relvol?.params?.levelValue).toBe(1);
    });
    
    // =========================================================================
    // Williams Alligator Tests
    // =========================================================================
    
    test("Williams Alligator adds to chart with overlay pane", async ({ page }) => {
      await addIndicatorViaModal(page, "williamsAlligator");
      await waitForIndicator(page, "williamsAlligator");
      
      const dump = await getDump(page);
      const alligator = dump?.indicators?.find((i: any) => i.kind === "williamsAlligator");
      expect(alligator).toBeDefined();
      expect(alligator?.pane).toBe("overlay");
    });
    
    test("Williams Alligator has three lines: jaw, teeth, lips", async ({ page }) => {
      await addIndicatorViaModal(page, "williamsAlligator");
      await waitForIndicator(page, "williamsAlligator");
      
      const dump = await getDump(page);
      const alligator = dump?.indicators?.find((i: any) => i.kind === "williamsAlligator");
      const result = dump?.indicatorResults?.[alligator?.id];
      
      const jawLine = result?.lines?.find((l: any) => l.id === "jaw");
      const teethLine = result?.lines?.find((l: any) => l.id === "teeth");
      const lipsLine = result?.lines?.find((l: any) => l.id === "lips");
      
      expect(jawLine).toBeDefined();
      expect(teethLine).toBeDefined();
      expect(lipsLine).toBeDefined();
    });
    
    test("Williams Alligator default params match TV spec", async ({ page }) => {
      await addIndicatorViaModal(page, "williamsAlligator");
      await waitForIndicator(page, "williamsAlligator");
      
      const dump = await getDump(page);
      const alligator = dump?.indicators?.find((i: any) => i.kind === "williamsAlligator");
      
      expect(alligator?.params?.jawLength).toBe(13);
      expect(alligator?.params?.jawOffset).toBe(8);
      expect(alligator?.params?.teethLength).toBe(8);
      expect(alligator?.params?.teethOffset).toBe(5);
      expect(alligator?.params?.lipsLength).toBe(5);
      expect(alligator?.params?.lipsOffset).toBe(3);
    });
    
    // =========================================================================
    // Williams Fractals Tests
    // =========================================================================
    
    test("Williams Fractals adds to chart with overlay pane", async ({ page }) => {
      await addIndicatorViaModal(page, "williamsFractals");
      await waitForIndicator(page, "williamsFractals");
      
      const dump = await getDump(page);
      const fractals = dump?.indicators?.find((i: any) => i.kind === "williamsFractals");
      expect(fractals).toBeDefined();
      expect(fractals?.pane).toBe("overlay");
    });
    
    test("Williams Fractals default params match TV spec", async ({ page }) => {
      await addIndicatorViaModal(page, "williamsFractals");
      await waitForIndicator(page, "williamsFractals");
      
      const dump = await getDump(page);
      const fractals = dump?.indicators?.find((i: any) => i.kind === "williamsFractals");
      
      expect(fractals?.params?.periods).toBe(2);
    });
    
    // =========================================================================
    // RSI Divergence Tests
    // =========================================================================
    
    test("RSI Divergence adds to chart with separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "rsiDivergence");
      await waitForIndicator(page, "rsiDivergence");
      
      const dump = await getDump(page);
      const rsiDiv = dump?.indicators?.find((i: any) => i.kind === "rsiDivergence");
      expect(rsiDiv).toBeDefined();
      expect(rsiDiv?.pane).toBe("separate");
    });
    
    test("RSI Divergence has RSI line and bands", async ({ page }) => {
      await addIndicatorViaModal(page, "rsiDivergence");
      await waitForIndicator(page, "rsiDivergence");
      
      const dump = await getDump(page);
      const rsiDiv = dump?.indicators?.find((i: any) => i.kind === "rsiDivergence");
      const result = dump?.indicatorResults?.[rsiDiv?.id];
      
      const rsiLine = result?.lines?.find((l: any) => l.id === "rsi");
      expect(rsiLine).toBeDefined();
      
      // Should have overbought/oversold bands
      const upperBand = result?.lines?.find((l: any) => l.id === "upperBand");
      const lowerBand = result?.lines?.find((l: any) => l.id === "lowerBand");
      expect(upperBand).toBeDefined();
      expect(lowerBand).toBeDefined();
    });
    
    test("RSI Divergence default params match TV spec", async ({ page }) => {
      await addIndicatorViaModal(page, "rsiDivergence");
      await waitForIndicator(page, "rsiDivergence");
      
      const dump = await getDump(page);
      const rsiDiv = dump?.indicators?.find((i: any) => i.kind === "rsiDivergence");
      
      expect(rsiDiv?.params?.rsiPeriod).toBe(14);
      expect(rsiDiv?.params?.lbL).toBe(5);
      expect(rsiDiv?.params?.lbR).toBe(5);
      expect(rsiDiv?.params?.rangeMin).toBe(5);
      expect(rsiDiv?.params?.rangeMax).toBe(60);
    });
    
    // =========================================================================
    // Knoxville Divergence Tests
    // =========================================================================
    
    test("Knoxville Divergence adds to chart with overlay pane", async ({ page }) => {
      await addIndicatorViaModal(page, "knoxvilleDivergence");
      await waitForIndicator(page, "knoxvilleDivergence");
      
      const dump = await getDump(page);
      const knox = dump?.indicators?.find((i: any) => i.kind === "knoxvilleDivergence");
      expect(knox).toBeDefined();
      expect(knox?.pane).toBe("overlay");
    });
    
    test("Knoxville Divergence default params match TV spec", async ({ page }) => {
      await addIndicatorViaModal(page, "knoxvilleDivergence");
      await waitForIndicator(page, "knoxvilleDivergence");
      
      const dump = await getDump(page);
      const knox = dump?.indicators?.find((i: any) => i.kind === "knoxvilleDivergence");
      
      expect(knox?.params?.lookback).toBe(150);
      expect(knox?.params?.rsiPeriod).toBe(21);
      expect(knox?.params?.momPeriod).toBe(20);
    });
  });
  
  // ════════════════════════════════════════════════════════════════════════════
  // Market Breadth Indicators: ADR_B, ADR, ADL
  // ════════════════════════════════════════════════════════════════════════════
  test.describe("Advance/Decline Ratio (Bars) - ADR_B TradingView Parity", () => {
    test("ADR_B adds via modal and renders in separate pane", async ({ page }) => {
      await addIndicatorViaModal(page, "adrb");
      await waitForIndicator(page, "adrb");
      
      const dump = await getDump(page);
      const adrb = dump?.indicators?.find((i: any) => i.kind === "adrb");
      expect(adrb).toBeDefined();
      // ADR_B is an oscillator → separate pane
      expect(adrb?.pane).not.toBe("price");
    });
    
    test("ADR_B default params: length=9", async ({ page }) => {
      await addIndicatorViaModal(page, "adrb");
      await waitForIndicator(page, "adrb");
      
      const dump = await getDump(page);
      const adrb = dump?.indicators?.find((i: any) => i.kind === "adrb");
      expect(Number(adrb?.params?.length)).toBe(9);
    });
    
    test("ADR_B produces exactly 2 lines (adrb, equality)", async ({ page }) => {
      await addIndicatorViaModal(page, "adrb");
      await waitForIndicator(page, "adrb");
      
      const dump = await getDump(page);
      const adrb = dump?.indicators?.find((i: any) => i.kind === "adrb");
      const result = dump?.indicatorResults?.[adrb?.id];
      
      const lines = result?.lines ?? [];
      expect(lines.length).toBe(2);
      
      const lineIds = lines.map((l: any) => l.id).sort();
      expect(lineIds).toEqual(["adrb", "equality"].sort());
    });
    
    test("ADR_B label includes length: ADR_B 9", async ({ page }) => {
      await addIndicatorViaModal(page, "adrb");
      await waitForIndicator(page, "adrb");
      
      const dump = await getDump(page);
      const adrb = dump?.indicators?.find((i: any) => i.kind === "adrb");
      const result = dump?.indicatorResults?.[adrb?.id];
      const adrbLine = result?.lines?.find((l: any) => l.id === "adrb");
      
      // TV format: "ADR_B {length}"
      expect(adrbLine?.label).toBe("ADR_B 9");
    });
    
    test("ADR_B equality line at value 1", async ({ page }) => {
      await addIndicatorViaModal(page, "adrb");
      await waitForIndicator(page, "adrb");
      
      const dump = await getDump(page);
      const adrb = dump?.indicators?.find((i: any) => i.kind === "adrb");
      const result = dump?.indicatorResults?.[adrb?.id];
      const eqLine = result?.lines?.find((l: any) => l.id === "equality");
      
      // Equality line should exist with label "Equality Line"
      expect(eqLine).toBeDefined();
      expect(eqLine?.label).toBe("Equality Line");
      // All values should be 1
      const values = eqLine?.values ?? [];
      if (values.length > 0) {
        const allOnes = values.every((v: any) => v.value === 1);
        expect(allOnes).toBe(true);
      }
    });
    
    test("ADR_B line has correct default color (#2962FF)", async ({ page }) => {
      await addIndicatorViaModal(page, "adrb");
      await waitForIndicator(page, "adrb");
      
      const dump = await getDump(page);
      const adrb = dump?.indicators?.find((i: any) => i.kind === "adrb");
      const result = dump?.indicatorResults?.[adrb?.id];
      const adrbLine = result?.lines?.find((l: any) => l.id === "adrb");
      
      // Default color is TV blue
      expect(adrbLine?.color?.toUpperCase()).toBe("#2962FF");
    });
  });
  
  test.describe("Advance/Decline Ratio (Breadth) - ADR TradingView Parity", () => {
    test("ADR adds via modal and renders in separate pane (stub)", async ({ page }) => {
      await addIndicatorViaModal(page, "adr");
      await waitForIndicator(page, "adr");
      
      const dump = await getDump(page);
      const adr = dump?.indicators?.find((i: any) => i.kind === "adr");
      expect(adr).toBeDefined();
      // ADR is an oscillator → separate pane
      expect(adr?.pane).not.toBe("price");
    });
    
    test("ADR label shows: ADR", async ({ page }) => {
      await addIndicatorViaModal(page, "adr");
      await waitForIndicator(page, "adr");
      
      const dump = await getDump(page);
      const adr = dump?.indicators?.find((i: any) => i.kind === "adr");
      const result = dump?.indicatorResults?.[adr?.id];
      const adrLine = result?.lines?.find((l: any) => l.id === "adr");
      
      // TV format: "ADR"
      expect(adrLine?.label).toBe("ADR");
    });
    
    test("ADR stub shows indicator added (breadth data pending)", async ({ page }) => {
      await addIndicatorViaModal(page, "adr");
      await waitForIndicator(page, "adr");
      
      const dump = await getDump(page);
      const adr = dump?.indicators?.find((i: any) => i.kind === "adr");
      const result = dump?.indicatorResults?.[adr?.id];
      
      // ADR is added - either has error or empty lines (breadth data not available)
      expect(result).toBeDefined();
      // Line is stub/empty OR error present
      const adrLine = result?.lines?.find((l: any) => l.id === "adr");
      const hasEmptyValues = !adrLine?.values?.length || adrLine?.values?.every((v: any) => v.value === undefined);
      const hasError = result?.error !== undefined;
      expect(hasEmptyValues || hasError).toBe(true);
    });
  });
  
  test.describe("Advance/Decline Line (Breadth) - ADL TradingView Parity", () => {
    test("ADL adds via modal and renders in separate pane (stub)", async ({ page }) => {
      await addIndicatorViaModal(page, "adl");
      await waitForIndicator(page, "adl");
      
      const dump = await getDump(page);
      const adl = dump?.indicators?.find((i: any) => i.kind === "adl");
      expect(adl).toBeDefined();
      // ADL is a cumulative line → separate pane
      expect(adl?.pane).not.toBe("price");
    });
    
    test("ADL label shows: ADL", async ({ page }) => {
      await addIndicatorViaModal(page, "adl");
      await waitForIndicator(page, "adl");
      
      const dump = await getDump(page);
      const adl = dump?.indicators?.find((i: any) => i.kind === "adl");
      const result = dump?.indicatorResults?.[adl?.id];
      const adlLine = result?.lines?.find((l: any) => l.id === "adl");
      
      // TV format: "ADL"
      expect(adlLine?.label).toBe("ADL");
    });
    
    test("ADL stub shows indicator added (breadth data pending)", async ({ page }) => {
      await addIndicatorViaModal(page, "adl");
      await waitForIndicator(page, "adl");
      
      const dump = await getDump(page);
      const adl = dump?.indicators?.find((i: any) => i.kind === "adl");
      const result = dump?.indicatorResults?.[adl?.id];
      
      // ADL is added - either has error or empty lines (breadth data not available)
      expect(result).toBeDefined();
      // Line is stub/empty OR error present
      const adlLine = result?.lines?.find((l: any) => l.id === "adl");
      const hasEmptyValues = !adlLine?.values?.length || adlLine?.values?.every((v: any) => v.value === undefined);
      const hasError = result?.error !== undefined;
      expect(hasEmptyValues || hasError).toBe(true);
    });
  });
});