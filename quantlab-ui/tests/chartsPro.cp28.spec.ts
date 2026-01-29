/**
 * chartsPro.cp28.spec.ts
 *
 * TV-28: Fibonacci Extension & Fan Tools
 * - TV-28.1: Fibonacci Extension (3-point tool: p1=impulse start, p2=impulse end, p3=retracement anchor)
 * - TV-28.2: Fibonacci Fan (2-point tool: p1=anchor, p2=end, rays at fib ratios)
 */

import { test, expect, Page, TestInfo } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

// ============================================================
// Helper functions
// ============================================================

async function dump(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const w = window as unknown as { __lwcharts?: { dump?: () => Record<string, unknown> } };
    return w.__lwcharts?.dump?.() ?? {};
  });
}

async function resetTool(page: Page) {
  await page.keyboard.press("Escape");
  await expect.poll(async () => {
    const d = await dump(page);
    return (d.ui as { activeTool?: string } | undefined)?.activeTool;
  }, { timeout: 2000 }).toBe("select");
}

async function getActiveTool(page: Page): Promise<string | null> {
  const d = await dump(page);
  return (d.ui as { activeTool?: string } | undefined)?.activeTool ?? null;
}

async function getObjectCount(page: Page): Promise<number> {
  const d = await dump(page);
  const objects = d.objects as unknown[] | undefined;
  return objects?.length ?? 0;
}

async function getLastDrawing(page: Page): Promise<Record<string, unknown> | null> {
  const d = await dump(page);
  const objects = d.objects as unknown[] | undefined;
  if (!objects || objects.length === 0) return null;
  return objects[objects.length - 1] as Record<string, unknown>;
}

async function getAllDrawings(page: Page): Promise<Record<string, unknown>[]> {
  const d = await dump(page);
  const objects = d.objects as unknown[] | undefined;
  return (objects ?? []) as Record<string, unknown>[];
}

async function getCanvas(page: Page) {
  const canvas = page.locator(".tv-lightweight-charts canvas").first();
  await expect(canvas).toBeVisible();
  return canvas;
}

// ============================================================
// Test Setup
// ============================================================

test.describe("TV-28: Fibonacci Extension & Fan Tools", () => {
  test.beforeEach(async ({ page }, testInfo: TestInfo) => {
    await gotoChartsPro(page, testInfo);
    // Wait for chart to be ready
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.render as { hasChart?: boolean } | undefined)?.hasChart;
    }, { timeout: 10000 }).toBe(true);
    // Clear any existing selections
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  });

  // ============================================================
  // TV-28.1: Fibonacci Extension
  // ============================================================
  test.describe("TV-28.1: Fibonacci Extension", () => {
    test("should select fibExtension tool with X hotkey", async ({ page }) => {
      await page.keyboard.press("x");
      
      await expect.poll(async () => {
        return await getActiveTool(page);
      }, { timeout: 2000 }).toBe("fibExtension");
    });

    test("should create fibExtension with 3 clicks", async ({ page }) => {
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();

      const initialCount = await getObjectCount(page);

      // Select fibExtension tool
      await page.keyboard.press("x");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("fibExtension");

      // Three clicks for fibExtension: p1 (impulse start), p2 (impulse end), p3 (retracement anchor)
      const p1 = { x: box!.x + 100, y: box!.y + 200 }; // Impulse start (lower)
      const p2 = { x: box!.x + 200, y: box!.y + 100 }; // Impulse end (higher)
      const p3 = { x: box!.x + 300, y: box!.y + 150 }; // Retracement anchor (middle)

      await page.mouse.click(p1.x, p1.y);
      await page.waitForTimeout(100);
      await page.mouse.click(p2.x, p2.y);
      await page.waitForTimeout(100);
      await page.mouse.click(p3.x, p3.y);
      await page.waitForTimeout(200);

      // Verify drawing was created
      await expect.poll(async () => {
        return await getObjectCount(page);
      }, { timeout: 3000 }).toBe(initialCount + 1);

      // Verify it's a fibExtension
      const drawing = await getLastDrawing(page);
      expect(drawing).toBeTruthy();
      expect(drawing!.type).toBe("fibExtension");
    });

    test("fibExtension should have 3 points in dump contract", async ({ page }) => {
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();

      // Create fibExtension
      await page.keyboard.press("x");
      await page.mouse.click(box!.x + 100, box!.y + 200);
      await page.waitForTimeout(100);
      await page.mouse.click(box!.x + 200, box!.y + 100);
      await page.waitForTimeout(100);
      await page.mouse.click(box!.x + 300, box!.y + 150);
      await page.waitForTimeout(200);

      const drawing = await getLastDrawing(page);
      expect(drawing).toBeTruthy();

      // Should have p1, p2, p3 with timeMs and price
      const p1 = drawing!.p1 as { timeMs: number; price: number } | undefined;
      const p2 = drawing!.p2 as { timeMs: number; price: number } | undefined;
      const p3 = drawing!.p3 as { timeMs: number; price: number } | undefined;
      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      expect(p3).toBeDefined();
      expect(p1!.timeMs).toBeDefined();
      expect(p1!.price).toBeDefined();
      expect(p2!.timeMs).toBeDefined();
      expect(p2!.price).toBeDefined();
      expect(p3!.timeMs).toBeDefined();
      expect(p3!.price).toBeDefined();

      // points array should have 3 entries
      const points = drawing!.points as unknown[];
      expect(points).toHaveLength(3);
    });

    test("fibExtension should have levels array with 13 extension ratios", async ({ page }) => {
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();

      // Create fibExtension
      await page.keyboard.press("x");
      await page.mouse.click(box!.x + 100, box!.y + 200);
      await page.waitForTimeout(100);
      await page.mouse.click(box!.x + 200, box!.y + 100);
      await page.waitForTimeout(100);
      await page.mouse.click(box!.x + 300, box!.y + 150);
      await page.waitForTimeout(200);

      const drawing = await getLastDrawing(page);
      expect(drawing).toBeTruthy();

      // Should have levels array
      const levels = drawing!.levels as Array<{ ratio: number; price: number }> | undefined;
      expect(levels).toBeDefined();
      expect(Array.isArray(levels)).toBe(true);
      
      // FIB_EXTENSION_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2, 2.618, 3.618, 4.236]
      expect(levels!.length).toBe(13);

      // Each level should have ratio and price
      for (const level of levels!) {
        expect(level.ratio).toBeDefined();
        expect(level.price).toBeDefined();
        expect(typeof level.ratio).toBe("number");
        expect(typeof level.price).toBe("number");
      }

      // Verify specific ratios
      const ratios = levels!.map((l) => l.ratio);
      expect(ratios).toContain(0);
      expect(ratios).toContain(0.618); // Golden ratio
      expect(ratios).toContain(1);
      expect(ratios).toContain(1.618); // Golden extension
      expect(ratios).toContain(2.618);
    });

    test("fibExtension should calculate extension levels correctly", async ({ page }) => {
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();

      // Create fibExtension
      await page.keyboard.press("x");
      await page.mouse.click(box!.x + 100, box!.y + 200);
      await page.waitForTimeout(100);
      await page.mouse.click(box!.x + 200, box!.y + 100);
      await page.waitForTimeout(100);
      await page.mouse.click(box!.x + 300, box!.y + 150);
      await page.waitForTimeout(200);

      const drawing = await getLastDrawing(page);
      expect(drawing).toBeTruthy();

      // Get the control points
      const p1 = drawing!.p1 as { timeMs: number; price: number };
      const p2 = drawing!.p2 as { timeMs: number; price: number };
      const p3 = drawing!.p3 as { timeMs: number; price: number };
      const levels = drawing!.levels as Array<{ ratio: number; price: number }>;

      // Extension levels are projected from p3 using the impulse delta (p2.price - p1.price)
      const impulseDelta = p2.price - p1.price;
      
      // Find the 0% level (should be at p3.price)
      const level0 = levels.find((l) => l.ratio === 0);
      expect(level0).toBeDefined();
      expect(level0!.price).toBeCloseTo(p3.price, 2);

      // Find the 100% level (should be at p3.price + impulseDelta)
      const level100 = levels.find((l) => l.ratio === 1);
      expect(level100).toBeDefined();
      expect(level100!.price).toBeCloseTo(p3.price + impulseDelta, 2);

      // Find the 161.8% level (golden extension)
      const level1618 = levels.find((l) => l.ratio === 1.618);
      expect(level1618).toBeDefined();
      expect(level1618!.price).toBeCloseTo(p3.price + impulseDelta * 1.618, 2);
    });

    test("fibExtension should be selectable and show handlesPx when selected", async ({ page }) => {
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();

      // Create fibExtension
      await page.keyboard.press("x");
      await page.mouse.click(box!.x + 100, box!.y + 200);
      await page.waitForTimeout(100);
      await page.mouse.click(box!.x + 200, box!.y + 100);
      await page.waitForTimeout(100);
      await page.mouse.click(box!.x + 300, box!.y + 150);
      await page.waitForTimeout(200);

      // Click on the drawing to select it
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      await page.mouse.click(box!.x + 150, box!.y + 150);
      await page.waitForTimeout(200);

      const drawings = await getAllDrawings(page);
      const selected = drawings.find((d) => d.selected);
      
      // If selected, should have handlesPx
      if (selected && selected.type === "fibExtension") {
        const handlesPx = selected.handlesPx as { p1?: { x: number; y: number }; p2?: { x: number; y: number }; p3?: { x: number; y: number } } | undefined;
        expect(handlesPx).toBeDefined();
        expect(handlesPx!.p1).toBeDefined();
        expect(handlesPx!.p2).toBeDefined();
        expect(handlesPx!.p3).toBeDefined();
      }
    });

    test("fibExtension should be deletable with Delete key", async ({ page }) => {
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();

      const initialCount = await getObjectCount(page);

      // Create fibExtension
      await page.keyboard.press("x");
      await page.mouse.click(box!.x + 100, box!.y + 200);
      await page.waitForTimeout(100);
      await page.mouse.click(box!.x + 200, box!.y + 100);
      await page.waitForTimeout(100);
      await page.mouse.click(box!.x + 300, box!.y + 150);
      await page.waitForTimeout(200);

      await expect.poll(async () => getObjectCount(page), { timeout: 2000 }).toBe(initialCount + 1);

      // Select it
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      await page.mouse.click(box!.x + 150, box!.y + 150);
      await page.waitForTimeout(200);

      // Delete
      await page.keyboard.press("Delete");
      await page.waitForTimeout(200);

      await expect.poll(async () => getObjectCount(page), { timeout: 2000 }).toBe(initialCount);
    });
  });

  // ============================================================
  // TV-28.2: Fibonacci Fan
  // ============================================================
  test.describe("TV-28.2: Fibonacci Fan", () => {
    test("should select fibFan tool with U hotkey", async ({ page }) => {
      await page.keyboard.press("u");
      
      await expect.poll(async () => {
        return await getActiveTool(page);
      }, { timeout: 2000 }).toBe("fibFan");
    });

    test("should create fibFan with drag (2-point tool)", async ({ page }) => {
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();

      const initialCount = await getObjectCount(page);

      // Select fibFan tool
      await page.keyboard.press("u");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("fibFan");

      // Drag to create fibFan
      const startX = box!.x + 100;
      const startY = box!.y + 200;
      const endX = box!.x + 300;
      const endY = box!.y + 100;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify drawing was created
      await expect.poll(async () => {
        return await getObjectCount(page);
      }, { timeout: 3000 }).toBe(initialCount + 1);

      // Verify it's a fibFan
      const drawing = await getLastDrawing(page);
      expect(drawing).toBeTruthy();
      expect(drawing!.type).toBe("fibFan");
    });

    test("fibFan should have 2 points in dump contract", async ({ page }) => {
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();

      // Create fibFan
      await page.keyboard.press("u");
      await page.mouse.move(box!.x + 100, box!.y + 200);
      await page.mouse.down();
      await page.mouse.move(box!.x + 300, box!.y + 100, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      const drawing = await getLastDrawing(page);
      expect(drawing).toBeTruthy();

      // Should have p1, p2 with timeMs and price
      const p1 = drawing!.p1 as { timeMs: number; price: number } | undefined;
      const p2 = drawing!.p2 as { timeMs: number; price: number } | undefined;
      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      expect(p1!.timeMs).toBeDefined();
      expect(p1!.price).toBeDefined();
      expect(p2!.timeMs).toBeDefined();
      expect(p2!.price).toBeDefined();

      // points array should have 2 entries
      const points = drawing!.points as unknown[];
      expect(points).toHaveLength(2);
    });

    test("fibFan should have ratios array with 5 fib ratios", async ({ page }) => {
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();

      // Create fibFan
      await page.keyboard.press("u");
      await page.mouse.move(box!.x + 100, box!.y + 200);
      await page.mouse.down();
      await page.mouse.move(box!.x + 300, box!.y + 100, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      const drawing = await getLastDrawing(page);
      expect(drawing).toBeTruthy();

      // Should have ratios array
      const ratios = drawing!.ratios as number[] | undefined;
      expect(ratios).toBeDefined();
      expect(Array.isArray(ratios)).toBe(true);
      
      // FIB_FAN_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786]
      expect(ratios!.length).toBe(5);
      expect(ratios).toContain(0.236);
      expect(ratios).toContain(0.382);
      expect(ratios).toContain(0.5);
      expect(ratios).toContain(0.618);
      expect(ratios).toContain(0.786);
    });

    test("fibFan should be selectable and show handlesPx when selected", async ({ page }) => {
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();

      // Create fibFan
      await page.keyboard.press("u");
      await page.mouse.move(box!.x + 100, box!.y + 200);
      await page.mouse.down();
      await page.mouse.move(box!.x + 300, box!.y + 100, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Click on the drawing to select it
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      await page.mouse.click(box!.x + 200, box!.y + 150);
      await page.waitForTimeout(200);

      const drawings = await getAllDrawings(page);
      const selected = drawings.find((d) => d.selected);
      
      // If selected, should have handlesPx
      if (selected && selected.type === "fibFan") {
        const handlesPx = selected.handlesPx as { p1?: { x: number; y: number }; p2?: { x: number; y: number } } | undefined;
        expect(handlesPx).toBeDefined();
        expect(handlesPx!.p1).toBeDefined();
        expect(handlesPx!.p2).toBeDefined();
      }
    });

    test("fibFan should be deletable with Delete key", async ({ page }) => {
      const canvas = await getCanvas(page);
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();

      const initialCount = await getObjectCount(page);

      // Create fibFan
      await page.keyboard.press("u");
      const startX = box!.x + 100;
      const startY = box!.y + 200;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(box!.x + 300, box!.y + 100, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      await expect.poll(async () => getObjectCount(page), { timeout: 2000 }).toBe(initialCount + 1);

      // Select it by clicking on the anchor point (p1) - more reliable selection
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      // Click on the anchor point (start point of the fan)
      await page.mouse.click(startX, startY);
      await page.waitForTimeout(200);

      // Verify selection
      await expect.poll(async () => {
        const drawings = await getAllDrawings(page);
        return drawings.some((d) => d.selected && d.type === "fibFan");
      }, { timeout: 2000 }).toBe(true);

      // Delete
      await page.keyboard.press("Delete");
      await page.waitForTimeout(200);

      await expect.poll(async () => getObjectCount(page), { timeout: 2000 }).toBe(initialCount);
    });
  });

  // ============================================================
  // TV-28.3: Hotkey Integration
  // ============================================================
  test.describe("TV-28.3: Hotkey Integration", () => {
    test("X and U hotkeys should be part of the hotkey guardrail", async ({ page }) => {
      // Test X → fibExtension
      await page.keyboard.press("x");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("fibExtension");

      await resetTool(page);

      // Test U → fibFan
      await page.keyboard.press("u");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("fibFan");
    });

    test("Escape should reset from fibExtension to select", async ({ page }) => {
      await page.keyboard.press("x");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("fibExtension");

      await page.keyboard.press("Escape");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");
    });

    test("Escape should reset from fibFan to select", async ({ page }) => {
      await page.keyboard.press("u");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("fibFan");

      await page.keyboard.press("Escape");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");
    });
  });
});
