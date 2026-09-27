<template>
  <div class="flex">
    <div
      class="bg-(--color-body) flex flex-col overflow-hidden gap-2 border-l border-l-(--color-outline) transition-all duration-200"
      :class="collapsed ? 'w-0' : 'w-80 p-4'">
      <h2 class="mb-4">路径规划</h2>
      <template v-if="!selectedRoute">
        <div class="relative">
          <var-input
            v-model="startInput"
            placeholder="起点站（输入站名 / 编号搜索）"
            variant="outlined"
            clearable
            @focus="onStartFocus"
            @blur="onStartBlur"
            @update:model-value="onStartInput" />
          <div v-if="startFocused && startSuggestions.length > 0" class="suggest-panel">
            <button
              v-for="s in startSuggestions"
              :key="s.value.id"
              type="button"
              class="suggest-item"
              @mousedown.prevent="selectStart(s.value)">
              <span class="suggest-name">{{ s.label }}</span>
              <span class="suggest-lines">{{ s.value.lines.map((l) => l.name).join(' · ') }}</span>
            </button>
          </div>
        </div>
        <var-button class="mb-4" @click="togglePick('start')">
          {{ selectTarget === 'start' ? '请点击站点选择' : '选择起点站' }}
        </var-button>
        <div class="relative">
          <var-input
            v-model="endInput"
            placeholder="终点站（输入站名 / 编号搜索）"
            variant="outlined"
            clearable
            @focus="onEndFocus"
            @blur="onEndBlur"
            @update:model-value="onEndInput" />
          <div v-if="endFocused && endSuggestions.length > 0" class="suggest-panel">
            <button
              v-for="s in endSuggestions"
              :key="s.value.id"
              type="button"
              class="suggest-item"
              @mousedown.prevent="selectEnd(s.value)">
              <span class="suggest-name">{{ s.label }}</span>
              <span class="suggest-lines">{{ s.value.lines.map((l) => l.name).join(' · ') }}</span>
            </button>
          </div>
        </div>
        <var-button class="mb-4" @click="togglePick('end')">
          {{ selectTarget === 'end' ? '请点击站点选择' : '选择终点站' }}
        </var-button>
        <var-button :disabled="!startSelected || !endSelected" @click="calculate">
          计算路线
        </var-button>

        <var-divider></var-divider>

        <div v-if="routeError" class="result error px-4 py-4">{{ routeError }}</div>

        <div v-else-if="routeOptions.length > 0" class="flex flex-col gap-2">
          <var-card
            v-for="opt in routeOptions"
            :key="opt.metric"
            @click="selectRoute(opt)"
            class="cursor-pointer">
            <div>
              <span>{{ opt.label }}</span>
            </div>
            <div>
              <span>换乘 {{ opt.result.segments.length }} 次</span>
              <span>·</span>
              <span>{{ opt.result.totalFare }} 摩拉</span>
              <span>·</span>
              <span>{{ opt.result.totalTime }} 分钟</span>
              <span>·</span>
              <span>{{ opt.result.totalDistance }} 千米</span>
            </div>
          </var-card>
        </div>
      </template>
      <RouteTimeline
        v-if="selectedRoute"
        class="h-full overflow-y-hidden"
        :result="selectedRoute.result"
        @close="clearResults" />
    </div>
    <button
      class="panel-toggle shrink-0"
      :class="{ collapsed }"
      @click="collapsed = !collapsed"
      :title="collapsed ? '展开面板' : '折叠面板'">
      <span>{{ collapsed ? '◀' : '▶' }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  useRouting,
  METRIC_LABELS,
  type RouteMetric,
  type StationSuggestion,
  type RouteResult,
} from '../composables/useRouting';
import RouteTimeline from './RouteTimeline.vue';

interface RouteOption {
  metric: RouteMetric;
  label: string;
  result: RouteResult;
}

const emit = defineEmits<{
  (e: 'result-change', v: RouteResult | null): void;
}>();

const { selectTarget, searchStations, findRoutes } = useRouting();

const startInput = ref('');
const endInput = ref('');
const startFocused = ref(false);
const endFocused = ref(false);
const startSuggestions = ref<{ label: string; value: StationSuggestion }[]>([]);
const endSuggestions = ref<{ label: string; value: StationSuggestion }[]>([]);
const startSelected = ref<StationSuggestion | null>(null);
const endSelected = ref<StationSuggestion | null>(null);
const routeOptions = ref<RouteOption[]>([]);
const selectedRoute = ref<RouteOption | null>(null);
const routeError = ref('');
const collapsed = ref(false);

function togglePick(target: 'start' | 'end') {
  if (selectTarget.value === target) {
    selectTarget.value = null;
  } else {
    selectTarget.value = target;
  }
}

function selectStart(s: StationSuggestion) {
  startInput.value = `${s.name} (${s.id})`;
  startSelected.value = s;
  startSuggestions.value = [];
  startFocused.value = false;
  clearResults();
  routeError.value = '';
}

function selectEnd(s: StationSuggestion) {
  endInput.value = `${s.name} (${s.id})`;
  endSelected.value = s;
  endSuggestions.value = [];
  endFocused.value = false;
  clearResults();
  routeError.value = '';
}

function suggestionList(query: string): { label: string; value: StationSuggestion }[] {
  return searchStations(query).map((s) => ({ label: `${s.name} (${s.id})`, value: s }));
}

/** 输入框可搜索：改动即视为重新开始，清掉已选站点与上一次的计算结果 */
function onStartInput(value: string) {
  startSelected.value = null;
  startSuggestions.value = suggestionList(value);
  startFocused.value = true;
  clearResults();
  routeError.value = '';
}

function onEndInput(value: string) {
  endSelected.value = null;
  endSuggestions.value = suggestionList(value);
  endFocused.value = true;
  clearResults();
  routeError.value = '';
}

/** 重新聚焦时按当前文字把候选捞回来（点开候选前的失焦已清过） */
function onStartFocus() {
  startFocused.value = true;
  if (!startSelected.value) startSuggestions.value = suggestionList(startInput.value);
}

function onEndFocus() {
  endFocused.value = true;
  if (!endSelected.value) endSuggestions.value = suggestionList(endInput.value);
}

function onStartBlur() {
  setTimeout(() => {
    startFocused.value = false;
  }, 200);
}

function onEndBlur() {
  setTimeout(() => {
    endFocused.value = false;
  }, 200);
}

function calculate() {
  if (!startSelected.value || !endSelected.value) return;
  routeError.value = '';
  clearResults();

  const results = findRoutes(startSelected.value.id, endSelected.value.id);

  if (results.length === 0) {
    routeError.value = '未找到可行路径';
    return;
  }

  const metrics: RouteMetric[] = ['fare', 'time', 'distance'];
  routeOptions.value = results.map((r, i) => ({
    metric: metrics[i],
    label: METRIC_LABELS[metrics[i]],
    result: r,
  }));
}

function selectRoute(opt: RouteOption) {
  selectedRoute.value = opt;
  emit('result-change', opt.result);
}

function clearResults() {
  routeOptions.value = [];
  selectedRoute.value = null;
  emit('result-change', null);
}

function onStationClick(stationId: string) {
  const suggestions = searchStations(stationId);
  const match = suggestions.find((s) => s.id === stationId);
  if (!match) return;

  if (selectTarget.value === 'start') {
    selectStart(match);
    selectTarget.value = null;
  } else if (selectTarget.value === 'end') {
    selectEnd(match);
    selectTarget.value = null;
  }
}

defineExpose({ onStationClick });
</script>

<style scoped>
.suggest-panel {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  z-index: 20;
  max-height: 240px;
  overflow-y: auto;
  background: var(--color-surface-container-high);
  border: 1px solid var(--color-outline);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.18);
}
.suggest-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 4px 10px;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
}
.suggest-item:hover {
  background: var(--color-surface-container-highest);
}
.suggest-name {
  font-size: 13px;
}
.suggest-lines {
  font-size: 11px;
  opacity: 0.7;
}
.panel-toggle {
  width: 20px;
  background: var(--color-surface-container);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--color-text);
  padding: 0;
  transition: background 0.15s;
}
.panel-toggle:hover {
  background: var(--color-surface-container-high);
}
.panel-toggle.collapsed {
  border-left: 1px solid var(--color-outline);
}
</style>
