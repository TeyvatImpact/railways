# Teyvat Railways — AGENTS.md

## Quick start

```
pnpm install
pnpm dev        # vite dev server at localhost:5173
pnpm build      # vite build → dist/ (vite `base` is default; not `/tr`) 
pnpm preview    # vite preview of built dist/
```

Typecheck: `npx vue-tsc --noEmit` (no npm script exists for it).

Format: `pnpm format` (runs `oxfmt`). Run before every commit.

No lint or test scripts configured.

## Architecture

```
src/main.ts → src/style.css          (Tailwind CSS v4 via @tailwindcss/vite)
           → src/App.vue             (imports Varlet UI + router; renders <router-view /> only)
           → src/router/index.ts
              ├── /         → src/views/HomeView.vue    (the map page, see tree below)
              └── /display  → src/views/display/index.vue (lazy; static per-line SVG strips)
```

`HomeView.vue` (the `/` route):

```
HomeView.vue
├── TitleBar                (top bar, in flow; emits open / open-ai / toggle-theme / toggle-admin)
├── .app-body (flex row)
│   ├── .map-area (flex: 1)
│   │   └── RailwayMap      (emits station-click; renders MapControls internally)
│   └── RoutePanel          (width: 320px; receives map clicks via expose; hosts RouteTimeline)
├── InfoDialog              (modal overlay; markdown intro)
├── AiPromptDialog          (modal overlay; dev button currently hidden in TitleBar)
└── AdminPanel              (modal overlay; dev-only)

All three dialogs render through components/DialogWindow.vue.
```

`views/display/index.vue` (the `/display` route) is a separate, self-contained renderer: it does **not** use `useMapData` — it re-reads the region JSONs, lays every line out as a fixed 1920×200 SVG strip with stations spaced by index (coordinates are irrelevant there), and takes colors from `palette` in `config/render.config.ts`.

| Layer       | File                               | Role                                                                                                                      |
| ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Entry       | `main.ts`                          | Mounts `App.vue` with Varlet UI + router; imports `style.css` first                                                       |
| App         | `App.vue`                          | Renders `<router-view />` only                                                                                            |
| Routing     | `router/index.ts`                  | Two routes: `/` → `HomeView.vue`, `/display` → `views/display/index.vue` (lazy)                                           |
| Page        | `views/HomeView.vue`               | Map page: TitleBar + (map \| RoutePanel) + InfoDialog/AiPromptDialog/AdminPanel, first-visit dialog trigger               |
| Page        | `views/display/index.vue`          | Static per-line SVG strip renderer on `/display`; index-based layout, ignores coordinates                                 |
| App         | `TitleBar.vue`                     | Top title bar + "关于" button                                                                                             |
| App         | `InfoDialog.vue`                   | Modal showing intro.md via `markdown-exit` + `github-markdown-css`                                                        |
| Map         | `RailwayMap.vue`                   | SVG viewport with pan/zoom, grid lines, segments, stations, labels, markers; emits `station-click`                        |
| Routing     | `RoutePanel.vue`                   | Right sidebar: fuzzy-search dropdown, map pick mode, calculate button, multi-route option list, RouteTimeline detail view |
| Overlays    | `MapControls.vue`                  | Fixed bottom-left zoom +/- buttons and mouse coordinate readout (data-space x,y); rendered inside RailwayMap              |
| Data        | `composables/useMapData.ts`        | Imports region JSON + ferry.json + same.json, computes segments with line offsetting for parallel tracks                  |
| Interaction | `composables/useMapInteraction.ts` | Mouse drag/scroll, touch pan/pinch-zoom; persists viewport to localStorage                                                |
| UI          | `composables/useTheme.ts`          | Light/dark theme ref, Varlet MD3 StyleProvider swap, persisted to localStorage                                            |
| UI          | `components/DialogWindow.vue`      | Shared modal shell used by InfoDialog, AiPromptDialog and AdminPanel                                                      |
| Labels      | `composables/useLabelPlacement.ts` | Label box layout + leader lines via `@chenglou/pretext`                                                                   |
| **Routing** | **`composables/useRouting.ts`**    | **Graph builder (node = prefix-stationId-lineId), Dijkstra multi-source/multi-target, fuzzy station search**              |
| Routing     | `components/RouteTimeline.vue`     | Detailed route timeline view with stations, line colors, and fare/time/distance stats                                     |
| Data        | `scripts/migrate-data-v2.cjs`      | Migration script that extracts fare/time/distance from station tuples into standalone stationDistances arrays             |
| Dev         | `components/AdminPanel.vue`        | Floating data editor (dev-only) — edit station names and segment costs via web UI                                         |
| Dev         | `vite.config.ts`                   | Admin API middleware (`GET/PUT /__admin/data/*`) for reading/writing JSON files in dev mode                               |
| Config      | `config/render.config.ts`          | All render constants (fonts, palette, spacing, special line colors)                                                       |
| Config      | `config/fare-presets.json`         | Fare/speed presets (farePerKm, minutesPerKm); used by lines' `costPreset` field                                           |

## Data

All data is JSON stored in `src/data/`. No CSV files.

**IMPORTANT**: When working with these files, do NOT always read them in full — they can be large (e.g. `teyvat.json` is ~2000 lines). Read only the first ~30-40 lines to understand structure, or use `grep` to find specific stations/lines by ID or name. The schemas below describe the structure precisely — rely on them instead of full file reads.

Region files, each with structure `{ config, stations, lines, stationDistances }`:

| File             | Config prefix | Config font                                                 |
| ---------------- | ------------- | ----------------------------------------------------------- |
| `teyvat.json`    | `"Teyvat"`    | `"Noto Sans SC"`                                            |
| `inazuma.json`   | `"Inazuma"`   | `"Noto Serif JP"` (loaded via Google Fonts in `index.html`) |
| `liyue.json`     | `"Liyue"`     | `"Noto Sans SC"`                                            |
| `snezhnaya.json` | `"Snezhnaya"` | `"Noto Sans SC"`                                            |

`mark.json` contains `{ paths, texts }` for annotation overlays.

Two special line files:

| File         | `lineType`       | Visual style                           |
| ------------ | ---------------- | -------------------------------------- |
| `ferry.json` | `"ferry"`        | Thin dark blue dashed line             |
| `same.json`  | `"same-station"` | Thin semi-transparent black solid line |

### Region file schema (`teyvat.json`, `inazuma.json`, `liyue.json`, `snezhnaya.json`)

```jsonc
{
  "config": { "x": number, "y": number, "name": string, "fontFamily": string },
  "stations": [
    { "id": string, "nameCn": string, "nameZh"?: string, "nameEn": string, "x": number, "y": number, "labelDir"?: string }
    // labelDir: one of "L","R","T","B","LT","LB","RT","RB"
  ],
  "lines": [
    {
      "id": string,
      "name": string,
      "nameZh"?: string,
      "nameEn": string,
      "costPreset": string,
      "lineLabels"?: [ [stationId, position], ... ],
      "stations": [ [stationId, diagonalFirst], ... ]
    }
  ],
  "stationDistances": [
    { "from": string, "to": string, "distance": number }
  ]
}
```

### Special line files

**`ferry.json`** — `{ lines: [{ id, name, nameEn, "lineType": "ferry", stations: [[prefixedId, false], ...] }], stationDistances: [{ from, to, distance }] }`  
**`same.json`** — `{ lines: [{ id, name, nameEn, "lineType": "same-station", stations: [[prefixedId, false], ...] }], stationDistances: [{ from, to, distance }] }`

Ferry and same-station lines use **already-prefixed** station IDs (e.g. `"Teyvat-LYS"`) to reference stations across region files. They are not re-prefixed at runtime. Their `stationDistances` entries likewise use prefixed IDs.

### Annotation file (`mark.json`)

```jsonc
{
  "paths": [
    { "d": string, "stroke"?: string }   // SVG path data (data-space coords)
  ],
  "texts": [
    { "content": string, "x": number, "y": number, "fontSize"?: number, "fontFamily"?: string }
  ]
}
```

### Station/line field details

- **`id`** (station): Short uppercase code, e.g. `"LYH"`, `"RTP"`. Gets runtime prefix → `"Teyvat-LYH"`.
- **Cross-region reference**: A region line may reference a station owned by another region by writing its **already-prefixed** id, e.g. `["Teyvat-STR", false]` inside `snezhnaya.json`. `regionStationId()` in `useMapData.ts` passes any id containing `-` through untouched (applies to `stations`, `lineLabels`, and `stationDistances`). Raw station ids must therefore NEVER contain `-`.
- **`labelDir`**: Optional, one of `L`/`R`/`T`/`B`/`LT`/`LB`/`RT`/`RB`. Controls label offset direction from station point.
- **`diagonalFirst`**: Controls path routing for non-axis-aligned segments (`true` = diagonal→orthogonal, `false` = orthogonal→diagonal).
- **`lineLabels`**: Optional array of `[stationId, position]` — instructs renderer where to place the line's name label relative to that station.
- **`config.x`/`config.y`**: Origin offset applied to all station coordinates in that region at runtime.
- **Station tuple**: `[stationId, diagonalFirst]` — fare/time/distance are no longer stored inline. See `stationDistances` below.
- **`costPreset`**: Each line selects a fare/speed preset from `config/fare-presets.json`. Determines `farePerKm` and `minutesPerKm` for cost computation.
- **`stationDistances`**: Array of `{ from, to, distance }` where `from`/`to` are sorted alphabetically (direction-independent). Distance is in kilometers.
- **Cost computation**: fare = distance × farePerKm (摩拉), time = distance × minutesPerKm (分钟). Computed at runtime in `useMapData.ts` and `useRouting.ts`.

## Routing (`useRouting.ts`)

**Graph construction** (built once at module load):

| Edge type                          | Cost metric                    | Description                                               |
| ---------------------------------- | ------------------------------ | --------------------------------------------------------- |
| Line adjacency                     | Actual fare (dist × farePerKm) | Consecutive stations on the same regular/ferry line       |
| Transfer (same-station)            | 0                              | Two lines sharing the same physical station (same prefix) |
| Cross-network transfer (same.json) | 0                              | Connections defined in `same.json` (different prefix)     |

**Node format**: `` `${stationFullId}-${lineId}` ``, e.g. `Teyvat-LYH-A`, `Liyue-KYB-ferry-kyb-rtp`.

**`findRoute(startStationId, endStationId, metric)`**: gathers ALL line-nodes for each physical station, runs Dijkstra with virtual multi-source / multi-target (all start-nodes at dist 0, stop when any end-node is reached). `metric` is one of `'fare'` (default), `'time'`, or `'distance'` — Dijkstra uses the corresponding value from the edge metrics as weight.

**`findRoutes(startStationId, endStationId)`**: calls `findRoute` for all three metrics (`fare`, `time`, `distance`) and returns an array of up to 3 results.

**`searchStations(query)`**: fuzzy match against `nameCn`, `nameEn`, `id`, short ID; returns up to 20 `StationSuggestion` entries with line info.

**Result**: JSON blob with `{ segments, pathNodeIds, totalFare, totalTime, totalDistance }`.

## Conventions

- **Coordinates**: data units × `BLOCK_SIZE` (50px). SVG viewport sized to data bounds with configurable `margin`.
- **Label fonts**: Inazuma stations use `"Noto Serif JP", serif` from Google Fonts; others use `"Noto Sans SC"`.
- **Label sizes**: Fixed small size (`fsCNSmall: 12`, `fsENSmall: 8`). No zoom-dependent switching.
- **nameZh (Inazuma)**: Inazuma stations/lines carry an extra `nameZh` field (Chinese translation). When present, labels render three lines: JP name → CN name (zhX) → EN name. CN text uses `"Noto Serif SC"` at EN font size.
- **Line palette**: Cycles through 20 colors in `render.config.ts`.
- **Parallel tracks**: Shared segments are offset by `LINE_WIDTH` per line, centered.
- **Viewport persistence**: Pan/zoom saved to localStorage key `teyvat-railways-map-state`.
- **All imports**: Use `@/*` path alias → `./src/*`.
- **SVG isolation**: RailwayMap.vue uses ONLY inline styles (`fill`, `stroke`, SVG attributes) — no Tailwind CSS classes. This allows the SVG to be copy-pasted as a standalone SVG file.
- **UI styling**: All other Vue components CAN use Tailwind utility classes (`flex`, `p-4`, `text-sm`, etc.).

## CSS / Tailwind

- **Tailwind CSS v4** with `@tailwindcss/vite` plugin (configured in `vite.config.ts`).
- No `tailwind.config.js` / `postcss.config.js` needed (v4 zero-config).
- Entry: `src/style.css` → `@import "tailwindcss"` — imported first in `src/main.ts`.
- **Do NOT use Tailwind classes inside RailwayMap.vue's template** — the SVG must remain self-contained for export.

## Commit convention

All commits MUST follow [Conventional Commits](https://www.conventionalcommits.org/) and be written in **English**.

```
feat: add multi-route navigation with fare/time/distance optimization
fix: correct station label positioning at zoom boundaries
refactor: extract Dijkstra weight function into helper
docs: update AGENTS.md with new routing schema
chore: add migration script for station distances
data: add Inazuma ferry lines (Higii Village ↔ Watatsumi East, Inazuma City ↔ Tsurumi Port)
```

Scopes are optional but encouraged when relevant (e.g. `feat(routing)`, `fix(map)`).  
Use `data:` prefix for commits that only change JSON data (no code changes).

## Before committing

1. **Format**: Run `pnpm format` (oxfmt) — this MUST be done before every commit.
2. **AGENTS.md**: When making logical changes (new features, schema updates, refactors), update this file to reflect the new state.

## Gotchas

- `dist/` is **not** tracked — `.gitignore` ignores `/dist`; `pnpm build` regenerates it locally.
- Router history base is `/tr` (`createWebHistory('/tr')` in `router/index.ts`), but `vite.config.ts` sets no `base`, so `dist/index.html` references `/assets/*` from the domain root.
- Data imports in `useMapData.ts` use short names (`teyvat.json`, `inazuma.json`, etc.). If you add a new region, mirror this pattern.
- Region lists are hardcoded in every consumer — adding a region file requires touching **all** of: `composables/useMapData.ts` (import + prefix loops + distances), `views/display/index.vue` (`allRegionData` + `getStation` prefixes), `components/AiPromptDialog.vue` (`allRegions`), `components/AdminPanel.vue` (`fileKeys`/`regionKeys`), and `vite.config.ts` (`ALLOWED_FILES`).
- `vue-tsc` is in devDeps but has no npm script — run via `npx vue-tsc --noEmit`.
- Manual verification only: run `pnpm dev` and check the browser.
- Ferry/same-station JSON files don't have their own stations — lines reference prefixed station IDs (e.g. `Teyvat-LYS`) directly. These lines are not run through the standard prefix step.
- `intro.md` is imported via `?raw` in `InfoDialog.vue` and rendered with `markdown-exit`. The modal has `github-markdown-css` with transparent background override.
- First visit detection uses localStorage key `teyvat-railways-visited`.
- AdminPanel (🛠 button, dev-mode only) exposes a GUI for editing station names, line names, cost presets, and station distances; changes write back via `PUT /__admin/data/*` and Vite HMR auto-reloads the app.
- RoutePanel exposes `onStationClick(stationId)` via `defineExpose` — App.vue calls it when RailwayMap emits `station-click`.
- RoutePanel now shows a multi-route option list (fare/time/distance) after calculation; clicking one opens the RouteTimeline detail view, clicking × returns to the list.
- `useRouting.ts` builds the graph eagerly at module import time (synchronous, runs once).
