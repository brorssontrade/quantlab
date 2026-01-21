import { test, expect } from "@playwright/test";

test.describe("ChartsPro Indicators Tab (TV-7)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?mock=1");
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="rightpanel-root"]')).toBeVisible({ timeout: 10000 });
  });

  test("indicators tab renders with empty state", async ({ page }) => {
    await page.locator('[data-testid="rightpanel-tab-indicators"]').click();
    await expect(page.locator('[data-testid="indicators-tab"]')).toBeVisible();
    await expect(page.locator('[data-testid="indicators-empty"]')).toBeVisible();

    const dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.ui.indicators.count).toBe(0);
    expect(dump.ui.indicators.names.length).toBe(0);
    expect(dump.ui.indicators.addOpen).toBeFalsy();
  });

  test("add button opens search overlay", async ({ page }) => {
    await page.locator('[data-testid="rightpanel-tab-indicators"]').click();
    await page.locator('[data-testid="indicators-add-btn"]').click();
    
    await expect(page.locator('[data-testid="indicators-overlay"]')).toBeVisible();
    await expect(page.locator('[data-testid="indicators-search"]')).toBeVisible();

    const dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.ui.indicators.addOpen).toBeTruthy();
  });

  test("search filters indicator list", async ({ page }) => {
    await page.locator('[data-testid="rightpanel-tab-indicators"]').click();
    await page.locator('[data-testid="indicators-add-btn"]').click();
    await expect(page.locator('[data-testid="indicators-overlay"]')).toBeVisible();

    // Filter to EMA
    await page.locator('[data-testid="indicators-search"]').fill("ema");
    await expect(page.locator('[data-testid="indicators-add-ema"]')).toBeVisible();
    
    // Should not have other options
    const smaBtn = page.locator('[data-testid="indicators-add-sma"]');
    await expect(smaBtn).not.toBeVisible();
  });

  test("add EMA indicator via overlay", async ({ page }) => {
    await page.locator('[data-testid="rightpanel-tab-indicators"]').click();
    
    const countBefore = await page.evaluate(() => window.__lwcharts.dump().ui.indicators.count);
    
    await page.locator('[data-testid="indicators-add-btn"]').click();
    await expect(page.locator('[data-testid="indicators-overlay"]')).toBeVisible();
    await page.locator('[data-testid="indicators-add-ema"]').click();
    await page.waitForTimeout(300);

    const dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.ui.indicators.count).toBe(countBefore + 1);
    expect(dump.ui.indicators.names).toContain("ema");
    
    // Verify items array with summary
    const emaItem = dump.ui.indicators.items.find((i: any) => i.name === "EMA");
    expect(emaItem).toBeDefined();
    expect(emaItem.paramsSummary).toMatch(/EMA\(\d+\)/);
    expect(emaItem.pane).toBe("price");
  });

  test("add RSI indicator to separate pane", async ({ page }) => {
    await page.locator('[data-testid="rightpanel-tab-indicators"]').click();
    await page.locator('[data-testid="indicators-add-btn"]').click();
    await page.locator('[data-testid="indicators-add-rsi"]').click();
    await page.waitForTimeout(300);

    const dump = await page.evaluate(() => window.__lwcharts.dump());
    const rsiItem = dump.ui.indicators.items.find((i: any) => i.name === "RSI");
    expect(rsiItem).toBeDefined();
    expect(rsiItem.pane).toBe("separate");
  });

  test("toggle visibility with eye icon", async ({ page }) => {
    await page.locator('[data-testid="rightpanel-tab-indicators"]').click();
    
    // Add indicator first
    await page.locator('[data-testid="indicators-add-btn"]').click();
    await page.locator('[data-testid="indicators-add-sma"]').click();
    await page.waitForTimeout(300);

    const dumpBefore = await page.evaluate(() => window.__lwcharts.dump());
    const indicatorId = dumpBefore.ui.indicators.items[0]?.id;
    expect(indicatorId).toBeDefined();
    const visibleBefore = dumpBefore.ui.indicators.items[0].visible;

    // Click eye icon
    const eyeBtn = page.locator(`[data-testid="indicator-eye-${indicatorId}"]`);
    await expect(eyeBtn).toBeVisible();
    await eyeBtn.click();
    await page.waitForTimeout(200);

    const dumpAfter = await page.evaluate(() => window.__lwcharts.dump());
    const visibleAfter = dumpAfter.ui.indicators.items[0].visible;
    expect(visibleAfter).toBe(!visibleBefore);
  });

  test("open and close settings panel for editing", async ({ page }) => {
    await page.locator('[data-testid="rightpanel-tab-indicators"]').click();
    
    // Add indicator
    await page.locator('[data-testid="indicators-add-btn"]').click();
    await page.locator('[data-testid="indicators-add-ema"]').click();
    await page.waitForTimeout(300);

    const dump = await page.evaluate(() => window.__lwcharts.dump());
    const indicatorId = dump.ui.indicators.items[0]?.id;

    // Click edit
    const editBtn = page.locator(`[data-testid="indicator-edit-${indicatorId}"]`);
    await expect(editBtn).toBeVisible();
    await editBtn.click();
    await page.waitForTimeout(100);

    // Input should be visible
    const periodInput = page.locator(`[data-testid="indicator-row-${indicatorId}"] input[type="number"]`);
    await expect(periodInput).toBeVisible();

    // Click edit again to close
    await editBtn.click();
    await expect(periodInput).not.toBeVisible();
  });

  test("change indicator parameter updates paramsSummary", async ({ page }) => {
    await page.locator('[data-testid="rightpanel-tab-indicators"]').click();
    
    // Add SMA
    await page.locator('[data-testid="indicators-add-btn"]').click();
    await page.locator('[data-testid="indicators-add-sma"]').click();
    await page.waitForTimeout(300);

    const dumpBefore = await page.evaluate(() => window.__lwcharts.dump());
    const indicatorId = dumpBefore.ui.indicators.items[0]?.id;
    const summaryBefore = dumpBefore.ui.indicators.items[0]?.paramsSummary;

    // Edit period to 50
    await page.locator(`[data-testid="indicator-edit-${indicatorId}"]`).click();
    const periodInput = page.locator(`[data-testid="indicator-row-${indicatorId}"] input[type="number"]`).first();
    await periodInput.clear();
    await periodInput.fill("50");
    await page.waitForTimeout(200);

    const dumpAfter = await page.evaluate(() => window.__lwcharts.dump());
    const summaryAfter = dumpAfter.ui.indicators.items[0]?.paramsSummary;
    expect(summaryAfter).not.toBe(summaryBefore);
    expect(summaryAfter).toMatch(/SMA\(50\)/);
  });

  test("remove indicator decreases count", async ({ page }) => {
    await page.locator('[data-testid="rightpanel-tab-indicators"]').click();
    
    // Add two indicators
    await page.locator('[data-testid="indicators-add-btn"]').click();
    await page.locator('[data-testid="indicators-add-sma"]').click();
    await page.waitForTimeout(300);

    await page.locator('[data-testid="indicators-add-btn"]').click();
    await page.locator('[data-testid="indicators-add-ema"]').click();
    await page.waitForTimeout(300);

    const dumpBefore = await page.evaluate(() => window.__lwcharts.dump());
    const countBefore = dumpBefore.ui.indicators.count;
    expect(countBefore).toBe(2);

    // Remove first
    const firstId = dumpBefore.ui.indicators.items[0]?.id;
    const removeBtn = page.locator(`[data-testid="indicator-remove-${firstId}"]`);
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();
    await page.waitForTimeout(200);

    const dumpAfter = await page.evaluate(() => window.__lwcharts.dump());
    expect(dumpAfter.ui.indicators.count).toBe(1);
  });

  test("overlay state persists in localStorage", async ({ page }) => {
    await page.locator('[data-testid="rightpanel-tab-indicators"]').click();
    
    // Open add overlay
    await page.locator('[data-testid="indicators-add-btn"]').click();
    await expect(page.locator('[data-testid="indicators-overlay"]')).toBeVisible();

    // Verify localStorage was set
    const stored = await page.evaluate(() => window.localStorage.getItem("cp.indicators.addOpen"));
    expect(stored).toBe("1");

    // Close overlay using native DOM click (React synthetic events need native click)
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="indicators-close-overlay"]') as HTMLButtonElement;
      btn?.click();
    });
    await page.waitForTimeout(200);
    const stored2 = await page.evaluate(() => window.localStorage.getItem("cp.indicators.addOpen"));
    expect(stored2).toBe("0");
  });

  test("all indicator kinds render correctly", async ({ page }) => {
    await page.locator('[data-testid="rightpanel-tab-indicators"]').click();

    const kinds: Array<"sma" | "ema" | "rsi" | "macd"> = ["sma", "ema", "rsi", "macd"];
    
    for (const kind of kinds) {
      await page.locator('[data-testid="indicators-add-btn"]').click();
      await page.locator(`[data-testid="indicators-add-${kind}"]`).click();
      await page.waitForTimeout(300);
    }

    const dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.ui.indicators.count).toBe(4);
    expect(dump.ui.indicators.items.every((i: any) => i.paramsSummary)).toBeTruthy();
  });
});

test("Indicators Tab - repeat determinism check", { tag: "@determinism" }, async ({ page }) => {
  // This will run with --repeat-each=10 to prove determinism
  await page.goto("/?mock=1");
  await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
  await page.locator('[data-testid="tab-charts"]').click({ force: true });
  await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
  
  // Add 2 indicators with consistent state
  await page.locator('[data-testid="rightpanel-tab-indicators"]').click();
  
  await page.locator('[data-testid="indicators-add-btn"]').click();
  await page.locator('[data-testid="indicators-add-ema"]').click();
  await page.waitForTimeout(300);
  
  await page.locator('[data-testid="indicators-add-btn"]').click();
  await page.locator('[data-testid="indicators-add-rsi"]').click();
  await page.waitForTimeout(300);

  const dump = await page.evaluate(() => window.__lwcharts.dump());
  expect(dump.ui.indicators.count).toBe(2);
  expect(dump.ui.indicators.items[0].name).toBe("EMA");
  expect(dump.ui.indicators.items[1].name).toBe("RSI");
  expect(dump.ui.indicators.items[0].pane).toBe("price");
  expect(dump.ui.indicators.items[1].pane).toBe("separate");
});
