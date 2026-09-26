<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useSpeech, type SpeechStatus } from '../../composables/useSpeech';
import type { AnnounceLang } from '../../config/announce.config';

const speech = useSpeech();
const box = ref<HTMLElement | null>(null);

const LANG_TAG: Record<AnnounceLang, string> = { zh: '中', ja: '日', en: '英' };
const STATUS: Record<SpeechStatus, string> = {
  queued: '排队',
  speaking: '播放中',
  done: '完成',
  canceled: '已打断',
  skipped: '未播报',
  error: '失败',
  note: '',
};

/** 正在播的那条（没有就是 null） */
const speakingId = computed(() => speech.log.find((e) => e.status === 'speaking')?.id ?? null);

// 新句子进来 / 播放推进时把正在播的那条滚到窗口正中；没有在播的（还没开播）就照旧滚到底
watch(
  () => [speech.log.length, speakingId.value],
  () =>
    nextTick(() => {
      const el = box.value;
      if (!el) return;
      const line = el.querySelector<HTMLElement>('.log-speaking');
      if (!line) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      const boxRect = el.getBoundingClientRect();
      const lineRect = line.getBoundingClientRect();
      el.scrollTop += lineRect.top - boxRect.top - (boxRect.height - lineRect.height) / 2;
    }),
);
</script>

<template>
  <div ref="box" class="log-box">
    <div v-for="e in speech.log" :key="e.id" class="log-line" :class="'log-' + e.status">
      <span class="log-tag">[{{ e.lang ? LANG_TAG[e.lang] : '—' }}]</span>
      <span>{{ e.text }}</span>
      <span v-if="STATUS[e.status]" class="log-status">{{ STATUS[e.status] }}</span>
    </div>
    <div v-if="!speech.log.length" class="log-line log-empty">（暂无播报）</div>
  </div>
</template>

<style scoped>
/* 高度 = 3 × 18px 行高 + 上下各 2px 内边距 + 上下各 1px 边框 = 60px（border-box），正好三行；
   要改行数只改这个高度 */
.log-box {
  height: 60px;
  overflow-y: auto;
  padding: 2px 6px;
  border: 1px solid #cfd6dd;
  border-radius: 6px;
  background: #fff;
  font:
    400 12px/18px 'Noto Sans SC',
    sans-serif;
}
.log-line {
  white-space: nowrap;
  color: #666;
}
.log-speaking {
  color: #111;
  background: #eef4ff;
}
.log-canceled {
  text-decoration: line-through;
}
.log-tag {
  color: #888;
}
.log-status {
  margin-left: 6px;
  color: #999;
}
.log-empty {
  color: #aaa;
}
</style>
