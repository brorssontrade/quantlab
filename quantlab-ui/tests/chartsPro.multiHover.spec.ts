import { test, expect, Page } from "@playwright/test";

async function waitForDump(page: Page, predicate: (dump: any) => boolean) {
  await page.waitForFunction(
    (body) => {
      const dump = (window as any).__lwcharts?.dump?.();
      if (!dump) return false;
      return (window as any).Function(`return (${body});`).call(null, dump);
    },
    predicate.toString(),
  );
}

test("ChartsPro multi-symbol hover + TradingView legend parity", async ({ page }, testInfo) => {
  // Initialize page with mock mode
  await page.goto("/?mock=1");
  await page.getByRole("tab", { name: /^charts$/i }).click();

  // Forward page console messages to test output
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.text().includes("ERROR")) {
      // eslint-disable-next-line no-console
      console.log(`PAGE_CONSOLE[${msg.type()}]: ${msg.text()}`);
    }
  });

  // Wait for chart ready
  await waitForDump(page, (dump) => dump?.pricePoints > 0 && dump?.timeframe === "1h");
  await page.waitForFunction(() => Boolean((window as any).__lwcharts?.dump?.().render?.hasChart === true));
  await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

  // Verify QA API is ready
  const debugCheck = await page.evaluate(() => {
    const lw = (window as any).__lwcharts;
    return {
      hasQaApplyHover: typeof lw?._qaApplyHover === "function",
      hasDump: typeof lw?.dump === "function",
      mockQuery: lw?._DEBUG_mockQuery,
    };
  });
  expect(debugCheck.hasQaApplyHover).toBe(true);
  expect(debugCheck.mockQuery).toBe(true);

  // TEST 1: Apply hover at mid position (base alone, may have compares if loaded)
  const qaResult = await page.evaluate(() => {
    return (window as any).__lwcharts?._qaApplyHover?.({ where: "mid" });
  });

  expect(qaResult).toBeTruthy();
  expect(qaResult.ok).toBe(true);
  expect(qaResult.snapshot).toBeTruthy();

  const snapshot = qaResult.snapshot;
  expect(typeof snapshot.time).toBe("number");
  expect(typeof snapshot.x).toBe("number");
  expect(typeof snapshot.y).toBe("number");

  // TEST 2: Verify OHLC strip is visible
  const ohlcStrip = page.locator('[data-testid="ohlc-strip"]');
  await expect(ohlcStrip).toBeVisible();

  // TEST 3: Verify base OHLC display
  const ohlcDisplay = snapshot.ohlcDisplay;
  expect(ohlcDisplay).toBeTruthy();
  expect(typeof ohlcDisplay.open).toBe("string");
  expect(typeof ohlcDisplay.high).toBe("string");
  expect(typeof ohlcDisplay.low).toBe("string");
  expect(typeof ohlcDisplay.close).toBe("string");
  expect(typeof ohlcDisplay.change).toBe("string");

  // TEST 4: Verify compares structure (may be empty)
  expect(snapshot.compares).toBeTruthy();
  Object.entries(snapshot.compares).forEach(([sym, data]: [string, any]) => {
    if (data) {
      expect(typeof data.priceAtCursor === "number" || data.priceAtCursor === null).toBe(true);
      expect(typeof data.percentAtCursor === "number" || data.percentAtCursor === null).toBe(true);
      expect(typeof data.changeAbs === "number" || data.changeAbs === null).toBe(true);
      expect(typeof data.changePct === "number" || data.changePct === null).toBe(true);
    }
  });

  // TEST 5: Verify compareDisplays structure
  const compareDisplays = snapshot.compareDisplays || {};
  expect(typeof compareDisplays).toBe("object");

  // TEST 6: Verify dump() contains extended compare fields
  const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
  expect(dump).toBeTruthy();
  expect(dump.hover).toBeTruthy();
  expect(dump.hover.active).toBe(true);

  // Verify compares in dump have extended fields
  expect(dump.hover.compares).toBeTruthy();
  Object.entries(dump.hover.compares).forEach(([sym, data]: [string, any]) => {
    if (data) {
      expect("priceAtCursor" in data || "price" in data).toBe(true);
      expect("percentAtCursor" in data || "percent" in data).toBe(true);
      if ("changeAbs" in data) {
        expect(typeof data.changeAbs === "number" || data.changeAbs === null).toBe(true);
      }
      if ("changePct" in data) {
        expect(typeof data.changePct === "number" || data.changePct === null).toBe(true);
      }
    }
  });

  // TEST 7: Verify overlays structure in snapshot
  expect(snapshot.overlayValues).toBeTruthy();
  expect(typeof snapshot.overlayValues === "object").toBe(true);

  // Verify overlays in dump
  if (dump.hover.overlays) {
    expect(typeof dump.hover.overlays === "object").toBe(true);
  }

  // TEST 8: Verify legendLabels exist in dump
  const legendLabels = dump.render?.legendLabels || [];
  expect(Array.isArray(legendLabels)).toBe(true);
  
  // If labels exist, verify they have required structure
  if (legendLabels.length > 0) {
    legendLabels.forEach((label: any) => {
      expect("id" in label).toBe(true);
      expect(typeof label.y).toBe("number");
      expect(typeof label.text).toBe("string");
      expect(typeof label.paneId).toBe("string");
    });

    // If multiple labels, check minimum spacing
    if (legendLabels.length >= 2) {
      const sorted = [...legendLabels].sort((a: any, b: any) => a.y - b.y);
      const minSpacing = 12; // 18px from code, allow 12px minimum tolerance
      for (let i = 1; i < sorted.length; i++) {
        const spacing = Math.abs(sorted[i].y - sorted[i - 1].y);
        expect(spacing).toBeGreaterThanOrEqual(minSpacing);
      }
    }
  }

  // TEST 9: Test hovering at different positions
  const qaResultRight = await page.evaluate(() => {
    return (window as any).__lwcharts?._qaApplyHover?.({ where: "right" });
  });
  expect(qaResultRight.ok).toBe(true);
  expect(qaResultRight.snapshot.time).not.toBe(snapshot.time);

  // TEST 10: Clear hover and verify state
  const clearResult = await page.evaluate(() => {
    return (window as any).__lwcharts?._qaClearHover?.();
  });
  expect(clearResult.ok).toBe(true);

  await expect.poll(
    async () => {
      const h = await page.evaluate(() => (window as any).__lwcharts?.dump?.().hover);
      return h?.active === false;
    },
    { timeout: 5000 },
  ).toBeTruthy();

  // OHLC strip should be hidden
  await expect(ohlcStrip).not.toBeVisible();

  // Capture screenshot
  const surface = page.locator(".chartspro-price").first();
  await surface.screenshot({ path: testInfo.outputPath("multi-hover-trading-view.png") });
});