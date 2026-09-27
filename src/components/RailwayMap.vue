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
          v-for="p in areaBorderPaths"
          :key="p.id"
          :d="p.d"
          :stroke="AREA_BORDER_COLOR"
          :stroke-width="AREA_BORDER_WIDTH"
          :stroke-dasharray="AREA_BORDER_DASH || undefined"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
          pointer-events="none" />

        <path
          v-for="p in nationBorderPaths"
          :key="p.id"
          :d="p.d"
          :stroke="NATION_BORDER_COLOR"
          :stroke-width="NATION_BORDER_WIDTH"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
          pointer-events="none" />

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

        <!-- 列车：线路之上、站点之下；停站的列车另在站名标签上方画一排圆点 -->
        <g v-for="dot in trainDots" :key="dot.key" :opacity="trainOpacity(dot.lineId)">
          <circle
            :cx="dot.x"
            :cy="dot.y"
            :r="TRAIN_DOT_R"
            :fill="dot.color"
            stroke="var(--color-text)"
            :stroke-width="TRAIN_DOT_STROKE"
            style="cursor: pointer"
            @click.stop="onTrainClick(dot.trainId)" />
          <text
            :x="dot.x + TRAIN_DOT_R + TRAIN_NUMBER_GAP"
            :y="dot.y - TRAIN_DOT_R - TRAIN_NUMBER_GAP"
            :font-size="TRAIN_NUMBER_FONT_SIZE"
            :font-family="FONT_EN"
            fill="var(--color-text)"
            dominant-baseline="central"
            style="cursor: pointer"
            @click.stop="onTrainClick(dot.trainId)">
            {{ dot.number }}
          </text>
        </g>

        <g v-for="dot in trainLabelDots" :key="dot.key" :opacity="trainOpacity(dot.lineId)">
          <circle
            :cx="dot.x"
            :cy="dot.y"
            :r="TRAIN_LABEL_DOT_R"
            :fill="dot.color"
            stroke="var(--color-text)"
            :stroke-width="TRAIN_DOT_STROKE"
            style="cursor: pointer"
            @click.stop="onTrainClick(dot.trainId)" />
        </g>

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
            :r="stationRadius(station.id)"
            :stroke-width="selectedStationId === station.id ? 3 : 2"
            fill="var(--color-body)"
            stroke="var(--color-text)"
            style="cursor: pointer"
            @click.stop="onStationClick(station.id)" />
        </g>

        <g v-for="lb in labelBoxes" :key="lb.id" :opacity="stationOpacity(lb.id)">
          <text
            v-for="ln in lb.lines"
            :key="ln.key"
            :x="ln.x"
            :y="ln.y"
            :fill="
              ln.kind === 'name'
                ? 'var(--color-text, #333)'
                : 'var(--color-on-surface-variant, #555)'
            "
            font-weight="bold"
            :font-size="ln.kind === 'name' ? lb.fCN : lb.fEN"
            :font-family="
              ln.kind === 'name'
                ? lb.fontFamily
                : ln.kind === 'zh'
                  ? lb.fontFamilyZh
                  : lb.fontFamilyEn
            ">
            {{ ln.text }}
          </text>
        </g>

        <g v-for="lb in lineLabels" :key="lb.id" :opacity="lineLabelOpacity(lb.id)">
          <rect :x="lb.left" :y="lb.top" :width="4" :height="lb.h" :fill="lb.color" rx="2" />
          <text
            v-for="ln in lb.lines"
            :key="ln.key"
            :x="ln.x"
            :y="ln.y"
            :fill="
              ln.kind === 'name'
                ? 'var(--color-text, #333)'
                : 'var(--color-on-surface-variant, #555)'
            "
            font-weight="bold"
            :font-size="ln.kind === 'name' ? lb.fCN : lb.fEN"
            :font-family="
              ln.kind === 'name'
                ? lb.fontFamily
                : ln.kind === 'zh'
                  ? lb.fontFamilyZh
                  : lb.fontFamilyEn
            ">
            {{ ln.text }}
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
          :fill="markerFill(mt)"
          :font-family="mt.fontFamily">
          {{ mt.text }}
        </text>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  AREA_BORDER_COLOR,
  AREA_BORDER_DASH,
  AREA_BORDER_WIDTH,
  BLOCK_SIZE,
  MARKER_EMPHASIS_FILL,
  MARKER_EMPHASIS_FILL_DARK,
  MARKER_TEXT_FILL,
  FERRY_COLOR_HIGHLIGHT,
  NATION_BORDER_COLOR,
  NATION_BORDER_WIDTH,
  TRAIN_DOT_R,
  TRAIN_DOT_STROKE,
  TRAIN_LABEL_DOT_GAP,
  TRAIN_LABEL_DOT_R,
  TRAIN_LABEL_DOT_SPACING,
  TRAIN_NUMBER_FONT_SIZE,
  TRAIN_NUMBER_GAP,
} from '../config/render.config';
import { buildBorderPaths } from '../composables/useTerritoryBorders';
import { useBorderSmoothing } from '../composables/useBorderSmoothing';
import { useTheme } from '../composables/useTheme';
import {
  svgWidth,
  svgHeight,
  stations,
  transferStationIds,
  renderSegments,
  pairSegmentIds,
  segmentPolyline,
  type RenderSegment,
  markerPaths,
  markerTexts,
  minX,
  minY,
  stationLineMap,
} from '../composables/useMapData';
import { useMapInteraction } from '../composables/useMapInteraction';
import { formatDurationShort } from '../composables/formatTime';
import { FONT_EN, useLabelPlacement } from '../composables/useLabelPlacement';
import { useRenderMode } from '../composables/useRenderMode';
import { buildCurveSegments, type CurveSegment } from '../composables/useCurveGeometry';
import MapControls from './MapControls.vue';
import type { RouteResult } from '../composables/useRouting';
import { selectTarget } from '../composables/useRouting';
import {
  clearSelection,
  selectLine,
  selectStation,
  selectTrain,
  selection,
} from '../composables/useSelection';
import { useSimClock } from '../composables/useSimClock';
import {
  activeTrainsAt,
  pointAlong,
  stopPoint,
  trainById,
  type ActiveTrain,
} from '../composables/trainRuns';

const props = defineProps<{
  routeResult: RouteResult | null;
}>();

const { theme } = useTheme();

/**
 * 地图标注文字的颜色：其余文字都走 Varlet 的主题变量，只有标注是配置里的固定色 —— 浅色的重点色
 * （`MARKER_EMPHASIS_FILL`）贴在深色底上看不见，深色模式下换成 `MARKER_EMPHASIS_FILL_DARK`。
 */
function markerFill(line: (typeof markerTexts)[number]): string {
  if (!line.emphasis) return MARKER_TEXT_FILL;
  return theme.value === 'dark' ? MARKER_EMPHASIS_FILL_DARK : MARKER_EMPHASIS_FILL;
}

const emit = defineEmits<{
  (e: 'station-click', stationId: string): void;
}>();

const { renderMode } = useRenderMode();
const { borderSmoothing } = useBorderSmoothing();

/** 归属边界的两层 path：换平滑方式只重拼字符串，几何不变 */
const nationBorderPaths = computed(() => buildBorderPaths('nation', borderSmoothing.value));
const areaBorderPaths = computed(() => buildBorderPaths('area', borderSmoothing.value));

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

// --- 高亮：唯一来源是 useSelection 的选中项 —— 选中线路 = 该线；选中站点 = 服务它的线路；选中列车 = 它跑的那条线 ---
const highlightedLineIds = computed(() => {
  const sel = selection.value;
  if (!sel) return new Set<string>();
  if (sel.kind === 'line') return new Set([sel.id]);
  if (sel.kind === 'train') {
    const run = trainById(sel.id);
    return new Set(run ? [run.line.id] : []);
  }
  return new Set((stationLineMap.get(sel.id) ?? []).map((line) => line.id));
});

const selectedStationId = computed(() =>
  selection.value?.kind === 'station' ? selection.value.id : null,
);

const DRAG_THRESHOLD = 5;
const mouseDownPos = { x: 0, y: 0 };

function onSvgMouseDown(e: MouseEvent) {
  mouseDownPos.x = e.clientX;
  mouseDownPos.y = e.clientY;
  onMouseDown(e);
}

/** 点线路 = 选中线路（选站点做起点 / 终点时不抢这个点击） */
function onSegmentClick(lineId: string) {
  if (selectTarget.value) return;
  selectLine(lineId);
}

function onBackgroundClick(e: MouseEvent) {
  const dx = e.clientX - mouseDownPos.x;
  const dy = e.clientY - mouseDownPos.y;
  if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) return;
  clearSelection();
}

function isHighlightActive() {
  return highlightedLineIds.value.size > 0;
}

watch(
  () => props.routeResult,
  (val) => {
    if (val) clearSelection();
  },
);

function stationOpacity(id: string): number {
  if (props.routeResult) {
    return !routeStationIds.value.size || routeStationIds.value.has(id) ? 1 : DIM_OPACITY;
  }
  if (isHighlightActive()) {
    return stationLineMap.get(id)?.some((line) => highlightedLineIds.value.has(line.id))
      ? 1
      : DIM_OPACITY;
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
    const text = `${seg.fare}mora ${formatDurationShort(seg.time)} ${seg.distance}km`;
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

/** 点站点：选起点 / 终点模式下交给面板，否则直接选中该站（信息面板与高亮统一走 useSelection） */
function onStationClick(stationId: string) {
  if (selectTarget.value) {
    emit('station-click', stationId);
    return;
  }
  selectStation(stationId);
}

/** 选中站点的圆圈略大一点，作为「当前选中的站」的标记 */
function stationRadius(id: string): number {
  if (selectedStationId.value === id) return 9;
  return transferStationIds.has(id) ? 7 : 5;
}

// --- 列车：按模拟时钟沿线路移动的圆点；停站的列车另在站名标签上方画一排圆点 ---
const { minutesOfDay } = useSimClock();

interface TrainDot {
  key: string;
  trainId: string;
  lineId: string;
  color: string;
  /** 车次号（画在圆点右上角） */
  number: string;
  x: number;
  y: number;
}

const trains = computed(() => activeTrainsAt(minutesOfDay.value));

/** 线上圆点：区间中按弧长比例取点，停站取该站停靠点 */
const trainDots = computed<TrainDot[]>(() => {
  const out: TrainDot[] = [];
  for (const train of trains.value) {
    const stops = train.run.stops;
    let point: { x: number; y: number } | null;
    if (train.phase.kind === 'dwell') {
      point = stopPoint(train.run.line.id, stops, train.phase.index);
    } else {
      const polyline = segmentPolyline(
        train.run.line.id,
        stops[train.phase.index].stationId,
        stops[train.phase.index + 1].stationId,
      );
      point = polyline ? pointAlong(polyline, train.phase.t) : null;
    }
    if (!point) continue;
    out.push({
      key: train.run.id,
      trainId: train.run.id,
      lineId: train.run.line.id,
      color: train.run.line.color,
      number: train.run.number,
      ...point,
    });
  }
  return out;
});

/** 站名标签上方的停站圆点：同一站多辆车横向排开，居中于标签盒顶边之上 */
const trainLabelDots = computed<TrainDot[]>(() => {
  const boxes = new Map(labelBoxes.value.map((box) => [box.id, box]));
  const byStation = new Map<string, ActiveTrain[]>();
  for (const train of trains.value) {
    if (train.phase.kind !== 'dwell') continue;
    const stationId = train.run.stops[train.phase.index].stationId;
    const list = byStation.get(stationId);
    if (list) list.push(train);
    else byStation.set(stationId, [train]);
  }
  const out: TrainDot[] = [];
  for (const [stationId, list] of byStation) {
    const box = boxes.get(stationId);
    if (!box) continue;
    const step = TRAIN_LABEL_DOT_R * 2 + TRAIN_LABEL_DOT_SPACING;
    const x0 = box.left + box.w / 2 - ((list.length - 1) * step) / 2;
    const y = box.top - TRAIN_LABEL_DOT_GAP - TRAIN_LABEL_DOT_R;
    list.forEach((train, i) => {
      out.push({
        key: `label-${train.run.id}`,
        trainId: train.run.id,
        lineId: train.run.line.id,
        color: train.run.line.color,
        number: train.run.number,
        x: x0 + i * step,
        y,
      });
    });
  }
  return out;
});

/** 列车跟随所在线路的明暗：导航结果 / 高亮里有该线才亮 */
function trainOpacity(lineId: string): number {
  if (props.routeResult) return routeLineIds.value.has(lineId) ? 1 : DIM_OPACITY;
  if (isHighlightActive()) return highlightedLineIds.value.has(lineId) ? 1 : DIM_OPACITY;
  return 1;
}

/** 点列车 = 选中列车（选起点 / 终点模式下不抢这个点击，与线段一致） */
function onTrainClick(trainId: string) {
  if (selectTarget.value) return;
  selectTrain(trainId);
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
