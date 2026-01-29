/**
 * toolRegistry.ts
 * 
 * TV-20.1: Data-driven tool registry for LeftToolbar
 * 
 * Source of truth for all drawing tools. Maps to:
 * - controls.ts Tool type
 * - DrawingLayer tool handling
 * - dump().ui.activeTool
 * 
 * Tools can be:
 * - enabled: Fully functional in drawing engine
 * - disabled: UI visible but not clickable (coming soon)
 */

// NOTE: We intentionally don't import Tool from controls.ts to avoid circular dependency.
// The Tool type is defined in controls.ts but we use string here for the registry.
// Type safety is ensured by keeping the TOOL_GROUPS definitions consistent with controls.ts Tool type.

export type ToolStatus = "enabled" | "disabled";

export interface ToolDefinition {
  id: string; // Tool ID - must match controls.ts Tool type for enabled tools
  label: string;
  icon: string;
  shortcut?: string;
  status: ToolStatus;
  tooltip?: string; // Extra info for disabled tools
}

export interface ToolGroup {
  id: string;
  label: string;
  icon: string;
  tools: ToolDefinition[];
}

/**
 * Tool Groups - TradingView-style organization
 * 
 * Groups are ordered by frequency of use (most common first).
 * Within each group, enabled tools come before disabled ones.
 */
export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: "cursor",
    label: "Cursor",
    icon: "◀",
    tools: [
      { id: "select", label: "Select / Cursor", icon: "◀", shortcut: "Esc", status: "enabled" },
    ],
  },
  {
    id: "lines",
    label: "Lines",
    icon: "⧹",
    tools: [
      { id: "trendline", label: "Trend Line", icon: "⧹", shortcut: "T", status: "enabled" },
      { id: "hline", label: "Horizontal Line", icon: "—", shortcut: "H", status: "enabled" },
      { id: "vline", label: "Vertical Line", icon: "|", shortcut: "V", status: "enabled" },
      { id: "ray", label: "Ray", icon: "↗", shortcut: "A", status: "enabled", tooltip: "Line extending from p1 through p2 to infinity" },
      { id: "extendedLine", label: "Extended Line", icon: "↔", shortcut: "E", status: "enabled", tooltip: "Line extending infinitely in both directions" },
    ],
  },
  {
    id: "channels",
    label: "Channels",
    icon: "⫴",
    tools: [
      { id: "channel", label: "Parallel Channel", icon: "⫴", shortcut: "C", status: "enabled" },
      { id: "flatTopChannel", label: "Flat Top", icon: "⊤", shortcut: "F", status: "enabled", tooltip: "Channel with horizontal top" },
      { id: "flatBottomChannel", label: "Flat Bottom", icon: "⊥", status: "enabled", tooltip: "Channel with horizontal bottom" },
      { id: "regressionTrend", label: "Regression Trend", icon: "⋰", shortcut: "G", status: "enabled", tooltip: "Linear regression channel with ±2σ bands" },
    ],
  },
  {
    id: "shapes",
    label: "Shapes",
    icon: "□",
    tools: [
      { id: "rectangle", label: "Rectangle", icon: "□", shortcut: "R", status: "enabled" },
      { id: "circle", label: "Circle", icon: "○", shortcut: "O", status: "enabled", tooltip: "Circle shape (center + radius)" },
      { id: "ellipse", label: "Ellipse", icon: "◯", shortcut: "I", status: "enabled", tooltip: "Ellipse shape (center + radii)" },
      { id: "triangle", label: "Triangle", icon: "△", shortcut: "Y", status: "enabled", tooltip: "Triangle shape (3 vertices)" },
    ],
  },
  {
    id: "text",
    label: "Text & Notes",
    icon: "T",
    tools: [
      { id: "text", label: "Text", icon: "T", shortcut: "N", status: "enabled" },
      { id: "callout", label: "Callout", icon: "💬", shortcut: "K", status: "enabled", tooltip: "Text annotation with leader line" },
      { id: "note", label: "Note", icon: "📝", shortcut: "M", status: "enabled", tooltip: "Sticky note without leader line" },
    ],
  },
  {
    id: "fibonacci",
    label: "Fibonacci",
    icon: "🔢",
    tools: [
      { id: "fibRetracement", label: "Fib Retracement", icon: "⧗", shortcut: "B", status: "enabled", tooltip: "Fibonacci retracement levels" },
      { id: "fibExtension", label: "Fib Extension", icon: "⧕", shortcut: "X", status: "enabled", tooltip: "Fibonacci extension levels (3-point)" },
      { id: "fibFan", label: "Fib Fan", icon: "⫿", shortcut: "U", status: "enabled", tooltip: "Fibonacci fan rays from anchor" },
    ],
  },
  {
    id: "pitchforks",
    label: "Pitchforks",
    icon: "⋔",
    tools: [
      { id: "pitchfork", label: "Pitchfork", icon: "⋔", shortcut: "P", status: "enabled", tooltip: "Andrew's Pitchfork - median line with parallel tines" },
      { id: "schiffPitchfork", label: "Schiff Pitchfork", icon: "⋕", shortcut: "J", status: "enabled", tooltip: "Schiff Pitchfork - median starts from midpoint between p1 and base midpoint" },
      { id: "modifiedSchiffPitchfork", label: "Modified Schiff", icon: "⋖", shortcut: "D", status: "enabled", tooltip: "Modified Schiff - median starts at midpoint X, original p1 Y" },
    ],
  },
  {
    id: "patterns",
    label: "Patterns",
    icon: "📊",
    tools: [
      { id: "abcd", label: "ABCD Pattern", icon: "⋉", shortcut: "W", status: "enabled", tooltip: "AB=CD harmonic pattern (3-click, D computed)" },
      { id: "headAndShoulders", label: "Head & Shoulders", icon: "⩚", shortcut: "Q", status: "enabled", tooltip: "Head & Shoulders reversal pattern (5-click: LS, Head, RS, NL1, NL2)" },
      { id: "elliottWave", label: "Elliott Wave", icon: "∿", shortcut: "Z", status: "enabled", tooltip: "Elliott Wave Impulse pattern (6-click: 0→1→2→3→4→5)" },
    ],
  },
  {
    id: "measure",
    label: "Measure",
    icon: "📏",
    tools: [
      { id: "priceRange", label: "Price Range", icon: "↕", status: "enabled", tooltip: "Measure price difference" },
      { id: "dateRange", label: "Date Range", icon: "↔", status: "enabled", tooltip: "Measure time span" },
      { id: "dateAndPriceRange", label: "Date & Price Range", icon: "⤢", status: "enabled", tooltip: "Measure both price and time" },
      { id: "longPosition", label: "Long Position", icon: "📈", shortcut: "L", status: "enabled", tooltip: "Risk/Reward for long trade" },
      { id: "shortPosition", label: "Short Position", icon: "📉", shortcut: "S", status: "enabled", tooltip: "Risk/Reward for short trade" },
    ],
  },
];

/**
 * Get the default (first enabled) tool for a group
 */
export function getGroupDefaultTool(groupId: string): ToolDefinition | undefined {
  const group = TOOL_GROUPS.find(g => g.id === groupId);
  return group?.tools.find(t => t.status === "enabled") ?? group?.tools[0];
}

/**
 * Find which group a tool belongs to
 */
export function findToolGroup(toolId: string): ToolGroup | undefined {
  return TOOL_GROUPS.find(g => g.tools.some(t => t.id === toolId));
}

/**
 * Check if a tool is enabled (has engine support)
 */
export function isToolEnabled(toolId: string): boolean {
  for (const group of TOOL_GROUPS) {
    const tool = group.tools.find(t => t.id === toolId);
    if (tool) return tool.status === "enabled";
  }
  return false;
}

/**
 * Get all tools (flat list, regardless of status)
 * P3: Single source of truth for tests
 */
export function getAllToolsFlat(): ToolDefinition[] {
  return TOOL_GROUPS.flatMap(g => g.tools);
}

/**
 * Get all enabled tools (flat list)
 */
export function getEnabledTools(): ToolDefinition[] {
  return TOOL_GROUPS.flatMap(g => g.tools.filter(t => t.status === "enabled"));
}

/**
 * Get all disabled tools (flat list)
 * P3: For data-driven disabled tool tests
 */
export function getDisabledTools(): ToolDefinition[] {
  return TOOL_GROUPS.flatMap(g => g.tools.filter(t => t.status === "disabled"));
}

/**
 * Get all tools with shortcuts (flat list)
 * P3: For hotkey guardrail tests
 */
export function getToolsWithShortcuts(): ToolDefinition[] {
  return TOOL_GROUPS.flatMap(g => g.tools.filter(t => t.shortcut));
}

/**
 * P3: VALID_TOOL_IDS derived from registry (single source of truth)
 * Used by controls.ts for type validation
 */
export const VALID_TOOL_IDS = getEnabledTools().map(t => t.id) as string[];

/**
 * Validate tool ID is an enabled tool
 * P3: Derived from registry, not hardcoded
 */
export function isValidToolId(toolId: string): boolean {
  return VALID_TOOL_IDS.includes(toolId);
}

/**
 * TV-20.14 GUARDRAIL: Mapping from toolbar Tool ID → Drawing kind in dump().objects
 * 
 * This prevents confusion in tests where:
 * - dump().ui.activeTool === "trendline" (toolbar tool ID)
 * - dump().objects[].type === "trend" (drawing kind in state)
 * 
 * Usage in tests:
 *   import { toolToDrawingKind } from './toolRegistry';
 *   const kind = toolToDrawingKind("trendline"); // => "trend"
 *   await expect(dump.objects.some(o => o.type === kind)).toBe(true);
 */
export const TOOL_TO_DRAWING_KIND: Record<string, string> = {
  // Lines
  trendline: "trend",
  hline: "hline",
  vline: "vline",
  // Channels
  channel: "channel",
  flatTopChannel: "flatTopChannel",
  flatBottomChannel: "flatBottomChannel",
  regressionTrend: "regressionTrend",
  // Shapes
  rectangle: "rectangle",
  circle: "circle",
  ellipse: "ellipse",
  triangle: "triangle",
  // Text
  text: "text",
  // Fibonacci
  fibRetracement: "fibRetracement",
  fibExtension: "fibExtension",
  fibFan: "fibFan",
  // Pitchforks
  pitchfork: "pitchfork",
  schiffPitchfork: "schiffPitchfork",
  modifiedSchiffPitchfork: "modifiedSchiffPitchfork",
  // Measure
  priceRange: "priceRange",
  dateRange: "dateRange",
  dateAndPriceRange: "dateAndPriceRange",
  longPosition: "longPosition",
  shortPosition: "shortPosition",
};

/**
 * Convert toolbar tool ID to drawing kind (for test assertions)
 * @example toolToDrawingKind("trendline") => "trend"
 */
export function toolToDrawingKind(toolId: string): string | undefined {
  return TOOL_TO_DRAWING_KIND[toolId];
}

/**
 * Convert drawing kind to toolbar tool ID (reverse lookup)
 * @example drawingKindToTool("trend") => "trendline"
 */
export function drawingKindToTool(kind: string): string | undefined {
  for (const [toolId, drawingKind] of Object.entries(TOOL_TO_DRAWING_KIND)) {
    if (drawingKind === kind) return toolId;
  }
  return undefined;
}
