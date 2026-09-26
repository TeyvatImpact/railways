<script setup lang="ts">
import { computed } from 'vue';
import teyvatData from '../../data/teyvat.json';
import liyueData from '../../data/liyue.json';
import inazumaData from '../../data/inazuma.json';
import snezhnayaData from '../../data/snezhnaya.json';
import ferryData from '../../data/ferry.json';
import sameData from '../../data/same.json';
import { palette } from '../../config/render.config';

interface Station {
  id: string;
  nameCn: string;
  nameZh?: string;
  nameEn: string;
}

interface LineStation {
  id: string;
  nameCn: string;
  nameEn: string;
}

interface DisplayLine {
  id: string;
  name: string;
  nameEn: string;
  stations: LineStation[];
  color: string;
}

const PANEL_WIDTH = 1920;
const PANEL_HEIGHT = 200;
const STATION_RADIUS = 6;
const LINE_Y = 120;
const LABEL_ANGLE = -35;

const stationMap = new Map<string, Station>();

for (const s of teyvatData.stations) {
  stationMap.set(s.id, s);
}
for (const s of liyueData.stations) {
  stationMap.set(s.id, s);
}
for (const s of inazumaData.stations) {
  stationMap.set(s.id, s);
}
for (const s of snezhnayaData.stations) {
  stationMap.set(s.id, s);
}

function getStation(id: string): { nameCn: string; nameEn: string } {
  const prefixes = ['Teyvat-', 'Liyue-', 'Inazuma-', 'Snezhnaya-'];
  for (const prefix of prefixes) {
    if (id.startsWith(prefix)) {
      const shortId = id.slice(prefix.length);
      const s = stationMap.get(shortId);
      if (s) return { nameCn: s.nameCn, nameEn: s.nameEn };
    }
  }
  const s = stationMap.get(id);
  if (s) return { nameCn: s.nameCn, nameEn: s.nameEn };
  return { nameCn: id, nameEn: id };
}

const lines = computed<DisplayLine[]>(() => {
  const result: DisplayLine[] = [];
  const allRegionData = [
    { data: teyvatData, prefix: 'Teyvat-' },
    { data: liyueData, prefix: 'Liyue-' },
    { data: inazumaData, prefix: 'Inazuma-' },
    { data: snezhnayaData, prefix: 'Snezhnaya-' },
  ];

  let colorIndex = 0;
  for (const { data, prefix } of allRegionData) {
    for (const line of data.lines) {
      const stations: LineStation[] = line.stations.map((sid: string) => {
        // Cross-region references are written with their full id (e.g. `Teyvat-STR`) and must not be re-prefixed.
        const fullId = sid.includes('-') ? sid : prefix + sid;
        const info = getStation(fullId);
        return { id: fullId, ...info };
      });
      result.push({
        id: prefix + line.id,
        name: line.name,
        nameEn: line.nameEn,
        stations,
        color: palette[colorIndex % palette.length],
      });
      colorIndex++;
    }
  }

  for (const line of ferryData.lines) {
    const stations: LineStation[] = line.stations.map((sid: string) => {
      const info = getStation(sid);
      return { id: sid, ...info };
    });
    result.push({
      id: line.id,
      name: line.name,
      nameEn: line.nameEn,
      stations,
      color: palette[colorIndex % palette.length],
    });
    colorIndex++;
  }

  for (const line of sameData.lines) {
    const stations: LineStation[] = line.stations.map((sid: string) => {
      const info = getStation(sid);
      return { id: sid, ...info };
    });
    result.push({
      id: line.id,
      name: line.name,
      nameEn: line.nameEn,
      stations,
      color: palette[colorIndex % palette.length],
    });
    colorIndex++;
  }

  return result;
});

function calcSpacing(stationCount: number): number {
  const MARGIN = 40;
  const available = PANEL_WIDTH - MARGIN * 2;
  if (stationCount <= 1) return available;
  return available / (stationCount - 1);
}
</script>

<template>
  <div class="bg-white min-h-screen p-4 flex flex-col items-center gap-6">
    <div
      v-for="line in lines"
      :key="line.id"
      class="rounded-xl overflow-hidden shadow-2xl border border-gray-700/50"
      :style="{
        width: PANEL_WIDTH + 'px',
        height: PANEL_HEIGHT + 'px',
      }">
      <svg
        :width="PANEL_WIDTH"
        :height="PANEL_HEIGHT"
        :viewBox="`0 0 ${PANEL_WIDTH} ${PANEL_HEIGHT}`"
        xmlns="http://www.w3.org/2000/svg"
        style="display: block">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="100%" height="100%" fill="transparent" />

        <text x="20" y="30" fill="#000" font-size="14" font-weight="bold" font-family="sans-serif">
          {{ line.name }}
        </text>
        <text x="20" y="48" fill="#aaaaaa" font-size="10" font-family="sans-serif">
          {{ line.nameEn }}
        </text>

        <line
          x1="40"
          :y1="LINE_Y"
          :x2="PANEL_WIDTH - 40"
          :y2="LINE_Y"
          :stroke="line.color"
          stroke-width="4"
          stroke-linecap="round" />

        <template v-for="(station, idx) in line.stations" :key="station.id">
          <circle
            :cx="40 + idx * calcSpacing(line.stations.length)"
            :cy="LINE_Y"
            :r="STATION_RADIUS"
            :fill="line.color"
            stroke="#000"
            stroke-width="2"
            filter="url(#glow)" />

          <text
            :x="40 + idx * calcSpacing(line.stations.length)"
            :y="LINE_Y - STATION_RADIUS - 4"
            :transform="`rotate(${LABEL_ANGLE}, ${40 + idx * calcSpacing(line.stations.length)}, ${LINE_Y - STATION_RADIUS - 4})`"
            fill="#000"
            font-size="10"
            font-family="sans-serif"
            text-anchor="end"
            dominant-baseline="auto">
            {{ station.nameCn }}
          </text>
        </template>
      </svg>
    </div>
  </div>
</template>
