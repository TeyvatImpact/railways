<template>
  <div class="map-controls">
    <div v-if="mouseCoord" class="coord">{{ mouseCoord }}</div>
    <button
      v-if="isDev"
      class="border-toggle"
      :title="`归属边界平滑：${borderSmoothing}（点击循环：flow → round → none）`"
      @click="cycleBorderSmoothing">
      边界：{{ borderSmoothing }}
    </button>
    <div class="zoom-group">
      <button @click="$emit('update:scale', Math.min(5, scale * 1.1))">+</button>
      <span>{{ Math.round(scale * 100) }}%</span>
      <button @click="$emit('update:scale', Math.max(0.2, scale / 1.1))">−</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useBorderSmoothing } from '../composables/useBorderSmoothing';

defineProps<{ mouseCoord?: string | null; scale: number }>();

const { borderSmoothing, cycleBorderSmoothing } = useBorderSmoothing();

/** 调试用的运行时开关：只在 dev 构建里出现（与 AdminPanel 同口径） */
const isDev = import.meta.env.DEV;
defineEmits<{ 'update:scale': [value: number] }>();
</script>

<style scoped>
.map-controls {
  position: fixed;
  bottom: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 10;
}
.coord {
  background: var(--color-surface-container);
  border-radius: 8px;
  padding: 4px 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: var(--color-text);
}
.zoom-group {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-surface-container);
  border-radius: 8px;
  padding: 6px 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  font-family: sans-serif;
  font-size: 14px;
  color: var(--color-text);
}
.border-toggle {
  align-self: flex-start;
  padding: 4px 10px;
  border: 1px solid var(--color-outline);
  border-radius: 8px;
  background: var(--color-surface-container);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;
}
.border-toggle:hover {
  background: var(--color-surface-container-high);
}
.zoom-group button {
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-outline);
  border-radius: 4px;
  background: var(--color-surface-container-high);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  color: var(--color-text);
}
.zoom-group button:hover {
  background: var(--color-surface-container-highest);
}
</style>
