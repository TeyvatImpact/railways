<script setup lang="ts">
import { useSpeech } from '../../composables/useSpeech';
import type { AnnounceLang } from '../../config/announce.config';

const speech = useSpeech();

const LANGS: { key: AnnounceLang; label: string }[] = [
  { key: 'zh', label: '中文' },
  { key: 'ja', label: '日文' },
  { key: 'en', label: '英文' },
];
</script>

<template>
  <div class="voice-panel">
    <span class="vp-title">语音播报</span>
    <label v-for="l in LANGS" :key="l.key" class="vp-field">
      <span class="vp-label">{{ l.label }}音色</span>
      <select
        class="vp-select"
        :value="speech.selection[l.key]"
        @change="speech.setVoice(l.key, ($event.target as HTMLSelectElement).value)">
        <option v-if="!speech.optionsFor(l.key).length" value="">（未找到可用音色）</option>
        <option v-for="v in speech.optionsFor(l.key)" :key="v.voiceURI" :value="v.voiceURI">
          {{ v.name }}（{{ v.lang }}）
        </option>
      </select>
      <button
        type="button"
        class="vp-btn"
        :disabled="!speech.supported"
        @click="speech.preview(l.key)">
        ▶ 试听
      </button>
    </label>
    <label class="vp-switch">
      <input
        type="checkbox"
        :checked="speech.auto"
        @change="speech.setAuto(($event.target as HTMLInputElement).checked)" />
      <span class="vp-switch-track"></span>
      <span>自动播报</span>
    </label>
    <span v-if="!speech.supported" class="vp-warn">当前浏览器不支持语音合成</span>
  </div>
</template>

<style scoped>
/* 页面最顶上的语音面板：吸顶（滚动容器是页面根的 h-screen overflow-y-auto），与条带面板同宽对齐 */
.voice-panel {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 16px;
  width: 1920px;
  padding: 6px 10px;
  border: 1px solid #d8dde3;
  border-radius: 10px;
  background: #f6f8fa;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.06);
  color: #333;
  font-size: 12px;
}
.vp-title {
  font-weight: 700;
}
.vp-field {
  display: flex;
  align-items: center;
  gap: 6px;
}
.vp-label {
  color: #666;
  white-space: nowrap;
}
.vp-select {
  width: 280px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid #cfd6dd;
  border-radius: 6px;
  background: #fff;
  color: #222;
  font-size: 12px;
}
.vp-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  height: 24px;
  padding: 0 10px;
  border: 1px solid #cfd6dd;
  border-radius: 6px;
  background: #fff;
  color: #333;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.vp-btn:disabled {
  color: #b6bcc4;
  cursor: default;
}
.vp-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  cursor: pointer;
}
.vp-switch input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
}
.vp-switch-track {
  position: relative;
  width: 34px;
  height: 18px;
  border-radius: 9px;
  background: #c8ced6;
  transition: background 0.15s;
}
.vp-switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.vp-switch input:checked + .vp-switch-track {
  background: #4363d8;
}
.vp-switch input:checked + .vp-switch-track::after {
  transform: translateX(16px);
}
.vp-warn {
  color: #c0392b;
}
</style>
