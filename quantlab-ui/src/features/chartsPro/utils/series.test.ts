import { describe, expect, it } from "vitest";

import { normalizeRows, type RawOhlcvRow } from "../types";
import { alignAndTransform, describeBarBounds, lwTimeFromNormalized, normalizeCompareMode } from "./series";

const BASE_TIMES = [
  "2024-01-02T10:00:00Z",
  "2024-01-02T11:00:00Z",
  "2024-01-02T12:00:00Z",
];

function buildRows(symbol: string, closes: number[]): RawOhlcvRow[] {
  return closes.map((close, idx) => ({
    t: BASE_TIMES[idx],
    o: close - 0.5,
    h: close + 0.75,
    l: close - 0.75,
    c: close,
    v: 1_000 + idx * 50,
    symbol,
  }));
}

describe("chartsPro utils / series", () => {
  it("converts ISO/epoch seconds/millis to LW timestamps", () => {
    const rows: RawOhlcvRow[] = [
      { t: "2024-01-02T10:00:00Z", o: 100, h: 101, l: 99, c: 100, v: 900 },
      { ts: Date.UTC(2024, 0, 2, 11, 0, 0), o: 101, h: 102, l: 100, c: 101, v: 950 },
      { time: Math.floor(Date.UTC(2024, 0, 2, 12, 0, 0) / 1000), o: 102, h: 103, l: 101, c: 102, v: 975 },
    ];
    const normalized = normalizeRows(rows);
    expect(normalized).toHaveLength(3);
    const lwTimes = normalized.map((bar) => lwTimeFromNormalized(bar));
    expect(lwTimes).toEqual([
      Date.UTC(2024, 0, 2, 10) / 1000,
      Date.UTC(2024, 0, 2, 11) / 1000,
      Date.UTC(2024, 0, 2, 12) / 1000,
    ]);
  });

  it("aligns compare rows and reports overlap bounds", () => {
    const base = normalizeRows(buildRows("AAPL.US", [180, 181, 182]));
    const cmp = normalizeRows(buildRows("META.US", [300, 303, 306]));

    const { series } = alignAndTransform(base, cmp, "percent");
    expect(series).toHaveLength(3);
    expect(series[0].value).toBe(0);
    const lastValue = series[series.length - 1]?.value ?? 0;
    expect(lastValue).toBeCloseTo(((306 / 300) - 1) * 100);

    const bounds = describeBarBounds(base);
    expect(bounds.count).toBe(3);
    expect(bounds.minTime).toBe(Date.UTC(2024, 0, 2, 10) / 1000);
    expect(bounds.maxTime).toBe(Date.UTC(2024, 0, 2, 12) / 1000);
  });

  it("normalizes compare modes including overlay alias", () => {
    expect(normalizeCompareMode("overlay")).toBe("percent");
    expect(normalizeCompareMode("Indexed")).toBe("indexed");
    expect(normalizeCompareMode("PRICE")).toBe("price");
    expect(normalizeCompareMode("1h")).toBeNull();
    expect(normalizeCompareMode(undefined)).toBeNull();
  });
});
