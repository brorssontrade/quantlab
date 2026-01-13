import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./lib/qaHelper";

// Ensure a global __lwcharts stub with a persistent set() merger is always available.
if (typeof window !== "undefined") {
  const w = window as unknown as {
    __lwcharts?: Record<string, unknown> & {
      set?: (patch: Record<string, unknown>) => unknown;
      _applyPatch?: (patch: Record<string, unknown>) => void;
      _pendingPatch?: Array<Record<string, unknown>>;
    };
  };
  const installStub = () => {
    const setter = (patch: Record<string, unknown>) => {
      const target = { ...(w.__lwcharts ?? {}) } as Record<string, unknown>;
      if (patch) {
        Object.entries(patch).forEach(([key, value]) => {
          if (value !== undefined) {
            if (key === "debug" && typeof value === "object" && value !== null) {
              const nextDebug = {
                ...(target.debug as Record<string, unknown> | undefined),
                ...(value as Record<string, unknown>),
              };
              target.debug = nextDebug;
            } else {
              target[key] = value;
            }
          }
        });
      }
      try {
        const isQa = (typeof window !== "undefined" && window.location.search.includes("mock=1")) || import.meta.env.DEV;
        if (isQa) {
          const dbg = (target.debug as Record<string, unknown> | undefined) ?? {};
          if (typeof dbg.zoom !== "function") {
            dbg.zoom = () => false;
          }
          if (typeof dbg.pan !== "function") {
            dbg.pan = () => false;
          }
          target.debug = dbg;
        }
      } catch {
        // ignore qa guard errors
      }
      target.set = setter;
      if (!Array.isArray(target._pendingPatch)) {
        target._pendingPatch = [];
      }
      w.__lwcharts = target;
      try {
        const apply = target._applyPatch as ((p: Record<string, unknown>) => void) | undefined;
        if (apply) {
          // flush pending first
          const pending = Array.isArray(target._pendingPatch) ? target._pendingPatch : [];
          pending.splice(0).forEach((pendingPatch) => {
            try {
              apply(pendingPatch);
            } catch {
              // ignore
            }
          });
          apply(patch);
        } else if (patch && (patch as Record<string, unknown>).timeframe !== undefined) {
          // stash patch until applyPatch appears
          (target._pendingPatch as Array<Record<string, unknown>>).push(patch);
        }
      } catch {
        // ignore patch errors in stub
      }
      return target;
    };
    if (typeof w.__lwcharts?.set !== "function") {
      const base = (w.__lwcharts as Record<string, unknown> | undefined) ?? {};
      base.set = setter;
      w.__lwcharts = base;
    } else {
      w.__lwcharts.set = setter;
    }
  };
  installStub();
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  requestAnimationFrame(() => {
    const tvIframe = !!document.querySelector('iframe[src*="tradingview"]');
    // @ts-expect-error deliberate runtime guard
    const tvGlobal = typeof window.TradingView !== "undefined";
    if (tvIframe || tvGlobal) {
      console.error("TradingView artifact detected", { tvIframe, tvGlobal });
    }
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

