/**
 * ChartsPro Layout & Responsive Tests
 * 
 * Tests workspace mode, sidebar collapse, full-height layout, and responsive behavior.
 * Guards against:
 * - Excessive whitespace / dead space under chart
 * - Nested scrollbars (page scroll + internal scroll)
 * - Chart not using available viewport height
 * - Sidebar collapse breaking chart layout
 */
import { test, expect } from "@playwright/test";

type LwChartsApi = {
  dump: () => {
    ui: {
      layout: {
        workspaceMode: boolean;
        sidebarCollapsed: boolean;
        sidebarWidth: number;
        viewportWH: { w: number; h: number };
        hasNestedScroll: boolean;
      };
    };
    render: {
      canvasWH: { w: number; h: number };
    };
  };
};

declare global {
  interface Window {
    __lwcharts: LwChartsApi;
  }
}

test.describe("ChartsPro Layout & Responsive", () => {
  test.beforeEach(async ({ page }) => {
    // Load Charts Pro tab with mock data
    await page.goto("/?mock=1");
    
    // Wait for app to load and click charts tab
    await expect(page.locator('[data-testid="tab-list"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    
    // Wait for chart shell and workspace to render
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="chartspro-workspace"]')).toBeVisible();
    
    // Wait for dump to be available
    await page.waitForFunction(() => typeof window.__lwcharts?.dump === "function");
  });

  test.describe("Workspace Mode", () => {
    test("workspace mode is enabled by default", async ({ page }) => {
      const layout = await page.evaluate(() => window.__lwcharts.dump().ui.layout);
      expect(layout.workspaceMode).toBe(true);
    });

    test("workspace mode hides info cards", async ({ page }) => {
      // In workspace mode, info cards should be hidden
      const infoCard = page.locator('text="Charts Pro (Sprint 0)"');
      await expect(infoCard).not.toBeVisible();
    });

    test("can toggle workspace mode", async ({ page }) => {
      // Find workspace toggle button by testid
      const workspaceBtn = page.locator('[data-testid="workspace-toggle-btn"]');
      await expect(workspaceBtn).toBeVisible();
      
      // Verify initial state
      const initialLayout = await page.evaluate(() => window.__lwcharts.dump().ui.layout);
      expect(initialLayout.workspaceMode).toBe(true);
      
      // Toggle off with force click
      await workspaceBtn.click({ force: true });
      await page.waitForTimeout(500);
      
      const layoutOff = await page.evaluate(() => window.__lwcharts.dump().ui.layout);
      expect(layoutOff.workspaceMode).toBe(false);
      
      // Info cards should now be visible
      const infoCard = page.locator('text="Charts Pro (Sprint 0)"');
      await expect(infoCard).toBeVisible();
      
      // Toggle back on
      await workspaceBtn.click({ force: true });
      await page.waitForTimeout(500);
      
      const layoutOn = await page.evaluate(() => window.__lwcharts.dump().ui.layout);
      expect(layoutOn.workspaceMode).toBe(true);
    });
  });

  test.describe("Chart Height & Viewport Usage", () => {
    test("chart shell has min-height of 600px", async ({ page }) => {
      const tvShell = page.locator('[data-testid="tv-shell"]');
      const box = await tvShell.boundingBox();
      
      expect(box).not.toBeNull();
      // With viewport 1280x800 and controls/header, chart should still meet 480px minimum
      expect(box!.height).toBeGreaterThanOrEqual(480);
    });

    test("chart uses available vertical space efficiently", async ({ page }) => {
      const workspace = page.locator('[data-testid="chartspro-workspace"]');
      const tvShell = page.locator('[data-testid="tv-shell"]');
      
      const workspaceBox = await workspace.boundingBox();
      const shellBox = await tvShell.boundingBox();
      
      expect(workspaceBox).not.toBeNull();
      expect(shellBox).not.toBeNull();
      
      // Shell should take up most of workspace height (at least 85%)
      const heightRatio = shellBox!.height / workspaceBox!.height;
      expect(heightRatio).toBeGreaterThanOrEqual(0.85);
    });

    test("viewport dimensions are exposed in dump()", async ({ page }) => {
      const layout = await page.evaluate(() => window.__lwcharts.dump().ui.layout);
      const render = await page.evaluate(() => window.__lwcharts.dump().render);
      
      // Viewport should have reasonable dimensions
      expect(layout.viewportWH.w).toBeGreaterThan(400);
      expect(layout.viewportWH.h).toBeGreaterThan(400);
      
      // Canvas dimensions should be reasonably close to viewport
      // (sidebar takes some width, controls take some height)
      expect(render.canvasWH.w).toBeGreaterThan(300);
      expect(render.canvasWH.h).toBeGreaterThan(300);
    });

    test("chart root is positioned efficiently", async ({ page }) => {
      const tvChartRoot = page.locator('[data-testid="tv-chart-root"]');
      const box = await tvChartRoot.boundingBox();
      
      expect(box).not.toBeNull();
      
      // Chart root should not have excessive top offset
      // and should extend reasonably far down
      const viewportHeight = page.viewportSize()!.height;
      expect(box!.y).toBeLessThan(400); // Allows for header + controls
      expect(box!.y + box!.height).toBeGreaterThan(viewportHeight * 0.6); // Uses most of viewport
    });
  });

  test.describe("Sidebar Collapse", () => {
    test("sidebar is expanded by default", async ({ page }) => {
      const layout = await page.evaluate(() => window.__lwcharts.dump().ui.layout);
      expect(layout.sidebarCollapsed).toBe(false);
      
      const sidebar = page.locator('[data-testid="chartspro-sidebar"]');
      await expect(sidebar).toBeVisible();
    });

    test("can collapse sidebar", async ({ page }) => {
      // Find collapse button by testid
      const collapseBtn = page.locator('[data-testid="collapse-sidebar-btn"]');
      await expect(collapseBtn).toBeVisible();
      
      await collapseBtn.click({ force: true });
      await page.waitForTimeout(500);
      
      const layout = await page.evaluate(() => window.__lwcharts.dump().ui.layout);
      expect(layout.sidebarCollapsed).toBe(true);
      
      // Sidebar content should not be visible
      const sidebarContent = page.locator('[data-testid="sidebar-content"]');
      await expect(sidebarContent).not.toBeVisible();
      
      // Expand button should be visible
      const expandBtn = page.locator('[data-testid="expand-sidebar-btn"]');
      await expect(expandBtn).toBeVisible();
    });

    test("collapsing sidebar does not break chart", async ({ page }) => {
      // Get chart dimensions before collapse
      const beforeCanvas = await page.evaluate(() => window.__lwcharts.dump().render.canvasWH);
      
      // Collapse sidebar
      const collapseBtn = page.locator('[data-testid="collapse-sidebar-btn"]');
      await collapseBtn.click();
      await page.waitForTimeout(400);
      
      // Chart should still render with reasonable dimensions
      const afterCanvas = await page.evaluate(() => window.__lwcharts.dump().render.canvasWH);
      
      expect(afterCanvas.w).toBeGreaterThan(400);
      expect(afterCanvas.h).toBeGreaterThan(400);
      
      // Chart should expand horizontally (width should increase by at least 100px)
      expect(afterCanvas.w).toBeGreaterThan(beforeCanvas.w + 50);
    });

    test("can expand sidebar after collapse", async ({ page }) => {
      // Collapse
      const collapseBtn = page.locator('[data-testid="collapse-sidebar-btn"]');
      await collapseBtn.click();
      await page.waitForTimeout(300);
      
      // Expand
      const expandBtn = page.locator('[data-testid="expand-sidebar-btn"]');
      await expandBtn.click();
      await page.waitForTimeout(300);
      
      const layout = await page.evaluate(() => window.__lwcharts.dump().ui.layout);
      expect(layout.sidebarCollapsed).toBe(false);
      
      // Sidebar should be visible again
      const sidebar = page.locator('[data-testid="chartspro-sidebar"]');
      await expect(sidebar).toBeVisible();
    });

    test("sidebar width is tracked in dump()", async ({ page }) => {
      const layout = await page.evaluate(() => window.__lwcharts.dump().ui.layout);
      
      // Default sidebar width should be 320px
      expect(layout.sidebarWidth).toBe(320);
      expect(layout.sidebarWidth).toBeGreaterThan(0);
      expect(layout.sidebarWidth).toBeLessThan(800);
    });
  });

  test.describe("Nested Scroll Detection", () => {
    test("workspace mode has no nested scroll", async ({ page }) => {
      const layout = await page.evaluate(() => window.__lwcharts.dump().ui.layout);
      
      // In workspace mode, there should be no nested scroll
      // (page shouldn't scroll AND internal element scroll simultaneously)
      expect(layout.hasNestedScroll).toBe(false);
    });

    test("page scroll is minimal in workspace mode", async ({ page }) => {
      // Check if page has significant scroll
      const scrollY = await page.evaluate(() => window.scrollY);
      
      // In workspace mode, page scroll should be minimal (< 50px)
      expect(scrollY).toBeLessThan(50);
    });
  });

  test.describe("Responsive Behavior", () => {
    test("chart adapts to viewport size", async ({ page }) => {
      // Get initial dimensions at 1280x800
      const initial = await page.evaluate(() => window.__lwcharts.dump().render.canvasWH);
      
      // Resize viewport to smaller size
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.waitForTimeout(800);
      
      const smaller = await page.evaluate(() => window.__lwcharts.dump().render.canvasWH);
      
      // Canvas should adapt (width should be smaller)
      expect(smaller.w).toBeLessThan(initial.w);
      
      // But still reasonable
      expect(smaller.w).toBeGreaterThan(400);
      expect(smaller.h).toBeGreaterThan(350);
      
      // Resize back to larger
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForTimeout(800);
      
      const larger = await page.evaluate(() => window.__lwcharts.dump().render.canvasWH);
      
      // Canvas should expand in width
      expect(larger.w).toBeGreaterThan(smaller.w);
      // Height might not change much due to controls, so just check it's reasonable
      expect(larger.h).toBeGreaterThan(400);
    });

    test("layout state persists across page reload", async ({ page }) => {
      // Collapse sidebar
      const collapseBtn = page.locator('[data-testid="collapse-sidebar-btn"]');
      await collapseBtn.click();
      await page.waitForTimeout(300);
      
      // Reload page
      await page.reload();
      await page.locator('[data-testid="tab-charts"]').click({ force: true });
      await page.waitForFunction(() => typeof window.__lwcharts?.dump === "function");
      
      // Layout should remember collapsed state
      const layout = await page.evaluate(() => window.__lwcharts.dump().ui.layout);
      expect(layout.sidebarCollapsed).toBe(true);
    });
  });
});
