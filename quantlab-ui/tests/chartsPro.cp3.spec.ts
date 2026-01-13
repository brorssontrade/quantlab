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

test("ChartsPro CP3 toolbar + persistence", async ({ page }, testInfo) => {
  await page.goto("/?mock=1&debug=1");
  await page.evaluate(() => window.localStorage?.clear());
  await page.reload();
  await page.getByRole("tab", { name: /^charts$/i }).click();

  await waitForDump(page, (dump) => dump?.symbol === "AAPL.US" && dump?.pricePoints > 0);
  const renderHealth = await page.evaluate(() => {
    const dump = (window as any).__lwcharts?.dump?.();
    const canvas = document.querySelector(".chartspro-price canvas") as HTMLCanvasElement | null;
    return {
      render: dump?.render ?? null,
      area: canvas ? canvas.width * canvas.height : 0,
    };
  });
  expect(renderHealth.render?.hasChart).toBeTruthy();
  expect(renderHealth.render?.pricePoints ?? 0).toBeGreaterThan(0);
  expect((renderHealth.render?.bgColor ?? "").toLowerCase()).not.toBe("#000000");
  expect(renderHealth.area).toBeGreaterThan(0);
  const chart = page.locator(".chartspro-root").first();

  // Add META via toolbar with overlay mode.
  await page.fill('[data-testid="compare-add-symbol"]', "META.US");
  await page.selectOption('[data-testid="compare-add-timeframe"]', "1h");
  await page.selectOption('[data-testid="compare-add-mode"]', "percent");
  await page.getByTestId("compare-add-submit").click();

  await waitForDump(page, (dump) => dump?.compares?.["META.US"] > 0);

  const persistedSymbols = await page.evaluate(() => {
    const raw = window.localStorage.getItem("cp.compares");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.items) ? parsed.items.map((item: any) => item.symbol) : null;
    } catch {
      return null;
    }
  });
  expect(persistedSymbols).not.toBeNull();
  expect(persistedSymbols).toContain("META.US");

  const persistedTf = await page.evaluate(() => window.localStorage.getItem("cp.timeframe"));
  expect(persistedTf).toBe("1h");

  await chart.screenshot({ path: testInfo.outputPath("cp3-step-1-meta.png") });

  // Change mode via toolbar select.
  await page.selectOption('[data-testid="compare-META_US-mode"]', "indexed");

  // Switch timeframe via helper and ensure compare reloaded.
  await page.evaluate(() => (window as any).__lwcharts.set({ timeframe: "4h" }));
  await waitForDump(page, (dump) => dump?.timeframe === "4h" && dump?.compares?.["META.US"] > 0);
  await chart.screenshot({ path: testInfo.outputPath("cp3-step-2-4h.png") });

  // Reload and confirm persistence.
  await page.reload();
  await page.getByRole("tab", { name: /^charts$/i }).click();
  await waitForDump(page, (dump) => dump?.timeframe === "4h" && dump?.compares?.["META.US"] > 0);
  await chart.screenshot({ path: testInfo.outputPath("cp3-step-3-reload.png") });

  const addSymbol = async (symbol: string, options?: { guard?: boolean; expectedCount?: number }) => {
    await page.fill('[data-testid="compare-add-symbol"]', symbol);
    await page.getByTestId("compare-add-submit").click();
    if (options?.guard) {
      await expect(page.getByText(/Max 4 compares/i).first()).toBeVisible();
      return;
    }
    await waitForDump(page, (dump) => dump?.compares?.[symbol] > 0 || Object.keys(dump?.compares ?? {}).includes(symbol));
    if (typeof options?.expectedCount === "number") {
      await page.waitForFunction(
        (count) => {
          const api = (window as any).__lwcharts?.compare;
          return api && typeof api.list === "function" && api.list().length === count;
        },
        options.expectedCount,
      );
    }
  };

  const getCompareCount = async () => {
    return page.evaluate(() => {
      const api = (window as any).__lwcharts?.compare;
      return api?.list?.().length ?? 0;
    });
  };

  let expectedCount = await getCompareCount();
  await addSymbol("MSFT.US", { expectedCount: ++expectedCount });
  await addSymbol("GOOG.US", { expectedCount: ++expectedCount });
  await addSymbol("IBM.US", { expectedCount: ++expectedCount });
  const compareCountBefore = await getCompareCount();
  await addSymbol("TSLA.US", { guard: true });
  const compareCountAfter = await getCompareCount();
  expect(compareCountAfter).toBe(compareCountBefore);
  await chart.screenshot({ path: testInfo.outputPath("cp3-step-4-guard.png") });
});
