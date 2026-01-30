/// <reference lib="webworker" />

import type { NormalizedBar, Tf } from "../types";
import type { IndicatorKind, IndicatorPane } from "./registryV2";
import { computeIndicator } from "./registryV2";

interface WorkerRequest {
  type: "compute";
  payload: {
    id: string;
    kind: IndicatorKind;
    params: Record<string, number | string>;
    pane: IndicatorPane;
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
      },
      data: payload.data as any,
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
