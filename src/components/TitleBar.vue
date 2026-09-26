<script setup lang="ts">
defineProps<{ theme: 'light' | 'dark' }>();
defineEmits<{ open: []; 'toggle-theme': []; 'toggle-admin': [] }>();
const dev = import.meta.env.DEV;
</script>

<template>
  <var-app-bar type="surface">
    <span class="title">提瓦特轨道交通设定线路图</span>
    <template #right>
      <div class="flex gap-1">
        <var-button @click="$emit('toggle-theme')">
          {{ theme === 'dark' ? '浅色主题' : '深色主题' }}
        </var-button>
        <var-button @click="$emit('open')">关于</var-button>
        <a href="https://teyvatimpact.top" target="_blank"> <var-button>设定主站</var-button></a>
        <var-button v-if="dev" @click="$emit('toggle-admin')">🛠</var-button>
      </div>
    </template>
  </var-app-bar>
</template>
