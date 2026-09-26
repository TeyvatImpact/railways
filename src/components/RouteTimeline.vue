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
          <span class="ml-2">时间 {{ result.totalTime }} 分钟</span>
          <span class="ml-2">距离 {{ result.totalDistance }} 千米</span>
        </div>
      </div>
    </div>

    <div class="mt-2 py-2 h-full overflow-y-auto">
      <div v-for="(block, i) in blocks" :key="i" class="flex">
        <div class="w-12 shrink-0 flex flex-col items-center">
          <template v-if="block.type === 'station'">
            <div
              v-if="block.lineInColor"
              class="flex-1 w-1 min-h-2"
              :style="{ background: block.lineInColor }" />
            <div v-else class="flex-1" />
            <div
              class="w-4 h-4 rounded-full shrink-0 z-10 bg-white"
              :style="{
                border: `4px solid ${block.lineOutColor || block.lineInColor || '#999'}`,
              }" />
            <div
              v-if="block.lineOutColor"
              class="flex-1 w-1 min-h-2"
              :style="{ background: block.lineOutColor }" />
            <div v-else class="flex-1" />
          </template>
          <template v-if="block.type === 'process'">
            <div class="flex-1 w-1" :style="{ background: block.lineColor }" />
          </template>
        </div>

        <!-- Content -->
        <div class="flex-1 pr-1 min-w-0 py-1">
          <template v-if="block.type === 'station'">
            <div class="text-base font-bold leading-tight">
              {{ block.stationName }}
            </div>
            <div class="text-xs mt-0.5 font-en">
              {{ block.stationNameEn }}
            </div>
          </template>
          <template v-if="block.type === 'process'">
            <div class="text-sm mb-2">
              <span class="font-semibold">
                {{ block.lineName
                }}<span v-if="block.variantName">（{{ block.variantName }}）</span>
                <span v-if="block.isFerry" class="text-xs font-normal">(轮渡)</span>
              </span>
              <br />
              <span v-if="!block.isSameStation" class="text-xs truncate"
                >{{ block.direction }} 方向</span
              >
              <span class="text-xs ml-2"
                >({{ block.fare }} 摩拉 {{ block.time }} 分钟 {{ block.distance }} 千米)</span
              >
            </div>
            <div v-if="block.intermediates.length > 0" class="space-y-1">
              <div v-for="n in block.intermediates" :key="n.stationName" class="leading-tight">
                <div class="text-xs">{{ n.stationName }}</div>
                <div class="text-xs font-en">{{ n.stationNameEn }}</div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { lineColorMap } from '../composables/useMapData';
import type { RouteResult } from '../composables/useRouting';

const props = defineProps<{
  result: RouteResult;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

interface StationBlock {
  type: 'station';
  stationName: string;
  stationNameEn: string;
  isStart: boolean;
  isEnd: boolean;
  lineInColor: string | null;
  lineOutColor: string | null;
}

interface ProcessBlock {
  type: 'process';
  lineName: string;
  lineNameEn: string;
  variantName: string;
  isFerry: boolean;
  isSameStation: boolean;
  direction: string;
  intermediates: { stationName: string; stationNameEn: string }[];
  lineColor: string;
  fare: number;
  time: number;
  distance: number;
}

type Block = StationBlock | ProcessBlock;

function getLineColor(lineId: string): string {
  return lineColorMap.get(lineId) ?? '#999';
}

const blocks = computed<Block[]>(() => {
  const segs = props.result.segments;
  const result: Block[] = [];

  function lastBlock() {
    return result[result.length - 1];
  }

  function isLastStation(name: string): boolean {
    const lb = lastBlock();
    return lb?.type === 'station' && (lb as StationBlock).stationName === name;
  }

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const color = getLineColor(seg.lineId);

    if (i === 0) {
      result.push({
        type: 'station',
        stationName: seg.nodes[0].stationName,
        stationNameEn: seg.nodes[0].stationNameEn,
        isStart: true,
        isEnd: false,
        lineInColor: null,
        lineOutColor: color,
      });
    } else {
      const prevColor = getLineColor(segs[i - 1].lineId);
      if (!isLastStation(seg.nodes[0].stationName)) {
        result.push({
          type: 'station',
          stationName: seg.nodes[0].stationName,
          stationNameEn: seg.nodes[0].stationNameEn,
          isStart: false,
          isEnd: false,
          lineInColor: prevColor,
          lineOutColor: color,
        });
      } else {
        (lastBlock() as StationBlock).lineOutColor = color;
      }
    }

    if (seg.nodes.length > 1) {
      result.push({
        type: 'process',
        lineName: seg.lineName,
        lineNameEn: seg.lineNameEn,
        variantName: seg.variantName,
        isFerry: seg.isFerry,
        isSameStation: seg.isSameStation,
        direction: seg.nodes[seg.nodes.length - 1].stationName,
        intermediates: seg.nodes.slice(1, -1).map((n) => ({
          stationName: n.stationName,
          stationNameEn: n.stationNameEn,
        })),
        lineColor: color,
        fare: seg.fare,
        time: seg.time,
        distance: seg.distance,
      });
    }
  }

  const segLast = segs[segs.length - 1];
  const lastNode = segLast.nodes[segLast.nodes.length - 1];
  if (!isLastStation(lastNode.stationName)) {
    result.push({
      type: 'station',
      stationName: lastNode.stationName,
      stationNameEn: lastNode.stationNameEn,
      isStart: false,
      isEnd: true,
      lineInColor: getLineColor(segLast.lineId),
      lineOutColor: null,
    });
  } else {
    (lastBlock() as StationBlock).isEnd = true;
    (lastBlock() as StationBlock).lineInColor = getLineColor(segLast.lineId);
    (lastBlock() as StationBlock).lineOutColor = null;
  }

  return result;
});

const startName = computed(() => {
  const b = blocks.value[0];
  return b.type === 'station' ? b.stationName : '';
});

const endName = computed(() => {
  const b = blocks.value[blocks.value.length - 1];
  return b.type === 'station' ? b.stationName : '';
});

const firstSeg = computed(() => props.result.segments[0]);
const firstLineColor = computed(() => getLineColor(firstSeg.value.lineId));

const lastSeg = computed(() => props.result.segments[props.result.segments.length - 1]);
const lastLineColor = computed(() => getLineColor(lastSeg.value.lineId));
</script>
