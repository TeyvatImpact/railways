// 列车运行模型（读 useMapData 的数据，无 Vue 依赖）：
// 把每条线路每个变体的 `timetable.departures` 展开成「一趟车的全部停站时刻」，
// 再按模拟时刻回答「这趟车现在在哪、什么状态」——地图上的列车圆点与列车详情面板都读它。
import { dwellAt, expandDepartures, type TimetableDeparture } from './timetable';
import {
  lines,
  pairCost,
  segmentPolyline,
  stationMap,
  type Line,
  type LineVariant,
} from './useMapData';

/** 一趟车的一次停站：起点站只有 `departure`，终点站只有 `arrival`；折返点也只有 `arrival`（开出时刻 = 到站 + 停站） */
export interface TrainStop {
  stationId: string;
  arrival?: number;
  departure?: number;
  /** 折返点：本站停站后按反向开回发车站 */
  turnback: boolean;
}

export interface TrainRun {
  /** 稳定 id：`${lineId}#${variantIndex}#${index}`（index = 该变体展开后的第几班，0 起） */
  id: string;
  line: Line;
  variant: LineVariant;
  variantIndex: number;
  dep: TimetableDeparture;
  /** 全部停站（含环线末尾的闭合站、含折返回程），相邻两站即一段区间 */
  stops: TrainStop[];
  /** 首站开出时刻（绝对分钟，可能 ≥ 1440） */
  start: number;
  /** 末站到站 + 该站停站时间：之后这趟车不再渲染 */
  end: number;
}

/** 该站停站时长（分钟）：`dwell` 逐站覆盖 → `default`；无停站数据 = 0 */
export function dwellMinutes(run: TrainRun, stationId: string): number {
  return dwellAt(run.variant.timetable.dwell, stationId) ?? 0;
}

/** 第 i 站到站时刻；首站（只有开出）返回其开出时刻 */
export function stopArrival(run: TrainRun, i: number): number {
  const stop = run.stops[i];
  return stop.arrival ?? stop.departure ?? run.start;
}

/** 第 i 站离开时刻（= 下一段区间开始）：有开出用它，否则（末站 / 折返点）= 到站 + 停站 */
export function stopLeave(run: TrainRun, i: number): number {
  const stop = run.stops[i];
  return stop.departure ?? stopArrival(run, i) + dwellMinutes(run, stop.stationId);
}

/** 某时刻这趟车的状态：区间下标 = 区间起点站在 `stops` 里的下标，`t` = 该区间行进比例 0–1 */
export type TrainPhase =
  | { kind: 'before' }
  | { kind: 'dwell'; index: number }
  | { kind: 'run'; index: number; t: number }
  | { kind: 'after' };

export function trainPhaseAt(run: TrainRun, minute: number): TrainPhase {
  if (minute < run.start) return { kind: 'before' };
  if (minute >= run.end) return { kind: 'after' };
  const last = run.stops.length - 1;
  for (let i = 0; i < last; i++) {
    const leave = stopLeave(run, i);
    const arrive = stopArrival(run, i + 1);
    if (minute < leave) return { kind: 'dwell', index: i };
    if (minute < arrive)
      return { kind: 'run', index: i, t: arrive > leave ? (minute - leave) / (arrive - leave) : 1 };
  }
  return { kind: 'dwell', index: last };
}

/**
 * 把一条发车记录铺成一趟车的全部停站：按方向站序开行，每站加区间耗时（`pairCost(车型)`，含排点冗余）
 * 与停站时间（`dwell`）；`turnback` 的车到该方向终点后停站、再原路开回发车站。
 * **环线末尾的闭合站照常收尾**（到站 + 停站）—— 地图上列车要真的开回枢纽站。
 * 发车站不在站序里（数据层已校验，理论上不会发生）= 返回 `null`，该班跳过。
 */
export function buildTrainRun(
  line: Line,
  variant: LineVariant,
  dep: TimetableDeparture,
  index: number,
): TrainRun | null {
  const variantIndex = line.variants.indexOf(variant);
  const order = dep.direction === 'up' ? variant.stations : [...variant.stations].reverse();
  const startIndex = order.indexOf(dep.station);
  if (startIndex < 0) return null;
  const leg = order.slice(startIndex);
  const stops: TrainStop[] = [{ stationId: leg[0], departure: dep.minutes, turnback: false }];
  let time = dep.minutes;

  const walk = (path: string[], end: 'turnback' | 'terminus') => {
    for (let i = 1; i < path.length; i++) {
      time += pairCost(dep.vehicle, path[i - 1], path[i]).time;
      const arrival = time;
      time += dwellAt(variant.timetable.dwell, path[i]) ?? 0;
      if (i === path.length - 1) {
        stops.push({ stationId: path[i], arrival, turnback: end === 'turnback' });
      } else {
        stops.push({ stationId: path[i], arrival, departure: time, turnback: false });
      }
    }
  };

  walk(leg, dep.turnback ? 'turnback' : 'terminus');
  if (dep.turnback) walk([...leg].reverse(), 'terminus');

  const run: TrainRun = {
    id: `${line.id}#${variantIndex}#${index}`,
    line,
    variant,
    variantIndex,
    dep,
    stops,
    start: stops[0].departure ?? dep.minutes,
    end: 0,
  };
  run.end = stopLeave(run, stops.length - 1);
  return run;
}

/** 全天所有班次（模块导入时一次性算好，与 `useRouting` 建图同口径） */
export const trainRuns: TrainRun[] = [];
for (const line of lines) {
  line.variants.forEach((variant) => {
    expandDepartures(variant.timetable).forEach((dep, index) => {
      const run = buildTrainRun(line, variant, dep, index);
      if (run) trainRuns.push(run);
    });
  });
}

export function trainById(id: string): TrainRun | undefined {
  return trainRuns.find((run) => run.id === id);
}

export interface ActiveTrain {
  run: TrainRun;
  phase: { kind: 'dwell'; index: number } | { kind: 'run'; index: number; t: number };
}

/**
 * 某时刻正在线上（区间运行或停站）的全部列车。`minute` 是当日分钟数；同时按 `+1440` 检查一遍，
 * 好让前一天深夜开出、跨过 00:00 的班次继续跑到收车。
 */
export function activeTrainsAt(minute: number): ActiveTrain[] {
  const out: ActiveTrain[] = [];
  for (const run of trainRuns) {
    for (const shift of [0, 1440]) {
      const phase = trainPhaseAt(run, minute + shift);
      if (phase.kind === 'dwell' || phase.kind === 'run') {
        out.push({ run, phase });
        break;
      }
    }
  }
  return out;
}

/** 折线上按弧长比例 `t`（0–1）取点 */
export function pointAlong(
  points: { x: number; y: number }[],
  t: number,
): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(len);
    total += len;
  }
  if (total === 0) return points[0];
  let target = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i];
    if (target <= len) {
      const k = len === 0 ? 0 : target / len;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * k,
        y: points[i].y + (points[i + 1].y - points[i].y) * k,
      };
    }
    target -= len;
  }
  return points[points.length - 1];
}

/** 第 i 站的停靠点：首站取开出段折线的起点，其余取到站段折线的终点；折线缺失时回落站点圆心 */
export function stopPoint(
  lineId: string,
  stops: TrainStop[],
  index: number,
): { x: number; y: number } | null {
  const fallback = () => {
    const station = stationMap.get(stops[index].stationId);
    return station ? { x: station.cx, y: station.cy } : null;
  };
  if (stops.length < 2) return fallback();
  if (index === 0) {
    const polyline = segmentPolyline(lineId, stops[0].stationId, stops[1].stationId);
    return polyline ? polyline[0] : fallback();
  }
  const polyline = segmentPolyline(lineId, stops[index - 1].stationId, stops[index].stationId);
  return polyline ? polyline[polyline.length - 1] : fallback();
}
