/**
 * TV-33: Elliott Wave Impulse Pattern - CP33
 * Tests for the 6-point (p0-p5) Elliott Wave Impulse pattern drawing tool.
 * Hotkey: Z | Color: #f59e0b (amber)
 */
import { test, expect, Page, TestInfo } from "@playwright/test";
import { gotoChartsPro, getChartsProContainer, handleToScreenCoords } from "./helpers";

// ============================================================================
// Shared helpers
// ============================================================================

async function dump(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const w = window as unknown as { __lwcharts?: { dump?: () => Record<string, unknown> } };
    return w.__lwcharts?.dump?.() ?? {};
  });
}

async function getActiveTool(page: Page): Promise<string | null> {
  const d = await dump(page);
  return (d.ui as { activeTool?: string } | undefined)?.activeTool ?? null;
}

async function clearDrawings(page: Page) {
  await page.evaluate(() => {
    const charts = (window as any).__lwcharts;
    if (charts?.set) charts.set({ drawings: [] });
  });
  await expect.poll(async () => {
    const d = await dump(page);
    return (d.objects as unknown[])?.length ?? 0;
  }, { timeout: 2000 }).toBe(0);
}

async function getEWDrawing(page: Page) {
  const d = await dump(page);
  const objects = d.objects as { type?: string }[] | undefined;
  return objects?.find((o) => o.type === "elliottWave") as Record<string, unknown> | undefined;
}

/** Create an Elliott Wave pattern with 6 clicks */
async function createElliottWave(page: Page) {
  // Press Z to select the elliottWave tool
  await page.keyboard.press("z");
  await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("elliottWave");
  
  // Wait for chart to be ready
  await page.waitForTimeout(200);

  // Get the chart container
  const container = await getChartsProContainer(page);
  const box = await container.boundingBox();
  expect(box).toBeTruthy();

  // Create a bullish Elliott Wave impulse pattern
  // Pattern: 0 (low) -> 1 (up) -> 2 (retrace) -> 3 (higher) -> 4 (retrace) -> 5 (highest)
  // Using Y coordinates where lower Y = higher price
  // Keep all clicks away from edges to avoid hitting UI elements
  const p0X = box!.x + box!.width * 0.10;
  const p0Y = box!.y + box!.height * 0.70; // Origin (low)
  const p1X = box!.x + box!.width * 0.20;
  const p1Y = box!.y + box!.height * 0.45; // Wave 1 (up)
  const p2X = box!.x + box!.width * 0.30;
  const p2Y = box!.y + box!.height * 0.55; // Wave 2 (retrace)
  const p3X = box!.x + box!.width * 0.50;
  const p3Y = box!.y + box!.height * 0.25; // Wave 3 (up, usually longest)
  const p4X = box!.x + box!.width * 0.60;
  const p4Y = box!.y + box!.height * 0.40; // Wave 4 (retrace)
  const p5X = box!.x + box!.width * 0.70;
  const p5Y = box!.y + box!.height * 0.20; // Wave 5 (final push) - kept away from top edge

  // 6 clicks to create Elliott Wave
  // Use longer delays to avoid race conditions with React re-renders
  // Need 7 clicks total: 1 to start + 5 to advance phases + 1 to commit
  // (First click creates drawing at phase 1, then 5 clicks advance phases 1→2→3→4→5, then final click commits)
  await page.mouse.click(p0X, p0Y, { delay: 50 });
  await page.waitForTimeout(100); // Allow React to process
  await page.mouse.click(p1X, p1Y, { delay: 50 });
  await page.waitForTimeout(100);
  await page.mouse.click(p2X, p2Y, { delay: 50 });
  await page.waitForTimeout(100);
  await page.mouse.click(p3X, p3Y, { delay: 50 });
  await page.waitForTimeout(100);
  await page.mouse.click(p4X, p4Y, { delay: 50 });
  await page.waitForTimeout(100);
  await page.mouse.click(p5X, p5Y, { delay: 50 });
  await page.waitForTimeout(100);
  // Extra click to advance phase 5 → commit (7th click total)
  await page.mouse.click(p5X + 20, p5Y, { delay: 50 });

  // Wait for Elliott Wave to be created
  await expect.poll(async () => {
    const d = await dump(page);
    const objects = d.objects as { type?: string }[] | undefined;
    return objects?.some((o) => o.type === "elliottWave");
  }, { timeout: 3000 }).toBe(true);
}

// ============================================================================
// Tests
// ============================================================================

test.describe("TV-33: Elliott Wave Impulse Pattern - CP33", () => {
  test.beforeEach(async ({ page }, testInfo: TestInfo) => {
    await gotoChartsPro(page, testInfo, { mock: true });
    // Wait for chart to be ready
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.render as { hasChart?: boolean } | undefined)?.hasChart;
    }, { timeout: 10000 }).toBe(true);
    // Clear any existing drawings
    await clearDrawings(page);
    // Clear any existing selections
    await page.keyboard.press("Escape");
    await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");
  });

  // --------------------------------------------------------------------------
  // TV-33.5.1: Hotkey Z selects tool
  // --------------------------------------------------------------------------
  test.describe("TV-33.5.1: Tool Selection", () => {
    test("pressing Z should select elliottWave tool", async ({ page }) => {
      await page.keyboard.press("z");
      
      await expect.poll(async () => {
        return await getActiveTool(page);
      }, { timeout: 3000 }).toBe("elliottWave");
    });

    test("should deselect elliottWave tool with Escape", async ({ page }) => {
      await page.keyboard.press("z");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("elliottWave");
      
      await page.keyboard.press("Escape");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");
    });
  });

  // --------------------------------------------------------------------------
  // TV-33.5.2: 6-click create workflow
  // --------------------------------------------------------------------------
  test.describe("TV-33.5.2: 6-Click Create", () => {
    test("6 clicks should create elliottWave drawing with p0-p5", async ({ page }) => {
      await createElliottWave(page);

      const ew = await getEWDrawing(page);
      expect(ew).toBeTruthy();
      expect(ew!.type).toBe("elliottWave");

      // Verify all points exist
      expect(ew!.p0).toBeDefined();
      expect(ew!.p1).toBeDefined();
      expect(ew!.p2).toBeDefined();
      expect(ew!.p3).toBeDefined();
      expect(ew!.p4).toBeDefined();
      expect(ew!.p5).toBeDefined();

      // Points array should have 6 labeled points
      expect(ew!.points).toHaveLength(6);
      const points = ew!.points as { label: string }[];
      expect(points.map(p => p.label)).toEqual(["0", "1", "2", "3", "4", "5"]);
    });

    test("elliottWave should have direction field", async ({ page }) => {
      await createElliottWave(page);

      const ew = await getEWDrawing(page);
      expect(ew).toBeTruthy();

      // Direction should be defined
      expect(ew!.direction).toBeDefined();
      expect(["bullish", "bearish"]).toContain(ew!.direction);
    });

    test("tool should reset to select after creating elliottWave", async ({ page }) => {
      await createElliottWave(page);

      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");
    });
  });

  // --------------------------------------------------------------------------
  // TV-33.5.3: handlesPx Export
  // --------------------------------------------------------------------------
  test.describe("TV-33.5.3: handlesPx Export", () => {
    test("selected elliottWave should have handlesPx with p0-p5", async ({ page }) => {
      await createElliottWave(page);

      // Get the selected drawing
      const d = await dump(page);
      const selectedId = (d.ui as { selectedObjectId?: string } | undefined)?.selectedObjectId;
      expect(selectedId).toBeTruthy();

      const ew = await getEWDrawing(page);
      expect(ew).toBeDefined();
      expect(ew!.handlesPx).toBeDefined();

      const handlesPx = ew!.handlesPx as Record<string, { x: number; y: number }>;

      // Check all 6 handles exist
      expect(handlesPx.p0).toBeDefined();
      expect(handlesPx.p1).toBeDefined();
      expect(handlesPx.p2).toBeDefined();
      expect(handlesPx.p3).toBeDefined();
      expect(handlesPx.p4).toBeDefined();
      expect(handlesPx.p5).toBeDefined();

      // Each handle should have x and y
      for (const key of ["p0", "p1", "p2", "p3", "p4", "p5"]) {
        const handle = handlesPx[key];
        expect(typeof handle.x).toBe("number");
        expect(typeof handle.y).toBe("number");
      }
    });
  });

  // --------------------------------------------------------------------------
  // TV-33.5.4: Drag Handles
  // --------------------------------------------------------------------------
  test.describe("TV-33.5.4: Drag Handles", () => {
    test("dragging p3 handle should update wave 3 position", async ({ page }) => {
      await createElliottWave(page);

      // Get drawing with handles
      let ew = await getEWDrawing(page);
      expect(ew).toBeTruthy();
      const originalP3 = { ...(ew!.p3 as { timeMs: number; price: number }) };

      // Get handle pixel position
      const handlesPx = ew!.handlesPx as Record<string, { x: number; y: number }>;
      expect(handlesPx.p3).toBeDefined();

      // Convert to screen coordinates and drag
      const screenCoords = await handleToScreenCoords(page, handlesPx, "p3");

      await page.mouse.move(screenCoords.x, screenCoords.y);
      await page.mouse.down();
      await page.mouse.move(screenCoords.x + 50, screenCoords.y + 30, { steps: 5 });
      await page.mouse.up();

      // Wait for update
      await page.waitForTimeout(100);

      // Verify position changed
      ew = await getEWDrawing(page);
      expect(ew).toBeTruthy();
      const newP3 = ew!.p3 as { timeMs: number; price: number };

      // At least one of timeMs or price should have changed
      const positionChanged = newP3.timeMs !== originalP3.timeMs || newP3.price !== originalP3.price;
      expect(positionChanged).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // TV-33.5.5: Delete, Lock, Hide
  // --------------------------------------------------------------------------
  test.describe("TV-33.5.5: Delete, Lock, Hide", () => {
    test("pressing Delete should remove selected elliottWave", async ({ page }) => {
      await createElliottWave(page);

      let d = await dump(page);
      let objects = d.objects as unknown[];
      expect(objects.length).toBe(1);

      // Press Delete
      await page.keyboard.press("Delete");
      
      // Wait for deletion
      await expect.poll(async () => {
        const d = await dump(page);
        return (d.objects as unknown[])?.length ?? 0;
      }, { timeout: 2000 }).toBe(0);
    });

    test("pressing Shift+L should toggle lock on selected elliottWave", async ({ page }) => {
      await createElliottWave(page);

      let ew = await getEWDrawing(page);
      expect(ew!.locked).toBeFalsy();

      // Press Shift+L
      await page.keyboard.press("Shift+l");
      await page.waitForTimeout(100);

      ew = await getEWDrawing(page);
      expect(ew!.locked).toBe(true);

      // Toggle back
      await page.keyboard.press("Shift+l");
      await page.waitForTimeout(100);

      ew = await getEWDrawing(page);
      expect(ew!.locked).toBe(false);
    });

    test("pressing Shift+H should toggle visibility on selected elliottWave", async ({ page }) => {
      await createElliottWave(page);

      let ew = await getEWDrawing(page);
      expect(ew!.hidden).toBeFalsy();

      // Press Shift+H
      await page.keyboard.press("Shift+h");
      await page.waitForTimeout(100);

      ew = await getEWDrawing(page);
      expect(ew!.hidden).toBe(true);

      // Toggle back
      await page.keyboard.press("Shift+h");
      await page.waitForTimeout(100);

      ew = await getEWDrawing(page);
      expect(ew!.hidden).toBe(false);
    });

    test("Shift+L should lock without switching tool from select", async ({ page }) => {
      await createElliottWave(page);
      
      // Verify tool is select
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");

      // Press Shift+L to lock
      await page.keyboard.press("Shift+l");
      await page.waitForTimeout(100);

      // Tool should still be select
      expect(await getActiveTool(page)).toBe("select");

      // Drawing should be locked
      const ew = await getEWDrawing(page);
      expect(ew!.locked).toBe(true);
    });

    test("Shift+H should hide without switching tool from select", async ({ page }) => {
      await createElliottWave(page);
      
      // Verify tool is select
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");

      // Press Shift+H to hide
      await page.keyboard.press("Shift+h");
      await page.waitForTimeout(100);

      // Tool should still be select
      expect(await getActiveTool(page)).toBe("select");

      // Drawing should be hidden
      const ew = await getEWDrawing(page);
      expect(ew!.hidden).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // TV-33.5.6: Z-Order
  // --------------------------------------------------------------------------
  test.describe("TV-33.5.6: Z-Order", () => {
    test("new elliottWave should have higher z than existing drawings", async ({ page }) => {
      // Create a trend line first (trendline is a 2-point drag tool, not click-click)
      await page.keyboard.press("t");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("trendline");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // Use drag instead of two clicks for trendline
      const trendP1 = { x: box!.x + box!.width * 0.1, y: box!.y + box!.height * 0.5 };
      const trendP2 = { x: box!.x + box!.width * 0.3, y: box!.y + box!.height * 0.3 };
      await page.mouse.move(trendP1.x, trendP1.y);
      await page.mouse.down();
      await page.mouse.move(trendP2.x, trendP2.y);
      await page.mouse.up();
      
      await expect.poll(async () => {
        const d = await dump(page);
        const objects = d.objects as { type?: string }[] | undefined;
        return objects?.some((o) => o.type === "trend");
      }, { timeout: 3000 }).toBe(true);
      
      // Reset tool to select before creating Elliott Wave
      await page.keyboard.press("Escape");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");

      // Create Elliott Wave
      await createElliottWave(page);

      const d = await dump(page);
      const objects = d.objects as { type?: string; z?: number }[];
      expect(objects.length).toBe(2);

      const trend = objects.find((o) => o.type === "trend");
      const ew = objects.find((o) => o.type === "elliottWave");

      expect(trend).toBeDefined();
      expect(ew).toBeDefined();
      expect(ew!.z).toBeGreaterThan(trend!.z!);
    });
  });
});
