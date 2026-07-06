<template>
  <DialogWindow :visible="visible" @close="$emit('close')">
    <div class="markdown-body" v-html="html"></div>
  </DialogWindow>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { createMarkdownExit } from 'markdown-exit';
import raw from '../intro.md?raw';
import DialogWindow from './DialogWindow.vue';

const props = defineProps<{ visible: boolean }>();
defineEmits<{ close: [] }>();

const md = createMarkdownExit();
const html = computed(() => md.render(raw));
</script>

<style>
@import 'github-markdown-css/github-markdown.css';

.markdown-body {
  background: transparent !important;
  color: var(--color-text) !important;
}
</style>
