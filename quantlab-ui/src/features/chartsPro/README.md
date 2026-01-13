# Charts Pro Notes

This directory hosts the TradingView-style "Charts Pro" tab (candles, compares, overlays, QA helpers).

## QA / Debug mode

- The helper module `testingApi.ts` is imported for its side-effects, wiring `window.__chartsHelpers` and `window.__lwcharts`.
- Debug helpers (scan, paintProbeIfEmpty, dumpBindings, zoom) are always available in dev builds. In production bundles, add `/?mock=1` (or toggle the mock-switch in the UI) to enable them.
- The Charts Pro card shows `LLM_NOTE` in its build banner, so you can verify which QA patch is currently deployed.
- Extra docs live in `QA.md` and `docs/LLM.md#cp-vis-qa-mode`. See the Playwright specs (`tests/chartsPro.cp*.spec.ts`) for practical examples (hover aliases, composite sampling, zoom assertions).
