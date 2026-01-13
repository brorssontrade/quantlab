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

test("ChartsPro CP5 hover + legend sync", async ({ page }, testInfo) => {
  await page.goto("/?mock=1");
  await page.getByRole("tab", { name: /^charts$/i }).click();

  await waitForDump(page, (dump) => dump?.pricePoints > 0 && dump?.timeframe === "1h");
  await addCompare(page, "META.US");
  await addCompare(page, "MSFT.US");

  const zeroHover = await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    api.hoverAt("right");
    return api.dump().hover;
  });

  expect(zeroHover).not.toBeNull();
  expect(Math.abs(zeroHover?.base?.percent ?? 999)).toBeLessThan(0.001);
  expect(Math.abs(zeroHover?.compares?.["META.US"]?.percent ?? 999)).toBeLessThan(0.001);
  expect(Math.abs(zeroHover?.compares?.["MSFT.US"]?.percent ?? 999)).toBeLessThan(0.001);

  const hoverDump = await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    api.hoverAt("mid");
    return api.dump().hover;
  });
  expect(hoverDump).not.toBeNull();
  const baseMid = hoverDump?.base?.percent ?? null;
  const metaMid = hoverDump?.compares?.["META.US"]?.percent ?? null;

  const changeRows = await page.$$eval(".chartspro-data-window__section", (sections) => {
    const change = sections.find(
      (section) => section.querySelector(".chartspro-data-window__title")?.textContent === "Change",
    );
    if (!change) return [];
    return Array.from(change.querySelectorAll(".chartspro-data-window__row")).map((row) => ({
      label: row.querySelector(".chartspro-data-window__label")?.textContent?.trim() ?? "",
      value: row.querySelector(".chartspro-data-window__value")?.textContent?.trim() ?? "",
    }));
  });
  expect(changeRows.length).toBeGreaterThanOrEqual(3);
  expect(changeRows[0]?.label ?? "").toMatch(/AAPL/i);
  const compareLabels = changeRows.slice(1).map((row) => row.label);
  const sortedLabels = [...compareLabels].sort((a, b) => a.localeCompare(b));
  expect(compareLabels).toEqual(sortedLabels);

  const parsePercent = (text: string | undefined) => {
    if (!text) return null;
    const match = text.match(/([+-]\d+\.\d{2})%/);
    return match ? Number(match[1]) : null;
  };

  const baseUi = parsePercent(changeRows[0]?.value);
  expect(baseUi).not.toBeNull();
  expect(Math.abs((baseUi ?? 0) - (hoverDump?.base?.percent ?? 0))).toBeLessThan(0.02);

  const metaUi = parsePercent(changeRows.find((row) => row.label.includes("META.US"))?.value);
  const msftUi = parsePercent(changeRows.find((row) => row.label.includes("MSFT.US"))?.value);
  expect(metaUi).not.toBeNull();
  expect(msftUi).not.toBeNull();
  expect(Math.abs((metaUi ?? 0) - (hoverDump?.compares?.["META.US"]?.percent ?? 0))).toBeLessThan(0.02);
  expect(Math.abs((msftUi ?? 0) - (hoverDump?.compares?.["MSFT.US"]?.percent ?? 0))).toBeLessThan(0.02);

  await page.evaluate(() => (window as any).__lwcharts.set?.({ timeframe: "4h" }));
  await waitForDump(page, (dump) => dump?.timeframe === "4h" && dump?.pricePoints > 0);
  await page.evaluate(() => (window as any).__lwcharts.hoverAt("mid"));
  const shiftedHover = await page.evaluate(() => (window as any).__lwcharts.dump().hover);
  expect(shiftedHover).not.toBeNull();
  expect(Math.abs((shiftedHover?.base?.percent ?? 0) - (baseMid ?? 0))).toBeGreaterThan(0.005);
  expect(Math.abs((shiftedHover?.compares?.["META.US"]?.percent ?? 0) - (metaMid ?? 0))).toBeGreaterThan(0.005);

  const anchorAfter = await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    api.hoverAt("right");
    return api.dump().hover;
  });
  expect(anchorAfter).not.toBeNull();
  expect(Math.abs(anchorAfter?.base?.percent ?? 999)).toBeLessThan(0.001);
  const metaAnchorPercent = anchorAfter?.compares?.["META.US"]?.percent ?? null;
  expect(metaAnchorPercent === null || Math.abs(metaAnchorPercent) < 0.001).toBeTruthy();

  await page.selectOption('[data-testid="compare-META_US-mode"]', "price");
  const priceDump = await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    api.hoverAt("mid");
    return api.dump().hover?.compares?.["META.US"] ?? null;
  });
  expect(priceDump?.percent ?? null).toBeNull();
  expect(priceDump?.price === null || typeof priceDump?.price === "number").toBeTruthy();

  const surface = page.locator(".chartspro-price").first();
  await surface.screenshot({ path: testInfo.outputPath("cp5-hover.png") });
});
