/// <reference lib="webworker" />

import type { IndicatorInstance, NormalizedBar, Tf } from "../types";
import { computeIndicator } from "./registry";

interface WorkerRequest {
  type: "compute";
  payload: {
    id: string;
    kind: IndicatorInstance["kind"];
    params: IndicatorInstance["params"];
    pane: IndicatorInstance["pane"];
    color: string;
    timeframe: Tf;
    data: NormalizedBar[];
  };
}

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { data } = event;
  if (!data || data.type !== "compute") return;
  const { payload } = data;
  try {
    const result = computeIndicator({
      indicator: {
        id: payload.id,
        kind: payload.kind,
        pane: payload.pane,
        color: payload.color,
        params: payload.params,
      } as IndicatorInstance,
      data: payload.data,
      timeframe: payload.timeframe,
    });
    ctx.postMessage(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indicator worker failed";
    ctx.postMessage({
      id: payload.id,
      kind: payload.kind,
      lines: [],
      error: message,
    });
  }
};
