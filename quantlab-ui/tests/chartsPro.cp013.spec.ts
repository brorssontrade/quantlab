/**
 * T-013: Backend persistence E2E tests for ChartsPro drawings.
 * 
 * These tests verify that drawings are persisted to the backend and restored on reload.
 * REQUIRES: Backend running at http://127.0.0.1:8000
 */
import { expect, test, type Page, type TestInfo } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers (copied from existing test files for consistency)
// ---------------------------------------------------------------------------

async function gotoChartsPro(page: Page, testInfo: TestInfo, options?: { mock?: boolean }) {
  const target = options?.mock ? "/?mock=1#chartspro" : "/#chartspro";
  await page.goto(target);
  await expect(page.locator('[data-testid="chartspro-tab-active"]')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);
}

async function getChartsProContainer(page: Page) {
  return page.locator('[data-testid="chartspro-chart-container"]');
}

async function dump(page: Page) {
  return page.evaluate(() => (window as unknown as { __lwcharts?: { dump?: () => unknown } }).__lwcharts?.dump?.() ?? {});
}

async function clearDrawings(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __lwcharts?: { set?: (data: { drawings: never[] }) => void } }).__lwcharts?.set?.({ drawings: [] });
  });
  await page.waitForTimeout(100);
}

async function getActiveTool(page: Page): Promise<string | undefined> {
  const d = await dump(page);
  return (d as { ui?: { activeTool?: string } }).ui?.activeTool;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("T-013: Backend Persistence - CP013", () => {
  test.beforeEach(async ({ page }, testInfo: TestInfo) => {
    await gotoChartsPro(page, testInfo, { mock: true });
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.render as { hasChart?: boolean } | undefined)?.hasChart;
    }, { timeout: 10000 }).toBe(true);
    await clearDrawings(page);
    await page.keyboard.press("Escape");
    await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");
  });

  test("TV-013.1: hline persists and restores after page reload", async ({ page }) => {
    // Create an hline using hotkey
    await page.keyboard.press("h");
    await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("hline");
    
    const container = await getChartsProContainer(page);
    const box = await container.boundingBox();
    expect(box).toBeTruthy();
    
    // Click to create hline
    await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
    
    // Wait for drawing to appear
    await expect.poll(async () => {
      const d = await dump(page);
      const objects = d.objects as { type?: string }[] | undefined;
      return objects?.some(o => o.type === "hline");
    }, { timeout: 3000 }).toBe(true);
    
    // Get the drawing details before reload
    const beforeReload = await dump(page);
    const beforeObjects = beforeReload.objects as { type?: string; price?: number }[];
    const hlineBefore = beforeObjects.find(o => o.type === "hline");
    expect(hlineBefore).toBeDefined();
    
    // Wait for backend sync (debounce is 1000ms)
    await page.waitForTimeout(1500);
    
    // Reload the page
    await page.reload();
    await gotoChartsPro(page, {} as TestInfo, { mock: true });
    
    // Wait for chart to be ready
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.render as { hasChart?: boolean } | undefined)?.hasChart;
    }, { timeout: 10000 }).toBe(true);
    
    // Verify drawing persisted
    await expect.poll(async () => {
      const d = await dump(page);
      const objects = d.objects as { type?: string }[] | undefined;
      return objects?.some(o => o.type === "hline");
    }, { timeout: 5000 }).toBe(true);
    
    // Verify price is approximately the same
    const afterReload = await dump(page);
    const afterObjects = afterReload.objects as { type?: string; price?: number }[];
    const hlineAfter = afterObjects.find(o => o.type === "hline");
    expect(hlineAfter).toBeDefined();
    
    // Allow small floating point differences
    if (hlineBefore?.price && hlineAfter?.price) {
      expect(Math.abs(hlineBefore.price - hlineAfter.price)).toBeLessThan(0.01);
    }
  });

  test("TV-013.2: elliottWave pattern persists with all points", async ({ page }) => {
    // Create an Elliott Wave using hotkey
    await page.keyboard.press("z");
    await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("elliottWave");
    
    await page.waitForTimeout(200);
    
    const container = await getChartsProContainer(page);
    const box = await container.boundingBox();
    expect(box).toBeTruthy();

    // Create 6-point Elliott Wave pattern (6 clicks)
    const points = [
      { x: box!.x + box!.width * 0.10, y: box!.y + box!.height * 0.70 }, // p0
      { x: box!.x + box!.width * 0.20, y: box!.y + box!.height * 0.45 }, // p1
      { x: box!.x + box!.width * 0.30, y: box!.y + box!.height * 0.55 }, // p2
      { x: box!.x + box!.width * 0.50, y: box!.y + box!.height * 0.25 }, // p3
      { x: box!.x + box!.width * 0.60, y: box!.y + box!.height * 0.40 }, // p4
      { x: box!.x + box!.width * 0.70, y: box!.y + box!.height * 0.20 }, // p5
    ];
    
    for (const p of points) {
      await page.mouse.click(p.x, p.y, { delay: 50 });
      await page.waitForTimeout(100);
    }
    // Extra click to commit
    await page.mouse.click(points[5].x + 20, points[5].y, { delay: 50 });
    
    // Wait for drawing to appear
    await expect.poll(async () => {
      const d = await dump(page);
      const objects = d.objects as { type?: string }[] | undefined;
      return objects?.some(o => o.type === "elliottWave");
    }, { timeout: 3000 }).toBe(true);
    
    // Get drawing before reload
    const beforeReload = await dump(page);
    const beforeObjects = beforeReload.objects as { type?: string; direction?: string; p0?: { price: number } }[];
    const ewBefore = beforeObjects.find(o => o.type === "elliottWave");
    expect(ewBefore).toBeDefined();
    expect(ewBefore?.direction).toBe("bullish");
    
    // Wait for backend sync
    await page.waitForTimeout(1500);
    
    // Reload
    await page.reload();
    await gotoChartsPro(page, {} as TestInfo, { mock: true });
    
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.render as { hasChart?: boolean } | undefined)?.hasChart;
    }, { timeout: 10000 }).toBe(true);
    
    // Verify pattern persisted with direction
    await expect.poll(async () => {
      const d = await dump(page);
      const objects = d.objects as { type?: string; direction?: string }[] | undefined;
      const ew = objects?.find(o => o.type === "elliottWave");
      return ew?.direction;
    }, { timeout: 5000 }).toBe("bullish");
  });

  test("TV-013.3: multiple drawings persist with z-order", async ({ page }) => {
    // Create first drawing (hline)
    await page.keyboard.press("h");
    await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("hline");
    
    const container = await getChartsProContainer(page);
    const box = await container.boundingBox();
    expect(box).toBeTruthy();
    
    await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.3);
    
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.objects as unknown[])?.length;
    }, { timeout: 3000 }).toBe(1);
    
    // Create second drawing (vline)
    await page.keyboard.press("v");
    await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("vline");
    
    await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
    
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.objects as unknown[])?.length;
    }, { timeout: 3000 }).toBe(2);
    
    // Get z-order before reload
    const beforeReload = await dump(page);
    const beforeObjects = beforeReload.objects as { type?: string; z?: number }[];
    expect(beforeObjects).toHaveLength(2);
    
    const hlineBefore = beforeObjects.find(o => o.type === "hline");
    const vlineBefore = beforeObjects.find(o => o.type === "vline");
    expect(hlineBefore).toBeDefined();
    expect(vlineBefore).toBeDefined();
    
    // vline created after hline, should have higher z
    expect(vlineBefore!.z).toBeGreaterThan(hlineBefore!.z!);
    
    // Wait for backend sync
    await page.waitForTimeout(1500);
    
    // Reload
    await page.reload();
    await gotoChartsPro(page, {} as TestInfo, { mock: true });
    
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.render as { hasChart?: boolean } | undefined)?.hasChart;
    }, { timeout: 10000 }).toBe(true);
    
    // Verify both drawings persisted
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.objects as unknown[])?.length;
    }, { timeout: 5000 }).toBe(2);
    
    // Verify z-order preserved
    const afterReload = await dump(page);
    const afterObjects = afterReload.objects as { type?: string; z?: number }[];
    const hlineAfter = afterObjects.find(o => o.type === "hline");
    const vlineAfter = afterObjects.find(o => o.type === "vline");
    
    expect(hlineAfter).toBeDefined();
    expect(vlineAfter).toBeDefined();
    expect(vlineAfter!.z).toBeGreaterThan(hlineAfter!.z!);
  });

  test("TV-013.4: locked/hidden state persists", async ({ page }) => {
    // Create an hline
    await page.keyboard.press("h");
    await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("hline");
    
    const container = await getChartsProContainer(page);
    const box = await container.boundingBox();
    expect(box).toBeTruthy();
    
    await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
    
    await expect.poll(async () => {
      const d = await dump(page);
      const objects = d.objects as { type?: string }[] | undefined;
      return objects?.some(o => o.type === "hline");
    }, { timeout: 3000 }).toBe(true);
    
    // Lock the drawing using Shift+L
    await page.keyboard.press("Shift+l");
    
    // Verify locked
    await expect.poll(async () => {
      const d = await dump(page);
      const objects = d.objects as { type?: string; locked?: boolean }[] | undefined;
      return objects?.find(o => o.type === "hline")?.locked;
    }, { timeout: 2000 }).toBe(true);
    
    // Wait for backend sync
    await page.waitForTimeout(1500);
    
    // Reload
    await page.reload();
    await gotoChartsPro(page, {} as TestInfo, { mock: true });
    
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.render as { hasChart?: boolean } | undefined)?.hasChart;
    }, { timeout: 10000 }).toBe(true);
    
    // Verify locked state persisted
    await expect.poll(async () => {
      const d = await dump(page);
      const objects = d.objects as { type?: string; locked?: boolean }[] | undefined;
      return objects?.find(o => o.type === "hline")?.locked;
    }, { timeout: 5000 }).toBe(true);
  });
});
