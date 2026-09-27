<template>
  <div v-if="run" class="flex flex-col gap-3 text-sm">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="line-chip-dot" :style="{ background: run.line.color }" />
          <span class="text-base font-bold leading-tight">
            {{ run.line.names[run.line.primaryLang] }}
          </span>
        </div>
        <div class="text-xs font-en opacity-70">{{ run.line.names.en }}</div>
      </div>
      <var-button size="small" @click="$emit('close')">关闭</var-button>
    </div>

    <div class="flex flex-wrap gap-1 text-[11px]">
      <span class="tag">{{ run.dep.direction === 'up' ? '上行' : '下行' }}</span>
      <span v-if="run.dep.turnback" class="tag">折返</span>
      <span v-if="run.variant.name" class="tag">{{ run.variant.name }}</span>
    </div>

    <section>
      <h3 class="info-title">列车</h3>
      <div class="info-grid">
        <div class="opacity-60">发车</div>
        <div>{{ formatClock(run.start) }} 由 {{ stationName(run.stops[0].stationId) }} 开出</div>
        <div class="opacity-60">方向</div>
        <div>{{ directionText }}</div>
        <div class="opacity-60">车型</div>
        <div>{{ vehicle?.name ?? run.dep.vehicle }}</div>
        <div class="opacity-60">状态</div>
        <div>
          {{ status.label }}<span class="opacity-60">（{{ status.detail }}）</span>
        </div>
      </div>
    </section>

    <section>
      <h3 class="info-title">本趟停站（{{ run.stops.length }} 站）</h3>
      <div class="tt-group">
        <div
          v-for="(stop, i) in run.stops"
          :key="i"
          class="tt-row"
          :class="{ 'is-current': i === currentIndex }">
          <span class="tt-span">{{ stopTimeText(i) }}</span>
          <span class="tt-value">
            <button type="button" class="tt-link" @click="selectStation(stop.stationId)">
              {{ stationName(stop.stationId) }}
            </button>
            <span v-if="stop.turnback" class="opacity-60">（折返）</span>
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getVehicle } from '../config/vehicles';
import { formatClock } from '../composables/formatTime';
import { stationMap } from '../composables/useMapData';
import { minutesOfDay } from '../composables/useSimClock';
import { selectLine, selectStation } from '../composables/useSelection';
import {
  stopArrival,
  stopLeave,
  trainById,
  trainPhaseAt,
  type TrainPhase,
} from '../composables/trainRuns';

const props = defineProps<{ trainId: string }>();

defineEmits<{ (e: 'close'): void }>();

const run = computed(() => trainById(props.trainId) ?? null);
const phase = computed<TrainPhase | null>(() =>
  run.value ? trainPhaseAt(run.value, minutesOfDay.value) : null,
);
const vehicle = computed(() => (run.value ? getVehicle(run.value.dep.vehicle) : null));

/** 终点站的下标：折返车是折返点，其余是末站 */
const terminusIndex = computed(() => {
  const stops = run.value?.stops ?? [];
  const turnback = stops.findIndex((stop) => stop.turnback);
  return turnback >= 0 ? turnback : stops.length - 1;
});

const directionText = computed(() => {
  const current = run.value;
  if (!current) return '';
  const origin = stationName(current.stops[0].stationId);
  const terminus = stationName(current.stops[terminusIndex.value].stationId);
  if (current.stops[0].stationId === current.stops[terminusIndex.value].stationId)
    return `环线（${origin} 起，绕行一圈）`;
  const base = `${current.dep.direction === 'up' ? '上行' : '下行'}（${origin} → ${terminus}）`;
  return current.dep.turnback ? `${base}，原路折返` : base;
});

/** 当前正在停靠 / 即将到达的停站行下标 */
const currentIndex = computed(() => {
  const current = run.value;
  const state = phase.value;
  if (!current || !state) return -1;
  if (state.kind === 'dwell') return state.index;
  if (state.kind === 'run') return Math.min(state.index + 1, current.stops.length - 1);
  if (state.kind === 'before') return 0;
  return current.stops.length - 1;
});

const status = computed(() => {
  const current = run.value;
  const state = phase.value;
  if (!current || !state) return { label: '', detail: '' };
  const last = current.stops.length - 1;
  if (state.kind === 'before') {
    return {
      label: '未开出',
      detail: `将于 ${formatClock(current.start)} 由 ${stationName(current.stops[0].stationId)} 开出`,
    };
  }
  if (state.kind === 'after') {
    return {
      label: '已收车',
      detail: `已于 ${formatClock(current.end)} 在 ${stationName(current.stops[last].stationId)} 收车`,
    };
  }
  if (state.kind === 'dwell') {
    const name = stationName(current.stops[state.index].stationId);
    const arrival = formatClock(stopArrival(current, state.index));
    if (state.index === last) return { label: '停站中', detail: `停靠 ${name}，${arrival} 到站` };
    return {
      label: '停站中',
      detail: `停靠 ${name}（${arrival} 到 / ${formatClock(stopLeave(current, state.index))} 开）`,
    };
  }
  const next = current.stops[state.index + 1];
  return {
    label: '运行中',
    detail: `开往 ${stationName(next.stationId)}（预计 ${formatClock(
      stopArrival(current, state.index + 1),
    )} 到达）`,
  };
});

/** 站点在该线路主语言下的名字 */
function stationName(stationId: string): string {
  const line = run.value?.line;
  return (line && stationMap.get(stationId)?.names[line.primaryLang]) ?? stationId;
}

/** 一个停站行的到发文案：首站只写出、末站只写到，折返点写出「折返」 */
function stopTimeText(i: number): string {
  const current = run.value;
  if (!current) return '';
  const stop = current.stops[i];
  if (i === 0) return `开出 ${formatClock(stop.departure ?? current.start)}`;
  if (stop.arrival === undefined) return '—';
  const arrival = `到站 ${formatClock(stop.arrival)}`;
  if (stop.turnback) return `${arrival} / 折返`;
  if (i === current.stops.length - 1) return arrival;
  return `${arrival} / 开出 ${formatClock(stop.departure ?? stopLeave(current, i))}`;
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
.line-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tag {
  padding: 1px 6px;
  border: 1px solid var(--color-outline);
  border-radius: 3px;
}
.tt-group + .tt-group {
  margin-top: 8px;
}
.tt-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  line-height: 16px;
}
.tt-row.is-current {
  font-weight: 600;
  color: var(--color-primary);
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
.tt-link {
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.tt-link:hover {
  text-decoration: underline;
}
</style>
