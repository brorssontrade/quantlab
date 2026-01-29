/**
 * T-013: Drawings API client for backend persistence.
 * 
 * This module provides functions for syncing chart drawings with the backend.
 * It handles serialization of drawing objects to the API format and back.
 */

import type { Drawing, DrawingStyle, Tf } from "../types";

const API_BASE = "/api/drawings";

// =============================================================================
// Types
// =============================================================================

interface TrendPoint {
  timeMs: number;
  price: number;
}

interface DrawingStylePayload {
  color: string;
  width: number;
  dash?: number[] | null;
  opacity?: number;
}

interface DrawingPayload {
  id: string;
  kind: string;
  symbol: string;
  tf: string;
  z: number;
  createdAt?: number;
  updatedAt?: number;
  locked: boolean;
  hidden: boolean;
  label?: string;
  style?: DrawingStylePayload;
  data: Record<string, unknown>;
}

interface DrawingsResponse {
  version: string;
  symbol: string;
  tf: string;
  drawings: DrawingPayload[];
  count: number;
}

interface BulkSaveResponse {
  success: boolean;
  saved: number;
  symbol: string;
  tf: string;
}

// =============================================================================
// Serialization: Drawing → API Payload
// =============================================================================

/**
 * Convert a frontend Drawing to API payload format.
 * Type-specific fields (p1, p2, etc.) go into the `data` object.
 */
export function drawingToPayload(drawing: Drawing): DrawingPayload {
  const base: DrawingPayload = {
    id: drawing.id,
    kind: drawing.kind,
    symbol: drawing.symbol,
    tf: drawing.tf,
    z: drawing.z,
    createdAt: drawing.createdAt,
    updatedAt: drawing.updatedAt,
    locked: drawing.locked ?? false,
    hidden: drawing.hidden ?? false,
    label: drawing.label,
    style: drawing.style ? {
      color: drawing.style.color,
      width: drawing.style.width,
      dash: drawing.style.dash ?? null,
      opacity: drawing.style.opacity ?? 1,
    } : undefined,
    data: {},
  };

  // Extract type-specific fields into data
  switch (drawing.kind) {
    case "hline":
      base.data = { price: drawing.price };
      break;
    case "vline":
      base.data = { timeMs: drawing.timeMs };
      break;
    case "trend":
    case "ray":
    case "extendedLine":
      base.data = { 
        p1: drawing.p1, 
        p2: drawing.p2,
        showSlope: "showSlope" in drawing ? drawing.showSlope : undefined,
        lineMode: "lineMode" in drawing ? drawing.lineMode : undefined,
      };
      break;
    case "channel":
    case "pitchfork":
    case "schiffPitchfork":
    case "modifiedSchiffPitchfork":
    case "flatTopChannel":
    case "flatBottomChannel":
    case "longPosition":
    case "shortPosition":
      base.data = { p1: drawing.p1, p2: drawing.p2, p3: drawing.p3 };
      break;
    case "rectangle":
    case "priceRange":
    case "dateRange":
    case "dateAndPriceRange":
    case "fibRetracement":
    case "fibFan":
    case "regressionTrend":
      base.data = { 
        p1: drawing.p1, 
        p2: drawing.p2,
        fillColor: "fillColor" in drawing ? drawing.fillColor : undefined,
        fillOpacity: "fillOpacity" in drawing ? drawing.fillOpacity : undefined,
      };
      break;
    case "circle":
    case "ellipse":
      base.data = { 
        p1: drawing.p1, 
        p2: drawing.p2,
        fillColor: drawing.fillColor,
        fillOpacity: drawing.fillOpacity,
      };
      break;
    case "triangle":
    case "fibExtension":
      base.data = { 
        p1: drawing.p1, 
        p2: drawing.p2, 
        p3: drawing.p3,
        fillColor: "fillColor" in drawing ? drawing.fillColor : undefined,
        fillOpacity: "fillOpacity" in drawing ? drawing.fillOpacity : undefined,
      };
      break;
    case "text":
      base.data = { 
        anchor: drawing.anchor, 
        content: drawing.content,
        fontSize: drawing.fontSize,
        fontColor: drawing.fontColor,
        backgroundColor: drawing.backgroundColor,
      };
      break;
    case "callout":
      base.data = {
        anchor: drawing.anchor,
        box: drawing.box,
        text: drawing.text,
        fontSize: drawing.fontSize,
        fontColor: drawing.fontColor,
        backgroundColor: drawing.backgroundColor,
        borderColor: drawing.borderColor,
      };
      break;
    case "note":
      base.data = {
        anchor: drawing.anchor,
        text: drawing.text,
        fontSize: drawing.fontSize,
        fontColor: drawing.fontColor,
        backgroundColor: drawing.backgroundColor,
        borderColor: drawing.borderColor,
      };
      break;
    case "abcd":
      base.data = { 
        p1: drawing.p1, 
        p2: drawing.p2, 
        p3: drawing.p3, 
        p4: drawing.p4,
        k: "k" in drawing ? (drawing as { k?: number }).k : 1.0,
      };
      break;
    case "headAndShoulders":
      base.data = { 
        p1: drawing.p1, 
        p2: drawing.p2, 
        p3: drawing.p3, 
        p4: drawing.p4, 
        p5: drawing.p5,
        inverse: drawing.inverse,
      };
      break;
    case "elliottWave":
      base.data = { 
        p0: drawing.p0, 
        p1: drawing.p1, 
        p2: drawing.p2, 
        p3: drawing.p3, 
        p4: drawing.p4, 
        p5: drawing.p5,
        direction: drawing.direction,
      };
      break;
    default:
      // For any unknown types, just copy the whole object minus base fields
      const { id, kind, symbol, tf, z, createdAt, updatedAt, locked, hidden, label, style, ...rest } = drawing as Record<string, unknown>;
      base.data = rest;
  }

  return base;
}

// =============================================================================
// Deserialization: API Payload → Drawing
// =============================================================================

/**
 * Convert an API payload back to a frontend Drawing object.
 */
export function payloadToDrawing(payload: DrawingPayload): Drawing {
  const base = {
    id: payload.id,
    kind: payload.kind,
    symbol: payload.symbol,
    tf: payload.tf as Tf,
    z: payload.z,
    createdAt: payload.createdAt ?? Date.now(),
    updatedAt: payload.updatedAt ?? Date.now(),
    locked: payload.locked,
    hidden: payload.hidden,
    label: payload.label,
    style: payload.style ? {
      color: payload.style.color,
      width: payload.style.width,
      dash: payload.style.dash ?? undefined,
      opacity: payload.style.opacity,
    } as DrawingStyle : undefined,
  };

  // Merge type-specific fields from data
  return { ...base, ...payload.data } as Drawing;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Fetch all drawings for a symbol/timeframe from the backend.
 */
export async function fetchDrawings(symbol: string, tf: Tf): Promise<Drawing[]> {
  const url = `${API_BASE}/${encodeURIComponent(symbol)}/${tf}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      return []; // No drawings yet
    }
    throw new Error(`Failed to fetch drawings: ${response.status} ${response.statusText}`);
  }
  
  const data: DrawingsResponse = await response.json();
  return data.drawings.map(payloadToDrawing);
}

/**
 * Save all drawings for a symbol/timeframe to the backend.
 * This performs a full replacement (sync).
 */
export async function saveDrawings(symbol: string, tf: Tf, drawings: Drawing[]): Promise<BulkSaveResponse> {
  const url = `${API_BASE}/${encodeURIComponent(symbol)}/${tf}`;
  
  const payloads = drawings.map(drawingToPayload);
  
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: "v1", drawings: payloads }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to save drawings: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Delete all drawings for a symbol/timeframe.
 */
export async function deleteAllDrawings(symbol: string, tf: Tf): Promise<void> {
  const url = `${API_BASE}/${encodeURIComponent(symbol)}/${tf}`;
  
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Failed to delete drawings: ${response.status} ${response.statusText}`);
  }
}

/**
 * Delete a specific drawing.
 */
export async function deleteDrawing(symbol: string, tf: Tf, drawingId: string): Promise<void> {
  const url = `${API_BASE}/${encodeURIComponent(symbol)}/${tf}/${encodeURIComponent(drawingId)}`;
  
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete drawing: ${response.status} ${response.statusText}`);
  }
}
