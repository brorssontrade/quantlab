import { test, expect, Page, Download } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";

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

async function readDownload(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (stream) {
    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk) => chunks.push(chunk as Buffer));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      stream.on("error", reject);
    });
  }
  const tmpPath = path.join(process.cwd(), ".tmp", download.suggestedFilename());
  await fs.mkdir(path.dirname(tmpPath), { recursive: true });
  await download.saveAs(tmpPath);
  const contents = await fs.readFile(tmpPath, "utf-8");
  await fs.unlink(tmpPath).catch(() => undefined);
  return contents;
}

test("ChartsPro CP6 export + dumpVisible", async ({ page }, testInfo) => {
  await page.goto("/?mock=1");
  await page.getByRole("tab", { name: /^charts$/i }).click();

  await waitForDump(page, (dump) => dump?.pricePoints > 0 && dump?.timeframe === "1h");
  await page.evaluate(() => (window as any).__lwcharts?.set?.({ timeframe: "4h" }));
  await waitForDump(page, (dump) => dump?.timeframe === "4h" && dump?.pricePoints > 0);

  await addCompare(page, "META.US");
  await addCompare(page, "MSFT.US");

  await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    const chart = api?.chart;
    const scale = chart?.timeScale?.();
    const rows = api?.dumpVisible?.() ?? [];
    if (!scale || rows.length < 4) return;
    const start = rows[Math.max(rows.length - 8, 0)]?.time;
    const end = rows[rows.length - 1]?.time;
    if (typeof start === "number" && typeof end === "number") {
      scale.setVisibleRange({ from: start, to: end });
    }
  });

  await page.waitForFunction(() => {
    const api = (window as any).__lwcharts;
    const dump = api?.dump?.();
    const visible = api?.dumpVisible?.() ?? [];
    return dump && visible.length > 0 && visible.length < dump.pricePoints;
  });

  const stats = await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    const dump = api?.dump?.();
    const visible = api?.dumpVisible?.() ?? [];
    return { pricePoints: dump?.pricePoints ?? 0, visibleCount: visible.length };
  });

  expect(stats.visibleCount).toBeGreaterThan(0);
  expect(stats.visibleCount).toBeLessThan(stats.pricePoints);

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("chartspro-export-csv").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);

  const csv = (await readDownload(download)).trim();
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const headerLine = lines.shift() ?? "";
  expect(headerLine).toContain("time,base_open,base_high,base_low,base_close");
  expect(headerLine).toContain("META.US_percent");
  expect(headerLine).toContain("MSFT.US_percent");
  const columns = headerLine.split(",");
  expect(columns).toContain("META.US_percent");
  expect(columns).toContain("MSFT.US_percent");
  const visibleRowCount = await page.evaluate(() => ((window as any).__lwcharts.dumpVisible?.() ?? []).length);
  expect(lines.length).toBe(visibleRowCount);
  const firstRowValues = (lines[0] ?? "").split(",");
  const csvRow = Object.fromEntries(columns.map((column, index) => [column, firstRowValues[index] ?? ""]));
  expect(csvRow["META.US_percent"]).toMatch(/^[+-]\d+\.\d{2}%$/);
  expect(csvRow["MSFT.US_percent"]).toMatch(/^[+-]\d+\.\d{2}%$/);
  const hoverSnapshot = await page.evaluate(() => {
    const api = (window as any).__lwcharts;
    api.hoverAt();
    return api.dump().hover?.compares?.["META.US"] ?? null;
  });
  expect(hoverSnapshot).not.toBeNull();
  expect(
    typeof hoverSnapshot?.price === "number" || hoverSnapshot?.price === null,
  ).toBeTruthy();
  expect(hoverSnapshot).toHaveProperty("percent");

  const pngDataUrl = await page.evaluate(async () => {
    const exporter = (window as any).__lwcharts?.export;
    return (await exporter?.png?.()) ?? null;
  });
  expect(pngDataUrl).toMatch(/^data:image\/png;base64,/);

  await page.evaluate(() => (window as any).__lwcharts?.fit?.());
  const chart = page.locator(".chartspro-root").first();
  await chart.screenshot({ path: testInfo.outputPath("cp6-export.png") });
});
