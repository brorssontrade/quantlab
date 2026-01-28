/**
 * CP32: Head & Shoulders Pattern Tests
 * 
 * Tests TV-32: Head & Shoulders Pattern Implementation
 * 
 * Head & Shoulders Pattern: 5-point reversal pattern
 * - p1 = Left Shoulder (LS)
 * - p2 = Head 
 * - p3 = Right Shoulder (RS)
 * - p4 = Neckline Point 1 (NL1)
 * - p5 = Neckline Point 2 (NL2)
 * 
 * Pattern Direction:
 * - Normal (bearish): Head is highest point (Head > LS && Head > RS)
 * - Inverse (bullish): Head is lowest point (Head < LS && Head < RS)
 * 
 * Hotkey: Q
 */
import { test, expect, Page, TestInfo } from "@playwright/test";
import { gotoChartsPro, getChartsProContainer, handleToScreenCoords } from "./helpers";

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

async function getCanvas(page: Page) {
  const canvas = page.locator(".tv-lightweight-charts canvas").first();
  await expect(canvas).toBeVisible();
  return canvas;
}

async function clearDrawings(page: Page) {
  await page.evaluate(() => {
    const charts = (window as any).__lwcharts;
    if (charts?.set) charts.set({ drawings: [] });
  });
  // Poll until drawings are cleared
  await expect.poll(async () => {
    const d = await dump(page);
    return (d.objects as unknown[])?.length ?? 0;
  }, { timeout: 2000 }).toBe(0);
}

async function getHSDrawing(page: Page) {
  const d = await dump(page);
  const objects = d.objects as { type?: string }[] | undefined;
  return objects?.find((o) => o.type === "headAndShoulders") as Record<string, unknown> | undefined;
}

async function selectDrawingById(page: Page, id: string) {
  await page.evaluate((drawingId) => {
    const charts = (window as any).__lwcharts;
    if (charts?.set) charts.set({ selectedId: drawingId });
  }, id);
  await expect.poll(async () => {
    const d = await dump(page);
    return (d.ui as { selectedObjectId?: string } | undefined)?.selectedObjectId;
  }, { timeout: 2000 }).toBe(id);
}

// ============================================================
// TV-32: Head & Shoulders Pattern Tests - CP32
// ============================================================

test.describe("TV-32: Head & Shoulders Pattern - CP32", () => {
  test.beforeEach(async ({ page }, testInfo: TestInfo) => {
    await gotoChartsPro(page, testInfo, { mock: true });
    // Wait for chart to be ready
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.render as { hasChart?: boolean } | undefined)?.hasChart;
    }, { timeout: 10000 }).toBe(true);
    // Clear any existing drawings
    await clearDrawings(page);
    // Verify drawings are cleared
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.objects as unknown[])?.length ?? 0;
    }, { timeout: 2000 }).toBe(0);
    // Clear any existing selections
    await page.keyboard.press("Escape");
    await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");
  });

  // ─────────────────────────────────────────────────────────────
  // TV-32.5.1: Hotkey & Tool Selection
  // ─────────────────────────────────────────────────────────────

  test.describe("TV-32.5.1: Hotkey & Tool Selection", () => {
    test("should select Head & Shoulders tool via hotkey Q", async ({ page }) => {
      await page.keyboard.press("q");
      
      await expect.poll(async () => {
        return await getActiveTool(page);
      }, { timeout: 3000 }).toBe("headAndShoulders");
    });

    test("should deselect Head & Shoulders tool with Escape", async ({ page }) => {
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      await page.keyboard.press("Escape");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TV-32.5.2: Head & Shoulders Creation via 5 Clicks
  // ─────────────────────────────────────────────────────────────

  test.describe("TV-32.5.2: Head & Shoulders Creation", () => {
    test("should create H&S via 5 clicks and expose in dump()", async ({ page }) => {
      // Select H&S tool
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      // Get chart container for proper coordinate mapping
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // Create a Normal (bearish) Head & Shoulders pattern:
      // LS = left shoulder (moderate high)
      // Head = center (highest point)
      // RS = right shoulder (moderate high)
      // NL1 = neckline left point (low between LS and Head)
      // NL2 = neckline right point (low between Head and RS)
      const lsX = box!.x + box!.width * 0.15;
      const lsY = box!.y + box!.height * 0.35;  // Left Shoulder - moderate high
      const headX = box!.x + box!.width * 0.35;
      const headY = box!.y + box!.height * 0.15; // Head - highest (lowest Y)
      const rsX = box!.x + box!.width * 0.55;
      const rsY = box!.y + box!.height * 0.35;   // Right Shoulder - moderate high
      const nl1X = box!.x + box!.width * 0.25;
      const nl1Y = box!.y + box!.height * 0.55;  // NL1 - neckline left
      const nl2X = box!.x + box!.width * 0.65;
      const nl2Y = box!.y + box!.height * 0.5;   // NL2 - neckline right
      
      // 5 clicks to create H&S: LS → Head → RS → NL1 → NL2
      await page.mouse.click(lsX, lsY, { delay: 50 });
      await page.mouse.click(headX, headY, { delay: 50 });
      await page.mouse.click(rsX, rsY, { delay: 50 });
      await page.mouse.click(nl1X, nl1Y, { delay: 50 });
      await page.mouse.click(nl2X, nl2Y, { delay: 50 });

      // Wait for H&S and verify structure
      await expect.poll(async () => {
        const d = await dump(page);
        const objects = d.objects as { type?: string }[] | undefined;
        return objects?.some((o) => o.type === "headAndShoulders");
      }, { timeout: 3000 }).toBe(true);

      // Verify H&S has correct structure
      const hs = await getHSDrawing(page);
      expect(hs).toBeTruthy();
      expect(hs!.type).toBe("headAndShoulders");
      expect(hs!.points).toHaveLength(5);  // LS, Head, RS, NL1, NL2
      expect(hs!.p1).toBeDefined();  // LS
      expect(hs!.p2).toBeDefined();  // Head
      expect(hs!.p3).toBeDefined();  // RS
      expect(hs!.p4).toBeDefined();  // NL1
      expect(hs!.p5).toBeDefined();  // NL2
      
      // Verify point labels
      const points = hs!.points as { label: string }[];
      expect(points.map(p => p.label)).toEqual(["LS", "Head", "RS", "NL1", "NL2"]);
    });

    test("should set inverse field based on Head vs Shoulders prices", async ({ page }) => {
      // Select H&S tool
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // Create a Head & Shoulders pattern - the inverse field should be set
      // based on the actual price relationships, regardless of intended pattern
      const lsX = box!.x + box!.width * 0.15;
      const lsY = box!.y + box!.height * 0.45;
      const headX = box!.x + box!.width * 0.35;
      const headY = box!.y + box!.height * 0.65;  // Different Y for Head
      const rsX = box!.x + box!.width * 0.55;
      const rsY = box!.y + box!.height * 0.45;
      const nl1X = box!.x + box!.width * 0.25;
      const nl1Y = box!.y + box!.height * 0.55;
      const nl2X = box!.x + box!.width * 0.65;
      const nl2Y = box!.y + box!.height * 0.55;
      
      // 5 clicks to create H&S
      // Use locator.click with force to ensure click happens at exact position
      await container.click({ position: { x: lsX - box!.x, y: lsY - box!.y } });
      await page.waitForTimeout(150);
      
      await container.click({ position: { x: headX - box!.x, y: headY - box!.y } });
      await page.waitForTimeout(150);
      
      await container.click({ position: { x: rsX - box!.x, y: rsY - box!.y } });
      await page.waitForTimeout(150);
      
      await container.click({ position: { x: nl1X - box!.x, y: nl1Y - box!.y } });
      await page.waitForTimeout(150);
      
      await container.click({ position: { x: nl2X - box!.x, y: nl2Y - box!.y } });

      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        return hs?.type === "headAndShoulders";
      }, { timeout: 3000 }).toBe(true);

      // Verify inverse field is set (boolean, not undefined)
      const hs = await getHSDrawing(page);
      const p1 = hs!.p1 as { price: number };
      const p2 = hs!.p2 as { price: number };
      const p3 = hs!.p3 as { price: number };
      
      // The inverse field should be a boolean (either true or false)
      expect(typeof hs!.inverse).toBe("boolean");
      
      // And it should match the actual price relationship
      const expectedInverse = p2.price < p1.price && p2.price < p3.price;
      expect(hs!.inverse).toBe(expectedInverse);
    });

    test("should auto-select drawing after creation", async ({ page }) => {
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // Normal H&S clicks
      await page.mouse.click(box!.x + box!.width * 0.15, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.15, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.55, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.65, box!.y + box!.height * 0.5, { delay: 50 });

      // Wait for H&S to be created AND selected
      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        return hs?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Verify it's selected
      const hs = await getHSDrawing(page);
      expect(hs!.selected).toBe(true);
      
      // Tool should switch back to select
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TV-32.5.3: HandlesPx for LS, Head, RS, NL1, NL2
  // ─────────────────────────────────────────────────────────────

  test.describe("TV-32.5.3: HandlesPx Verification", () => {
    test("dump should expose handlesPx with LS, Head, RS, NL1, NL2 handles", async ({ page }) => {
      // Create H&S
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // Create normal H&S
      await page.mouse.click(box!.x + box!.width * 0.15, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.15, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.55, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.65, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        return hs?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Verify handlesPx has LS, Head, RS, NL1, NL2
      const hs = await getHSDrawing(page);
      const handlesPx = hs!.handlesPx as Record<string, { x: number; y: number }>;
      
      expect(handlesPx).toBeDefined();
      expect(handlesPx.LS).toBeDefined();
      expect(handlesPx.Head).toBeDefined();
      expect(handlesPx.RS).toBeDefined();
      expect(handlesPx.NL1).toBeDefined();
      expect(handlesPx.NL2).toBeDefined();
      
      // All handles should have valid coordinates
      for (const handle of ["LS", "Head", "RS", "NL1", "NL2"]) {
        expect(typeof handlesPx[handle].x).toBe("number");
        expect(typeof handlesPx[handle].y).toBe("number");
        expect(Number.isFinite(handlesPx[handle].x)).toBe(true);
        expect(Number.isFinite(handlesPx[handle].y)).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TV-32.5.4: Drag Handles
  // ─────────────────────────────────────────────────────────────

  test.describe("TV-32.5.4: Drag Handles", () => {
    test("dragging Head handle should update position", async ({ page }) => {
      // Create H&S
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.15, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.15, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.55, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.65, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        return hs?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Get initial Head position
      const initialHs = await getHSDrawing(page);
      const initialP2 = initialHs!.p2 as { timeMs: number; price: number };
      const handlesPx = initialHs!.handlesPx as Record<string, { x: number; y: number }>;

      // Drag Head handle
      const headPos = await handleToScreenCoords(page, handlesPx, "Head");
      const dragDelta = 30;
      
      await page.mouse.move(headPos.x, headPos.y);
      await page.mouse.down();
      await page.mouse.move(headPos.x, headPos.y + dragDelta, { steps: 5 });
      await page.mouse.up();
      
      // Poll until Head price changes
      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        const p2 = hs?.p2 as { price: number } | undefined;
        return p2?.price !== initialP2.price;
      }, { timeout: 3000 }).toBe(true);

      // Verify Head changed
      const updatedHs = await getHSDrawing(page);
      const updatedP2 = updatedHs!.p2 as { timeMs: number; price: number };
      expect(updatedP2.price).not.toBeCloseTo(initialP2.price, 0);
    });

    test("dragging NL1 handle should update neckline", async ({ page }) => {
      // Create H&S
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.15, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.15, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.55, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.65, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        return hs?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Get initial NL1 position
      const initialHs = await getHSDrawing(page);
      const initialP4 = initialHs!.p4 as { timeMs: number; price: number };
      const handlesPx = initialHs!.handlesPx as Record<string, { x: number; y: number }>;

      // Drag NL1 handle
      const nl1Pos = await handleToScreenCoords(page, handlesPx, "NL1");
      const dragDelta = 40;
      
      await page.mouse.move(nl1Pos.x, nl1Pos.y);
      await page.mouse.down();
      await page.mouse.move(nl1Pos.x, nl1Pos.y + dragDelta, { steps: 5 });
      await page.mouse.up();
      
      // Poll until NL1 price changes
      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        const p4 = hs?.p4 as { price: number } | undefined;
        return p4?.price !== initialP4.price;
      }, { timeout: 3000 }).toBe(true);

      // Verify NL1 changed
      const updatedHs = await getHSDrawing(page);
      const updatedP4 = updatedHs!.p4 as { timeMs: number; price: number };
      expect(updatedP4.price).not.toBeCloseTo(initialP4.price, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TV-32.5.5: Delete, Lock, Hide
  // ─────────────────────────────────────────────────────────────

  test.describe("TV-32.5.5: Delete, Lock, Hide", () => {
    test("pressing Delete should remove selected H&S", async ({ page }) => {
      // Create H&S
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.15, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.15, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.55, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.65, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        return hs?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Delete the H&S
      await page.keyboard.press("Delete");

      // Wait for H&S to be removed
      await expect.poll(async () => {
        const d = await dump(page);
        const objects = d.objects as unknown[] | undefined;
        return objects?.length ?? 0;
      }, { timeout: 3000 }).toBe(0);
    });

    test("pressing Shift+L should toggle lock on selected H&S", async ({ page }) => {
      // Create H&S
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.15, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.15, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.55, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.65, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        return hs?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Verify not locked initially
      let hs = await getHSDrawing(page);
      expect(hs!.locked).toBeFalsy();

      // Press Shift+L to lock
      await page.keyboard.press("Shift+l");
      
      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        return hs?.locked === true;
      }, { timeout: 2000 }).toBe(true);

      // Press Shift+L again to unlock
      await page.keyboard.press("Shift+l");
      
      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        return hs?.locked === false;
      }, { timeout: 2000 }).toBe(true);
    });

    test("pressing Shift+H should toggle visibility on selected H&S", async ({ page }) => {
      // Create H&S
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.15, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.15, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.55, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.65, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        return hs?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Verify visible initially
      let hs = await getHSDrawing(page);
      expect(hs!.hidden).toBeFalsy();

      // Press Shift+H to hide
      await page.keyboard.press("Shift+h");
      
      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        return hs?.hidden === true;
      }, { timeout: 2000 }).toBe(true);
    });

    // ─────────────────────────────────────────────────────────────
    // REGRESSION: Shift+L lock does NOT switch tool
    // ─────────────────────────────────────────────────────────────
    test("Shift+L should lock without switching tool from select", async ({ page }) => {
      // Create H&S with Q hotkey
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.15, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.15, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.55, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.65, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        return hs?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Tool should be select after creation
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");

      // Press Shift+L to lock – should NOT switch tool to longPosition
      await page.keyboard.press("Shift+l");
      
      // Verify tool is still select (regression: was switching to longPosition)
      const toolAfter = await getActiveTool(page);
      expect(toolAfter).toBe("select");
      
      // Verify lock was toggled
      const hs = await getHSDrawing(page);
      expect(hs?.locked).toBe(true);
    });

    // ─────────────────────────────────────────────────────────────
    // REGRESSION: Shift+H hide does NOT switch tool
    // ─────────────────────────────────────────────────────────────
    test("Shift+H should hide without switching tool from select", async ({ page }) => {
      // Create H&S with Q hotkey
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.15, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.15, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.55, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.65, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const hs = await getHSDrawing(page);
        return hs?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Tool should be select after creation
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");

      // Press Shift+H to hide – should NOT switch tool to hline
      await page.keyboard.press("Shift+h");
      
      // Verify tool is still select (regression: was switching to hline)
      const toolAfter = await getActiveTool(page);
      expect(toolAfter).toBe("select");
      
      // Verify hide was toggled
      const hs = await getHSDrawing(page);
      expect(hs?.hidden).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TV-32.5.6: Z-Order Verification
  // ─────────────────────────────────────────────────────────────

  test.describe("TV-32.5.6: Z-Order", () => {
    test("new H&S should have higher z than existing drawings", async ({ page }) => {
      // Create first H&S
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // First H&S at left side of chart
      await page.mouse.click(box!.x + box!.width * 0.10, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.20, box!.y + box!.height * 0.15, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.30, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.15, box!.y + box!.height * 0.55, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const d = await dump(page);
        return (d.objects as unknown[])?.length ?? 0;
      }, { timeout: 3000 }).toBe(1);

      const firstHs = await getHSDrawing(page);
      const firstZ = firstHs!.z as number;

      // Deselect and create second H&S
      await page.keyboard.press("Escape");
      await page.keyboard.press("q");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("headAndShoulders");
      
      // Second H&S at right side of chart
      await page.mouse.click(box!.x + box!.width * 0.50, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.60, box!.y + box!.height * 0.15, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.70, box!.y + box!.height * 0.35, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.55, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.75, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const d = await dump(page);
        return (d.objects as unknown[])?.length ?? 0;
      }, { timeout: 3000 }).toBe(2);

      // Get second H&S (most recently selected)
      const d = await dump(page);
      const objects = d.objects as { type?: string; selected?: boolean; z?: number }[];
      const secondHs = objects.find((o) => o.type === "headAndShoulders" && o.selected);
      
      expect(secondHs).toBeTruthy();
      expect(secondHs!.z).toBeGreaterThan(firstZ);
    });
  });
});
