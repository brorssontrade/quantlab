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

test("ChartsPro single-symbol hover + TradingView UI parity", async ({ page }, testInfo) => {
  // Initialize page with mock mode and navigate to ChartsPro
  await page.goto("/?mock=1");
  await page.getByRole("tab", { name: /^charts$/i }).click();

  // Forward page console messages to test output for debugging
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.text().includes("ERROR")) {
      // eslint-disable-next-line no-console
      console.log(`PAGE_CONSOLE[${msg.type()}]: ${msg.text()}`);
    }
  });

  // Wait for chart to be ready with sufficient data
  await waitForDump(page, (dump) => dump?.pricePoints > 0 && dump?.timeframe === "1h");
  await page.waitForFunction(() => Boolean((window as any).__lwcharts?.dump?.().render?.hasChart === true));
  await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().render?.pricePoints > 5);

  // Verify QA primitives are exposed
  const debugCheck = await page.evaluate(() => {
    const lw = (window as any).__lwcharts;
    return {
      hasQaApplyHover: typeof lw?._qaApplyHover === "function",
      hasQaClearHover: typeof lw?._qaClearHover === "function",
      hasQaOpenContextMenu: typeof lw?._qaOpenContextMenu === "function",
      hasDump: typeof lw?.dump === "function",
      mockQuery: lw?._DEBUG_mockQuery,
      exposeQaPrimitives: lw?._DEBUG_exposeQaPrimitives,
    };
  });
  expect(debugCheck.hasQaApplyHover).toBe(true);
  expect(debugCheck.hasQaClearHover).toBe(true);
  expect(debugCheck.hasQaOpenContextMenu).toBe(true);
  expect(debugCheck.mockQuery).toBe(true);
  expect(debugCheck.exposeQaPrimitives).toBe(true);

  // TEST 1: Apply hover at "mid" position
  const qaResultMid = await page.evaluate(() => {
    return (window as any).__lwcharts?._qaApplyHover?.({ where: "mid" });
  });

  expect(qaResultMid).toBeTruthy();
  expect(qaResultMid.ok).toBe(true);
  expect(qaResultMid.snapshot).toBeTruthy();
  expect(qaResultMid.error).toBeNull();

  const snapshotMid = qaResultMid.snapshot;
  expect(typeof snapshotMid.time).toBe("number");
  expect(snapshotMid.time).toBeGreaterThan(0);
  expect(typeof snapshotMid.x).toBe("number");
  expect(typeof snapshotMid.y).toBe("number");
  expect(typeof snapshotMid.timeLabel).toBe("string");
  expect(typeof snapshotMid.priceLabel).toBe("string");

  // Verify base OHLCV in snapshot
  const base = snapshotMid.base;
  expect(base).toBeTruthy();
  expect(typeof base.open).toBe("number");
  expect(typeof base.high).toBe("number");
  expect(typeof base.low).toBe("number");
  expect(typeof base.close).toBe("number");
  expect(typeof base.volume).toBe("number");
  expect(base.volume).toBeGreaterThanOrEqual(0);

  // Verify OHLC display row
  const ohlcDisplay = snapshotMid.ohlcDisplay;
  expect(ohlcDisplay).toBeTruthy();
  expect(ohlcDisplay.symbol).toBeDefined();
  expect(typeof ohlcDisplay.open).toBe("string");
  expect(typeof ohlcDisplay.high).toBe("string");
  expect(typeof ohlcDisplay.low).toBe("string");
  expect(typeof ohlcDisplay.close).toBe("string");
  expect(typeof ohlcDisplay.change).toBe("string");

  // Verify dump() reflects the hover state
  await expect.poll(
    async () => {
      const hover = await page.evaluate(() => (window as any).__lwcharts?.dump?.().hover);
      return hover?.active === true && hover?.time === snapshotMid.time;
    },
    { timeout: 5000 },
  ).toBeTruthy();

  const hoverAfterMid = await page.evaluate(() => (window as any).__lwcharts.dump().hover);
  expect(hoverAfterMid.active).toBe(true);
  expect(hoverAfterMid.time).toBe(snapshotMid.time);
  expect(hoverAfterMid.x).toBe(snapshotMid.x);
  expect(hoverAfterMid.y).toBe(snapshotMid.y);
  expect(hoverAfterMid.timeLabel).toBe(snapshotMid.timeLabel);
  expect(hoverAfterMid.priceLabel).toBe(snapshotMid.priceLabel);
  expect(typeof hoverAfterMid.ohlc.c).toBe("number");
  expect(typeof hoverAfterMid.priceAtCursor).toBe("number");
  expect(hoverAfterMid.volume).toBeGreaterThanOrEqual(0);

  // Verify TradingView UI elements are visible
  const ohlcStrip = page.locator('[data-testid="ohlc-strip"]');
  await expect(ohlcStrip).toBeVisible();

  const timePillMid = page.locator('[data-testid="time-pill"]');
  const pricePillMid = page.locator('[data-testid="price-pill"]');
  await expect(timePillMid).toBeVisible();
  await expect(pricePillMid).toBeVisible();

  // Verify pills contain formatted data matching snapshot
  const timePillText = await timePillMid.textContent();
  expect(timePillText).toBe(snapshotMid.timeLabel);
  const pricePillText = await pricePillMid.textContent();
  expect(pricePillText).toBe(snapshotMid.priceLabel);

  // TEST 2: Apply hover at "right" position (should be different from "mid")
  const qaResultRight = await page.evaluate(() => {
    return (window as any).__lwcharts?._qaApplyHover?.({ where: "right" });
  });

  expect(qaResultRight.ok).toBe(true);
  expect(qaResultRight.snapshot).toBeTruthy();

  const snapshotRight = qaResultRight.snapshot;
  expect(typeof snapshotRight.time).toBe("number");

  // Ensure "right" timeKey is different from "mid"
  const timeMid = snapshotMid.time;
  const timeRight = snapshotRight.time;
  expect(timeRight).not.toBe(timeMid);

  // Verify dump() updated to reflect the new right hover
  await expect.poll(
    async () => {
      const hover = await page.evaluate(() => (window as any).__lwcharts?.dump?.().hover);
      return hover?.active === true && hover?.time === snapshotRight.time;
    },
    { timeout: 5000 },
  ).toBeTruthy();

  // Verify pills updated
  await expect(timePillMid).toContainText(snapshotRight.timeLabel);

  // TEST 3: Context menu via _qaOpenContextMenu QA primitive
  const contextMenuResult = await page.evaluate(() => {
    return (window as any).__lwcharts?._qaOpenContextMenu?.({ where: "mid" });
  });

  expect(contextMenuResult).toBeTruthy();
  expect(contextMenuResult.ok).toBe(true);
  expect(contextMenuResult.contextMenuOpen).toBe(true);

  // Verify context menu is visible
  const contextMenu = page.locator('[data-testid="context-menu"]');
  await expect(contextMenu).toBeVisible();

  // TEST 4: Clear hover via _qaClearHover QA primitive
  const clearResult = await page.evaluate(() => {
    return (window as any).__lwcharts?._qaClearHover?.();
  });

  expect(clearResult).toBeTruthy();
  expect(clearResult.ok).toBe(true);

  // Verify hover is cleared
  await expect.poll(
    async () => {
      const hover = await page.evaluate(() => (window as any).__lwcharts?.dump?.().hover);
      return hover?.active === false;
    },
    { timeout: 5000 },
  ).toBeTruthy();

  // Verify OHLC strip is hidden when hover is cleared
  await expect(ohlcStrip).not.toBeVisible();

  // TEST 5: Apply hover at "left" position (additional positioning test)
  const qaResultLeft = await page.evaluate(() => {
    return (window as any).__lwcharts?._qaApplyHover?.({ where: "left" });
  });

  expect(qaResultLeft.ok).toBe(true);
  expect(qaResultLeft.snapshot).toBeTruthy();
  expect(qaResultLeft.snapshot.time).not.toBe(snapshotMid.time);
  expect(qaResultLeft.snapshot.time).not.toBe(snapshotRight.time);

  // Verify OHLC strip is visible again with new data
  await expect(ohlcStrip).toBeVisible();

  // Capture screenshot for visual debugging
  const surface = page.locator(".chartspro-price").first();
  await surface.screenshot({ path: testInfo.outputPath("hover-trading-view.png") });
});
