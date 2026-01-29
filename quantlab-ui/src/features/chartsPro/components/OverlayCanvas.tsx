import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, PointerEventHandler, PropsWithChildren, RefObject } from "react";

import { OverlayCanvasContext, type OverlayCanvasHandle } from "./overlayCanvasContext";

/**
 * OverlayCanvasLayer
 * 
 * Provides an overlay canvas for drawings rendered by DrawingLayer.
 * 
 * IMPORTANT ARCHITECTURAL NOTE (P0 fix 2026-01-24):
 * -------------------------------------------------
 * This component MUST NOT clear the canvas except when dimensions actually change.
 * Setting canvas.width/height automatically clears the buffer (browser behavior).
 * 
 * DrawingLayer is the sole owner of overlay content and manages its own render cycle.
 * If resizeCanvas() clears unconditionally, drawings disappear between renders
 * (e.g., when mouse leaves chart and crosshair hides).
 * 
 * The render responsibility chain:
 * 1. OverlayCanvasLayer: provides canvas + context, handles resize
 * 2. DrawingLayer: owns render() callback, draws all drawings
 * 3. DrawingLayer subscribes to timeScale changes and triggers re-render when needed
 */

type ElementRef<T extends HTMLElement> = RefObject<T | null> | MutableRefObject<T | null>;

interface OverlayCanvasProps extends PropsWithChildren {
  containerRef: ElementRef<HTMLElement>;
  className?: string;
  pointerEvents?: "auto" | "none";
  onPointerDown?: PointerEventHandler<HTMLCanvasElement>;
  onPointerMove?: PointerEventHandler<HTMLCanvasElement>;
  onPointerUp?: PointerEventHandler<HTMLCanvasElement>;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

const getDevicePixelRatio = () => Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

export function OverlayCanvasLayer({
  containerRef,
  className,
  pointerEvents,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onCanvasReady,
  children,
}: OverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resizeRaf = useRef<number | null>(null);
  const handleRef = useRef<OverlayCanvasHandle>({
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    pixelRatio: getDevicePixelRatio(),
    resize: () => {},
    clear: () => {},
    debugDraw: () => {},
  });
  const [, forceUpdate] = useState(0);

  const performResize = useCallback(() => resizeCanvas(containerRef, canvasRef, handleRef), [containerRef]);
  const queueResize = useCallback(() => {
    if (resizeRaf.current) cancelAnimationFrame(resizeRaf.current);
    resizeRaf.current = requestAnimationFrame(() => {
      resizeRaf.current = null;
      performResize();
    });
  }, [performResize]);

  useEffect(() => {
    handleRef.current.resize = queueResize;
    handleRef.current.clear = () => clearCanvas(handleRef.current);
    handleRef.current.debugDraw = () => drawDebugGuide(handleRef.current);
    queueResize();
    forceUpdate((value) => value + 1);
  }, [containerRef, queueResize]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new ResizeObserver(() => handleRef.current.resize());
    observer.observe(root);
    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    const handle = () => handleRef.current.resize();
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  const providerValue = useMemo(() => handleRef.current, []);

  return (
    <OverlayCanvasContext.Provider value={providerValue}>
      <canvas
        ref={(node) => {
          canvasRef.current = node;
          handleRef.current.canvas = node;
          handleRef.current.ctx = node ? node.getContext("2d") : null;
          handleRef.current.resize();
          onCanvasReady?.(node);
        }}
        className={className ?? "absolute inset-0"}
        style={pointerEvents ? { pointerEvents } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      {children}
    </OverlayCanvasContext.Provider>
  );
}

function resizeCanvas(
  containerRef: ElementRef<HTMLElement>,
  canvasRef: ElementRef<HTMLCanvasElement>,
  handleRef: React.MutableRefObject<OverlayCanvasHandle>,
) {
  const container = containerRef.current;
  const canvas = canvasRef.current;
  if (!container || !canvas) return;
  const rect = container.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const ratio = getDevicePixelRatio();
  const cssWidth = rect.width;
  const cssHeight = rect.height;
  const pixelWidth = Math.max(1, Math.floor(cssWidth * ratio));
  const pixelHeight = Math.max(1, Math.floor(cssHeight * ratio));
  
  // Update CSS dimensions (does not clear canvas)
  if (canvas.style.width !== `${cssWidth}px`) canvas.style.width = `${cssWidth}px`;
  if (canvas.style.height !== `${cssHeight}px`) canvas.style.height = `${cssHeight}px`;
  
  // Update pixel buffer dimensions - this AUTOMATICALLY clears the canvas buffer (browser behavior)
  // We intentionally do NOT call clearRect() here to avoid erasing drawings between renders.
  // DrawingLayer manages its own render cycle and clears before drawing.
  // See architectural note at top of file (P0 fix 2026-01-24).
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  
  handleRef.current.ctx = ctx;
  handleRef.current.width = cssWidth;
  handleRef.current.height = cssHeight;
  handleRef.current.pixelRatio = ratio;
}

function clearCanvas(handle: OverlayCanvasHandle) {
  if (!handle.ctx) return;
  handle.ctx.clearRect(0, 0, handle.width, handle.height);
}

function drawDebugGuide(handle: OverlayCanvasHandle) {
  if (!handle.ctx || !handle.width || !handle.height) return;
  handle.ctx.save();
  handle.ctx.strokeStyle = "red";
  handle.ctx.lineWidth = 2;
  handle.ctx.setLineDash([4, 4]);
  handle.ctx.beginPath();
  handle.ctx.moveTo(12, 12);
  handle.ctx.lineTo(handle.width - 12, handle.height - 12);
  handle.ctx.stroke();
  handle.ctx.setLineDash([]);
  handle.ctx.restore();
}
