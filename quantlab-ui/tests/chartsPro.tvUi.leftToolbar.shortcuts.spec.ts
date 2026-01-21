/**
 * chartsPro.tvUi.leftToolbar.shortcuts.spec.ts
 * TV-3.7: Keyboard shortcuts for LeftToolbar tool selection
 *
 * Tests:
 * 1. Esc returns to select tool
 * 2. H/V/T/C/R/N keys select respective tools
 * 3. Shortcuts ignored while typing in symbol input
 */

import { test, expect } from "@playwright/test";

async function gotoChartsPro(page: any) {
  await page.goto("/?mock=1", { waitUntil: "networkidle" });
  await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
  await page.locator('[data-testid="tab-charts"]').click({ force: true });
  await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
  await page.waitForFunction(() => {
    const dump = (window as any).__lwcharts?.dump?.();
    const w = dump?.render?.canvas?.w ?? 0;
    const h = dump?.render?.canvas?.h ?? 0;
    const len = dump?.render?.dataLen ?? 0;
    return w > 0 && h > 0 && len > 0;
  }, { timeout: 15000 });
}

async function getDump(page: any) {
  return page.evaluate(() => {
    if (typeof window !== "undefined" && (window as any).__lwcharts?.dump) {
      return (window as any).__lwcharts.dump();
    }
    return null;
  });
}

test.describe("ChartsPro TV-3.7: Keyboard Shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page);
  });

  test("Esc returns to select tool", async ({ page }) => {
    // Initial: should be select
    let dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("select");

    // Press T to switch to trendline
    await page.keyboard.press("t");
    await page.waitForTimeout(100);
    dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("trendline");

    // Press Esc to return to select
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("select");
  });

  test("H/V/T/C/R/N keys select respective tools", async ({ page }) => {
    const keyToolMap = {
      h: "hline",
      v: "vline",
      t: "trendline",
      c: "channel",
      r: "rectangle",
      n: "text",
    };

    for (const [key, expectedTool] of Object.entries(keyToolMap)) {
      await page.keyboard.press(key);
      await page.waitForTimeout(100);
      const dump = await getDump(page);
      expect(dump.ui.activeTool).toBe(expectedTool, `${key} should select ${expectedTool}`);

      // Return to select before next test
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
    }
  });

  test("shortcuts ignored while typing in symbol input", async ({ page }) => {
    // Initial tool: select
    let dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("select");

    // Focus on symbol search input
    const symbolInput = page.locator('[data-testid="topbar-symbol-input"]');
    await symbolInput.click();
    await page.waitForTimeout(100);

    // Type "t" in symbol input - should NOT change tool to trendline
    await page.keyboard.type("t");
    await page.waitForTimeout(100);
    dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("select", "Tool should not change while typing in input");

    // Click elsewhere to blur and change tool
    await page.locator('[data-testid="tv-chart-root"]').click();
    await page.waitForTimeout(100);

    // Now press t outside input - should change tool
    await page.keyboard.press("t");
    await page.waitForTimeout(100);
    dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("trendline", "Tool should change when not focused on input");
  });

  test("keyboard shortcuts do not affect drawing data", async ({ page }) => {
    // Get initial data count
    let dump = await getDump(page);
    const initialDataLen = dump.render.dataLen;
    expect(initialDataLen).toBeGreaterThan(0);

    // Switch through multiple tools with keyboard
    for (const key of ["h", "v", "t", "c"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(50);
    }

    // Return to select
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);

    // Data should be unchanged
    dump = await getDump(page);
    expect(dump.render.dataLen).toBe(initialDataLen, "Data length should remain unchanged after tool shortcuts");
  });

  test("H selects hline tool (no collision with hide shortcut)", async ({ page }) => {
    // Initial: select tool
    let dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("select");

    // Press H - should select hline tool (not try to hide anything)
    await page.keyboard.press("h");
    await page.waitForTimeout(100);
    dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("hline", "H should select hline tool");

    // Return to select
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  });

  test("Esc from drawing mode cancels then switches to select", async ({ page }) => {
    // Start drawing a trendline (without completing it)
    await page.keyboard.press("t");
    await page.waitForTimeout(100);
    let dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("trendline");

    // Press Escape to cancel and return to select
    // (in drawing mode with no completed drawing, Esc should cancel the operation and switch to select)
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("select", "Esc should switch to select tool after drawing mode");
  });
});
