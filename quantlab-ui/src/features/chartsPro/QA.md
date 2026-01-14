# Charts Pro QA Helpers

The Charts Pro tab exposes a lightweight QA API whenever you run the UI with `/?mock=1` (or any non-production Vite mode).

- `window.__chartsHelpers` performs DOM-level interactions. Its `samplePriceCanvasPixelComposite` helper composites the LW canvas with the host background before sampling; `debug.lastSample` records `{ candidateIndex, canvasPixels, clientPixels, dpr, bgRgb, point, rgba, path }` so you can inspect exactly what pixel Playwright read.
- `window.__lwcharts.debug` (when available) wraps the helpers and adds `dumpBindings()` (canvas list + health), `scan()`, `paintProbeIfEmpty()` **and** `zoom(delta)` which dispatches a wheel event on the LW canvas so pan/zoom can be tested without moving the mouse manually. Debug helpers are only exposed in dev builds or when `/?mock=1` is present in production.
- Shared typings live in `qaTypes.ts`, so the React/Playwright/Test helpers stay in sync and DevTools autocompletion matches what the tests assert.
- Every time we set data, change theme, resize, or fit the chart we wait two `requestAnimationFrame` ticks before rebinding the helpers and firing a non-blocking `samplePixel()` to prime QA state.
- Pointer events stay disabled on the overlay wrapper (`pointer-events: none`) so `hoverAt()`/pan/zoom always reach LW. Use `window.__lwcharts.hoverAt('left'|'mid'|'right'|'first'|'last'|'anchor'|number)` to steer the crosshair directly.

## Enabling debug in production

- Launch the preview with `/?mock=1` (or toggle the "Mock data" switch). This sets `window.__cpMock` and rebinds the helpers with debug enabled.
- The Charts Pro card shows the current build banner: `Charts Pro — build <sha> @ <time> — LW <version> — <LLM_NOTE>`. The `LLM_NOTE` value is injected via `.env`/CI so you can confirm which QA patch is rolled out.

See `docs/LLM.md#cp-vis-qa-mode` for the workflow and `quantlab-ui/tests/chartsPro.cp{2,7,8}.spec.ts` for concrete checks (alpha > 0 in Light/Dark, hover parity, compare guards, zoom assertions).
