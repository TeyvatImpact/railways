<template>
  <div v-if="isDev">
    <Teleport to="body">
      <div v-if="visible" class="admin-overlay" @click.self="$emit('close')">
        <div class="admin-panel">
          <div class="admin-header">
            <h2>Data Editor</h2>
            <button class="close-btn" @click="$emit('close')">✕</button>
          </div>

          <div v-if="loading" class="admin-loading">Loading...</div>

          <template v-else>
            <div class="admin-tabs">
              <button
                v-for="key in fileKeys"
                :key="key"
                class="tab-btn"
                :class="{ active: activeFile === key }"
                @click="activeFile = key">
                {{ key }}
              </button>
            </div>

            <div class="admin-body">
              <div class="admin-section">
                <h3>Stations</h3>
                <table v-if="currentStations.length" class="data-table">
                  <thead>
                    <tr>
                      <th class="col-id">ID</th>
                      <th>Name (JP/CN)</th>
                      <th>Name (ZH)</th>
                      <th>Name (EN)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="st in currentStations" :key="st.id">
                      <td class="col-id">{{ st.id }}</td>
                      <td><input v-model="st.nameCn" class="edit-input" /></td>
                      <td>
                        <input
                          v-model="st.nameZh"
                          class="edit-input"
                          :placeholder="activeFile === 'inazuma' ? '中文译名' : ''" />
                      </td>
                      <td><input v-model="st.nameEn" class="edit-input" /></td>
                    </tr>
                  </tbody>
                </table>
                <p v-else class="text-gray-400 text-xs italic">
                  No station definitions in this file.
                </p>
              </div>

              <div class="admin-section">
                <h3>Lines</h3>
                <div v-for="line in currentLines" :key="line.id" class="line-group">
                  <div class="line-header">
                    <span class="line-id">{{ line.id }}</span>
                    <input v-model="line.name" class="edit-input line-name" />
                    <input
                      v-model="line.nameZh"
                      class="edit-input line-name"
                      :placeholder="activeFile === 'inazuma' ? '中文名' : ''" />
                    <input v-model="line.nameEn" class="edit-input line-name" />
                    <select v-model="line.costPreset" class="preset-select">
                      <option v-for="p in presetOptions" :key="p.id" :value="p.id">
                        {{ p.label }}
                      </option>
                    </select>
                  </div>
                  <div v-for="(variant, vi) in line.variants" :key="vi" class="variant-group">
                    <div class="line-header">
                      <input
                        v-model="variant.name"
                        class="edit-input line-name"
                        placeholder="变体名（可空）" />
                      <input
                        v-model="variant.nameEn"
                        class="edit-input line-name"
                        placeholder="Variant (EN)" />
                    </div>
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th class="col-seg">Segment</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(seg, si) in getSegments(variant)" :key="si">
                          <td class="col-seg">{{ seg.fromName }} → {{ seg.toName }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div class="admin-section">
                <h3>Connections</h3>
                <table v-if="currentConnections.length" class="data-table">
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th class="col-seg">Path</th>
                      <th class="col-num">Dist (km)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(c, ci) in currentConnections" :key="ci">
                      <td>{{ distStationName(c.from) }}</td>
                      <td>{{ distStationName(c.to) }}</td>
                      <td class="col-seg">{{ fmtWaypoints(c.waypoints) }}</td>
                      <td>
                        <input
                          type="number"
                          v-model.number="c.distance"
                          class="edit-input num"
                          placeholder="默认 10"
                          step="0.1" />
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p v-else class="text-gray-400 text-xs italic">
                  No connection entries in this file.
                </p>
              </div>
            </div>

            <div class="admin-footer">
              <button class="save-btn" :disabled="saving" @click="save">
                {{ saving ? 'Saving...' : 'Save All Changes' }}
              </button>
              <span v-if="savedMsg" class="saved-msg">{{ savedMsg }}</span>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';

const fileKeys = ['teyvat', 'inazuma', 'liyue', 'snezhnaya', 'ferry', 'same', 'connections'];
const regionKeys = ['teyvat', 'inazuma', 'liyue', 'snezhnaya'];

const presetOptions = [
  { id: 'standard', label: '标准' },
  { id: 'aquabus', label: '巡轨船' },
  { id: 'natlan-resort', label: '度假村' },
  { id: 'inazuma', label: '稻妻铁道' },
  { id: 'liyue-metro', label: '璃月港地铁' },
  { id: 'ferry', label: '轮渡' },
  { id: 'same-station', label: '同站换乘' },
];

const isDev = import.meta.env.DEV;
const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();
const loading = ref(true);
const saving = ref(false);
const savedMsg = ref('');
const activeFile = ref('teyvat');
const filesData = reactive<Record<string, any>>({});

const stationNameMap = computed(() => {
  const map = new Map<string, string>();
  for (const key of regionKeys) {
    const data = filesData[key];
    if (!data?.config?.name || !data.stations) continue;
    const prefix = data.config.name;
    for (const st of data.stations) {
      map.set(`${prefix}-${st.id}`, st.nameCn);
    }
  }
  return map;
});

function stationName(stationId: string, fileKey?: string): string {
  const data = fileKey ? filesData[fileKey] : null;
  if (data?.stations) {
    const st = data.stations.find((s: any) => s.id === stationId);
    if (st) return `${st.nameCn} / ${st.nameEn}`;
  }
  const name = stationNameMap.value.get(stationId);
  if (name) return name;
  return stationId;
}

function distStationName(id: string): string {
  const fileKey = activeFile.value;
  const data = filesData[fileKey];
  if (data?.stations) {
    const st = data.stations.find((s: any) => s.id === id);
    if (st) return `${st.nameCn} / ${st.nameEn} (${id})`;
  }
  const fullName = stationNameMap.value.get(id);
  if (fullName) return `${fullName} (${id})`;
  return id;
}

const currentFileData = computed(() => filesData[activeFile.value]);

const currentStations = computed(() => {
  const d = currentFileData.value;
  if (!d?.stations) return [];
  return d.stations;
});

const currentLines = computed(() => {
  const d = currentFileData.value;
  if (!d?.lines) return [];
  return d.lines;
});

const currentConnections = computed(() => {
  const d = currentFileData.value;
  if (!d?.connections) return [];
  return d.connections;
});

function fmtWaypoints(w?: [number, number][]) {
  return w?.length ? w.map(([x, y]) => `${x},${y}`).join(' → ') : '直线';
}

function getSegments(variant: any) {
  const segs: any[] = [];
  for (let i = 0; i < variant.stations.length - 1; i++) {
    const fromId = variant.stations[i];
    const toId = variant.stations[i + 1];
    const fromName = regionKeys.includes(activeFile.value)
      ? stationName(fromId, activeFile.value)
      : stationName(fromId);
    const toName = regionKeys.includes(activeFile.value)
      ? stationName(toId, activeFile.value)
      : stationName(toId);
    segs.push({ fromName, toName });
  }
  return segs;
}

async function loadAll() {
  loading.value = true;
  for (const key of fileKeys) {
    try {
      const res = await fetch(`/__admin/data/${key}.json`);
      if (res.ok) {
        filesData[key] = await res.json();
      }
    } catch (e) {
      console.error(`Failed to load ${key}.json`, e);
    }
  }
  loading.value = false;
}

watch(
  () => props.visible,
  (v) => {
    if (v) loadAll();
  },
);

async function save() {
  saving.value = true;
  savedMsg.value = '';
  let ok = true;
  for (const key of fileKeys) {
    const data = filesData[key];
    if (!data) continue;
    try {
      const body = JSON.stringify(data, null, 2) + '\n';
      const res = await fetch(`/__admin/data/${key}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) {
        console.error(`Failed to save ${key}.json`);
        ok = false;
      }
    } catch (e) {
      console.error(`Failed to save ${key}.json`, e);
      ok = false;
    }
  }
  saving.value = false;
  savedMsg.value = ok ? '✓ Saved' : '✗ Some files failed';
  setTimeout(() => {
    savedMsg.value = '';
  }, 3000);
}
</script>

<style scoped>
.admin-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.admin-panel {
  background: #fff;
  border-radius: 8px;
  width: 90vw;
  max-width: 800px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
}
.admin-header h2 {
  margin: 0;
  font-size: 16px;
  color: #333;
}
.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
}
.close-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.admin-loading {
  padding: 40px;
  text-align: center;
  color: #888;
}

.admin-tabs {
  display: flex;
  border-bottom: 1px solid #eee;
  padding: 0 12px;
  gap: 0;
}
.tab-btn {
  padding: 8px 14px;
  border: none;
  background: none;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition:
    color 0.15s,
    border-color 0.15s;
}
.tab-btn:hover {
  color: #1f77b4;
}
.tab-btn.active {
  color: #1f77b4;
  border-bottom-color: #1f77b4;
  font-weight: 600;
}

.admin-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.admin-section {
  margin-bottom: 20px;
}
.admin-section h3 {
  font-size: 14px;
  margin: 0 0 8px;
  color: #555;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.data-table th {
  text-align: left;
  padding: 6px 8px;
  background: #f5f5f5;
  color: #666;
  font-weight: 600;
  border: 1px solid #e0e0e0;
}
.data-table td {
  padding: 4px 8px;
  border: 1px solid #e0e0e0;
}
.col-id {
  width: 60px;
  font-family: monospace;
  color: #888;
}
.col-seg {
  min-width: 200px;
}
.col-num {
  width: 90px;
}

.edit-input {
  width: 100%;
  padding: 3px 6px;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
}
.edit-input:focus {
  border-color: #1f77b4;
}
.edit-input.num {
  text-align: right;
  width: 80px;
}

.line-group {
  margin-bottom: 14px;
}
.line-group h4 {
  font-size: 13px;
  margin: 0 0 6px;
  color: #444;
}
.variant-group {
  margin-top: 6px;
  padding-left: 8px;
  border-left: 2px solid #eee;
}
.line-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.line-id {
  font-family: monospace;
  font-size: 12px;
  color: #888;
  min-width: 40px;
}
.line-name {
  flex: 1;
  min-width: 80px;
}
.preset-select {
  font-size: 11px;
  padding: 2px 4px;
  border: 1px solid #ddd;
  border-radius: 3px;
  background: #fff;
  color: #555;
  cursor: pointer;
  outline: none;
}
.preset-select:focus {
  border-color: #1f77b4;
}

.admin-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid #eee;
}

.save-btn {
  padding: 8px 20px;
  background: #1f77b4;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}
.save-btn:hover {
  background: #1669a1;
}
.save-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.saved-msg {
  font-size: 13px;
  color: #2e7d32;
}
</style>
