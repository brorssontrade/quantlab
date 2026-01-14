import { test, expect } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

test("ChartsPro QA contract exposes set/dump/_applyPatch", async ({ page }, testInfo) => {
  await page.goto("/?mock=1");
  await gotoChartsPro(page, testInfo);

  await page.waitForFunction(() => {
    const lw = (window as any).__lwcharts;
    return !!lw?.set && typeof lw?.dump === "function";
  });

  await page.waitForFunction(() => {
    const lw = (window as any).__lwcharts;
    return typeof lw?._applyPatch === "function";
  });

  await page.evaluate(() => (window as any).__lwcharts.set({ timeframe: "4h" }));
  await page.waitForFunction(() => (window as any).__lwcharts?.dump?.()?.timeframe === "4h");
  await page.waitForFunction(() => Boolean((window as any).__lwcharts?.dump?.()?.render?.hasChart));

  const dump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());
  expect(dump).toBeTruthy();
  expect(dump.timeframe).toBe("4h");
  expect(dump.render?.canvasWH?.w ?? 0).toBeGreaterThan(0);
  expect(dump.render?.canvasWH?.h ?? 0).toBeGreaterThan(0);
  const layoutCanvas = dump.render?.layout?.canvasWH ?? dump.render?.canvasWH ?? { w: 0, h: 0 };
  expect(layoutCanvas.w ?? 0).toBeGreaterThan(0);
  expect(layoutCanvas.h ?? 0).toBeGreaterThan(0);
  expect(Array.isArray(dump.render?.layout?.panes)).toBeTruthy();
  expect(dump.render?.layout?.panes?.some?.((p: any) => p?.id === "price")).toBeTruthy();
  expect(typeof dump.scale?.baseMode).toBe("string");
  expect(typeof dump.render?.barSpacing === "number").toBeTruthy();
  expect(dump.render?.visibleRange?.from).not.toBeUndefined();

  await page.waitForFunction(
    () => typeof (window as any).__lwcharts?.debug?.zoom === "function" && typeof (window as any).__lwcharts?.debug?.pan === "function",
  );
  const debugSnapshot = await page.evaluate(() => ({
    zoom: typeof (window as any).__lwcharts?.debug?.zoom,
    pan: typeof (window as any).__lwcharts?.debug?.pan,
    keys: Object.keys((window as any).__lwcharts?.debug ?? {}),
  }));
  expect(debugSnapshot.zoom).toBe("function");
  expect(debugSnapshot.pan).toBe("function");

  // Non-mock route should not expose QA debug helpers
  const otherPage = await page.context().newPage();
  await otherPage.goto("/");
  const nonMockDebug = await otherPage.evaluate(() => (window as any).__lwcharts?.debug ?? null);
  expect(nonMockDebug?.zoom).toBeUndefined();
  expect(nonMockDebug?.pan).toBeUndefined();
  await otherPage.close();
});
