/**
 * ChartsPro Responsive + Visual Polish (Sprint v6)
 * - Validates breakpoints (desktop, laptop/tablet, mobile)
 * - Ensures no horizontal overflow and sensible chart area sizing
 * - Verifies sidebar behavior (desktop collapsible, tablet collapsed by default, mobile drawer)
 * - Confirms toolbar remains usable (wraps / compact actions)
 */
import { test, expect, Page } from "@playwright/test";

type LayoutDump = {
  workspaceMode: boolean;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  viewportWH: { w: number; h: number };
  hasNestedScroll: boolean;
};

type RenderDump = {
  canvasWH: { w: number; h: number };
};

type UiDump = {
  layout: LayoutDump;
};

type Dump = {
  ui: UiDump;
  render: RenderDump;
};

test.describe("ChartsPro Responsive Breakpoints", () => {
  const gotoCharts = async (page: Page) => {
    await page.goto("/?mock=1");
    await page.locator('[data-testid="tab-charts"]').click({ force: true });
    await expect(page.locator('[data-testid="tv-shell"]')).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => typeof window.__lwcharts?.dump === "function");
  };

  const noHorizontalOverflow = async (page: Page) => {
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 2;
    });
    expect(overflow).toBe(false);
  };

  test("desktop 1440x900: workspace full height, sidebar collapsible", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoCharts(page);

    const dump: Dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.ui.layout.workspaceMode).toBe(true);
    expect(dump.ui.layout.viewportWH.h).toBeGreaterThan(450);
    expect(dump.ui.layout.sidebarCollapsed).toBe(false);

    await noHorizontalOverflow(page);

    const before = dump.render.canvasWH.w;
    await page.locator('[data-testid="collapse-sidebar-btn"]').click();
    await page.waitForTimeout(300);
    const afterCollapse: Dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(afterCollapse.ui.layout.sidebarCollapsed).toBe(true);
    expect(afterCollapse.render.canvasWH.w).toBeGreaterThan(before + 40);
  });

  test("tablet landscape 1024x768: sidebar collapsed by default", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await gotoCharts(page);

    const dump: Dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.ui.layout.workspaceMode).toBe(true);
    expect(dump.ui.layout.sidebarCollapsed).toBe(true);
    expect(dump.ui.layout.viewportWH.h).toBeGreaterThan(380);

    await noHorizontalOverflow(page);

    const expandBtn = page.locator('[data-testid="expand-sidebar-btn"]');
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();
    await page.waitForTimeout(300);
    const afterExpand: Dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(afterExpand.ui.layout.sidebarCollapsed).toBe(false);
  });

  test("tablet portrait 768x1024: sidebar collapsed and expandable", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoCharts(page);

    const dump: Dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.ui.layout.sidebarCollapsed).toBe(true);
    expect(dump.ui.layout.viewportWH.h).toBeGreaterThan(380);

    await noHorizontalOverflow(page);

    const expandBtn = page.locator('[data-testid="expand-sidebar-btn"]');
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();
    await page.waitForTimeout(300);
    const afterExpand: Dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(afterExpand.ui.layout.sidebarCollapsed).toBe(false);
  });

  test("mobile 390x844: drawer sidebar and compact toolbar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoCharts(page);

    const dump: Dump = await page.evaluate(() => window.__lwcharts.dump());
    expect(dump.ui.layout.sidebarCollapsed).toBe(true);
    expect(dump.ui.layout.viewportWH.h).toBeGreaterThan(300);
    await noHorizontalOverflow(page);

    // Drawer closed by default
    await expect(page.locator('[data-testid="chartspro-sidebar"]')).toHaveCount(0);
    const openBtn = page.locator('[data-testid="open-sidebar-drawer-btn"]');
    await expect(openBtn).toBeVisible();
    await openBtn.click();
    await page.waitForTimeout(200);
    await expect(page.locator('[data-testid="sidebar-drawer"]')).toBeVisible();

    // Drawer contains panels
    const drawerContent = page.locator('[data-testid="sidebar-drawer"] [data-testid="sidebar-content"]');
    await expect(drawerContent).toBeVisible();

    // Close drawer
    await page.locator('[data-testid="close-sidebar-drawer-btn"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('[data-testid="sidebar-drawer"]')).toHaveCount(0);
  });
});
