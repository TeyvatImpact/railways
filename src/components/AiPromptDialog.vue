<template>
  <DialogWindow :visible="visible" max-width="720px" @close="$emit('close')">
    <div class="ai-content">
      <div class="ai-header">
        <h2>AI 提示词 — 提瓦特铁路网设定</h2>
        <button class="copy-btn" @click="copyText">{{ copied ? '已复制' : '复制全文' }}</button>
      </div>

      <section>
        <h3>设定背景</h3>
        <p>
          这是一个基于《原神》世界观创作的架空轨道交通网络设定，名为「提瓦特铁路网」。该设定虚构了提瓦特大陆七国及周边区域的轨道交通系统，包括城际铁路、地铁、渡轮航线等多种交通方式。所有站点名称、线路名称均沿用游戏中的地名，但线路规划与站点布局为二次创作，与游戏内实际地貌不完全一致。
        </p>
      </section>

      <section>
        <h3>区域网络总览</h3>
        <div v-for="region in regions" :key="region.name" class="region-block">
          <h4>{{ region.name }}（{{ region.stations.length }} 站）</h4>
          <div v-for="line in region.lines" :key="line.id" class="line-block">
            <strong>{{ line.nameCn }}（{{ line.nameEn }}）</strong>
            <span class="line-stations">{{ line.stations.join(' → ') }}</span>
          </div>
        </div>
      </section>

      <section>
        <h3>渡轮航线</h3>
        <div class="region-block">
          <div v-for="line in ferryLines" :key="line.id" class="line-block">
            <strong>{{ line.nameCn }}（{{ line.nameEn }}）</strong>
            <span class="line-stations">{{ line.stations.join(' ↔ ') }}</span>
          </div>
        </div>
      </section>

      <section>
        <h3>跨网络同站换乘</h3>
        <div class="region-block">
          <div v-for="line in sameLines" :key="line.id" class="line-block">
            <strong>{{ line.nameCn }}</strong>
            <span class="line-stations">{{ line.stations.join(' ⟷ ') }}</span>
          </div>
        </div>
      </section>

      <section>
        <h3>换乘站一览</h3>
        <p>以下站点有多条线路经过，可作为换乘节点：</p>
        <div class="region-block">
          <div v-for="item in transferStations" :key="item.id" class="line-block">
            <strong>{{ item.nameCn }}（{{ item.nameEn }}）</strong>
            <span class="line-stations">换乘：{{ item.lines.join('、') }}</span>
          </div>
        </div>
      </section>
    </div>
  </DialogWindow>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import DialogWindow from './DialogWindow.vue';
import dataR from '../data/teyvat.json';
import dataI from '../data/inazuma.json';
import dataL from '../data/liyue.json';
import dataS from '../data/snezhnaya.json';
import ferryData from '../data/ferry.json';
import sameData from '../data/same.json';

defineProps<{ visible: boolean }>();
defineEmits<{ close: [] }>();

const copied = ref(false);

function copyText() {
  navigator.clipboard.writeText(plainText.value);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}

function prefixId(prefix: string, id: string) {
  return prefix + '-' + id;
}

interface RegionInfo {
  name: string;
  prefix: string;
  stations: { id: string; nameCn: string; nameEn: string }[];
  lines: { id: string; nameCn: string; nameEn: string; stations: string[] }[];
}

interface FileLine {
  id: string;
  name: string;
  nameEn: string;
  lineType?: string;
  stations: [string, boolean, number, number, number][];
}

interface RegionFile {
  config: { name: string };
  stations: { id: string; nameCn: string; nameEn: string }[];
  lines: FileLine[];
}

interface FerryFile {
  lines: FileLine[];
}

interface StationEntry {
  id: string;
  nameCn: string;
  nameEn: string;
}

// Build full name map from all region stations (prefixed keys)
const allStationMap = new Map<string, StationEntry>();
type RegionEntry = { file: RegionFile; prefix: string; name: string };
const allRegions: RegionEntry[] = [
  { file: dataR as unknown as RegionFile, prefix: 'Teyvat', name: '提瓦特（Teyvat）' },
  { file: dataI as unknown as RegionFile, prefix: 'Inazuma', name: '稻妻（Inazuma）' },
  { file: dataL as unknown as RegionFile, prefix: 'Liyue', name: '璃月港（Liyue）' },
  { file: dataS as unknown as RegionFile, prefix: 'Snezhnaya', name: '至冬（Snezhnaya）' },
];
for (const { file, prefix } of allRegions) {
  for (const s of file.stations) {
    allStationMap.set(prefixId(prefix, s.id), { id: s.id, nameCn: s.nameCn, nameEn: s.nameEn });
  }
}

function stationDisplay(sid: string): string {
  const st = allStationMap.get(sid);
  if (st) return `${st.nameCn}（${st.nameEn}）`;
  return sid;
}

function resolveSid(raw: string, prefix: string): string {
  if (raw.includes('-')) return raw;
  return prefixId(prefix, raw);
}

const regions: RegionInfo[] = allRegions.map(({ file, prefix, name }) => ({
  name,
  prefix,
  stations: file.stations.map((s) => ({
    id: prefixId(prefix, s.id),
    nameCn: s.nameCn,
    nameEn: s.nameEn,
  })),
  lines: file.lines.map((l: FileLine) => ({
    id: l.id,
    nameCn: l.name,
    nameEn: l.nameEn,
    stations: l.stations.map(([sid]) => stationDisplay(resolveSid(sid, prefix))),
  })),
}));

const ferryLines = (ferryData as unknown as FerryFile).lines.map((l: FileLine) => ({
  id: l.id,
  nameCn: l.name,
  nameEn: l.nameEn,
  stations: l.stations.map(([sid]) => stationDisplay(sid)),
}));

const sameLines = (sameData as unknown as FerryFile).lines.map((l: FileLine) => ({
  id: l.id,
  nameCn: l.name,
  stations: l.stations.map(([sid]) => stationDisplay(sid)),
}));

// Build station → lines map to find transfer stations
const stationLinesMap = new Map<string, string[]>();

function addStationLine(fullId: string, lineName: string) {
  if (!stationLinesMap.has(fullId)) stationLinesMap.set(fullId, []);
  const arr = stationLinesMap.get(fullId)!;
  if (!arr.includes(lineName)) arr.push(lineName);
}

for (const { file, prefix } of allRegions) {
  for (const l of file.lines) {
    const lineLabel = `${l.name}（${prefix}）`;
    for (const [sid] of l.stations) {
      addStationLine(resolveSid(sid, prefix), lineLabel);
    }
  }
}
const ferryFile = ferryData as unknown as FerryFile;
for (const l of ferryFile.lines) {
  for (const [sid] of l.stations) {
    addStationLine(sid, l.name);
  }
}
const sameFile = sameData as unknown as FerryFile;
for (const l of sameFile.lines) {
  for (const [sid] of l.stations) {
    addStationLine(sid, l.name);
  }
}

const transferStations = [...stationLinesMap.entries()]
  .filter(([, lines]) => lines.length >= 2)
  .map(([id, lines]) => {
    const st = allStationMap.get(id);
    return {
      id,
      nameCn: st?.nameCn ?? id,
      nameEn: st?.nameEn ?? '',
      lines: lines.sort(),
    };
  })
  .sort((a, b) => a.nameCn.localeCompare(b.nameCn, 'zh'));

const sectionSep = '\n\n';

const plainText = computed(() => {
  const parts: string[] = [];

  // background
  parts.push(
    'AI 提示词 — 提瓦特铁路网设定\n\n设定背景\n这是一个基于《原神》世界观创作的架空轨道交通网络设定，名为「提瓦特铁路网」。该设定虚构了提瓦特大陆七国及周边区域的轨道交通系统，包括城际铁路、地铁、渡轮航线等多种交通方式。所有站点名称、线路名称均沿用游戏中的地名，但线路规划与站点布局为二次创作，与游戏内实际地貌不完全一致。',
  );

  // regions
  const regionLines: string[] = [];
  regionLines.push('区域网络总览');
  for (const region of regions) {
    regionLines.push(`\n${region.name}（${region.stations.length} 站）`);
    for (const line of region.lines) {
      regionLines.push(`  ${line.nameCn}（${line.nameEn}）`);
      regionLines.push(`    ${line.stations.join(' → ')}`);
    }
  }
  parts.push(regionLines.join('\n'));

  // ferries
  const ferryLinesArr: string[] = [];
  ferryLinesArr.push('渡轮航线');
  for (const line of ferryLines) {
    ferryLinesArr.push(`  ${line.nameCn}（${line.nameEn}）`);
    ferryLinesArr.push(`    ${line.stations.join(' ↔ ')}`);
  }
  parts.push(ferryLinesArr.join('\n'));

  // same-station
  const sameLinesArr: string[] = [];
  sameLinesArr.push('跨网络同站换乘');
  for (const line of sameLines) {
    sameLinesArr.push(`  ${line.nameCn}`);
    sameLinesArr.push(`    ${line.stations.join(' ⟷ ')}`);
  }
  parts.push(sameLinesArr.join('\n'));

  // transfers
  const transferArr: string[] = [];
  transferArr.push('换乘站一览');
  transferArr.push('以下站点有多条线路经过，可作为换乘节点：');
  for (const item of transferStations) {
    transferArr.push(`  ${item.nameCn}（${item.nameEn}）`);
    transferArr.push(`    换乘：${item.lines.join('、')}`);
  }
  parts.push(transferArr.join('\n'));

  return parts.join(sectionSep);
});
</script>

<style scoped>
.ai-content {
  font-size: 13px;
  line-height: 1.6;
  color: #333;
}
.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.ai-content h2 {
  font-size: 18px;
  margin: 0;
}
.copy-btn {
  padding: 4px 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  color: #555;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
  flex-shrink: 0;
}
.copy-btn:hover {
  background: #f0f0f0;
}
.ai-content h3 {
  font-size: 15px;
  margin: 16px 0 8px;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 4px;
}
.ai-content h4 {
  font-size: 14px;
  margin: 10px 0 4px;
  color: #555;
}
.ai-content p {
  margin: 6px 0;
}
.region-block {
  margin-bottom: 12px;
}
.line-block {
  margin: 4px 0 4px 12px;
  font-size: 12px;
}
.line-stations {
  display: block;
  margin-left: 12px;
  color: #666;
  word-break: break-all;
}
.ai-content ul {
  margin: 4px 0;
  padding-left: 20px;
  columns: 2;
  column-gap: 24px;
}
.ai-content li {
  font-size: 12px;
  margin-bottom: 2px;
  break-inside: avoid;
  list-style: disc;
}
</style>
