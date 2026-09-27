<template>
  <div class="flex flex-col">
    <!-- Header -->
    <div class="flex flex-col items-start justify-between gap-4">
      <var-button @click="$emit('close')"> 返回 </var-button>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 text-sm mb-1.5">
          <span class="font-semibold border-b-2" :style="{ borderColor: firstLineColor }">{{
            startName
          }}</span>
          <span class="mx-1">→</span>
          <span class="font-semibold border-b-2" :style="{ borderColor: lastLineColor }">{{
            endName
          }}</span>
        </div>
        <div class="text-xs">
          <span v-if="result.segments.length === 1">直达</span>
          <span v-else>{{ result.segments.length }} 段换乘</span>
          <span class="ml-2">票价 {{ result.totalFare }} 摩拉</span>
          <span class="ml-2">时间 {{ formatDuration(result.totalTime) }}</span>
          <span class="ml-2">距离 {{ result.totalDistance }} 千米</span>
        </div>
      </div>
    </div>

    <div class="mt-2 py-2">
      <TransitTimeline
        :items="items"
        metrics-placement="leg"
        clickable-stations
        @station-click="selectStation" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { lineColorMap } from '../composables/useMapData';
import { formatDuration } from '../composables/formatTime';
import { segmentLineName, type RouteResult } from '../composables/useRouting';
import { selectStation } from '../composables/useSelection';
import TransitTimeline, { type TimelineItem } from './TransitTimeline.vue';

const props = defineProps<{
  result: RouteResult;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

function getLineColor(lineId: string): string {
  return lineColorMap.get(lineId) ?? '#999';
}

/**
 * 路径结果 → 时间线：每到一站插一个站点行，每个乘车段前面插一个区间行（线路名 + 方向 + 费用 + 途经站）。
 * 上车站与上一段的到达站同名时沿用同一个站点行（同站换乘只是换色，不再插一行）。
 */
const items = computed<TimelineItem[]>(() => {
  const segs = props.result.segments;
  const out: TimelineItem[] = [];

  const lastStop = (): Extract<TimelineItem, { kind: 'stop' }> | undefined => {
    const last = out[out.length - 1];
    return last?.kind === 'stop' ? last : undefined;
  };

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const color = getLineColor(seg.lineId);
    const first = seg.nodes[0];
    const stop = lastStop();

    if (stop && stop.name === first.stationName) {
      stop.outColor = color;
    } else {
      out.push({
        kind: 'stop',
        id: first.stationId,
        name: first.stationName,
        nameEn: first.stationNameEn,
        inColor: i === 0 ? null : getLineColor(segs[i - 1].lineId),
        outColor: color,
      });
    }

    if (seg.nodes.length > 1) {
      const last = seg.nodes[seg.nodes.length - 1];
      // 同站换乘不产生位移，0 费用也就不用显示
      const showCost = !seg.isSameStation && !(seg.fare === 0 && seg.distance === 0);
      out.push({
        kind: 'leg',
        color,
        title: segmentLineName(seg.lineName, seg.variantName),
        note: seg.isFerry ? '轮渡' : undefined,
        detail: seg.isSameStation ? undefined : `${last.stationName} 方向`,
        metrics: showCost
          ? `(${seg.fare} 摩拉 ${formatDuration(seg.time)} ${seg.distance} 千米)`
          : undefined,
        stops: seg.nodes.slice(1, -1).map((n) => ({
          name: n.stationName,
          nameEn: n.stationNameEn,
        })),
      });
    }
  }

  const segLast = segs[segs.length - 1];
  const nodes = segLast.nodes;
  const lastNode = nodes[nodes.length - 1];
  const stop = lastStop();
  if (stop && stop.name === lastNode.stationName) {
    stop.outColor = null;
  } else {
    out.push({
      kind: 'stop',
      id: lastNode.stationId,
      name: lastNode.stationName,
      nameEn: lastNode.stationNameEn,
      inColor: getLineColor(segLast.lineId),
      outColor: null,
    });
  }

  return out;
});

const startName = computed(() => props.result.segments[0].nodes[0].stationName);
const endName = computed(() => {
  const segs = props.result.segments;
  const nodes = segs[segs.length - 1].nodes;
  return nodes[nodes.length - 1].stationName;
});

const firstLineColor = computed(() => getLineColor(props.result.segments[0].lineId));
const lastLineColor = computed(() => {
  const segs = props.result.segments;
  return getLineColor(segs[segs.length - 1].lineId);
});
</script>
