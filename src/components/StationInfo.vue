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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { stationMap, stationLineMap, type Line } from '../composables/useMapData';
import { bilingualLabel, nameRows } from '../composables/stationNames';
import { selectLine } from '../composables/useSelection';

const props = defineProps<{ stationId: string }>();

defineEmits<{ (e: 'close'): void }>();

const station = computed(() => stationMap.get(props.stationId) ?? null);
const servingLines = computed<Line[]>(() => stationLineMap.get(props.stationId) ?? []);

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
</style>
