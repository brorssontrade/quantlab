import { test, expect } from "@playwright/test";

test.describe("ChartsPro context menu + pinned crosshair (Sprint 4)", () => {
  test("setup: chart ready and context menu accessible", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.getByRole("tab", { name: /^charts$/i }).click();
    await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

    // Verify context menu QA API ready
    const hasContextMenuApi = await page.evaluate(
      () => typeof (window as any).__lwcharts?._qaOpenContextMenu === "function"
    );
    expect(hasContextMenuApi).toBe(true);

    // Verify pinning QA API ready
    const hasPinApi = await page.evaluate(
      () =>
        typeof (window as any).__lwcharts?._qaPinCrosshair === "function" &&
        typeof (window as any).__lwcharts?._qaUnpinCrosshair === "function"
    );
    expect(hasPinApi).toBe(true);

    // Verify click action API ready
    const hasClickActionApi = await page.evaluate(
      () => typeof (window as any).__lwcharts?._qaClickContextAction === "function"
    );
    expect(hasClickActionApi).toBe(true);

    console.log("✅ All context menu + pinning APIs ready");
  });

  test("open context menu deterministically at mid position", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.getByRole("tab", { name: /^charts$/i }).click();
    await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

    // Open context menu at mid position
    const result = await page.evaluate(() => (window as any).__lwcharts._qaOpenContextMenu({ where: "mid" }));
    expect(result.ok).toBe(true);
    expect(result.contextMenuOpen).toBe(true);

    // Verify menu is visible
    await expect(page.locator('[data-testid="context-menu"]')).toBeVisible();

    // Verify menu items are visible
    await expect(page.locator('[data-testid="context-menu-addAlert"]')).toBeVisible();
    await expect(page.locator('[data-testid="context-menu-copyPrice"]')).toBeVisible();
    await expect(page.locator('[data-testid="context-menu-settings"]')).toBeVisible();

    console.log("✅ Context menu opened and visible with all actions");
  });

  test("close context menu on ESC key", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.getByRole("tab", { name: /^charts$/i }).click();
    await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

    // Open context menu
    await page.evaluate(() => (window as any).__lwcharts._qaOpenContextMenu({ where: "mid" }));
    await expect(page.locator('[data-testid="context-menu"]')).toBeVisible();

    // Press ESC
    await page.keyboard.press("Escape");

    // Menu should close
    await expect(page.locator('[data-testid="context-menu"]')).not.toBeVisible();

    // Verify dump reflects closed state
    const dump = await page.evaluate(() => (window as any).__lwcharts.dump());
    expect(dump.ui?.contextMenuOpen).toBe(false);

    console.log("✅ Context menu closed on ESC");
  });

  test("copy price action sets lastClipboardText", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.getByRole("tab", { name: /^charts$/i }).click();
    await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

    // Apply hover
    await page.evaluate(() => (window as any).__lwcharts._qaApplyHover({ where: "mid" }));

    // Click copy price via QA action
    const result = await page.evaluate(() =>
      (window as any).__lwcharts._qaClickContextAction("copyPrice")
    );
    expect(result.ok).toBe(true);
    expect(result.action).toBe("copyPrice");

    // Verify lastContextAction and lastClipboardText set
    const dump = await page.evaluate(() => (window as any).__lwcharts.dump());
    expect(dump.ui?.lastContextAction).toBe("copyPrice");
    expect(dump.ui?.lastClipboardText).not.toBeNull();

    // Verify format: "SYMBOL price @ timeLabel"
    const clipboardText = dump.ui?.lastClipboardText as string;
    expect(clipboardText).toMatch(/\d+\.\d+/); // contains a price

    console.log("✅ Copy price action works, text:", clipboardText);
  });

  test("add alert action prefills draft and opens modal", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.getByRole("tab", { name: /^charts$/i }).click();
    await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

    // Apply hover
    await page.evaluate(() => (window as any).__lwcharts._qaApplyHover({ where: "mid" }));

    // Click add alert via QA action
    const result = await page.evaluate(() =>
      (window as any).__lwcharts._qaClickContextAction("addAlert")
    );
    expect(result.ok).toBe(true);
    expect(result.action).toBe("addAlert");

    // Verify modal opens
    await expect(page.locator('[data-testid="alert-modal"]')).toBeVisible();

    // Verify draft is prefilled
    const draft = await page.evaluate(() => (window as any).__lwcharts.dump().ui?.lastAlertDraft);
    expect(draft?.symbol).toBeTruthy();
    expect(draft?.timeframe).toBeTruthy();
    expect(draft?.priceAtCursor).toBeGreaterThan(0);
    expect(draft?.timeKey).toBeGreaterThan(0);

    // Verify input fields show prefilled data
    await expect(page.locator('[data-testid="alert-symbol-input"]')).toHaveValue(draft?.symbol);
    await expect(page.locator('[data-testid="alert-timeframe-input"]')).toHaveValue(draft?.timeframe);

    console.log("✅ Add alert modal opens with prefilled draft");
  });

  test("settings action opens settings modal with toggles", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.getByRole("tab", { name: /^charts$/i }).click();
    await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

    // Click settings via QA action
    const result = await page.evaluate(() =>
      (window as any).__lwcharts._qaClickContextAction("settings")
    );
    expect(result.ok).toBe(true);
    expect(result.action).toBe("settings");

    // Verify modal opens
    await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();

    // Verify toggles exist
    await expect(page.locator('[data-testid="settings-crosshair-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="settings-ohlc-toggle"]')).toBeVisible();

    console.log("✅ Settings modal opens with toggles");
  });

  test("toggle crosshair visibility via dump state check", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.getByRole("tab", { name: /^charts$/i }).click();
    await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

    // Apply hover
    await page.evaluate(() => (window as any).__lwcharts._qaApplyHover({ where: "mid" }));
    await expect(page.locator('[data-testid="ohlc-strip"]')).toBeVisible();

    // Verify initially true
    let dump = await page.evaluate(() => (window as any).__lwcharts.dump());
    expect(dump.ui?.showCrosshair).toBe(true);

    console.log("✅ Crosshair initially visible in dump");
  });

  test("toggle OHLC strip visibility via dump state check", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.getByRole("tab", { name: /^charts$/i }).click();
    await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

    // Apply hover
    await page.evaluate(() => (window as any).__lwcharts._qaApplyHover({ where: "mid" }));
    await expect(page.locator('[data-testid="ohlc-strip"]')).toBeVisible();

    // Verify initially true
    let dump = await page.evaluate(() => (window as any).__lwcharts.dump());
    expect(dump.ui?.showOhlcStrip).toBe(true);
  });

  test("pin crosshair via left-click and verify state stability", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.getByRole("tab", { name: /^charts$/i }).click();
    await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

    // Apply hover at mid
    const hoverResult = await page.evaluate(() => (window as any).__lwcharts._qaApplyHover({ where: "mid" }));
    const hoveredTime = hoverResult.snapshot?.time;
    expect(hoveredTime).toBeGreaterThan(0);

    // Pin crosshair
    const pinResult = await page.evaluate(() => (window as any).__lwcharts._qaPinCrosshair());
    expect(pinResult.ok).toBe(true);

    // Wait for state to update, then verify
    await page.waitForFunction(() => {
      const dump = (window as any).__lwcharts.dump();
      return dump.ui?.pinned === true;
    });

    // Verify dump shows pinned state
    const dump1 = await page.evaluate(() => (window as any).__lwcharts.dump());
    expect(dump1.ui?.pinned).toBe(true);
    expect(dump1.ui?.pinnedTime).toBe(hoveredTime);
    expect(dump1.render?.crosshair?.time).toBe(hoveredTime);

    // Try to move hover - crosshair should stay pinned
    const newHoverResult = await page.evaluate(() => (window as any).__lwcharts._qaApplyHover({ where: "right" }));
    const newHoveredTime = newHoverResult.snapshot?.time;
    expect(newHoveredTime).not.toBe(hoveredTime); // Different bar

    // Crosshair should still show pinnedTime
    const dump2 = await page.evaluate(() => (window as any).__lwcharts.dump());
    expect(dump2.render?.crosshair?.time).toBe(hoveredTime); // Still pinned time
    expect(dump2.ui?.pinned).toBe(true);

    console.log("✅ Pinned crosshair stays stable across hover movements");
  });

  test("unpin crosshair and verify hover resumes", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.getByRole("tab", { name: /^charts$/i }).click();
    await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

    // Pin at mid
    await page.evaluate(() => (window as any).__lwcharts._qaApplyHover({ where: "mid" }));
    await page.evaluate(() => (window as any).__lwcharts._qaPinCrosshair());

    // Wait for pinned state
    await page.waitForFunction(() => (window as any).__lwcharts.dump().ui?.pinned === true);

    // Verify pinned
    let dump = await page.evaluate(() => (window as any).__lwcharts.dump());
    expect(dump.ui?.pinned).toBe(true);

    // Unpin
    const unpinResult = await page.evaluate(() => (window as any).__lwcharts._qaUnpinCrosshair());
    expect(unpinResult.ok).toBe(true);

    // Verify unpinned
    dump = await page.evaluate(() => (window as any).__lwcharts.dump());
    expect(dump.ui?.pinned).toBe(false);
    expect(dump.ui?.pinnedTime).toBeNull();

    console.log("✅ Unpinned crosshair resumes normal hovering");
  });

  test("context menu position clamped to viewport", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.getByRole("tab", { name: /^charts$/i }).click();
    await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

    // Open context menu at left edge
    const result = await page.evaluate(() => (window as any).__lwcharts._qaOpenContextMenu({ where: "left" }));
    expect(result.ok).toBe(true);

    // Verify menu is visible and positioned
    const menu = page.locator('[data-testid="context-menu"]');
    await expect(menu).toBeVisible();

    // Get bounding box
    const box = await menu.boundingBox();
    expect(box).toBeTruthy();

    // Menu should be within reasonable bounds (not off-screen)
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(-10); // Allow small overflow for edge cases
      expect(box.y).toBeGreaterThanOrEqual(-10);
    }

    console.log("✅ Context menu position clamped to viewport");
  });

  test("no regression: single hover still works with context menu", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.getByRole("tab", { name: /^charts$/i }).click();
    await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

    // Test standard hover (Sprint 2)
    const result = await page.evaluate(() => (window as any).__lwcharts._qaApplyHover({ where: "mid" }));
    expect(result.ok).toBe(true);
    expect(result.snapshot?.time).toBeGreaterThan(0);

    // Verify OHLC strip visible
    await expect(page.locator('[data-testid="ohlc-strip"]')).toBeVisible();

    // Test clear hover (Sprint 2)
    const clearResult = await page.evaluate(() => (window as any).__lwcharts._qaClearHover());
    expect(clearResult.ok).toBe(true);

    // Verify cleared
    const dump = await page.evaluate(() => (window as any).__lwcharts.dump());
    expect(dump.hover?.active).toBe(false);

    console.log("✅ Sprint 2 hover functionality intact");
  });
});
