import { test, expect, Page } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

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

async function addCompare(page: Page, symbol: string, mode: string = "percent") {
  await page.fill('[data-testid="compare-add-symbol"]', symbol);
  await page.selectOption('[data-testid="compare-add-timeframe"]', "1h");
  await page.selectOption('[data-testid="compare-add-mode"]', mode);
  await page.getByTestId("compare-add-submit").click();
  await page.waitForFunction(
    (sym) => {
      const dump = (window as any).__lwcharts?.dump?.();
      return dump && dump.data?.comparesReady?.[sym] === true;
    },
    symbol,
  );
}

test("ChartsPro CP7 legend/scale/last-value parity", async ({ page }, testInfo) => {
  await page.goto("/?mock=1");
  await gotoChartsPro(page, testInfo);

  const unexpectedConsole: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    // Ignore lightweight-charts library warnings (width/height related)
    // Ignore third-party attribution warnings
    if (text.includes("width(-1)") || text.includes("height(-1)") || text.includes("AttributionLogoWidget")) {
      return; // Skip recording these - they're from external libraries
    }
    // Record other problematic messages
    if (msg.type() === "error") {
      unexpectedConsole.push(`${msg.type()}: ${text}`);
    }
  });

  await waitForDump(page, (dump) => dump?.render?.pricePoints > 0);

  await addCompare(page, "META.US", "percent");

  await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    const scale = api.chart?.timeScale?.();
    if (scale) {
      scale.scrollToPosition(-60, true);
      scale.scrollToPosition(-60, true);
    }
    api.hoverAt("mid");
  });

  // Trigger hover and wait until hover.percent is available
  await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    api.hoverAt("mid");
  });

  await page.waitForFunction(() => {
    const api = (window as any).__lwcharts;
    const dump = api?.dump?.();
    return dump && dump.hover && Number.isFinite(dump.hover?.base?.percent);
  });

  const percentDump = await page.evaluate(() => (window as any).__lwcharts?.dump?.());

  expect(percentDump.scale?.mode).toBe("percent");
  expect(percentDump.scale?.baseMode).toBe("Normal");
  expect(Array.isArray(percentDump.scale?.ticks)).toBeTruthy();
  expect(percentDump.scale.ticks.some((tick: string) => tick.includes("%"))).toBeTruthy();
  expect(percentDump.scale.ticks.some((tick: string) => tick.includes("0.00%"))).toBeTruthy();
  expect(percentDump.render?.priceScaleModeBase).toBe("Normal");

  const legendBaseEntry = percentDump.legend?.base ?? null;
  const legendCompareEntry = percentDump.legend?.compares?.["META.US"] ?? null;
  expect(legendBaseEntry?.value ?? "").toMatch(/[+-]\d+\.\d{2}%/);
  expect(legendCompareEntry?.value ?? "").toMatch(/[+-]\d+\.\d{2}%/);

  const hoverCompare = percentDump.hover?.compares?.["META.US"]?.percent ?? NaN;
  await page.waitForFunction(
    (expected) => {
      const sections = Array.from(document.querySelectorAll(".chartspro-data-window__section"));
      const change = sections.find(
        (section) => section.querySelector(".chartspro-data-window__title")?.textContent === "Change",
      );
      if (!change) return false;
      const row = Array.from(change.querySelectorAll(".chartspro-data-window__row")).find((r) =>
        /META\.US/i.test(r.querySelector(".chartspro-data-window__label")?.textContent ?? ""),
      );
      if (!row) return false;
      const valueText = row.querySelector(".chartspro-data-window__value")?.textContent ?? "";
      const valueNum = Number.parseFloat(valueText.replace("%", ""));
      return Number.isFinite(valueNum) && Number.isFinite(expected) && Math.abs(valueNum - (expected as number)) < 0.01;
    },
    hoverCompare,
  );

  const uiChange = await page.$$eval(".chartspro-data-window__section", (sections) => {
    const change = sections.find(
      (section) => section.querySelector(".chartspro-data-window__title")?.textContent === "Change",
    );
    if (!change) return [];
    return Array.from(change.querySelectorAll(".chartspro-data-window__row")).map((row) => ({
      label: row.querySelector(".chartspro-data-window__label")?.textContent?.trim() ?? "",
      value: row.querySelector(".chartspro-data-window__value")?.textContent?.trim() ?? "",
    }));
  });
  const uiBase = uiChange.find((row) => row.label.trim() === "AAPL.US");
  const uiCompare = uiChange.find((row) => /META\.US/i.test(row.label ?? ""));
  expect(uiBase?.value).toMatch(/[+-]\d+\.\d{2}%/);
  expect(uiCompare?.value).toMatch(/[+-]\d+\.\d{2}%/);

  const legendBaseValue = legendBaseEntry?.value ? parseFloat(legendBaseEntry.value.replace("%", "")) : NaN;
  const hoverBase = percentDump.hover?.base?.percent ?? NaN;
  expect(Math.abs(legendBaseValue - hoverBase)).toBeLessThan(0.05);

  const legendCompareValue = legendCompareEntry?.value ? parseFloat(legendCompareEntry.value.replace("%", "")) : NaN;
  expect(Math.abs(legendCompareValue - hoverCompare)).toBeLessThan(0.30);

  const lastPercent = percentDump.last?.compares?.["META.US"]?.pct ?? null;
  expect(lastPercent).toMatch(/[+-]\d+\.\d{2}%/);
  const uiCompareValue = uiCompare?.value ? parseFloat(uiCompare.value.replace("%", "")) : NaN;
  expect(Math.abs(uiCompareValue - hoverCompare)).toBeLessThan(0.30);

  expect(percentDump.scale?.zeroLine?.visible).toBeTruthy();
  expect(percentDump.scale?.zeroLine?.value).toBe(0);
  expect(percentDump.render?.bgColor?.toLowerCase()).not.toBe("#000000");
  expect((percentDump.render?.canvasW ?? 0) * (percentDump.render?.canvasH ?? 0)).toBeGreaterThan(0);
  expect((percentDump.render?.canvasWH?.w ?? 0) * (percentDump.render?.canvasWH?.h ?? 0)).toBeGreaterThan(0);

  const firstHover = await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    const snapshot = api.hoverAt("first");
    return { expected: snapshot?.time ?? null, actual: api.dump().hover?.time ?? null };
  });
  expect(firstHover.expected).not.toBeNull();
  expect(firstHover.actual).toBe(firstHover.expected);
  const anchorHover = await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    const snapshot = api.hoverAt("anchor");
    return { expected: snapshot?.time ?? null, actual: api.dump().hover?.time ?? null };
  });
  expect(anchorHover.expected).not.toBeNull();
  expect(anchorHover.actual).toBe(anchorHover.expected);
  const lastHover = await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    const snapshot = api.hoverAt("last");
    return { expected: snapshot?.time ?? null, actual: api.dump().hover?.time ?? null };
  });
  expect(lastHover.expected).not.toBeNull();
  expect(lastHover.actual).toBe(lastHover.expected);
  const pointerAliasResults = await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    api.hoverAt("left");
    const left = api.dump().hover?.time ?? null;
    api.hoverAt("center");
    const center = api.dump().hover?.time ?? null;
    api.hoverAt("right");
    const right = api.dump().hover?.time ?? null;
    api.hoverAt(42);
    const manual = api.dump().hover?.time ?? null;
    return { left, center, right, manual };
  });
  Object.values(pointerAliasResults).forEach((value) => expect(value).not.toBeNull());
  const rightHover = await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    api.hoverAt("right");
    return api.dump().hover;
  });
  expect(rightHover).not.toBeNull();

  await page.selectOption('[data-testid="compare-meta-us-mode"]', "price");
  await page.evaluate(() => (window as any).__lwcharts.hoverAt("mid"));

  const priceDump = await page.evaluate(() => (window as any).__lwcharts.dump());

  expect(priceDump.scale?.mode).toBe("price");
  expect(priceDump.scale?.baseMode).toBe("Normal");
  expect((priceDump.scale?.ticks ?? []).some((tick: string) => tick.includes("%"))).toBeFalsy();
  expect(priceDump.scale?.zeroLine?.visible).toBeFalsy();
  expect(priceDump.legend?.compares?.["META.US"]?.value ?? "").not.toMatch(/%/);
  expect(priceDump.render?.priceScaleModeBase).toBe("Normal");
  expect((priceDump.render?.canvasWH?.w ?? 0) * (priceDump.render?.canvasWH?.h ?? 0)).toBeGreaterThan(0);

  const lastPriceEntry = priceDump.last?.compares?.["META.US"];
  expect(lastPriceEntry?.pct).toBeNull();
  expect(typeof lastPriceEntry?.price).toBe("number");

  const canvasStats = await page.evaluate(() => {
    const canvas = document.querySelector(".chartspro-price canvas") as HTMLCanvasElement | null;
    return canvas ? canvas.width * canvas.height : 0;
  });
  expect(canvasStats).toBeGreaterThan(0);

  const surface = page.locator(".chartspro-price").first();
  await surface.screenshot({ path: testInfo.outputPath("cp7-price.png") });
  const bindingSnapshot = await page.evaluate(() => (window as any).__lwcharts.debug?.dumpBindings?.() ?? null);
  expect(bindingSnapshot).not.toBeNull();
  expect(bindingSnapshot.usesComposite).toBeTruthy();
  expect(unexpectedConsole).toHaveLength(0);
});
