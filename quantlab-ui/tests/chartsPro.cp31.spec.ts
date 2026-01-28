/**
 * CP31: ABCD Pattern Tests
 * 
 * Tests TV-31: ABCD Harmonic Pattern Implementation
 * 
 * ABCD Pattern: D = C + k * (B - A)
 * - Standard ABCD has k=1 (AB=CD in vector form)
 * - Dragging D changes k (via projection onto AB direction)
 * - 3-click workflow: A → B → C, D computed automatically
 * 
 * Hotkey: W
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

async function getABCDDrawing(page: Page) {
  const d = await dump(page);
  const objects = d.objects as { type?: string }[] | undefined;
  return objects?.find((o) => o.type === "abcd") as Record<string, unknown> | undefined;
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
// TV-31: ABCD Pattern Tests - CP31
// ============================================================

test.describe("TV-31: ABCD Pattern - CP31", () => {
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
  // TV-31.5.1: Hotkey & Tool Selection
  // ─────────────────────────────────────────────────────────────

  test.describe("TV-31.5.1: Hotkey & Tool Selection", () => {
    test("should select ABCD tool via hotkey W", async ({ page }) => {
      await page.keyboard.press("w");
      
      await expect.poll(async () => {
        return await getActiveTool(page);
      }, { timeout: 3000 }).toBe("abcd");
    });

    test("should deselect ABCD tool with Escape", async ({ page }) => {
      await page.keyboard.press("w");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("abcd");
      
      await page.keyboard.press("Escape");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TV-31.5.2: ABCD Creation via 3 Clicks
  // ─────────────────────────────────────────────────────────────

  test.describe("TV-31.5.2: ABCD Creation", () => {
    test("should create ABCD via 3 clicks and expose in dump()", async ({ page }) => {
      // Select ABCD tool
      await page.keyboard.press("w");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("abcd");
      
      // Get chart container for proper coordinate mapping
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // Create an ABCD pattern:
      // A = bottom left (start of first leg)
      // B = top middle (end of first leg, start of retracement)
      // C = middle lower (end of retracement)
      // D = computed automatically (CD parallel to AB)
      const pAX = box!.x + box!.width * 0.2;
      const pAY = box!.y + box!.height * 0.7;  // A - bottom left
      const pBX = box!.x + box!.width * 0.4;
      const pBY = box!.y + box!.height * 0.3;  // B - top (swing high)
      const pCX = box!.x + box!.width * 0.6;
      const pCY = box!.y + box!.height * 0.5;  // C - pullback
      
      // 3 clicks to create ABCD
      await page.mouse.click(pAX, pAY, { delay: 50 });
      await page.mouse.click(pBX, pBY, { delay: 50 });
      await page.mouse.click(pCX, pCY, { delay: 50 });

      // Wait for ABCD and verify structure
      await expect.poll(async () => {
        const d = await dump(page);
        const objects = d.objects as { type?: string }[] | undefined;
        return objects?.some((o) => o.type === "abcd");
      }, { timeout: 3000 }).toBe(true);

      // Verify ABCD has correct structure
      const abcd = await getABCDDrawing(page);
      expect(abcd).toBeTruthy();
      expect(abcd!.type).toBe("abcd");
      expect(abcd!.points).toHaveLength(4);  // A, B, C, D
      expect(abcd!.p1).toBeDefined();  // A
      expect(abcd!.p2).toBeDefined();  // B
      expect(abcd!.p3).toBeDefined();  // C
      expect(abcd!.p4).toBeDefined();  // D (computed)
      
      // Verify k is set to default 1.0
      expect(abcd!.k).toBe(1);
      
      // Verify point labels
      const points = abcd!.points as { label: string }[];
      expect(points.map(p => p.label)).toEqual(["A", "B", "C", "D"]);
    });

    test("ABCD p4 (D) should follow AB=CD formula with k=1", async ({ page }) => {
      // Select ABCD tool
      await page.keyboard.press("w");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("abcd");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // Create ABCD with known positions
      const pAX = box!.x + box!.width * 0.2;
      const pAY = box!.y + box!.height * 0.6;
      const pBX = box!.x + box!.width * 0.4;
      const pBY = box!.y + box!.height * 0.3;
      const pCX = box!.x + box!.width * 0.6;
      const pCY = box!.y + box!.height * 0.5;
      
      await page.mouse.click(pAX, pAY, { delay: 50 });
      await page.mouse.click(pBX, pBY, { delay: 50 });
      await page.mouse.click(pCX, pCY, { delay: 50 });

      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        return abcd?.type === "abcd";
      }, { timeout: 3000 }).toBe(true);

      // Get the ABCD and verify D = C + k*(B-A) with k=1
      const abcd = await getABCDDrawing(page);
      const p1 = abcd!.p1 as { timeMs: number; price: number };
      const p2 = abcd!.p2 as { timeMs: number; price: number };
      const p3 = abcd!.p3 as { timeMs: number; price: number };
      const p4 = abcd!.p4 as { timeMs: number; price: number };
      const k = abcd!.k as number;
      
      // D = C + k * (B - A)
      const expectedTimeMs = p3.timeMs + k * (p2.timeMs - p1.timeMs);
      const expectedPrice = p3.price + k * (p2.price - p1.price);
      
      expect(p4.timeMs).toBeCloseTo(expectedTimeMs, -3);  // Allow ms tolerance
      expect(p4.price).toBeCloseTo(expectedPrice, 2);    // Allow price tolerance
    });

    test("should auto-select drawing after creation", async ({ page }) => {
      await page.keyboard.press("w");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("abcd");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.2, box!.y + box!.height * 0.6, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.3, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5, { delay: 50 });

      // Wait for ABCD to be created AND selected
      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        return abcd?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Verify it's selected
      const abcd = await getABCDDrawing(page);
      expect(abcd!.selected).toBe(true);
      
      // Tool should switch back to select
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("select");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TV-31.5.3: HandlesPx for A, B, C, D
  // ─────────────────────────────────────────────────────────────

  test.describe("TV-31.5.3: HandlesPx Verification", () => {
    test("dump should expose handlesPx with A, B, C, D handles", async ({ page }) => {
      // Create ABCD
      await page.keyboard.press("w");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("abcd");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.2, box!.y + box!.height * 0.6, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.3, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        return abcd?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Verify handlesPx has A, B, C, D
      const abcd = await getABCDDrawing(page);
      const handlesPx = abcd!.handlesPx as Record<string, { x: number; y: number }>;
      
      expect(handlesPx).toBeDefined();
      expect(handlesPx.A).toBeDefined();
      expect(handlesPx.B).toBeDefined();
      expect(handlesPx.C).toBeDefined();
      expect(handlesPx.D).toBeDefined();
      
      // All handles should have valid coordinates
      for (const handle of ["A", "B", "C", "D"]) {
        expect(typeof handlesPx[handle].x).toBe("number");
        expect(typeof handlesPx[handle].y).toBe("number");
        expect(Number.isFinite(handlesPx[handle].x)).toBe(true);
        expect(Number.isFinite(handlesPx[handle].y)).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TV-31.5.4: Dragging A, B, C (D recomputes)
  // ─────────────────────────────────────────────────────────────

  test.describe("TV-31.5.4: Drag A/B/C → D Recomputes", () => {
    test("dragging C should update D position with same k", async ({ page }) => {
      // Create ABCD
      await page.keyboard.press("w");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("abcd");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.2, box!.y + box!.height * 0.6, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.3, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        return abcd?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Get initial values
      const initialAbcd = await getABCDDrawing(page);
      const initialP3 = initialAbcd!.p3 as { timeMs: number; price: number };
      const initialP4 = initialAbcd!.p4 as { timeMs: number; price: number };
      const initialK = initialAbcd!.k as number;
      const handlesPx = initialAbcd!.handlesPx as Record<string, { x: number; y: number }>;

      // Drag C handle down
      const cPos = await handleToScreenCoords(page, handlesPx, "C");
      const dragDelta = 50;
      
      await page.mouse.move(cPos.x, cPos.y);
      await page.mouse.down();
      await page.mouse.move(cPos.x, cPos.y + dragDelta, { steps: 5 });
      await page.mouse.up();
      
      // Poll until D price changes (D recomputes when C moves)
      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        const p4 = abcd?.p4 as { price: number } | undefined;
        return p4?.price !== initialP4.price;
      }, { timeout: 3000 }).toBe(true);

      // Get updated values
      const updatedAbcd = await getABCDDrawing(page);
      const updatedP3 = updatedAbcd!.p3 as { timeMs: number; price: number };
      const updatedP4 = updatedAbcd!.p4 as { timeMs: number; price: number };
      const updatedK = updatedAbcd!.k as number;
      
      // C should have changed
      expect(updatedP3.price).not.toBeCloseTo(initialP3.price, 0);
      
      // k should remain the same
      expect(updatedK).toBe(initialK);
      
      // D should have changed (recomputed from new C)
      expect(updatedP4.price).not.toBeCloseTo(initialP4.price, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TV-31.5.5: Dragging D Changes k
  // ─────────────────────────────────────────────────────────────

  test.describe("TV-31.5.5: Drag D → k Changes", () => {
    test("dragging D should change k value", async ({ page }) => {
      // Create ABCD
      await page.keyboard.press("w");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("abcd");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // Create a pattern with clear AB direction - ensure clicks are in chart area
      // Use coordinates that avoid toolbar/legend areas
      const clickA = { x: box!.x + box!.width * 0.2, y: box!.y + box!.height * 0.6 };  // Moved right from edge
      const clickB = { x: box!.x + box!.width * 0.4, y: box!.y + box!.height * 0.3 };
      const clickC = { x: box!.x + box!.width * 0.6, y: box!.y + box!.height * 0.5 };
      
      await page.mouse.click(clickA.x, clickA.y, { delay: 50 });
      // Wait for drawing to start
      await expect.poll(async () => {
        const d = await dump(page);
        return (d.objects as { type?: string }[])?.some((o) => o.type === "abcd");
      }, { timeout: 2000 }).toBe(true);
      
      await page.mouse.click(clickB.x, clickB.y, { delay: 50 });
      // Brief sync wait - phase advancement is synchronous
      await page.mouse.click(clickC.x, clickC.y, { delay: 50 });

      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        return abcd?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Get initial k
      const initialAbcd = await getABCDDrawing(page);
      const initialK = initialAbcd!.k as number;
      expect(initialK).toBe(1);  // Default k
      
      const handlesPx = initialAbcd!.handlesPx as Record<string, { x: number; y: number }>;

      // Drag D handle to extend the pattern
      const dPos = await handleToScreenCoords(page, handlesPx, "D");
      
      // Click on D first to ensure we hit it
      await page.mouse.click(dPos.x, dPos.y);
      // Poll until selection is confirmed
      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        return abcd?.selected === true;
      }, { timeout: 2000 }).toBe(true);
      
      // Drag D further along AB direction (up and right for bullish pattern)
      await page.mouse.move(dPos.x, dPos.y);
      await page.mouse.down();
      await page.mouse.move(dPos.x + 100, dPos.y - 80, { steps: 10 });
      await page.mouse.up();
      
      // Poll until k changes from initial value
      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        return abcd?.k !== initialK;
      }, { timeout: 3000 }).toBe(true);

      // Get updated k
      const updatedAbcd = await getABCDDrawing(page);
      const updatedK = updatedAbcd!.k as number;
      
      // k should have changed (likely increased since we extended D)
      expect(updatedK).not.toBe(initialK);
      expect(updatedK).toBeGreaterThan(0.1);  // k should be positive and valid
      expect(updatedK).toBeLessThan(5.0);     // k should be within valid range
    });

    test("D position should remain on AB direction line after drag", async ({ page }) => {
      // Create ABCD
      await page.keyboard.press("w");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("abcd");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // Use safe coordinates away from edges
      await page.mouse.click(box!.x + box!.width * 0.2, box!.y + box!.height * 0.6, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.3, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        return abcd?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      const initialAbcd = await getABCDDrawing(page);
      const initialP4 = initialAbcd!.p4 as { timeMs: number; price: number };
      const handlesPx = initialAbcd!.handlesPx as Record<string, { x: number; y: number }>;

      // Drag D with a larger movement to ensure k changes noticeably
      const dPos = await handleToScreenCoords(page, handlesPx, "D");
      
      await page.mouse.move(dPos.x, dPos.y);
      await page.mouse.down();
      // Drag further along AB direction (larger movement)
      await page.mouse.move(dPos.x + 80, dPos.y - 60, { steps: 10 });
      await page.mouse.up();
      
      // Poll until p4 changes (drag completed)
      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        const p4 = abcd?.p4 as { price: number } | undefined;
        return p4?.price !== initialP4.price;
      }, { timeout: 3000 }).toBe(true);

      // Verify D = C + k*(B-A) still holds
      const updatedAbcd = await getABCDDrawing(page);
      const p1 = updatedAbcd!.p1 as { timeMs: number; price: number };
      const p2 = updatedAbcd!.p2 as { timeMs: number; price: number };
      const p3 = updatedAbcd!.p3 as { timeMs: number; price: number };
      const p4 = updatedAbcd!.p4 as { timeMs: number; price: number };
      const k = updatedAbcd!.k as number;
      
      const expectedTimeMs = p3.timeMs + k * (p2.timeMs - p1.timeMs);
      const expectedPrice = p3.price + k * (p2.price - p1.price);
      
      expect(p4.timeMs).toBeCloseTo(expectedTimeMs, -3);
      expect(p4.price).toBeCloseTo(expectedPrice, 1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TV-31.5.6: Delete, Lock, Hide
  // ─────────────────────────────────────────────────────────────

  test.describe("TV-31.5.6: Delete, Lock, Hide", () => {
    test("should delete ABCD with Delete key", async ({ page }) => {
      // Create ABCD
      await page.keyboard.press("w");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("abcd");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.2, box!.y + box!.height * 0.6, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.3, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        return abcd?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Delete
      await page.keyboard.press("Delete");
      
      // Verify deleted
      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        return abcd;
      }, { timeout: 2000 }).toBeUndefined();
    });

    test("should lock/unlock ABCD", async ({ page }) => {
      // Create ABCD
      await page.keyboard.press("w");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("abcd");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.2, box!.y + box!.height * 0.6, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.3, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        return abcd?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Lock via floating toolbar
      const lockBtn = page.getByTestId("floating-toolbar-lock");
      if (await lockBtn.isVisible({ timeout: 2000 })) {
        await lockBtn.click();
        
        // Verify locked
        await expect.poll(async () => {
          const abcd = await getABCDDrawing(page);
          return abcd?.locked;
        }, { timeout: 2000 }).toBe(true);
        
        // Unlock
        await lockBtn.click();
        await expect.poll(async () => {
          const abcd = await getABCDDrawing(page);
          return abcd?.locked;
        }, { timeout: 2000 }).toBe(false);
      }
    });

    test("should hide/show ABCD", async ({ page }) => {
      // Create ABCD
      await page.keyboard.press("w");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("abcd");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.2, box!.y + box!.height * 0.6, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.3, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        return abcd?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Hide via floating toolbar
      const hideBtn = page.getByTestId("floating-toolbar-hide");
      if (await hideBtn.isVisible({ timeout: 2000 })) {
        await hideBtn.click();
        
        // Verify hidden
        await expect.poll(async () => {
          const abcd = await getABCDDrawing(page);
          return abcd?.hidden;
        }, { timeout: 2000 }).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TV-31.5.7: Z-Order Verification
  // ─────────────────────────────────────────────────────────────

  test.describe("TV-31.5.7: Z-Order", () => {
    test("ABCD should have valid z-order on creation", async ({ page }) => {
      // Create ABCD
      await page.keyboard.press("w");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("abcd");
      
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      await page.mouse.click(box!.x + box!.width * 0.2, box!.y + box!.height * 0.6, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.3, { delay: 50 });
      await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5, { delay: 50 });

      await expect.poll(async () => {
        const abcd = await getABCDDrawing(page);
        return abcd?.type === "abcd";
      }, { timeout: 3000 }).toBe(true);

      const abcd = await getABCDDrawing(page);
      expect(typeof abcd!.z).toBe("number");
      expect(Number.isFinite(abcd!.z as number)).toBe(true);
    });
  });
});
