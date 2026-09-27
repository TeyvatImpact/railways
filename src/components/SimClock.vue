<template>
  <div class="sim-clock">
    <div class="clock-display">
      <template v-for="(pair, ui) in digits" :key="ui">
        <span v-if="ui > 0" class="colon">:</span>
        <span class="digits">
          <span v-for="(d, di) in pair" :key="di" class="digit-col">
            <button
              class="step"
              :aria-label="`${UNIT_LABELS[ui]} 十位/个位加`"
              @click="step(ui, di, 1)">
              ▲
            </button>
            <span class="digit">{{ d }}</span>
            <button
              class="step"
              :aria-label="`${UNIT_LABELS[ui]} 十位/个位减`"
              @click="step(ui, di, -1)">
              ▼
            </button>
          </span>
        </span>
      </template>
    </div>
    <div class="clock-controls">
      <button class="play" :title="playing ? '暂停' : '继续'" @click="playing = !playing">
        {{ playing ? '⏸' : '▶' }}
      </button>
      <button
        v-for="r in RATES"
        :key="r"
        class="rate"
        :class="{ active: rate === r }"
        @click="rate = r">
        {{ r }}x
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RATES, playing, rate, secondsOfDay, useSimClock } from '../composables/useSimClock';

// 时钟状态在共享 composable 里（地图上的列车也读它）；这里只负责启动与显示
useSimClock();

const UNIT_LABELS = ['小时', '分钟', '秒'];
/** 各单位的进位上限：时 0–23，分 / 秒 0–59 */
const UNIT_MAX = [23, 59, 59];
const MULT = [3600, 60, 1];

/** [时, 分, 秒] 的十位 / 个位 */
const digits = computed(() => {
  const v = Math.floor(secondsOfDay.value);
  const units = [Math.floor(v / 3600) % 24, Math.floor(v / 60) % 60, v % 60];
  return units.map((u) => [Math.floor(u / 10), u % 10]);
});

/** 逐位上下调整（按位钳制，不越界） */
function step(unit: number, digit: number, delta: number) {
  const max = UNIT_MAX[unit];
  const mult = MULT[unit];
  const total = Math.floor(secondsOfDay.value);
  const cur = Math.floor(total / mult) % (max + 1);
  const stepSize = digit === 0 ? 10 : 1;
  const next = Math.min(max, Math.max(0, cur + delta * stepSize));
  secondsOfDay.value = total + (next - cur) * mult;
}
</script>

<style scoped>
.sim-clock {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px 10px;
  border-radius: 10px;
  background: var(--color-surface-container);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  font-family: 'Courier New', monospace;
  color: var(--color-text);
  user-select: none;
}
.clock-display {
  display: flex;
  align-items: center;
}
.digits {
  display: flex;
  gap: 2px;
}
.digit-col {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.digit {
  width: 16px;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.1;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.colon {
  padding: 0 1px;
  font-size: 22px;
  font-weight: 600;
  line-height: 1;
}
.step {
  height: 11px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font-size: 9px;
  line-height: 1;
  opacity: 0.45;
  cursor: pointer;
}
.step:hover {
  opacity: 1;
}
.clock-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}
.play {
  width: 28px;
  height: 22px;
  border: 1px solid var(--color-outline);
  border-radius: 4px;
  background: var(--color-surface-container-high);
  color: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}
.rate {
  padding: 3px 7px;
  border: 1px solid var(--color-outline);
  border-radius: 4px;
  background: var(--color-surface-container-high);
  color: inherit;
  font-family: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}
.play:hover,
.rate:hover {
  background: var(--color-surface-container-highest);
}
.rate.active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-on-primary);
}
</style>
