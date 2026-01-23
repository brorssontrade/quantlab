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

import type { Tool } from "../../state/controls";

export type ToolStatus = "enabled" | "disabled";

export interface ToolDefinition {
  id: Tool | string; // Tool for enabled, string for future tools
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
      { id: "ray", label: "Ray", icon: "↗", status: "disabled", tooltip: "Coming soon" },
      { id: "extended", label: "Extended Line", icon: "↔", status: "disabled", tooltip: "Coming soon" },
    ],
  },
  {
    id: "channels",
    label: "Channels",
    icon: "⫴",
    tools: [
      { id: "channel", label: "Parallel Channel", icon: "⫴", shortcut: "C", status: "enabled" },
      { id: "regression", label: "Regression Channel", icon: "⋰", status: "disabled", tooltip: "Coming soon" },
      { id: "flatTop", label: "Flat Top/Bottom", icon: "⊏", status: "disabled", tooltip: "Coming soon" },
    ],
  },
  {
    id: "shapes",
    label: "Shapes",
    icon: "□",
    tools: [
      { id: "rectangle", label: "Rectangle", icon: "□", shortcut: "R", status: "enabled" },
      { id: "circle", label: "Circle", icon: "○", status: "disabled", tooltip: "Coming soon" },
      { id: "ellipse", label: "Ellipse", icon: "◯", status: "disabled", tooltip: "Coming soon" },
      { id: "triangle", label: "Triangle", icon: "△", status: "disabled", tooltip: "Coming soon" },
    ],
  },
  {
    id: "text",
    label: "Text & Notes",
    icon: "T",
    tools: [
      { id: "text", label: "Text", icon: "T", shortcut: "N", status: "enabled" },
      { id: "note", label: "Note", icon: "📝", status: "disabled", tooltip: "Coming soon" },
      { id: "callout", label: "Callout", icon: "💬", status: "disabled", tooltip: "Coming soon" },
    ],
  },
  {
    id: "fibonacci",
    label: "Fibonacci",
    icon: "🔢",
    tools: [
      { id: "fibRetracement", label: "Fib Retracement", icon: "⧗", shortcut: "F", status: "enabled", tooltip: "Fibonacci retracement levels" },
      { id: "fibExtension", label: "Fib Extension", icon: "⧕", status: "disabled", tooltip: "Coming soon" },
      { id: "fibFan", label: "Fib Fan", icon: "⫿", status: "disabled", tooltip: "Coming soon" },
    ],
  },
  {
    id: "patterns",
    label: "Patterns",
    icon: "📊",
    tools: [
      { id: "headShoulders", label: "Head & Shoulders", icon: "⩚", status: "disabled", tooltip: "Coming soon" },
      { id: "elliottWave", label: "Elliott Wave", icon: "∿", status: "disabled", tooltip: "Coming soon" },
      { id: "abcd", label: "ABCD Pattern", icon: "⋉", status: "disabled", tooltip: "Coming soon" },
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
      { id: "longPosition", label: "Long Position", icon: "📈", status: "disabled", tooltip: "Coming soon" },
      { id: "shortPosition", label: "Short Position", icon: "📉", status: "disabled", tooltip: "Coming soon" },
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
 * Get all enabled tools (flat list)
 */
export function getEnabledTools(): ToolDefinition[] {
  return TOOL_GROUPS.flatMap(g => g.tools.filter(t => t.status === "enabled"));
}

/**
 * Validate tool ID matches controls.ts Tool type
 */
export function isValidToolId(toolId: string): toolId is Tool {
  const validTools = ["select", "trendline", "hline", "vline", "channel", "rectangle", "text", "priceRange", "dateRange", "dateAndPriceRange"];
  return validTools.includes(toolId);
}
