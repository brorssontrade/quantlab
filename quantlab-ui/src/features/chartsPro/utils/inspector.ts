/**
 * Normalize inspector tab alias to canonical form ("objectTree" | "dataWindow").
 * Accepts multiple aliases and normalizes them safely.
 */
export function normalizeInspectorTab(input: unknown): "objectTree" | "dataWindow" | undefined {
  if (typeof input !== "string") return undefined;
  const v = input.trim().toLowerCase();
  const map: Record<string, "objectTree" | "dataWindow"> = {
    objecttree: "objectTree",
    objects: "objectTree",
    "object-tree": "objectTree",
    tree: "objectTree",
    datawindow: "dataWindow",
    data: "dataWindow",
    "data-window": "dataWindow",
    window: "dataWindow",
  };
  return map[v];
}
