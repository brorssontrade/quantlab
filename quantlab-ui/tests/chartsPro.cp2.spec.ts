import { test, expect } from "@playwright/test";
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

test.beforeEach(async ({ page }) => {
  // Peka UI:t mot din lokala backend
  await page.addInitScript(() => {
    localStorage.setItem("ql/apiBase", "http://127.0.0.1:8000");
  });

  // Se all info om krascher i konsolen
  page.on("pageerror", (err) =>
    console.log("PAGEERROR:", err.name, err.message, err.stack)
  );
  page.on("console", (msg) => console.log("BROWSER:", msg.type(), msg.text()));
});


test("ChartsPro CP2 smoke (candles + compare overlays)", async ({ page }, testInfo) => {
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

  await page.waitForFunction(() => {
    const lw = (window as any).__lwcharts;
    const dump = lw?.dump?.();
    return dump && dump.pricePoints > 0 && dump.timeframe === "1h";
  });

  const initialHealth = await page.evaluate(() => {
    const dump = (window as any).__lwcharts?.dump?.();
    const canvas = document.querySelector(".chartspro-price canvas") as HTMLCanvasElement | null;
    return {
      render: dump?.render ?? null,
      area: canvas ? canvas.width * canvas.height : 0,
    };
  });
  expect(initialHealth.render?.hasChart).toBeTruthy();
  expect(initialHealth.render?.pricePoints ?? 0).toBeGreaterThan(0);
  expect((initialHealth.render?.bgColor ?? "").toLowerCase()).not.toBe("#000000");
  expect(initialHealth.area).toBeGreaterThan(0);

  const chart = page.locator(".chartspro-root").first();
  await chart.screenshot({ path: testInfo.outputPath("cp2-step-1-base.png") });

  const baseDump = await page.evaluate(() => (window as any).__lwcharts.dump());
  expect(baseDump.symbol).toBe("AAPL.US");
  expect(baseDump.pricePoints).toBeGreaterThan(0);
  expect(baseDump.volumePoints).toBeGreaterThan(0);
  const canvasSnapshotBefore = await page.evaluate(() => (window as any).__lwcharts.dump().render?.canvasWH ?? null);
  expect(canvasSnapshotBefore).not.toBeNull();
  expect((canvasSnapshotBefore?.w ?? 0) * (canvasSnapshotBefore?.h ?? 0)).toBeGreaterThan(0);

  const addViaToolbar = async (symbol: string, mode: string = "percent") => {
    await page.fill('[data-testid="compare-add-symbol"]', symbol);
    await page.selectOption('[data-testid="compare-add-timeframe"]', "1h");
    await page.selectOption('[data-testid="compare-add-mode"]', mode);
    await page.getByTestId("compare-add-submit").click();
  };

  await addViaToolbar("META.US", "percent");

  let lastDump: any = null;
  await page.waitForFunction(() => {
    const dump = (window as any).__lwcharts?.dump?.();
    if (dump) {
      lastDump = dump;
    }
    return dump && dump.data?.comparesReady?.["META.US"] === true;
  });

  await chart.screenshot({ path: testInfo.outputPath("cp2-step-2-meta.png") });

  const compareDump = await page.evaluate(() => (window as any).__lwcharts.dump());
  expect(compareDump.compares["META.US"]).toBeGreaterThan(0);

  await page.waitForFunction(() => {
    const lw = (window as any).__lwcharts;
    return !!lw?.set && typeof lw?._applyPatch === "function";
  });

  await page.evaluate(() => (window as any).__lwcharts.set({ timeframe: "4h" }));
  await page.waitForFunction(() => {
    const dump = (window as any).__lwcharts?.dump?.();
    return dump && dump.timeframe === "4h" && dump.pricePoints > 0 && dump.compares?.["META.US"] > 0;
  });
  await page.waitForTimeout(200);
  await chart.screenshot({ path: testInfo.outputPath("cp2-step-3-4h.png") });

  await addViaToolbar("MSFT.US");
  await addViaToolbar("GOOG.US", "indexed");
  await addViaToolbar("IBM.US", "price");

  await page.waitForFunction(() => {
    const dump = (window as any).__lwcharts?.dump?.();
    return dump && Object.keys(dump.compares ?? {}).length === 4;
  });
  const compareCountBefore = await page.evaluate(
    () => Object.keys((window as any).__lwcharts.dump().compares ?? {}).length,
  );

  await addViaToolbar("TSLA.US");
  await expect(page.getByText("Max 4 compares").first()).toBeVisible();
  const compareCountAfter = await page.evaluate(
    () => Object.keys((window as any).__lwcharts.dump().compares ?? {}).length,
  );
  expect(compareCountAfter).toBe(compareCountBefore);

  await chart.screenshot({ path: testInfo.outputPath("cp2-step-4-guard.png") });

  await page.getByRole("button", { name: /^Light$/i }).click();
  await page.waitForFunction(() => {
    const dump = (window as any).__lwcharts?.dump?.();
    return dump && dump.styles?.theme === "light" && (dump.render?.canvasWH?.w ?? 0) > 0;
  });
  await chart.screenshot({ path: testInfo.outputPath("cp2-light.png") });
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
  const bgRgb = hexToRgb(lightDiagnostics.render?.bgColor ?? "#000000");
  expect((lightDiagnostics.render?.canvasWH?.w ?? 0) * (lightDiagnostics.render?.canvasWH?.h ?? 0)).toBeGreaterThan(0);
  const canvasSnapshotAfter = lightDiagnostics.render?.canvasWH ?? null;
  expect(canvasSnapshotAfter).not.toBeNull();
  expect((canvasSnapshotAfter?.w ?? 0) * (canvasSnapshotAfter?.h ?? 0)).toBeGreaterThan(0);
  expect(canvasSnapshotAfter?.w).toBe(canvasSnapshotBefore?.w);
  expect(canvasSnapshotAfter?.h).toBe(canvasSnapshotBefore?.h);
  expect(lightDiagnostics.sample).not.toBeNull();
  const sample = lightDiagnostics.sample as { r: number; g: number; b: number; a: number };
  expect(sample.a).toBeGreaterThan(0);
  const matchesBg =
    Math.abs(sample.r - bgRgb.r) < 12 && Math.abs(sample.g - bgRgb.g) < 12 && Math.abs(sample.b - bgRgb.b) < 12;
  expect(matchesBg).toBeFalsy();
  const bindingSnapshot = await page.evaluate(() => (window as any).__lwcharts.debug?.dumpBindings?.() ?? null);
  expect(bindingSnapshot).not.toBeNull();
  expect(bindingSnapshot.usesComposite).toBeTruthy();
  expect((bindingSnapshot.canvasWH?.w ?? 0) * (bindingSnapshot.canvasWH?.h ?? 0)).toBeGreaterThan(0);
  expect(bindingSnapshot.canvasWH?.w).toBe(canvasSnapshotAfter?.w);
  expect(bindingSnapshot.canvasWH?.h).toBe(canvasSnapshotAfter?.h);
  const anchorHover = await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    const snapshot = api.hoverAt("anchor");
    return { expected: snapshot?.time ?? null, actual: api.dump().hover?.time ?? null };
  });
  expect(anchorHover.expected).not.toBeNull();
  expect(anchorHover.actual).toBe(anchorHover.expected);
  await page.getByRole("button", { name: /^Dark$/i }).click();
  await page.waitForFunction(() => (window as any).__lwcharts?.dump?.().styles?.theme === "dark");
  expect(unexpectedConsole).toHaveLength(0);
});
