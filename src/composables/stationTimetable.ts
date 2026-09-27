// 站点级时刻表派生（无 Vue 依赖，读 useMapData 的数据）：
// ①「间隔时间」= 本站各线路按时间顺序的生效间隔分段；②「时刻表发车」= 本站实际的车次到站 / 开出时刻。
import {
  dwellAt,
  expandDepartures,
  mergeIntervalSources,
  type IntervalSegment,
  type IntervalSource,
  type TimetableDeparture,
} from './timetable';
import {
  pairCost,
  stationLineMap,
  stationMap,
  sortLinesForDisplay,
  type Line,
  type LineVariant,
} from './useMapData';

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

/** 分钟数 → `HH:mm`（跨天加「次日」前缀）；只在展示层取整 */
function clockText(minutes: number): string {
  const rounded = Math.round(minutes);
  const day = Math.floor(rounded / 1440);
  const inDay = ((rounded % 1440) + 1440) % 1440;
  const text = `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`;
  return day > 0 ? `次日 ${text}` : text;
}

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
 * 把一条发车记录铺成一趟车的全部停站：按方向站序开行，每站加上区间耗时（`pairCost`，含车型排点冗余）
 * 与停站时间（`dwell`）；`turnback` 的车到该方向终点后停站再原路开回发车站（一趟车既是上行也是下行）。
 *
 * 停站行只有两种：区间行「到站 + 停站后开出」，终点行「只到站」——所以起点站只出现开出、终点站只出现到站。
 * 环线末尾那个闭合用的重复站不是停站（它只是把环画回去），只用来给上一站当「开往」方向。
 */
function buildRun(line: Line, variant: LineVariant, dep: TimetableDeparture): RawStop[] {
  const loop = isLoopStations(variant.stations);
  const order = dep.direction === 'up' ? variant.stations : [...variant.stations].reverse();
  const startIndex = order.indexOf(dep.station);
  if (startIndex < 0) return [];
  const leg = order.slice(startIndex);
  if (leg.length === 0) return [];
  const stops: RawStop[] = [];
  let time = dep.minutes;

  stops.push({
    stationId: leg[0],
    departure: time,
    ...(leg.length > 1 ? { to: stationName(line, leg[1]) } : {}),
    turnback: false,
  });

  /**
   * `end` 决定末站怎么收尾：`terminus` = 本趟车的终点（只到站）；`turnback` = 折返点（同样只到站，
   * 但标出来并照常推进停站时间，因为原路返回的那半趟还要用这个时刻）；`closure` = 环线闭合站（不生成停站行）。
   */
  const travel = (path: string[], end: 'terminus' | 'turnback' | 'closure') => {
    for (let i = 1; i < path.length; i++) {
      time += pairCost(dep.vehicle, path[i - 1], path[i]).time;
      const arrival = time;
      const atEnd = i === path.length - 1;
      if (atEnd && end === 'closure') break;
      const from = stationName(line, path[i - 1]);
      time += dwellAt(variant.timetable.dwell, path[i]) ?? 0;
      if (atEnd) {
        stops.push({ stationId: path[i], arrival, from, turnback: end === 'turnback' });
        continue;
      }
      stops.push({
        stationId: path[i],
        arrival,
        departure: time,
        from,
        to: stationName(line, path[i + 1]),
        turnback: false,
      });
    }
  };

  travel(leg, loop ? 'closure' : dep.turnback ? 'turnback' : 'terminus');
  if (dep.turnback) travel([...leg].reverse(), 'terminus');
  return stops;
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
      for (const dep of expandDepartures(variant.timetable)) {
        for (const stop of buildRun(line, variant, dep)) {
          if (stop.stationId !== stationId) continue;
          timed.push({
            stop: {
              ...(stop.from === undefined ? {} : { from: stop.from }),
              ...(stop.to === undefined ? {} : { to: stop.to }),
              ...(stop.arrival === undefined ? {} : { arrival: clockText(stop.arrival) }),
              ...(stop.departure === undefined ? {} : { departure: clockText(stop.departure) }),
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
