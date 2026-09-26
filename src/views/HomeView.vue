<template>
  <TitleBar
    @open="showDialog = true"
    @toggle-theme="toggleTheme"
    @toggle-admin="showAdmin = !showAdmin"
    :theme="theme" />
  <div class="app-body">
    <div class="map-area">
      <RailwayMap :route-result="routeResult" @station-click="onStationClick" />
    </div>
    <RoutePanel ref="panel" @result-change="onResultChange" />
  </div>
  <InfoDialog :visible="showDialog" @close="onClose" />
  <AdminPanel :visible="showAdmin" @close="showAdmin = false" />
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useTheme } from '../composables/useTheme';
import RailwayMap from '../components/RailwayMap.vue';
import TitleBar from '../components/TitleBar.vue';
import RoutePanel from '../components/RoutePanel.vue';
import InfoDialog from '../components/InfoDialog.vue';
import AdminPanel from '../components/AdminPanel.vue';
import type { RouteResult } from '../composables/useRouting';

const STORAGE_KEY = 'teyvat-railways-visited';
const { theme, toggle: toggleTheme } = useTheme();
const showDialog = ref(false);
const showAdmin = ref(false);
const routeResult = ref<RouteResult | null>(null);
const panel = ref<InstanceType<typeof RoutePanel> | null>(null);

watch(theme, () => document.documentElement.setAttribute('data-theme', theme.value), {
  immediate: true,
});

function onResultChange(v: RouteResult | null) {
  routeResult.value = v;
}

function onStationClick(stationId: string) {
  panel.value?.onStationClick(stationId);
}

function onClose() {
  showDialog.value = false;
  localStorage.setItem(STORAGE_KEY, '1');
}

onMounted(() => {
  if (!localStorage.getItem(STORAGE_KEY)) {
    showDialog.value = true;
  }
});
</script>

<style scoped>
.app-body {
  display: flex;
  height: calc(100vh - 40px);
}
.map-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}
</style>
