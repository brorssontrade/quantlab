// Global helper function for QA/test mode detection
export function shouldExposeQaDebug(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("expose-qa") || params.has("mock");
}

// Expose globally for usage in ChartViewport
if (typeof window !== "undefined") {
  (window as any).shouldExposeQaDebug = shouldExposeQaDebug;
}
