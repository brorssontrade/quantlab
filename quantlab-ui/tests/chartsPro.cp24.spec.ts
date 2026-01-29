/**
 * TV-24 – Ray + Extended Line Drawing Tools
 * 
 * Tests:
 * - CP24.1: Create ray drawing with A hotkey
 * - CP24.2: Create extended line with E hotkey
 * - CP24.3: Ray is auto-selected after drawing
 * - CP24.4: Extended line is auto-selected after drawing
 * - CP24.5: Drag ray endpoint updates geometry
 * - CP24.6: Delete ray via delete key
 */
import { test, expect, Page } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

async function dump(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const w = window as unknown as { __lwcharts?: { dump?: () => Record<string, unknown> } };
    return w.__lwcharts?.dump?.() ?? {};
  });
}

async function getDrawings(page: Page): Promise<Array<{ id: string; kind: string; type: string; p1: { timeMs: number; price: number }; p2: { timeMs: number; price: number } }>> {
  const d = await dump(page);
  const objects = d.objects as Array<unknown> | undefined;
  if (!Array.isArray(objects)) return [];
  return objects.map((item) => {
    const obj = item as Record<string, unknown>;
    return {
      id: obj.id as string,
      kind: obj.type as string, // objects use "type" instead of "kind"
      type: obj.type as string,
      p1: obj.p1 as { timeMs: number; price: number },
      p2: obj.p2 as { timeMs: number; price: number },
    };
  });
}

async function selectTool(page: Page, hotkey: string) {
  // Press the hotkey to select the tool
  // Note: "v" is for vline, use "Escape" for select tool
  await page.keyboard.press(hotkey);
  // Brief wait for tool selection to register
  await page.waitForTimeout(50);
}

async function getCanvas(page: Page) {
  const canvas = page.locator(".tv-lightweight-charts canvas").first();
  await expect(canvas).toBeVisible();
  return canvas;
}

async function drawTwoPointTool(page: Page, startX: number, startY: number, endX: number, endY: number) {
  const canvas = await getCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas bounding box not available");

  // Click-drag pattern: mousedown at start, move to end, mouseup
  await page.mouse.move(box.x + startX, box.y + startY);
  await page.mouse.down();
  await page.mouse.move(box.x + endX, box.y + endY);
  await page.mouse.up();
}

test.describe("TV-24: Ray + Extended Line", () => {
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

  test("CP24.1: Create ray drawing with A hotkey", async ({ page }) => {
    // Select ray tool (A for Arrow/Ray)
    await selectTool(page, "a");

    // Verify ray tool is selected
    await expect.poll(async () => {
      const d = await dump(page);
      const ui = d.ui as { activeTool?: string } | undefined;
      return ui?.activeTool;
    }, { timeout: 5000 }).toBe("ray");

    // Draw a ray
    await drawTwoPointTool(page, 200, 250, 400, 200);

    // Wait for drawing to appear
    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "ray").length;
    }, { timeout: 5000 }).toBe(1);

    // Verify the ray drawing exists with correct kind
    const drawings = await getDrawings(page);
    const ray = drawings.find(d => d.kind === "ray");
    expect(ray).toBeDefined();
    expect(ray?.kind).toBe("ray");
    expect(ray?.p1).toBeDefined();
    expect(ray?.p2).toBeDefined();
  });

  test("CP24.2: Create extended line with E hotkey", async ({ page }) => {
    // Select extended line tool
    await selectTool(page, "e");

    // Verify extended line tool is selected
    await expect.poll(async () => {
      const d = await dump(page);
      const ui = d.ui as { activeTool?: string } | undefined;
      return ui?.activeTool;
    }, { timeout: 5000 }).toBe("extendedLine");

    // Draw an extended line
    await drawTwoPointTool(page, 200, 200, 400, 300);

    // Wait for drawing to appear
    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "extendedLine").length;
    }, { timeout: 5000 }).toBe(1);

    // Verify the extended line drawing exists
    const drawings = await getDrawings(page);
    const extLine = drawings.find(d => d.kind === "extendedLine");
    expect(extLine).toBeDefined();
    expect(extLine?.kind).toBe("extendedLine");
  });

  test("CP24.3: Ray is auto-selected after drawing", async ({ page }) => {
    // Create a ray from (200,250) to (350,200)
    await selectTool(page, "a");
    await drawTwoPointTool(page, 200, 250, 350, 200);

    // Wait for drawing to appear and be auto-selected
    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      const d = await dump(page);
      const ui = d.ui as { selectedObjectId?: string } | undefined;
      const ray = drawings.find(dr => dr.kind === "ray");
      return ray && ui?.selectedObjectId === ray.id;
    }, { timeout: 5000 }).toBe(true);
  });

  test("CP24.4: Extended line is auto-selected after drawing", async ({ page }) => {
    // Create an extended line from (300,250) to (400,250) - horizontal line
    await selectTool(page, "e");
    await drawTwoPointTool(page, 300, 250, 400, 250);

    // Wait for drawing to appear and be selected
    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      const d = await dump(page);
      const ui = d.ui as { selectedObjectId?: string } | undefined;
      const extLine = drawings.find(dr => dr.kind === "extendedLine");
      return extLine && ui?.selectedObjectId === extLine.id;
    }, { timeout: 5000 }).toBe(true);
  });

  test("CP24.5: Multiple rays can be created", async ({ page }) => {
    // Create first ray
    await selectTool(page, "a");
    await drawTwoPointTool(page, 100, 200, 200, 180);

    // Wait for first drawing
    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "ray").length;
    }, { timeout: 5000 }).toBe(1);

    // Create second ray
    await selectTool(page, "a");
    await drawTwoPointTool(page, 300, 300, 400, 250);

    // Wait for second drawing
    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "ray").length;
    }, { timeout: 5000 }).toBe(2);

    // Verify both rays have valid p1/p2
    const drawings = await getDrawings(page);
    const rays = drawings.filter(d => d.kind === "ray");
    
    expect(rays[0].p1).toBeDefined();
    expect(rays[0].p2).toBeDefined();
    expect(rays[1].p1).toBeDefined();
    expect(rays[1].p2).toBeDefined();
    
    // Rays should have different positions
    expect(rays[0].p1.timeMs).not.toBe(rays[1].p1.timeMs);
  });

  test("CP24.6: Delete ray via delete key", async ({ page }) => {
    // Create a ray
    await selectTool(page, "a");
    await drawTwoPointTool(page, 200, 250, 350, 200);

    // Wait for drawing
    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "ray").length;
    }, { timeout: 5000 }).toBe(1);

    // Ray should be auto-selected after drawing
    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      const d = await dump(page);
      const ui = d.ui as { selectedObjectId?: string } | undefined;
      const ray = drawings.find(dr => dr.kind === "ray");
      return ray && ui?.selectedObjectId === ray.id;
    }, { timeout: 5000 }).toBe(true);

    // Press delete
    await page.keyboard.press("Delete");

    // Verify ray is deleted
    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "ray").length;
    }, { timeout: 5000 }).toBe(0);
  });

  test("CP24.7: Ray is visible immediately after creation (no hover required)", async ({ page }) => {
    /**
     * P0 BUG TEST: Drawings should be visible immediately after creation
     * without requiring any mouse movement/hover interaction.
     * 
     * Test approach:
     * 1. Create ray drawing
     * 2. Move mouse completely off-canvas (no hover)
     * 3. NO WAIT - sample pixel immediately
     * 4. Assert pixel has non-transparent color (alpha > 0)
     */
    
    // Get canvas
    const canvas = await getCanvas(page);
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas bounding box not available");
    
    // Select ray tool
    await selectTool(page, "a");
    
    // Draw ray from (200, 200) to (400, 200) - horizontal line
    const startX = 200;
    const startY = 200;
    const endX = 400;
    const endY = 200;
    
    await page.mouse.move(box.x + startX, box.y + startY);
    await page.mouse.down();
    await page.mouse.move(box.x + endX, box.y + endY);
    await page.mouse.up();
    
    // CRITICAL: Move mouse completely off-canvas to eliminate hover effects
    // This ensures we're testing "idle" visibility, not hover-triggered rendering
    await page.mouse.move(0, 0);
    
    // NO WAIT - test immediately!
    // The drawing should be visible on the very next frame after creation
    
    // PIXEL SAMPLING: Sample a pixel along the ray line
    // The ray goes from (200, 200) to (400, 200), so check at midpoint (300, 200)
    const sampleX = 300;
    const sampleY = 200;
    
    // Get pixel color at the expected line location
    const pixelData = await page.evaluate(({ canvasSelector, x, y }) => {
      const canvases = document.querySelectorAll(canvasSelector);
      // The drawing overlay canvas is typically the second or third canvas
      // Check all canvases for non-transparent pixel at the location
      for (const cvs of canvases) {
        const canvas = cvs as HTMLCanvasElement;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        
        const ratio = window.devicePixelRatio || 1;
        const pixel = ctx.getImageData(x * ratio, y * ratio, 1, 1).data;
        // Return if we find a non-transparent pixel (alpha > 0)
        if (pixel[3] > 0) {
          return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3], canvasFound: true };
        }
      }
      return { r: 0, g: 0, b: 0, a: 0, canvasFound: false };
    }, { canvasSelector: ".tv-lightweight-charts canvas, canvas[class*='overlay']", x: sampleX, y: sampleY });
    
    // The pixel at the ray location should have alpha > 0 (visible)
    expect(pixelData.a, `Ray should be visible at (${sampleX}, ${sampleY}) without hover. Got alpha=${pixelData.a}`).toBeGreaterThan(0);
    
    // Also verify drawing exists in store
    const drawings = await getDrawings(page);
    expect(drawings.filter(d => d.kind === "ray").length).toBe(1);
  });

  test("CP24.8: Drawings persist and render after page reload", async ({ page }) => {
    /**
     * Test that drawings loaded from localStorage render immediately on mount.
     * This tests the hydration path which might have different timing.
     */
    
    // Get canvas
    const canvas = await getCanvas(page);
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas bounding box not available");
    
    // Select ray tool and create a ray
    await selectTool(page, "a");
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 400, box.y + 200);
    await page.mouse.up();
    
    // Wait for drawing to be saved
    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "ray").length;
    }, { timeout: 5000 }).toBe(1);
    
    // Wait for autosave to localStorage (500ms debounce + buffer)
    await page.waitForTimeout(700);
    
    // Reload the page
    await page.reload();
    
    // Wait for chart to be ready again
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.render as { hasChart?: boolean } | undefined)?.hasChart;
    }, { timeout: 10000 }).toBe(true);
    
    // Move mouse off-canvas to avoid any hover effects
    await page.mouse.move(0, 0);
    
    // Verify drawing exists in store after reload
    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "ray").length;
    }, { timeout: 5000 }).toBe(1);
    
    // CRITICAL: Sample pixel immediately without any mouse interaction
    const sampleX = 300;
    const sampleY = 200;
    
    const pixelData = await page.evaluate(({ canvasSelector, x, y }) => {
      const canvases = document.querySelectorAll(canvasSelector);
      for (const cvs of canvases) {
        const canvas = cvs as HTMLCanvasElement;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        const ratio = window.devicePixelRatio || 1;
        const pixel = ctx.getImageData(x * ratio, y * ratio, 1, 1).data;
        if (pixel[3] > 0) {
          return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3], canvasFound: true };
        }
      }
      return { r: 0, g: 0, b: 0, a: 0, canvasFound: false };
    }, { canvasSelector: ".tv-lightweight-charts canvas, canvas[class*='overlay']", x: sampleX, y: sampleY });
    
    // The drawing should be visible after reload without any interaction
    expect(pixelData.a, `Ray should be visible at (${sampleX}, ${sampleY}) after reload without hover. Got alpha=${pixelData.a}`).toBeGreaterThan(0);
  });

  test("CP24.9: Drawing visible when DESELECTED (idle state regression test)", async ({ page }) => {
    /**
     * P0 REGRESSION TEST: Drawings must be visible in idle state (not selected, not hovered).
     * 
     * This tests the exact scenario where:
     * 1. Drawing is created (initially selected)
     * 2. Drawing is deselected by pressing Escape or clicking background
     * 3. Mouse is moved away from the drawing (no hover)
     * 4. Drawing should STILL be visible with adequate contrast
     */
    
    const canvas = await getCanvas(page);
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas bounding box not available");
    
    // Create a ray
    await selectTool(page, "a");
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 400, box.y + 200);
    await page.mouse.up();
    
    // Wait for drawing to be created
    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "ray").length;
    }, { timeout: 5000 }).toBe(1);
    
    // DESELECT: Press Escape to go to select mode and deselect
    await page.keyboard.press("Escape");
    await page.waitForTimeout(50);
    
    // Click on empty area to deselect (bottom right, far from line at y=200)
    await page.mouse.click(box.x + 100, box.y + box.height - 50);
    await page.waitForTimeout(100);
    
    // Move mouse completely away from the drawing line (far corner)
    await page.mouse.move(box.x + 50, box.y + box.height - 100);
    
    // Wait for any animations to complete
    await page.waitForTimeout(100);
    
    // Sample pixel on the line (midpoint of ray at y=200)
    const sampleX = 300;
    const sampleY = 200;
    
    const pixelData = await page.evaluate(({ x, y }) => {
      const canvases = document.querySelectorAll(".tv-lightweight-charts canvas, canvas[class*='overlay']");
      for (const cvs of canvases) {
        const canvas = cvs as HTMLCanvasElement;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        const ratio = window.devicePixelRatio || 1;
        const pixel = ctx.getImageData(x * ratio, y * ratio, 1, 1).data;
        // Return first non-transparent pixel
        if (pixel[3] > 0) {
          return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3], found: true };
        }
      }
      return { r: 0, g: 0, b: 0, a: 0, found: false };
    }, { x: sampleX, y: sampleY });
    
    // CRITICAL ASSERTION: Drawing must be visible with alpha > 0.2 (51 out of 255)
    // This catches the bug where idle state has ~0 alpha or very low opacity
    const minAlpha = Math.floor(0.2 * 255); // 51
    expect(
      pixelData.a,
      `Drawing should be visible in IDLE state (deselected, no hover). Got alpha=${pixelData.a} (need >${minAlpha})`
    ).toBeGreaterThan(minAlpha);
    
    // Also verify the color is not just matching background (has contrast)
    // The ray color is teal (#14b8a6) which has R<G<B pattern
    // Background is dark (#0b1220) which is very low values
    const hasColor = pixelData.r > 10 || pixelData.g > 100 || pixelData.b > 100;
    expect(hasColor, `Drawing should have visible color, got rgb(${pixelData.r},${pixelData.g},${pixelData.b})`).toBe(true);
  });

  test("CP24.10: P0 - Drawing visible when mouse LEAVES chart (crosshair hidden)", async ({ page }) => {
    /**
     * P0 REGRESSION TEST: The critical bug where drawings disappear when
     * the mouse leaves the chart area (crosshair disappears).
     * 
     * Root cause was in OverlayCanvas.tsx: resizeCanvas() was always clearing
     * the canvas even when dimensions hadn't changed, erasing drawings after render.
     * 
     * Repro:
     * 1. Create a drawing
     * 2. Move mouse OUTSIDE the chart container (crosshair disappears)
     * 3. Drawing should STILL be visible on overlay canvas
     */
    
    // Get chart container bounds
    const chartContainer = page.locator('[data-testid="chartspro-container"]').first();
    const chartArea = chartContainer.or(page.locator('.tv-lightweight-charts').first());
    await expect(chartArea).toBeVisible();
    const containerBox = await chartArea.boundingBox();
    if (!containerBox) throw new Error("Chart container bounding box not available");
    
    // Create a ray in the middle of the chart
    await selectTool(page, "a");
    const centerX = containerBox.width / 2;
    const centerY = containerBox.height / 2;
    
    await page.mouse.move(containerBox.x + centerX - 100, containerBox.y + centerY);
    await page.mouse.down();
    await page.mouse.move(containerBox.x + centerX + 100, containerBox.y + centerY);
    await page.mouse.up();
    
    // Wait for drawing to be created
    await expect.poll(async () => {
      const drawings = await getDrawings(page);
      return drawings.filter(d => d.kind === "ray").length;
    }, { timeout: 5000 }).toBe(1);
    
    // Deselect by pressing Escape and switch to select tool
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const w = window as any;
      if (w.__lwcharts?.set) w.__lwcharts.set({ tool: "select" });
    });
    await page.waitForTimeout(300);
    
    // CRITICAL: Move mouse COMPLETELY OUTSIDE the chart container
    // This makes the crosshair disappear
    await page.mouse.move(10, 10);
    await page.waitForTimeout(200);
    
    // Verify crosshair is hidden (confirms mouse left the chart)
    const crosshairVisible = await page.evaluate(() => {
      const crosshair = document.querySelector('[data-testid="chartspro-crosshair"]');
      return crosshair?.getAttribute('data-visible') === 'true';
    });
    expect(crosshairVisible, "Crosshair should be hidden when mouse is outside chart").toBe(false);
    
    // Sample the overlay canvas - drawing should still have pixels
    const overlayPixelData = await page.evaluate(() => {
      const canvas = document.querySelector('canvas.chartspro-overlay__canvas') as HTMLCanvasElement | null;
      if (!canvas) return { error: "No overlay canvas", hasPixels: false };
      
      const ctx = canvas.getContext("2d");
      if (!ctx) return { error: "No canvas context", hasPixels: false };
      
      const { width, height } = canvas;
      const allData = ctx.getImageData(0, 0, width, height).data;
      let nonZeroPixels = 0;
      for (let i = 3; i < allData.length; i += 4) {
        if (allData[i] > 0) nonZeroPixels++;
      }
      
      return { error: null, hasPixels: nonZeroPixels > 0, nonZeroCount: nonZeroPixels };
    });
    
    // CRITICAL ASSERTION: Overlay must still have pixels for the drawing
    expect(
      overlayPixelData.hasPixels,
      `Drawing should be visible on overlay canvas when mouse leaves chart. Got: ${JSON.stringify(overlayPixelData)}`
    ).toBe(true);
  });
});
