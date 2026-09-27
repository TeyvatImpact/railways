// 站点级时刻表派生（无 Vue 依赖，读 useMapData 的数据）：
// ①「间隔时间」= 本站各线路按时间顺序的生效间隔分段；②「时刻表发车」= 本站实际的车次到站 / 开出时刻。
import {
  expandDepartures,
  mergeIntervalSources,
  type IntervalSegment,
  type IntervalSource,
  type TimetableDeparture,
} from './timetable';
import {
  stationLineMap,
  stationMap,
  sortLinesForDisplay,
  type Line,
  type LineVariant,
} from './useMapData';
import { formatClock } from './formatTime';
import { buildTrainRun } from './trainRuns';

/** 一条线路在某个站点的间隔时间：按时间顺序、相邻同值合并的段 */
export interface StationHeadway {
  lineId: string;
  lineName: string;
  lineNameEn: string;
  color: string;
  segments: IntervalSegment[];
}

/**
 * 「间隔时间」：服务该站的线路各自按时间顺序的间隔分段。
 * 同一时刻有多个来源（该线路的多个交路、站在区间两侧的区间）时取最密的一班；
 * 一个大段被后面的段打断就拆成多段分别排出来；不开行的时段是 `Infinity`。
 * 只写间隔（`interval`）的线路才有内容 —— 用「时刻表发车」（`departures`）的线路不出现在这里。
 */
export function stationHeadways(stationId: string): StationHeadway[] {
  const out: StationHeadway[] = [];
  for (const line of sortLinesForDisplay(stationLineMap.get(stationId) ?? [])) {
    const sources: IntervalSource[] = [];
    for (const variant of line.variants) {
      const bands = variant.timetable.interval;
      if (bands === undefined) continue;
      const index = variant.stations.indexOf(stationId);
      if (index < 0) continue;
      const neighbours = new Set<string>();
      if (index > 0) neighbours.add(variant.stations[index - 1]);
      if (index < variant.stations.length - 1) neighbours.add(variant.stations[index + 1]);
      for (const other of neighbours) sources.push({ bands, segment: [stationId, other] });
    }
    if (sources.length === 0) continue;
    out.push({
      lineId: line.id,
      lineName: line.names[line.primaryLang],
      lineNameEn: line.names.en,
      color: line.color,
      segments: mergeIntervalSources(sources),
    });
  }
  return out;
}

/** 该站在某趟车上的一次停站：到站 / 开出（成对出现，起点只有开出、终点只有到站） */
export interface StationStop {
  /** 上一次停靠的站（到站时有值） */
  from?: string;
  /** 下一站（开出时有值） */
  to?: string;
  arrival?: string;
  departure?: string;
  /** 折返车次：本站是折返点，停站（`dwell`）后按反向开回 */
  turnback: boolean;
}

/** 一条线路在本站的「时刻表发车」：按时刻升序的实际停站 */
export interface StationDepartures {
  lineId: string;
  lineName: string;
  lineNameEn: string;
  color: string;
  stops: StationStop[];
}

interface RawStop {
  stationId: string;
  arrival?: number;
  departure?: number;
  from?: string;
  to?: string;
  turnback: boolean;
}

/** 站点在该线路主语言下的名字 */
function stationName(line: Line, stationId: string): string {
  return stationMap.get(stationId)?.names[line.primaryLang] ?? stationId;
}

/**
 * 环线判据：数据把闭合站写在末尾（首尾同站），扣掉重复站后还要至少剩 3 站 —— 与 `/display` 的
 * `loopStrip.isLoop` 同一口径（`A → B → A` 这种往返不是环线）。
 */
function isLoopStations(stations: string[]): boolean {
  return stations.length > 3 && stations[0] === stations[stations.length - 1];
}

/**
 * 把一条发车记录铺成一趟车的全部停站（站名形态，供「本站时刻表」列表用）——
 * 时刻推算复用 `trainRuns.buildTrainRun`（地图上的列车走同一份实现）。
 *
 * 地图上环线末尾的闭合站要收尾（列车开回枢纽站、停站），但本站列表里不重复出现同一个站的到站行，
 * 所以这里把闭合站那一行丢掉 —— 与旧实现逐字一致。
 */
function buildRun(
  line: Line,
  variant: LineVariant,
  dep: TimetableDeparture,
  index: number,
): RawStop[] {
  const run = buildTrainRun(line, variant, dep, index);
  if (!run) return [];
  const full = run.stops;
  const rows = full.map((stop, i) => ({
    stationId: stop.stationId,
    ...(stop.arrival === undefined ? {} : { arrival: stop.arrival }),
    ...(stop.departure === undefined ? {} : { departure: stop.departure }),
    ...(i > 0 ? { from: stationName(line, full[i - 1].stationId) } : {}),
    // 折返点不写「开往」：它在列表里的走向是「来自 X」，写上下一个站会变成「X → X」
    ...(i < full.length - 1 && !stop.turnback
      ? { to: stationName(line, full[i + 1].stationId) }
      : {}),
    turnback: stop.turnback,
  }));
  const loop = isLoopStations(variant.stations);
  return loop && !dep.turnback ? rows.slice(0, -1) : rows;
}

/**
 * 「时刻表发车」：本站各线路的实际车次停站（由 `departures` 展开，沿站序加上区间耗时与停站时间推出）。
 * 只有写 `departures` 的线路（至冬）有内容；只写间隔的线路不出现在这里。
 */
export function stationDepartures(stationId: string): StationDepartures[] {
  const out: StationDepartures[] = [];
  for (const line of sortLinesForDisplay(stationLineMap.get(stationId) ?? [])) {
    const timed: { stop: StationStop; minutes: number }[] = [];
    for (const variant of line.variants) {
      for (const [index, dep] of expandDepartures(variant.timetable).entries()) {
        for (const stop of buildRun(line, variant, dep, index)) {
          if (stop.stationId !== stationId) continue;
          timed.push({
            stop: {
              ...(stop.from === undefined ? {} : { from: stop.from }),
              ...(stop.to === undefined ? {} : { to: stop.to }),
              ...(stop.arrival === undefined ? {} : { arrival: formatClock(stop.arrival) }),
              ...(stop.departure === undefined ? {} : { departure: formatClock(stop.departure) }),
              turnback: stop.turnback,
            },
            minutes: stop.arrival ?? stop.departure ?? 0,
          });
        }
      }
    }
    if (timed.length === 0) continue;
    timed.sort((a, b) => a.minutes - b.minutes);
    out.push({
      lineId: line.id,
      lineName: line.names[line.primaryLang],
      lineNameEn: line.names.en,
      color: line.color,
      stops: timed.map((x) => x.stop),
    });
  }
  return out;
}
