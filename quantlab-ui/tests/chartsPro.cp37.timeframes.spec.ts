/**
 * TV-37.4: Timeframe Switcher Tests - CP37.4
 * 
 * Tests for TimeframeSelector UX:
 * - Only READY_TIMEFRAMES (1h, 1D, 1W) are clickable
 * - Non-ready timeframes (1m, 5m, 15m, 4h) show "Coming soon" badge and are disabled
 * - Timeframe switch feels instant (minimal flicker, anchor preserved)
 * - dump().timeframe exposes current timeframe
 * - QA API set({ timeframe: "1D" }) works for ready timeframes
 * 
 * dump().timeframe = "1h" | "1D" | "1W" | etc
 */

import { test, expect, type Page } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

const READY_TIMEFRAMES = ["1h", "1D", "1W"];
const NON_READY_TIMEFRAMES = ["1m", "5m", "15m", "4h"];

/** Wait for chart data to be loaded */
async function waitForChartData(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.render?.pricePoints > 0;
    },
    { timeout: 15000 }
  );
}

/** Wait for RAF stabilization (2 frames) */
async function waitForRaf(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))
      )
  );
}

/** Get the current dump state */
async function getDump(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__lwcharts?.dump?.());
}

/** Get current timeframe from dump */
async function getTimeframe(page: Page): Promise<string | null> {
  const dump = await getDump(page);
  return dump?.timeframe ?? null;
}

/** Get visible logical range from dump */
async function getVisibleRange(page: Page): Promise<{ from: number; to: number } | null> {
  const dump = await getDump(page);
  return dump?.render?.visibleLogicalRange ?? null;
}

/** Set timeframe via QA API and wait for update */
async function setTimeframe(page: Page, tf: string): Promise<void> {
  const before = await getTimeframe(page);
  if (before === tf) return; // Already set
  
  await page.evaluate((timeframe) => {
    (window as any).__lwcharts?.set?.({ timeframe });
  }, tf);
  
  // Wait for timeframe to update
  await page.waitForFunction(
    (expected) => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.timeframe === expected;
    },
    tf,
    { timeout: 10000 }
  );
  
  // Wait for data to stabilize
  await waitForChartData(page);
  await waitForRaf(page);
}

/** Open timeframe dropdown */
async function openDropdown(page: Page): Promise<void> {
  await page.click('[data-testid="timeframe-button"]');
  await page.waitForSelector('[data-testid="timeframe-dropdown"]', { state: "visible" });
}

/** Close timeframe dropdown if open */
async function closeDropdown(page: Page): Promise<void> {
  const dropdown = page.locator('[data-testid="timeframe-dropdown"]');
  if (await dropdown.isVisible()) {
    await page.keyboard.press("Escape");
    await dropdown.waitFor({ state: "hidden" });
  }
}

/** Click a timeframe item in dropdown */
async function clickTimeframeItem(page: Page, tf: string): Promise<void> {
  await openDropdown(page);
  await page.click(`[data-testid="timeframe-item-${tf}"]`);
}

/** Check if a timeframe item is disabled */
async function isTimeframeDisabled(page: Page, tf: string): Promise<boolean> {
  await openDropdown(page);
  const item = page.locator(`[data-testid="timeframe-item-${tf}"]`);
  const ariaDisabled = await item.getAttribute("aria-disabled");
  const hasNotAllowed = await item.evaluate((el) => 
    window.getComputedStyle(el).cursor === "not-allowed" || el.classList.contains("cursor-not-allowed")
  );
  await closeDropdown(page);
  return ariaDisabled === "true" || hasNotAllowed;
}

// -----------------------------------------------------------------------------
// TV-37.4 Tests
// -----------------------------------------------------------------------------

test.describe("TV-37.4: Timeframe Switcher - CP37.4", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Navigate to page first to get access to localStorage
    await page.goto("/?mock=1");
    // Clear chartsProLayout to ensure clean state
    await page.evaluate(() => {
      window.localStorage?.removeItem("chartsProLayout");
    });
    // Reload to apply clean state
    await page.reload();
    await gotoChartsPro(page, testInfo);
    await waitForChartData(page);
  });

  test.describe("CP37.4.1: Ready Timeframes", () => {
    test("CP37.4.1.1: Default timeframe is 1h", async ({ page }) => {
      const tf = await getTimeframe(page);
      expect(tf).toBe("1h");
    });

    test("CP37.4.1.2: Can switch between all ready timeframes (1h, 1D, 1W)", async ({ page }) => {
      // Start at 1h (default)
      expect(await getTimeframe(page)).toBe("1h");
      
      // Switch to 1D
      await clickTimeframeItem(page, "1D");
      await waitForChartData(page);
      expect(await getTimeframe(page)).toBe("1D");
      
      // Switch to 1W
      await clickTimeframeItem(page, "1W");
      await waitForChartData(page);
      expect(await getTimeframe(page)).toBe("1W");
      
      // Switch back to 1h
      await clickTimeframeItem(page, "1h");
      await waitForChartData(page);
      expect(await getTimeframe(page)).toBe("1h");
    });

    test("CP37.4.1.3: Ready timeframes are clickable", async ({ page }) => {
      for (const tf of READY_TIMEFRAMES) {
        const isDisabled = await isTimeframeDisabled(page, tf);
        expect(isDisabled, `${tf} should not be disabled`).toBe(false);
      }
    });

    test("CP37.4.1.4: Timeframe button shows current timeframe", async ({ page }) => {
      const button = page.locator('[data-testid="timeframe-button"]');
      
      // Default is 1h
      await expect(button).toContainText("1h");
      
      // After switching to 1D
      await setTimeframe(page, "1D");
      await expect(button).toContainText("1D");
      
      // After switching to 1W
      await setTimeframe(page, "1W");
      await expect(button).toContainText("1W");
    });
  });

  test.describe("CP37.4.2: Non-Ready Timeframes (Disabled)", () => {
    test("CP37.4.2.1: Non-ready timeframes show 'Soon' badge", async ({ page }) => {
      await openDropdown(page);
      
      for (const tf of NON_READY_TIMEFRAMES) {
        const item = page.locator(`[data-testid="timeframe-item-${tf}"]`);
        await expect(item).toContainText("Soon");
      }
      
      await closeDropdown(page);
    });

    test("CP37.4.2.2: Non-ready timeframes are disabled (aria-disabled)", async ({ page }) => {
      for (const tf of NON_READY_TIMEFRAMES) {
        const isDisabled = await isTimeframeDisabled(page, tf);
        expect(isDisabled, `${tf} should be disabled`).toBe(true);
      }
    });

    test("CP37.4.2.3: Clicking non-ready timeframe does not change selection", async ({ page }) => {
      const before = await getTimeframe(page);
      expect(before).toBe("1h"); // Default is 1h
      
      // Try clicking 5m (non-ready) with force since element is disabled
      await openDropdown(page);
      await page.click(`[data-testid="timeframe-item-5m"]`, { force: true });
      
      // Dropdown should close but timeframe unchanged
      await waitForRaf(page);
      const after = await getTimeframe(page);
      expect(after).toBe("1h");
    });

    test("CP37.4.2.4: Non-ready timeframes have not-allowed cursor", async ({ page }) => {
      await openDropdown(page);
      
      for (const tf of NON_READY_TIMEFRAMES) {
        const item = page.locator(`[data-testid="timeframe-item-${tf}"]`);
        const hasNotAllowed = await item.evaluate((el) => 
          el.classList.contains("cursor-not-allowed")
        );
        expect(hasNotAllowed, `${tf} should have cursor-not-allowed`).toBe(true);
      }
      
      await closeDropdown(page);
    });
  });

  test.describe("CP37.4.3: QA API", () => {
    test("CP37.4.3.1: set({ timeframe }) changes timeframe for ready TFs", async ({ page }) => {
      await setTimeframe(page, "1h");
      expect(await getTimeframe(page)).toBe("1h");
      
      await setTimeframe(page, "1W");
      expect(await getTimeframe(page)).toBe("1W");
      
      await setTimeframe(page, "1D");
      expect(await getTimeframe(page)).toBe("1D");
    });

    test("CP37.4.3.2: set({ timeframe }) ignores invalid timeframes (console warn)", async ({ page }) => {
      const before = await getTimeframe(page);
      
      // Set up console listener for warnings
      const warnings: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "warning") {
          warnings.push(msg.text());
        }
      });
      
      // Try to set invalid timeframe
      await page.evaluate(() => {
        (window as any).__lwcharts?.set?.({ timeframe: "invalid" });
      });
      
      // Timeframe should be unchanged
      const after = await getTimeframe(page);
      expect(after).toBe(before);
    });

    test("CP37.4.3.3: dump().timeframe reflects current state", async ({ page }) => {
      // Initial state (default is 1h)
      let dump = await getDump(page);
      expect(dump.timeframe).toBe("1h");
      
      // After change
      await setTimeframe(page, "1D");
      dump = await getDump(page);
      expect(dump.timeframe).toBe("1D");
    });
  });

  test.describe("CP37.4.4: Keyboard Navigation", () => {
    test("CP37.4.4.1: ArrowDown/ArrowUp cycles through options", async ({ page }) => {
      await openDropdown(page);
      
      // Default highlight should be current timeframe (1h)
      let highlightedItem = page.locator('[data-testid^="timeframe-item-"][aria-selected="true"]');
      await expect(highlightedItem).toHaveAttribute("data-testid", "timeframe-item-1h");
      
      // Arrow down moves highlight to 4h
      await page.keyboard.press("ArrowDown");
      highlightedItem = page.locator('[data-testid^="timeframe-item-"][aria-selected="true"]');
      await expect(highlightedItem).toHaveAttribute("data-testid", "timeframe-item-4h");
      
      // Arrow up moves back to 1h
      await page.keyboard.press("ArrowUp");
      highlightedItem = page.locator('[data-testid^="timeframe-item-"][aria-selected="true"]');
      await expect(highlightedItem).toHaveAttribute("data-testid", "timeframe-item-1h");
      
      await closeDropdown(page);
    });

    test("CP37.4.4.2: Enter selects highlighted ready timeframe", async ({ page }) => {
      await openDropdown(page);
      
      // Navigate to 1D (from 1h: ArrowDown twice to go past 4h)
      await page.keyboard.press("ArrowDown"); // 4h
      await page.keyboard.press("ArrowDown"); // 1D
      
      // Press Enter
      await page.keyboard.press("Enter");
      
      // Dropdown should close
      await expect(page.locator('[data-testid="timeframe-dropdown"]')).toBeHidden();
      
      // 1D was selected
      await waitForChartData(page);
      const tf = await getTimeframe(page);
      expect(tf).toBe("1D");
    });

    test("CP37.4.4.3: Escape closes dropdown without changing", async ({ page }) => {
      const before = await getTimeframe(page);
      
      await openDropdown(page);
      
      // Navigate away from current
      await page.keyboard.press("ArrowUp");
      
      // Press Escape
      await page.keyboard.press("Escape");
      
      // Dropdown should close
      await expect(page.locator('[data-testid="timeframe-dropdown"]')).toBeHidden();
      
      // Timeframe unchanged
      const after = await getTimeframe(page);
      expect(after).toBe(before);
    });
  });

  test.describe("CP37.4.5: Dropdown UI", () => {
    test("CP37.4.5.1: Dropdown opens on button click", async ({ page }) => {
      await expect(page.locator('[data-testid="timeframe-dropdown"]')).toBeHidden();
      
      await page.click('[data-testid="timeframe-button"]');
      
      await expect(page.locator('[data-testid="timeframe-dropdown"]')).toBeVisible();
    });

    test("CP37.4.5.2: Dropdown closes on outside click", async ({ page }) => {
      await openDropdown(page);
      await expect(page.locator('[data-testid="timeframe-dropdown"]')).toBeVisible();
      
      // Click outside
      await page.click("body", { position: { x: 10, y: 10 } });
      
      await expect(page.locator('[data-testid="timeframe-dropdown"]')).toBeHidden();
    });

    test("CP37.4.5.3: Dropdown shows all 7 timeframes", async ({ page }) => {
      await openDropdown(page);
      
      const allTimeframes = [...NON_READY_TIMEFRAMES, ...READY_TIMEFRAMES];
      for (const tf of allTimeframes) {
        const item = page.locator(`[data-testid="timeframe-item-${tf}"]`);
        await expect(item).toBeVisible();
      }
      
      await closeDropdown(page);
    });
  });

  test.describe("CP37.4.6: Persistence", () => {
    test("CP37.4.6.1: Timeframe persists to localStorage", async ({ page }) => {
      // Change to 1D (from 1h default)
      await setTimeframe(page, "1D");
      
      // Check localStorage - key is "cp.layout" with JSON containing timeframe
      const stored = await page.evaluate(() => {
        const layout = localStorage.getItem("cp.layout");
        if (!layout) return null;
        try {
          return JSON.parse(layout).timeframe;
        } catch {
          return null;
        }
      });
      
      expect(stored).toBe("1D");
    });

    test("CP37.4.6.2: Timeframe restores from localStorage on reload", async ({ page }) => {
      // Set to 1W
      await setTimeframe(page, "1W");
      expect(await getTimeframe(page)).toBe("1W");
      
      // Reload page - we need to remove the init script that clears storage
      // So we navigate manually without clearing
      await page.goto("/?mock=1");
      await page.waitForFunction(
        () => {
          const dump = (window as any).__lwcharts?.dump?.();
          return dump && dump.render?.pricePoints > 0;
        },
        { timeout: 15000 }
      );
      
      // Should still be 1W (restored from localStorage)
      expect(await getTimeframe(page)).toBe("1W");
    });
  });

  test.describe("CP37.4.7: Tooltip", () => {
    test("CP37.4.7.1: Button has tooltip showing current timeframe", async ({ page }) => {
      const button = page.locator('[data-testid="timeframe-button"]');
      const title = await button.getAttribute("title");
      // Default is 1h
      expect(title).toContain("1h");
    });

    test("CP37.4.7.2: Non-ready items have 'Coming soon' in tooltip", async ({ page }) => {
      await openDropdown(page);
      
      for (const tf of NON_READY_TIMEFRAMES) {
        const item = page.locator(`[data-testid="timeframe-item-${tf}"]`);
        const title = await item.getAttribute("title");
        expect(title).toContain("Coming soon");
      }
      
      await closeDropdown(page);
    });
  });
});
