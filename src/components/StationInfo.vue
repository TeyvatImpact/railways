<template>
  <div v-if="station" class="flex flex-col gap-3 text-sm">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="text-base font-bold leading-tight">
          {{ station.names[station.primaryLang] }}
        </div>
        <div class="text-xs font-en opacity-70">{{ station.names.en }}</div>
      </div>
      <var-button size="small" @click="$emit('close')">关闭</var-button>
    </div>

    <section>
      <h3 class="info-title">名称</h3>
      <div class="info-grid">
        <template v-for="row in nameRows(station.names)" :key="row.label">
          <div class="opacity-60">{{ row.label }}</div>
          <div>
            {{ row.value
            }}<span v-if="row.pronunciation" class="opacity-60">（{{ row.pronunciation }}）</span>
          </div>
        </template>
      </div>
    </section>

    <section>
      <h3 class="info-title">位置</h3>
      <div class="info-grid">
        <div class="opacity-60">国家/地区</div>
        <div>{{ bilingualLabel(station.nation.names) }}</div>
        <template v-if="station.area">
          <div class="opacity-60">区域</div>
          <div>{{ bilingualLabel(station.area.names) }}</div>
        </template>
      </div>
    </section>

    <section>
      <h3 class="info-title">管理机构</h3>
      <div class="info-grid">
        <div class="opacity-60">运营公司</div>
        <div>{{ operators }}</div>
        <div class="opacity-60">运营主体</div>
        <div>{{ authorities }}</div>
      </div>
    </section>

    <section>
      <h3 class="info-title">可乘坐线路（{{ servingLines.length }}）</h3>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="line in servingLines"
          :key="line.id"
          type="button"
          class="line-chip"
          @click="selectLine(line.id)">
          <span class="line-chip-dot" :style="{ background: line.color }" />
          <span>{{ line.names[line.primaryLang] }}</span>
          <span v-if="line.lineType" class="opacity-60">{{
            line.lineType === 'ferry' ? '轮渡' : '同站换乘'
          }}</span>
        </button>
      </div>
    </section>
    <section v-if="headways.length">
      <h3 class="info-title">间隔时间</h3>
      <div v-for="headway in headways" :key="headway.lineId" class="tt-group">
        <div class="tt-group-title">
          <span class="line-chip-dot" :style="{ background: headway.color }" />
          <span class="truncate">{{ headway.lineName }}</span>
        </div>
        <div v-for="(segment, index) in headway.segments" :key="index" class="tt-row">
          <span class="tt-span">{{ segment.from }} – {{ segment.to }}</span>
          <span class="tt-value" :class="{ 'is-off': !Number.isFinite(segment.interval) }">
            {{ headwayText(segment.interval) }}
          </span>
        </div>
      </div>
    </section>

    <section v-if="departures.length">
      <h3 class="info-title">时刻表发车</h3>
      <div v-for="line in departures" :key="line.lineId" class="tt-group">
        <div class="tt-group-title">
          <span class="line-chip-dot" :style="{ background: line.color }" />
          <span class="truncate">{{ line.lineName }}</span>
          <span class="opacity-60">{{ line.stops.length }} 班</span>
        </div>
        <div v-for="(stop, index) in visibleStops(line)" :key="index" class="tt-row">
          <span class="tt-span">
            <template v-if="stop.arrival">到站 {{ stop.arrival }}</template>
            <template v-if="stop.arrival && stop.departure"> / </template>
            <template v-if="stop.departure">开出 {{ stop.departure }}</template>
          </span>
          <span class="tt-value">
            {{ stopLabel(stop) }}<span v-if="stop.turnback" class="opacity-60">（折返）</span>
          </span>
        </div>
        <button
          v-if="line.stops.length > TIMETABLE_COLLAPSED_ROWS"
          type="button"
          class="tt-toggle"
          @click="toggleExpanded(line.lineId)">
          {{
            expanded[line.lineId]
              ? '收起'
              : `展开剩余 ${line.stops.length - TIMETABLE_COLLAPSED_ROWS} 班（共 ${line.stops.length} 班）`
          }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { TIMETABLE_COLLAPSED_ROWS } from '../config/render.config';
import {
  stationMap,
  stationLineMap,
  sortLinesForDisplay,
  type Line,
} from '../composables/useMapData';
import { bilingualLabel, nameRows } from '../composables/stationNames';
import { selectLine } from '../composables/useSelection';
import {
  stationDepartures,
  stationHeadways,
  type StationDepartures,
  type StationStop,
} from '../composables/stationTimetable';

const props = defineProps<{ stationId: string }>();

defineEmits<{ (e: 'close'): void }>();

const station = computed(() => stationMap.get(props.stationId) ?? null);
const servingLines = computed<Line[]>(() =>
  sortLinesForDisplay(stationLineMap.get(props.stationId) ?? []),
);

/** 一个站可能由多条线路服务，机构去重后按「中文 · 英文」列出 */
function orgList(kind: 'operator' | 'authority'): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of servingLines.value) {
    const org = line[kind];
    if (!org) continue;
    const label = bilingualLabel(org.names);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out.join('；') || '—';
}

const operators = computed(() => orgList('operator'));
const authorities = computed(() => orgList('authority'));

const headways = computed(() => stationHeadways(props.stationId));
const departures = computed(() => stationDepartures(props.stationId));

/** 「时刻表发车」展开状态（按线路 id），未记录 / false = 折叠到 `TIMETABLE_COLLAPSED_ROWS` 行 */
const expanded = reactive<Record<string, boolean>>({});

function toggleExpanded(lineId: string): void {
  expanded[lineId] = !expanded[lineId];
}

/** 折叠时只给前 `TIMETABLE_COLLAPSED_ROWS` 行 */
function visibleStops(line: StationDepartures): StationStop[] {
  return expanded[line.lineId] ? line.stops : line.stops.slice(0, TIMETABLE_COLLAPSED_ROWS);
}

/** 换站即回到折叠态，避免上一条线路的展开状态带到别的站 */
watch(
  () => props.stationId,
  () => {
    for (const key of Object.keys(expanded)) delete expanded[key];
  },
);

/** 间隔展示：`Infinity` = 不开行 */
function headwayText(interval: number): string {
  return Number.isFinite(interval) ? `每 ${interval} 分钟` : '不开行';
}

/** 一趟车在本站的走向：只有开出 → 「开往 X」；只有到站 → 「来自 X」；成对 → 「X → Y」 */
function stopLabel(stop: StationStop): string {
  if (stop.from && stop.to) return `${stop.from} → ${stop.to}`;
  if (stop.to) return `开往 ${stop.to}`;
  if (stop.from) return `来自 ${stop.from}`;
  return '—';
}
</script>

<style scoped>
.info-title {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.75;
  margin-bottom: 2px;
}
.info-grid {
  display: grid;
  grid-template-columns: 68px 1fr;
  column-gap: 8px;
  row-gap: 2px;
  font-size: 12px;
}
.line-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  font-size: 12px;
  border: 1px solid var(--color-outline);
  border-radius: 4px;
  background: var(--color-surface-container-high);
  color: var(--color-text);
  cursor: pointer;
}
.line-chip:hover {
  background: var(--color-surface-container-highest);
}
.line-chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tt-group + .tt-group {
  margin-top: 8px;
}
.tt-group-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 2px;
}
.tt-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  line-height: 16px;
}
.tt-span {
  width: 132px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.tt-value {
  min-width: 0;
  opacity: 0.75;
}
.tt-value.is-off {
  opacity: 0.5;
  font-style: italic;
}
.tt-toggle {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-primary);
  cursor: pointer;
  text-align: left;
}
.tt-toggle:hover {
  text-decoration: underline;
}
</style>
