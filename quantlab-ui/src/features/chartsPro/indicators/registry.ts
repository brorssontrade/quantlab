import type { UTCTimestamp } from "@/lib/lightweightCharts";

import type {
  IndicatorInstance,
  IndicatorKind,
  IndicatorPane,
  NormalizedBar,
  Tf,
} from "../types";

export interface IndicatorLineResult {
  id: string;
  label: string;
  pane: IndicatorPane;
  values: Array<{ time: UTCTimestamp; value: number }>;
  color?: string;
  style?: "line" | "histogram";
  lineWidth?: number;
}

export interface IndicatorWorkerResponse {
  id: string;
  kind: IndicatorKind;
  lines: IndicatorLineResult[];
  error?: string;
}

interface ComputeOptions {
  indicator: IndicatorInstance;
  data: NormalizedBar[];
  timeframe: Tf;
}

export function computeIndicator({ indicator, data }: ComputeOptions): IndicatorWorkerResponse {
  switch (indicator.kind) {
    case "sma":
      return {
        id: indicator.id,
        kind: indicator.kind,
        lines: [
          {
            id: "sma",
            label: `${indicator.kind.toUpperCase()}(${(indicator.params as { period: number }).period})`,
            pane: indicator.pane,
            color: indicator.color,
            values: toLineData(sma(data, (indicator.params as { period: number }).period)),
          },
        ],
      };
    case "ema":
      return {
        id: indicator.id,
        kind: indicator.kind,
        lines: [
          {
            id: "ema",
            label: `${indicator.kind.toUpperCase()}(${(indicator.params as { period: number }).period})`,
            pane: indicator.pane,
            color: indicator.color,
            values: toLineData(emaFromBars(data, (indicator.params as { period: number }).period)),
          },
        ],
      };
    case "rsi":
      return {
        id: indicator.id,
        kind: indicator.kind,
        lines: [
          {
            id: "rsi",
            label: `RSI(${(indicator.params as { period: number }).period})`,
            pane: "separate",
            color: indicator.color,
            values: toLineData(rsi(data, (indicator.params as { period: number }).period)),
          },
        ],
      };
    case "macd": {
      const params = indicator.params as { fast: number; slow: number; signal: number };
      const macdSeries = macd(data, params);
      return {
        id: indicator.id,
        kind: indicator.kind,
        lines: [
          {
            id: "macd",
            label: `MACD(${params.fast}/${params.slow})`,
            pane: "separate",
            color: indicator.color,
            values: toLineData(macdSeries.macd),
          },
          {
            id: "signal",
            label: `Signal(${params.signal})`,
            pane: "separate",
            color: lightenColor(indicator.color, 0.5),
            values: toLineData(macdSeries.signal),
          },
          {
            id: "hist",
            label: "Hist",
            pane: "separate",
            color: histogramColor(indicator.color),
            style: "histogram",
            values: toLineData(macdSeries.histogram),
          },
        ],
      };
    }
    default:
      return assertNever(indicator);
  }
}

function toLineData(points: Array<{ time: UTCTimestamp; value: number }>) {
  return points.filter((point) => Number.isFinite(point.value));
}

function sma(data: NormalizedBar[], period: number) {
  const result: Array<{ time: UTCTimestamp; value: number }> = [];
  if (period <= 0) return result;
  for (let i = period - 1; i < data.length; i += 1) {
    let sum = 0;
    for (let j = 0; j < period; j += 1) {
      sum += data[i - j].close;
    }
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

function emaFromBars(data: NormalizedBar[], period: number) {
  return emaSeries(
    data.map((bar) => ({ time: bar.time, value: bar.close })),
    period,
  );
}

function emaSeries(values: Array<{ time: UTCTimestamp; value: number }>, period: number) {
  const result: Array<{ time: UTCTimestamp; value: number }> = [];
  if (period <= 0 || !values.length) return result;
  const multiplier = 2 / (period + 1);
  let prevEMA = values[0].value;
  result.push({ time: values[0].time, value: prevEMA });
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i].value;
    prevEMA = (value - prevEMA) * multiplier + prevEMA;
    result.push({ time: values[i].time, value: prevEMA });
  }
  return result;
}

function rsi(data: NormalizedBar[], period: number) {
  const result: Array<{ time: UTCTimestamp; value: number }> = [];
  if (period <= 0 || data.length <= period) return result;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = data[i].close - data[i - 1].close;
    if (change >= 0) gain += change;
    else loss -= change;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < data.length; i += 1) {
    const change = data[i].close - data[i - 1].close;
    if (change >= 0) {
      gain = (gain * (period - 1) + change) / period;
      loss = (loss * (period - 1)) / period;
    } else {
      gain = (gain * (period - 1)) / period;
      loss = (loss * (period - 1) - change) / period;
    }
    const rs = loss === 0 ? 100 : gain / loss;
    const value = 100 - 100 / (1 + rs);
    result.push({ time: data[i].time, value });
  }
  return result;
}

function macd(
  data: NormalizedBar[],
  params: { fast: number; slow: number; signal: number },
) {
  const fastEma = emaFromBars(data, params.fast);
  const slowEma = emaFromBars(data, params.slow);
  const aligned: Array<{ time: UTCTimestamp; value: number }> = [];
  const slowMap = new Map<number, number>();
  slowEma.forEach((point) => slowMap.set(point.time as number, point.value));
  fastEma.forEach((point) => {
    const slowValue = slowMap.get(point.time as number);
    if (slowValue == null) return;
    aligned.push({ time: point.time, value: point.value - slowValue });
  });
  const signalLine = emaSeries(aligned, params.signal);
  const signalMap = new Map<number, number>();
  signalLine.forEach((point) => signalMap.set(point.time as number, point.value));
  const histogram = aligned
    .map((point) => {
      const signalValue = signalMap.get(point.time as number);
      if (signalValue == null) return null;
      return { time: point.time, value: point.value - signalValue };
    })
    .filter(Boolean) as Array<{ time: UTCTimestamp; value: number }>;
  return {
    macd: aligned,
    signal: signalLine,
    histogram,
  };
}

function lightenColor(hex: string, amount: number) {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const amt = Math.max(0, Math.min(1, amount));
  const num = Number.parseInt(hex.slice(1), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const lerp = (channel: number) => Math.round(channel + (255 - channel) * amt);
  return `rgb(${lerp(r)}, ${lerp(g)}, ${lerp(b)})`;
}

function histogramColor(hex: string) {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const num = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((num >> 16) & 255) - 40);
  const g = Math.max(0, ((num >> 8) & 255) - 40);
  const b = Math.max(0, (num & 255) - 40);
  return `rgb(${r}, ${g}, ${b})`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled indicator kind: ${String(value)}`);
}
