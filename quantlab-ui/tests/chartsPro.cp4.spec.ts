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

test("ChartsPro CP4 overlays toggles", async ({ page }, testInfo) => {
  await page.goto("/?mock=1");
  await page.getByRole("tab", { name: /^charts$/i }).click();

  await waitForDump(page, (dump) => dump?.pricePoints > 0 && dump?.timeframe === "1h");
  const chart = page.locator(".chartspro-root").first();

  await page.getByTestId("overlay-toggle-sma-20").click();
  await page.getByTestId("overlay-toggle-ema-12").click();

  await waitForDump(
    page,
    (dump) =>
      Array.isArray(dump?.overlays?.sma) &&
      dump.overlays.sma.includes(20) &&
      Array.isArray(dump?.overlays?.ema) &&
      dump.overlays.ema.includes(12),
  );

  await chart.screenshot({ path: testInfo.outputPath("cp4-step-1-overlays.png") });
});
