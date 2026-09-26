<script setup lang="ts">
import { computed } from 'vue';
import { lines, stationMap, type Line } from '../../composables/useMapData';
import { measureText } from '../../composables/useLabelPlacement';
import { pickDisplayVariant } from './variantStrip';
import { buildStrip, EDGE, type MeasureFn, type StripInput } from './stripModel';

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

function buildInput(line: Line): StripInput {
  const { variant } = pickDisplayVariant(line.variants);
  const stations = variant.stations
    .map((sid) => stationMap.get(sid))
    .filter((station) => station !== undefined)
    .map((station) => ({
      id: station.id,
      name: station.name,
      nameZh: station.nameZh,
      nameEn: station.nameEn,
      badges: (stationLines.get(station.id) ?? [])
        .filter((other) => other.id !== line.id)
        .map((other) => ({ label: shortName(other.name), fill: other.color })),
    }));

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
  };
}

const strips = computed(() => railLines.map((line) => buildStrip(buildInput(line), measure)));

function stripStyle(s: (typeof strips.value)[number]) {
  const n = s.stations.length;
  return {
    '--line-color': s.color,
    '--chip-text': s.chipTextFill,
    '--cjk-font': s.cjkFont,
    // 首末站各留 EDGE，中间等分（与 stripModel 的站距算法一致）
    gridTemplateColumns: `${EDGE}px repeat(${Math.max(1, n - 1)}, 1fr) ${EDGE}px`,
  };
}

/** 第 index 站（1 起算）落在 grid 的第 index+1 列（第 1 列是左边距） */
function cell(index: number) {
  return { gridColumn: index + 1 };
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
          :style="{ ...cell(st.index), '--badge-shift': st.badgeShift + 'px' }">
          <span
            v-for="(b, k) in st.badges"
            :key="k"
            class="badge"
            :style="{ background: b.fill, color: b.textFill, '--badge-color': b.fill }">
            {{ b.label }}
          </span>
        </div>

        <!-- 主线 -->
        <div class="track"></div>

        <!-- 站点：白底圆圈 + 居中的序号 -->
        <div v-for="st in s.stations" :key="'node-' + st.id" class="node" :style="cell(st.index)">
          {{ st.index }}
        </div>

        <!-- 站名：整块 45° 斜排（绕左上角旋转），越靠右的车站按模型的左移量回缩 -->
        <div
          v-for="st in s.stations"
          :key="'label-' + st.id"
          class="st-label"
          :style="{ ...cell(st.index), '--label-shift': st.labelShift + 'px' }">
          <div v-for="(l, k) in st.label" :key="k" :class="'st-' + l.kind">{{ l.text }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 每条线路 = 一张 1920×280 的面板。格子（grid）把「页头 / 两行徽章 / 引线通道 / 主线 / 站名」
   分成 8 行，线路的每个车站占一列，所有对齐、间距、居中、旋转都交给 CSS。 */
.strip {
  display: grid;
  grid-template-rows: 52px 4px 20px 6px 20px 12px 18px minmax(0, 1fr);
  width: 1920px;
  height: 280px;
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
  /* 只跨首末站之间：两端各留出 EDGE 列（= 首末站距面板左右边缘的固定值） */
  grid-column: 2 / -2;
  align-self: center;
  height: 5px;
  border-radius: 3px;
  background: var(--line-color);
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
  grid-row: 8;
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
