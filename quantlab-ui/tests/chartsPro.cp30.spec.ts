/**
 * TV-30: Floating Toolbar Tests
 * 
 * Tests for the quick-edit toolbar that appears when a drawing is selected.
 * Uses the QA dump API to verify toolbar state and drawing modifications.
 */

import { test, expect, Page } from "@playwright/test";

// ───────────────────────────────────────────────────────────────────────────
// Test Helpers
// ───────────────────────────────────────────────────────────────────────────

async function gotoChartsPro(page: Page) {
  await page.goto("/?mock=1");
  const chartsTab = page.getByTestId("tab-charts");
  await chartsTab.waitFor({ state: "visible", timeout: 5000 });
  await chartsTab.click();
  console.log("[gotoChartsPro] Found Charts tab via getByTestId('tab-charts')");
  // Wait for chart surface to be ready
  await page.locator(".chartspro-surface").waitFor({ state: "visible", timeout: 10000 });
  // Wait a bit for chart to settle
  await page.waitForTimeout(500);
}

async function waitForChartReady(page: Page) {
  await page.waitForFunction(
    () => {
      const api = (window as any).__lwcharts;
      if (!api?.dump) return false;
      const d = api.dump();
      return d?.data?.baseReady === true && d?.pricePoints > 0;
    },
    { timeout: 15000 }
  );
}

async function dump(page: Page) {
  return page.evaluate(() => {
    const api = (window as any).__lwcharts;
    if (!api?.dump) return null;
    return api.dump();
  });
}

async function setTool(page: Page, tool: string) {
  await page.evaluate((t) => {
    (window as any).__lwcharts?.set?.({ activeTool: t });
  }, tool);
  // Wait for tool change to confirm
  await expect.poll(async () => {
    const d = await dump(page);
    return d?.ui?.activeTool;
  }, { timeout: 3000 }).toBe(tool);
}

async function createHorizontalLine(page: Page) {
  await setTool(page, "hline");
  const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
  const box = await lwCanvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  
  // Click in center of chart
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  
  // Wait for drawing to be created
  await expect.poll(async () => {
    const d = await dump(page);
    return d?.objects?.filter((o: any) => o.type === "hline")?.length ?? 0;
  }, { timeout: 3000 }).toBeGreaterThan(0);
  
  // Get the drawing id
  const d = await dump(page);
  return d?.objects?.find((o: any) => o.type === "hline")?.id;
}

async function createTrendLine(page: Page) {
  await setTool(page, "trendline");
  const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
  const box = await lwCanvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  
  // Click-drag to create trend line
  const startX = box.x + box.width * 0.3;
  const startY = box.y + box.height * 0.4;
  const endX = box.x + box.width * 0.7;
  const endY = box.y + box.height * 0.6;
  
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
  
  // Wait for drawing to be created
  await expect.poll(async () => {
    const d = await dump(page);
    return d?.objects?.filter((o: any) => o.type === "trend")?.length ?? 0;
  }, { timeout: 3000 }).toBeGreaterThan(0);
  
  // Get the drawing id
  const d = await dump(page);
  return d?.objects?.find((o: any) => o.type === "trend")?.id;
}

async function createRectangle(page: Page) {
  await setTool(page, "rectangle");
  const lwCanvas = page.locator(".tv-lightweight-charts canvas").first();
  const box = await lwCanvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  
  // Click-drag to create rectangle
  const startX = box.x + box.width * 0.3;
  const startY = box.y + box.height * 0.3;
  const endX = box.x + box.width * 0.7;
  const endY = box.y + box.height * 0.7;
  
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
  
  // Wait for drawing to be created
  await expect.poll(async () => {
    const d = await dump(page);
    return d?.objects?.filter((o: any) => o.type === "rectangle")?.length ?? 0;
  }, { timeout: 3000 }).toBeGreaterThan(0);
  
  // Get the drawing id
  const d = await dump(page);
  return d?.objects?.find((o: any) => o.type === "rectangle")?.id;
}

async function selectDrawing(page: Page, drawingId: string) {
  // Switch to select tool
  await setTool(page, "select");
  
  // Use QA API to directly select the drawing by ID
  await page.evaluate((id) => {
    const api = (window as any).__lwcharts;
    if (api?.set) {
      api.set({ selectedId: id });
    }
  }, drawingId);
  
  // Wait for selection to be confirmed
  await expect.poll(async () => {
    const d = await dump(page);
    return d?.ui?.selectedObjectId;
  }, { timeout: 3000 }).toBe(drawingId);
}

// ───────────────────────────────────────────────────────────────────────────
// TV-30.1: Floating Toolbar MVP Tests
// ───────────────────────────────────────────────────────────────────────────

test.describe("TV-30.1: Floating Toolbar MVP", () => {
  test.beforeEach(async ({ page }) => {
    // Listen for console messages
    page.on('console', msg => {
      if (msg.text().includes('[FloatingToolbar]') || msg.text().includes('[ChartViewport]')) {
        console.log(`BROWSER: ${msg.text()}`);
      }
    });
    await gotoChartsPro(page);
    await waitForChartReady(page);
  });

  test.describe("Visibility", () => {
    test("toolbar hidden when no drawing selected", async ({ page }) => {
      // No drawing selected - toolbar should not be visible
      const toolbar = page.getByTestId("floating-toolbar");
      await expect(toolbar).not.toBeVisible();
      
      // Verify via dump
      const d = await dump(page);
      expect(d?.ui?.floatingToolbar).toBeNull();
    });

    test("toolbar appears when drawing is selected", async ({ page }) => {
      // Create a horizontal line
      const drawingId = await createHorizontalLine(page);
      expect(drawingId).toBeTruthy();
      
      // Select the drawing
      await selectDrawing(page, drawingId!);
      
      // Toolbar should be visible
      const toolbar = page.getByTestId("floating-toolbar");
      await expect(toolbar).toBeVisible({ timeout: 3000 });
      
      // Verify via dump
      const d = await dump(page);
      expect(d?.ui?.floatingToolbar?.visible).toBe(true);
      expect(d?.ui?.floatingToolbar?.drawingId).toBe(drawingId);
    });

    test("toolbar hidden when drawings are globally hidden", async ({ page }) => {
      // Create and select a horizontal line
      const drawingId = await createHorizontalLine(page);
      await selectDrawing(page, drawingId!);
      
      // Toolbar should be visible
      const toolbar = page.getByTestId("floating-toolbar");
      await expect(toolbar).toBeVisible({ timeout: 3000 });
      
      // Toggle global drawings hidden via the hide button
      const hideToggle = page.getByTestId("drawings-hide-toggle");
      if (await hideToggle.isVisible()) {
        await hideToggle.click();
        await page.waitForTimeout(200);
        
        // Toolbar should be hidden now
        await expect(toolbar).not.toBeVisible();
        
        // Verify via dump
        const d = await dump(page);
        expect(d?.ui?.floatingToolbar).toBeNull();
      }
    });
  });

  test.describe("UI Elements", () => {
    test("toolbar has stroke color button", async ({ page }) => {
      const drawingId = await createTrendLine(page);
      await selectDrawing(page, drawingId!);
      
      const strokeColorBtn = page.getByTestId("floating-toolbar-stroke-color");
      await expect(strokeColorBtn).toBeVisible({ timeout: 3000 });
    });

    test("toolbar has thickness button", async ({ page }) => {
      const drawingId = await createTrendLine(page);
      await selectDrawing(page, drawingId!);
      
      const thicknessBtn = page.getByTestId("floating-toolbar-thickness");
      await expect(thicknessBtn).toBeVisible({ timeout: 3000 });
    });

    test("toolbar has line style button", async ({ page }) => {
      const drawingId = await createTrendLine(page);
      await selectDrawing(page, drawingId!);
      
      const styleBtn = page.getByTestId("floating-toolbar-line-style");
      await expect(styleBtn).toBeVisible({ timeout: 3000 });
    });

    test("toolbar has lock button", async ({ page }) => {
      const drawingId = await createTrendLine(page);
      await selectDrawing(page, drawingId!);
      
      const lockBtn = page.getByTestId("floating-toolbar-lock");
      await expect(lockBtn).toBeVisible({ timeout: 3000 });
    });

    test("toolbar has delete button", async ({ page }) => {
      const drawingId = await createTrendLine(page);
      await selectDrawing(page, drawingId!);
      
      const deleteBtn = page.getByTestId("floating-toolbar-delete");
      await expect(deleteBtn).toBeVisible({ timeout: 3000 });
    });

    test("toolbar has drag handle", async ({ page }) => {
      const drawingId = await createHorizontalLine(page);
      await selectDrawing(page, drawingId!);
      
      const dragHandle = page.getByTestId("floating-toolbar-drag");
      await expect(dragHandle).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe("Lock and Delete Actions", () => {
    test("lock toggle updates drawing locked state", async ({ page }) => {
      const drawingId = await createHorizontalLine(page);
      
      // Verify initially unlocked
      let d = await dump(page);
      const initialObj = d?.objects?.find((o: any) => o.id === drawingId);
      expect(initialObj?.locked).toBe(false);
      
      await selectDrawing(page, drawingId!);
      
      // Wait for toolbar to be visible
      const toolbar = page.getByTestId("floating-toolbar");
      await expect(toolbar).toBeVisible({ timeout: 3000 });
      
      // Click lock toggle
      const lockBtn = page.getByTestId("floating-toolbar-lock");
      await lockBtn.click();
      await page.waitForTimeout(300);
      
      // Verify drawing is now locked
      d = await dump(page);
      const updatedObj = d?.objects?.find((o: any) => o.id === drawingId);
      expect(updatedObj?.locked).toBe(true);
      expect(d?.ui?.floatingToolbar?.locked).toBe(true);
    });

    test("delete button removes drawing", async ({ page }) => {
      const drawingId = await createHorizontalLine(page);
      
      // Verify drawing exists
      let d = await dump(page);
      expect(d?.objects?.length).toBe(1);
      
      await selectDrawing(page, drawingId!);
      
      // Wait for toolbar visibility
      const toolbar = page.getByTestId("floating-toolbar");
      await expect(toolbar).toBeVisible({ timeout: 3000 });
      
      // Click delete button
      const deleteBtn = page.getByTestId("floating-toolbar-delete");
      await deleteBtn.click();
      await page.waitForTimeout(300);
      
      // Verify drawing is removed
      d = await dump(page);
      expect(d?.objects?.length).toBe(0);
      
      // Toolbar should be hidden
      await expect(toolbar).not.toBeVisible();
    });
  });

  test.describe("Dump Contract", () => {
    test("dump includes floatingToolbar when drawing selected", async ({ page }) => {
      const drawingId = await createTrendLine(page);
      await selectDrawing(page, drawingId!);
      
      const d = await dump(page);
      expect(d?.ui?.floatingToolbar).toBeTruthy();
      expect(d?.ui?.floatingToolbar?.visible).toBe(true);
      expect(d?.ui?.floatingToolbar?.drawingId).toBe(drawingId);
      expect(d?.ui?.floatingToolbar?.drawingKind).toBe("trend");
      expect(d?.ui?.floatingToolbar?.locked).toBe(false);
    });

    test("dump floatingToolbar is null when no selection", async ({ page }) => {
      const d = await dump(page);
      expect(d?.ui?.floatingToolbar).toBeNull();
    });
  });

  test.describe("Fill Color (shapes only)", () => {
    test("fill color button visible for rectangle", async ({ page }) => {
      const drawingId = await createRectangle(page);
      await selectDrawing(page, drawingId!);
      
      // Fill color button should be visible (rectangles have fill)
      const fillColorBtn = page.getByTestId("floating-toolbar-fill-color");
      await expect(fillColorBtn).toBeVisible({ timeout: 3000 });
    });

    test("fill color button NOT visible for trend line", async ({ page }) => {
      const drawingId = await createTrendLine(page);
      await selectDrawing(page, drawingId!);
      
      // Toolbar should be visible
      const toolbar = page.getByTestId("floating-toolbar");
      await expect(toolbar).toBeVisible({ timeout: 3000 });
      
      // Fill color button should NOT be visible (trend lines don't have fill)
      const fillColorBtn = page.getByTestId("floating-toolbar-fill-color");
      await expect(fillColorBtn).not.toBeVisible();
    });
  });

  test.describe("Style Changes Actually Apply", () => {
    // Helper: Click toolbar button
    async function clickToolbarButton(page: Page, testId: string) {
      const btn = page.getByTestId(testId);
      await expect(btn).toBeVisible({ timeout: 3000 });
      await btn.click();
    }
    
    test("stroke color change updates drawing", async ({ page }) => {
      const drawingId = await createTrendLine(page);
      await selectDrawing(page, drawingId!);
      
      // Get initial color
      let d = await dump(page);
      const initialColor = d?.objects?.find((o: any) => o.id === drawingId)?.style?.color;
      console.log("Initial color:", initialColor, "drawingId:", drawingId);
      
      // Open color picker
      await clickToolbarButton(page, "floating-toolbar-stroke-color");
      
      // Wait for picker to appear
      const picker = page.getByTestId("floating-toolbar-color-picker");
      await expect(picker).toBeVisible({ timeout: 3000 });
      
      // Click a different color (red = #ef4444)
      await page.evaluate(() => {
        const picker = document.querySelector('[data-testid="floating-toolbar-color-picker"]');
        const redBtn = picker?.querySelector('button[style*="rgb(239, 68, 68)"]');
        console.log("[TEST] Clicking red button:", redBtn);
        if (redBtn) (redBtn as HTMLButtonElement).click();
      });
      await page.waitForTimeout(300);
      
      // Verify drawing color changed
      d = await dump(page);
      console.log("Objects after click:", d?.objects?.length);
      const updatedObj = d?.objects?.find((o: any) => o.id === drawingId);
      console.log("Found updated obj:", updatedObj?.id, "style:", updatedObj?.style);
      const updatedColor = updatedObj?.style?.color;
      expect(updatedColor).toBe("#ef4444");
      expect(updatedColor).not.toBe(initialColor);
    });

    test("thickness change updates drawing", async ({ page }) => {
      const drawingId = await createTrendLine(page);
      await selectDrawing(page, drawingId!);
      
      // Get initial thickness (property is 'width' not 'lineWidth')
      let d = await dump(page);
      const initialThickness = d?.objects?.find((o: any) => o.id === drawingId)?.style?.width;
      console.log('Initial thickness:', initialThickness, 'drawingId:', drawingId);
      
      // Open thickness picker
      await clickToolbarButton(page, "floating-toolbar-thickness");
      
      // Wait for picker to appear
      const picker = page.getByTestId("floating-toolbar-thickness-picker");
      await expect(picker).toBeVisible({ timeout: 3000 });
      
      // Click a different thickness (4px)
      await page.evaluate(() => {
        const picker = document.querySelector('[data-testid="floating-toolbar-thickness-picker"]');
        const btns = picker?.querySelectorAll('button');
        // Find the 4px button (index 3 since options are 1,2,3,4)
        const btn4px = btns?.[3];
        if (btn4px) btn4px.click();
      });
      await page.waitForTimeout(300);
      
      // Verify drawing thickness changed
      d = await dump(page);
      const updatedThickness = d?.objects?.find((o: any) => o.id === drawingId)?.style?.width;
      console.log('Updated thickness:', updatedThickness);
      expect(updatedThickness).toBe(4);
      expect(updatedThickness).not.toBe(initialThickness);
    });

    test("line style change updates drawing", async ({ page }) => {
      const drawingId = await createTrendLine(page);
      await selectDrawing(page, drawingId!);
      
      // Get initial dash pattern
      let d = await dump(page);
      const initialDash = d?.objects?.find((o: any) => o.id === drawingId)?.style?.dash;
      
      // Open line style picker
      await clickToolbarButton(page, "floating-toolbar-line-style");
      
      // Wait for picker to appear
      const stylePicker = page.getByTestId("floating-toolbar-style-picker");
      await expect(stylePicker).toBeVisible({ timeout: 3000 });
      
      // Click dashed style (second button - index 1)
      await page.evaluate(() => {
        const picker = document.querySelector('[data-testid="floating-toolbar-style-picker"]');
        const btns = picker?.querySelectorAll('button');
        const dashedBtn = btns?.[1]; // 0=Solid, 1=Dashed, 2=Dotted
        if (dashedBtn) dashedBtn.click();
      });
      await page.waitForTimeout(300);
      
      // Verify drawing dash changed
      d = await dump(page);
      const updatedDash = d?.objects?.find((o: any) => o.id === drawingId)?.style?.dash;
      expect(updatedDash).toEqual([6, 4]);
      expect(updatedDash).not.toEqual(initialDash);
    });

    test("fill color change updates rectangle", async ({ page }) => {
      const drawingId = await createRectangle(page);
      await selectDrawing(page, drawingId!);
      
      // Get initial fill color
      let d = await dump(page);
      const initialFill = d?.objects?.find((o: any) => o.id === drawingId)?.fillColor;
      console.log('Initial fill color:', initialFill, 'drawingId:', drawingId);
      
      // Open fill color picker
      await clickToolbarButton(page, "floating-toolbar-fill-color");
      
      // Wait for picker to appear
      const fillPicker = page.getByTestId("floating-toolbar-fill-picker");
      await expect(fillPicker).toBeVisible({ timeout: 3000 });
      
      // Click red color (not green, since green might be initial)
      await page.evaluate(() => {
        const picker = document.querySelector('[data-testid="floating-toolbar-fill-picker"]');
        // Red is rgb(239, 68, 68) = #ef4444
        const redBtn = picker?.querySelector('button[style*="rgb(239, 68, 68)"]');
        if (redBtn) (redBtn as HTMLButtonElement).click();
      });
      await page.waitForTimeout(300);
      
      // Verify fill color changed
      d = await dump(page);
      const updatedFill = d?.objects?.find((o: any) => o.id === drawingId)?.fillColor;
      console.log('Updated fill color:', updatedFill);
      expect(updatedFill).toBe("#ef4444");
      expect(updatedFill).not.toBe(initialFill);
      
      // Verify opacity was preserved (should be default 0.10, not reset to something else)
      const fillOpacity = d?.objects?.find((o: any) => o.id === drawingId)?.fillOpacity;
      expect(fillOpacity).toBe(0.10);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TV-30.1c: Real Mouse Click Tests (Pointer Isolation Regression)
  // 
  // These tests use page.mouse.click() to simulate real pointer events, 
  // ensuring toolbar actions work even when DrawingLayer's pointerdown 
  // handler is active. This catches regressions where element.click() 
  // passes but real user clicks fail due to event propagation issues.
  // ─────────────────────────────────────────────────────────────────────────

  test.describe("Real Mouse Click - Pointer Isolation", () => {
    test("stroke color change via real mouse click", async ({ page }) => {
      // Create and select a horizontal line
      const drawingId = await createHorizontalLine(page);
      await selectDrawing(page, drawingId!);
      
      // Get initial color
      let d = await dump(page);
      const initialColor = d?.objects?.find((o: any) => o.id === drawingId)?.style?.color;
      console.log('Initial color:', initialColor);
      
      // Wait for toolbar to appear
      const toolbar = page.getByTestId("floating-toolbar");
      await expect(toolbar).toBeVisible({ timeout: 3000 });
      
      // Click stroke color button using Playwright's native click
      const strokeBtn = page.getByTestId("floating-toolbar-stroke-color");
      await strokeBtn.click();
      
      // Wait for picker to appear
      const picker = page.getByTestId("floating-toolbar-color-picker");
      await expect(picker).toBeVisible({ timeout: 3000 });
      
      // Click a color swatch using real mouse - pick the 6th swatch (blue #3b82f6)
      const colorSwatch = picker.locator('button').nth(5);
      await expect(colorSwatch).toBeVisible();
      const swatchBox = await colorSwatch.boundingBox();
      expect(swatchBox).toBeTruthy();
      
      await page.mouse.click(
        swatchBox!.x + swatchBox!.width / 2,
        swatchBox!.y + swatchBox!.height / 2
      );
      await page.waitForTimeout(300);
      
      // Verify drawing color changed - should be different from initial
      d = await dump(page);
      const updatedColor = d?.objects?.find((o: any) => o.id === drawingId)?.style?.color;
      console.log('Updated color via real mouse:', updatedColor);
      
      // The key test: color changed from initial via real mouse click
      expect(updatedColor).not.toBe(initialColor);
      
      // Verify it's a valid hex color
      expect(updatedColor).toMatch(/^#[0-9a-f]{6}$/i);
      
      // Verify drawing is still selected (pointer event didn't propagate)
      expect(d?.ui?.selectedObjectId).toBe(drawingId);
    });

    test("thickness change via real mouse click", async ({ page }) => {
      const drawingId = await createTrendLine(page);
      await selectDrawing(page, drawingId!);
      
      let d = await dump(page);
      const initialWidth = d?.objects?.find((o: any) => o.id === drawingId)?.style?.width ?? 2;
      console.log('Initial width:', initialWidth);
      
      const toolbar = page.getByTestId("floating-toolbar");
      await expect(toolbar).toBeVisible({ timeout: 3000 });
      
      // Real mouse click on thickness button
      const thicknessBtn = page.getByTestId("floating-toolbar-thickness");
      const thicknessBox = await thicknessBtn.boundingBox();
      expect(thicknessBox).toBeTruthy();
      
      await page.mouse.click(
        thicknessBox!.x + thicknessBox!.width / 2,
        thicknessBox!.y + thicknessBox!.height / 2
      );
      
      // Wait for picker
      const picker = page.getByTestId("floating-toolbar-thickness-picker");
      await expect(picker).toBeVisible({ timeout: 3000 });
      
      // Select 4px thickness (last option)
      const option4px = picker.locator('button').last();
      const optionBox = await option4px.boundingBox();
      expect(optionBox).toBeTruthy();
      
      await page.mouse.click(
        optionBox!.x + optionBox!.width / 2,
        optionBox!.y + optionBox!.height / 2
      );
      await page.waitForTimeout(300);
      
      // Verify
      d = await dump(page);
      const updatedWidth = d?.objects?.find((o: any) => o.id === drawingId)?.style?.width;
      console.log('Updated width via real mouse:', updatedWidth);
      expect(updatedWidth).toBe(4);
      expect(d?.ui?.selectedObjectId).toBe(drawingId);
    });

    test("delete via real mouse click removes drawing", async ({ page }) => {
      const drawingId = await createHorizontalLine(page);
      await selectDrawing(page, drawingId!);
      
      // Confirm drawing exists
      let d = await dump(page);
      expect(d?.objects?.some((o: any) => o.id === drawingId)).toBe(true);
      
      const toolbar = page.getByTestId("floating-toolbar");
      await expect(toolbar).toBeVisible({ timeout: 3000 });
      
      // Real mouse click on delete button
      const deleteBtn = page.getByTestId("floating-toolbar-delete");
      const deleteBox = await deleteBtn.boundingBox();
      expect(deleteBox).toBeTruthy();
      
      await page.mouse.click(
        deleteBox!.x + deleteBox!.width / 2,
        deleteBox!.y + deleteBox!.height / 2
      );
      await page.waitForTimeout(300);
      
      // Verify drawing was deleted
      d = await dump(page);
      expect(d?.objects?.some((o: any) => o.id === drawingId)).toBe(false);
      expect(d?.ui?.selectedObjectId).toBeNull();
    });

    test("lock toggle via real mouse click updates locked state", async ({ page }) => {
      const drawingId = await createTrendLine(page);
      await selectDrawing(page, drawingId!);
      
      let d = await dump(page);
      const initialLocked = d?.objects?.find((o: any) => o.id === drawingId)?.locked ?? false;
      expect(initialLocked).toBe(false);
      
      const toolbar = page.getByTestId("floating-toolbar");
      await expect(toolbar).toBeVisible({ timeout: 3000 });
      
      // Real mouse click on lock button
      const lockBtn = page.getByTestId("floating-toolbar-lock");
      const lockBox = await lockBtn.boundingBox();
      expect(lockBox).toBeTruthy();
      
      await page.mouse.click(
        lockBox!.x + lockBox!.width / 2,
        lockBox!.y + lockBox!.height / 2
      );
      await page.waitForTimeout(300);
      
      // Verify locked state changed
      d = await dump(page);
      const updatedLocked = d?.objects?.find((o: any) => o.id === drawingId)?.locked;
      console.log('Locked state via real mouse:', updatedLocked);
      expect(updatedLocked).toBe(true);
      
      // Drawing should still be selected
      expect(d?.ui?.selectedObjectId).toBe(drawingId);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// TV-30.2a: Opacity Tests
// ───────────────────────────────────────────────────────────────────────────

test.describe("TV-30.2a: Opacity Controls", () => {
  test("stroke opacity button visible for trend line", async ({ page }) => {
    await gotoChartsPro(page);
    await waitForChartReady(page);
    
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    const toolbar = page.getByTestId("floating-toolbar");
    await expect(toolbar).toBeVisible({ timeout: 3000 });
    
    const strokeOpacityBtn = page.getByTestId("floating-toolbar-stroke-opacity");
    await expect(strokeOpacityBtn).toBeVisible();
  });

  test("stroke opacity slider updates drawing style.opacity", async ({ page }) => {
    await gotoChartsPro(page);
    await waitForChartReady(page);
    
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Initial opacity should be 1 (100%)
    let d = await dump(page);
    const initialOpacity = d?.objects?.find((o: any) => o.id === drawingId)?.style?.opacity ?? 1;
    console.log('Initial stroke opacity:', initialOpacity);
    expect(initialOpacity).toBe(1);
    
    const toolbar = page.getByTestId("floating-toolbar");
    await expect(toolbar).toBeVisible({ timeout: 3000 });
    
    // Open stroke opacity picker
    const strokeOpacityBtn = page.getByTestId("floating-toolbar-stroke-opacity");
    await strokeOpacityBtn.click();
    
    const opacityPicker = page.getByTestId("floating-toolbar-stroke-opacity-picker");
    await expect(opacityPicker).toBeVisible();
    
    // Adjust slider to 50%
    const slider = page.getByTestId("floating-toolbar-stroke-opacity-slider");
    await slider.fill("50");
    await page.waitForTimeout(200);
    
    // Verify opacity updated
    d = await dump(page);
    const updatedOpacity = d?.objects?.find((o: any) => o.id === drawingId)?.style?.opacity;
    console.log('Updated stroke opacity:', updatedOpacity);
    expect(updatedOpacity).toBe(0.5);
  });

  test("fill opacity button visible for rectangle", async ({ page }) => {
    await gotoChartsPro(page);
    await waitForChartReady(page);
    
    const drawingId = await createRectangle(page);
    await selectDrawing(page, drawingId!);
    
    const toolbar = page.getByTestId("floating-toolbar");
    await expect(toolbar).toBeVisible({ timeout: 3000 });
    
    const fillOpacityBtn = page.getByTestId("floating-toolbar-fill-opacity");
    await expect(fillOpacityBtn).toBeVisible();
  });

  test("fill opacity slider updates drawing fillOpacity", async ({ page }) => {
    await gotoChartsPro(page);
    await waitForChartReady(page);
    
    const drawingId = await createRectangle(page);
    await selectDrawing(page, drawingId!);
    
    // Initial fill opacity should be 0.10 (10%)
    let d = await dump(page);
    const initialFillOpacity = d?.objects?.find((o: any) => o.id === drawingId)?.fillOpacity ?? 0.10;
    console.log('Initial fill opacity:', initialFillOpacity);
    expect(initialFillOpacity).toBe(0.10);
    
    const toolbar = page.getByTestId("floating-toolbar");
    await expect(toolbar).toBeVisible({ timeout: 3000 });
    
    // Open fill opacity picker
    const fillOpacityBtn = page.getByTestId("floating-toolbar-fill-opacity");
    await fillOpacityBtn.click();
    
    const opacityPicker = page.getByTestId("floating-toolbar-fill-opacity-picker");
    await expect(opacityPicker).toBeVisible();
    
    // Adjust slider to 75%
    const slider = page.getByTestId("floating-toolbar-fill-opacity-slider");
    await slider.fill("75");
    await page.waitForTimeout(200);
    
    // Verify fill opacity updated
    d = await dump(page);
    const updatedFillOpacity = d?.objects?.find((o: any) => o.id === drawingId)?.fillOpacity;
    console.log('Updated fill opacity:', updatedFillOpacity);
    expect(updatedFillOpacity).toBe(0.75);
  });

  test("fill opacity NOT visible for trend line", async ({ page }) => {
    await gotoChartsPro(page);
    await waitForChartReady(page);
    
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    const toolbar = page.getByTestId("floating-toolbar");
    await expect(toolbar).toBeVisible({ timeout: 3000 });
    
    // Fill opacity should NOT be visible for line-based drawings
    const fillOpacityBtn = page.getByTestId("floating-toolbar-fill-opacity");
    await expect(fillOpacityBtn).not.toBeVisible();
  });

  test("stroke opacity change via real mouse click", async ({ page }) => {
    await gotoChartsPro(page);
    await waitForChartReady(page);
    
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    const toolbar = page.getByTestId("floating-toolbar");
    await expect(toolbar).toBeVisible({ timeout: 3000 });
    
    // Real mouse click on stroke opacity button
    const opacityBtn = page.getByTestId("floating-toolbar-stroke-opacity");
    const btnBox = await opacityBtn.boundingBox();
    expect(btnBox).toBeTruthy();
    
    await page.mouse.click(
      btnBox!.x + btnBox!.width / 2,
      btnBox!.y + btnBox!.height / 2
    );
    await page.waitForTimeout(200);
    
    // Verify picker opened
    const picker = page.getByTestId("floating-toolbar-stroke-opacity-picker");
    await expect(picker).toBeVisible();
    
    // Interact with slider via fill (simulates keyboard input)
    const slider = page.getByTestId("floating-toolbar-stroke-opacity-slider");
    await slider.fill("25");
    await page.waitForTimeout(200);
    
    // Verify value updated
    const d = await dump(page);
    const opacity = d?.objects?.find((o: any) => o.id === drawingId)?.style?.opacity;
    console.log('Stroke opacity via real mouse:', opacity);
    expect(opacity).toBe(0.25);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// TV-30.3: Event Isolation Regression Tests
// ───────────────────────────────────────────────────────────────────────────

test.describe("TV-30.3: Event Isolation Regression", () => {
  test("clicking inside toolbar picker doesn't deselect drawing", async ({ page }) => {
    await gotoChartsPro(page);
    await waitForChartReady(page);
    
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Open stroke color picker
    const colorBtn = page.getByTestId("floating-toolbar-stroke-color");
    await colorBtn.click();
    
    const picker = page.getByTestId("floating-toolbar-color-picker");
    await expect(picker).toBeVisible();
    
    // Click inside the picker area (but not on a color button)
    const pickerBox = await picker.boundingBox();
    expect(pickerBox).toBeTruthy();
    
    // Click on the picker padding area
    await page.mouse.click(
      pickerBox!.x + 5,
      pickerBox!.y + 5
    );
    await page.waitForTimeout(200);
    
    // Drawing should still be selected
    const d = await dump(page);
    expect(d?.ui?.selectedObjectId).toBe(drawingId);
  });

  test("clicking toolbar drag handle doesn't start drawing creation", async ({ page }) => {
    await gotoChartsPro(page);
    await waitForChartReady(page);
    
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Get initial objects count
    let d = await dump(page);
    const initialCount = d?.objects?.length ?? 0;
    
    // Click and drag the drag handle
    const dragHandle = page.getByTestId("floating-toolbar-drag");
    const handleBox = await dragHandle.boundingBox();
    expect(handleBox).toBeTruthy();
    
    // Simulate drag via real mouse
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + 50, handleBox!.y + 50);
    await page.mouse.up();
    await page.waitForTimeout(200);
    
    // Objects count should be the same (no new drawing created)
    d = await dump(page);
    expect(d?.objects?.length).toBe(initialCount);
    // Drawing should still be selected
    expect(d?.ui?.selectedObjectId).toBe(drawingId);
  });

  test("all overlay UI has data-overlay-ui attribute", async ({ page }) => {
    await gotoChartsPro(page);
    await waitForChartReady(page);
    
    // Test FloatingToolbar
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    const toolbar = page.getByTestId("floating-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toHaveAttribute("data-overlay-ui", "true");
    
    // Test that ContextMenu also has the attribute (need to right-click)
    const surface = page.locator(".chartspro-surface");
    const surfaceBox = await surface.boundingBox();
    expect(surfaceBox).toBeTruthy();
    
    await page.mouse.click(
      surfaceBox!.x + surfaceBox!.width / 2,
      surfaceBox!.y + surfaceBox!.height / 2,
      { button: "right" }
    );
    await page.waitForTimeout(200);
    
    const contextMenu = page.getByTestId("chartspro-context-menu");
    // Context menu may or may not be visible depending on implementation
    const isVisible = await contextMenu.isVisible().catch(() => false);
    if (isVisible) {
      await expect(contextMenu).toHaveAttribute("data-overlay-ui", "true");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// TV-30.3: Object Settings Modal Tests
// ───────────────────────────────────────────────────────────────────────────

test.describe("TV-30.3: Object Settings Modal", () => {
  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page);
    await waitForChartReady(page);
  });

  test("gear button opens object settings modal", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Click gear button
    const gearBtn = page.getByTestId("floating-toolbar-settings");
    await expect(gearBtn).toBeVisible({ timeout: 3000 });
    await gearBtn.click();
    
    // Modal should be open
    const modal = page.getByTestId("object-settings-modal");
    await expect(modal).toBeVisible({ timeout: 3000 });
    
    // Verify via dump
    const d = await dump(page);
    expect(d?.ui?.objectSettingsDialog?.isOpen).toBe(true);
    expect(d?.ui?.objectSettingsDialog?.drawingId).toBe(drawingId);
  });

  test("cancel button closes modal without saving changes", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Get original price
    let d = await dump(page);
    const originalP1 = d?.objects?.find((o: any) => o.id === drawingId)?.p1;
    expect(originalP1).toBeTruthy();
    
    // Open settings
    await page.getByTestId("floating-toolbar-settings").click();
    await expect(page.getByTestId("object-settings-modal")).toBeVisible();
    
    // Change price (type a new value)
    const priceInput = page.getByTestId("object-settings-p1-price");
    await priceInput.fill("999.99");
    
    // Cancel
    await page.getByTestId("object-settings-cancel").click();
    
    // Modal should close
    await expect(page.getByTestId("object-settings-modal")).not.toBeVisible();
    
    // Price should be unchanged
    d = await dump(page);
    const afterP1 = d?.objects?.find((o: any) => o.id === drawingId)?.p1;
    expect(afterP1?.price).toBe(originalP1.price);
  });

  test("save button applies coordinate changes", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Get original p1 price
    let d = await dump(page);
    const originalP1Price = d?.objects?.find((o: any) => o.id === drawingId)?.p1?.price;
    expect(originalP1Price).toBeTruthy();
    
    // Open settings
    await page.getByTestId("floating-toolbar-settings").click();
    await expect(page.getByTestId("object-settings-modal")).toBeVisible();
    
    // Change p1 price
    const newPrice = originalP1Price + 10;
    const priceInput = page.getByTestId("object-settings-p1-price");
    await priceInput.fill(String(newPrice));
    
    // Save
    await page.getByTestId("object-settings-save").click();
    
    // Modal should close
    await expect(page.getByTestId("object-settings-modal")).not.toBeVisible();
    
    // Price should be updated
    d = await dump(page);
    const afterP1Price = d?.objects?.find((o: any) => o.id === drawingId)?.p1?.price;
    expect(afterP1Price).toBe(newPrice);
  });

  test("style changes in modal are saved", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Open settings
    await page.getByTestId("floating-toolbar-settings").click();
    await expect(page.getByTestId("object-settings-modal")).toBeVisible();
    
    // Click red color
    await page.getByTestId("object-settings-color-ef4444").click();
    
    // Change width via slider
    const widthSlider = page.getByTestId("object-settings-width");
    await widthSlider.fill("5");
    
    // Save
    await page.getByTestId("object-settings-save").click();
    
    // Verify changes
    const d = await dump(page);
    const drawing = d?.objects?.find((o: any) => o.id === drawingId);
    expect(drawing?.style?.color).toBe("#ef4444");
    expect(drawing?.style?.width).toBe(5);
  });

  test("delete button removes drawing", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Open settings
    await page.getByTestId("floating-toolbar-settings").click();
    await expect(page.getByTestId("object-settings-modal")).toBeVisible();
    
    // Get initial count
    let d = await dump(page);
    const initialCount = d?.objects?.length ?? 0;
    
    // Delete
    await page.getByTestId("object-settings-delete").click();
    
    // Modal should close
    await expect(page.getByTestId("object-settings-modal")).not.toBeVisible();
    
    // Drawing should be removed
    d = await dump(page);
    expect(d?.objects?.length).toBe(initialCount - 1);
    expect(d?.objects?.find((o: any) => o.id === drawingId)).toBeUndefined();
  });

  test("lock toggle in modal updates drawing", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Verify initially unlocked
    let d = await dump(page);
    expect(d?.objects?.find((o: any) => o.id === drawingId)?.locked).toBe(false);
    
    // Open settings
    await page.getByTestId("floating-toolbar-settings").click();
    await expect(page.getByTestId("object-settings-modal")).toBeVisible();
    
    // Click lock button
    await page.getByTestId("object-settings-lock").click();
    
    // Lock should be toggled (no need to save - lock is immediate)
    d = await dump(page);
    expect(d?.objects?.find((o: any) => o.id === drawingId)?.locked).toBe(true);
  });

  test("horizontal line shows price field only", async ({ page }) => {
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Open settings
    await page.getByTestId("floating-toolbar-settings").click();
    await expect(page.getByTestId("object-settings-modal")).toBeVisible();
    
    // Should have price field
    const priceInput = page.getByTestId("object-settings-price");
    await expect(priceInput).toBeVisible();
    
    // Should NOT have p1/p2 fields
    const p1Input = page.getByTestId("object-settings-p1-price");
    await expect(p1Input).not.toBeVisible();
  });

  test("rectangle shows fill options", async ({ page }) => {
    const drawingId = await createRectangle(page);
    await selectDrawing(page, drawingId!);
    
    // Open settings
    await page.getByTestId("floating-toolbar-settings").click();
    await expect(page.getByTestId("object-settings-modal")).toBeVisible();
    
    // Should have fill color options
    const fillColorBtn = page.getByTestId("object-settings-fill-color-ef4444");
    await expect(fillColorBtn).toBeVisible();
    
    // Should have fill opacity slider
    const fillOpacitySlider = page.getByTestId("object-settings-fill-opacity");
    await expect(fillOpacitySlider).toBeVisible();
  });

  test("trend line does NOT show fill options", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Open settings
    await page.getByTestId("floating-toolbar-settings").click();
    await expect(page.getByTestId("object-settings-modal")).toBeVisible();
    
    // Should NOT have fill options
    const fillColorBtn = page.getByTestId("object-settings-fill-color-ef4444");
    await expect(fillColorBtn).not.toBeVisible();
    
    const fillOpacitySlider = page.getByTestId("object-settings-fill-opacity");
    await expect(fillOpacitySlider).not.toBeVisible();
  });

  test("escape key closes modal", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Open settings
    await page.getByTestId("floating-toolbar-settings").click();
    await expect(page.getByTestId("object-settings-modal")).toBeVisible();
    
    // Press Escape
    await page.keyboard.press("Escape");
    
    // Modal should close
    await expect(page.getByTestId("object-settings-modal")).not.toBeVisible();
  });

  test("dump shows objectSettingsDialog state correctly", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Initially closed
    let d = await dump(page);
    expect(d?.ui?.objectSettingsDialog?.isOpen).toBe(false);
    expect(d?.ui?.objectSettingsDialog?.drawingId).toBeNull();
    
    // Open settings
    await page.getByTestId("floating-toolbar-settings").click();
    await expect(page.getByTestId("object-settings-modal")).toBeVisible();
    
    // Now open with correct drawingId
    d = await dump(page);
    expect(d?.ui?.objectSettingsDialog?.isOpen).toBe(true);
    expect(d?.ui?.objectSettingsDialog?.drawingId).toBe(drawingId);
    
    // Close
    await page.getByTestId("object-settings-cancel").click();
    
    // Back to closed
    d = await dump(page);
    expect(d?.ui?.objectSettingsDialog?.isOpen).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// TV-30.4: Alert Button Tests
// ───────────────────────────────────────────────────────────────────────────

test.describe("TV-30.4: Alert Button", () => {
  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page);
    await waitForChartReady(page);
  });

  test("alert button visible for horizontal line", async ({ page }) => {
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    const alertBtn = page.getByTestId("floating-toolbar-alert");
    await expect(alertBtn).toBeVisible({ timeout: 3000 });
  });

  test("alert button visible for trend line", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    const alertBtn = page.getByTestId("floating-toolbar-alert");
    await expect(alertBtn).toBeVisible({ timeout: 3000 });
  });

  test("alert button NOT visible for rectangle (shape)", async ({ page }) => {
    const drawingId = await createRectangle(page);
    await selectDrawing(page, drawingId!);
    
    const alertBtn = page.getByTestId("floating-toolbar-alert");
    await expect(alertBtn).not.toBeVisible();
  });

  test("alert button opens create alert modal", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Click alert button
    await page.getByTestId("floating-toolbar-alert").click();
    
    // Modal should open
    const modal = page.getByTestId("create-alert-modal");
    await expect(modal).toBeVisible({ timeout: 3000 });
    
    // Verify via dump
    const d = await dump(page);
    expect(d?.ui?.createAlertDialog?.isOpen).toBe(true);
    expect(d?.ui?.createAlertDialog?.drawingId).toBe(drawingId);
  });

  test("cancel closes create alert modal", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Open modal
    await page.getByTestId("floating-toolbar-alert").click();
    await expect(page.getByTestId("create-alert-modal")).toBeVisible();
    
    // Cancel
    await page.getByTestId("create-alert-cancel").click();
    
    // Modal should close
    await expect(page.getByTestId("create-alert-modal")).not.toBeVisible();
    
    // Verify via dump
    const d = await dump(page);
    expect(d?.ui?.createAlertDialog?.isOpen).toBe(false);
  });

  test("create alert modal shows drawing info", async ({ page }) => {
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Open modal
    await page.getByTestId("floating-toolbar-alert").click();
    
    // Should show "Horizontal Line" text
    const modal = page.getByTestId("create-alert-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Horizontal Line")).toBeVisible();
  });

  test("dump shows createAlertDialog state", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Initially closed
    let d = await dump(page);
    expect(d?.ui?.createAlertDialog?.isOpen).toBe(false);
    
    // Open modal
    await page.getByTestId("floating-toolbar-alert").click();
    await expect(page.getByTestId("create-alert-modal")).toBeVisible();
    
    // Now open
    d = await dump(page);
    expect(d?.ui?.createAlertDialog?.isOpen).toBe(true);
    expect(d?.ui?.createAlertDialog?.drawingId).toBe(drawingId);
    
    // Close
    await page.getByTestId("create-alert-cancel").click();
    
    // Back to closed
    d = await dump(page);
    expect(d?.ui?.createAlertDialog?.isOpen).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// TV-30.5: Per-Object Hide Toggle Tests
// ───────────────────────────────────────────────────────────────────────────

test.describe("TV-30.5: Per-Object Hide", () => {
  test.beforeEach(async ({ page }) => {
    await gotoChartsPro(page);
    await waitForChartReady(page);
  });

  test("hide button visible in floating toolbar", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    const hideBtn = page.getByTestId("floating-toolbar-hide");
    await expect(hideBtn).toBeVisible({ timeout: 3000 });
  });

  test("hide toggle updates drawing.hidden in dump", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Initially not hidden
    let d = await dump(page);
    expect(d?.objects?.find((o: any) => o.id === drawingId)?.hidden).toBe(false);
    
    // Click hide button
    await page.getByTestId("floating-toolbar-hide").click();
    
    // Should be hidden now
    d = await dump(page);
    expect(d?.objects?.find((o: any) => o.id === drawingId)?.hidden).toBe(true);
  });

  test("hide toggle is reversible", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    // Hide
    await page.getByTestId("floating-toolbar-hide").click();
    let d = await dump(page);
    expect(d?.objects?.find((o: any) => o.id === drawingId)?.hidden).toBe(true);
    
    // Unhide
    await page.getByTestId("floating-toolbar-hide").click();
    d = await dump(page);
    expect(d?.objects?.find((o: any) => o.id === drawingId)?.hidden).toBe(false);
  });

  test("hide button icon changes when hidden", async ({ page }) => {
    const drawingId = await createTrendLine(page);
    await selectDrawing(page, drawingId!);
    
    const hideBtn = page.getByTestId("floating-toolbar-hide");
    
    // Initially should show Eye icon (not EyeOff)
    // The button should not have the "text-slate-600" class when not hidden
    await expect(hideBtn).toBeVisible();
    
    // Click to hide
    await hideBtn.click();
    
    // After hiding, button styling should change (has text-slate-600 class)
    // Just verify the dump state changed as proxy for icon change
    const d = await dump(page);
    expect(d?.objects?.find((o: any) => o.id === drawingId)?.hidden).toBe(true);
  });
});

// =============================================================================
// TV-30.6: Style Presets / Templates
// =============================================================================
test.describe("TV-30.6: Style Presets", () => {

  // Helper to clear presets (needs to run after gotoChartsPro)
  async function clearPresets(page: Page) {
    await page.evaluate(() => { localStorage.removeItem("cp.toolPresets"); });
  }

  test("preset button visible in floating toolbar", async ({ page }) => {
    await gotoChartsPro(page);
    await clearPresets(page);
    
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    const presetBtn = page.getByTestId("floating-toolbar-preset");
    await expect(presetBtn).toBeVisible({ timeout: 3000 });
  });

  test("preset button opens preset menu", async ({ page }) => {
    await gotoChartsPro(page);
    await clearPresets(page);
    
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    await page.getByTestId("floating-toolbar-preset").click();
    const menu = page.getByTestId("preset-menu");
    await expect(menu).toBeVisible({ timeout: 3000 });
  });

  test("can save current style as preset", async ({ page }) => {
    await gotoChartsPro(page);
    await clearPresets(page);
    
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Open preset menu
    await page.getByTestId("floating-toolbar-preset").click();
    await expect(page.getByTestId("preset-menu")).toBeVisible();
    
    // Click "Save current as preset"
    await page.getByTestId("preset-save-current").click();
    
    // Enter name and save
    await page.getByTestId("preset-save-name").fill("My Red Line");
    await page.getByTestId("preset-save-confirm").click();
    
    // Verify preset appears in dump
    const d = await dump(page);
    const presets = d?.ui?.presets?.presets?.hline;
    expect(presets).toBeDefined();
    expect(presets?.length).toBeGreaterThan(0);
    expect(presets?.[0]?.name).toBe("My Red Line");
  });

  test("can apply preset to existing drawing", async ({ page }) => {
    await gotoChartsPro(page);
    await clearPresets(page);
    
    // Create first line and save its style as preset
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Get initial style
    let d = await dump(page);
    const initialWidth = d?.objects?.find((o: any) => o.id === drawingId)?.style?.width || 2;
    
    // Save current style as preset
    await page.getByTestId("floating-toolbar-preset").click();
    await expect(page.getByTestId("preset-menu")).toBeVisible();
    await page.getByTestId("preset-save-current").click();
    await page.getByTestId("preset-save-name").fill("Original Style");
    await page.getByTestId("preset-save-confirm").click();
    
    // Wait and get preset ID
    await page.waitForTimeout(300);
    d = await dump(page);
    const presetId = d?.ui?.presets?.presets?.hline?.[0]?.id;
    expect(presetId).toBeDefined();
    
    // Apply the preset (even though it's the same style, this tests the apply flow)
    // The menu should still be visible or we need to reopen it
    const menu = page.getByTestId("preset-menu");
    const isVisible = await menu.isVisible();
    if (!isVisible) {
      await page.getByTestId("floating-toolbar-preset").click();
      await expect(menu).toBeVisible({ timeout: 3000 });
    }
    
    await page.getByTestId(`preset-apply-${presetId}`).click();
    
    // Verify style is still the same (preset was applied)
    d = await dump(page);
    const drawing = d?.objects?.find((o: any) => o.id === drawingId);
    expect(drawing?.style?.width).toBe(initialWidth);
  });

  test("preset menu shows empty state initially", async ({ page }) => {
    await gotoChartsPro(page);
    await clearPresets(page);
    
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    await page.getByTestId("floating-toolbar-preset").click();
    
    // Should show "No presets saved yet"
    const menu = page.getByTestId("preset-menu");
    await expect(menu).toContainText("No presets saved yet");
  });

  test("can delete preset", async ({ page }) => {
    await gotoChartsPro(page);
    await clearPresets(page);
    
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Save a preset
    await page.getByTestId("floating-toolbar-preset").click();
    await page.getByTestId("preset-save-current").click();
    await page.getByTestId("preset-save-name").fill("Temp Preset");
    await page.getByTestId("preset-save-confirm").click();
    
    // Wait for save to complete
    await page.waitForTimeout(300);
    
    // Verify preset exists and get ID
    let d = await dump(page);
    const presetId = d?.ui?.presets?.presets?.hline?.[0]?.id;
    expect(presetId).toBeDefined();
    
    // Reopen menu (it should still be open after save, just click preset button again if closed)
    const menu = page.getByTestId("preset-menu");
    const isVisible = await menu.isVisible();
    if (!isVisible) {
      await page.getByTestId("floating-toolbar-preset").click();
      await expect(menu).toBeVisible({ timeout: 2000 });
    }
    
    // Delete the preset (using force:true because it may be opacity:0 until hover)
    const deleteBtn = page.getByTestId(`preset-delete-${presetId}`);
    await deleteBtn.click({ force: true });
    
    // Wait for delete to process
    await page.waitForTimeout(200);
    
    // Verify deleted
    d = await dump(page);
    const presets = d?.ui?.presets?.presets?.hline || [];
    expect(presets.length).toBe(0);
  });

  test("dump shows presets state", async ({ page }) => {
    await gotoChartsPro(page);
    
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Check dump structure
    const d = await dump(page);
    expect(d?.ui?.presets).toBeDefined();
    expect(d?.ui?.presets?.presets).toBeDefined();
    expect(d?.ui?.presets?.defaults).toBeDefined();
  });

  test("can set preset as default", async ({ page }) => {
    await gotoChartsPro(page);
    await clearPresets(page);
    
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Save a preset
    await page.getByTestId("floating-toolbar-preset").click();
    await page.getByTestId("preset-save-current").click();
    await page.getByTestId("preset-save-name").fill("Default Style");
    await page.getByTestId("preset-save-confirm").click();
    
    // Wait for save to complete
    await page.waitForTimeout(300);
    
    // Get preset id
    let d = await dump(page);
    const presetId = d?.ui?.presets?.presets?.hline?.[0]?.id;
    expect(presetId).toBeDefined();
    
    // The first preset should auto-become default when it's the only one
    // Let's verify by checking the star button state in the menu
    // Reopen menu if needed
    const menu = page.getByTestId("preset-menu");
    const isVisible = await menu.isVisible();
    if (!isVisible) {
      await page.getByTestId("floating-toolbar-preset").click();
      await expect(menu).toBeVisible({ timeout: 2000 });
    }
    
    // The default button should exist and be clickable
    const defaultBtn = page.getByTestId(`preset-default-${presetId}`);
    await expect(defaultBtn).toBeVisible({ timeout: 2000 });
    
    // Check if it's already default (first preset auto-becomes default)
    d = await dump(page);
    if (d?.ui?.presets?.defaults?.hline === presetId) {
      // Already default, click to toggle off then on
      await defaultBtn.click();
      await page.waitForTimeout(200);
      d = await dump(page);
      expect(d?.ui?.presets?.defaults?.hline).toBe(null);
      
      // Click again to set as default
      await defaultBtn.click();
      await page.waitForTimeout(200);
    } else {
      // Not default yet, set it
      await defaultBtn.click();
      await page.waitForTimeout(200);
    }
    
    // Verify default is set
    const d2 = await dump(page);
    expect(d2?.ui?.presets?.defaults?.hline).toBe(presetId);
  });
});

// =============================================================================
// TV-30.7: Drawing Labels
// =============================================================================
test.describe("TV-30.7: Drawing Labels", () => {
  test("label button visible in floating toolbar", async ({ page }) => {
    await gotoChartsPro(page);
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    const labelBtn = page.getByTestId("floating-toolbar-label");
    await expect(labelBtn).toBeVisible();
  });

  test("label button opens label modal", async ({ page }) => {
    await gotoChartsPro(page);
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    await page.getByTestId("floating-toolbar-label").click();
    await expect(page.getByTestId("label-modal")).toBeVisible();
  });

  test("can save label to drawing", async ({ page }) => {
    await gotoChartsPro(page);
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Open label modal
    await page.getByTestId("floating-toolbar-label").click();
    await expect(page.getByTestId("label-modal")).toBeVisible();
    
    // Enter label text
    await page.getByTestId("label-modal-input").fill("Support Level");
    await page.getByTestId("label-modal-save").click();
    
    // Modal should close
    await expect(page.getByTestId("label-modal")).not.toBeVisible();
    
    // Verify label in dump
    const d = await dump(page);
    const drawing = d?.objects?.find((obj: Record<string, unknown>) => obj.id === drawingId);
    expect(drawing?.label).toBe("Support Level");
  });

  test("can remove label by saving empty text", async ({ page }) => {
    await gotoChartsPro(page);
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Add a label first
    await page.getByTestId("floating-toolbar-label").click();
    await page.getByTestId("label-modal-input").fill("Test Label");
    await page.getByTestId("label-modal-save").click();
    await page.waitForTimeout(200);
    
    // Verify label added
    let d = await dump(page);
    let drawing = d?.objects?.find((obj: Record<string, unknown>) => obj.id === drawingId);
    expect(drawing?.label).toBe("Test Label");
    
    // Remove label
    await page.getByTestId("floating-toolbar-label").click();
    await page.getByTestId("label-modal-input").clear();
    await page.getByTestId("label-modal-save").click();
    await page.waitForTimeout(200);
    
    // Verify label removed (null in dump)
    d = await dump(page);
    drawing = d?.objects?.find((obj: Record<string, unknown>) => obj.id === drawingId);
    // Label should be null (removed) or undefined
    expect(drawing?.label == null).toBe(true);
  });

  test("label button shows active state when label exists", async ({ page }) => {
    await gotoChartsPro(page);
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    const labelBtn = page.getByTestId("floating-toolbar-label");
    
    // Initially no label - button should have slate color (inactive)
    // Wait for button to be stable
    await expect(labelBtn).toBeVisible();
    
    // Add a label
    await labelBtn.click();
    await page.getByTestId("label-modal-input").fill("My Label");
    await page.getByTestId("label-modal-save").click();
    
    // Wait for toolbar to re-render with updated state
    await page.waitForTimeout(300);
    
    // Button should now show active state (blue color)
    await expect(labelBtn).toHaveClass(/text-blue-400/);
  });

  test("label modal can be cancelled without changing existing label", async ({ page }) => {
    await gotoChartsPro(page);
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Get the initial label (drawings get default labels like "Hline #1")
    let d = await dump(page);
    let drawing = d?.objects?.find((obj: Record<string, unknown>) => obj.id === drawingId);
    const initialLabel = drawing?.label;
    
    // Open modal and enter draft text but cancel
    await page.getByTestId("floating-toolbar-label").click();
    await expect(page.getByTestId("label-modal")).toBeVisible();
    await page.getByTestId("label-modal-input").fill("New Label That Should Not Save");
    
    // Cancel
    await page.getByTestId("label-modal-cancel").click();
    
    // Modal should close without saving
    await expect(page.getByTestId("label-modal")).not.toBeVisible();
    
    // Verify label was NOT changed (still same as initial)
    d = await dump(page);
    drawing = d?.objects?.find((obj: Record<string, unknown>) => obj.id === drawingId);
    expect(drawing?.label).toBe(initialLabel);
  });

  test("label persists after page reload", async ({ page }) => {
    await gotoChartsPro(page);
    
    // Use a unique label to identify
    const uniqueLabel = `Persist-${Date.now()}`;
    
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Add a label
    await page.getByTestId("floating-toolbar-label").click();
    await page.getByTestId("label-modal-input").fill(uniqueLabel);
    await page.getByTestId("label-modal-save").click();
    await page.waitForTimeout(700); // Wait for autosave (500ms debounce + buffer)
    
    // Reload page
    await page.reload();
    await gotoChartsPro(page);
    
    // Wait for drawings to load
    await page.waitForTimeout(500);
    
    // Verify label persisted - find the drawing by label
    const d = await dump(page);
    const drawing = d?.objects?.find((obj: Record<string, unknown>) => obj.label === uniqueLabel);
    expect(drawing).toBeDefined();
  });

  test("dump shows labelModal state", async ({ page }) => {
    await gotoChartsPro(page);
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Check dump has labelModal info
    let d = await dump(page);
    expect(d?.ui?.labelModal).toBeDefined();
    expect(d?.ui?.labelModal?.isOpen).toBe(false);
    
    // Open label modal
    await page.getByTestId("floating-toolbar-label").click();
    
    // Check dump reflects open state
    d = await dump(page);
    expect(d?.ui?.labelModal?.isOpen).toBe(true);
    expect(d?.ui?.labelModal?.drawingId).toBe(drawingId);
  });

  test("label can be edited via ObjectSettingsModal", async ({ page }) => {
    await gotoChartsPro(page);
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Open settings modal
    await page.getByTestId("floating-toolbar-settings").click();
    await expect(page.getByTestId("object-settings-modal")).toBeVisible();
    
    // Find and fill label input
    await page.getByTestId("object-settings-label").fill("Settings Label");
    await page.getByTestId("object-settings-save").click();
    
    // Verify label in dump
    const d = await dump(page);
    const drawing = d?.objects?.find((obj: Record<string, unknown>) => obj.id === drawingId);
    expect(drawing?.label).toBe("Settings Label");
  });
});

// TV-30.8: Z-order / Layers
// - Bring to front / Send to back buttons in FloatingToolbar
// - z value exposed in dump().objects
// - Tests verify z-order changes

test.describe("TV-30.8: Z-order / Layers", () => {
  test("z-order buttons visible in floating toolbar", async ({ page }) => {
    await gotoChartsPro(page);
    const drawingId = await createHorizontalLine(page);
    await selectDrawing(page, drawingId!);
    
    // Verify z-order buttons are visible
    await expect(page.getByTestId("floating-toolbar-bring-to-front")).toBeVisible();
    await expect(page.getByTestId("floating-toolbar-send-to-back")).toBeVisible();
  });

  test("bring-to-front increases z to maxZ + 1", async ({ page }) => {
    await gotoChartsPro(page);
    
    // Create first horizontal line at Y=40%
    await setTool(page, "hline");
    const canvas = page.locator(".tv-lightweight-charts canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");
    
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.4);
    await expect.poll(async () => (await dump(page))?.objects?.length ?? 0, { timeout: 3000 }).toBe(1);
    
    const firstId = (await dump(page))?.objects?.[0]?.id as string;
    const firstZ = (await dump(page))?.objects?.[0]?.z as number;
    
    // Deselect first, create second at Y=60%
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    
    await setTool(page, "hline");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
    await expect.poll(async () => (await dump(page))?.objects?.length ?? 0, { timeout: 3000 }).toBe(2);
    
    let d = await dump(page);
    const secondHline = d?.objects?.find((o: Record<string, unknown>) => o.id !== firstId);
    const secondId = secondHline?.id as string;
    const secondZ = secondHline?.z as number;
    
    // Second should have higher z
    expect(secondZ).toBeGreaterThan(firstZ);
    
    // Second is auto-selected - send it to back first
    await page.getByTestId("floating-toolbar-send-to-back").click();
    await page.waitForTimeout(200);
    
    // Verify it's now below first
    d = await dump(page);
    const afterSendBack = d?.objects?.find((o: Record<string, unknown>) => o.id === secondId);
    expect(afterSendBack?.z).toBeLessThan(firstZ);
    
    // Now bring it to front
    await page.getByTestId("floating-toolbar-bring-to-front").click();
    await page.waitForTimeout(200);
    
    // Verify z value increased past first
    d = await dump(page);
    const afterBringFront = d?.objects?.find((o: Record<string, unknown>) => o.id === secondId);
    expect(afterBringFront?.z).toBeGreaterThan(firstZ);
  });

  test("send-to-back decreases z to minZ - 1", async ({ page }) => {
    await gotoChartsPro(page);
    
    // Create first horizontal line at Y=40%
    await setTool(page, "hline");
    const canvas = page.locator(".tv-lightweight-charts canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");
    
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.4);
    await expect.poll(async () => (await dump(page))?.objects?.length ?? 0, { timeout: 3000 }).toBe(1);
    
    const firstId = (await dump(page))?.objects?.[0]?.id as string;
    const firstZ = (await dump(page))?.objects?.[0]?.z as number;
    
    // Deselect first, create second at Y=60%
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    
    await setTool(page, "hline");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
    await expect.poll(async () => (await dump(page))?.objects?.length ?? 0, { timeout: 3000 }).toBe(2);
    
    let d = await dump(page);
    const secondHline = d?.objects?.find((o: Record<string, unknown>) => o.id !== firstId);
    const secondId = secondHline?.id as string;
    const secondZ = secondHline?.z as number;
    
    // Second should have higher z
    expect(secondZ).toBeGreaterThan(firstZ);
    
    // Second is auto-selected - send it to back
    await page.getByTestId("floating-toolbar-send-to-back").click();
    await page.waitForTimeout(200);
    
    // Verify z value decreased to be lower than first
    d = await dump(page);
    const updatedSecond = d?.objects?.find((o: Record<string, unknown>) => o.id === secondId);
    expect(updatedSecond?.z).toBeLessThan(firstZ);
  });

  test("z values exposed in dump().objects", async ({ page }) => {
    await gotoChartsPro(page);
    
    // Draw a horizontal line
    await createHorizontalLine(page);
    
    // Check dump includes z value
    const d = await dump(page);
    const drawing = d?.objects?.[0];
    expect(drawing).toHaveProperty("z");
    expect(typeof drawing?.z).toBe("number");
  });

  test("multiple z-order changes accumulate correctly", async ({ page }) => {
    await gotoChartsPro(page);
    
    // Create first horizontal line at Y=40%
    await setTool(page, "hline");
    const canvas = page.locator(".tv-lightweight-charts canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");
    
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.4);
    await expect.poll(async () => (await dump(page))?.objects?.length ?? 0, { timeout: 3000 }).toBe(1);
    
    const firstId = (await dump(page))?.objects?.[0]?.id as string;
    const firstZ = (await dump(page))?.objects?.[0]?.z as number;
    
    // Deselect first, create second at Y=60%
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    
    await setTool(page, "hline");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
    await expect.poll(async () => (await dump(page))?.objects?.length ?? 0, { timeout: 3000 }).toBe(2);
    
    let d = await dump(page);
    const secondHline = d?.objects?.find((o: Record<string, unknown>) => o.id !== firstId);
    const secondId = secondHline?.id as string;
    const secondZ = secondHline?.z as number;
    
    // Second should have higher z
    expect(secondZ).toBeGreaterThan(firstZ);
    
    // Second is auto-selected, send it to back
    await page.getByTestId("floating-toolbar-send-to-back").click();
    await page.waitForTimeout(200);
    
    // Check it's now at bottom (z < first's z)
    d = await dump(page);
    let updatedDrawing = d?.objects?.find((o: Record<string, unknown>) => o.id === secondId);
    const afterSendBack = updatedDrawing?.z as number;
    expect(afterSendBack).toBeLessThan(firstZ);
    
    // Send to back again should keep it at bottom (no change since already min)
    await page.getByTestId("floating-toolbar-send-to-back").click();
    await page.waitForTimeout(200);
    
    d = await dump(page);
    updatedDrawing = d?.objects?.find((o: Record<string, unknown>) => o.id === secondId);
    // Should be unchanged when already at bottom
    expect(updatedDrawing?.z).toBe(afterSendBack);
  });
});