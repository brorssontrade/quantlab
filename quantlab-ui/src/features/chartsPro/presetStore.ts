/**
 * presetStore.ts
 * 
 * TV-30.6: Drawing Style Presets / Templates
 * 
 * Manages saved style presets per drawing kind:
 * - Save current drawing style as preset
 * - Apply preset to existing drawing
 * - Set default preset per tool kind (applied to new drawings)
 * 
 * Storage key: cp.toolPresets
 * 
 * Data structure:
 * {
 *   presets: {
 *     [kind]: { name, style: DrawingStyle, fillColor?, fillOpacity? }[]
 *   },
 *   defaults: {
 *     [kind]: preset index or null
 *   }
 * }
 */

import type { DrawingStyle, DrawingKind } from "./types";

// Preset style (what gets saved/applied)
export interface PresetStyle {
  // Stroke
  color?: string;
  width?: number;
  dash?: number[] | null;
  opacity?: number;
  // Fill (for shapes/channels)
  fillColor?: string;
  fillOpacity?: number;
}

// A saved preset
export interface Preset {
  id: string;
  name: string;
  style: PresetStyle;
  createdAt: number;
}

// Store structure
export interface PresetStoreData {
  presets: Record<DrawingKind, Preset[]>;
  defaults: Record<DrawingKind, string | null>; // preset id or null
}

const STORAGE_KEY = "cp.toolPresets";

// Generate unique ID
function generateId(): string {
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Default empty store
function createEmptyStore(): PresetStoreData {
  return {
    presets: {} as Record<DrawingKind, Preset[]>,
    defaults: {} as Record<DrawingKind, string | null>,
  };
}

// Load presets from localStorage
export function loadPresets(): PresetStoreData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyStore();
    const parsed = JSON.parse(raw) as PresetStoreData;
    // Validate structure
    if (!parsed.presets || !parsed.defaults) {
      return createEmptyStore();
    }
    return parsed;
  } catch {
    return createEmptyStore();
  }
}

// Save presets to localStorage
export function savePresets(data: PresetStoreData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[presetStore] Failed to save presets:", e);
  }
}

// Get presets for a specific drawing kind
export function getPresetsForKind(kind: DrawingKind): Preset[] {
  const data = loadPresets();
  return data.presets[kind] || [];
}

// Get all presets (for dump)
export function getAllPresets(): PresetStoreData {
  return loadPresets();
}

// Add a new preset for a drawing kind
export function addPreset(kind: DrawingKind, name: string, style: PresetStyle): Preset {
  const data = loadPresets();
  
  // Initialize array if needed
  if (!data.presets[kind]) {
    data.presets[kind] = [];
  }
  
  const preset: Preset = {
    id: generateId(),
    name,
    style,
    createdAt: Date.now(),
  };
  
  data.presets[kind].push(preset);
  savePresets(data);
  
  return preset;
}

// Remove a preset
export function removePreset(kind: DrawingKind, presetId: string): boolean {
  const data = loadPresets();
  
  if (!data.presets[kind]) return false;
  
  const index = data.presets[kind].findIndex(p => p.id === presetId);
  if (index === -1) return false;
  
  data.presets[kind].splice(index, 1);
  
  // Clear default if it was this preset
  if (data.defaults[kind] === presetId) {
    data.defaults[kind] = null;
  }
  
  savePresets(data);
  return true;
}

// Get default preset for a kind
export function getDefaultPreset(kind: DrawingKind): Preset | null {
  const data = loadPresets();
  const defaultId = data.defaults[kind];
  if (!defaultId) return null;
  
  const presets = data.presets[kind] || [];
  return presets.find(p => p.id === defaultId) || null;
}

// Set default preset for a kind
export function setDefaultPreset(kind: DrawingKind, presetId: string | null): void {
  const data = loadPresets();
  data.defaults[kind] = presetId;
  savePresets(data);
}

// Get default style for a new drawing (merges preset with base)
export function getDefaultStyleForKind(kind: DrawingKind): PresetStyle | null {
  const preset = getDefaultPreset(kind);
  return preset?.style || null;
}

// Extract PresetStyle from a drawing
export function extractStyleFromDrawing(drawing: {
  style?: DrawingStyle;
  fillColor?: string;
  fillOpacity?: number;
}): PresetStyle {
  return {
    color: drawing.style?.color,
    width: drawing.style?.width,
    dash: drawing.style?.dash,
    opacity: drawing.style?.opacity,
    fillColor: drawing.fillColor,
    fillOpacity: drawing.fillOpacity,
  };
}

// Apply preset style to a drawing (returns partial update)
export function applyPresetToDrawing(preset: Preset): {
  style: Partial<DrawingStyle>;
  fillColor?: string;
  fillOpacity?: number;
} {
  const result: {
    style: Partial<DrawingStyle>;
    fillColor?: string;
    fillOpacity?: number;
  } = {
    style: {},
  };
  
  // Stroke properties
  if (preset.style.color !== undefined) result.style.color = preset.style.color;
  if (preset.style.width !== undefined) result.style.width = preset.style.width;
  if (preset.style.dash !== undefined) result.style.dash = preset.style.dash;
  if (preset.style.opacity !== undefined) result.style.opacity = preset.style.opacity;
  
  // Fill properties
  if (preset.style.fillColor !== undefined) result.fillColor = preset.style.fillColor;
  if (preset.style.fillOpacity !== undefined) result.fillOpacity = preset.style.fillOpacity;
  
  return result;
}

// Clear all presets (for testing)
export function clearAllPresets(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
