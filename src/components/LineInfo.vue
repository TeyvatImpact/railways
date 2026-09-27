<template>
  <div v-if="line" class="flex flex-col gap-3 text-sm">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="line-chip-dot" :style="{ background: line.color }" />
          <span class="text-base font-bold leading-tight">{{ line.names[line.primaryLang] }}</span>
        </div>
        <div class="text-xs font-en opacity-70">{{ line.names.en }}</div>
      </div>
      <var-button size="small" @click="$emit('close')">关闭</var-button>
    </div>

    <div class="flex flex-wrap gap-1 text-[11px]">
      <span class="tag">{{ line.oneWay ? '单向' : '双向' }}</span>
      <span v-if="line.lineType" class="tag">{{
        line.lineType === 'ferry' ? '轮渡' : '同站换乘'
      }}</span>
      <span v-if="line.virtual" class="tag">虚拟线路</span>
      <span v-if="line.variants.length > 1" class="tag">{{ line.variants.length }} 个交路</span>
    </div>

    <section>
      <h3 class="info-title">名称</h3>
      <div class="info-grid">
        <template v-for="row in nameRows(line.names)" :key="row.label">
          <div class="opacity-60">{{ row.label }}</div>
          <div>
            {{ row.value
            }}<span v-if="row.pronunciation" class="opacity-60">（{{ row.pronunciation }}）</span>
          </div>
        </template>
      </div>
    </section>

    <section>
      <h3 class="info-title">管理机构</h3>
      <div class="info-grid">
        <div class="opacity-60">运营公司</div>
        <div>{{ orgLabel(line.operator) }}</div>
        <div class="opacity-60">运营主体</div>
        <div>{{ orgLabel(line.authority) }}</div>
      </div>
    </section>

    <section>
      <h3 class="info-title">显示</h3>
      <div class="flex flex-wrap items-center gap-1">
        <button
          type="button"
          class="pill"
          :class="{ on: direction === 'up' }"
          @click="direction = 'up'">
          上行
        </button>
        <button
          type="button"
          class="pill"
          :class="{ on: direction === 'down' }"
          :disabled="line.oneWay === true"
          :title="line.oneWay ? '单向线路不能反向乘坐' : ''"
          @click="direction = 'down'">
          下行
        </button>
        <select
          v-if="line.variants.length > 1"
          class="variant-select"
          :value="variantIndex"
          @change="onVariantChange">
          <option v-for="(v, i) in line.variants" :key="i" :value="i">{{ variantLabel(i) }}</option>
        </select>
      </div>
    </section>

    <section>
      <h3 class="info-title">起终点</h3>
      <div class="flex flex-col gap-1">
        <div v-for="t in termini" :key="t.stationId" class="flex flex-col">
          <button
            type="button"
            class="flex items-baseline gap-1.5 text-left"
            @click="selectStation(t.stationId)">
            <span class="text-[11px] opacity-60">{{ t.label }}</span>
            <span class="font-semibold">{{ t.name }}</span>
            <span class="text-[11px] font-en opacity-60">{{ t.nameEn }}</span>
          </button>
          <div class="text-[11px] opacity-60 pl-8">管理机构：{{ t.orgs }}</div>
        </div>
      </div>
    </section>

    <section>
      <h3 class="info-title">线路全览（{{ stationIds.length }} 站）</h3>
      <TransitTimeline
        :items="timelineItems"
        metrics-placement="leg"
        clickable-stations
        @station-click="selectStation" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { lines, pairCost, stationLineMap, stationMap } from '../composables/useMapData';
import { formatDuration } from '../composables/formatTime';
import { displayLabel, nameRows } from '../composables/stationNames';
import { selectStation } from '../composables/useSelection';
import type { OrgInfo } from '../composables/useMapData';
import TransitTimeline, { type TimelineItem } from './TransitTimeline.vue';

const props = defineProps<{ lineId: string }>();

defineEmits<{ (e: 'close'): void }>();

const line = computed(() => lines.find((l) => l.id === props.lineId) ?? null);

const variantIndex = ref(0);
const direction = ref<'up' | 'down'>('up');

// 换线路时回到第一个交路、上行
watch(
  () => props.lineId,
  () => {
    variantIndex.value = 0;
    direction.value = 'up';
  },
);

const stationIds = computed(() => {
  const ids = line.value?.variants[variantIndex.value]?.stations ?? [];
  return direction.value === 'up' ? ids : [...ids].reverse();
});

const stationNodes = computed(() =>
  stationIds.value.map((id) => {
    const st = stationMap.get(id);
    return {
      id,
      name: st ? st.names[st.primaryLang] : id,
      nameEn: st?.names.en ?? '',
    };
  }),
);

/** 线路全览的顺序：一站一区间，费用挂在站点行里（`metricsPlacement: 'stop'`） */
const timelineItems = computed<TimelineItem[]>(() => {
  const l = line.value;
  if (!l) return [];
  const ids = stationIds.value;
  const out: TimelineItem[] = [];
  stationNodes.value.forEach((st, i) => {
    out.push({
      kind: 'stop',
      id: st.id,
      name: st.name,
      nameEn: st.nameEn,
      inColor: i === 0 ? null : l.color,
      outColor: i === ids.length - 1 ? null : l.color,
    });
    if (i < ids.length - 1) out.push({ kind: 'leg', color: l.color, metrics: costLabel(i) });
  });
  return out;
});

const termini = computed(() => {
  const ids = stationIds.value;
  if (ids.length === 0) return [];
  const entries: { label: string; stationId: string }[] = [
    { label: '起点', stationId: ids[0] },
    { label: '终点', stationId: ids[ids.length - 1] },
  ];
  return entries.map((e) => {
    const st = stationMap.get(e.stationId);
    return {
      ...e,
      name: st ? st.names[st.primaryLang] : e.stationId,
      nameEn: st?.names.en ?? '',
      orgs: stationOrgs(e.stationId),
    };
  });
});

/** 某个站由哪些机构管理（服务它的线路的运营公司 / 运营主体，去重） */
function stationOrgs(stationId: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of stationLineMap.get(stationId) ?? []) {
    for (const org of [l.operator, l.authority] as (OrgInfo | undefined)[]) {
      if (!org) continue;
      const label = displayLabel(org.names, org.langs);
      if (seen.has(label)) continue;
      seen.add(label);
      out.push(label);
    }
  }
  return out.join('；') || '—';
}

function orgLabel(org: OrgInfo | undefined): string {
  return org ? displayLabel(org.names, org.langs) : '—';
}

function variantLabel(index: number): string {
  const v = line.value?.variants[index];
  if (!v || !v.name) return '全线';
  return v.nameEn ? `${v.name} · ${v.nameEn}` : v.name;
}

function onVariantChange(e: Event) {
  variantIndex.value = Number((e.target as HTMLSelectElement).value);
}

/** 第 i 段（第 i 站 → 第 i+1 站）的费用；折线中间点不影响，按站对计算 */
function costLabel(i: number): string {
  const a = stationIds.value[i];
  const b = stationIds.value[i + 1];
  const variant = line.value?.variants[variantIndex.value];
  if (!variant || !a || !b) return '';
  const cost = pairCost(variant.vehicle, a, b);
  return `${cost.fare} 摩拉 · ${formatDuration(cost.time)} · ${cost.distance} 千米`;
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
.pill {
  padding: 1px 10px;
  font-size: 12px;
  border: 1px solid var(--color-outline);
  border-radius: 3px;
  background: var(--color-surface-container-high);
  color: var(--color-text);
  cursor: pointer;
}
.pill.on {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-on-primary, #fff);
}
.pill:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.variant-select {
  font-size: 12px;
  padding: 2px 4px;
  border: 1px solid var(--color-outline);
  border-radius: 3px;
  background: var(--color-surface-container-high);
  color: var(--color-text);
}
</style>
