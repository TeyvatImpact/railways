<script setup lang="ts">
import { computed, reactive } from 'vue';
import {
  lines,
  stationMap,
  type Line,
  type LineVariant,
  type Station,
} from '../../composables/useMapData';
import { measureText } from '../../composables/useLabelPlacement';
import { nameLabelLines } from '../../composables/stationNames';
import { splitVariants, type DivergentBranch } from './variantStrip';
import { buildStrip, EDGE, type MeasureFn, type StripInput, type StripModel } from './stripModel';
import {
  buildProgress,
  EMPTY_PROGRESS,
  type Direction,
  type ProgressModel,
  type ProgressStep,
  type RouteSpan,
} from './dynamicStrip';
import {
  buildAnnouncement,
  shortLineName,
  type AnnounceContext,
  type StationText,
} from './announce';
import { useSpeech } from '../../composables/useSpeech';
import { PROGRESS_STATES, type AnnounceKind } from '../../config/announce.config';
import VoicePanel from './VoicePanel.vue';
import AnnounceLog from './AnnounceLog.vue';

/** 只画轨道交通线路：轮渡（ferry.json 9 条 + 区域文件内 3 条）与同站换乘（same.json 3 条）都不画 */
const railLines = lines.filter((line) => !line.lineType);

/** 站点 → 服务它的线路（只看本页画出来的线路），用于换乘徽章 */
const stationLines = new Map<string, Line[]>();
for (const line of railLines) {
  for (const sid of line.stations) {
    const list = stationLines.get(sid);
    if (list) list.push(line);
    else stationLines.set(sid, [line]);
  }
}

const measure: MeasureFn = (text, size, weight, family) =>
  measureText(text, size, weight >= 600, family);

/** 站名标签行：主语言行 + 中文行（主语言非中文时）+ 英文行 */
function stationLabel(station: Station) {
  return { id: station.id, lines: nameLabelLines(station.names, station.primaryLang) };
}

/** 本站换乘的其他轨道交通线路徽章 */
function badgesFor(line: Line, stationId: string) {
  return (stationLines.get(stationId) ?? [])
    .filter((other) => other.id !== line.id)
    .map((other) => ({ label: shortLineName(other.names[other.primaryLang]), fill: other.color }));
}

function buildInput(
  line: Line,
  variant: LineVariant,
  branches: DivergentBranch<LineVariant>[],
): StripInput {
  const stations = variant.stations
    .map((sid) => stationMap.get(sid))
    .filter((station) => station !== undefined)
    .map((station) => ({ ...stationLabel(station), badges: badgesFor(line, station.id) }));

  return {
    key: line.id,
    color: line.color,
    cjkFont: line.fontFamily || 'sans-serif',
    labelLines: nameLabelLines(line.names, line.primaryLang),
    operator: line.operator?.names,
    authority: line.authority?.names,
    stations,
    // 支线独占站只画车道上的圆圈与站名，不带换乘徽章（徽章行在主线之上，引线要横穿主线）
    branches: branches.map((b) => ({
      name: b.variant.name,
      nameEn: b.variant.nameEn,
      junctionId: b.junctionId,
      stations: b.stationIds
        .map((sid) => stationMap.get(sid))
        .filter((station) => station !== undefined)
        .map(stationLabel),
    })),
  };
}

interface VariantOption {
  index: number;
  label: string;
  name: string;
  nameEn: string;
  stations: string[];
}

/** 线路 id → 可选变体（含站序）、条带主线（= 站数最多的变体）序号与分岔支线（换乘提示要用） */
const lineVariants = new Map<
  string,
  { options: VariantOption[]; primary: number; branches: DivergentBranch<LineVariant>[] }
>();

const strips = railLines.map((line) => {
  const { primary, branches } = splitVariants(line.variants);
  lineVariants.set(line.id, {
    primary: primary.index,
    branches,
    options: line.variants.map((variant, index) => ({
      index,
      label: variant.name
        ? `${variant.name}${variant.nameEn ? ` · ${variant.nameEn}` : ''}`
        : '全线',
      name: variant.name,
      nameEn: variant.nameEn,
      stations: variant.stations,
    })),
  });
  return buildStrip(buildInput(line, primary.variant, branches), measure);
});

interface DynState {
  on: boolean;
  dir: Direction;
  variant: number;
  progress: number;
}

/** 每条线路的动态模式状态（内存态，不落 localStorage）；默认变体 = 条带主线变体，默认进度 = 起点站 */
const dynState = reactive<Record<string, DynState>>(
  Object.fromEntries(
    strips.map((s): [string, DynState] => [
      s.key,
      { on: false, dir: 'up', variant: lineVariants.get(s.key)!.primary, progress: 0 },
    ]),
  ),
);

/** 每条线路的进度模型；关掉开关时给空模型（不下发任何灰 / 闪状态） */
const dynViews = computed<Record<string, ProgressModel>>(() => {
  const out: Record<string, ProgressModel> = {};
  for (const s of strips) {
    const state = dynState[s.key];
    const variant = state.on ? lineVariants.get(s.key)?.options[state.variant] : undefined;
    out[s.key] = variant
      ? buildProgress(s, variant.stations, state.dir, state.progress, {
          leave: PROGRESS_STATES.leave,
        })
      : EMPTY_PROGRESS;
  }
  return out;
});

function dyn(key: string): ProgressModel {
  return dynViews.value[key] ?? EMPTY_PROGRESS;
}

function variantOptions(key: string): VariantOption[] {
  return lineVariants.get(key)?.options ?? [];
}

/** 换乘徽章跟着本站走：本站已变灰（不在本趟行程上或已经过）时，徽章底色与引线一并变灰 */
function badgeFill(key: string, col: number, fill: string): string {
  return dynState[key].on && dyn(key).states[col] === 'dim' ? 'var(--dyn-gray)' : fill;
}

/** 语音播报引擎（模块级单例）：自动播报关闭时 speak 自己会静默跳过 */
const speech = useSpeech();

/** 线路 id → 线路数据（判地区、取线路名） */
const lineMap = new Map(railLines.map((line) => [line.id, line]));

/**
 * 拼出一次播报的上下文：站点级事件用该站的地区选语言、线路级事件用线路首个站的地区。
 * 缺少必需对象（查不到站 / 变体不存在）时给 null —— 这次不播报。
 */
function buildContext(
  key: string,
  kind: AnnounceKind,
  step?: ProgressStep,
): AnnounceContext | null {
  const line = lineMap.get(key);
  const variant = variantOptions(key)[dynState[key].variant];
  if (!line || !variant) return null;

  const stations = variant.stations;
  const terminusId = dynState[key].dir === 'up' ? stations[stations.length - 1] : stations[0];
  const terminus = terminusId ? (stationMap.get(terminusId) ?? null) : null;
  const branches = lineVariants.get(key)?.branches ?? [];

  let station: StationText | null = null;
  let next: StationText | null = null;
  if (step?.kind === 'station') {
    station = stationMap.get(step.stationId) ?? null;
    if (!station) return null;
  } else if (step) {
    station = stationMap.get(step.fromId) ?? null;
    next = stationMap.get(step.toId) ?? null;
    if (!station || !next) return null;
  }

  // 换乘句：station 看本站、enter / leave 看下一站
  const transferStation = kind === 'station' ? station : next;
  const transfers = transferStation
    ? (stationLines.get(transferStation.id) ?? [])
        .filter((other) => other.id !== key)
        .map((other) => ({ names: other.names }))
    : [];
  // 支线换乘提示：仅当「下一站是分岔站」
  const nextBranches = next
    ? branches
        .filter((branch) => branch.junctionId === next.id)
        .map((branch) => ({ name: branch.variant.name, nameEn: branch.variant.nameEn }))
    : [];

  return {
    kind,
    line: { names: line.names, stationIds: line.stations },
    direction: dynState[key].dir,
    variant: { name: variant.name, nameEn: variant.nameEn },
    terminus,
    station,
    next,
    transfers,
    branches: nextBranches,
    branchTrain: branches.some((branch) => branch.variant === line.variants[dynState[key].variant]),
  };
}

function announce(key: string, kind: AnnounceKind, step?: ProgressStep, force = false) {
  const ctx = buildContext(key, kind, step);
  if (ctx) speech.speak(buildAnnouncement(ctx), { force });
}

/** 进度步骤 → 播报类型：station（到站）/ enter（出站）/ leave（即将入站） */
function announceStep(key: string, step: ProgressStep, force = false) {
  announce(key, step.kind, step, force);
}

/** ◀ ▶：改进度并播报新状态 */
function goStep(key: string, delta: number) {
  dynState[key].progress = dyn(key).index + delta;
  const step = dyn(key).steps[dynState[key].progress];
  if (step) announceStep(key, step);
}

/** 「播报」按钮：与自动播报同一条内容（当前进度状态），force 绕过自动播报开关 */
function replay(key: string) {
  const step = dyn(key).steps[dyn(key).index];
  if (step) announceStep(key, step, true);
}

/** 方向下拉文案：上行 = 站序（图上从左到右），下行 = 逆序；环线（首末同站）注明顺行 / 逆行 */
function dirLabel(s: StripModel, dir: Direction): string {
  const head = dir === 'up' ? '上行' : '下行';
  const stations = variantOptions(s.key)[dynState[s.key].variant]?.stations;
  if (!stations?.length) return head;
  const firstId = stations[0];
  const lastId = stations[stations.length - 1];
  if (firstId === lastId) return `${head}（${dir === 'up' ? '顺行' : '逆行'}）`;
  const firstSt = stationMap.get(firstId);
  const lastSt = stationMap.get(lastId);
  const first = firstSt?.names[firstSt.primaryLang];
  const last = lastSt?.names[lastSt.primaryLang];
  if (!first || !last) return head;
  return `${head}（${dir === 'up' ? `${first} → ${last}` : `${last} → ${first}`}）`;
}

/** 动态高亮段的 grid 位置：列线 = col + 2（第 1 列是左边距），行 = 7 + lane；diag 只占 1 列（不写结束线） */
function spanStyle(sp: RouteSpan) {
  return sp.kind === 'diag'
    ? { gridRow: 7 + sp.lane, gridColumnStart: sp.fromCol + 2 }
    : { gridRow: 7 + sp.lane, gridColumnStart: sp.fromCol + 2, gridColumnEnd: sp.toCol + 2 };
}

function onToggle(key: string, e: Event) {
  dynState[key].on = (e.target as HTMLInputElement).checked;
  if (dynState[key].on) announce(key, 'on');
  else speech.note('动态模式已关闭');
}

/** 换方向 / 换变体都回到新行程的起点站 */
function onDir(key: string, e: Event) {
  dynState[key].dir = (e.target as HTMLSelectElement).value === 'down' ? 'down' : 'up';
  dynState[key].progress = 0;
  announce(key, 'direction');
}

function onVariant(key: string, e: Event) {
  dynState[key].variant = Number((e.target as HTMLSelectElement).value);
  dynState[key].progress = 0;
  announce(key, 'variant');
}

function onProgress(key: string, e: Event) {
  dynState[key].progress = Number((e.target as HTMLSelectElement).value);
  const step = dyn(key).steps[dynState[key].progress];
  if (step) announceStep(key, step);
}

/** `.strip` 的纵向骨架：页头 / 徽章两行（含上下间隔）/ 引线通道 / 主线 / 每条支线一段车道 / 站名（吃掉剩余高度） */
const BASE_ROWS = ['52px', '4px', '20px', '6px', '20px', '12px', '18px'];
/** 一段支线车道的高度（px）：支线的 45° 引线与车道横线落点都由它推出来（见 .lane-diag / .lane-track） */
const LANE_ROW = 24;
const PANEL_H = 280;
/** 动态模式里「一份接一份点亮」的周期（秒）：与 CSS 的 dyn-march-2 / dyn-march-3 一致 */
const DYN_PERIOD = 1.1;

function stripStyle(s: StripModel) {
  const n = s.stations.length;
  return {
    '--line-color': s.color,
    '--chip-text': s.chipTextFill,
    '--cjk-font': s.cjkFont,
    '--branch-color': s.branchLabelColor,
    '--lane-row': `${LANE_ROW}px`,
    // 首末站各留 EDGE，中间等分（与 stripModel 的站距算法一致）
    gridTemplateColumns: `${EDGE}px repeat(${Math.max(1, n - 1)}, 1fr) ${EDGE}px`,
    gridTemplateRows: [...BASE_ROWS, ...s.lanes.map(() => `${LANE_ROW}px`), 'minmax(0, 1fr)'].join(
      ' ',
    ),
    height: `${PANEL_H + s.lanes.length * LANE_ROW}px`,
  };
}

/** 第 col 列（0 起算）的站点落在 grid 的第 col+2 条列线上（第 1 列是左边距） */
function cell(col: number) {
  return { gridColumn: col + 2 };
}
</script>

<template>
  <div class="bg-white h-screen overflow-y-auto px-4 pb-4">
    <div class="w-max mx-auto flex flex-col gap-6">
      <VoicePanel />
      <div v-for="s in strips" :key="s.key" class="flex flex-col gap-1.5">
        <!-- 面板外的调试/配置栏：动态模式开关 + 展开后的三项配置 + 播报日志 -->
        <div class="dyn-bar">
          <div class="dyn-row">
            <label class="dyn-switch">
              <input
                type="checkbox"
                :checked="dynState[s.key].on"
                @change="onToggle(s.key, $event)" />
              <span class="dyn-switch-track"></span>
              <span class="dyn-switch-text">动态模式</span>
            </label>
            <template v-if="dynState[s.key].on">
              <label class="dyn-field">
                <span class="dyn-field-label">线路方向</span>
                <select
                  class="dyn-select dyn-select-dir"
                  :value="dynState[s.key].dir"
                  @change="onDir(s.key, $event)">
                  <option value="up">{{ dirLabel(s, 'up') }}</option>
                  <option value="down">{{ dirLabel(s, 'down') }}</option>
                </select>
              </label>
              <label v-if="variantOptions(s.key).length > 1" class="dyn-field">
                <span class="dyn-field-label">线路变体</span>
                <select
                  class="dyn-select dyn-select-variant"
                  :value="dynState[s.key].variant"
                  @change="onVariant(s.key, $event)">
                  <option v-for="v in variantOptions(s.key)" :key="v.index" :value="v.index">
                    {{ v.label }}
                  </option>
                </select>
              </label>
              <div class="dyn-field">
                <span class="dyn-field-label">进度</span>
                <button
                  type="button"
                  class="dyn-btn"
                  :disabled="dyn(s.key).index <= 0"
                  @click="goStep(s.key, -1)">
                  ◀
                </button>
                <select
                  class="dyn-select dyn-select-progress"
                  :value="dyn(s.key).index"
                  @change="onProgress(s.key, $event)">
                  <option v-for="(step, i) in dyn(s.key).steps" :key="i" :value="i">
                    {{ step.label }}
                  </option>
                </select>
                <button
                  type="button"
                  class="dyn-btn"
                  :disabled="dyn(s.key).index >= dyn(s.key).count - 1"
                  @click="goStep(s.key, 1)">
                  ▶
                </button>
              </div>
            </template>
          </div>
          <div v-if="dynState[s.key].on" class="dyn-row dyn-row-bottom">
            <button type="button" class="dyn-btn dyn-btn-speak" @click="replay(s.key)">
              🔊 播报
            </button>
            <AnnounceLog class="dyn-log" />
          </div>
        </div>

        <div class="strip" :class="{ 'strip-dyn': dynState[s.key].on }" :style="stripStyle(s)">
          <!-- 页头：线路名称色块 → 运营公司 → 运营主体（只写名称本身） -->
          <header class="head">
            <div class="chip">
              <span v-for="l in s.labelLines" :key="l.locale" :class="'chip-' + l.kind">{{
                l.text
              }}</span>
            </div>
            <div v-if="s.operator" class="block">
              <span class="block-name">{{ s.operator.zhCN }}</span>
              <span class="block-en">{{ s.operator.en }}</span>
            </div>
            <div v-if="s.authority" class="block">
              <span class="block-name auth-name">{{ s.authority.zhCN }}</span>
              <span class="block-en">{{ s.authority.en }}</span>
              <span v-if="s.authority.ru" class="block-en">{{ s.authority.ru }}</span>
            </div>
          </header>

          <!-- 换乘徽章：每站一簇，水平居中在本站列上；行由模型决定 -->
          <div
            v-for="st in s.stations"
            v-show="st.badges.length"
            :key="'badges-' + st.col"
            class="badges"
            :class="st.badges[0]?.row === 1 ? 'badges-far' : 'badges-near'"
            :style="{ ...cell(st.col), '--badge-shift': st.badgeShift + 'px' }">
            <span
              v-for="(b, k) in st.badges"
              :key="k"
              class="badge"
              :style="{
                background: badgeFill(s.key, st.col, b.fill),
                color: b.textFill,
                '--badge-color': badgeFill(s.key, st.col, b.fill),
              }">
              {{ b.label }}
            </span>
          </div>

          <!-- 主线 -->
          <div class="track" :style="{ gridColumnEnd: s.trunkEndCol + 2 }"></div>

          <!-- 支线：45° 汇入引线 + 车道横线 + 末端支线名标签块（每条支线占主线下方一段） -->
          <template v-for="ln in s.lanes" :key="'lane-' + ln.lane">
            <div
              class="lane-diag"
              :style="{ gridRow: 7 + ln.lane, gridColumn: ln.junctionCol + 2 }"></div>
            <div
              class="lane-track"
              :style="{
                gridRow: 7 + ln.lane,
                gridColumn: ln.junctionCol + 2,
                gridColumnEnd: ln.lastCol + 2,
              }"></div>
            <div
              v-if="ln.tag"
              class="lane-tag"
              :class="{
                'dyn-dim': dynState[s.key].on && !dyn(s.key).activeLanes.includes(ln.lane),
              }"
              :style="{ gridRow: 7 + ln.lane, gridColumn: ln.tag.col + 2 }">
              <span>{{ ln.tag.text }}</span>
              <span class="lane-tag-en">{{ ln.tag.textEn }}</span>
            </div>
          </template>

          <!-- 动态模式：只点亮本趟行程还没走到的段；正在经过的区间切成几份，一份一份点亮（顺序 = 行进方向） -->
          <div
            v-for="(sp, i) in dyn(s.key).litSpans"
            :key="'dyn-lit-' + i"
            class="dyn-span"
            :class="{ 'dyn-span-diag': sp.kind === 'diag', 'dyn-span-lead': sp.lead }"
            :style="spanStyle(sp)"></div>
          <div
            v-for="(sp, i) in dyn(s.key).currentParts"
            :key="'dyn-cur-' + i"
            class="dyn-span dyn-span-cur"
            :class="{ 'dyn-span-diag': sp.kind === 'diag', 'dyn-span-lead': sp.lead }"
            :style="spanStyle(sp)">
            <div
              class="dyn-chunk"
              :class="'dyn-chunk-' + sp.parts"
              :style="{
                left: sp.offset * 100 + '%',
                width: sp.ratio * 100 + '%',
                animationDelay: `${-(i / sp.parts) * DYN_PERIOD}s`,
              }"></div>
          </div>

          <!-- 站点：白底圆圈 + 居中的序号（不在本趟行程上 / 已经过的都是灰的；当前站不闪，闪烁落在站名上） -->
          <div
            v-for="st in s.stations"
            :key="'node-' + st.col"
            class="node"
            :class="{ 'dyn-dim': dyn(s.key).states[st.col] === 'dim' }"
            :style="{ ...cell(st.col), gridRow: 7 + st.lane }">
            {{ st.index }}
          </div>

          <!-- 站名：整块 45° 斜排（绕左上角旋转），越靠右的车站按模型的左移量回缩；正在经过的站闪站名 -->
          <div
            v-for="st in s.stations"
            :key="'label-' + st.col"
            class="st-label"
            :class="{
              'st-label-branch': st.lane > 0,
              'dyn-dim': dyn(s.key).states[st.col] === 'dim',
              'dyn-cur': dyn(s.key).states[st.col] === 'current',
            }"
            :style="{ ...cell(st.col), '--label-shift': st.labelShift + 'px' }">
            <div v-for="l in st.lines" :key="l.locale" :class="'st-' + l.kind">{{ l.text }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 每条线路 = 一张宽 1920 的面板（高 280，有支线时每段车道再加 24，见 stripStyle）。格子（grid）把
   「页头 / 两行徽章 / 引线通道 / 主线 / 每条支线一段车道 / 站名」分成若干行，线路的每个车站占一列，
   所有对齐、间距、居中、旋转都交给 CSS；纵向骨架与列模板由 index.vue 的 stripStyle 生成。 */
.strip {
  display: grid;
  width: 1920px;
  padding: 16px;
  border: 2.5px solid var(--line-color);
  border-radius: 14px;
  background: #fff;
  overflow: hidden;
  /* 动态模式里「已经过」的灰 */
  --dyn-gray: #aab1bb;
}

/* ---- 页头 ---- */
.head {
  grid-row: 1;
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 16px;
}
.chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 52px;
  padding: 0 18px;
  border-radius: 12px;
  background: var(--line-color);
  color: var(--chip-text);
}
.chip-name {
  font: 700 22px/1.15 var(--cjk-font);
}
.chip-zh {
  font:
    700 11px/1.15 'Noto Serif SC',
    serif;
}
.chip-en {
  font:
    400 11px/1.15 Barlow,
    sans-serif;
}
.block {
  display: flex;
  flex-direction: column;
}
.block-name {
  font: 700 22px/1.15 var(--cjk-font);
  color: #111;
}
.block-name.auth-name {
  color: #333;
}
.block-en {
  font:
    400 11px/1.15 Barlow,
    sans-serif;
  color: #888;
}

/* ---- 换乘徽章 ---- */
.badges {
  /* 站在列的起始线上（= 本站 x），先自居中；顶到内容区边缘时按模型给的量挤回来 */
  justify-self: start;
  transform: translateX(calc(-50% + var(--badge-shift, 0px)));
  align-self: center;
  display: flex;
  gap: 8px;
}
.badges-near {
  grid-row: 5;
}
.badges-far {
  grid-row: 3;
}
.badge {
  position: relative;
  height: 20px;
  padding: 0 12px;
  border-radius: 8px;
  font: 700 11px/20px var(--cjk-font);
  white-space: nowrap;
}
/* 引线：徽章下沿中点垂直落到主线圆圈；近行的长度 = 上方 12px 的通道 */
.badge::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  width: 2px;
  height: 12px;
  margin-left: -1px;
  background: var(--badge-color);
}
.badge::before {
  content: '';
  position: absolute;
  top: calc(100% + 12px);
  left: 50%;
  margin-left: -5px;
  border: 5px solid transparent;
  border-top: 6px solid var(--badge-color);
  border-bottom: 0;
}
/* 远行（上面那行）的引线要跨过近行：6 + 20 + 12 = 38 */
.badges-far .badge::after {
  height: 38px;
}
.badges-far .badge::before {
  top: calc(100% + 38px);
}

/* ---- 主线与站点 ---- */
.track {
  grid-row: 7;
  /* 起点 = 首站列线；末端列线由模板按 trunkEndCol 给（主线只跨首末主线站） */
  grid-column: 2;
  align-self: center;
  height: 5px;
  border-radius: 3px;
  background: var(--line-color);
}

/* ---- 支线车道 ---- */
/* 45° 汇入引线：起点 = 主线圆圈中心（主线行高 18px → 圆心在车道段上沿之上 9px），
   落点 = 车道圆圈中心（车道段居中）；45° 下水平行程 = 竖直落差 */
.lane-diag {
  justify-self: start;
  align-self: start;
  /* 起点 = 主线圆圈中心（主线行高 18px → 圆心恰在车道段上沿之上 9px，不能再减车道段的一半高度） */
  margin-top: -9px;
  /* 45°：水平行程 = 竖直落差 = 车道段一半高 + 9px（主线圆心 → 车道圆心的距离） */
  width: calc((var(--lane-row) / 2 + 9px) * 1.4142136);
  height: 5px;
  border-radius: 3px;
  background: var(--line-color);
  transform: rotate(45deg);
  transform-origin: 0 0;
}
/* 车道横线：从引线落点起（横线起点缩进 = 同上水平行程），画到支线末站的列线 */
.lane-track {
  align-self: center;
  margin-left: calc(var(--lane-row) / 2 + 9px);
  height: 5px;
  border-radius: 3px;
  background: var(--line-color);
}
/* 支线名标签块：挂在支线末站右边那一列上 */
.lane-tag {
  justify-self: start;
  align-self: center;
  margin-left: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 18px;
  padding: 0 9px;
  border-radius: 6px;
  background: var(--branch-color);
  color: #fff;
}
.lane-tag > span {
  font: 700 11px/1 var(--cjk-font);
}
.lane-tag .lane-tag-en {
  font:
    400 8px/1 Barlow,
    sans-serif;
}
/* 支线站名（含稻妻中译行）用支线红 */
.st-label-branch .st-name,
.st-label-branch .st-zh,
.st-label-branch .st-en {
  color: var(--branch-color);
}
.node {
  grid-row: 7;
  justify-self: start;
  transform: translateX(-50%);
  align-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 2px solid #111;
  border-radius: 50%;
  background: #fff;
  color: #111;
  font: 700 10px var(--cjk-font);
}

/* ---- 站名：整块绕左上角旋转 45°，起点就在本站（圆圈中心） ---- */
.st-label {
  /* 最后一行 = 站名行（支线车道行插在主线行与它之间，行数随支线数变） */
  grid-row: -2;
  justify-self: start;
  align-self: start;
  transform: translateX(var(--label-shift, 0px)) rotate(45deg);
  transform-origin: 0 0;
  white-space: nowrap;
}
.st-name {
  font: 700 12px/1.35 var(--cjk-font);
  color: #111;
}
.st-zh {
  font:
    700 8px/1.35 'Noto Serif SC',
    serif;
  color: #333;
}
.st-en {
  font:
    400 8px/1.35 Barlow,
    sans-serif;
  color: #333;
}

/* ---- 面板外的调试/配置栏 ---- */
.dyn-bar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 1920px;
  padding: 6px 10px;
  border: 1px solid #d8dde3;
  border-radius: 10px;
  background: #f6f8fa;
  color: #333;
  font-size: 12px;
}
/* 第一行 = 开关 + 三项配置；第二行 = 播报按钮 + 播报日志 */
.dyn-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.dyn-row-bottom {
  align-items: stretch;
}
.dyn-btn-speak {
  align-self: center;
  width: auto;
  padding: 0 10px;
}
.dyn-log {
  flex: 1;
}
.dyn-field {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dyn-field-label {
  color: #666;
  white-space: nowrap;
}
.dyn-select {
  height: 24px;
  padding: 0 6px;
  border: 1px solid #cfd6dd;
  border-radius: 6px;
  background: #fff;
  color: #222;
  font-size: 12px;
}
.dyn-select-dir {
  width: 240px;
}
.dyn-select-variant {
  width: 180px;
}
.dyn-select-progress {
  width: 280px;
}
.dyn-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 24px;
  border: 1px solid #cfd6dd;
  border-radius: 6px;
  background: #fff;
  color: #333;
  font-size: 12px;
  cursor: pointer;
}
.dyn-btn:disabled {
  color: #b6bcc4;
  cursor: default;
}
.dyn-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  cursor: pointer;
}
.dyn-switch input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
}
.dyn-switch-track {
  position: relative;
  width: 34px;
  height: 18px;
  border-radius: 9px;
  background: #c8ced6;
  transition: background 0.15s;
}
.dyn-switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.dyn-switch input:checked + .dyn-switch-track {
  background: #4363d8;
}
.dyn-switch input:checked + .dyn-switch-track::after {
  transform: translateX(16px);
}

/* ---- 动态模式：整条线路默认变灰，只点亮本趟行程还没走到的段 ---- */
/* 打开动态模式后，线路几何（主线 / 支线 45° 引线 / 车道横线）一律以灰为底：
   不在本趟变体行程上的段、以及已经走过的段，就一直保持这个灰 */
.strip-dyn .track,
.strip-dyn .lane-diag,
.strip-dyn .lane-track {
  background: var(--dyn-gray);
}
/* 点亮段（还没走到）：按原色盖在灰底上 */
.dyn-span {
  align-self: center;
  height: 5px;
  border-radius: 3px;
  background: var(--line-color);
}
/* 正在经过的区间：底不再整段着色（透出下面的灰线），由里面一份一份点亮 —— 亮的先后即行进方向 */
.dyn-span-cur {
  position: relative;
  background: none;
}
/* 一份：位置（left）与占比（width）由模型给；同一区间里只有一份是亮的 */
.dyn-chunk {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 3px;
  background: var(--line-color);
}
.dyn-chunk-2 {
  animation: dyn-march-2 1.1s linear infinite;
}
.dyn-chunk-3 {
  animation: dyn-march-3 1.1s linear infinite;
}
/* 与 .lane-diag 同形：从分歧站圆圈中心 45° 汇入支线车道（写在 .dyn-span 之后才能覆盖 align-self） */
.dyn-span-diag {
  justify-self: start;
  align-self: start;
  margin-top: -9px;
  width: calc((var(--lane-row) / 2 + 9px) * 1.4142136);
  transform: rotate(45deg);
  transform-origin: 0 0;
}
/* 车道段从引线落点起：与 .lane-track 的左缩进一致 */
.dyn-span-lead {
  margin-left: calc(var(--lane-row) / 2 + 9px);
}
.node.dyn-dim {
  border-color: var(--dyn-gray);
  color: var(--dyn-gray);
}
/* 正在经过的站：闪的是站名那一块（圆圈与序号保持原色，不再闪） */
.st-label.dyn-cur {
  animation: dyn-blink 1.1s ease-in-out infinite;
}
.st-label.dyn-dim .st-name,
.st-label.dyn-dim .st-zh,
.st-label.dyn-dim .st-en {
  color: var(--dyn-gray);
}
/* 本趟行程用不到的车道，连末端的「支线」标签块一起变灰 */
.lane-tag.dyn-dim {
  background: var(--dyn-gray);
}
/* 一份一份点亮：每份一个周期内亮 1 / 份数 的时间，靠 animation-delay 错开相位，所以同时只有一份是亮的 */
@keyframes dyn-march-2 {
  0%,
  49.99% {
    opacity: 1;
  }
  50.01%,
  100% {
    opacity: 0;
  }
}
@keyframes dyn-march-3 {
  0%,
  33.32% {
    opacity: 1;
  }
  33.34%,
  100% {
    opacity: 0;
  }
}
@keyframes dyn-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.15;
  }
}
</style>
