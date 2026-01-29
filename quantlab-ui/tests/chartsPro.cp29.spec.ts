/**
 * CP29: Schiff Pitchfork Variants Tests
 * 
 * Tests TV-29: Schiff Pitchfork and Modified Schiff Pitchfork
 * 
 * Schiff Pitchfork: Median line starts from midpoint between p1 and base midpoint
 * Modified Schiff: Median starts at X=midpoint, Y=original p1
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

test.describe("TV-29: Pitchfork Variants - CP29", () => {
  test.beforeEach(async ({ page }, testInfo: TestInfo) => {
    await gotoChartsPro(page, testInfo, { mock: true });
    // Wait for chart to be ready
    await expect.poll(async () => {
      const d = await dump(page);
      return (d.render as { hasChart?: boolean } | undefined)?.hasChart;
    }, { timeout: 10000 }).toBe(true);
    // Clear any existing drawings
    await page.evaluate(() => {
      const charts = (window as any).__lwcharts;
      if (charts?.set) charts.set({ drawings: [] });
    });
    // Clear any existing selections
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  });

  test.describe("TV-29.1: Schiff Pitchfork", () => {
    test("should select schiffPitchfork tool via hotkey J", async ({ page }) => {
      await page.keyboard.press("j");
      
      await expect.poll(async () => {
        return await getActiveTool(page);
      }, { timeout: 3000 }).toBe("schiffPitchfork");
    });

    test("should create Schiff Pitchfork via 3 clicks and expose in dump()", async ({ page }) => {
      // Select schiffPitchfork tool
      await page.keyboard.press("j");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("schiffPitchfork");
      
      // Get chart container for proper coordinate mapping
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // p1 = pivot point (left side, middle height)
      const p1X = box!.x + box!.width * 0.2;
      const p1Y = box!.y + box!.height * 0.5;
      // p2 = left tine anchor (middle, higher)
      const p2X = box!.x + box!.width * 0.5;
      const p2Y = box!.y + box!.height * 0.3;
      // p3 = right tine anchor (middle, lower)
      const p3X = box!.x + box!.width * 0.5;
      const p3Y = box!.y + box!.height * 0.7;
      
      // 3 clicks to create Schiff pitchfork
      await page.mouse.click(p1X, p1Y, { delay: 50 });
      await page.mouse.click(p2X, p2Y, { delay: 50 });
      await page.mouse.click(p3X, p3Y, { delay: 50 });

      // Wait for Schiff pitchfork and verify structure
      await expect.poll(async () => {
        const d = await dump(page);
        const objects = d.objects as { type?: string }[] | undefined;
        return objects?.some((o) => o.type === "schiffPitchfork");
      }, { timeout: 3000 }).toBe(true);

      // Verify Schiff pitchfork has correct structure
      const schiffPitchfork = await page.evaluate(() => {
        const d = (window as any).__lwcharts?.dump?.();
        return d?.objects?.find((o: any) => o.type === "schiffPitchfork");
      });

      expect(schiffPitchfork).toBeTruthy();
      expect(schiffPitchfork.type).toBe("schiffPitchfork");
      expect(schiffPitchfork.points).toHaveLength(3);
      expect(schiffPitchfork.p1).toBeDefined();
      expect(schiffPitchfork.p2).toBeDefined();
      expect(schiffPitchfork.p3).toBeDefined();
      expect(schiffPitchfork.p1.timeMs).toBeGreaterThan(0);
      expect(typeof schiffPitchfork.p1.price).toBe("number");
    });

    test("should drag p1 handle and update dump()", async ({ page }) => {
      // Select schiffPitchfork tool
      await page.keyboard.press("j");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("schiffPitchfork");
      
      // Use chartspro-surface container (handlesPx coordinates are relative to this)
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // Create a Schiff pitchfork
      const p1X = box!.x + box!.width * 0.2;
      const p1Y = box!.y + box!.height * 0.5;
      const p2X = box!.x + box!.width * 0.5;
      const p2Y = box!.y + box!.height * 0.3;
      const p3X = box!.x + box!.width * 0.5;
      const p3Y = box!.y + box!.height * 0.7;
      
      // 3 clicks to create schiffPitchfork - NO evaluate() between clicks!
      await page.mouse.click(p1X, p1Y, { delay: 50 });
      await page.mouse.click(p2X, p2Y, { delay: 50 });
      await page.mouse.click(p3X, p3Y, { delay: 50 });

      // Wait for pitchfork to be created AND selected
      await expect.poll(async () => {
        const d = await dump(page);
        const objects = d.objects as { type?: string; selected?: boolean }[] | undefined;
        const pf = objects?.find((o) => o.type === "schiffPitchfork");
        return pf?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Get initial p1 values
      const initial = await page.evaluate(() => {
        const d = (window as any).__lwcharts?.dump?.();
        const pf = d?.objects?.find((o: any) => o.type === "schiffPitchfork");
        return { p1Price: pf?.p1?.price, p1TimeMs: pf?.p1?.timeMs };
      });
      expect(initial.p1Price).toBeDefined();

      // Switch to select mode (like CP20 does)
      await page.evaluate(() => (window as any).__lwcharts?.set?.({ activeTool: "select" }));
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.activeTool;
      }, { timeout: 2000 }).toBe("select");

      // Get actual handle positions from dump - use helper for proper coordinate conversion
      const handlesPx = await page.evaluate(() => {
        const d = (window as any).__lwcharts?.dump?.();
        const pf = d?.objects?.find((o: any) => o.type === "schiffPitchfork");
        return pf?.handlesPx;
      });
      expect(handlesPx?.p1).toBeDefined();
      
      // Use helper to convert handlesPx to screen coordinates
      const p1Screen = await handleToScreenCoords(page, handlesPx, "p1");

      // Click on p1 to ensure selection (like rectangle test does)
      await page.mouse.click(p1Screen.x, p1Screen.y);
      await page.waitForTimeout(100);
      
      // Verify still selected
      await expect.poll(async () => {
        const d = await dump(page);
        const objects = d.objects as { type?: string; selected?: boolean }[] | undefined;
        const pf = objects?.find((o) => o.type === "schiffPitchfork");
        return pf?.selected === true;
      }, { timeout: 2000 }).toBe(true);

      // Now perform drag using correct screen coordinates
      await page.mouse.move(p1Screen.x, p1Screen.y);
      await page.waitForTimeout(100);  // Let hover events fire
      await page.mouse.down();
      await page.mouse.move(p1Screen.x + 50, p1Screen.y - 50, { steps: 10 });  // Right and UP (higher price)
      await page.mouse.up();

      await page.waitForTimeout(200);

      // Verify p1 changed
      const after = await page.evaluate(() => {
        const d = (window as any).__lwcharts?.dump?.();
        const pf = d?.objects?.find((o: any) => o.type === "schiffPitchfork");
        return { p1Price: pf?.p1?.price, p1TimeMs: pf?.p1?.timeMs, selected: pf?.selected };
      });
      
      const priceChanged = Math.abs(after.p1Price - initial.p1Price) > 0.01;
      const timeChanged = after.p1TimeMs !== initial.p1TimeMs;
      expect(priceChanged || timeChanged).toBe(true);
    });
  });

  test.describe("TV-29.2: Modified Schiff Pitchfork", () => {
    test("should select modifiedSchiffPitchfork tool via hotkey D", async ({ page }) => {
      await page.keyboard.press("d");
      
      await expect.poll(async () => {
        return await getActiveTool(page);
      }, { timeout: 3000 }).toBe("modifiedSchiffPitchfork");
    });

    test("should create Modified Schiff Pitchfork via 3 clicks and expose in dump()", async ({ page }) => {
      // Select modifiedSchiffPitchfork tool
      await page.keyboard.press("d");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("modifiedSchiffPitchfork");
      
      // Get chart container for proper coordinate mapping
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // p1 = pivot point (left side, middle height)
      const p1X = box!.x + box!.width * 0.2;
      const p1Y = box!.y + box!.height * 0.5;
      // p2 = left tine anchor (middle, higher)
      const p2X = box!.x + box!.width * 0.5;
      const p2Y = box!.y + box!.height * 0.3;
      // p3 = right tine anchor (middle, lower)
      const p3X = box!.x + box!.width * 0.5;
      const p3Y = box!.y + box!.height * 0.7;
      
      // 3 clicks to create Modified Schiff pitchfork
      await page.mouse.click(p1X, p1Y, { delay: 50 });
      await page.mouse.click(p2X, p2Y, { delay: 50 });
      await page.mouse.click(p3X, p3Y, { delay: 50 });

      // Wait for Modified Schiff pitchfork and verify structure
      await expect.poll(async () => {
        const d = await dump(page);
        const objects = d.objects as { type?: string }[] | undefined;
        return objects?.some((o) => o.type === "modifiedSchiffPitchfork");
      }, { timeout: 3000 }).toBe(true);

      // Verify Modified Schiff pitchfork has correct structure
      const modifiedSchiffPitchfork = await page.evaluate(() => {
        const d = (window as any).__lwcharts?.dump?.();
        return d?.objects?.find((o: any) => o.type === "modifiedSchiffPitchfork");
      });

      expect(modifiedSchiffPitchfork).toBeTruthy();
      expect(modifiedSchiffPitchfork.type).toBe("modifiedSchiffPitchfork");
      expect(modifiedSchiffPitchfork.points).toHaveLength(3);
      expect(modifiedSchiffPitchfork.p1).toBeDefined();
      expect(modifiedSchiffPitchfork.p2).toBeDefined();
      expect(modifiedSchiffPitchfork.p3).toBeDefined();
      expect(modifiedSchiffPitchfork.p1.timeMs).toBeGreaterThan(0);
      expect(typeof modifiedSchiffPitchfork.p1.price).toBe("number");
    });

    test("should drag p2 handle and update dump()", async ({ page }) => {
      // Select modifiedSchiffPitchfork tool
      await page.keyboard.press("d");
      await expect.poll(async () => getActiveTool(page), { timeout: 2000 }).toBe("modifiedSchiffPitchfork");
      
      // Get chart container for proper coordinate mapping
      const container = await getChartsProContainer(page);
      const box = await container.boundingBox();
      expect(box).toBeTruthy();
      
      // Create a Modified Schiff pitchfork
      const p1X = box!.x + box!.width * 0.2;
      const p1Y = box!.y + box!.height * 0.5;
      const p2X = box!.x + box!.width * 0.5;
      const p2Y = box!.y + box!.height * 0.3;
      const p3X = box!.x + box!.width * 0.5;
      const p3Y = box!.y + box!.height * 0.7;
      
      await page.mouse.click(p1X, p1Y, { delay: 50 });
      await page.mouse.click(p2X, p2Y, { delay: 50 });
      await page.mouse.click(p3X, p3Y, { delay: 50 });

      // Wait for pitchfork to be created AND selected
      await expect.poll(async () => {
        const d = await dump(page);
        const objects = d.objects as { type?: string; selected?: boolean }[] | undefined;
        const pf = objects?.find((o) => o.type === "modifiedSchiffPitchfork");
        return pf?.selected === true;
      }, { timeout: 3000 }).toBe(true);

      // Get initial p2 values
      const initial = await page.evaluate(() => {
        const d = (window as any).__lwcharts?.dump?.();
        const pf = d?.objects?.find((o: any) => o.type === "modifiedSchiffPitchfork");
        return { p2Price: pf?.p2?.price, p2TimeMs: pf?.p2?.timeMs };
      });
      expect(initial.p2Price).toBeDefined();

      // Switch to select mode for proper drag handling
      await page.evaluate(() => (window as any).__lwcharts?.set?.({ activeTool: "select" }));
      await expect.poll(async () => {
        const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
        return dump?.ui?.activeTool;
      }, { timeout: 2000 }).toBe("select");

      // Get handlesPx for deterministic drag
      const handlesPx = await page.evaluate(() => {
        const d = (window as any).__lwcharts?.dump?.();
        const pf = d?.objects?.find((o: any) => o.type === "modifiedSchiffPitchfork");
        return pf?.handlesPx;
      });
      expect(handlesPx?.p2).toBeDefined();

      // Use helper to convert handlesPx to screen coordinates
      const p2Screen = await handleToScreenCoords(page, handlesPx, "p2");

      // Click on p2 to ensure selection (like the p1 test does)
      await page.mouse.click(p2Screen.x, p2Screen.y);
      await page.waitForTimeout(100);
      
      // Verify still selected
      await expect.poll(async () => {
        const d = await dump(page);
        const objects = d.objects as { type?: string; selected?: boolean }[] | undefined;
        const pf = objects?.find((o) => o.type === "modifiedSchiffPitchfork");
        return pf?.selected === true;
      }, { timeout: 2000 }).toBe(true);

      // Drag p2 handle to a new position (left and up)
      await page.mouse.move(p2Screen.x, p2Screen.y);
      await page.waitForTimeout(100);
      await page.mouse.down();
      await page.mouse.move(p2Screen.x - 50, p2Screen.y - 50, { steps: 10 });
      await page.mouse.up();

      // Give time for state to update
      await page.waitForTimeout(200);

      // Verify p2 changed (either price or time)
      const after = await page.evaluate(() => {
        const d = (window as any).__lwcharts?.dump?.();
        const pf = d?.objects?.find((o: any) => o.type === "modifiedSchiffPitchfork");
        return { p2Price: pf?.p2?.price, p2TimeMs: pf?.p2?.timeMs };
      });
      
      // At least one coordinate should have changed
      const priceChanged = Math.abs(after.p2Price - initial.p2Price) > 0.01;
      const timeChanged = after.p2TimeMs !== initial.p2TimeMs;
      expect(priceChanged || timeChanged).toBe(true);
    });
  });

  test.describe("TV-29.3: QA API Integration", () => {
    test("should set schiffPitchfork tool via __lwcharts.set()", async ({ page }) => {
      await page.evaluate(() => {
        (window as any).__lwcharts?.set?.({ activeTool: "schiffPitchfork" });
      });

      await expect.poll(async () => {
        return await getActiveTool(page);
      }, { timeout: 3000 }).toBe("schiffPitchfork");
    });

    test("should set modifiedSchiffPitchfork tool via __lwcharts.set()", async ({ page }) => {
      await page.evaluate(() => {
        (window as any).__lwcharts?.set?.({ activeTool: "modifiedSchiffPitchfork" });
      });

      await expect.poll(async () => {
        return await getActiveTool(page);
      }, { timeout: 3000 }).toBe("modifiedSchiffPitchfork");
    });
  });
});
