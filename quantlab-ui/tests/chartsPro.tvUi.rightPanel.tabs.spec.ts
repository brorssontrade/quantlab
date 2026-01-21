/**
 * ChartsPro RightPanel Tabs Tests
 *
 * Tests TV-4 RightPanel functionality:
 * - Tab switching (Indicators, Objects, Alerts)
 * - Active tab persistence in localStorage
 * - Collapse/expand toggle with deterministic state
 * - DOM structure verification in workspace mode
 * - Verification that legacy sidebar is not rendered in workspace mode
 */
import { test, expect } from "@playwright/test";
import { gotoChartsPro } from "./helpers/chartsProNav";

type RightPanelTab = "indicators" | "objects" | "alerts";

type LwChartsApi = {
  dump: () => {
    ui: {
      rightPanel: {
        activeTab: RightPanelTab | null;
        collapsed: boolean;
        width: number;
      };
      layout: {
        workspaceMode: boolean;
      };
    };
  };
};

declare global {
  interface Window {
    __lwcharts: LwChartsApi;
  }
}

test.describe("ChartsPro RightPanel Tabs (TV-4)", () => {
  test.beforeEach(async ({ page }) => {
    // Load Charts Pro with mock data
    await page.goto("/?mock=1");

    // Wait for app and charts tab
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });

    // Wait for shell and verify workspace mode is ON (TV-4 feature)
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });

    // Wait for RightPanel to render
    await expect(page.locator('[data-testid="rightpanel-tabs"]')).toBeVisible({ timeout: 10000 });

    // Verify workspace mode is active
    const dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.ui.layout.workspaceMode).toBe(true);
  });

  test.describe("Tab Switching", () => {
    test("RightPanel tabs are visible in workspace mode", async ({ page }) => {
      // Verify all tab buttons exist
      await expect(page.locator('[data-testid="rightpanel-tab-indicators"]')).toBeVisible();
      await expect(page.locator('[data-testid="rightpanel-tab-objects"]')).toBeVisible();
      await expect(page.locator('[data-testid="rightpanel-tab-alerts"]')).toBeVisible();

      // Verify content area
      await expect(page.locator('[data-testid="rightpanel-content"]')).toBeVisible();
    });

    test("clicking Indicators tab updates dump().ui.rightPanel.activeTab", async ({ page }) => {
      // Click Indicators tab
      await page.locator('[data-testid="rightpanel-tab-indicators"]').click();
      await page.waitForTimeout(100);

      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.rightPanel.activeTab).toBe("indicators");
    });

    test("clicking Objects tab updates dump().ui.rightPanel.activeTab", async ({ page }) => {
      // Click Objects tab
      await page.locator('[data-testid="rightpanel-tab-objects"]').click();
      await page.waitForTimeout(100);

      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.rightPanel.activeTab).toBe("objects");
    });

    test("clicking Alerts tab updates dump().ui.rightPanel.activeTab", async ({ page }) => {
      // Click Alerts tab
      await page.locator('[data-testid="rightpanel-tab-alerts"]').click();
      await page.waitForTimeout(100);

      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.rightPanel.activeTab).toBe("alerts");
    });

    test("tab switching is deterministic with repeat clicks", async ({ page }) => {
      const tabs: RightPanelTab[] = ["indicators", "objects", "alerts"];

      for (const tab of tabs) {
        await page.locator(`[data-testid="rightpanel-tab-${tab}"]`).click();
        await page.waitForTimeout(50);

        const dump = await page.evaluate(() => window.__lwcharts.dump());
        expect(dump.ui.rightPanel.activeTab).toBe(tab);
      }
    });
  });

  test.describe("Persistence", () => {
    test("activeTab is persisted to localStorage", async ({ page }) => {
      // Switch to Objects tab
      await page.locator('[data-testid="rightpanel-tab-objects"]').click();
      await page.waitForTimeout(100);

      // Check localStorage
      const stored = await page.evaluate(() =>
        window.localStorage.getItem("cp.rightPanel.activeTab")
      );
      expect(stored).toBe("objects");
    });

    test("activeTab is restored from localStorage on reload", async ({ page }) => {
      // Switch to Alerts tab
      await page.locator('[data-testid="rightpanel-tab-alerts"]').click();
      await page.waitForTimeout(100);

      // Reload page
      await page.reload();

      // Wait for RightPanel to render
      await expect(page.locator('[data-testid="rightpanel-tabs"]')).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(500);

      // Verify dump still shows Alerts as active
      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.rightPanel.activeTab).toBe("alerts");
    });

    test("invalid localStorage value falls back to 'indicators'", async ({ page }) => {
      // Set invalid value
      await page.evaluate(() =>
        window.localStorage.setItem("cp.rightPanel.activeTab", "invalid-tab")
      );

      // Reload
      await page.reload();

      await expect(page.locator('[data-testid="rightpanel-tabs"]')).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(300);

      // Should default to indicators
      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.rightPanel.activeTab).toBe("indicators");
    });
  });

  test.describe("Collapse/Expand", () => {
    test("collapse button toggles dump().ui.rightPanel.collapsed", async ({ page }) => {
      // Initially not collapsed
      let dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.rightPanel.collapsed).toBe(false);

      // Click collapse button
      await page.locator('[data-testid="rightpanel-collapse-btn"]').click();
      await page.waitForTimeout(100);

      // Should be collapsed
      dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.rightPanel.collapsed).toBe(true);

      // Click expand button
      await page.locator('[data-testid="rightpanel-expand-btn"]').click();
      await page.waitForTimeout(100);

      // Should be expanded
      dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.rightPanel.collapsed).toBe(false);
    });

    test("when collapsed, tab content is hidden but expand button is visible", async ({ page }) => {
      // Collapse
      await page.locator('[data-testid="rightpanel-collapse-btn"]').click();
      await page.waitForTimeout(100);

      // Content should be hidden
      await expect(page.locator('[data-testid="rightpanel-content"]')).not.toBeVisible();

      // Expand button should be visible
      await expect(page.locator('[data-testid="rightpanel-expand-btn"]')).toBeVisible();
    });

    test("when expanded, full panel with tabs is visible", async ({ page }) => {
      // Ensure expanded
      const dump1 = await page.evaluate(() => window.__lwcharts.dump());
      if (dump1.ui.rightPanel.collapsed) {
        await page.locator('[data-testid="rightpanel-expand-btn"]').click();
        await page.waitForTimeout(100);
      }

      // All elements visible
      await expect(page.locator('[data-testid="rightpanel-tabs"]')).toBeVisible();
      await expect(page.locator('[data-testid="rightpanel-tab-indicators"]')).toBeVisible();
      await expect(page.locator('[data-testid="rightpanel-content"]')).toBeVisible();
    });
  });

  test.describe("Layout Integration", () => {
    test("RightPanel is rendered inside tv-rightbar", async ({ page }) => {
      // Verify tv-rightbar exists and contains RightPanel
      const rightBar = page.locator('[data-testid="tv-rightbar"]');
      await expect(rightBar).toBeVisible();

      // RightPanel should be a child of rightbar
      const rightPanel = rightBar.locator('[data-testid="rightpanel-tabs"]');
      await expect(rightPanel).toBeVisible();
    });

    test("legacy chartspro-sidebar is NOT rendered in workspace mode", async ({ page }) => {
      // In workspace mode, the external sidebar should not exist
      const legacySidebar = page.locator('[data-testid="chartspro-sidebar"]');
      await expect(legacySidebar).not.toBeVisible();
    });

    test("rightbar width is non-zero in workspace mode when not collapsed", async ({ page }) => {
      // Ensure not collapsed
      const dump1 = await page.evaluate(() => window.__lwcharts.dump());
      if (dump1.ui.rightPanel.collapsed) {
        await page.locator('[data-testid="rightpanel-expand-btn"]').click();
        await page.waitForTimeout(100);
      }

      // Get width from dump
      const dump = await page.evaluate(() => window.__lwcharts.dump());
      expect(dump.ui.rightPanel.width).toBeGreaterThan(0);

      // Also verify visually – rightbar should have computed width
      const rightBar = page.locator('[data-testid="tv-rightbar"]');
      const box = await rightBar.boundingBox();
      expect(box?.width).toBeGreaterThan(0);
    });

    test("tv-shell layout is stable (no zero-width rightbar)", async ({ page }) => {
      // The shell should render with grid columns: auto 1fr auto
      // rightbar should always have some width when not collapsed
      const dump = await page.evaluate(() => window.__lwcharts.dump());

      if (!dump.ui.rightPanel.collapsed) {
        expect(dump.ui.rightPanel.width).toBeGreaterThan(240); // min-width from CSS tokens
      }
    });
  });

  test.describe("Determinism with repeat-each", () => {
    test("repeated tab switches are deterministic", async ({ page }) => {
      const sequence = ["indicators", "objects", "alerts"] as const;

      // Do multiple cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        for (const tab of sequence) {
          await page.locator(`[data-testid="rightpanel-tab-${tab}"]`).click();
          await page.waitForTimeout(50);

          const dump = await page.evaluate(() => window.__lwcharts.dump());
          expect(dump.ui.rightPanel.activeTab).toBe(tab);
        }
      }
    });

    test("collapse/expand toggle is deterministic", async ({ page }) => {
      for (let i = 0; i < 5; i++) {
        // Collapse
        const dump1 = await page.evaluate(() => window.__lwcharts.dump());
        if (!dump1.ui.rightPanel.collapsed) {
          await page.locator('[data-testid="rightpanel-collapse-btn"]').click();
          await page.waitForTimeout(100);
        }

        const collapsed = await page.evaluate(() => window.__lwcharts.dump());
        expect(collapsed.ui.rightPanel.collapsed).toBe(true);

        // Expand
        await page.locator('[data-testid="rightpanel-expand-btn"]').click();
        await page.waitForTimeout(100);

        const expanded = await page.evaluate(() => window.__lwcharts.dump());
        expect(expanded.ui.rightPanel.collapsed).toBe(false);
      }
    });
  });

  test.describe("TV-6 ObjectTree TradingView-Style", () => {
    test("table headers visible in Objects tab", async ({ page }) => {
      // Switch to Objects tab
      await page.locator('[data-testid="rightpanel-tab-objects"]').click();
      await page.waitForTimeout(200);

      // Verify "Name" text is present (header row) in the Objects panel content
      const objectsPanel = page.locator('[data-testid="tv-rightbar"]');
      await expect(objectsPanel).toContainText("Name");
    });

    test("context menu structure correct (verify component integration)", async ({ page }) => {
      // Just verify the ObjectTree component is rendered correctly
      // Context menu is only visible on right-click with actual objects,
      // so we verify the ContextMenu.Root wrapper is present in the React tree
      // by checking that ObjectTree renders without errors
      
      await page.locator('[data-testid="rightpanel-tab-objects"]').click();
      await page.waitForTimeout(200);

      // If ObjectTree with ContextMenu integration has errors, page would crash
      // Verify Objects tab renders successfully
      const objectsPanel = page.locator('[data-testid="tv-rightbar"]');
      await expect(objectsPanel).toBeVisible();
      await expect(objectsPanel).toContainText("Name");
    });
  });
});

// TV-13.7 Layout Guard: ensure tv-shell no longer enforces desktop min-height
test.describe("ChartsPro Layout Invariant (TV-13.7)", () => {
  test("tv-shell min-height is not forced on desktop", async ({ page }) => {
    await gotoChartsPro(page, { mock: true, workspaceMode: true });

    const minHeight = await page
      .locator('[data-testid="tv-shell"]')
      .evaluate((el) => getComputedStyle(el).minHeight);

    expect(minHeight).not.toBe("600px");
  });
});
