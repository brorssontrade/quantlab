/**
 * chartsPro.cp23.spec.ts
 *
 * TV-23: Settings & Layout Dialog
 *
 * Tests:
 * - TV-23.1: Settings dialog open/close via gear button
 * - TV-23.1: Tab navigation (Appearance, Layout, Advanced)
 * - TV-23.1: Dialog state exposed in dump().ui.settingsDialog
 * - TV-23.1: Cancel reverts pending changes
 * - TV-23.1: Save persists to localStorage
 * - TV-23.1: Reset restores defaults
 */

import { test, expect } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

test.describe("TV-23.1: Settings Dialog", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await gotoChartsPro(page, testInfo);
    // Wait for chart to be ready
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.render?.hasChart;
    }, { timeout: 10000 }).toBe(true);
  });

  test("opens settings dialog via gear button", async ({ page }) => {
    // Find and click the settings button
    const settingsBtn = page.getByTestId("settings-button");
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    // Verify dialog is open
    const dialog = page.getByTestId("settings-dialog");
    await expect(dialog).toBeVisible();

    // Verify dump() reflects dialog state
    const dumpState = await page.evaluate(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.ui?.settingsDialog;
    });
    expect(dumpState?.isOpen).toBe(true);
    expect(dumpState?.activeTab).toBe("appearance");
  });

  test("closes dialog via close button", async ({ page }) => {
    // Open dialog
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    // Close via X button
    await page.getByTestId("settings-close").click();
    await expect(page.getByTestId("settings-dialog")).not.toBeVisible();

    // Verify dump() reflects closed state
    const dumpState = await page.evaluate(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.ui?.settingsDialog;
    });
    expect(dumpState?.isOpen).toBe(false);
  });

  test("closes dialog via Escape key", async ({ page }) => {
    // Open dialog
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    // Close via Escape
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("settings-dialog")).not.toBeVisible();
  });

  test("closes dialog via click outside (overlay)", async ({ page }) => {
    // Open dialog
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    // Wait for the modal's click-outside handler to be registered (100ms delay in ModalPortal)
    await page.waitForTimeout(150);

    // Get dialog bounds to click outside of it
    const dialog = page.getByTestId("settings-dialog");
    const dialogBox = await dialog.boundingBox();
    
    if (dialogBox) {
      // Click to the left of the dialog (on the overlay backdrop)
      // The overlay is full-screen, so clicking at x=10 should be on the overlay
      const clickX = dialogBox.x - 20;  // Left of dialog
      const clickY = dialogBox.y + dialogBox.height / 2;  // Vertically centered
      
      await page.mouse.click(Math.max(clickX, 10), clickY);
    }
    await expect(page.getByTestId("settings-dialog")).not.toBeVisible({ timeout: 3000 });
  });

  test("navigates between tabs", async ({ page }) => {
    // Open dialog
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    // Default is Appearance tab
    await expect(page.getByTestId("settings-panel-appearance")).toBeVisible();

    // Click Layout tab
    await page.getByTestId("settings-tab-layout").click();
    await expect(page.getByTestId("settings-panel-layout")).toBeVisible();

    // Verify dump() reflects active tab
    let dumpState = await page.evaluate(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.ui?.settingsDialog;
    });
    expect(dumpState?.activeTab).toBe("layout");

    // Click Advanced tab
    await page.getByTestId("settings-tab-advanced").click();
    await expect(page.getByTestId("settings-panel-advanced")).toBeVisible();

    dumpState = await page.evaluate(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.ui?.settingsDialog;
    });
    expect(dumpState?.activeTab).toBe("advanced");
  });

  test("cancel reverts pending changes", async ({ page }) => {
    // Clear localStorage first
    await page.evaluate(() => {
      localStorage.removeItem("cp.settings");
    });

    // Open dialog
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    // Toggle a setting (showGrid)
    const showGridToggle = page.getByTestId("settings-showGrid");
    const initialState = await showGridToggle.getAttribute("aria-checked");

    await showGridToggle.click();
    const changedState = await showGridToggle.getAttribute("aria-checked");
    expect(changedState).not.toBe(initialState);

    // Cancel
    await page.getByTestId("settings-cancel").click();
    await expect(page.getByTestId("settings-dialog")).not.toBeVisible();

    // Reopen dialog - should show original state
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    const restoredState = await page.getByTestId("settings-showGrid").getAttribute("aria-checked");
    expect(restoredState).toBe(initialState);
  });

  test("save persists changes to localStorage", async ({ page }) => {
    // Clear localStorage first
    await page.evaluate(() => {
      localStorage.removeItem("cp.settings");
    });

    // Open dialog
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    // Change a color (upColor)
    const upColorInput = page.getByTestId("settings-upColor");
    await upColorInput.fill("#00ff00");

    // Save
    await page.getByTestId("settings-save").click();
    await expect(page.getByTestId("settings-dialog")).not.toBeVisible();

    // Verify localStorage was updated
    const storedSettings = await page.evaluate(() => {
      const raw = localStorage.getItem("cp.settings");
      return raw ? JSON.parse(raw) : null;
    });
    expect(storedSettings?.appearance?.upColor).toBe("#00ff00");

    // Reload page and verify persistence
    await page.reload();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.render?.hasChart;
    }, { timeout: 10000 }).toBe(true);

    // Open dialog again
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    // Verify the color is still #00ff00
    const persistedColor = await page.getByTestId("settings-upColor").inputValue();
    expect(persistedColor).toBe("#00ff00");
  });

  test("reset restores default values", async ({ page }) => {
    // First set a non-default value
    await page.evaluate(() => {
      const settings = {
        appearance: {
          showGrid: false, // non-default
          upColor: "#ff0000", // non-default
          downColor: "#0000ff",
          gridStyle: "solid",
          gridColor: "#2a2e39",
          backgroundColor: "#131722",
          crosshairMode: "normal",
        },
        layout: {
          showLeftToolbar: true,
          showBottomBar: true,
          showRightPanel: true,
          showLegend: true,
          legendPosition: "top-left",
        },
        advanced: {
          maxBarsOnChart: 4000,
          enableAnimations: true,
          autoSaveDrawings: true,
          confirmBeforeDelete: true,
        },
      };
      localStorage.setItem("cp.settings", JSON.stringify(settings));
    });

    // Reload to pick up stored settings
    await page.reload();
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.render?.hasChart;
    }, { timeout: 10000 }).toBe(true);

    // Open dialog
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    // Verify non-default value is showing
    const showGridBefore = await page.getByTestId("settings-showGrid").getAttribute("aria-checked");
    expect(showGridBefore).toBe("false");

    // Click reset
    await page.getByTestId("settings-reset").click();

    // Verify values are back to defaults
    const showGridAfter = await page.getByTestId("settings-showGrid").getAttribute("aria-checked");
    expect(showGridAfter).toBe("true"); // default is true

    // Note: Reset only affects pending changes, need to save to persist
    await page.getByTestId("settings-save").click();

    // Verify localStorage was updated to defaults
    const storedSettings = await page.evaluate(() => {
      const raw = localStorage.getItem("cp.settings");
      return raw ? JSON.parse(raw) : null;
    });
    expect(storedSettings?.appearance?.showGrid).toBe(true);
  });

  test("Appearance tab controls work", async ({ page }) => {
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    // Test grid visibility toggle
    const showGridToggle = page.getByTestId("settings-showGrid");
    await expect(showGridToggle).toBeVisible();

    // Test crosshair mode select
    const crosshairSelect = page.getByTestId("settings-crosshairMode");
    await expect(crosshairSelect).toBeVisible();
    await crosshairSelect.selectOption("magnet");
    expect(await crosshairSelect.inputValue()).toBe("magnet");

    // Test color inputs
    await expect(page.getByTestId("settings-upColor")).toBeVisible();
    await expect(page.getByTestId("settings-downColor")).toBeVisible();
    await expect(page.getByTestId("settings-backgroundColor")).toBeVisible();
  });

  test("Layout tab controls work", async ({ page }) => {
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    // Navigate to Layout tab
    await page.getByTestId("settings-tab-layout").click();
    await expect(page.getByTestId("settings-panel-layout")).toBeVisible();

    // Test panel visibility toggles
    await expect(page.getByTestId("settings-showLeftToolbar")).toBeVisible();
    await expect(page.getByTestId("settings-showBottomBar")).toBeVisible();
    await expect(page.getByTestId("settings-showRightPanel")).toBeVisible();

    // Test legend toggle and position
    await expect(page.getByTestId("settings-showLegend")).toBeVisible();
    await expect(page.getByTestId("settings-legendPosition")).toBeVisible();
  });

  test("Advanced tab controls work", async ({ page }) => {
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    // Navigate to Advanced tab
    await page.getByTestId("settings-tab-advanced").click();
    await expect(page.getByTestId("settings-panel-advanced")).toBeVisible();

    // Test max bars input
    const maxBarsInput = page.getByTestId("settings-maxBarsOnChart");
    await expect(maxBarsInput).toBeVisible();
    await maxBarsInput.fill("5000");
    expect(await maxBarsInput.inputValue()).toBe("5000");

    // Test toggle controls
    await expect(page.getByTestId("settings-enableAnimations")).toBeVisible();
    await expect(page.getByTestId("settings-autoSaveDrawings")).toBeVisible();
    await expect(page.getByTestId("settings-confirmBeforeDelete")).toBeVisible();
  });
});

test.describe("TV-23.2: Apply Appearance settings to chart", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Clear localStorage before each test for clean state
    await page.addInitScript(() => {
      localStorage.removeItem("cp.settings");
    });
    await gotoChartsPro(page, testInfo);
    // Wait for chart to be ready
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.render?.hasChart;
    }, { timeout: 10000 }).toBe(true);
  });

  test("backgroundColor setting affects chart rendering", async ({ page }) => {
    // Get initial applied appearance
    const initialAppearance = await page.evaluate(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.render?.appliedAppearance;
    });
    expect(initialAppearance).toBeTruthy();
    expect(initialAppearance.chartOptions.backgroundColor).toBeDefined();

    // Change backgroundColor via settings store directly
    const newBgColor = "#ff0000";
    await page.evaluate((bgColor) => {
      // Access the Zustand store directly
      const settingsStore = (window as any).__cpSettingsStore;
      if (settingsStore) {
        settingsStore.getState().updateSettings({
          appearance: { backgroundColor: bgColor }
        });
      }
    }, newBgColor);

    // Poll until change is applied (0-flake pattern)
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.render?.appliedAppearance?.chartOptions?.backgroundColor;
    }, { timeout: 5000 }).toBe(newBgColor);
  });

  test("showGrid setting affects chart rendering", async ({ page }) => {
    // Get initial applied appearance (default showGrid = true)
    const initialAppearance = await page.evaluate(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.render?.appliedAppearance;
    });
    expect(initialAppearance.chartOptions.gridVisible).toBe(true);

    // Turn off grid via settings store
    await page.evaluate(() => {
      const settingsStore = (window as any).__cpSettingsStore;
      if (settingsStore) {
        settingsStore.getState().updateSettings({
          appearance: { showGrid: false }
        });
      }
    });

    // Poll until change is applied (0-flake pattern)
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.render?.appliedAppearance?.chartOptions?.gridVisible;
    }, { timeout: 5000 }).toBe(false);
  });

  test("upColor setting affects candle series", async ({ page }) => {
    // Get initial applied appearance
    const initialAppearance = await page.evaluate(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.render?.appliedAppearance;
    });
    expect(initialAppearance.seriesOptions).toBeTruthy();
    expect(initialAppearance.seriesOptions.upColor).toBeDefined();

    // Change upColor via settings store
    const newUpColor = "#00ff00";
    await page.evaluate((color) => {
      const settingsStore = (window as any).__cpSettingsStore;
      if (settingsStore) {
        settingsStore.getState().updateSettings({
          appearance: { upColor: color }
        });
      }
    }, newUpColor);

    // Poll until change is applied (0-flake pattern)
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.render?.appliedAppearance?.seriesOptions?.upColor;
    }, { timeout: 5000 }).toBe(newUpColor);
  });

  test("crosshairMode setting affects chart rendering", async ({ page }) => {
    // Get initial appearance (default crosshairMode = "normal")
    const initialAppearance = await page.evaluate(() => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump?.render?.appliedAppearance;
    });
    expect(initialAppearance.chartOptions.crosshairMode).toBe("normal");

    // Change to magnet mode via settings store
    await page.evaluate(() => {
      const settingsStore = (window as any).__cpSettingsStore;
      if (settingsStore) {
        settingsStore.getState().updateSettings({
          appearance: { crosshairMode: "magnet" }
        });
      }
    });

    // Poll until change is applied (0-flake pattern)
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.render?.appliedAppearance?.chartOptions?.crosshairMode;
    }, { timeout: 5000 }).toBe("magnet");
  });

  test("settings dialog save applies appearance to chart", async ({ page }) => {
    // Open settings dialog
    await page.getByTestId("settings-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    // Change backgroundColor via dialog
    const bgInput = page.getByTestId("settings-backgroundColor");
    await bgInput.fill("#123456");

    // Save settings
    await page.getByTestId("settings-save").click();
    await expect(page.getByTestId("settings-dialog")).not.toBeVisible();

    // Poll until change is applied (0-flake pattern)
    await expect.poll(async () => {
      const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
      return dump?.render?.appliedAppearance?.chartOptions?.backgroundColor;
    }, { timeout: 5000 }).toBe("#123456");
  });
});
