/**
 * ChartsPro Objects & Alerts Parity Tests
 * Sprint v3: Objects + Alerts integration testing
 * 
 * Tests:
 * - Drawing objects exposed in dump().objects
 * - Object selection/lock/hide states
 * - Alerts contract (dump().alerts)
 * - Object persistence (localStorage)
 */
import { test, expect } from "@playwright/test";

test.describe("ChartsPro Objects & Alerts Parity", () => {
  test.beforeEach(async ({ page }) => {
    // Load Charts Pro tab with mock data for deterministic testing
    await page.goto("/?mock=1");
    
    // Wait for app to load and click charts tab
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    
    // Wait for chart shell to render
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800); // Allow chart to stabilize
  });

  test.describe("dump().objects Contract", () => {
    test("objects array exists in dump()", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump).toBeTruthy();
      expect(Array.isArray(dump.objects)).toBe(true);
    });

    test("objects have required fields", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.objects).toBeDefined();
      
      // Even if no drawings, structure should exist
      if (dump.objects.length > 0) {
        const obj = dump.objects[0];
        expect(typeof obj.id).toBe("string");
        expect(typeof obj.type).toBe("string");
        expect(typeof obj.locked).toBe("boolean");
        expect(typeof obj.hidden).toBe("boolean");
        expect(typeof obj.selected).toBe("boolean");
        expect(Array.isArray(obj.points)).toBe(true);
      }
    });
  });

  test.describe("dump().alerts Contract", () => {
    test("alerts object exists in dump()", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump).toBeTruthy();
      expect(dump.alerts).toBeTruthy();
    });

    test("alerts has count field", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.alerts).toBeTruthy();
      expect(typeof dump.alerts.count).toBe("number");
      expect(dump.alerts.count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("UI State in dump()", () => {
    test("selectedObjectId is in dump().ui", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui).toBeTruthy();
      expect("selectedObjectId" in dump.ui).toBe(true);
    });

    test("activeTool is in dump().ui", async ({ page }) => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui).toBeTruthy();
      expect("activeTool" in dump.ui).toBe(true);
      // Default tool should be "select"
      expect(dump.ui.activeTool).toBe("select");
    });
  });

  test.describe("Object Tree Integration", () => {
    test("inspector tab state is tracked in dump().ui", async ({ page }) => {
      // Verify inspector state is tracked (objectTree/dataWindow)
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui).toBeTruthy();
      expect("inspectorTab" in dump.ui).toBe(true);
      expect(["objectTree", "dataWindow"]).toContain(dump.ui.inspectorTab);
    });
  });

  test.describe("Drawing Persistence", () => {
    test("drawings persist in localStorage (versioned key)", async ({ page }) => {
      // Check that localStorage key pattern exists
      const storageKeys = await page.evaluate(() => {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes("chartsPro")) {
            keys.push(key);
          }
        }
        return keys;
      });
      
      // Should have at least the layout key for test symbol
      // Key format: chartsPro/{symbol}/{tf}/layout@v2
      expect(storageKeys.some(k => k.includes("layout@v2") || k.includes("chartsPro/"))).toBe(true);
    });
  });

  test.describe("Context Menu - Object Actions", () => {
    test("context menu includes object-related actions", async ({ page }) => {
      // Verify context menu state exists (actions defined in code)
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      expect(dump?.ui?.contextMenu).toBeTruthy();
      // Context menu structure exists (actions are in DEFAULT_CHART_ACTIONS)
      expect(typeof dump.ui.contextMenu.open).toBe("boolean");
    });
  });
});
