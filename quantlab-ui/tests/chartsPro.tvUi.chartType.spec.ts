/**
 * chartsPro.tvUi.chartType.spec.ts
 * TV-10.1: Chart Type Selector Tests
 *
 * TradingView-parity chart type switching (Candles/Bars/Line/Area)
 * with localStorage persistence and deterministic rendering verification.
 *
 * Sprint TV-10.1 Scope:
 * - Dropdown UI (open/close, Esc, click outside)
 * - Type switching updates dump().ui.chartType
 * - Chart continues rendering (canvas.w/h > 0, dataLen > 0)
 * - Persistence: cp.chart.type localStorage → reload restores
 * - No regressions: RightPanel/LeftToolbar still visible after switch
 *
 * Run deterministic: npx playwright test tests/chartsPro.tvUi.chartType.spec.ts --repeat-each=10
 */

import { test, expect } from "@playwright/test";
import { gotoChartsPro, waitForChartData } from "./helpers/chartsProNav";

test.describe("TV-10.1: Chart Type Selector", () => {
  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page, { mock: true });
    await waitForChartData(page);
  });

  test.describe("Dropdown UI", () => {
    test("chart type button is visible with default 'Candles'", async ({ page }) => {
      const btn = page.locator('[data-testid="chart-type-button"]');
      await expect(btn).toBeVisible();
      await expect(btn).toContainText("Candles");

      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.chartType).toBe("candles");
    });

    test("clicking button opens dropdown", async ({ page }) => {
      const btn = page.locator('[data-testid="chart-type-button"]');
      await btn.click();

      const dropdown = page.locator('[data-testid="chart-type-dropdown"]');
      await expect(dropdown).toBeVisible();

      // Verify all 4 options exist
      await expect(page.locator('[data-testid="chart-type-option-candles"]')).toBeVisible();
      await expect(page.locator('[data-testid="chart-type-option-bars"]')).toBeVisible();
      await expect(page.locator('[data-testid="chart-type-option-line"]')).toBeVisible();
      await expect(page.locator('[data-testid="chart-type-option-area"]')).toBeVisible();
    });

    test("Esc closes dropdown", async ({ page }) => {
      const btn = page.locator('[data-testid="chart-type-button"]');
      await btn.click();

      const dropdown = page.locator('[data-testid="chart-type-dropdown"]');
      await expect(dropdown).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(dropdown).not.toBeVisible();
    });

    test("clicking outside closes dropdown", async ({ page }) => {
      const btn = page.locator('[data-testid="chart-type-button"]');
      await btn.click();

      const dropdown = page.locator('[data-testid="chart-type-dropdown"]');
      await expect(dropdown).toBeVisible();

      // Click somewhere else (chart area)
      await page.locator('[data-testid="tv-chart-root"]').click({ position: { x: 100, y: 100 } });
      await page.waitForTimeout(200);

      await expect(dropdown).not.toBeVisible();
    });
  });

  test.describe("Type Switching", () => {
    test("switch to Bars updates dump().ui.chartType and chart renders", async ({ page }) => {
      const btn = page.locator('[data-testid="chart-type-button"]');
      await btn.click();

      await page.locator('[data-testid="chart-type-option-bars"]').click();
      await page.waitForTimeout(500);

      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.chartType).toBe("bars");
      expect(dump.render.seriesType).toBe("bars");
      expect(dump.render.dataLen).toBeGreaterThan(0);
      expect(dump.render.canvas.w).toBeGreaterThan(0);
      expect(dump.render.canvas.h).toBeGreaterThan(0);

      await expect(btn).toContainText("Bars");
    });

    test("switch to Line updates dump() and chart renders", async ({ page }) => {
      const btn = page.locator('[data-testid="chart-type-button"]');
      await btn.click();

      await page.locator('[data-testid="chart-type-option-line"]').click();
      await page.waitForTimeout(500);

      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.chartType).toBe("line");
      expect(dump.render.seriesType).toBe("line");
      expect(dump.render.dataLen).toBeGreaterThan(0);
      expect(dump.render.canvas.w).toBeGreaterThan(0);
    });

    test("switch to Area updates dump() and chart renders", async ({ page }) => {
      const btn = page.locator('[data-testid="chart-type-button"]');
      await btn.click();

      await page.locator('[data-testid="chart-type-option-area"]').click();
      await page.waitForTimeout(500);

      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.chartType).toBe("area");
      expect(dump.render.seriesType).toBe("area");
      expect(dump.render.dataLen).toBeGreaterThan(0);
    });

    test("switching types preserves data length", async ({ page }) => {
      const dumpBefore = await page.evaluate(() => window.__lwcharts.dump());
      const dataLenBefore = dumpBefore.render.dataLen;

      const btn = page.locator('[data-testid="chart-type-button"]');
      await btn.click();
      await page.locator('[data-testid="chart-type-option-line"]').click();
      await page.waitForTimeout(500);

      const dumpAfter = await page.evaluate(() => window.__lwcharts.dump());
      expect(dumpAfter.render.dataLen).toBe(dataLenBefore);
    });
  });

  test.describe("Persistence", () => {
    test("selected type is saved to localStorage", async ({ page }) => {
      const btn = page.locator('[data-testid="chart-type-button"]');
      await btn.click();
      await page.locator('[data-testid="chart-type-option-bars"]').click();
      await page.waitForTimeout(500);

      const storedType = await page.evaluate(() => {
        return window.localStorage.getItem("cp.chart.type");
      });

      expect(storedType).toBe("bars");
    });

    test("reload restores selected type from localStorage", async ({ page }) => {
      // Set to Line
      const btn = page.locator('[data-testid="chart-type-button"]');
      await btn.click();
      await page.locator('[data-testid="chart-type-option-line"]').click();
      await page.waitForTimeout(500);

      // Reload page
      await page.reload();
      await gotoChartsPro(page, { mock: true });
      await waitForChartData(page);

      // Verify Line is restored
      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.chartType).toBe("line");
      await expect(btn).toContainText("Line");
    });

    test("invalid localStorage value falls back to candles", async ({ page }) => {
      // Set invalid value
      await page.evaluate(() => {
        window.localStorage.setItem("cp.chart.type", "invalid-type");
      });

      // Reload
      await page.reload();
      await gotoChartsPro(page, { mock: true });
      await waitForChartData(page);

      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.chartType).toBe("candles");
    });
  });

  test.describe("No Regressions", () => {
    test("RightPanel tabs still visible after type switch", async ({ page }) => {
      const btn = page.locator('[data-testid="chart-type-button"]');
      await btn.click();
      await page.locator('[data-testid="chart-type-option-area"]').click();
      await page.waitForTimeout(500);

      // RightPanel should still be there (we're in workspaceMode=true)
      await expect(page.locator('[data-testid="rightpanel-tabs"]')).toBeVisible();
      await expect(page.locator('[data-testid="rightpanel-tab-indicators"]')).toBeVisible();
    });

    test("workspace layout stable after type switch", async ({ page }) => {
      const btn = page.locator('[data-testid="chart-type-button"]');
      await btn.click();
      await page.locator('[data-testid="chart-type-option-bars"]').click();
      await page.waitForTimeout(500);

      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.layout.workspaceMode).toBe(true);
      // Verify right panel is still visible (can see tabs)
      await expect(page.locator('[data-testid="rightpanel-tabs"]')).toBeVisible();
    });

    test("chart continues rendering after type switch", async ({ page }) => {
      const btn = page.locator('[data-testid="chart-type-button"]');
      await btn.click();
      await page.locator('[data-testid="chart-type-option-line"]').click();
      await page.waitForTimeout(500);

      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.render.canvas.w).toBeGreaterThan(0);
      expect(dump.render.canvas.h).toBeGreaterThan(0);
      expect(dump.render.dataLen).toBeGreaterThan(0);
    });
  });

  test.describe("Determinism (repeat-each=10)", () => {
    test("repeated switches produce consistent dump() state", async ({ page }) => {
      const types: Array<"candles" | "bars" | "line" | "area"> = ["bars", "line", "area", "candles"];

      for (const targetType of types) {
        const btn = page.locator('[data-testid="chart-type-button"]');
        await btn.click();
        await page.locator(`[data-testid="chart-type-option-${targetType}"]`).click();
        await page.waitForTimeout(500);

        const dump = await page.evaluate(() => window.__lwcharts.dump());
        expect(dump.ui.chartType).toBe(targetType);
        expect(dump.render.seriesType).toBe(targetType);
        expect(dump.render.dataLen).toBeGreaterThan(0);
        expect(dump.render.canvas.w).toBeGreaterThan(0);
      }
    });
  });
});
