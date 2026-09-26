<script setup lang="ts">
import { computed } from 'vue';
import { lines, stationMap, type Line, type Station } from '../../composables/useMapData';
import { measureText } from '../../composables/useLabelPlacement';
import { splitVariants } from './variantStrip';
import { buildStrip, EDGE, type MeasureFn, type StripInput, type StripModel } from './stripModel';

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

/** 徽章上的线名只留最后一段：`蒙德局·自由线` → `自由线`、`IR 東稲妻·鳴神島線` → `鳴神島線` */
function shortName(name: string): string {
  return name.split('·').pop() || name;
}

const measure: MeasureFn = (text, size, weight, family) =>
  measureText(text, size, weight >= 600, family);

/** 站名三行（中文 / 稻妻中译 / 英文）要用的字段 */
function stationLabel(station: Station) {
  return { id: station.id, name: station.name, nameZh: station.nameZh, nameEn: station.nameEn };
}

/** 本站换乘的其他轨道交通线路徽章 */
function badgesFor(line: Line, stationId: string) {
  return (stationLines.get(stationId) ?? [])
    .filter((other) => other.id !== line.id)
    .map((other) => ({ label: shortName(other.name), fill: other.color }));
}

function buildInput(line: Line): StripInput {
  const { primary, branches } = splitVariants(line.variants);
  const stations = primary.variant.stations
    .map((sid) => stationMap.get(sid))
    .filter((station) => station !== undefined)
    .map((station) => ({ ...stationLabel(station), badges: badgesFor(line, station.id) }));

  return {
    key: line.id,
    color: line.color,
    cjkFont: line.fontFamily || 'sans-serif',
    name: line.name,
    nameZh: line.nameZh,
    nameEn: line.nameEn,
    operator: line.operator,
    authority: line.authority,
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

const strips = computed(() => railLines.map((line) => buildStrip(buildInput(line), measure)));

/** `.strip` 的纵向骨架：页头 / 徽章两行（含上下间隔）/ 引线通道 / 主线 / 每条支线一段车道 / 站名（吃掉剩余高度） */
const BASE_ROWS = ['52px', '4px', '20px', '6px', '20px', '12px', '18px'];
/** 一段支线车道的高度（px）：支线的 45° 引线与车道横线落点都由它推出来（见 .lane-diag / .lane-track） */
const LANE_ROW = 24;
const PANEL_H = 280;

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
  <div class="bg-white h-screen overflow-y-auto p-4">
    <div class="w-max mx-auto flex flex-col gap-6">
      <div v-for="s in strips" :key="s.key" class="strip" :style="stripStyle(s)">
        <!-- 页头：线路名称色块 → 运营公司 → 运营主体（只写名称本身） -->
        <header class="head">
          <div class="chip">
            <span class="chip-name">{{ s.name }}</span>
            <span v-if="s.nameZh" class="chip-zh">{{ s.nameZh }}</span>
            <span class="chip-en">{{ s.nameEn }}</span>
          </div>
          <div v-if="s.operator?.name" class="block">
            <span class="block-name">{{ s.operator.name }}</span>
            <span v-if="s.operator.nameEn" class="block-en">{{ s.operator.nameEn }}</span>
          </div>
          <div v-if="s.authority?.name" class="block">
            <span class="block-name auth-name">{{ s.authority.name }}</span>
            <span v-if="s.authority.nameEn" class="block-en">{{ s.authority.nameEn }}</span>
            <span v-if="s.authority.nameAlt" class="block-en">{{ s.authority.nameAlt }}</span>
          </div>
        </header>

        <!-- 换乘徽章：每站一簇，水平居中在本站列上；行由模型决定 -->
        <div
          v-for="st in s.stations"
          v-show="st.badges.length"
          :key="'badges-' + st.id"
          class="badges"
          :class="st.badges[0]?.row === 1 ? 'badges-far' : 'badges-near'"
          :style="{ ...cell(st.col), '--badge-shift': st.badgeShift + 'px' }">
          <span
            v-for="(b, k) in st.badges"
            :key="k"
            class="badge"
            :style="{ background: b.fill, color: b.textFill, '--badge-color': b.fill }">
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
            :style="{ gridRow: 7 + ln.lane, gridColumn: ln.tag.col + 2 }">
            <span>{{ ln.tag.text }}</span>
            <span class="lane-tag-en">{{ ln.tag.textEn }}</span>
          </div>
        </template>

        <!-- 站点：白底圆圈 + 居中的序号 -->
        <div
          v-for="st in s.stations"
          :key="'node-' + st.id"
          class="node"
          :style="{ ...cell(st.col), gridRow: 7 + st.lane }">
          {{ st.index }}
        </div>

        <!-- 站名：整块 45° 斜排（绕左上角旋转），越靠右的车站按模型的左移量回缩 -->
        <div
          v-for="st in s.stations"
          :key="'label-' + st.id"
          class="st-label"
          :class="{ 'st-label-branch': st.lane > 0 }"
          :style="{ ...cell(st.col), '--label-shift': st.labelShift + 'px' }">
          <div v-for="(l, k) in st.label" :key="k" :class="'st-' + l.kind">{{ l.text }}</div>
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
</style>
