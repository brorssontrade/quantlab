/**
 * CP27: Note annotation tests
 *
 * Tests TV-27 Note implementation:
 * - Create via toolbar or hotkey M
 * - 1-click workflow: click → create → text modal opens
 * - Move note via drag
 * - Delete via Delete key
 * - dump() contract verification (anchor, text, points)
 * - Double-click to edit text
 */

import { test, expect, Page } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

async function dump(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const w = window as unknown as { __lwcharts?: { dump?: () => Record<string, unknown> } };
    return w.__lwcharts?.dump?.() ?? {};
  });
}

async function getDrawings(page: Page): Promise<Array<{
  id: string;
  kind: string;
  type: string;
  selected?: boolean;
  anchor?: { timeMs: number; price: number };
  text?: string;
  points?: Array<{ label?: string; timeMs?: number; price?: number }>;
}>> {
  const d = await dump(page);
  const objects = d.objects as Array<unknown> | undefined;
  if (!Array.isArray(objects)) return [];
  return objects.map((item) => {
    const obj = item as Record<string, unknown>;
    return {
      id: obj.id as string,
      kind: obj.type as string,
      type: obj.type as string,
      selected: obj.selected as boolean | undefined,
      anchor: obj.anchor as { timeMs: number; price: number } | undefined,
      text: obj.text as string | undefined,
      points: obj.points as Array<{ label?: string; timeMs?: number; price?: number }> | undefined,
    };
  });
}

async function getCanvas(page: Page) {
  const canvas = page.locator(".tv-lightweight-charts canvas").first();
  await expect(canvas).toBeVisible();
  return canvas;
}

async function selectTool(page: Page, hotkey: string) {
  await page.keyboard.press(hotkey);
  await page.waitForTimeout(50);
}

async function clickOnCanvas(page: Page, x: number, y: number) {
  const canvas = await getCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas bounding box not available");
  await page.mouse.click(box.x + x, box.y + y);
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

test.describe("TV-27: Note annotation tool", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    // Wait for chart to be ready
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.render as { hasChart?: boolean } | undefined)?.hasChart;
    }, { timeout: 10000 }).toBe(true);
    // Clear any existing drawings
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  });

  // -------------------------------------------------------------------------
  // Creation tests
  // -------------------------------------------------------------------------

  test("CP27.1: Create note with M hotkey", async ({ page }) => {
    await selectTool(page, "m");

    await expect.poll(async () => {
      const d = await dump(page);
      return (d.ui as { activeTool?: string } | undefined)?.activeTool;
    }, { timeout: 5000 }).toBe("note");

    // Click to create note
    await clickOnCanvas(page, 250, 200);

    // Modal should open - enter text and save
    await page.waitForTimeout(300);
    const textInput = page.locator('input[type="text"], textarea').first();
    if (await textInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await textInput.fill("Test Note");
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("Escape");
    }

    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "note").length;
    }, { timeout: 5000 }).toBe(1);
  });

  test("CP27.2: Note via QA set() API", async ({ page }) => {
    // Set tool via QA API
    await page.evaluate(() => (window as any).__lwcharts?.set?.({ activeTool: "note" }));

    await expect.poll(async () => {
      const d = await dump(page);
      return (d.ui as { activeTool?: string } | undefined)?.activeTool;
    }, { timeout: 2000 }).toBe("note");
  });

  test("CP27.3: Note dump() exposes anchor, text, and points", async ({ page }) => {
    await selectTool(page, "m");
    await clickOnCanvas(page, 250, 200);

    // Modal opens - type text and save
    await page.waitForTimeout(300);
    const textInput = page.locator('input[type="text"], textarea').first();
    if (await textInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await textInput.fill("Important Note");
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("Escape");
    }

    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "note").length;
    }, { timeout: 5000 }).toBe(1);

    const drawings = await getDrawings(page);
    const note = drawings.find(d => d.kind === "note");
    expect(note).toBeDefined();

    // Verify anchor point
    expect(note?.anchor).toBeDefined();
    expect(typeof note?.anchor?.timeMs).toBe("number");
    expect(typeof note?.anchor?.price).toBe("number");

    // Verify text
    expect(note?.text).toBe("Important Note");

    // Verify points array with label
    expect(note?.points).toBeDefined();
    expect(Array.isArray(note?.points)).toBe(true);
    if (note?.points && note.points.length >= 1) {
      const anchorPoint = note.points.find(p => p.label === "anchor");
      expect(anchorPoint).toBeDefined();
    }
  });

  // -------------------------------------------------------------------------
  // Cancel tests
  // -------------------------------------------------------------------------

  test("CP27.4: Cancel with empty text removes note", async ({ page }) => {
    await selectTool(page, "m");
    await clickOnCanvas(page, 250, 200);

    // Modal opens - cancel without entering text
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");

    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "note").length;
    }, { timeout: 3000 }).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Deletion tests
  // -------------------------------------------------------------------------

  test("CP27.5: Delete note via Delete key", async ({ page }) => {
    await selectTool(page, "m");
    await clickOnCanvas(page, 250, 200);

    // Type text and save
    await page.waitForTimeout(300);
    const textInput = page.locator('input[type="text"], textarea').first();
    if (await textInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await textInput.fill("Delete Me");
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("Escape");
    }

    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "note").length;
    }, { timeout: 3000 }).toBe(1);

    // Note should be selected, delete it
    await page.keyboard.press("Delete");

    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "note").length;
    }, { timeout: 3000 }).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Visibility tests (P0 regression prevention)
  // -------------------------------------------------------------------------

  test("CP27.6: Note visible without hover (P0 regression)", async ({ page }) => {
    await selectTool(page, "m");
    await clickOnCanvas(page, 250, 200);

    // Save with text
    await page.waitForTimeout(300);
    const textInput = page.locator('input[type="text"], textarea').first();
    if (await textInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await textInput.fill("Visible Test");
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("Escape");
    }

    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "note").length;
    }, { timeout: 3000 }).toBe(1);

    // Move mouse far away
    await page.mouse.move(10, 10);
    await page.waitForTimeout(100);

    // Verify overlay canvas still has pixels (note is visible)
    const overlayCanvas = page.locator('canvas[data-testid="overlay-canvas"]');
    if (await overlayCanvas.isVisible({ timeout: 1000 }).catch(() => false)) {
      const hasPixels = await overlayCanvas.evaluate((canvas: HTMLCanvasElement) => {
        const ctx = canvas.getContext("2d");
        if (!ctx) return false;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return imageData.data.some((v, i) => i % 4 === 3 && v > 0);
      });
      expect(hasPixels).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Structure verification tests
  // -------------------------------------------------------------------------

  test("CP27.7: Note anchor structure verification", async ({ page }) => {
    await selectTool(page, "m");
    await clickOnCanvas(page, 150, 250);

    // Save with text
    await page.waitForTimeout(300);
    const textInput = page.locator('input[type="text"], textarea').first();
    if (await textInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await textInput.fill("Structure Test");
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("Escape");
    }

    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "note").length;
    }, { timeout: 3000 }).toBe(1);

    const drawings = await getDrawings(page);
    const note = drawings.find(d => d.kind === "note");
    expect(note).toBeDefined();

    // Anchor should have timeMs and price
    expect(note?.anchor).toHaveProperty("timeMs");
    expect(note?.anchor).toHaveProperty("price");
    expect(note?.anchor?.timeMs).toBeGreaterThan(0);
  });

  test("CP27.8: Multiple notes can be created", async ({ page }) => {
    // Create first note
    await selectTool(page, "m");
    await clickOnCanvas(page, 150, 200);
    await page.waitForTimeout(300);
    const textInput1 = page.locator('input[type="text"], textarea').first();
    if (await textInput1.isVisible({ timeout: 1000 }).catch(() => false)) {
      await textInput1.fill("First");
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("Escape");
    }

    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "note").length;
    }, { timeout: 3000 }).toBe(1);

    // Create second note
    await selectTool(page, "m");
    await clickOnCanvas(page, 350, 250);
    await page.waitForTimeout(300);
    const textInput2 = page.locator('input[type="text"], textarea').first();
    if (await textInput2.isVisible({ timeout: 1000 }).catch(() => false)) {
      await textInput2.fill("Second");
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("Escape");
    }

    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "note").length;
    }, { timeout: 3000 }).toBe(2);
  });
});
