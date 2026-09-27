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
              <!-- stations -->
              <div v-if="activeFile === 'stations'" class="admin-section">
                <h3>Stations</h3>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th class="col-id">ID</th>
                      <th>zhCN</th>
                      <th>zhTW</th>
                      <th>ja</th>
                      <th>en</th>
                      <th>读音</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in stationRows" :key="row.id">
                      <td class="col-id">{{ row.id }}</td>
                      <td><input v-model="row.value.names.zhCN" class="edit-input" /></td>
                      <td><input v-model="row.value.names.zhTW" class="edit-input" /></td>
                      <td><input v-model="row.value.names.ja" class="edit-input" /></td>
                      <td><input v-model="row.value.names.en" class="edit-input" /></td>
                      <td>
                        <input
                          v-model="row.value.names.pronunciationJa"
                          class="edit-input"
                          placeholder="可选" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- lines -->
              <div v-else-if="activeFile === 'lines'" class="admin-section">
                <h3>Lines</h3>
                <div v-for="row in lineRows" :key="row.id" class="line-group">
                  <div class="line-header">
                    <span class="line-id">{{ row.id }}</span>
                    <template v-if="row.value.names">
                      <input
                        v-model="row.value.names.zhCN"
                        class="edit-input line-name"
                        placeholder="zhCN" />
                      <input
                        v-model="row.value.names.zhTW"
                        class="edit-input line-name"
                        placeholder="zhTW" />
                      <input
                        v-model="row.value.names.ja"
                        class="edit-input line-name"
                        placeholder="ja" />
                      <input
                        v-model="row.value.names.en"
                        class="edit-input line-name"
                        placeholder="en" />
                    </template>
                    <span v-else class="derived-name">线路名由端点站自动生成，不可编辑</span>
                  </div>
                  <div v-for="(variant, vi) in row.value.variants" :key="vi" class="variant-group">
                    <div class="line-header">
                      <input
                        v-model="variant.name"
                        class="edit-input line-name"
                        placeholder="变体名（可空）" />
                      <input
                        v-model="variant.nameEn"
                        class="edit-input line-name"
                        placeholder="Variant (EN)" />
                      <select v-model="variant.vehicle" class="preset-select">
                        <option v-for="v in VEHICLES" :key="v.id" :value="v.id">
                          {{ v.name }}
                        </option>
                      </select>
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

              <!-- networks -->
              <div v-else-if="activeFile === 'networks'" class="admin-section">
                <h3>Networks</h3>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th class="col-id">ID</th>
                      <th>Operator</th>
                      <th>Authority</th>
                      <th>primaryLang</th>
                      <th>fontFamily</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in networkRows" :key="row.id">
                      <td class="col-id">{{ row.id }}</td>
                      <td>
                        <select v-model="row.value.operator" class="preset-select">
                          <option :value="undefined">（无）</option>
                          <option v-for="oid in orgIds" :key="oid" :value="oid">{{ oid }}</option>
                        </select>
                      </td>
                      <td>
                        <select v-model="row.value.authority" class="preset-select">
                          <option :value="undefined">（无）</option>
                          <option v-for="oid in orgIds" :key="oid" :value="oid">{{ oid }}</option>
                        </select>
                      </td>
                      <td>
                        <select v-model="row.value.primaryLang" class="preset-select">
                          <option :value="undefined">（默认 zhCN）</option>
                          <option value="zhCN">zhCN</option>
                          <option value="ja">ja</option>
                        </select>
                      </td>
                      <td>
                        <input
                          v-model="row.value.fontFamily"
                          class="edit-input"
                          placeholder="可选" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- organizations -->
              <div v-else-if="activeFile === 'organizations'" class="admin-section">
                <h3>Organizations</h3>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th class="col-id">ID</th>
                      <th>zhCN</th>
                      <th>zhTW</th>
                      <th>ja</th>
                      <th>en</th>
                      <th>ru</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in orgRows" :key="row.id">
                      <td class="col-id">{{ row.id }}</td>
                      <td><input v-model="row.value.names.zhCN" class="edit-input" /></td>
                      <td><input v-model="row.value.names.zhTW" class="edit-input" /></td>
                      <td><input v-model="row.value.names.ja" class="edit-input" /></td>
                      <td><input v-model="row.value.names.en" class="edit-input" /></td>
                      <td>
                        <input v-model="row.value.names.ru" class="edit-input" placeholder="可选" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- territories -->
              <div v-else-if="activeFile === 'territories'" class="admin-section">
                <h3>Nations</h3>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th class="col-id">ID</th>
                      <th>zhCN</th>
                      <th>zhTW</th>
                      <th>ja</th>
                      <th>en</th>
                      <th>primaryLang</th>
                      <th>fontFamily</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in nationRows" :key="row.id">
                      <td class="col-id">{{ row.id }}</td>
                      <td><input v-model="row.value.names.zhCN" class="edit-input" /></td>
                      <td><input v-model="row.value.names.zhTW" class="edit-input" /></td>
                      <td><input v-model="row.value.names.ja" class="edit-input" /></td>
                      <td><input v-model="row.value.names.en" class="edit-input" /></td>
                      <td>
                        <select v-model="row.value.primaryLang" class="preset-select">
                          <option :value="undefined">（默认 zhCN）</option>
                          <option value="zhCN">zhCN</option>
                          <option value="ja">ja</option>
                        </select>
                      </td>
                      <td>
                        <input
                          v-model="row.value.fontFamily"
                          class="edit-input"
                          placeholder="可选" />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <h3>Areas</h3>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th class="col-id">ID</th>
                      <th>国家/地区</th>
                      <th>zhCN</th>
                      <th>zhTW</th>
                      <th>ja</th>
                      <th>en</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in areaRows" :key="row.id">
                      <td class="col-id">{{ row.id }}</td>
                      <td>{{ row.value.nation }}</td>
                      <td><input v-model="row.value.names.zhCN" class="edit-input" /></td>
                      <td><input v-model="row.value.names.zhTW" class="edit-input" /></td>
                      <td><input v-model="row.value.names.ja" class="edit-input" /></td>
                      <td><input v-model="row.value.names.en" class="edit-input" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- connections -->
              <div v-else-if="activeFile === 'connections'" class="admin-section">
                <h3>Connections</h3>
                <table v-if="connectionRows.length" class="data-table">
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th class="col-seg">Path</th>
                      <th class="col-num">Dist (km)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(c, ci) in connectionRows" :key="ci">
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
import { VEHICLES } from '../config/vehicles';

const fileKeys = ['stations', 'lines', 'networks', 'organizations', 'territories', 'connections'];

const isDev = import.meta.env.DEV;
const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();
const loading = ref(true);
const saving = ref(false);
const savedMsg = ref('');
const activeFile = ref('stations');
const filesData = reactive<Record<string, any>>({});

type Row = { id: string; value: any };
function entriesOf(key: string): Row[] {
  const obj = filesData[key];
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj).map(([id, value]) => ({ id, value }));
}

const stationRows = computed<Row[]>(() => entriesOf('stations'));
const lineRows = computed<Row[]>(() => entriesOf('lines'));
const networkRows = computed<Row[]>(() => entriesOf('networks'));
const orgRows = computed<Row[]>(() => entriesOf('organizations'));
const orgIds = computed(() => Object.keys(filesData.organizations ?? {}));
const connectionRows = computed<any[]>(() => filesData.connections?.connections ?? []);

// territories 有两段（nations / areas），单独取
const territoriesData = computed(() => filesData.territories ?? {});
function territoryRows(kind: 'nations' | 'areas'): Row[] {
  const obj = territoriesData.value[kind];
  if (!obj) return [];
  return Object.entries(obj).map(([id, value]) => ({ id, value: value as any }));
}
const nationRows = computed<Row[]>(() => territoryRows('nations'));
const areaRows = computed<Row[]>(() => territoryRows('areas'));

const stationNameMap = computed(() => {
  const map = new Map<string, string>();
  for (const [id, st] of Object.entries<any>(filesData.stations ?? {})) {
    map.set(id, st.names?.zhCN ?? '');
  }
  return map;
});

function stationName(stationId: string): string {
  const st = filesData.stations?.[stationId];
  if (st) return `${st.names?.zhCN ?? ''} / ${st.names?.en ?? ''}`;
  const name = stationNameMap.value.get(stationId);
  if (name) return name;
  return stationId;
}

function distStationName(id: string): string {
  const st = filesData.stations?.[id];
  if (st) return `${st.names?.zhCN ?? ''} / ${st.names?.en ?? ''} (${id})`;
  const name = stationNameMap.value.get(id);
  if (name) return `${name} (${id})`;
  return id;
}

function fmtWaypoints(w?: [number, number][]) {
  return w?.length ? w.map(([x, y]) => `${x},${y}`).join(' → ') : '直线';
}

function getSegments(variant: any) {
  const segs: { fromName: string; toName: string }[] = [];
  for (let i = 0; i < variant.stations.length - 1; i++) {
    segs.push({
      fromName: stationName(variant.stations[i]),
      toName: stationName(variant.stations[i + 1]),
    });
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
.derived-name {
  flex: 1;
  font-size: 11px;
  color: #888;
  font-style: italic;
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
