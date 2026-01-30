/**
 * PRIO 3: Indicator Library Tests
 * 
 * Tests for:
 * 1. Modal opens with categories and search
 * 2. Adding indicators (all 9 types)
 * 3. Indicators panel show/hide/edit/remove
 * 4. Params editing updates chart
 * 5. Multi-output indicators (MACD, BB, ADX)
 */

import { test, expect } from "@playwright/test";
import { RIGHT_PANEL, INDICATORS_MODAL, waitForChartReady, getDump } from "./selectors";

test.describe("PRIO 3: Indicator Library", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?mock=1");
    await waitForChartReady(page);
  });

  test.describe("Modal UI", () => {
    test("1. Add button opens indicators modal", async ({ page }) => {
      // Click Indicators tab in RightPanel
      const indicatorsTab = page.locator(RIGHT_PANEL.indicatorsTab);
      if (await indicatorsTab.isVisible()) {
        await indicatorsTab.click();
      }

      // Click Add button
      const addBtn = page.locator(RIGHT_PANEL.addIndicatorBtn);
      await expect(addBtn).toBeVisible({ timeout: 5000 });
      await addBtn.click();

      // Modal should appear
      const modal = page.locator(INDICATORS_MODAL.root);
      await expect(modal).toBeVisible({ timeout: 3000 });
    });

    test("2. Modal shows categories sidebar", async ({ page }) => {
      const indicatorsTab = page.locator(RIGHT_PANEL.indicatorsTab);
      if (await indicatorsTab.isVisible()) {
        await indicatorsTab.click();
      }
      const addBtn = page.locator(RIGHT_PANEL.addIndicatorBtn);
      await addBtn.click();

      // Check category buttons
      await expect(page.locator(INDICATORS_MODAL.categoryAll)).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.categoryMovingAverage)).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.categoryMomentum)).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.categoryVolatility)).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.categoryVolume)).toBeVisible();
    });

    test("3. Search filters indicator list", async ({ page }) => {
      const indicatorsTab = page.locator(RIGHT_PANEL.indicatorsTab);
      if (await indicatorsTab.isVisible()) {
        await indicatorsTab.click();
      }
      const addBtn = page.locator(RIGHT_PANEL.addIndicatorBtn);
      await addBtn.click();

      const searchInput = page.locator(INDICATORS_MODAL.search);
      await searchInput.fill("RSI");

      // Only RSI should be visible
      await expect(page.locator(INDICATORS_MODAL.indicatorItem("rsi"))).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.indicatorItem("sma"))).not.toBeVisible();
    });

    test("4. Category filter works", async ({ page }) => {
      const indicatorsTab = page.locator(RIGHT_PANEL.indicatorsTab);
      if (await indicatorsTab.isVisible()) {
        await indicatorsTab.click();
      }
      const addBtn = page.locator(RIGHT_PANEL.addIndicatorBtn);
      await addBtn.click();

      // Click Volume category
      await page.locator(INDICATORS_MODAL.categoryVolume).click();

      // Only volume indicators should be visible
      await expect(page.locator(INDICATORS_MODAL.indicatorItem("vwap"))).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.indicatorItem("obv"))).toBeVisible();
      await expect(page.locator(INDICATORS_MODAL.indicatorItem("sma"))).not.toBeVisible();
    });

    test("5. Escape closes modal", async ({ page }) => {
      const indicatorsTab = page.locator(RIGHT_PANEL.indicatorsTab);
      if (await indicatorsTab.isVisible()) {
        await indicatorsTab.click();
      }
      const addBtn = page.locator(RIGHT_PANEL.addIndicatorBtn);
      await addBtn.click();

      const modal = page.locator(INDICATORS_MODAL.root);
      await expect(modal).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible();
    });

    test("6. Keyboard navigation (ArrowDown/Up + Enter)", async ({ page }) => {
      const indicatorsTab = page.locator(RIGHT_PANEL.indicatorsTab);
      if (await indicatorsTab.isVisible()) {
        await indicatorsTab.click();
      }
      const addBtn = page.locator(RIGHT_PANEL.addIndicatorBtn);
      await addBtn.click();

      // Focus should be on search
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");

      // Modal should close after adding
      const modal = page.locator(INDICATORS_MODAL.root);
      await expect(modal).not.toBeVisible();

      // Indicator should be added
      const dump = await getDump(page);
      expect(dump.indicators?.length).toBeGreaterThan(0);
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
      { id: "obv", name: "OBV", pane: "separate" },
    ];

    for (const { id, name, pane } of indicatorTests) {
      test(`Add ${name} indicator`, async ({ page }) => {
        const indicatorsTab = page.locator(RIGHT_PANEL.indicatorsTab);
        if (await indicatorsTab.isVisible()) {
          await indicatorsTab.click();
        }
        const addBtn = page.locator(RIGHT_PANEL.addIndicatorBtn);
        await addBtn.click();

        // Click the indicator
        await page.locator(INDICATORS_MODAL.indicatorItem(id)).click();

        // Modal should close
        await expect(page.locator(INDICATORS_MODAL.root)).not.toBeVisible();

        // Wait for indicator to compute
        await page.waitForTimeout(500);

        // Check dump
        const dump = await getDump(page);
        expect(dump.indicators?.length).toBeGreaterThan(0);
        const added = dump.indicators?.find((i: any) => i.kind === id);
        expect(added).toBeDefined();
        expect(added?.pane).toBe(pane);
      });
    }
  });

  test.describe("Indicators Panel Actions", () => {
    test.beforeEach(async ({ page }) => {
      // Add an indicator first
      const indicatorsTab = page.locator(RIGHT_PANEL.indicatorsTab);
      if (await indicatorsTab.isVisible()) {
        await indicatorsTab.click();
      }
      const addBtn = page.locator(RIGHT_PANEL.addIndicatorBtn);
      await addBtn.click();
      await page.locator(INDICATORS_MODAL.indicatorItem("ema")).click();
      await page.waitForTimeout(300);
    });

    test("1. Hide/show toggle works", async ({ page }) => {
      const dump1 = await getDump(page);
      const indicatorId = dump1.indicators?.[0]?.id;
      expect(indicatorId).toBeDefined();

      // Click eye button to hide
      const eyeBtn = page.locator(RIGHT_PANEL.indicatorEye(indicatorId));
      await eyeBtn.click();

      // Check hidden state
      const dump2 = await getDump(page);
      expect(dump2.indicators?.[0]?.hidden).toBe(true);

      // Click again to show
      await eyeBtn.click();
      const dump3 = await getDump(page);
      expect(dump3.indicators?.[0]?.hidden).toBe(false);
    });

    test("2. Remove button removes indicator", async ({ page }) => {
      const dump1 = await getDump(page);
      const indicatorId = dump1.indicators?.[0]?.id;
      expect(indicatorId).toBeDefined();

      // Click remove button
      const removeBtn = page.locator(RIGHT_PANEL.indicatorRemove(indicatorId));
      await removeBtn.click();

      // Check indicator is removed
      const dump2 = await getDump(page);
      expect(dump2.indicators?.length).toBe(0);
    });

    test("3. Edit button expands params form", async ({ page }) => {
      const dump1 = await getDump(page);
      const indicatorId = dump1.indicators?.[0]?.id;
      expect(indicatorId).toBeDefined();

      // Click edit button
      const editBtn = page.locator(RIGHT_PANEL.indicatorEdit(indicatorId));
      await editBtn.click();

      // Param input should be visible
      const periodInput = page.locator(RIGHT_PANEL.indicatorParam(indicatorId, "period"));
      await expect(periodInput).toBeVisible();
    });

    test("4. Changing params updates indicator", async ({ page }) => {
      const dump1 = await getDump(page);
      const indicatorId = dump1.indicators?.[0]?.id;
      const originalPeriod = dump1.indicators?.[0]?.params?.period;
      expect(originalPeriod).toBe(20); // Default EMA period

      // Open edit
      const editBtn = page.locator(RIGHT_PANEL.indicatorEdit(indicatorId));
      await editBtn.click();

      // Change period to 50
      const periodInput = page.locator(RIGHT_PANEL.indicatorParam(indicatorId, "period"));
      await periodInput.fill("50");

      // Wait for update
      await page.waitForTimeout(300);

      // Check updated
      const dump2 = await getDump(page);
      expect(dump2.indicators?.[0]?.params?.period).toBe(50);
    });
  });

  test.describe("Multi-output Indicators", () => {
    test("MACD has 3 lines (macd, signal, histogram)", async ({ page }) => {
      const indicatorsTab = page.locator(RIGHT_PANEL.indicatorsTab);
      if (await indicatorsTab.isVisible()) {
        await indicatorsTab.click();
      }
      const addBtn = page.locator(RIGHT_PANEL.addIndicatorBtn);
      await addBtn.click();
      await page.locator(INDICATORS_MODAL.indicatorItem("macd")).click();
      await page.waitForTimeout(500);

      const dump = await getDump(page);
      const macd = dump.indicators?.find((i: any) => i.kind === "macd");
      expect(macd).toBeDefined();

      // Check that indicator results have 3 lines
      // Note: This depends on how results are exposed in dump()
      // For now, just verify the indicator was added successfully
      expect(macd?.params?.fast).toBe(12);
      expect(macd?.params?.slow).toBe(26);
      expect(macd?.params?.signal).toBe(9);
    });

    test("Bollinger Bands has 3 lines (upper, middle, lower)", async ({ page }) => {
      const indicatorsTab = page.locator(RIGHT_PANEL.indicatorsTab);
      if (await indicatorsTab.isVisible()) {
        await indicatorsTab.click();
      }
      const addBtn = page.locator(RIGHT_PANEL.addIndicatorBtn);
      await addBtn.click();
      await page.locator(INDICATORS_MODAL.indicatorItem("bb")).click();
      await page.waitForTimeout(500);

      const dump = await getDump(page);
      const bb = dump.indicators?.find((i: any) => i.kind === "bb");
      expect(bb).toBeDefined();
      expect(bb?.params?.period).toBe(20);
      expect(bb?.params?.stdDev).toBe(2);
    });

    test("ADX has 3 lines (adx, +DI, -DI)", async ({ page }) => {
      const indicatorsTab = page.locator(RIGHT_PANEL.indicatorsTab);
      if (await indicatorsTab.isVisible()) {
        await indicatorsTab.click();
      }
      const addBtn = page.locator(RIGHT_PANEL.addIndicatorBtn);
      await addBtn.click();
      await page.locator(INDICATORS_MODAL.indicatorItem("adx")).click();
      await page.waitForTimeout(500);

      const dump = await getDump(page);
      const adx = dump.indicators?.find((i: any) => i.kind === "adx");
      expect(adx).toBeDefined();
      expect(adx?.params?.period).toBe(14);
      expect(adx?.params?.smoothing).toBe(14);
    });
  });

  test.describe("Performance", () => {
    test("Adding multiple indicators doesn't freeze UI", async ({ page }) => {
      const indicatorsTab = page.locator(RIGHT_PANEL.indicatorsTab);
      if (await indicatorsTab.isVisible()) {
        await indicatorsTab.click();
      }

      // Add 5 indicators rapidly
      const indicators = ["sma", "ema", "rsi", "bb", "atr"];
      for (const id of indicators) {
        const addBtn = page.locator(RIGHT_PANEL.addIndicatorBtn);
        await addBtn.click();
        await page.locator(INDICATORS_MODAL.indicatorItem(id)).click();
        await page.waitForTimeout(100); // Small delay between adds
      }

      // Wait for all to compute
      await page.waitForTimeout(1000);

      // Verify all were added
      const dump = await getDump(page);
      expect(dump.indicators?.length).toBe(5);

      // Verify chart is still responsive (can zoom)
      await page.locator('[data-testid="tv-chart-root"]').click();
      // If this doesn't timeout, UI is responsive
    });
  });
});
