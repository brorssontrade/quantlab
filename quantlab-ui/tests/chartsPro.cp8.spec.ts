import { test, expect, Page } from "@playwright/test";
import { gotoChartsPro } from "./helpers";

function hexToRgb(color: string) {
  const normalized = (color ?? "").replace("#", "").trim();
  if (!normalized) return { r: 0, g: 0, b: 0 };
  const expanded = normalized.length === 3 ? normalized.split("").map((ch) => ch + ch).join("") : normalized;
  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

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
      return dump && typeof dump.compares?.[sym] === "number";
    },
    symbol,
  );
}

test("ChartsPro CP8 visual parity & layout persistence", async ({ page }, testInfo) => {
  await page.goto("/?mock=1");
  await gotoChartsPro(page, testInfo);

  const unexpectedConsole: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("width(-1)") || text.includes("AttributionLogoWidget")) {
      unexpectedConsole.push(`${msg.type()}: ${text}`);
    }
  });

  await waitForDump(page, (dump) => dump?.render?.pricePoints > 0);

  await addCompare(page, "META.US");
  await addCompare(page, "GOOG.US");
  await page.getByTestId("overlay-toggle-sma-20").click();
  await page.getByTestId("overlay-toggle-ema-12").click();

  await page.evaluate(() => (window as any).__lwcharts.hoverAt("mid"));
  const hoverDump = await page.evaluate(() => (window as any).__lwcharts.dump().hover);
  expect(hoverDump).not.toBeNull();
  const beforeThemeCanvas = await page.evaluate(() => (window as any).__lwcharts.dump().render?.canvasWH ?? null);
  expect(beforeThemeCanvas).not.toBeNull();
  expect((beforeThemeCanvas?.w ?? 0) * (beforeThemeCanvas?.h ?? 0)).toBeGreaterThan(0);

  const surface = page.locator(".chartspro-price").first();
  await surface.screenshot({ path: testInfo.outputPath("cp8-dark.png") });

  await page.getByRole("button", { name: /^Light$/i }).click();
  await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().styles?.theme === "light");
  const canvasArea = await page.evaluate(() => {
    const canvas = document.querySelector(".chartspro-price canvas") as HTMLCanvasElement | null;
    return canvas ? canvas.width * canvas.height : 0;
  });
  expect(canvasArea).toBeGreaterThan(0);
  const lightRender = await page.evaluate(() => (window as any).__lwcharts.dump().render);
  expect((lightRender?.bgColor ?? "").toLowerCase()).not.toBe("#000000");
  expect((lightRender?.canvasWH?.w ?? 0) * (lightRender?.canvasWH?.h ?? 0)).toBeGreaterThan(0);
  const lightDiagnostics = await page.evaluate(async () => {
    const dump = (window as any).__lwcharts.dump();
    return {
      render: dump.render ?? {},
      sample: (await (window as any).__lwcharts.samplePixel?.()) ?? null,
    };
  });
  expect(
    (lightDiagnostics.render?.candlePalette?.up ?? "").toLowerCase(),
  ).not.toBe((lightDiagnostics.render?.bgColor ?? "").toLowerCase());
  expect(
    (lightDiagnostics.render?.candlePalette?.down ?? "").toLowerCase(),
  ).not.toBe((lightDiagnostics.render?.bgColor ?? "").toLowerCase());
  const lightBgRgb = hexToRgb(lightDiagnostics.render?.bgColor ?? "#000000");
  expect(lightDiagnostics.sample).not.toBeNull();
  const lightSample = lightDiagnostics.sample as { r: number; g: number; b: number; a: number };
  expect(lightSample.a).toBeGreaterThan(0);
  const sampleMatchesBg =
    Math.abs(lightSample.r - lightBgRgb.r) < 12 &&
    Math.abs(lightSample.g - lightBgRgb.g) < 12 &&
    Math.abs(lightSample.b - lightBgRgb.b) < 12;
  expect(sampleMatchesBg).toBeFalsy();
  const lightBindings = await page.evaluate(() => (window as any).__lwcharts.debug?.dumpBindings?.() ?? null);
  expect(lightBindings).not.toBeNull();
  expect(lightBindings.usesComposite).toBeTruthy();
  const afterThemeCanvas = lightDiagnostics.render?.canvasWH ?? null;
  expect(afterThemeCanvas).not.toBeNull();
  expect((afterThemeCanvas?.w ?? 0) * (afterThemeCanvas?.h ?? 0)).toBeGreaterThan(0);
  expect(afterThemeCanvas?.w).toBe(beforeThemeCanvas?.w);
  expect(afterThemeCanvas?.h).toBe(beforeThemeCanvas?.h);
  expect(lightBindings.canvasWH?.w).toBe(afterThemeCanvas?.w);
  expect(lightBindings.canvasWH?.h).toBe(afterThemeCanvas?.h);
  await surface.screenshot({ path: testInfo.outputPath("cp8-light.png") });
  await page.waitForFunction(() => typeof (window as any).__lwcharts.dump().render?.barSpacing === "number");
  const barSpacingBefore = await page.evaluate(() => (window as any).__lwcharts.dump().render?.barSpacing ?? null);
  const zoomResult = await page.evaluate(() => (window as any).__lwcharts.debug?.zoom?.(8) ?? false);
  expect(zoomResult).toBeTruthy();
  await page.waitForFunction(
    (before) => {
      const next = (window as any).__lwcharts.dump().render?.barSpacing ?? null;
      if (typeof next !== "number") return false;
      if (typeof before === "number") return next !== before;
      return next > 0;
    },
    barSpacingBefore,
  );
  const barSpacingAfter = await page.evaluate(() => (window as any).__lwcharts.dump().render?.barSpacing ?? null);
  expect(typeof barSpacingAfter).toBe("number");
  expect((barSpacingAfter as number)).toBeGreaterThan((barSpacingBefore as number) ?? 0);
  expect(barSpacingAfter as number).toBeGreaterThanOrEqual(2);
  expect(barSpacingAfter as number).toBeLessThanOrEqual(80);
  const scrollBefore = await page.evaluate(() => (window as any).__lwcharts.dump().render?.scrollPosition ?? null);
  const panResult = await page.evaluate(() => (window as any).__lwcharts.debug?.pan?.(20, 0) ?? false);
  expect(panResult).toBeTruthy();
  await page.waitForFunction(
    (before) => {
      const next = (window as any).__lwcharts.dump().render?.scrollPosition ?? null;
      return typeof next === "number" && next !== before;
    },
    scrollBefore,
  );

  const wickRatio = await page.evaluate(() => {
    const rows = (window as any).__lwcharts.dumpVisible?.() ?? [];
    if (!rows.length) return null;
    const last = rows[rows.length - 1] as any;
    const range = Number(last.base_high) - Number(last.base_low);
    const body = Math.max(0.0001, Math.abs(Number(last.base_close) - Number(last.base_open)));
    return range / body;
  });
  expect(typeof wickRatio).toBe("number");
  expect(wickRatio ?? 0).toBeGreaterThan(1);

  const legendSymbols = await page.evaluate(() =>
    (() => {
      const api = (window as any).__lwcharts;
      api.hoverAt("mid");
      return Object.keys(api.dump().legend?.compares ?? {});
    })(),
  );
  expect(legendSymbols).toEqual(expect.arrayContaining(["META.US", "GOOG.US"]));

  await page.fill("#charts-pro-symbol", "MSFT.US");
  await page.getByRole("button", { name: /^4h$/i }).click();
  await page.selectOption('[data-testid="compare-meta-us-mode"]', "price");

  await page.reload();
  const chartsTab = page.getByRole("tab", { name: /^charts$/i });
  if ((await chartsTab.count()) > 0) {
    await chartsTab.click();
  }
  await waitForDump(
    page,
    (dump) =>
      dump?.render?.pricePoints > 0 &&
      typeof dump?.compares?.["META.US"] === "number" &&
      typeof dump.compares?.["GOOG.US"] === "number" &&
      dump.compares["META.US"] > 0 &&
      dump.compares["GOOG.US"] > 0,
  );
  await page.evaluate(() => (window as any).__lwcharts.hoverAt("mid"));
  const persistedDump = await page.evaluate(() => (window as any).__lwcharts.dump());
  expect(persistedDump.symbol).toBe("MSFT.US");
  expect(persistedDump.timeframe).toBe("4h");
  expect(persistedDump.styles?.theme).toBe("light");
  const compareList = await page.evaluate(
    () => ((window as any).__lwcharts?.compare?.list?.() as Array<{ symbol: string }> | undefined) ?? [],
  );
  expect(compareList.map((item) => item.symbol)).toEqual(expect.arrayContaining(["META.US", "GOOG.US"]));
  expect(persistedDump.overlays?.sma ?? []).toContain(20);
  expect(persistedDump.overlays?.ema ?? []).toContain(12);
  expect(persistedDump.scale?.baseMode).toBe("Normal");
  expect(persistedDump.render?.priceScaleModeBase).toBe("Normal");
  const persistedLightDiagnostics = await page.evaluate(async () => {
    const dump = (window as any).__lwcharts.dump();
    return {
      render: dump.render ?? {},
      sample: (await (window as any).__lwcharts.samplePixel?.()) ?? null,
    };
  });
  const persistedBg = hexToRgb(persistedLightDiagnostics.render?.bgColor ?? "#000000");
  expect((persistedLightDiagnostics.render?.canvasWH?.w ?? 0) * (persistedLightDiagnostics.render?.canvasWH?.h ?? 0)).toBeGreaterThan(0);
  expect(persistedLightDiagnostics.sample).not.toBeNull();
  const persistedSample = persistedLightDiagnostics.sample as { r: number; g: number; b: number; a: number };
  expect(persistedSample.a).toBeGreaterThan(0);
  expect(
    (persistedLightDiagnostics.render?.candlePalette?.up ?? "").toLowerCase(),
  ).not.toBe((persistedLightDiagnostics.render?.bgColor ?? "").toLowerCase());
  const persistedMatchesBg =
    Math.abs(persistedSample.r - persistedBg.r) < 12 &&
    Math.abs(persistedSample.g - persistedBg.g) < 12 &&
    Math.abs(persistedSample.b - persistedBg.b) < 12;
  expect(persistedMatchesBg).toBeFalsy();
  const persistedBindings = await page.evaluate(() => (window as any).__lwcharts.debug?.dumpBindings?.() ?? null);
  expect(persistedBindings).not.toBeNull();
  expect(persistedBindings.usesComposite).toBeTruthy();
  const persistedAnchorHover = await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    const snapshot = api.hoverAt("anchor");
    return { expected: snapshot?.time ?? null, actual: api.dump().hover?.time ?? null };
  });
  expect(persistedAnchorHover.expected).not.toBeNull();
  expect(persistedAnchorHover.actual).toBe(persistedAnchorHover.expected);
  expect(unexpectedConsole).toHaveLength(0);
});
