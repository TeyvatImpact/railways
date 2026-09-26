<template>
  <div ref="container" class="map-container" @wheel.prevent="onWheel">
    <MapControls :mouse-coord="mouseCoord" :scale="scale" @update:scale="onZoomBtn" />
    <svg
      ref="svgEl"
      :width="svgWidth"
      :height="svgHeight"
      :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
      font-family="sans-serif"
      font-size="12"
      @mousedown.prevent="onSvgMouseDown"
      @mousemove="onSvgMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onSvgMouseLeave"
      style="cursor: grab; user-select: none">
      <rect
        width="100%"
        height="100%"
        fill="var(--color-body, #f8f9fa)"
        @click="onBackgroundClick" />

      <g :transform="`translate(${panX}, ${panY}) scale(${scale})`">
        <g v-for="(gx, i) in gridX" :key="'gx' + i">
          <line
            :x1="gx"
            y1="0"
            :x2="gx"
            :y2="svgHeight"
            stroke="var(--color-outline, #e0e0e0)"
            stroke-width="0.5" />
        </g>
        <g v-for="(gy, i) in gridY" :key="'gy' + i">
          <line
            x1="0"
            :y1="gy"
            :x2="svgWidth"
            :y2="gy"
            stroke="var(--color-outline, #e0e0e0)"
            stroke-width="0.5" />
        </g>

        <path
          v-for="(seg, i) in renderSegments"
          :key="i"
          :d="segPath(seg, i)"
          :stroke="segStroke(seg)"
          :stroke-width="seg.width"
          :stroke-dasharray="seg.dasharray ?? undefined"
          :opacity="segOpacity(seg)"
          fill="none"
          stroke-linecap="round"
          style="cursor: pointer"
          @click.stop="onSegmentClick(seg.lineId)" />

        <g
          v-for="lb in segLabels"
          :key="lb.key"
          :transform="`translate(${lb.x}, ${lb.y})${lb.angle ? ` rotate(${lb.angle})` : ''}`"
          fill="var(--color-text-disabled, #999)"
          :font-size="lb.fontSize"
          text-anchor="middle"
          dominant-baseline="central"
          opacity="0.45"
          font-family="sans-serif">
          <text x="0" y="0">{{ lb.text }}</text>
        </g>

        <line
          v-for="ll in leaderLines"
          :key="ll.id"
          :x1="ll.x1"
          :y1="ll.y1"
          :x2="ll.x2"
          :y2="ll.y2"
          stroke="var(--color-outline, #999)"
          stroke-width="1"
          stroke-dasharray="4,3" />

        <line
          v-for="ll in lineLeaderLines"
          :key="ll.id"
          :x1="ll.x1"
          :y1="ll.y1"
          :x2="ll.x2"
          :y2="ll.y2"
          stroke="var(--color-outline, #999)"
          stroke-width="1"
          stroke-dasharray="4,3" />

        <g
          v-for="station in visibleStations"
          :key="station.id"
          :opacity="stationOpacity(station.id)">
          <circle
            :cx="station.cx"
            :cy="station.cy"
            :r="transferStationIds.has(station.id) ? 7 : 5"
            fill="var(--color-body)"
            stroke="var(--color-text)"
            stroke-width="2"
            style="cursor: pointer"
            @click.stop="onStationClick(station.id)" />
        </g>

        <g v-for="lb in labelBoxes" :key="lb.id" :opacity="stationOpacity(lb.id)">
          <text
            :x="lb.cnX"
            :y="lb.top + lb.fCN * 1.1"
            fill="var(--color-text, #333)"
            font-weight="bold"
            :font-size="lb.fCN"
            :font-family="lb.fontFamily">
            {{ lb.name }}
          </text>
          <text
            v-if="lb.nameZh"
            :x="lb.zhX"
            :y="lb.top + lb.fCN * 1.2 + textGap + lb.fEN * 1.1"
            fill="var(--color-on-surface-variant, #555)"
            font-weight="bold"
            :font-size="lb.fEN"
            :font-family="lb.fontFamilyZh">
            {{ lb.nameZh }}
          </text>
          <text
            :x="lb.enX"
            :y="lb.top + lb.h - pad"
            fill="var(--color-on-surface-variant, #555)"
            font-weight="bold"
            :font-size="lb.fEN"
            :font-family="lb.fontFamilyEn">
            {{ lb.nameEn }}
          </text>
        </g>

        <g v-for="lb in lineLabels" :key="lb.id" :opacity="lineLabelOpacity(lb.id)">
          <rect :x="lb.left" :y="lb.top" :width="4" :height="lb.h" :fill="lb.color" rx="2" />
          <text
            :x="lb.cnX"
            :y="lb.top + lb.fCN * 1.1"
            fill="var(--color-text, #333)"
            font-weight="bold"
            :font-size="lb.fCN"
            :font-family="lb.fontFamily">
            {{ lb.name }}
          </text>
          <text
            v-if="lb.nameZh"
            :x="lb.zhX"
            :y="lb.top + lb.fCN * 1.2 + textGap + lb.fEN * 1.1"
            fill="var(--color-on-surface-variant, #555)"
            font-weight="bold"
            :font-size="lb.fEN"
            :font-family="lb.fontFamilyZh">
            {{ lb.nameZh }}
          </text>
          <text
            :x="lb.enX"
            :y="lb.top + lb.h - pad"
            fill="var(--color-on-surface-variant, #555)"
            font-weight="bold"
            :font-size="lb.fEN"
            :font-family="lb.fontFamilyEn">
            {{ lb.nameEn }}
          </text>
        </g>

        <path
          v-for="mp in markerPaths"
          :key="mp.id"
          :d="mp.d"
          :stroke="mp.stroke"
          :stroke-width="mp.strokeWidth"
          :fill="mp.fill"
          stroke-linecap="round"
          stroke-linejoin="round" />
        <text
          v-for="mt in markerTexts"
          :key="mt.id"
          :x="mt.x"
          :y="mt.y"
          :font-size="mt.fontSize"
          :fill="mt.fill"
          :font-family="mt.fontFamily">
          {{ mt.content }}
        </text>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { BLOCK_SIZE, pad, textGap, FERRY_COLOR_HIGHLIGHT } from '../config/render.config';
import {
  svgWidth,
  svgHeight,
  stations,
  transferStationIds,
  renderSegments,
  pairSegmentIds,
  type RenderSegment,
  markerPaths,
  markerTexts,
  minX,
  minY,
  lines,
} from '../composables/useMapData';
import { useMapInteraction } from '../composables/useMapInteraction';
import { useLabelPlacement } from '../composables/useLabelPlacement';
import { useRenderMode } from '../composables/useRenderMode';
import { buildCurveSegments, type CurveSegment } from '../composables/useCurveGeometry';
import MapControls from './MapControls.vue';
import type { RouteResult } from '../composables/useRouting';
import { selectTarget } from '../composables/useRouting';

const props = defineProps<{
  routeResult: RouteResult | null;
}>();

const emit = defineEmits<{
  (e: 'station-click', stationId: string): void;
}>();

const { renderMode } = useRenderMode();

/** 曲线模式下每段线段对应的 path（与 renderSegments 同序）；直线模式为 null */
const curveSegments = computed<CurveSegment[] | null>(() =>
  renderMode.value === 'curve' ? buildCurveSegments(renderSegments) : null,
);

function segPath(seg: RenderSegment, index: number): string {
  const curve = curveSegments.value?.[index];
  return curve ? curve.d : `M ${seg.x1} ${seg.y1} L ${seg.x2} ${seg.y2}`;
}

const routeStationIds = computed(() => {
  if (!props.routeResult) return new Set<string>();
  const ids = new Set<string>();
  for (const seg of props.routeResult.segments) {
    for (const node of seg.nodes) {
      ids.add(node.stationId);
    }
  }
  return ids;
});

function addPairSegs(ids: Set<string>, lineId: string, aId: string, bId: string) {
  for (const id of pairSegmentIds.get(`${lineId}|${aId}|${bId}`) ?? []) ids.add(id);
}

const routeLineIds = computed(() => {
  if (!props.routeResult) return new Set<string>();
  return new Set(props.routeResult.segments.map((s) => s.lineId));
});

const traveledSegIds = computed(() => {
  const ids = new Set<string>();
  if (!props.routeResult) return ids;
  for (const seg of props.routeResult.segments) {
    for (let i = 0; i < seg.nodes.length - 1; i++) {
      addPairSegs(ids, seg.lineId, seg.nodes[i].stationId, seg.nodes[i + 1].stationId);
    }
  }
  return ids;
});

const sameStationSegIds = computed(() => {
  const ids = new Set<string>();
  if (!props.routeResult) return ids;
  const c2s = new Map<string, string>();
  for (const st of stations) {
    c2s.set(`${st.cx},${st.cy}`, st.id);
  }
  for (const seg of renderSegments) {
    if (!seg.lineId.startsWith('same-')) continue;
    const sa = c2s.get(`${seg.x1},${seg.y1}`);
    const sb = c2s.get(`${seg.x2},${seg.y2}`);
    if (sa && sb && routeStationIds.value.has(sa) && routeStationIds.value.has(sb)) {
      ids.add(seg.id);
    }
  }
  return ids;
});

function segOpacity(seg: { id: string; lineId: string }): number {
  if (props.routeResult) {
    return traveledSegIds.value.has(seg.id) || sameStationSegIds.value.has(seg.id)
      ? 1
      : DIM_OPACITY;
  }
  if (isHighlightActive()) {
    return highlightedLineIds.value.has(seg.lineId) ? 1 : DIM_OPACITY;
  }
  return 1;
}

function segStroke(seg: { id: string; lineId: string; color: string }): string {
  if (!props.routeResult) return seg.color;
  const isTraveled = traveledSegIds.value.has(seg.id) || sameStationSegIds.value.has(seg.id);
  if (isTraveled && seg.lineId.startsWith('ferry-')) {
    return FERRY_COLOR_HIGHLIGHT;
  }
  return seg.color;
}

const DIM_OPACITY = 0.12;

// --- highlight state ---
const highlightedLineIds = ref<Set<string>>(new Set());

const stationToLineIds = new Map<string, string[]>();
for (const line of lines) {
  for (const [sid] of line.stations) {
    let arr = stationToLineIds.get(sid);
    if (!arr) {
      arr = [];
      stationToLineIds.set(sid, arr);
    }
    arr.push(line.id);
  }
}

const DRAG_THRESHOLD = 5;
const mouseDownPos = { x: 0, y: 0 };

function onSvgMouseDown(e: MouseEvent) {
  mouseDownPos.x = e.clientX;
  mouseDownPos.y = e.clientY;
  onMouseDown(e);
}

function onSegmentClick(lineId: string) {
  highlightedLineIds.value = new Set([lineId]);
}

function onBackgroundClick(e: MouseEvent) {
  const dx = e.clientX - mouseDownPos.x;
  const dy = e.clientY - mouseDownPos.y;
  if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) return;
  highlightedLineIds.value = new Set();
}

function isHighlightActive() {
  return highlightedLineIds.value.size > 0;
}

watch(
  () => props.routeResult,
  (val) => {
    if (val) highlightedLineIds.value = new Set();
  },
);

function stationOpacity(id: string): number {
  if (props.routeResult) {
    return !routeStationIds.value.size || routeStationIds.value.has(id) ? 1 : DIM_OPACITY;
  }
  if (isHighlightActive()) {
    const lineIds = stationToLineIds.get(id);
    return lineIds && lineIds.some((lid) => highlightedLineIds.value.has(lid)) ? 1 : DIM_OPACITY;
  }
  return 1;
}

function lineLabelOpacity(id: string): number {
  if (props.routeResult) {
    if (!routeLineIds.value.size) return 1;
    const m = id.match(/^line-label-(.+?)-/);
    return m && routeLineIds.value.has(m[1]) ? 1 : DIM_OPACITY;
  }
  if (isHighlightActive()) {
    const m = id.match(/^line-label-(.+?)-/);
    return m && highlightedLineIds.value.has(m[1]) ? 1 : DIM_OPACITY;
  }
  return 1;
}

const segLabels = computed(() => {
  const result: {
    key: string;
    x: number;
    y: number;
    angle: number;
    text: string;
    fontSize: number;
  }[] = [];
  for (let i = 0; i < renderSegments.length; i++) {
    const seg = renderSegments[i];
    if (!seg.showLabel) continue;
    const key = seg.lineId + '-' + i;
    const text = `${seg.fare}mora ${seg.time}' ${seg.distance}km`;
    const fontSize = 4;
    const curve = curveSegments.value?.[i];
    if (curve?.curved) {
      let angleDeg = curve.angle;
      while (angleDeg > 90) angleDeg -= 180;
      while (angleDeg <= -90) angleDeg += 180;
      const angleRad = (angleDeg * Math.PI) / 180;
      const off = 6;
      result.push({
        key,
        x: curve.midX + Math.sin(angleRad) * off,
        y: curve.midY - Math.cos(angleRad) * off,
        angle: angleDeg,
        text,
        fontSize,
      });
      continue;
    }
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len = Math.hypot(dx, dy);
    if (!len) continue;
    const midX = (seg.x1 + seg.x2) / 2;
    const midY = (seg.y1 + seg.y2) / 2;
    const isVertical = Math.abs(dx) < Math.abs(dy);
    if (isVertical) {
      result.push({
        key,
        x: midX - 5,
        y: midY,
        angle: -90,
        text,
        fontSize,
      });
    } else {
      let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angleDeg > 90 || angleDeg < -90) {
        angleDeg += 180;
        if (angleDeg > 180) angleDeg -= 360;
      }
      const angleRad = (angleDeg * Math.PI) / 180;
      const perpX = Math.sin(angleRad);
      const perpY = -Math.cos(angleRad);
      const off = 6;
      result.push({
        key,
        x: midX + perpX * off,
        y: midY + perpY * off,
        angle: angleDeg,
        text,
        fontSize,
      });
    }
  }
  return result;
});

const mouseCoord = ref<string | null>(null);

const cx0 = (0 - minX) * BLOCK_SIZE;
const cy0 = (0 - minY) * BLOCK_SIZE;
const initPanX = svgWidth / 2 - cx0;
const initPanY = svgHeight / 2 - cy0;

const {
  container,
  svgEl,
  panX,
  panY,
  scale,
  zoomTo,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel,
} = useMapInteraction(initPanX, initPanY, 1);

const { visibleStations, labelBoxes, leaderLines, lineLabels, lineLeaderLines, gridX, gridY } =
  useLabelPlacement();

function onZoomBtn(targetScale: number) {
  const svg = svgEl.value;
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  zoomTo(targetScale, rect.width / 2 + rect.left, rect.height / 2 + rect.top);
}

function onSvgMouseMove(e: MouseEvent) {
  onMouseMove(e);
  const svg = svgEl.value;
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const svgX = (e.clientX - rect.left) * (svgWidth / rect.width);
  const svgY = (e.clientY - rect.top) * (svgHeight / rect.height);
  const dataX = (svgX - panX.value) / scale.value / BLOCK_SIZE + minX;
  const dataY = (svgY - panY.value) / scale.value / BLOCK_SIZE + minY;
  mouseCoord.value = `${dataX.toFixed(1)}, ${dataY.toFixed(1)}`;
}

function onSvgMouseLeave() {
  onMouseUp();
  mouseCoord.value = null;
}

function onStationClick(stationId: string) {
  if (!selectTarget.value) {
    const lineIds = stationToLineIds.get(stationId);
    highlightedLineIds.value = lineIds ? new Set(lineIds) : new Set();
  }
  emit('station-click', stationId);
}
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--color-body, #f0f0f0);
  touch-action: none;
}
svg {
  display: block;
}
</style>
