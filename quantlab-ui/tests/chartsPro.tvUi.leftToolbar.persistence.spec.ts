/**
 * chartsPro.tvUi.leftToolbar.persistence.spec.ts
 * TV-3.8: Tool persistence to localStorage
 *
 * Tests:
 * 1. Tool persists after reload (TradingView parity)
 * 2. Invalid values fallback to "select"
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

test.describe("ChartsPro TV-3.8: Tool Persistence", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto("/?mock=1");
    await page.evaluate(() => {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem("cp.lastTool");
      }
    });
  });

  test("persists tool selection after reload (TradingView parity)", async ({ page }) => {
    await gotoChartsPro(page);

    // Initial state: select
    let dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("select");

    // Select trendline tool
    await page.keyboard.press("t");
    await page.waitForTimeout(100);
    dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("trendline");

    // Verify localStorage was updated
    const stored = await page.evaluate(() => {
      return window.localStorage.getItem("cp.lastTool");
    });
    expect(stored).toBe("trendline");

    // Reload page
    await page.reload({ waitUntil: "networkidle" });
    await gotoChartsPro(page);

    // Tool should be restored
    dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("trendline", "Tool should persist after reload");
  });

  test("handles invalid localStorage values gracefully", async ({ page }) => {
    // Set invalid value in localStorage
    await page.goto("/?mock=1");
    await page.evaluate(() => {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("cp.lastTool", "invalid_tool_name");
      }
    });

    // Navigate to ChartsPro
    await gotoChartsPro(page);

    // Should fallback to "select"
    const dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("select", "Invalid value should fallback to 'select'");
  });

  test("handles old tool names gracefully", async ({ page }) => {
    // Set old tool name (from pre-TV-3.7 refactor)
    await page.goto("/?mock=1");
    await page.evaluate(() => {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("cp.lastTool", "h"); // Old name for hline
      }
    });

    // Navigate to ChartsPro
    await gotoChartsPro(page);

    // Should fallback to "select" (old names not valid)
    const dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("select", "Old tool name should fallback to 'select'");
  });

  test("handles empty localStorage gracefully", async ({ page }) => {
    // Ensure localStorage is empty
    await page.goto("/?mock=1");
    await page.evaluate(() => {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem("cp.lastTool");
      }
    });

    // Navigate to ChartsPro
    await gotoChartsPro(page);

    // Should default to "select"
    const dump = await getDump(page);
    expect(dump.ui.activeTool).toBe("select", "Empty localStorage should default to 'select'");
  });

  test("persists all valid tool selections", async ({ page }) => {
    const validTools = ["hline", "vline", "trendline", "channel", "rectangle", "text"];
    const keyMap: Record<string, string> = {
      hline: "h",
      vline: "v",
      trendline: "t",
      channel: "c",
      rectangle: "r",
      text: "n",
    };

    for (const tool of validTools) {
      // Clear state
      await page.goto("/?mock=1");
      await page.evaluate(() => {
        window.localStorage.removeItem("cp.lastTool");
      });
      await gotoChartsPro(page);

      // Select tool
      await page.keyboard.press(keyMap[tool]);
      await page.waitForTimeout(100);
      let dump = await getDump(page);
      expect(dump.ui.activeTool).toBe(tool);

      // Reload and verify
      await page.reload({ waitUntil: "networkidle" });
      await gotoChartsPro(page);
      dump = await getDump(page);
      expect(dump.ui.activeTool).toBe(tool, `${tool} should persist after reload`);
    }
  });
});
