import { createContext, useContext } from "react";

export interface OverlayCanvasHandle {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  width: number;
  height: number;
  pixelRatio: number;
  resize: () => void;
  clear: () => void;
  debugDraw: () => void;
}

export const OverlayCanvasContext = createContext<OverlayCanvasHandle | null>(null);

export function useOverlayCanvas(): OverlayCanvasHandle {
  const handle = useContext(OverlayCanvasContext);
  if (!handle) {
    throw new Error("useOverlayCanvas måste användas inom OverlayCanvasLayer");
  }
  return handle;
}
