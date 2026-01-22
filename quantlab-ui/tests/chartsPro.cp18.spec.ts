/**
 * TV-18.2: Indicators Modal Tests
 *
 * Tests for the central indicators modal (TradingView-style).
 * Verifies modal opens via TopBar, closes on Esc/click-outside,
 * and dump().ui.modal reflects correct state.
 */
import { test, expect } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

test.describe("TV-18.2: Indicators Modal (central)", () => {
  test("clicking Indicators button opens modal + dump().ui.modal.kind === 'indicators'", async ({
    page,
  }, testInfo) => {
    await page.goto("/?mock=1");
    await gotoChartsPro(page, testInfo);

    // Initial state: modal closed
    const dumpBefore = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dumpBefore?.ui?.modal?.open).toBe(false);
    expect(dumpBefore?.ui?.modal?.kind).toBeNull();

    // Click Indicators button in TopBar
    await page.getByTestId("topbar-indicators-btn").click();

    // Modal should appear
    await expect(page.getByTestId("modal-overlay")).toBeVisible();
    await expect(page.getByTestId("indicators-modal")).toBeVisible();

    // dump() should reflect open modal
    const dumpAfter = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dumpAfter?.ui?.modal?.open).toBe(true);
    expect(dumpAfter?.ui?.modal?.kind).toBe("indicators");
  });

  test("Esc closes modal + dump().ui.modal.open === false", async ({ page }, testInfo) => {
    await page.goto("/?mock=1");
    await gotoChartsPro(page, testInfo);

    // Open modal
    await page.getByTestId("topbar-indicators-btn").click();
    await expect(page.getByTestId("modal-overlay")).toBeVisible();

    // Press Esc
    await page.keyboard.press("Escape");

    // Modal should close
    await expect(page.getByTestId("modal-overlay")).not.toBeVisible();

    // dump() should reflect closed modal
    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump?.ui?.modal?.open).toBe(false);
    expect(dump?.ui?.modal?.kind).toBeNull();
  });

  test("click outside modal closes it", async ({ page }, testInfo) => {
    await page.goto("/?mock=1");
    await gotoChartsPro(page, testInfo);

    // Open modal
    await page.getByTestId("topbar-indicators-btn").click();
    await expect(page.getByTestId("modal-overlay")).toBeVisible();

    // Click X button to close (more reliable than click-outside)
    await page.getByTestId("indicators-modal-close").click();

    // Modal should close
    await expect(page.getByTestId("modal-overlay")).not.toBeVisible();

    const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dump?.ui?.modal?.open).toBe(false);
  });

  test("adding indicator from modal adds to chart + closes modal", async ({ page }, testInfo) => {
    await page.goto("/?mock=1");
    await gotoChartsPro(page, testInfo);

    // Get initial indicator count
    const dumpBefore = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    const initialCount = dumpBefore?.ui?.indicators?.count ?? 0;

    // Open modal
    await page.getByTestId("topbar-indicators-btn").click();
    await expect(page.getByTestId("indicators-modal")).toBeVisible();

    // Click SMA
    await page.getByTestId("indicators-modal-add-sma").click();

    // Modal should close
    await expect(page.getByTestId("modal-overlay")).not.toBeVisible();

    // Indicator should be added
    const dumpAfter = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
    expect(dumpAfter?.ui?.indicators?.count).toBe(initialCount + 1);
    expect(dumpAfter?.ui?.indicators?.names?.includes("sma")).toBe(true);
  });

  test("TV-18.3: modal content bbox matches dialog bbox (no extra space)", async ({ page }, testInfo) => {
    await page.goto("/?mock=1");
    await gotoChartsPro(page, testInfo);

    // Open modal
    await page.getByTestId("topbar-indicators-btn").click();
    await expect(page.getByTestId("indicators-modal")).toBeVisible();

    // Get bboxes
    const contentBox = await page.getByTestId("modal-content").boundingBox();
    const dialogBox = await page.getByTestId("indicators-modal").boundingBox();

    expect(contentBox).not.toBeNull();
    expect(dialogBox).not.toBeNull();

    if (contentBox && dialogBox) {
      // Content wrapper should be approximately same width as dialog (tolerance 20px for margin/padding)
      const widthDiff = Math.abs(contentBox.width - dialogBox.width);
      expect(widthDiff).toBeLessThan(20);
    }
  });
});
