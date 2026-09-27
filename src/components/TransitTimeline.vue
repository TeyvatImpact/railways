<script lang="ts">
/** 时间线上的一个站点行 */
export interface TimelineStop {
  kind: 'stop';
  /** 有 id 且 `clickableStations` 打开时可点击（emit `station-click`） */
  id?: string;
  name: string;
  nameEn?: string;
  /** 本站上方（进入）的轨道颜色；null / 省略 = 上方不画线（首站） */
  inColor?: string | null;
  /** 本站下方（离开）的轨道颜色；也用作圆点描边色（缺省退回 inColor） */
  outColor?: string | null;
}

/** 时间线上的一个区间行（画在两站之间） */
export interface TimelineLeg {
  kind: 'leg';
  color: string;
  /** 线路名（可含变体后缀） */
  title?: string;
  /** 跟在标题后的小字（如「轮渡」） */
  note?: string;
  /** 方向 / 补充说明，与 `metrics` 同行显示 */
  detail?: string;
  /** 费用行，如「(2000 摩拉 20 分 30 秒 20 千米)」 */
  metrics?: string;
  /** 途经站 */
  stops?: { name: string; nameEn?: string }[];
}

export type TimelineItem = TimelineStop | TimelineLeg;
</script>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 按顺序排列的站点行与区间行（一般是一站一区间交替） */
    items: TimelineItem[];
    /** 区间费用挂在哪：`leg` = 区间行里（导航路线那种），`stop` = 上一站的站点行内 */
    metricsPlacement?: 'leg' | 'stop';
    /** 显示英文站名 */
    stationEnglish?: boolean;
    /** 站点可点击（需要 `id`），点击后 emit `station-click` */
    clickableStations?: boolean;
  }>(),
  { metricsPlacement: 'leg', stationEnglish: true, clickableStations: false },
);

const emit = defineEmits<{ (e: 'station-click', id: string): void }>();

type Row =
  | { key: string; type: 'stop'; stop: TimelineStop; metrics?: string }
  | { key: string; type: 'leg'; leg: TimelineLeg };

/** 站点行 + 区间行摊平：`metricsPlacement: 'stop'` 时把紧随其后那条「只有费用」的区间收进站点行 */
const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  props.items.forEach((item, i) => {
    if (item.kind === 'stop') {
      const next = props.items[i + 1];
      const inline =
        props.metricsPlacement === 'stop' && next?.kind === 'leg' && isBareLeg(next)
          ? next.metrics
          : undefined;
      out.push({ key: `s${i}`, type: 'stop', stop: item, metrics: inline });
      return;
    }
    if (props.metricsPlacement === 'stop' && isBareLeg(item)) return;
    out.push({ key: `l${i}`, type: 'leg', leg: item });
  });
  return out;
});

/** 只有费用、没有线路名 / 方向 / 途经站的区间行 */
function isBareLeg(leg: TimelineLeg): boolean {
  return !leg.title && !leg.detail && !leg.stops?.length;
}

/** `metricsPlacement: 'stop'` 时费用挂在站点行里，区间行不再重复 */
const showLegMetrics = computed(() => props.metricsPlacement === 'leg');

function stopClickable(stop: TimelineStop): boolean {
  return props.clickableStations && !!stop.id;
}

function onStopClick(stop: TimelineStop) {
  if (stopClickable(stop) && stop.id) emit('station-click', stop.id);
}

function dotColor(stop: TimelineStop): string {
  return stop.outColor ?? stop.inColor ?? '#999';
}
</script>

<template>
  <div>
    <div v-for="row in rows" :key="row.key" class="flex">
      <div class="w-12 shrink-0 flex flex-col items-center">
        <template v-if="row.type === 'stop'">
          <div
            v-if="row.stop.inColor"
            class="flex-1 w-1 min-h-2"
            :style="{ background: row.stop.inColor }" />
          <div v-else class="flex-1" />
          <div
            class="w-4 h-4 rounded-full shrink-0 z-10 bg-white"
            :style="{ border: `4px solid ${dotColor(row.stop)}` }" />
          <div
            v-if="row.stop.outColor"
            class="flex-1 w-1 min-h-2"
            :style="{ background: row.stop.outColor }" />
          <div v-else class="flex-1" />
        </template>
        <template v-else>
          <div class="flex-1 w-1" :style="{ background: row.leg.color }" />
        </template>
      </div>

      <div class="flex-1 pr-1 min-w-0 py-1">
        <template v-if="row.type === 'stop'">
          <component
            :is="stopClickable(row.stop) ? 'button' : 'div'"
            :type="stopClickable(row.stop) ? 'button' : undefined"
            class="block w-full text-left"
            @click="onStopClick(row.stop)">
            <div class="text-base font-bold leading-tight">{{ row.stop.name }}</div>
            <div v-if="stationEnglish && row.stop.nameEn" class="text-xs mt-0.5 font-en">
              {{ row.stop.nameEn }}
            </div>
          </component>
          <div v-if="row.metrics" class="text-xs mt-0.5">{{ row.metrics }}</div>
        </template>

        <template v-else>
          <div class="text-sm mb-2">
            <template v-if="row.leg.title">
              <span class="font-semibold">
                {{ row.leg.title
                }}<span v-if="row.leg.note" class="text-xs font-normal">({{ row.leg.note }})</span>
              </span>
              <br v-if="row.leg.detail || (showLegMetrics && row.leg.metrics)" />
            </template>
            <span v-if="row.leg.detail" class="text-xs truncate">{{ row.leg.detail }}</span>
            <span
              v-if="showLegMetrics && row.leg.metrics"
              class="text-xs"
              :class="{ 'ml-2': row.leg.detail }"
              >{{ row.leg.metrics }}</span
            >
          </div>
          <div v-if="row.leg.stops?.length" class="space-y-1">
            <div v-for="(st, i) in row.leg.stops" :key="i" class="leading-tight">
              <div class="text-xs">{{ st.name }}</div>
              <div v-if="stationEnglish && st.nameEn" class="text-xs font-en">{{ st.nameEn }}</div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
