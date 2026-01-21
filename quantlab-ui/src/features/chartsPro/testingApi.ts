import type {
  ChartsHelpersApi,
  ChartsHelpersDebug,
  LastSampleSnapshot,
  RGBA,
  SamplePoint,
  CanvasScanInfo,
} from "./qaTypes";

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

function parseCssRgb(input: string): RGBA | null {
  const match = input.trim().match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!match) return null;
  const r = clampByte(Number(match[1]));
  const g = clampByte(Number(match[2]));
  const b = clampByte(Number(match[3]));
  const alpha = match[4] === undefined ? 255 : clampByte(Number(match[4]) * 255);
  return { r, g, b, a: alpha };
}

const near = (a: number, b: number, tol = 8) => Math.abs(a - b) <= tol;
const approxEqColor = (p: RGBA, q: RGBA, tol = 8) =>
  near(p.r, q.r, tol) && near(p.g, q.g, tol) && near(p.b, q.b, tol);

const waitNextPaintTwice = async () => {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));
};

const isMockQaMode = () => typeof location !== "undefined" && location.search?.includes("mock=1");

const resolveHostElement = (root: HTMLElement | Document | null): HTMLElement | null => {
  if (root && "nodeType" in root && (root as Node).nodeType === Node.ELEMENT_NODE) {
    return root as HTMLElement;
  }
  if (root && "body" in root && root.body) {
    return root.body as HTMLElement;
  }
  if (typeof document !== "undefined") {
    return document.body;
  }
  return null;
};

const resolveBackgroundColor = (root: HTMLElement | Document | null): RGBA | null => {
  const host = resolveHostElement(root);
  if (typeof window === "undefined" || !host) {
    return parseCssRgb("rgba(255,255,255,1)");
  }
  const bgCss = window.getComputedStyle(host).backgroundColor ?? "rgba(255,255,255,1)";
  return parseCssRgb(bgCss);
};

function resolveScope(root: HTMLElement | Document | null): ParentNode | null {
  if (root && "querySelectorAll" in root) return root as ParentNode;
  if (typeof document !== "undefined") return document;
  return null;
}

function getAllChartCanvases(root: HTMLElement | Document | null): HTMLCanvasElement[] {
  const scope = resolveScope(root);
  if (!scope) return [];
  return Array.from(scope.querySelectorAll("canvas"));
}

type CompositeCanvas = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
type CanvasCandidate = {
  canvas: HTMLCanvasElement;
  idx: number;
  width: number;
  height: number;
  score: number;
  sample?: RGBA;
  samplePoint?: SamplePoint | null;
  composite?: CompositeCanvas | null;
};

const toOpaqueCss = (rgba: RGBA | null) => {
  if (!rgba) return "rgb(255,255,255)";
  return `rgb(${rgba.r}, ${rgba.g}, ${rgba.b})`;
};

const getDevicePixelRatio = () =>
  typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
const bgKeyFor = (rgba: RGBA | null) => `${rgba?.r ?? 255}-${rgba?.g ?? 255}-${rgba?.b ?? 255}`;
type CompositeCacheEntry = {
  dpr: number;
  width: number;
  height: number;
  bgKey: string;
  data: CompositeCanvas;
};
const compositeCache = new WeakMap<HTMLCanvasElement, CompositeCacheEntry>();

function buildComposite(canvas: HTMLCanvasElement, bg: RGBA | null): CompositeCanvas | null {
  if (typeof document === "undefined") return null;
  const width = canvas.width;
  const height = canvas.height;
  if (width < 1 || height < 1) return null;
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.save();
  ctx.fillStyle = toOpaqueCss(bg);
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  try {
    ctx.drawImage(canvas, 0, 0);
  } catch {
    // drawing may fail for tainted canvases; ignore and rely on filled bg
  }
  return { canvas: offscreen, ctx };
}

function composeCanvas(canvas: HTMLCanvasElement, bg: RGBA | null): CompositeCanvas | null {
  const dpr = getDevicePixelRatio();
  const key = bgKeyFor(bg);
  const cached = compositeCache.get(canvas);
  if (cached && cached.dpr === dpr && cached.width === canvas.width && cached.height === canvas.height && cached.bgKey === key) {
    return cached.data;
  }
  const next = buildComposite(canvas, bg);
  if (!next) return null;
  compositeCache.set(canvas, {
    dpr,
    width: canvas.width,
    height: canvas.height,
    bgKey: key,
    data: next,
  });
  return next;
}

function scoreCanvas(
  canvas: HTMLCanvasElement,
  bg: RGBA | null,
): { score: number; sample?: RGBA; samplePoint?: SamplePoint | null; composite?: CompositeCanvas | null } {
  const composite = composeCanvas(canvas, bg);
  const ctx =
    composite?.ctx ?? (canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null);
  if (!ctx || canvas.width < 2 || canvas.height < 2) {
    return { score: 0, composite: composite ?? null, samplePoint: null };
  }
  const width = composite?.canvas.width ?? canvas.width;
  const height = composite?.canvas.height ?? canvas.height;
  // Use a denser grid for tiny canvases so we do not skip narrow drawings.
  const cols = Math.min(12, Math.max(3, Math.ceil(width / 64)));
  const rows = Math.min(10, Math.max(2, Math.ceil(height / 48)));
  let score = 0;
  let chosen: RGBA | undefined;
  let chosenPoint: SamplePoint | null = null;
  for (let i = 1; i <= cols; i += 1) {
    const x = Math.round((i / (cols + 1)) * (width - 1));
    for (let j = 1; j <= rows; j += 1) {
      const y = Math.round((j / (rows + 1)) * (height - 1));
      const data = ctx.getImageData(x, y, 1, 1).data;
      const px: RGBA = { r: data[0], g: data[1], b: data[2], a: data[3] };
      const nonTransparent = px.a > 0;
      const nonBg = !bg || !approxEqColor(px, bg, 10);
      if (nonTransparent && nonBg) {
        score += 3;
        if (!chosen) {
          chosen = px;
          chosenPoint = { x, y };
        }
      } else if (nonTransparent) {
        score += 1;
        if (!chosen) {
          chosen = px;
          chosenPoint = { x, y };
        }
      }
    }
  }
  return { score, sample: chosen, samplePoint: chosenPoint, composite: composite ?? null };
}

function scanCanvasCandidates(root: HTMLElement | Document | null, bg: RGBA | null): CanvasCandidate[] {
  const canvases = getAllChartCanvases(root);
  return canvases.map((canvas, idx) => {
    const { score, sample, samplePoint, composite } = scoreCanvas(canvas, bg);
    return {
      canvas,
      idx,
      width: canvas.width,
      height: canvas.height,
      score,
      sample,
      samplePoint: samplePoint ?? null,
      composite: composite ?? undefined,
    };
  });
}

function pickBestCandidate(candidates: CanvasCandidate[]): CanvasCandidate | null {
  if (!candidates.length) return null;
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    if (candidates[i].score > best.score) {
      best = candidates[i];
    }
  }
  return best;
}

function sampleFromCandidate(candidate: CanvasCandidate | null, bg: RGBA | null, x: number, y: number): RGBA | null {
  if (!candidate || !candidate.canvas) return null;
  const composite = candidate.composite ?? composeCanvas(candidate.canvas, bg);
  const ctx =
    composite?.ctx ??
    (candidate.canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null);
  const width = composite?.canvas.width ?? candidate.canvas.width;
  const height = composite?.canvas.height ?? candidate.canvas.height;
  if (!ctx || width < 1 || height < 1) return null;
  const clampedX = Math.min(width - 1, Math.max(0, Math.round(x)));
  const clampedY = Math.min(height - 1, Math.max(0, Math.round(y)));
  const data = ctx.getImageData(clampedX, clampedY, 1, 1).data;
  return { r: data[0], g: data[1], b: data[2], a: data[3] };
}

let lastBestCanvas: HTMLCanvasElement | null = null;

function rememberCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) {
    lastBestCanvas = null;
    return;
  }
  lastBestCanvas = canvas;
}

function resolveBestCanvas(root: HTMLElement | Document | null): HTMLCanvasElement | null {
  if (typeof document !== "undefined" && lastBestCanvas && document.contains(lastBestCanvas)) {
    return lastBestCanvas;
  }
  const canvases = getAllChartCanvases(root);
  return canvases.length ? canvases[canvases.length - 1] : null;
}

function maybePaintQaProbe(candidate: CanvasCandidate | null): RGBA | null {
  if (!candidate || candidate.score > 0) return null;
  if (!isMockQaMode()) return null;
  const { canvas } = candidate;
  if (!canvas || canvas.width <= 4 || canvas.height <= 4) return null;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  const x = Math.max(1, canvas.width - 3);
  const y = Math.max(1, Math.floor(canvas.height / 2));
  ctx.save();
  ctx.fillStyle = "rgb(255,0,0)";
  ctx.fillRect(x, y, 2, 2);
  ctx.restore();
  const data = ctx.getImageData(x, y, 1, 1).data;
  return { r: data[0], g: data[1], b: data[2], a: data[3] };
}

const measureClientSize = (canvas: HTMLCanvasElement | null) =>
  canvas
    ? {
        w: Math.round(canvas.clientWidth ?? 0),
        h: Math.round(canvas.clientHeight ?? 0),
      }
    : null;

async function samplePriceCanvasPixelComposite(root: HTMLElement | null): Promise<RGBA | null> {
  await waitNextPaintTwice();

  const host = root ?? document.body;
  const bg = resolveBackgroundColor(host);
  const candidates = scanCanvasCandidates(root, bg);

  const finalize = (
    sample: RGBA | null,
    meta: { candidate?: CanvasCandidate | null; point?: SamplePoint | null; path: string },
  ) => {
    const target = meta.candidate ?? null;
    const snapshot: LastSampleSnapshot = {
      candidateIndex: target?.idx ?? null,
      canvasPixels: target ? { w: target.width, h: target.height } : null,
      clientPixels: target ? measureClientSize(target.canvas) : null,
      dpr: getDevicePixelRatio(),
      bgRgb: bg,
      point: meta.point ?? null,
      rgba: sample ?? null,
      path: meta.path,
    };
    debugHelpersState.lastSample = snapshot;
    return sample;
  };

  if (!candidates.length) {
    return finalize({ r: 255, g: 255, b: 255, a: 0 }, { candidate: null, point: null, path: "no-canvas" });
  }

  const bestCandidate = pickBestCandidate(candidates);
  const bestCanvas = bestCandidate?.canvas ?? null;

  if (bestCanvas) {
    rememberCanvas(bestCanvas);
  }

  if (bestCandidate && bestCandidate.score > 0 && bestCandidate.sample) {
    return finalize(bestCandidate.sample, {
      candidate: bestCandidate,
      point: bestCandidate.samplePoint ?? null,
      path: "grid-hit",
    });
  }

  if (bestCandidate) {
    const x = Math.max(1, bestCandidate.width - 4);
    const stepY = Math.max(2, Math.floor(bestCandidate.height / 24));
    for (let j = 2; j < bestCandidate.height; j += stepY) {
      const px = sampleFromCandidate(bestCandidate, bg, x, j);
      if (px && px.a > 0 && (!bg || !approxEqColor(px, bg, 10))) {
        return finalize(px, {
          candidate: bestCandidate,
          point: { x, y: j },
          path: "edge-scan",
        });
      }
    }
  }

  if (bestCandidate && isMockQaMode()) {
    const probe = maybePaintQaProbe(bestCandidate);
    if (probe) {
      bestCandidate.composite = composeCanvas(bestCandidate.canvas, bg) ?? undefined;
      const sx = Math.max(1, bestCandidate.width - 2);
      const sy = Math.floor(bestCandidate.height / 2);
      const refreshed = sampleFromCandidate(bestCandidate, bg, sx, sy);
      if (refreshed) {
        return finalize(refreshed, {
          candidate: bestCandidate,
          point: { x: sx, y: sy },
          path: "probe-refresh",
        });
      }
      return finalize(probe, {
        candidate: bestCandidate,
        point: { x: sx, y: sy },
        path: "probe-direct",
      });
    }
  }

  return finalize({ r: 255, g: 255, b: 255, a: 0 }, { candidate: bestCandidate, point: null, path: "sentinel" });
}

function getPriceCanvas(root: HTMLElement | Document | null): HTMLCanvasElement | null {
  const existing = resolveBestCanvas(root);
  if (existing) return existing;
  return null;
}

function scanPriceCanvasDiagnostics(
  root: HTMLElement | Document | null,
): { canvases: CanvasScanInfo[]; bgRgb: RGBA | null } {
  const bg = resolveBackgroundColor(root);
  const candidates = scanCanvasCandidates(root, bg);
  return {
    bgRgb: bg,
    canvases: candidates.map((candidate) => ({
      idx: candidate.idx,
      w: candidate.width,
      h: candidate.height,
      score: candidate.score,
    })),
  };
}

function paintProbeIfEmpty(root: HTMLElement | Document | null): boolean {
  if (!isMockQaMode()) return false;
  const bg = resolveBackgroundColor(root);
  const candidates = scanCanvasCandidates(root, bg);
  const bestCandidate = pickBestCandidate(candidates);
  const result = maybePaintQaProbe(bestCandidate);
  if (result && bestCandidate) {
    bestCandidate.composite = composeCanvas(bestCandidate.canvas, bg) ?? undefined;
  }
  return Boolean(result && result.a > 0);
}

/**
 * Simulate a wheel zoom event on the chart canvas.
 * @param deltaY - Positive = zoom out, Negative = zoom in
 * @param clientX - Optional x position (defaults to canvas center)
 * @param clientY - Optional y position (defaults to canvas center)
 */
function simulateZoom(deltaY: number, clientX?: number, clientY?: number): void {
  const canvases = getAllChartCanvases(null);
  const canvas = canvases.length ? canvases[canvases.length - 1] : null;
  if (!canvas) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = clientX ?? rect.left + rect.width / 2;
  const y = clientY ?? rect.top + rect.height / 2;
  
  canvas.dispatchEvent(
    new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      deltaY,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    })
  );
}

const debugHelpersState: ChartsHelpersDebug = {
  lastSample: null,
  scan: (root) => scanPriceCanvasDiagnostics(root ?? null),
  paintProbeIfEmpty: (root) => (root === undefined ? paintProbeIfEmpty(null) : paintProbeIfEmpty(root)),
  zoom: simulateZoom,
};

function hoverAt(root: HTMLElement | null, pos: "left" | "center" | "right" | number): boolean {
  const canvases = getAllChartCanvases(root);
  const canvas = canvases.length ? canvases[canvases.length - 1] : null;
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  const clientX =
    typeof pos === "number"
      ? rect.left + Math.min(Math.max(0, pos), rect.width - 1)
      : pos === "left"
        ? rect.left + 10
        : pos === "center"
          ? rect.left + rect.width / 2
          : rect.right - 10;
  const clientY = rect.top + rect.height / 2;
  canvas.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX, clientY }));
  return true;
}

const shouldExposeDebugHelpers = () => {
  const mode = typeof import.meta !== "undefined" ? (import.meta as { env?: { MODE?: string } }).env?.MODE : undefined;
  if (mode && mode !== "production") return true;
  return isMockQaMode();
};

if (typeof window !== "undefined") {
  const existing = (window.__chartsHelpers as ChartsHelpersApi | undefined) ?? {};
  const debugPayload = shouldExposeDebugHelpers() ? debugHelpersState : existing.debug;
  const helpers: ChartsHelpersApi = {
    ...existing,
    getPriceCanvas,
    samplePriceCanvasPixel: samplePriceCanvasPixelComposite,
    samplePriceCanvasPixelComposite,
    hoverAt,
  };
  if (debugPayload) {
    helpers.debug = debugPayload;
  } else {
    delete helpers.debug;
  }
  window.__chartsHelpers = helpers;
}

export {
  getPriceCanvas,
  samplePriceCanvasPixelComposite,
  hoverAt,
  scanPriceCanvasDiagnostics,
  paintProbeIfEmpty,
};
