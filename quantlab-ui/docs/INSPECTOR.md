# ChartsPro Inspector (CP9) – rätt-dockad objektpanel

**Syfte**: Inspektera och hantera alla aktiva renderade objekt (candles, volym, compares, overlays) och se live hover-data med tidspunkt, OHLCV och compare-procent.

## Arkitektur
- **InspectorSidebar.tsx**: React-komponent som renderar två tabbar (Object Tree + Data Window) i en 288px-bred sidebar på höger sida.
  - **Object Tree**: grupperad lista över PRICE/VOLUME/COMPARES/INDICATORS med toggle-visibility-knappar och remove-knapp (removable för compares/overlays).
  - **Data Window**: visar live hover-data (tid, base OHLCV, compare-priser + procent) eller senaste legendvärden om ingen hover.
  - Styling: Tailwind Dark (slate-900/800), flex-layout för stabil höjd när panelen opens/close.

- **ChartViewport.tsx**: hantering av Inspector-state:
  - `inspectorOpen` (boolean) + `inspectorTab` ("objectTree" | "dataWindow") lagras i `localStorage` under `chartspro.inspector.open` / `chartspro.inspector.tab`.
  - `normalizeInspectorTab()` konverterar aliases ("data" → "dataWindow", "objects" → "objectTree" etc.) till kanonisk form före lagring.
  - `buildInspectorObjects()` skapar lista över alla aktiva objekt med ID, typ (base/volume/compare/overlay/pane-indicator), titel och färg-hint.
  - `dump().ui` exponerar `inspectorOpen` + `inspectorTab` (kanonisk form), `dump().render.objects` innehåller den byggda objektlistan.
  - Event-lyssnarec för `"lwcharts:patch"` CustomEvent så QA kan dispatcha `__lwcharts.set({ inspectorOpen: true, inspectorTab: "dataWindow" })`.

- **ChartsProTab.tsx**: global QA-setter som normaliserar `inspectorTab` innan CustomEvent-dispatch.

## State & persistence
```typescript
// localStorage-nycklur
"chartspro.inspector.open": "true" | "false"
"chartspro.inspector.tab": "objectTree" | "dataWindow"

// dump().ui exponerar
{
  inspectorOpen: boolean,
  inspectorTab: "objectTree" | "dataWindow",
}

// dump().render innehåller
{
  objects: [
    { id: "base-0", kind: "base", title: "Candles", paneId: "main", visible: true, removable: false, colorHint: "#fff" },
    { id: "compare-ABB.ST", kind: "compare", title: "ABB.ST", paneId: "main", visible: true, removable: true, colorHint: "#f97316" },
    ...
  ]
}
```

## QA-kontrakt & normalisering
Canonical tab-värden är `"objectTree"` och `"dataWindow"`. `normalizeInspectorTab()` accepterar alias:
- **objectTree**: "objecttree", "objects", "object-tree", "tree"
- **dataWindow**: "datawindow", "data", "data-window", "window"

Exempel:
```typescript
// Alla dessa normaliseras till "dataWindow"
__lwcharts.set({ inspectorTab: "data" });
__lwcharts.set({ inspectorTab: "Data Window" });
__lwcharts.set({ inspectorTab: "window" });
```

## Layout & flex
- Inspector sidebar: `flex: 0 0 288px` (fixed width, no shrink), `border-l` separerar från canvas.
- ChartViewport: `flex-row` layout med `fitToContent()` triggrar när panelen opens/close så canvas behåller samma höjd.
- Data Window hover: samplar från `hoverStateRef` (uppdateras via `handleHover()` från LW-events) eller `legendStateRef` om ingen aktiv hover.

## Handler-callback
- `onToggleVisible(id)`: togglar `hidden` på compare eller overlay, utlöser `setData()` + `fitContent()`.
- `onRemove(id)`: tar bort compare/overlay från state, uppdaterar refs, triggerResize.
- Tab-switch: kör `setInspectorTab()` → localStorage → inte ytterligare re-render.

## Playwright-test
- `tests/chartsPro.inspector.spec.ts`: testar öppna/stänga, tab-switch, toggle visibility, remove compare.
- Deterministiska waits på `dump().ui.inspectorOpen` + `dump().render.objects.length`.
- Ingen arbitrary timeouts, all väntar in dump() fields.

## Repro-steg (lokal dev)
```bash
cd quantlab-ui
npm run dev                    # Startar Vite + FastAPI proxy
# Gå till http://localhost:5173/?mock=1#/charts
# Klicka på "Charts Pro"-tabben
# Höger-sidebar bör visas med Object Tree
# Klicka "Data Window"-tabben → visar hover-data
# Lägg till compare, toggle visibility
```

## Repro-steg (Playwright)
```bash
npm run test:chartspro:headed  # Kör tests med browser open
# eller
npm run test:chartspro         # Headless
```

## Implementationsdetaljer
- **Indentation-fix**: `InspectorSidebar.tsx` hade ointentat extra indentation som orsakade TDZ-fel i minifier. Fixades genom att normalisera all funktionsbrödtext.
- **Normalisering**: `normalizeInspectorTab()` definieras inline i både `ChartViewport.tsx` och `ChartsProTab.tsx` för att undvika cirkularreferenser (ChartViewport importeras av ChartsProTab).
- **Event-dispatch**: CustomEvent `"lwcharts:patch"` skickas från ChartsProTab när `set()` anropas med `inspectorOpen` eller `inspectorTab`; ChartViewport lyssnar och uppdaterar state.
- **Persistence**: Båda state-variabler sparas till localStorage samma gång de uppdateras via `setInspectorOpen()` och `setInspectorTab()`.

## Framtida förbättringar
- ID-encoding: Uppdatera objekt-ID:n för att bättre reflektera objekttyp/paneId för determinism.
- Scroll-state: Spara scroll-position i Inspector för stora objekt-listor.
- Favoriter: Tillåta användare att spara favorit-objekt och jumpa snabbt.
