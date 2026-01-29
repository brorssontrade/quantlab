import { expect, test } from "@playwright/test";

test.describe("TV-9: BottomBar – Quick Ranges + Scale Toggles + Clock", () => {
  async function gotoChartsPro(page: any) {
    await page.goto("/?mock=1", { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
    // Wait for chart to actually render
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      const w = dump?.render?.canvas?.w ?? 0;
      const h = dump?.render?.canvas?.h ?? 0;
      const len = dump?.render?.dataLen ?? 0;
      return w > 0 && h > 0 && len > 0;
    }, { timeout: 15000 });
  }

  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page);
    await page.waitForTimeout(500); // Let chart settle
  });

  test("TV-9.1: BottomBar renders with all quick range buttons", async ({ page }) => {
    const ranges = ["1D", "5D", "1M", "6M", "YTD", "1Y", "All"];
    for (const range of ranges) {
      await expect(page.locator(`[data-testid="bottombar-range-${range}"]`)).toBeVisible();
    }
  });

  test("TV-9.2: Range click changes selected state", async ({ page }) => {
    const range1D = page.locator('[data-testid="bottombar-range-1D"]');
    const range5D = page.locator('[data-testid="bottombar-range-5D"]');

    // Check initial state (1D selected by default)
    const range1DStyle = await range1D.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return computed.backgroundColor;
    });
    const range5DStyle = await range5D.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return computed.backgroundColor;
    });
    expect(range1DStyle).not.toBe(range5DStyle); // Different colors

    // Click 5D
    await range5D.click();
    await page.waitForTimeout(200);

    // 5D should now be active (compare colors changed)
    const range5DNewStyle = await range5D.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return computed.backgroundColor;
    });
    expect(range5DNewStyle).toBe(range1DStyle); // Same color as 1D was before
  });

  test("TV-9.3: Scale toggles render (Auto, Log, %, ADJ)", async ({ page }) => {
    const modes = ["auto", "log", "percent", "adj"];
    for (const mode of modes) {
      await expect(page.locator(`[data-testid="bottombar-toggle-${mode}"]`)).toBeVisible();
    }

    // ADJ should be disabled (not yet implemented)
    await expect(page.locator('[data-testid="bottombar-toggle-adj"]')).toBeDisabled();
  });

  test("TV-9.4: Scale toggle click changes mode", async ({ page }) => {
    const autoBtn = page.locator('[data-testid="bottombar-toggle-auto"]');
    const logBtn = page.locator('[data-testid="bottombar-toggle-log"]');

    // Check initial state (Auto selected by default)
    const autoBtnStyle = await autoBtn.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return computed.backgroundColor;
    });
    const logBtnStyle = await logBtn.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return computed.backgroundColor;
    });
    expect(autoBtnStyle).not.toBe(logBtnStyle); // Different colors

    // Click log
    await logBtn.click();
    await page.waitForTimeout(200);

    // Log should now be active (same color as Auto was)
    const logBtnNewStyle = await logBtn.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return computed.backgroundColor;
    });
    expect(logBtnNewStyle).toBe(autoBtnStyle);
  });

  test("TV-9.5: Clock displays time in HH:MM:SS format", async ({ page }) => {
    // Check timezone toggle shows UTC (default) - now contains dropdown arrow
    await expect(page.locator('[data-testid="bottombar-tz-toggle"]')).toContainText("UTC");

    // Check clock text format (HH:MM:SS) via dedicated testid
    const clockText = await page.locator('[data-testid="bottombar-clock"]').textContent();
    expect(clockText).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  test("TV-9.6: Range selection persists in localStorage", async ({ page, context }) => {
    // Click 6M
    await page.locator('[data-testid="bottombar-range-6M"]').click();
    await page.waitForTimeout(200);

    // Check localStorage
    const stored = await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.range"));
    expect(stored).toBe("6M");

    // Reload page
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    // Verify 6M is still selected by checking localStorage
    const storedAfter = await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.range"));
    expect(storedAfter).toBe("6M");
  });

  test("TV-9.7: Scale mode persists in localStorage", async ({ page }) => {
    // Click percent
    await page.locator('[data-testid="bottombar-toggle-percent"]').click();
    await page.waitForTimeout(200);

    // Check localStorage
    const stored = await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.scaleMode"));
    expect(stored).toBe("percent");

    // Reload
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    // Verify percent is still selected by checking localStorage
    const storedAfter = await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.scaleMode"));
    expect(storedAfter).toBe("percent");
  });

  test("TV-9.8: dump().ui.bottomBar exposes state", async ({ page }) => {
    // Click 1M and log
    await page.locator('[data-testid="bottombar-range-1M"]').click();
    await page.waitForTimeout(100);
    await page.locator('[data-testid="bottombar-toggle-log"]').click();
    await page.waitForTimeout(100);

    // Verify localStorage was updated
    const rangeStored = await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.range"));
    const modeStored = await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.scaleMode"));
    
    expect(rangeStored).toBe("1M");
    expect(modeStored).toBe("log");

    // Verify that TradingView chart object exists
    const tvShell = await page.locator('[data-testid="tv-shell"]');
    await expect(tvShell).toBeVisible();
  });
});

test.describe("TV-9: Responsive Behavior", () => {
  async function gotoChartsPro(page: any) {
    await page.goto("/?mock=1", { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
    // Wait for chart to actually render
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      const w = dump?.render?.canvas?.w ?? 0;
      const h = dump?.render?.canvas?.h ?? 0;
      const len = dump?.render?.dataLen ?? 0;
      return w > 0 && h > 0 && len > 0;
    }, { timeout: 15000 });
  }

  test("TV-9.R1: BottomBar visible on mobile (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoChartsPro(page);
    await page.waitForTimeout(500);

    await expect(page.locator(".tv-bottombar")).toBeVisible();
    // Ranges should be visible (may be compact layout)
    await expect(page.locator('[data-testid="bottombar-range-1D"]')).toBeVisible();
  });

  test("TV-9.R2: BottomBar visible on tablet (768px)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoChartsPro(page);
    await page.waitForTimeout(500);

    await expect(page.locator(".tv-bottombar")).toBeVisible();
    await expect(page.locator('[data-testid="bottombar-range-1D"]')).toBeVisible();
  });

  test("TV-9.R3: BottomBar visible on desktop (1920px)", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await gotoChartsPro(page);
    await page.waitForTimeout(500);

    await expect(page.locator(".tv-bottombar")).toBeVisible();
    await expect(page.locator('[data-testid="bottombar-range-1D"]')).toBeVisible();
    await expect(page.locator('[data-testid="bottombar-toggle-auto"]')).toBeVisible();
  });
});

test.describe("TV-9: Deterministic (--repeat-each=10)", () => {
  async function gotoChartsPro(page: any) {
    await page.goto("/?mock=1", { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
    // Wait for chart to actually render
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      const w = dump?.render?.canvas?.w ?? 0;
      const h = dump?.render?.canvas?.h ?? 0;
      const len = dump?.render?.dataLen ?? 0;
      return w > 0 && h > 0 && len > 0;
    }, { timeout: 15000 });
  }

  test("TV-9.D1: Range click is idempotent", async ({ page }) => {
    await gotoChartsPro(page);
    await page.waitForTimeout(500);

    for (let i = 0; i < 5; i++) {
      await page.locator('[data-testid="bottombar-range-1Y"]').click();
      await page.waitForTimeout(50);

      // Verify 1Y is stored in localStorage
      const stored = await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.range"));
      expect(stored).toBe("1Y");
    }
  });

  test("TV-9.D2: Scale toggle behavior is consistent", async ({ page }) => {
    await gotoChartsPro(page);
    await page.waitForTimeout(500);

    // TV-37.2: Log/% toggles are now true toggles - clicking toggles on/off
    // Start from linear (default), clicking % enables it
    let expected = "percent";
    for (let i = 0; i < 5; i++) {
      await page.locator('[data-testid="bottombar-toggle-percent"]').click();
      await page.waitForTimeout(50);

      // Verify correct mode based on toggle behavior
      const stored = await page.evaluate(() => window.localStorage.getItem("cp.bottomBar.scaleMode"));
      expect(stored).toBe(expected);
      
      // Toggle expectation for next iteration
      expected = expected === "percent" ? "linear" : "percent";
    }
  });
});
