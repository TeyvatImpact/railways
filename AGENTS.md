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
              └── /display  → src/views/display/index.vue (lazy; static per-line HTML/CSS strips)
```

`HomeView.vue` (the `/` route):

```
HomeView.vue
├── TitleBar                (top bar, in flow; emits open / toggle-theme / toggle-admin)
├── .app-body (flex row)
│   ├── .map-area (flex: 1)
│   │   └── RailwayMap      (emits station-click; renders MapControls internally)
│   └── RoutePanel          (width: 320px; receives map clicks via expose; hosts RouteTimeline)
├── InfoDialog              (modal overlay; markdown intro)
└── AdminPanel              (modal overlay; dev-only)

Both dialogs render through components/DialogWindow.vue.
```

`views/display/index.vue` (the `/display` route) is a static strip-diagram renderer in the style of an in-car metro map. It reads `lines` / `stationMap` from `useMapData.ts`, keeps **rail lines only** (`lines.filter((l) => !l.lineType)` → 35 strips; ferries and same-station links are skipped), and lays **one strip per line** out as a fixed 1920×280 panel (plain HTML + CSS — no SVG) with stations spaced by index (coordinates are irrelevant there). Each strip draws the line's **variant with the most stations** (ties → the first one, i.e. normally the full-length service); the other variants (小交路 / 支线) get **no marking at all** on the strip — forked branch stations are simply absent.

Panel anatomy: a line-coloured frame, a top-left header (线路名称 badge leftmost → 运营公司 → 运营主体, names only — no captions — every Chinese name at 22px/700 with an 11px/400 English line, plus the optional third line such as Snezhnaya's Russian), white numbered station circles on the line, station names slanted 45° below the line (CN/JP → Inazuma's `nameZh` → EN), and 换乘徽章 above the line — the other rail lines serving that station, drawn as small badges in their own colour with a leader line down to the circle. Layout is **pure CSS** in `views/display/index.vue`: `.strip` is a `1920×280` grid whose 8 rows are 页头 / 徽章两行 / 引线通道 / 主线 / 站名, and whose columns are `${EDGE}px repeat(N-1, 1fr) ${EDGE}px` — so the first and last stations always sit exactly `EDGE` (= 64px, `stripModel.ts`) from the content box on every strip, whatever the station count, and the track spans only terminal-to-terminal; alignment, centring and the 45° station-name rotation (`transform: rotate(45deg)` about the block's top-left) all come from CSS. The pure module `views/display/stripModel.ts` (`buildStrip`, `textOn`, `readableOn`) only decides the non-CSS bits — text content, which badge row a cluster takes, how far a right-edge station's name must slide back (`--label-shift`), and how far a badge cluster near an edge must be pushed in (`--badge-shift`); it injects text widths (`MeasureFn`, satisfied by `measureText` from `useLabelPlacement.ts`), so those decisions can be asserted without a browser. `views/display/variantStrip.ts` (`pickDisplayVariant`) picks that variant and stays pure.

| Layer       | File                                | Role                                                                                                                                                                                                                             |
| ----------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry       | `main.ts`                           | Mounts `App.vue` with Varlet UI + router; imports `style.css` first                                                                                                                                                              |
| App         | `App.vue`                           | Renders `<router-view />` only                                                                                                                                                                                                   |
| Routing     | `router/index.ts`                   | Two routes: `/` → `HomeView.vue`, `/display` → `views/display/index.vue` (lazy)                                                                                                                                                  |
| Page        | `views/HomeView.vue`                | Map page: TitleBar + (map \| RoutePanel) + InfoDialog/AdminPanel, first-visit dialog trigger                                                                                                                                     |
| Page        | `views/display/index.vue`           | Static rail-only strip renderer on `/display`; reads `useMapData` + `buildStrip`, lays each `StripModel` out with a CSS grid (fixed terminal margins, header, numbered stations, 45° labels, 换乘徽章)                           |
| Page        | `views/display/stripModel.ts`       | Pure strip model (`buildStrip`, `EDGE`): texts, badge row per cluster, `--label-shift` / `--badge-shift` clamps; text widths injected via `MeasureFn` — no pixel layout (that is CSS)                                            |
| Page        | `views/display/variantStrip.ts`     | Pure variant selection for `/display`: `pickDisplayVariant` (longest variant only)                                                                                                                                               |
| App         | `TitleBar.vue`                      | Top title bar + "关于" button                                                                                                                                                                                                    |
| App         | `InfoDialog.vue`                    | Modal showing intro.md via `markdown-exit` + `github-markdown-css`                                                                                                                                                               |
| Map         | `RailwayMap.vue`                    | SVG viewport with pan/zoom, grid lines, segments, stations, labels, markers; emits `station-click`                                                                                                                               |
| Routing     | `RoutePanel.vue`                    | Right sidebar: fuzzy-search dropdown, map pick mode, calculate button, multi-route option list, RouteTimeline detail view                                                                                                        |
| Overlays    | `MapControls.vue`                   | Fixed bottom-left zoom +/- buttons and mouse coordinate readout (data-space x,y); rendered inside RailwayMap                                                                                                                     |
| Data        | `composables/useMapData.ts`         | Imports region JSON + ferry.json + same.json, flattens every line's `variants` into unique station pairs, computes segments with line offsetting for parallel tracks                                                             |
| Interaction | `composables/useMapInteraction.ts`  | Mouse drag/scroll, touch pan/pinch-zoom; persists viewport to localStorage                                                                                                                                                       |
| UI          | `composables/useTheme.ts`           | Light/dark theme ref, Varlet MD3 StyleProvider swap, persisted to localStorage                                                                                                                                                   |
| UI          | `composables/useRenderMode.ts`      | Line-connection mode ref; `straight` (default) / `curve` (Catmull-Rom). Dormant: no UI control, no persistence                                                                                                                   |
| Render      | `composables/useCurveGeometry.ts`   | Chains station pairs per line and converts each pair to a centripetal Catmull-Rom cubic; returns one entry per renderSegment, index-aligned                                                                                      |
| UI          | `components/DialogWindow.vue`       | Shared modal shell used by InfoDialog and AdminPanel                                                                                                                                                                             |
| Labels      | `composables/useLabelPlacement.ts`  | Label box layout + leader lines via `@chenglou/pretext`                                                                                                                                                                          |
| **Routing** | **`composables/useRouting.ts`**     | **Graph builder (node = `stationId-lineId#variantIndex`), Dijkstra multi-source/multi-target, fuzzy station search**                                                                                                             |
| Routing     | `components/RouteTimeline.vue`      | Detailed route timeline view with stations, line colors, and fare/time/distance stats                                                                                                                                            |
| Data        | `scripts/migrate-data-v2.cjs`       | Migration script that extracts fare/time/distance from station tuples into standalone stationDistances arrays                                                                                                                    |
| Data        | `scripts/migrate-connections.cjs`   | One-shot migration that moved every station pair's distance and waypoints from the per-file `stationDistances` arrays and line station tuples into the global `connections.json`, and turned line `stations` into bare id arrays |
| Data        | `scripts/migrate-line-variants.cjs` | One-shot migration that wrapped every line's `stations` into `variants: [{ stations }]` and built the 大小交路 / 支线 variants of `M1`, `A`, `L2`, `K2` (+`K2-B`), `K3` (+`K3-B`)                                                |
| Dev         | `components/AdminPanel.vue`         | Floating data editor (dev-only) — edit station names, per-variant line names and connection distances via web UI                                                                                                                 |
| Dev         | `vite.config.ts`                    | Admin API middleware (`GET/PUT /__admin/data/*`) for reading/writing JSON files in dev mode                                                                                                                                      |
| Config      | `config/render.config.ts`           | All render constants (fonts, palette, spacing, special line colors)                                                                                                                                                              |
| Config      | `config/fare-presets.json`          | Fare/speed presets (farePerKm, minutesPerKm); used by lines' `costPreset` field                                                                                                                                                  |

## Data

All data is JSON stored in `src/data/`. No CSV files.

**IMPORTANT**: When working with these files, do NOT always read them in full — they can be large (e.g. `teyvat.json` is ~2000 lines). Read only the first ~30-40 lines to understand structure, or use `grep` to find specific stations/lines by ID or name. The schemas below describe the structure precisely — rely on them instead of full file reads.

Region files, each with structure `{ config, stations, lines }`:

| File             | Config prefix | Config font                                                 |
| ---------------- | ------------- | ----------------------------------------------------------- |
| `teyvat.json`    | `"Teyvat"`    | `"Noto Sans SC"`                                            |
| `inazuma.json`   | `"Inazuma"`   | `"Noto Serif JP"` (loaded via Google Fonts in `index.html`) |
| `liyue.json`     | `"Liyue"`     | `"Noto Sans SC"`                                            |
| `snezhnaya.json` | `"Snezhnaya"` | `"Noto Sans SC"`                                            |

`connections.json` is the global station-pair connection table (distance + waypoints for every adjacent pair — see below).  
`mark.json` contains `{ paths, texts }` for annotation overlays.

Two special line files:

| File         | `lineType`       | Visual style                           |
| ------------ | ---------------- | -------------------------------------- |
| `ferry.json` | `"ferry"`        | Thin dark blue dashed line             |
| `same.json`  | `"same-station"` | Thin semi-transparent black solid line |

### Region file schema (`teyvat.json`, `inazuma.json`, `liyue.json`, `snezhnaya.json`)

```jsonc
{
  "config": {
    "x": number, "y": number, "name": string, "fontFamily": string,
    "operator"?: { "name": string, "nameEn": string, "nameAlt"?: string },   // 本文件所有线路的默认运营公司
    "authority"?: { "name": string, "nameEn": string, "nameAlt"?: string }   // 本文件所有线路的默认运营主体
  },
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
      "operator"?: { "name": string, "nameEn": string, "nameAlt"?: string },    // 覆盖 config.operator（如 F1-F3 → 枫丹巡轨船）
      "authority"?: { "name": string, "nameEn": string, "nameAlt"?: string },   // 覆盖 config.authority（如 N4 → 悠悠度假村管理委员会）
      "oneWay"?: boolean,                   // true = 单向，所有变体都只按各自 stations 的顺序开行
      "lineLabels"?: [ [stationId, position], ... ],   // 线路级：对该线全部变体生效
      "variants": [
        {
          "name"?: string,                  // 短变体名（`支线` / `小交路` …）；空或省略 = 该线路的全线交路
          "nameEn"?: string,
          "stations": [stationId, ...]      // 裸站点 id 数组：短 id 按本区前缀展开，跨区引用写完整 id（如 "Teyvat-STR"）
        }
      ]
      // 至少 1 个变体，每个变体至少 2 站；同一线路的变体共用 id / 名称 / 颜色 / 票价 preset / 平行轨道槽位
    }
  ]
}
```

### Special line files

**`ferry.json`** — `{ lines: [{ id, name, nameEn, "lineType": "ferry", variants: [{ stations: [prefixedId, ...] }] }] }`  
**`same.json`** — `{ lines: [{ id, name, nameEn, "lineType": "same-station", variants: [{ stations: [prefixedId, ...] }] }] }`

Ferry and same-station lines use **already-prefixed** station IDs (e.g. `"Teyvat-LYS"`) to reference stations across region files. They are not re-prefixed at runtime; their variant `stations` arrays are bare id strings like the region files'. Their pairs get their `connections.json` entries from the same global table.

### Connections file (`connections.json`)

`{ "connections": [ { from, to, distance?, waypoints? }, ... ] }` — the single source of truth for **how two stations connect** (cost and geometry alike), holding one entry per adjacent station pair used by any line.

- `from` / `to` are **fully-prefixed station ids** (never short ids), stored in alphabetical order, with the array sorted by `(from, to)`.
- `distance` (km) is optional — omitted = `DEFAULT_CONNECTION_DISTANCE` (10), preserving the old implicit fallback.
- `waypoints` is optional — chained relative offsets in **data units** (same scale as `station.x/y`, × `BLOCK_SIZE` at render time), given in the **`from` → `to`** direction: the first point is relative to the `from` station, each later point relative to the previous one. Omitted / `[]` = a straight line between the two stations. A line traversing the pair the other way gets the whole vertex list reversed at render time.
- A pair with neither `distance` nor `waypoints` gets **no entry** — its absence means exactly that pair's defaults.
- The loader in `useMapData.ts` throws on short ids, unknown stations, or a duplicate station pair.

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
- **Cross-region reference**: A region line may reference a station owned by another region by writing its **already-prefixed** id, e.g. `"Teyvat-STR"` inside `snezhnaya.json`. `regionStationId()` in `useMapData.ts` passes any id containing `-` through untouched (applies to each variant's `stations` and to `lineLabels`). Raw station ids must therefore NEVER contain `-`; `connections.json` always uses full ids.
- **`variants`** (line): the line's service patterns. `stations` is a bare station id array — the ordered sequence that variant runs through; every adjacent pair must have an entry in `connections.json` (or fall back to 10 km + straight line). `name` / `nameEn` are the short variant labels (`支线` / `小交路`), empty for the everyday full-length service. Variants of one line share its id, name, colour, preset and parallel-track slot, so two variants over the same pair render as **one** track; the runtime `Line.stations` is a derived union of all variants' stations (first-appearance order), used for station↔line lookups only.
- **`labelDir`**: Optional, one of `L`/`R`/`T`/`B`/`LT`/`LB`/`RT`/`RB`. Controls label offset direction from station point.
- **`waypoints`** (connection): the path between a connection's two stations — see [Connections file](#connections-file-connectionsjson) above.
- **`lineLabels`**: Optional array of `[stationId, position]` — instructs renderer where to place the line's name label relative to that station.
- **`config.x`/`config.y`**: Origin offset applied to all station coordinates in that region at runtime.
- **`costPreset`**: Each line selects a fare/speed preset from `config/fare-presets.json`. Determines `farePerKm` and `minutesPerKm` for cost computation.
- **`operator` / `authority`**: 运营公司 / 运营主体 shown in `/display`'s strip header as `{ name, nameEn, nameAlt? }` (Chinese primary, smaller English, optional third line — Snezhnaya's `authority` carries the Russian name in `nameAlt`). Each region file sets file-wide defaults in `config`, a line overrides either one locally (`F1`-`F3` → 枫丹巡轨船, `N4` → 悠悠度假村轨道交通, `WT` → 稲妻国海祇島珊瑚宮自治政府). `useMapData.ts` resolves the override onto each `Line` while prefixing variant stations, so consumers read `line.operator` / `line.authority` directly.
- **`oneWay`**: Optional boolean; `true` = 单向线路，所有变体都只按各自 `stations` 的排列顺序开行，反向不可乘坐（环线即按单一方向绕行）。缺省 = 双向。当前仅 `snezhnaya.json` 的三条环线 `Trian-1`/`Trian-2`/`Trian-3` 为单向；`Trian-4`（白冕宫线）与 `Trian-5`（挪德卡莱连接线）为双向。
- **`connections`**: the global station-pair table in `connections.json` (replaces the old per-file `stationDistances` and the per-line waypoint tuples). See [Connections file](#connections-file-connectionsjson) above.
- **Cost computation**: fare = distance × farePerKm (摩拉), time = distance × minutesPerKm (分钟). Computed at runtime in `useMapData.ts` and `useRouting.ts`.

## Routing (`useRouting.ts`)

**Graph construction** (built once at module load):

| Edge type                          | Cost metric                    | Description                                                                                                                                       |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Line adjacency                     | Actual fare (dist × farePerKm) | Consecutive stations **within one variant**; `oneWay` lines only get the forward edge (reverse travel is impossible, loops must be ridden around) |
| Transfer (same-station)            | 0                              | Two lines — or two variants of the same line — sharing the same physical station                                                                  |
| Cross-network transfer (same.json) | 0                              | Connections defined in `same.json` (different prefix)                                                                                             |

**Node format**: `` `${stationFullId}-${lineId}#${variantIndex}` ``, e.g. `Teyvat-LYH-A#0`, `Liyue-KYB-ferry-kyb-rtp#0`.

Each variant is its own chain in the graph, so changing from a branch/local (小交路) train to the full-length (大交路) one shows up as a transfer at the shared station — e.g. branch terminus → main terminus comes back as two segments. Station-pair connections are only used for the cost; distances come from `connections.json` via `lookupDistance()` (a missing entry counts as 10 km), and pair geometry plays no part in the graph.

**`findRoute(startStationId, endStationId, metric)`**: gathers ALL line-nodes for each physical station, runs Dijkstra with virtual multi-source / multi-target (all start-nodes at dist 0, stop when any end-node is reached). `metric` is one of `'fare'` (default), `'time'`, or `'distance'` — Dijkstra uses the corresponding value from the edge metrics as weight.

**`findRoutes(startStationId, endStationId)`**: calls `findRoute` for all three metrics (`fare`, `time`, `distance`) and returns an array of up to 3 results.

**`searchStations(query)`**: fuzzy match against `nameCn`, `nameEn`, `id`, short ID; returns up to 20 `StationSuggestion` entries with line info.

**Result**: JSON blob with `{ segments, pathNodeIds, totalFare, totalTime, totalDistance }`.

## Conventions

- **Coordinates**: data units × `BLOCK_SIZE` (50px). SVG viewport sized to data bounds with configurable `margin`.
- **Label fonts**: Inazuma stations use `"Noto Serif JP", serif` from Google Fonts; others use `"Noto Sans SC"`.
- **Label sizes**: Fixed small size (`fsCNSmall: 12`, `fsENSmall: 8`). No zoom-dependent switching.
- **nameZh (Inazuma)**: Inazuma stations/lines carry an extra `nameZh` field (Chinese translation). When present, labels render three lines: JP name → CN name (zhX) → EN name. CN text uses `"Noto Serif SC"` at EN font size.
- **Line palette**: `linePalette` in `render.config.ts` — 35 colours, picked by the line's **index inside its own data file** (each region restarts at `#e6194b`), not globally. Order: 7 base hues 红橙黄绿青蓝紫 (`#e6194b #f58231 #ffe119 #3cb44b #42d4f4 #4363d8 #911eb4`), then the same 7 lightened (×0.35 white), darkened (×0.30 black), lightened more (×0.65 white) and darkened more (×0.55 black). Ferry / same-station lines keep `FERRY_COLOR` / `SAME_COLOR` and do not consume a slot on the map (`/display` numbers every line in the file, which matches the map because those entries sit last in the region files).
- **Parallel tracks**: Shared segments are offset by `LINE_WIDTH` per line, centered. A line occupies **one** slot no matter how many variants traverse the segment — variant station pairs are de-duplicated (direction-insensitively, first occurrence wins) before offsetting, so a 支线/小交路 does not push its own line (or anyone else) sideways.
- **Viewport persistence**: Pan/zoom saved to localStorage key `teyvat-railways-map-state`.
- **All imports**: relative paths (`../../composables/...`). `tsconfig.json` declares an `@/*` → `./src/*` alias for `vue-tsc`, but `vite.config.ts` has **no** matching `resolve.alias`, so `@/...` imports would break the build — don't use them.
- **SVG isolation**: RailwayMap.vue uses ONLY inline styles (`fill`, `stroke`, SVG attributes) — no Tailwind CSS classes. This allows the SVG to be copy-pasted as a standalone SVG file.
- **Line connection style (dormant feature)**: every rendered segment is a `<path>`; `straight` mode emits `M x1 y1 L x2 y2`, `curve` mode (`useRenderMode`, currently **not enabled** — no UI control, always `straight`) emits a centripetal Catmull-Rom cubic built by `useCurveGeometry`. Curve vertices are the **station points only** — the waypoint vertices a pair may carry (`partIndex` > 0 parts) are not assumed to exist, so a curve spans the whole station pair and its residual `partIndex > 0` elements render an empty `d` (the pair is drawn on its first part). Segment ids, opacity/dim logic and click handling are identical in both modes, so route highlighting keeps working; fare/time labels follow the curve's midpoint + tangent in curve mode. `/display` is unaffected.
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
- Region lists are hardcoded in every consumer — adding a region file requires touching **all** of: `composables/useMapData.ts` (import + prefix loops + distances), `components/AdminPanel.vue` (`fileKeys`/`regionKeys`), and `vite.config.ts` (`ALLOWED_FILES`). `/display` needs no change (it renders whatever `useMapData` exports).
- `vue-tsc` is in devDeps but has no npm script — run via `npx vue-tsc --noEmit`.
- Manual verification only: run `pnpm dev` and check the browser.
- Ferry/same-station JSON files don't have their own stations — lines reference prefixed station IDs (e.g. `Teyvat-LYS`) directly. These lines are not run through the standard prefix step.
- `intro.md` is imported via `?raw` in `InfoDialog.vue` and rendered with `markdown-exit`. The modal has `github-markdown-css` with transparent background override.
- First visit detection uses localStorage key `teyvat-railways-visited`.
- AdminPanel (🛠 button, dev-mode only) exposes a GUI for editing station names, line names, variant names and connection distances; it lists each line's variants as read-only segment sequences. Changes write back via `PUT /__admin/data/*` and Vite HMR auto-reloads the app.
- RoutePanel exposes `onStationClick(stationId)` via `defineExpose` — App.vue calls it when RailwayMap emits `station-click`.
- RoutePanel now shows a multi-route option list (fare/time/distance) after calculation; clicking one opens the RouteTimeline detail view, clicking × returns to the list.
- `useRouting.ts` builds the graph eagerly at module import time (synchronous, runs once).
- Segment paths are built in `useMapData.ts`: `connectionVertices()` reads the pair from `connections.json` (`lookupConnection()`), expands its chained `waypoints` into polyline vertices, and reverses the whole vertex list when the line traverses the pair against the canonical `from → to` order. Every pair contributes one `RenderSegment` per vertex span (`partIndex` 0..N). `pairSegmentIds` (also exported there) maps `${lineId}|${aId}|${bId}` → the pair's segment ids in both directions; `RailwayMap.vue` uses that map for route highlighting instead of recomputing corner geometry.
- Parallel-track offsetting groups **whole polylines** by their direction-normalized vertex signature (`polylineKey`) and translates the entire pair by one vector derived from the start→end chord, so corners stay continuous. Straight pairs are unaffected; only corridors additionally shared by another identically-shaped polyline shift (offset ≤ 4px per neighbour).
- Station-pair connections (distance **and** waypoints) live only in `src/data/connections.json`; region files no longer carry `stationDistances` and lines no longer carry per-pair waypoints. Adding a connection = adding one fully-prefixed entry there (a missing pair silently means 10 km + straight line).
- Line variants (支线 / 大小交路) live inside the owning line as `variants[]`, sharing its id, name, colour, preset and track slot — a variant is **not** a separate line, so it never gets its own colour or parallel offset. Today's variants: `M1`/`A`/`L2` each carry a `小交路` (short turnback) beside the full-length one, and the former standalone `K2-B` / `K3-B` lines were folded into `K2` / `K3` as `支线` (their `lineLabels` were merged into the parent, so the map still names the line at the branch termini). `ferry.json` / `same.json` lines are single-variant.
- Because the map graph is built per variant, a route that changes variant (branch → main, 小交路 → 大交路) is reported as a transfer at the shared station; a ride entirely inside one variant stays a single segment. `RouteSegment` / `NodeInfo` carry `variantIndex` / `variantName` / `variantNameEn`, and `segmentLineName()` renders `帕哈岛线（支线）`-style labels.
- Transfer-station circles count **lines**, not variants: `transferStationIds` uses the per-line station union, so `K2`/`K3` trunk stations stopped being transfer stations when `K2-B`/`K3-B` merged (those also served by `K1` or a ferry kept it).
- Line colours come from the line's index in the flattened line list, so adding/removing a line entry (e.g. folding `K2-B`/`K3-B` away) shifts the palette for every line after it.
- Curve mode (`useCurveGeometry.ts`, implemented but not surfaced in the UI) deliberately **ignores waypoints** — its vertices are the pair's two stations, taken from the first part's start and the last part's end.
- `/display` draws **rail lines only** (`lines.filter((l) => !l.lineType)`), so all 12 ferries and 3 same-station links are absent there; the 换乘徽章 likewise only list rail lines (a station reachable only by ferry shows no badge). To include them, drop that filter in `views/display/index.vue`.
- `/display` badge labels are the **last `·` segment** of the other line's name (`蒙德局·自由线` → `自由线`, `璃月港地铁·1号线` → `1号线`, names without `·` stay whole), so several lines of one operator can render as bare numbers — the colour carries the rest of the identity.
- `/display` panels are 1920×280 and the route root owns its scroll container (`h-screen overflow-y-auto`); `index.html` sets `#app { height: 100%; overflow: hidden }`, so anything taller than the viewport must scroll inside the page itself.
- `/display` 的排版是**纯 CSS**（`index.vue` 的 scoped style，DOM 无 SVG、无 JS 坐标）：`.strip` 是 `1920×280` 的 grid（8 行 = 页头 / 徽章两行 / 12px 引线通道 / 主线 / 站名；列 = `${EDGE}px repeat(N-1, 1fr) ${EDGE}px`，所以首末站永远距内容区左右各 `EDGE` = 64px，主线只跨首末站之间），站名块 `rotate(45deg)` 绕自身左上角转，圆圈序号 flex 居中，换乘引线是 `::after` 竖线 + `::before` 三角（按徽章行给两个固定长度：12 / 38px）。`stripModel.ts` 只决定 CSS 做不到的几件事：徽章簇放哪一行、末尾站站名左移多少（`--label-shift`）、边缘处徽章簇挤回多少（`--badge-shift`）、以及线路色上的文字色；前几件依赖真实字宽，所以仍走 `MeasureFn`。站名字号 12/8（与地图标签同），站名行高 111px 能容纳 `(W+H)/√2 ≈ 105px` 的最坏斜排。
