# Teyvat Railways — AGENTS.md

## 快速开始

```bash
pnpm install
pnpm dev        # vite 开发服务器 → localhost:5173
pnpm build      # 构建到 dist/（vite 的 base 用默认值）
pnpm preview    # 预览构建产物
```

- 类型检查：`npx vue-tsc --noEmit`（没有对应的 npm script）。
- 格式化：`pnpm format`（oxfmt），提交前必跑。
- 无 lint / 测试脚本；改动一律手工验证。

## 架构

技术栈：Vue 3 + TypeScript + Vite；UI 用 Varlet，样式用 Tailwind CSS v4（`@tailwindcss/vite`，零配置）。

```
src/main.ts → src/style.css（Tailwind 入口，先导入）
            → src/App.vue（装 Varlet + router，只渲染 <router-view />）
            → src/router/index.ts
                 /        → src/views/HomeView.vue        地图页
                 /display → src/views/display/index.vue   懒加载，静态线路条带图
```

`HomeView.vue` 结构：

```
TitleBar                                 顶栏（关于弹窗 / 主题 / 管理面板）
├─ .app-body（flex row）
│  ├─ .map-area（flex:1）→ RailwayMap     地图（含列车层）；内部渲染 MapControls
│  │                      SimClock       左上角时钟浮层
│  └─ RoutePanel                         右侧面板（320px）：搜索 + StationInfo / LineInfo / TrainInfo + 路径规划
├─ InfoDialog                            模态：渲染 intro.md
└─ AdminPanel                            模态：仅开发模式的数据编辑器
```

两个模态都通过 `components/DialogWindow.vue` 渲染。

### `/display` — 线路条带图

只渲染**轨道线路**（滤掉 `lineType`），每条线路一块 1920×280 的面板，**纯 HTML + CSS**（无 SVG，站点按序均分，坐标无关）；每有一条支线再加 24px。

- **主线** = 站数最多的变体（并列取第一个）。与主线共享非空前缀、之后全是主线没有的站（即支线）的变体，画成主线下方 24px 的**支线车道**：45° 引线、独立轨道、红色站名（`#c0392b`）、末端 `支线 / Branch` 标签。纯粹是主线子集的变体（小交路）不作任何标注。
- **版面**：线路色边框 + 页头 + 白色编号站点圆圈 + 45° 斜排站名 + 线上方换乘徽章（服务该站的其它轨道线路，带引线）。页头左侧是线路名与运营公司：线路名用 `Line.selfNames`（**不含机构前缀**的自名，运营公司本来就在旁边单列），两者都按 `nameLabelLines` 排版；运营主体不在此展示（只在信息面板）。
- **纯 CSS 网格**：`.strip` 的行模板（页头 / 徽章两行 / 引线通道 / 主线 / 支线车道 / 站名）与列模板由 `index.vue` 的 `stripStyle` 生成，列 = `${EDGE}px repeat(N-1, 1fr) ${EDGE}px`（N = 并集列数，支线独占站排在分歧站之后）—— 所以首末站永远距内容区左右各 `EDGE`（64px），主线轨道只跨首末主线站之间。
- 纯模块 `stripModel.ts`（`buildStrip` / `textOn` / `readableOn`）只决定 CSS 做不到的部分：文本内容、每站落在哪一列 / 哪条车道、徽章簇放哪一行、边缘站名左移量（`--label-shift`）、边缘徽章左移量（`--badge-shift`）、支线引线与横线跨列。字宽由注入的 `MeasureFn` 提供，所以这些判断可脱离浏览器断言；变体选择在 `variantStrip.ts`（`pickDisplayVariant` / `splitVariants`）。
- **环线**（首末同站的闭合线路）走 `loopStrip.ts`：数据里末尾那个闭合用的重复站不画；静态条带按规范化环序画，主线首尾各加一段 32px 虚线延伸（表示继续绕圈）；动态模式下按「刚经过的接缝站」滚动条带，并使用环线自己的进度模型。
- **动态模式**（配置栏开关，状态只在内存里）：整条线路默认灰，只有本趟行程**尚未走到**的段与站按原色点亮；正在经过的区间按份错相位行进，正在经过的站闪站名；不在所选变体行程上的部分永远保持灰。纯模型在 `dynamicStrip.ts`（`buildProgress` / `routeCols` / `EMPTY_PROGRESS`）。
- **语音播报**：吸顶的 `VoicePanel.vue`（中 / 日 / 英音色、试听、自动播报开关，落 localStorage）；引擎与日志在 `composables/useSpeech.ts`（模块级单例、打断式队列），日志由 `AnnounceLog.vue` 渲染。文案**数据化**在 `src/data/voice/*.json`，模板模型与 `buildAnnouncement` 在 `announce.ts`（`createVoiceRegistry` 带构建期校验），装配在 `voiceTemplates.ts`（`import.meta.glob` 自动发现模板文件）。

### 文件与职责

| 文件                                                  | 职责                                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `main.ts`                                             | 挂载 `App.vue`，先导入 `style.css`                                                        |
| `App.vue`                                             | 只渲染 `<router-view />`                                                                  |
| `router/index.ts`                                     | 两条路由：`/`、`/display`（懒加载）；history base 为 `/tr`                                |
| `views/HomeView.vue`                                  | 地图页：TitleBar +（地图 \| RoutePanel）+ 两个模态；首次访问弹介绍                        |
| `views/display/index.vue`                             | `/display` 条带图；读 `useMapData`，用 CSS 网格排版                                       |
| `views/display/stripModel.ts`                         | 条带纯模型：并集列、文本、徽章行、位移钳制、支线跨列                                      |
| `views/display/variantStrip.ts`                       | 变体选择：主线变体 + 支线拆分                                                             |
| `views/display/loopStrip.ts`                          | 环线：环序、滚动、环线进度模型                                                            |
| `views/display/dynamicStrip.ts`                       | 动态模式进度纯模型                                                                        |
| `views/display/announce.ts`                           | 配音模板注册表与播报拼装（纯逻辑）                                                        |
| `views/display/voiceTemplates.ts`                     | 装配语音模板 + 校验模板 id 引用                                                           |
| `views/display/VoicePanel.vue`、`AnnounceLog.vue`     | 吸顶语音面板、播报日志                                                                    |
| `components/TitleBar.vue`                             | 顶栏 + 关于按钮                                                                           |
| `components/InfoDialog.vue`                           | 渲染 `intro.md`（`markdown-exit` + `github-markdown-css`）                                |
| `components/DialogWindow.vue`                         | 通用模态外壳                                                                              |
| `components/RailwayMap.vue`                           | SVG 地图：平移缩放、网格、归属边界、线段、站点、标签、标注；点击分发                      |
| `components/RoutePanel.vue`                           | 右侧面板：搜索、信息展示、路径规划                                                        |
| `components/MapControls.vue`                          | 左下角缩放按钮、鼠标坐标读数、边界平滑切换                                                |
| `components/SimClock.vue`                             | `/` 左上角模拟时钟：h:m:s 逐位上下调整、暂停 / 倍速；状态在 `useSimClock`，地图列车读它   |
| `components/TrainInfo.vue`                            | 列车详情：线路 / 发车 / 方向 / 车型 / 实时状态 + 本趟停站到发时刻（点击地图上的列车打开） |
| `components/StationInfo.vue`、`LineInfo.vue`          | 站点 / 线路信息（含间隔、发车、线路全览）                                                 |
| `components/RouteTimeline.vue`、`TransitTimeline.vue` | 路径详情；通用竖向时间线（两条时间线共用）                                                |
| `components/AdminPanel.vue`                           | 开发模式数据编辑器（六个页签，写回 JSON）                                                 |
| `composables/useMapData.ts`                           | 加载解析全部数据表；导出 `stations` / `lines` / `pairCost` / `headwayFor` 等              |
| `composables/useMapInteraction.ts`                    | 拖拽 / 滚轮 / 触摸缩放；视口落 localStorage                                               |
| `composables/useTheme.ts`                             | 明暗主题（Varlet StyleProvider），落 localStorage                                         |
| `composables/useRenderMode.ts`                        | 线段形态 `straight` / `curve`；未接入 UI                                                  |
| `composables/useBorderSmoothing.ts`                   | 边界平滑方式的运行时 ref（不落盘）                                                        |
| `composables/useSimClock.ts`                          | 模拟时钟模块级单例：`secondsOfDay` / `playing` / `rate` / `minutesOfDay` + 启动 rAF       |
| `composables/trainRuns.ts`                            | 列车运行模型：把 `departures` 摊成 `TrainRun`，回答「某时刻这趟车在哪」（纯逻辑）         |
| `composables/useCurveGeometry.ts`                     | 向心 Catmull–Rom 曲线控制点                                                               |
| `composables/useTerritoryBorders.ts`                  | 由站点归属算 Voronoi 边界 SVG path（纯几何）                                              |
| `composables/useLabelPlacement.ts`                    | 标签盒布局与引线（`@chenglou/pretext`），并提供 `measureText`                             |
| `composables/stationNames.ts`                         | 名称类型与语言规则（标签行、展示行、信息面板名称行）                                      |
| `composables/formatTime.ts`                           | 时长格式化（展示层专用）                                                                  |
| `composables/lineNaming.ts`                           | 线路名拼装（机构前缀 + 自名）与轮渡 / 同站换乘派生                                        |
| `composables/useRouting.ts`                           | 图构建 + Dijkstra + 站点 / 线路模糊搜索                                                   |
| `composables/useSelection.ts`                         | 「选中了什么」的唯一来源                                                                  |
| `composables/timetable.ts`                            | 时刻表纯模块（解析、间隔查询、发车展开、间隔汇总）                                        |
| `composables/stationTimetable.ts`                     | 站点级派生：间隔分段 + 实际发车                                                           |
| `composables/useSpeech.ts`                            | 语音引擎单例（`speechSynthesis`）                                                         |
| `config/render.config.ts`                             | 渲染常量（字体、调色板、间距、描边、网格步长）                                            |
| `config/vehicles.ts`                                  | 车型：时速、票价系数、加减速、冗余系数、计算公式                                          |
| `config/announce.config.ts`                           | 语音引擎常量                                                                              |
| `config/unionTeyvat.config.ts`                        | 代码内置机构名与地区 → 运营方表                                                           |
| `scripts/migrate-data-v3.cjs`                         | 一次性数据迁移脚本（已完成，无需再跑）                                                    |
| `vite.config.ts`                                      | Vite 配置 + Admin 数据读写中间件                                                          |

## 数据

数据全在 `src/data/`，格式为 JSON（无 CSV）。**站点表 / 线路表很大（>1000 行），不要整体读**：看前 30 行了解结构，或用 `grep` 按 id / 名称定位 —— 下面的 schema 已精确描述结构。

一个实体一张表：

| 文件                 | 内容                                                       |
| -------------------- | ---------------------------------------------------------- |
| `stations.json`      | 站点，完整站点 id 为键                                     |
| `lines.json`         | 线路（含变体），线路 id 为键                               |
| `networks.json`      | 体系（默认字体 / 主语言 / 运营公司 / 运营主体 / 配音模板） |
| `organizations.json` | 运营公司 / 运营主体                                        |
| `territories.json`   | 国家/地区 + 区域名称与优先语言                             |
| `connections.json`   | 全局站间连接表（距离 + 途经点）                            |
| `mark.json`          | 手绘 SVG 标注路径 + 文字标识                               |
| `voice/*.json`       | 配音模板（文件名 = 命名空间 = 模板 id）                    |

### `stations.json`

```jsonc
{
  "<站点 id>": {
    "names": { "zhCN": "…", "zhTW": "…", "ja": "…", "en": "…", "pronunciationJa": "…" }, // pronunciationJa 可选
    "x": 0, // 数据单位，绝对值
    "y": 0,
    "nation": "…", // 必有
    "area": "…", // 可选
    "labelDir": "L", // 可选
  },
}
```

条目的键顺序固定为 `names, x, y, nation, area?, labelDir?`；站点键顺序被标签避让与边界剖分依赖，改动需谨慎。

### `territories.json`

```jsonc
{
  // 「国家/地区」
  "nations": { "<id>": { "names": Names, "langs": ["…"], "fontFamily": "…" } }, // langs / fontFamily 可选
  // 「区域」：隶属于某个国家/地区；自己的 langs 排在国家的 langs 前面
  "areas":   { "<id>": { "names": Names, "nation": "…", "langs": ["…"] } }
}
```

- `langs` = 该单位的**优先语言**（按序），决定名称的展示顺序与主语言；`[]` 或省略 = 只有简中 + 英文。
- `fontFamily` 只写在 nation 上，站点从所属 nation 继承（缺省 `Noto Sans SC`）。
- nation / area 的键是代码比对用的稳定 id，中文名只用于显示。
- 加载后 `useMapData.ts` 校验：站点的 `nation` 必须存在、`area` 必须存在且其 `nation` 与站点一致、机构写的 `nation` 必须存在；通过后把解析出的 `Territory` 挂到每个 `Station` 上。

### `organizations.json` / `networks.json`

```jsonc
// organizations.json：运营公司 / 运营主体
// id = names.en 规范化（小写、非字母数字折成 `-`、去首尾 `-`）
{ "<id>": { "names": Names, "nation": "…" } } // nation 只用于取该地区的优先语言；跨地区机构不写

// networks.json：体系；体系名 = 其运营公司的四语名，不写 names
{
  "<id>": {
    "operator": "…",     // 机构 id，体系默认值
    "authority": "…",    // 机构 id，体系默认值
    "primaryLang": "…",  // 只管线路名的语言；缺省 zhCN
    "fontFamily": "…",   // 缺省 Noto Sans SC
    "voice": "…"         // 配音模板 id；缺省 common
  }
}
```

- 机构名的语言顺序由机构自己的 `nation` 决定，与所属体系无关。
- 另有**代码内置机构**（`config/unionTeyvat.config.ts`）：名字由多级机关名逐语言拼接（中日连写、英文空格），不写进数据表；由 `useMapData.ts` 注册进机构表，数据里用 id 引用。

### 运营方：线路归属 vs 站点地域

- 线路的 `operator` / `authority` = 「这条线归谁」，也是线路名前缀的来源；只在信息面板的**线路**信息里展示。
- 站点信息里展示的运营方按**站所属地区**取（`config/unionTeyvat.config.ts` 的地区 → 运营方表，消费方是 `useMapData.ts` 的 `operatingOrgs(line, station)`）：地区先看**区域**再看国家/地区，所以跨地区开行的线路「在谁的地界上就由谁运营」。
- `/display` 页头只印运营公司，不印运营主体；信息面板两者都印，多个主体用 `；` 连接。

### `lines.json`

```jsonc
{
  "<线路 id>": {
    "names": Names,                       // 轨道线路必有：**线路自名**，不含机构前缀
    "network": "…",                       // 轨道线路必有；轮渡可选；同站换乘禁止
    "operator": "…",                      // 可选，覆盖体系默认
    "authority": "…" ,                    // 可选，可为字符串或数组，覆盖体系默认
    "colorSlot": 0,                       // 轨道线路必有：linePalette[slot % 35]
    "lineLabels": [["<站点 id>", "RT"]],  // 可选；空数组不写
    "oneWay": true,                       // 可选；true = 单向
    "variants": [
      { "stations": ["<站点 id>", "…"] },                                  // vehicle 省略 = standard
      { "name": "…", "nameEn": "…", "stations": ["…"], "timetable": { … } } // 变体名 / 时刻表可选
    ]
  }
}
```

字段规则：

- **轨道线路必有** `names` / `network` / `colorSlot`；`lineType` 线路（`ferry` / `same-station`）**禁止写** `names` 与 `colorSlot`，同站换乘还禁止写 `network`。
- 所有 `stations` / `lineLabels` 都是**完整站点 id**，没有短 id 展开这一步。
- `colorSlot` 显式决定颜色，增删线路不影响别的线路配色；`lineType` 线路用 `FERRY_COLOR` / `SAME_COLOR`，不占色位。
- `vehicle` 等于 `standard` 时省略；其余按变体各自选车型（`config/vehicles.ts`）。
- `variants`：`stations` 是有序站序，每个相邻站对必须能在 `connections.json` 找到（否则回落 10km + 直线）；`name` / `nameEn` 是变体短名（支线 / 小交路），日常全线服务留空。变体与所属线路共用 id、名称、颜色与并行轨道槽位 —— 同一站对上的两个变体只画**一条**轨道。运行时的 `Line.stations` 是各变体站的并集（按首次出现顺序），只用于站点 ↔ 线路查询。
- `oneWay`：`true` = 单向，所有变体只按各自 `stations` 的顺序开行，反向不可乘坐（单向环线按单一方向绕行）；缺省双向。
- `timetable`：变体级可选，见 [时刻表](#时刻表)。

### 线名：机构前缀 + 自名

线路数据里只写**线路自己的名字**；机构前缀由 `composables/lineNaming.ts` 的 `composeLineNames(base, prefix)` 在加载时拼出：

- `prefix` = 该线路的**运营公司**四语名（`line.operator`，缺省取体系 `operator`）；
- 分隔符由 `LINE_NAME_SEPARATORS` 给出：简中 / 繁中 / 日文用 `·`，英文用一个空格；
- 四语各拼一份，所以改机构名 → 所有语言的线路名一起变；某语言缺机构名 → 该语言退回线路自名。
- 轮渡 / 同站换乘**不拼前缀**（名字由端点站派生）。

`Line` 上因此有两个名字：`names`（自名 + 机构前缀，供地图标签、搜索、路由段名、播报、信息面板用）与 `selfNames`（不带前缀的自名，`/display` 页头用）。地图上的机构标注（`mark.json`）与线路名无关，不会跟着变。

### 线名派生：轮渡 / 同站换乘

`lineType` 线路的名字**不写进数据**，由 `lineNaming.ts` 用端点站的四语站名在运行时拼出；组合前的站名先过 `plainStationName`（多写法取第一种、去引号）。同站换乘只取首站。

- 轮渡有两个模板：**无固定顺序**用双向箭头（`{A}↔{B} 轮渡` 等），两端按数据里的站序 —— 这是线路自身的名字，地图、搜索、条带都用它；**有固定顺序**用单向箭头、两端按行程方向，只用于路径规划结果里的 `RouteSegment.lineName` / `lineNameEn`。
- 同站换乘只有一个普通模板，不随方向变。

### 时刻表

纯模块在 `composables/timetable.ts`。变体的可选 `timetable` 有两种**互斥**形态（`dwell` 与两者都不冲突）：

```jsonc
// ① 时段间隔：只能写 from / to / interval / between
"timetable": { "interval": [
  { "from": "06:00", "to": "18:00", "interval": 30 },        // 段内固定间隔（分钟，正数）
  { "from": "18:00", "to": "24:00", "interval": 60 },        // 后写的段覆盖先写的
  { "from": "07:00", "to": "09:00", "interval": 5 },         // 早高峰覆盖基准
  { "between": ["<站 a>", "<站 b>"], "from": "06:00", "to": "18:00", "interval": 40 } // 只作用于这段范围
] }

// ② 逐条发车：单点（time）与时间窗（from / to / every）混排
"timetable": { "departures": [
  { "time": "07:30", "station": "<站 id>", "direction": "up" },
  { "from": "18:00", "to": "02:00", "every": 20, "station": "<站 id>", "direction": "down", "vehicle": "…" }
] }
```

- **时段是半开区间** `[from, to)`；`to <= from` 视为跨天（+24h）；`to = from` = 全天；`"24:00"` 允许。段对象只能有那四个键，多写别的直接报错。
- **按数组顺序覆盖**：后面的段盖住前面的段（「基准 + 高峰」要把基准写前面）。
- `interval: null`（段内或数组元素）= 该时段 / 该处起**不开行**（间隔无限大）；没有任何段覆盖的时刻一律 `Infinity`。
- `between` 两个站必须在变体站序里且顺序一致。
- 发车：`direction` `up` = 站序方向、`down` = 逆序，单向线路不能有 `down`；`vehicle` 省略 = 该变体车型；`turnback: true` = 折返（到终点停站后原路开回发车站，一趟车既是上行也是下行，单向线路不能折返）；时间窗自 `from` 起每 `every` 分钟一班、`≤ to` 去尾。
- `expandDepartures` 按**绝对分钟**（可跨天）升序展开，同站 / 同向 / 同刻 / 同车型的重复班次只算一班。
- `dwell`（可选）：`{ default, stations }`，分钟、非负，逐站覆盖。**只作数据与派生**（`dwellAt`），不影响行程时间（`pairCost` / 路由时间）。
- `parseTimetable(raw, ctx)` 做全部校验（两种形态互斥、键合法、时间 `HH:mm`、站在站序里、方向合法、车型已知、单向线不能 `down`、虚拟线路不应有时刻表等）。
- 其它导出：`segmentKey`（无向站对键，与 `connections.json` 同口径）、`intervalAt`、`mergeIntervalSources`（多来源按时刻取 `min` 切段）、`minIntervalOfDay`、`buildSegmentHeadways`。`useMapData.ts` 再导出 `segmentHeadways` 与 `headwayFor(a, b)`（`Infinity` = 不开行，无条目 = 无数据）。

**地图上的列车**（`composables/trainRuns.ts`）：只对写了 `departures` 的变体跑车 —— 每班车摊成 `TrainRun`（首站开出 → 各站到发 → 末站到站 + 停站），按 `useSimClock` 的模拟时刻定位（区间内按折线弧长插值，停站停在站点）。**环线末尾的闭合站照常收尾**（列车开回枢纽站、停够 `dwell` 再消失），而 `stationTimetable.stationDepartures` 的列表里仍不重复出现该站（`buildRun` 复用 `buildTrainRun` 后丢掉最后一行）。画面表现：线路上一个线路色填充 + 站点圈描边的圆点（`TRAIN_DOT_R`，层级在线路之上、站点之下），圆点右上角跟一串极小字号的**车次号**；列车停站时，该站**站名标签正上方**再竖向排开若干行「小圆点 + 车次号」（一行一趟车，整列底边贴标签盒顶边，所以一个站可以同时列出多辆停站车）。点击圆点或任一处车次文字 = `useSelection.selectTrain`，右侧 `TrainInfo.vue` 出详情。列车不参与搜索。

**车次号**（`TrainRun.number`）：`SN-LLL-01` = 体系 id 前两位大写（`snezhnaya` → `SN`）+ 线路英文**自名**（`selfNames.en`）首字母缩写（`Large Loop Line` → `LLL`）+ 当日该线路第几班（含各变体、按开出时刻排序，2 位补零）。时刻表每天重复，所以同一车次号每天都对应同一班。

### `connections.json`

```jsonc
{ "connections": [{ "from": "…", "to": "…", "distance": 0, "waypoints": [] }] }
```

- 任意线路用到的相邻站对都在此登记，是**连接方式（费用与几何）的唯一来源**。
- `from` / `to` 是完整站点 id，按字母序存放，数组按 `(from, to)` 排序。
- `distance`（km）省略 = 缺省距离；`waypoints` 省略 / `[]` = 两点直线。
- `waypoints` 是**链式相对偏移**（数据单位，与 `station.x/y` 同尺度，渲染时 × `BLOCK_SIZE`），方向为 `from → to`：首点相对 `from`，其后每点相对前一点；线路反向经过时整个顶点列反转。
- 既无 `distance` 也无 `waypoints` 的站对**不写条目**（缺省即该站对的默认值）。
- 加载时报错的情形：短 id、未知站点、重复站对。

### 归属边界（`useTerritoryBorders.ts`）

由 `territories.json` + `stations.json` 推出的**精确 Voronoi 边界**（纯几何模块，无 Vue 依赖）：平面上每点取最近站点，用其归属单位（国家/地区 × 区域，「无区域」自成一档）划分；只画相邻归属单位之间的边界，输出国家/地区边界（粗实线）与区域边界（细虚线）两类 SVG path。

实现是 **Delaunay 三角剖分 + marching triangles**：只保留两端归属不同的 Delaunay 边，其 Voronoi 边取该边两侧三角形**外心之间的垂直平分线**（凸包边是裁到凸包的射线）；相邻三角形共外心，边界天然无缝无重叠；折线裁到站点凸包内、去掉共线中间点。没有可调分辨率。

折线到 SVG path 的**平滑方式是运行时状态**（`useBorderSmoothing.ts` 的 ref，初值 = `render.config.ts` 的 `BORDER_SMOOTHING`，由地图左下角按钮循环切换，不落盘）；三种方式都是插值的，节点精确落在曲线上，所以相邻区域不会错位：

- `flow`（默认）：整条链走向心 Catmull–Rom，最圆滑但会离开真实边界；
- `round`：只在转角做统一半径（`BORDER_CORNER_RADIUS`）圆角，直线段不动，误差 1px 量级；
- `none`：精确折线。

边界是运行时推导，不进任何数据文件；站点坐标或归属一改，下次加载自动重算。

### `mark.json`

```jsonc
{
  // 手绘 SVG 路径（数据坐标）
  "paths": [ { "d": "…", "stroke": "…", "strokeWidth": 0, "fill": "…" } ],
  // 文字标识（国家 / 运输机构 / 区域）
  "texts": [ {
    "size": "large",   // large / small，缺省 small；只决定各行字号
    "region": "…",     // 所属 nation / area id → 决定展示语言
    "names": Names,    // 主文字；其 x/y 是整条标识的锚点
    "subNames": Names, // 副文字，可选
    "emphasis": true,  // 重点标识：用重点色
    "ja": true,        // 用日语字体
    "x": 0, "y": 0
  } ]
}
```

`names` / `subNames` 与其它实体同一套语言键，要画哪几行由 `region` 的优先语言决定（见 [多语言名称](#多语言名称)）：**没有值的语言不画、与已画文字完全相同的不画**。扇平后第一行取「文本」字号、其余取「翻译」字号，行距逐行累加（第 n 行 y = 上一行 y + 本行字号 / `BLOCK_SIZE` + `MARKER_LINE_GAP`）。`useMapData.ts` 把它摊平成 `markerTexts`（一行一个实例，颜色不定，由 `RailwayMap.vue` 按主题挑），渲染只是 `v-for`。标注文字是地图里唯一不跟 Varlet 主题变量走的文字。

### 多语言名称

名称对象有两类键：

- **核心四语** `zhCN` / `zhTW` / `ja` / `en`（站点 / 线路 / 机构 / 归属 / 标注都必写；`pronunciationJa` 可选）；
- **额外语言** `ru` / `fr` / `de` / `sw` / `sa` / `ar`（可选，按地区挂在机构与归属上）。

展示规则：

1. `territories.json` 的 nation 写 `langs`（国家优先语言，按序）；
2. 区域可写自己的 `langs`（区域优先语言），排在国家的**前面**；
3. 机构用自己的 `nation` 的语言链；跨地区机构不写 `nation`，只有简中 + 英文；
4. 手绘标注用 `region` 指向的地区的链。

`stationNames.ts` 的 `displayNameLines(names, langs)` 渲染为行：取 `[...langs, 'zhCN', 'en']`，**同一语言只取一次、没有值的不取、与已取到的文字完全相同的不取**；去重后第一个是「文本」、其余是「翻译」（地图标注按此分字号档，`/display` 页头与信息面板用 `displayLabel` 合成一行）。

站点 / 线路的标签另走 `nameLabelLines(names, primaryLang)`：主语言行 → 中文行（主语言非中文时）→ 英文行。主语言 = 优先语言里第一个核心四语（都不在核心四语里则回落 `zhCN`）。地图标签、`/display` 页头与站名共用这一条规则。**繁体默认不展示**，只在数据里保留。

### 字段细则

- **站点 `id`**：完整站点 id，即 `stations.json` 的键；所有引用一律完整 id。
- **`names`**：见 [多语言名称](#多语言名称)。站点四键必非空；线路校验自名（机构前缀由代码拼出）；**轮渡 / 同站换乘禁止写 `names`**（写了报错）。
- **`nation` / `area`**（运行时 `Station`）：数据侧写 id 字符串，加载时解析成 `Territory` 对象并校验。
- **跨体系引用**：线路引用别的体系的站点时直接写完整 id。
- **`labelDir`**：可选，`L` / `R` / `T` / `B` / `LT` / `LB` / `RT` / `RB`，控制站名的偏移方向。
- **`lineLabels`**：`[stationId, position]` 数组，指示渲染器在该站附近放线路名标签。
- **`vehicle`**（变体）：从 `config/vehicles.ts` 选一种车型（缺省 `standard`），字段见该文件：`designSpeed`（设计时速）、`fareCoefficient`（票价系数，摩拉/千米）、`acceleration` / `deceleration`（m/s²，`Infinity` = 瞬时达速 / 停住；给了正加减速则时间按梯形速度曲线算）、`schedulePadding`（时刻表冗余，在时间算完后再加上 / 乘一次，只对缺省公式生效）、可覆写的 `compute(distance, vehicle)`、预留的 `capacity`（当前未使用）。未知 id 报错。
- **`operator` / `authority`**（线路）：运营公司 / 运营主体，id 引用机构表（含代码内置机构）；不写 = 用体系默认。`operator` 单个 id，`authority` 可为数组。解析后是 `line.operator`（`OrgInfo | undefined`）与 `line.authority`（`OrgInfo[]`），元素为 `{ names, langs }`，信息面板按 `displayNameLines` 逐行印出。**运营公司的四语名同时是线路名的机构前缀**。站点信息用的是按地区取的运营方（见上文）。
- **`network`**（线路）：所属体系，提供字体 / 主语言 / 默认机构 / 配音模板。
- **`colorSlot`**（线路）：整数，颜色 = `linePalette[slot % 35]`。
- **`voice`**（线路）：配音模板 id；缺省 = 体系 `voice`，再缺省 = `DEFAULT_VOICE_TEMPLATE`。结果在 `Line.voice`。
- **`oneWay`**：见 [lines.json](#linesjson)。
- **虚拟线路**：`Line.virtual`（由 `lineType === 'same-station'` 派生）只是换乘关系的载体，不是可乘坐 / 可搜索的真实线路 —— 搜索跳过它们，站点线路列表把真实线路排前、虚拟线路排最后并加「虚拟线路」标签；地图渲染、路径图与高亮照旧包含它们（0 成本边）。轮渡不是虚拟线路，仍可搜索。
- **费用与时间**：距离由 `connections.json` 查出（缺条目按缺省距离），交给该变体车型的公式（缺省 = 设计时速 + 加减速推时间、再乘时刻表冗余；票价系数推票价）。**时间全程不化整**，只有票价四舍五入到整数摩拉；上屏格式在 `composables/formatTime.ts`。唯一实现是 `useMapData.ts` 的 `pairCost(vehicleId, aId, bId)` —— 渲染段标签、路由边权、`LineInfo` 站间费用都调它。

## 路由（`composables/useRouting.ts`）

图在模块导入时一次性构建（同步）。**节点** = `` `${stationId}-${lineId}#${variantIndex}` ``。边有三类：

| 边         | 权重                 | 说明                                                                        |
| ---------- | -------------------- | --------------------------------------------------------------------------- |
| 线路相邻站 | 该变体车型的实际票价 | 只在**同一变体内**连边；`oneWay` 线路只有正向边（反向不可乘，环线必须绕行） |
| 同站换乘   | 0                    | 共享同一物理站的两条线路 —— 或同一线路的两个变体                            |
| 跨站换乘   | 0                    | `same-station` 线路定义的连接（连接不同体系的站点）                         |

因为按变体建图，跨变体（支线 ↔ 主线、小交路 ↔ 大交路）的行程会表现为在共用站的一次换乘。站对连接只用于费用，距离由 `connections.json` 查（缺条目算缺省距离），几何不参与图。

- `findRoute(start, end, metric)`：把两端各自所有线路节点作为虚拟多源 / 多汇跑 Dijkstra；`metric` 取 `'fare'`（默认）/ `'time'` / `'distance'`。
- `findRoutes(start, end)`：三种 metric 各跑一次，返回最多 3 个结果。
- `searchStations(query)`：对四语站名、id 做模糊匹配，最多 20 条。
- `searchLines(query)`：对四语线路名（轮渡的派生名也能搜到）与线路 id 同样匹配，最多 20 条；**虚拟线路不参与搜索**。
- 结果：`{ segments, pathNodeIds, totalFare, totalTime, totalDistance }`。轮渡乘车段的 `lineName` / `lineNameEn` 按行程方向用单向箭头模板重算；同站换乘段名不随方向变。
- `RouteSegment` / `NodeInfo` 带 `variantIndex` / `variantName` / `variantNameEn`，变体名会加进段名标签。

`RoutePanel`：① 搜索框（站点 / 线路两组候选）+ 信息展示（`StationInfo` / `LineInfo`，带关闭按钮）；② 路径规划（起终点输入、地图选站、计算、多方案列表、`RouteTimeline` 详情）。面板整体是一个滚动列。

**统一的信息跳转**：`useSelection.ts` 的 `selection`（`{ kind: 'station' | 'line', id }`）是「选中了什么」的唯一来源 —— 地图点击、搜索结果、面板内的交叉跳转都写它；右侧面板读它决定展示谁，`RailwayMap.vue` 读它决定高亮（选中线路 = 该线，选中站点 = 服务该站的线路，其余压到 `DIM_OPACITY`）。「选择起点 / 终点」模式下地图点击不写 selection，而是发给面板填输入框。

## 约定

- **坐标**：数据单位 × `BLOCK_SIZE`（64px，`render.config.ts`）。SVG 视口按数据边界 + `margin` 定尺寸；背景网格即数据单位（`gridStep` 由 `BLOCK_SIZE` 派生，从不单独设置），所以网格、站点位置与鼠标读数永远一致。`BLOCK_SIZE` 是地图缩放的唯一旋钮（标签网格间距与边界 `MIN_SEGMENT` 也随之）。
- **字体 / 字号**：稻妻站名用 `"Noto Serif JP", serif`，其余 `"Noto Sans SC"`；标签字号固定（`fsCNSmall: 12`、`fsENSmall: 8`），不随缩放切换。
- **名称与语言**：每个站点 / 线路都带四语 `names`；站点名的 `primaryLang` 由所属 nation 的优先语言推出，线路名的来自体系 `primaryLang`。行序由 `nameLabelLines` 唯一决定，见 [多语言名称](#多语言名称)。
- **线路调色板**：`linePalette`（`render.config.ts`，35 色）由各自的 `colorSlot` 取用；轮渡 / 同站换乘用 `FERRY_COLOR` / `SAME_COLOR`。
- **并行轨道**：共享区段按线路数居中偏移 `LINE_WIDTH`；一条线路不论有多少变体只占**一个**槽位（变体站对先去重，再算偏移）。
- **视口持久化**：平移缩放存 localStorage `teyvat-railways-map-state`。
- **导入路径**：一律相对路径（`../../composables/...`）。`tsconfig.json` 虽声明了 `@/*` → `./src/*` 别名，但 `vite.config.ts` 没有对应 `resolve.alias`，用 `@/...` 会构建失败 —— 不要用。
- **SVG 隔离**：`RailwayMap.vue` 只用内联样式（`fill` / `stroke` / SVG 属性），不用 Tailwind 类，保证 SVG 可整体导出；其它 Vue 组件可正常用 Tailwind 工具类。
- **线段形态**：每段渲染为 `<path>`。`straight`（默认）输出 `M … L …`；`curve`（`useRenderMode`，**未接入 UI**，实际恒为 `straight`）用 `useCurveGeometry` 的向心 Catmull–Rom 输出三次曲线，且**只取该站对的两个站点**为顶点（忽略途经点，残余 `partIndex > 0` 的部分输出空 `d`）。两种形态的 id、明暗与点击逻辑一致，路由高亮照常工作。

## 样式 / Tailwind

- Tailwind CSS v4 + `@tailwindcss/vite`，零配置（无 `tailwind.config.js` / `postcss.config.js`）。
- 入口：`src/style.css` 的 `@import "tailwindcss"`，在 `src/main.ts` 中最先导入。
- **不要在 `RailwayMap.vue` 模板里用 Tailwind 类** —— SVG 必须保持自包含以便导出。

## 提交

- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)，用**英文**；scope 可选（如 `feat(routing)`、`fix(map)`），纯数据改动用 `data:` 前缀。
- 提交前：① 跑 `pnpm format`；② 有逻辑改动（新功能、schema 变更、重构）时同步更新本文件。

## 易错点

- `dist/` 不入库（`.gitignore` 忽略 `/dist`），`pnpm build` 本地重新生成。
- 路由 history base 是 `/tr`（`router/index.ts`），但 vite 未设 `base`，所以构建产物的资源路径是域名根下的 `/assets/*`。
- 数据表集合硬编码在三处，加表 / 改表要同步：`useMapData.ts`（import + 解析）、`AdminPanel.vue`（`fileKeys`）、`vite.config.ts`（`ALLOWED_FILES`）。配音模板集合由 `voiceTemplates.ts` 的 `import.meta.glob` 自动发现，无需改。
- `vue-tsc` 在 devDeps 里但没有 npm script，用 `npx vue-tsc --noEmit`。
- 无自动测试，只有手工验证：`pnpm dev` 后在浏览器里看。
- `intro.md` 由 `InfoDialog.vue` 以 `?raw` 导入并经 `markdown-exit` 渲染；首次访问检测用 localStorage `teyvat-railways-visited`。
- AdminPanel（🛠 按钮，仅开发模式）经 vite 中间件的 `GET/PUT /__admin/data/<文件名>.json` 读写数据表，只允许 `ALLOWED_FILES` 里列出的文件名；写回后 Vite HMR 自动刷新。
- `RoutePanel` 通过 `defineExpose` 暴露 `onStationClick(stationId)`，`HomeView` 在地图 emit `station-click` 时调用它；地图只在「选择起点 / 终点」时 emit，其余点击进 `useSelection`。
- 两条时间线（路径详情与线路全览）共用 `TransitTimeline.vue`：`items` 由站点行（可点击、可带 in/out 轨道色）与区间行（线路名 / 说明 / 费用）组成，轨道段与圆点同列上下相接所以整条线连续；费用位置由 `metricsPlacement` 决定。`RouteTimeline` 由 `result.segments` 摊平 items，同名站连续时复用同一站点行。
- 站对连接（距离**与**途经点）只在 `src/data/connections.json`；线路不再带逐对途经点。加一条连接 = 在那里加一条完整 id 的条目（缺省即缺省距离 + 直线）。
- 变体（支线 / 大小交路）是所属线路的 `variants[]`，不是独立线路，所以没有自己的颜色与并行偏移；车型按变体各自用 `vehicle` 选。轮渡 / 同站换乘线路单变体。
- 换乘站圆圈数的是**线路**而不是变体（按线路的站点并集判定）。
- 归属边界的平滑是运行时的，由左下角按钮切换，三种方式都在节点处插值，所以换方式不会让相邻区域错位或撕开。
- 曲线模式刻意忽略途经点（顶点只取站对两端）。
- `/display` 只画轨道线路，轮渡 / 同站换乘不出现，换乘徽章也只列轨道线路。
- `/display` 的徽章文字取另一条线路名主语言写法的**最后一个 `·` 之后**部分（没有 `·` 就用全名），所以同一运营方的多条线可能只显示号码 —— 其余身份由颜色承载。
- `/display` 面板 1920 宽 × 280 高（每支线 +24px），滚动容器在页面根部（`index.html` 里 `#app` 是 `height:100%; overflow:hidden`），超出视口的内容必须在页面内部滚动。
- `/display` 的排版是纯 CSS（`index.vue` 的 scoped style，无 SVG、无 JS 坐标）；`stripModel.ts` 只决定 CSS 做不到的判断，依赖真实字宽的部分仍走 `MeasureFn`。
- `/display` 每条面板上方有一条同宽的调试 / 配置栏：动态模式开关打开后出现方向、变体、进度；语音面板吸顶在页面最顶上。动态状态只在内存里，刷新即重置。
- 环线（首末同站的闭合线路）走 `loopStrip.ts` 专用路径：末尾闭合重复站不画、按滚动后的站序重建条带、进度是另一套模型（首列灰、到站列原色闪烁、其余整圈点亮）；单向环线只有数据方向一种，配置栏不出现「下行」。
- 语音播报语言按 `primaryLang` 自动选：站点级事件看目标站、线路级事件看线路主语言；`ja` → 日语，其余 → 中文，各自再补 `extraLanguages`（缺省 `en`）。模板由线路 `Line.voice` 引用（线路 → 体系 → `common`）。
- 播报引擎是模块级单例的**打断式**队列：新播报先 `cancel()` 并把未播完的日志标「已打断」；日志上限 60 条，全局一条，所有打开的配置栏显示同一份。
