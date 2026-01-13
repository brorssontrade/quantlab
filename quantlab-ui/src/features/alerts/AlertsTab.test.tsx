import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AlertsTab from "@/features/alerts/AlertsTab";

vi.mock("@/lib/lightweightCharts", () => {
  const noop = () => undefined;
  const priceScale = { width: noop };
  const timeScale = () => ({ coordinateToTime: () => Date.now() / 1000, timeToCoordinate: () => 100, fitContent: noop });
  const mockSeries = { setData: noop, priceToCoordinate: () => 100 };
  const chart = {
    addCandlestickSeries: () => mockSeries,
    addHistogramSeries: () => ({ setData: noop }),
    addLineSeries: () => ({ setData: noop }),
    removeSeries: noop,
    layout: noop,
    priceScale,
    timeScale,
    applyOptions: noop,
    remove: noop,
  };
  return { createChart: () => chart, LineStyle: { Dotted: 0 }, ColorType: { Solid: "solid" } };
});

declare global {
  // eslint-disable-next-line no-var
  var ResizeObserver: typeof ResizeObserver;
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalResizeObserver = globalThis.ResizeObserver;
const originalMutationObserver = globalThis.MutationObserver;

const symbolsResponse = [{ code: "AAPL.US", name: "Apple" }];
const candlesResponse = {
  rows: [
    { t: "2024-01-01T00:00:00Z", o: 100, h: 105, l: 99, c: 102, v: 1000 },
    { t: "2024-01-02T00:00:00Z", o: 102, h: 108, l: 101, c: 106, v: 1200 },
  ],
  meta: {
    symbol: "AAPL.US",
    bar: "D",
    source: "mock",
    fallback: false,
    tz: "UTC",
  },
};

beforeEach(() => {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockResizeObserver;

  class MockMutationObserver {
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  globalThis.MutationObserver = MockMutationObserver;

  const ctx = {
    canvas: document.createElement("canvas"),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    writable: true,
    value: vi.fn(() => ctx),
  });

  vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/meta/symbols")) {
      return Promise.resolve(new Response(JSON.stringify(symbolsResponse), { status: 200 }));
    }
    if (url.includes("/chart/ohlcv")) {
      return Promise.resolve(new Response(JSON.stringify(candlesResponse), { status: 200 }));
    }
    if (url.includes("/alerts/logs")) {
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    }
    if (url.match(/\/alerts\?.*/)) {
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    }
    if (url.endsWith("/alerts")) {
      return Promise.resolve(new Response(JSON.stringify({ ok: true, id: 1 }), { status: 200 }));
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalResizeObserver) {
    globalThis.ResizeObserver = originalResizeObserver;
  } else {
    Reflect.deleteProperty(globalThis, "ResizeObserver");
  }
  if (originalMutationObserver) {
    globalThis.MutationObserver = originalMutationObserver;
  } else {
    Reflect.deleteProperty(globalThis, "MutationObserver");
  }
  if (originalGetContext) {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  } else {
    Reflect.deleteProperty(HTMLCanvasElement.prototype, "getContext");
  }
});

describe("AlertsTab", () => {
  it("opens modal and submits alert", async () => {
    render(<AlertsTab apiBase="http://localhost" />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost/meta/symbols"));
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost/chart/ohlcv?symbol=AAPL.US&bar=D&limit=1500"),
    );
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost/alerts?symbol=AAPL.US&bar=D&limit=200"),
    );
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost/alerts/logs?symbol=AAPL.US&bar=D&limit=100"),
    );

    const rangeInput = screen.getByLabelText(/from \(local time\)/i);
    fireEvent.change(rangeInput, { target: { value: "2024-01-01T00:00" } });

    const applyButton = screen.getByRole("button", { name: /apply/i });
    fireEvent.click(applyButton);

    const expectedStart = encodeURIComponent(new Date("2024-01-01T00:00").toISOString());
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `http://localhost/chart/ohlcv?symbol=AAPL.US&bar=D&limit=1500&start=${expectedStart}`,
      ),
    );

    const quickButton = await screen.findByRole("button", { name: /new horizontal alert/i });
    fireEvent.click(quickButton);

    await screen.findByText(/create alert/i);

    const saveButton = screen.getByRole("button", { name: /save alert/i });
    fireEvent.click(saveButton);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost/alerts", expect.objectContaining({ method: "POST" })));
  });
});
