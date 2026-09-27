// 由「只写 interval 的变体」的时段间隔合成具体班次（纯逻辑，无 Vue 依赖）。
//
// 硬性验收条件（系数在 `config/schedule.config.ts`）：某站某方向的**合并间隔** `m`（= 该线在该站
// 相邻区间各变体 `interval` 的最小值，与站点面板「间隔时间」同一口径）下，相邻两班到站间隔必须
// ≤ `min(m × GAP_FACTOR, m + GAP_SLACK_MINUTES)`；只对首班车之后的相邻到站有义务，不要求最优。
//
// 思路：
//   ① **走班次**（`walk`）：每个变体按自己基础（无 `between`）时段的间隔，沿该方向的站序走出一串
//      候选班次 —— 每次按「所有到站时刻都还能容忍的步长」推进，所以步长 = 该变体最密的那一档间隔；
//   ② **池化 + 覆盖贪心**（`buildDirection`）：一个方向把各变体的候选放进同一个池子，按
//      「到站期限」推进 —— 期限 = 该站上一班到站时刻 + `gapLimitOf`(该站该线的合并间隔)，
//      每次挑**最早的期限**，取能赶在期限内到站的**最晚**一班（最晚 = 最少用车），
//      同刻并列时优先能一并推进其他站的候选；
//   ③ **变体相位**（`variantPhases`）：最密的变体留在整点，其余按**共用区间上的汇入时刻**逐个试相位，
//      取与已定变体最近一次发车相差最大的那个 —— 共用段上不同变体的车因此错开落位、不会并排跑；
//   ④ **兜底**：某个变体的班次被别人的完全盖住时，按它自己的声明间隔整体错开一个偏移再补进来，
//      保证每个变体都有车（代价：共用段会比面板的合并间隔更密）；
//   ⑤ **附加班车**：`between` 段比该变体的常态更密时（该段存在 `Infinity` 或比它更疏的取值），
//      从该段首站始发补班车、只跑剩下的行程；
//   ⑥ **收官补车**：池子里已经没有候选盖得住某个空档时（典型：末段各变体的班次网格都走完了，
//      另一条交路的时段却仍声明更密的间隔 —— 合并间隔压着期限），往空档里补一趟车。
//
// 「更密」的判定口径：该时段窗口内、该范围各区间上，基础（无范围）时段的取值存在 `Infinity`
// 或大于该范围声明的间隔 —— 逐分钟取样，所以不依赖任何私有实现。
//
// 合成过程中的异常（候选都不可用只能强制接受之类）记在 `syntheticNotes` 里，正常数据应为空。
// 产出的班次交给 `trainRuns.ts`，走与 `departures` 完全相同的建表流水线。

import {
  GAP_FACTOR,
  GAP_SLACK_MINUTES,
  MAX_SYNTHETIC_TRIPS,
  MAX_TOP_UPS,
} from '../config/schedule.config';
import {
  bandCovers,
  clockOf,
  closedAt,
  dwellAt,
  intervalAt,
  minuteOf,
  segmentKey,
  type IntervalSource,
  type TimetableDeparture,
  type TimetableDirection,
  type TimetableIntervalBand,
} from './timetable';
import { pairCost, type Line, type LineVariant } from './useMapData';

/** 合成过程中的异常记录（违规 / 冲突 / 兜底说明）；供冒烟脚本诊断，正常应为空 */
export const syntheticNotes: string[] = [];

/**
 * 「同一个发车槽」的判定阈值（分钟）：两个班次在同一区间上的出发时刻相差小于它就算重合。
 * 共用区段池化要的是「别让两个变体的车并排开」，不是禁止同一条线多列车同时在线
 * （车隔比区间走行时间短时后者是必然的）。
 */
const CONFLICT_SLOT_MINUTES = 1;

/** 一天内的分钟数（绝对分钟 → `[0, 1440)`） */
function dayMinute(minutes: number): number {
  return ((minutes % 1440) + 1440) % 1440;
}

// ---------------- 站级合并间隔（与站点面板「间隔时间」同一口径） ----------------

const sourceCache = new WeakMap<Line, Map<string, IntervalSource[]>>();

/**
 * 某线在某站的「间隔来源」：每个经过该站的变体，取它在该站两侧的相邻无向区间。
 * 与 `stationTimetable.stationHeadways` 同一口径（那边也调这个函数），站点面板的「间隔时间」
 * 与合成算法的「合并间隔」因此永远一致。
 */
export function lineStationSources(line: Line, stationId: string): IntervalSource[] {
  let byStation = sourceCache.get(line);
  if (!byStation) {
    byStation = new Map();
    sourceCache.set(line, byStation);
  }
  const hit = byStation.get(stationId);
  if (hit) return hit;
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
  byStation.set(stationId, sources);
  return sources;
}

const intervalCache = new WeakMap<Line, Map<string, number>>();

/** 某线在某站某时刻的合并间隔 `m`（分钟）；`Infinity` = 该时刻（该站）不开行 */
export function lineStationInterval(line: Line, stationId: string, minutes: number): number {
  let byKey = intervalCache.get(line);
  if (!byKey) {
    byKey = new Map();
    intervalCache.set(line, byKey);
  }
  const time = clockOf(minutes);
  const key = `${stationId}|${time}`;
  const hit = byKey.get(key);
  if (hit !== undefined) return hit;
  let out = Infinity;
  for (const source of lineStationSources(line, stationId))
    out = Math.min(out, intervalAt(source.bands, time, source.segment));
  byKey.set(key, out);
  return out;
}

/** 验收上限：`min(m × GAP_FACTOR, m + GAP_SLACK_MINUTES)`；`m` 非有限（不开行）时返回 `Infinity` */
export function gapLimitOf(interval: number): number {
  if (!Number.isFinite(interval)) return Infinity;
  return Math.min(interval * GAP_FACTOR, interval + GAP_SLACK_MINUTES);
}

/** 单个变体在某站某时刻的声明间隔（该站两侧相邻区间取最小）；`Infinity` = 该时刻不开行 */
function variantStationInterval(variant: LineVariant, stationId: string, minutes: number): number {
  const bands = variant.timetable.interval;
  if (bands === undefined) return Infinity;
  const time = clockOf(minutes);
  const index = variant.stations.indexOf(stationId);
  if (index < 0) return Infinity;
  let out = Infinity;
  if (index > 0) out = intervalAt(bands, time, [stationId, variant.stations[index - 1]]);
  if (index < variant.stations.length - 1)
    out = Math.min(out, intervalAt(bands, time, [stationId, variant.stations[index + 1]]));
  return out;
}

// ---------------- 候选班次 ----------------

interface Candidate {
  variantIndex: number;
  direction: TimetableDirection;
  /** 始发站（该方向路径的首站；附加班车 = `between` 段首站） */
  station: string;
  /** 始发时刻（绝对分钟） */
  minutes: number;
  vehicle: string;
  /** 从始发站起逐站到站时刻（首项 = 出发时刻） */
  stops: { stationId: string; at: number }[];
  /** 占用的区间（同向冲突判定用）；`a`/`b` 按行进方向给出 */
  spans: { a: string; b: string; from: number; to: number }[];
}

interface WalkContext {
  variant: LineVariant;
  variantIndex: number;
  direction: TimetableDirection;
  /** 该方向的完整站序（变体站序或反转） */
  order: string[];
  originIndex: number;
  /** 逐到站时刻的打分：`i` = 站序里的区间下标，返回「这个终点最晚可以多久之后到下一站」 */
  requirement: (index: number, at: number) => number;
  windowStart: number;
  /** 超过它就不再生成新班次；基础班次传 `Infinity` */
  windowEnd: number;
}

/** 从始发站到 `order[i]` 的到站耗时（口径与 `buildTrainRun` 完全一致：区间耗时 + 中间站停站） */
function arrivalProfile(variant: LineVariant, order: string[], originIndex: number): number[] {
  const tau = new Array<number>(order.length).fill(Infinity);
  tau[originIndex] = 0;
  for (let i = originIndex + 1; i < order.length; i++) {
    const previous = order[i - 1];
    // 始发站的停站不加（与 buildTrainRun 一致：首站的 departure 就是发车时刻）
    const dwell = i - 1 === originIndex ? 0 : dwellAt(variant.timetable.dwell, previous);
    tau[i] = tau[i - 1] + dwell + pairCost(variant.vehicle, previous, order[i]).time;
  }
  return tau;
}

/** 整趟车是否合法：每个区间在「离开前一站」与「到达后一站」两个时刻都不处于显式封段状态 */
function legalRun(
  bands: readonly (TimetableIntervalBand | null)[],
  stops: Candidate['stops'],
): boolean {
  for (let i = 0; i + 1 < stops.length; i++) {
    const segment: [string, string] = [stops[i].stationId, stops[i + 1].stationId];
    if (closedAt(bands, clockOf(stops[i].at), segment)) return false;
    if (closedAt(bands, clockOf(stops[i + 1].at), segment)) return false;
  }
  return true;
}

/** 由「逐站到站时刻」拼出候选班次（`minutes` = 始发时刻） */
function makeCandidate(
  variantIndex: number,
  direction: TimetableDirection,
  vehicle: string,
  stops: Candidate['stops'],
): Candidate {
  const spans: Candidate['spans'] = [];
  for (let i = 0; i + 1 < stops.length; i++)
    spans.push({
      a: stops[i].stationId,
      b: stops[i + 1].stationId,
      from: stops[i].at,
      to: stops[i + 1].at,
    });
  return {
    variantIndex,
    direction,
    station: stops[0].stationId,
    minutes: stops[0].at,
    vehicle,
    stops,
    spans,
  };
}

/** 走班次：按 `requirement` 给出的容忍间隔推进，产出一串候选班次 */
function walk(ctx: WalkContext): Candidate[] {
  const tau = arrivalProfile(ctx.variant, ctx.order, ctx.originIndex);
  const out: Candidate[] = [];
  let t = ctx.windowStart;
  for (let guard = 0; guard < MAX_SYNTHETIC_TRIPS; guard++) {
    if (t >= ctx.windowEnd) break;
    const h1 = minRequirement(ctx, tau, t);
    if (!Number.isFinite(h1)) break;
    const h2 = minRequirement(ctx, tau, t + h1);
    const step = Number.isFinite(h2) ? Math.min(h1, h2) : h1;
    if (!(step > 0)) break;
    const stops = ctx.order
      .slice(ctx.originIndex)
      .map((stationId, i) => ({ stationId, at: t + tau[ctx.originIndex + i] }));
    if (legalRun(ctx.variant.timetable.interval ?? [], stops))
      out.push(makeCandidate(ctx.variantIndex, ctx.direction, ctx.variant.vehicle, stops));
    t += step;
  }
  return out;
}

/** 该趟车在各站的到站时刻上最小的容忍间隔；全部无约束（`Infinity`）时返回 `Infinity` */
function minRequirement(ctx: WalkContext, tau: number[], t: number): number {
  let out = Infinity;
  for (let i = ctx.originIndex; i < ctx.order.length - 1; i++) {
    const value = ctx.requirement(i, t + tau[i]);
    if (Number.isFinite(value) && value < out) out = value;
  }
  return out;
}

/** 该时段的窗口（分钟，跨天时 `to` 已 +1440） */
function bandWindow(band: TimetableIntervalBand): { from: number; to: number } {
  const from = minuteOf(band.from);
  const rawTo = minuteOf(band.to);
  return { from, to: rawTo <= from ? rawTo + 1440 : rawTo };
}

/** 时段数组里最早的起点（`from` 的分钟数）；没有可用的段 = `undefined` */
function earliestBandStart(bands: readonly (TimetableIntervalBand | null)[]): number | undefined {
  let out: number | undefined;
  for (const band of bands) {
    if (band === null) continue;
    const from = minuteOf(band.from);
    if (out === undefined || from < out) out = from;
  }
  return out;
}

/** `between` 段是否比该变体的基础（无范围）时段更密：窗口内逐分钟取样，存在 `Infinity` 或更疏的值 */
function rangeIsDenser(
  base: readonly (TimetableIntervalBand | null)[],
  band: TimetableIntervalBand,
  range: readonly string[],
): boolean {
  const target = band.interval;
  if (target === null) return false;
  const window = bandWindow(band);
  for (let i = 0; i + 1 < range.length; i++) {
    const segment: [string, string] = [range[i], range[i + 1]];
    for (let minutes = window.from; minutes < window.to; minutes++) {
      const value = intervalAt(base, clockOf(minutes), segment);
      if (!Number.isFinite(value) || value > target) return true;
    }
  }
  return false;
}

// ---------------- 池化 + 覆盖贪心 ----------------

/** 假想接受这趟车后，所有站新期限里最早的那一个（越大 = 越能一并推进其他站）；无约束的站忽略 */
function pushDeadline(line: Line, last: Map<string, number>, candidate: Candidate): number {
  let out = Infinity;
  for (const stop of candidate.stops) {
    const previous = last.get(stop.stationId);
    const at = previous === undefined ? stop.at : Math.max(previous, stop.at);
    const m = lineStationInterval(line, stop.stationId, at);
    if (!Number.isFinite(m)) continue;
    out = Math.min(out, at + gapLimitOf(m));
  }
  return Number.isFinite(out) ? out : Infinity;
}

/** 该变体声明的常态间隔（分钟，取基础（无范围）时段里最小的有限值）；没有可用的值 = `undefined` */
function declaredIntervalOf(variant: LineVariant): number | undefined {
  const bands = variant.timetable.interval;
  if (bands === undefined) return undefined;
  let out: number | undefined;
  for (const band of bands) {
    if (band === null || band.stations !== undefined) continue;
    if (band.interval === null) continue;
    if (out === undefined || band.interval < out) out = band.interval;
  }
  return out;
}

/** 基础（无范围）时段：带 `between` 的段不参与常态走班次（它只用来补更密的班车）；裸 `null` 保留 */
function baseBandsOf(
  bands: readonly (TimetableIntervalBand | null)[],
): (TimetableIntervalBand | null)[] {
  return bands.filter((band) => band === null || band.stations === undefined);
}

const baseCache = new WeakMap<Line, Map<string, Candidate[]>>();

/** 某变体某方向的基础候选（相位 0）；结果按线路对象缓存（相位搜索与排班都要用同一份） */
function baseCandidates(
  line: Line,
  variantIndex: number,
  direction: TimetableDirection,
): Candidate[] {
  let byKey = baseCache.get(line);
  if (!byKey) {
    byKey = new Map();
    baseCache.set(line, byKey);
  }
  const key = `${variantIndex}|${direction}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const out = walkBase(line, variantIndex, direction);
  byKey.set(key, out);
  return out;
}

function walkBase(line: Line, variantIndex: number, direction: TimetableDirection): Candidate[] {
  const variant = line.variants[variantIndex];
  const bands = variant.timetable.interval;
  if (bands === undefined) return [];
  const order = direction === 'up' ? variant.stations : [...variant.stations].reverse();
  const base = baseBandsOf(bands);
  const windowStart = earliestBandStart(base);
  if (windowStart === undefined) return [];
  return walk({
    variant,
    variantIndex,
    direction,
    order,
    originIndex: 0,
    requirement: (index, at) => intervalAt(base, clockOf(at), [order[index], order[index + 1]]),
    windowStart,
    windowEnd: Infinity,
  });
}

/** 相位搜索时最多往后试多少分钟 */
const PHASE_SEARCH_LIMIT = 60;

/** `segments` → 该变体在某方向上的区间起点时刻（相位 0，升序） */
function spanStarts(
  line: Line,
  variantIndex: number,
  direction: TimetableDirection,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const candidate of baseCandidates(line, variantIndex, direction)) {
    for (const span of candidate.spans) {
      const key = segmentKey(span.a, span.b);
      const list = out.get(key);
      if (list) list.push(span.from);
      else out.set(key, [span.from]);
    }
  }
  for (const list of out.values()) list.sort((a, b) => a - b);
  return out;
}

/** 升序数组里第一项「键 > value」的下标（= 键 ≤ value 的项数） */
function upperBound<T>(list: readonly T[], value: number, key: (item: T) => number): number {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (key(list[mid]) <= value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** 诊断用标签：`变体#始发时刻`（班次的最终 id 要等建表后才有） */
function candidateLabel(candidate: Candidate): string {
  return `#${candidate.variantIndex}@${candidate.minutes.toFixed(1)}`;
}

/** 升序数组里离 `value` 最近的值；空数组返回 `Infinity` */
function nearest(sorted: number[], value: number): number {
  if (sorted.length === 0) return Infinity;
  let low = 0;
  let high = sorted.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] < value) low = mid + 1;
    else high = mid;
  }
  let best = sorted[low];
  if (low > 0 && Math.abs(sorted[low - 1] - value) < Math.abs(best - value)) best = sorted[low - 1];
  return best;
}

/**
 * 该变体后移 `phase` 分钟后，与已定相位的变体在**共用区间**上最近的一次发车时刻差（越大越好）。
 * 没有共用区间（或还没有别的变体）= `Infinity`。
 */
function separationScore(
  spans: Map<string, number[]>,
  placed: { spans: Map<string, number[]>; phase: number }[],
  phase: number,
): number {
  let best = Infinity;
  for (const other of placed) {
    for (const [key, mine] of spans) {
      const theirs = other.spans.get(key);
      if (!theirs) continue;
      for (const mine2 of mine) {
        const value = mine2 + phase;
        best = Math.min(best, Math.abs(value - (nearest(theirs, value) + other.phase)));
      }
    }
  }
  return best;
}

/**
 * 该方向各变体的发车相位（分钟）：最密的变体留在整点，其余逐个选一个相位 —— 让它在**共用区间**上的
 * 发车时刻与已定变体的最近一次相差最大。
 *
 * 这是「池化错开、不重合」的落地方式：相位对齐的是**汇入点的实际发车时刻**，不是各变体自己的首站，
 * 所以支线从别处汇入主线时也能插进主线的空档，而不是在汇入点跟主线撞车。上下行各算一次
 * （同一条线上两个方向的汇入时刻差不一样，相位不该互相迁就）。
 */
function variantPhases(line: Line, direction: TimetableDirection): Map<number, number> {
  const entries: { variantIndex: number; declared: number }[] = [];
  line.variants.forEach((variant, variantIndex) => {
    const declared = declaredIntervalOf(variant);
    if (declared !== undefined) entries.push({ variantIndex, declared });
  });
  entries.sort((a, b) => a.declared - b.declared || a.variantIndex - b.variantIndex);
  const phases = new Map<number, number>();
  if (entries.length <= 1) {
    if (entries.length === 1) phases.set(entries[0].variantIndex, 0);
    return phases;
  }
  const placed: { spans: Map<string, number[]>; phase: number }[] = [];
  for (const entry of entries) {
    const spans = spanStarts(line, entry.variantIndex, direction);
    const limit = Math.min(Math.round(entry.declared), PHASE_SEARCH_LIMIT);
    let bestPhase = 0;
    let bestScore = -Infinity;
    for (let phase = 0; phase <= limit; phase++) {
      const score = separationScore(spans, placed, phase);
      if (score > bestScore + 1e-9) {
        bestScore = score;
        bestPhase = phase;
      }
    }
    phases.set(entry.variantIndex, bestPhase);
    placed.push({ spans, phase: bestPhase });
  }
  return phases;
}

/**
 * 一个方向上的排班：收集各变体的候选（相位错开、封段过滤）→ 按「到站期限」贪心挑选
 * （每次取能赶在期限内到站的**最晚**一班，最晚 = 最少用车）→ 兜底保证每个变体都有车。
 * 返回该方向选中的班次，按时刻升序。
 */
function buildDirection(line: Line, direction: TimetableDirection): Candidate[] {
  const pool: Candidate[] = [];
  const perVariant = new Map<number, Candidate[]>();
  const phases = variantPhases(line, direction);

  line.variants.forEach((variant, variantIndex) => {
    const bands = variant.timetable.interval;
    if (bands === undefined) return;
    const order = direction === 'up' ? variant.stations : [...variant.stations].reverse();
    const base = baseBandsOf(bands);
    const phase = phases.get(variantIndex) ?? 0;
    // 基础班次：先按相位 0 走一遍，再整体后移该变体的相位（错开共用区段），最后重验封段
    const collected = baseCandidates(line, variantIndex, direction)
      .map((candidate) => shiftCandidate(candidate, phase))
      .filter((candidate) => legalRun(bands, candidate.stops));

    for (const band of bands) {
      if (band === null || band.stations === undefined || band.interval === null) continue;
      const range = band.stations;
      if (!rangeIsDenser(base, band, range)) continue;
      const originStation = direction === 'up' ? range[0] : range[range.length - 1];
      const originIndex = order.indexOf(originStation);
      if (originIndex < 0) continue;
      const window = bandWindow(band);
      const interval = band.interval;
      collected.push(
        ...walk({
          variant,
          variantIndex,
          direction,
          order,
          originIndex,
          requirement: (_index, at) => (bandCovers(band, dayMinute(at)) ? interval : Infinity),
          windowStart: window.from,
          windowEnd: window.to,
        }),
      );
    }

    if (collected.length === 0) return;
    collected.sort((a, b) => a.minutes - b.minutes);
    perVariant.set(variantIndex, collected);
    pool.push(...collected);
  });

  pool.sort((a, b) => a.minutes - b.minutes || a.variantIndex - b.variantIndex);

  const chosen: Candidate[] = [];
  const chosenSet = new Set<Candidate>();
  const last = new Map<string, number>();
  const givenUp = new Set<string>();
  const occupied = new Map<string, { from: number; to: number }[]>();
  const byStation = new Map<string, { cand: Candidate; at: number }[]>();

  for (const candidate of pool) {
    for (const stop of candidate.stops) {
      const list = byStation.get(stop.stationId);
      if (list) list.push({ cand: candidate, at: stop.at });
      else byStation.set(stop.stationId, [{ cand: candidate, at: stop.at }]);
    }
  }
  for (const list of byStation.values()) list.sort((a, b) => a.at - b.at);

  const chosenAt = new Map<string, number[]>();

  /** 该站是否还有没被选中的候选能赶在 `deadline` 前到站（有 = 这一班晚点也有人补） */
  const coverable = (stationId: string, deadline: number): boolean => {
    const list = byStation.get(stationId);
    if (!list) return false;
    const total = upperBound(list, deadline, (entry) => entry.at);
    const chosenCount = upperBound(chosenAt.get(stationId) ?? [], deadline, (value) => value);
    return total > chosenCount;
  };

  /**
   * 接受这趟车后第一个会留下**补不上的空档**的站（`undefined` = 可以接受）。
   * 「空档」= 本站上一班到站时刻 + `gapLimitOf`(合并间隔)；站上还有别的候选能补 = 不算空档
   * （多交路线路上某条交路的车晚点、另一条交路补上，是正常排点）。
   */
  const firstOverdue = (candidate: Candidate): string | undefined => {
    for (const stop of candidate.stops) {
      const previous = last.get(stop.stationId);
      if (previous === undefined) continue;
      const m = lineStationInterval(line, stop.stationId, previous);
      if (!Number.isFinite(m)) continue;
      const deadline = previous + gapLimitOf(m);
      if (stop.at <= deadline) continue;
      if (coverable(stop.stationId, deadline)) continue;
      return stop.stationId;
    }
    return undefined;
  };

  const feasible = (candidate: Candidate): boolean => firstOverdue(candidate) === undefined;

  const conflictFree = (candidate: Candidate): boolean =>
    candidate.spans.every((span) => {
      const list = occupied.get(segmentKey(span.a, span.b));
      if (!list) return true;
      // 同一区间的「同一个发车槽」才算冲突：车隔比区间走行时间短时，同一条线本来就会有
      // 多列车同时在线（前车还没走出区间，后车已经进来了），那是正常运转，不是重合。
      return !list.some((other) => Math.abs(span.from - other.from) < CONFLICT_SLOT_MINUTES);
    });

  const occupy = (candidate: Candidate): void => {
    for (const span of candidate.spans) {
      const key = segmentKey(span.a, span.b);
      const list = occupied.get(key);
      const entry = { from: span.from, to: span.to };
      if (!list) occupied.set(key, [entry]);
      else {
        let index = list.length;
        while (index > 0 && list[index - 1].from > entry.from) index--;
        list.splice(index, 0, entry);
      }
    }
  };

  const accept = (candidate: Candidate): void => {
    chosen.push(candidate);
    chosenSet.add(candidate);
    occupy(candidate);
    for (const stop of candidate.stops) {
      last.set(stop.stationId, Math.max(last.get(stop.stationId) ?? -Infinity, stop.at));
      const times = chosenAt.get(stop.stationId);
      if (times) {
        let index = times.length;
        while (index > 0 && times[index - 1] > stop.at) index--;
        times.splice(index, 0, stop.at);
      } else chosenAt.set(stop.stationId, [stop.at]);
    }
  };

  // (a) 播种：每个变体一条，保证每个变体都有车
  for (const [variantIndex, list] of [...perVariant.entries()].sort((a, b) => a[0] - b[0])) {
    let picked: Candidate | undefined;
    for (const candidate of list.slice(0, 8)) {
      if (conflictFree(candidate)) {
        picked = candidate;
        break;
      }
    }
    accept(picked ?? list[0]);
  }

  // (b) 覆盖循环：每次推进「最早的到站期限」
  for (;;) {
    let urgentStation: string | undefined;
    let urgentDeadline = Infinity;
    for (const [station, at] of last) {
      if (givenUp.has(station)) continue;
      const m = lineStationInterval(line, station, at);
      if (!Number.isFinite(m)) continue;
      const deadline = at + gapLimitOf(m);
      if (deadline < urgentDeadline) {
        urgentDeadline = deadline;
        urgentStation = station;
      }
    }
    if (urgentStation === undefined) break;

    const station = urgentStation;
    const list = byStation.get(station) ?? [];
    let end = 0;
    while (end < list.length && list[end].at <= urgentDeadline) end++;
    const window: { cand: Candidate; at: number; push: number }[] = [];
    for (let i = end - 1; i >= 0 && window.length < 32; i--) {
      if (chosenSet.has(list[i].cand)) continue;
      window.push({
        cand: list[i].cand,
        at: list[i].at,
        push: pushDeadline(line, last, list[i].cand),
      });
    }
    if (window.length === 0) {
      givenUp.add(station);
      // 当天服务到此结束（期限已越过末班）不算违规：只有「后面还有班次、但都赶不上期限」才记一笔
      if (list.length > 0 && list[list.length - 1].at > urgentDeadline)
        syntheticNotes.push(
          `${line.id} ${direction} 站 ${station}：期限 ${urgentDeadline.toFixed(1)} 内无可用候选（违规）`,
        );
      continue;
    }

    // 排序：到站时刻降序（尽量少用车）→「假想接受后所有站新期限的最小值」降序（能一并推进其他站）
    // → 变体序升序
    window.sort(
      (a, b) =>
        b.at - a.at ||
        (a.push === b.push ? 0 : b.push - a.push) ||
        a.cand.variantIndex - b.cand.variantIndex,
    );
    let accepted = false;
    for (const entry of window.slice(0, 8)) {
      if (feasible(entry.cand) && conflictFree(entry.cand)) {
        accept(entry.cand);
        accepted = true;
        break;
      }
    }
    if (!accepted) {
      const fallback = window[0].cand;
      const overdue = firstOverdue(fallback);
      accept(fallback);
      syntheticNotes.push(
        `${line.id} ${direction} 站 ${station}：候选均不可用，强制接受 ${candidateLabel(fallback)}（${
          overdue === undefined ? '与已排班次同区段同槽' : `会让 ${overdue} 超过到站期限`
        }）`,
      );
    }
  }

  // (c) 兜底：某个变体几乎被完全盖住时，按它自己的声明间隔整体错开一个偏移再补进来
  const counts = new Map<number, number>();
  for (const candidate of chosen)
    counts.set(candidate.variantIndex, (counts.get(candidate.variantIndex) ?? 0) + 1);
  for (const [variantIndex, list] of [...perVariant.entries()].sort((a, b) => a[0] - b[0])) {
    if ((counts.get(variantIndex) ?? 0) > 1) continue;
    const declared = declaredInterval(list, line.variants[variantIndex]);
    if (declared === undefined) {
      syntheticNotes.push(
        `${line.id} ${direction} 变体 #${variantIndex}：只有播种班次且无声明间隔，未兜底`,
      );
      continue;
    }
    let added = false;
    for (let phase = 0; phase <= declared && !added; phase++) {
      const shifted = list.map((candidate) => shiftCandidate(candidate, phase));
      const snapshotLast = new Map(last);
      const snapshotChosenLength = chosen.length;
      const snapshotChosenSet = new Set(chosenSet);
      const snapshotOccupied = new Map([...occupied].map(([key, value]) => [key, value.slice()]));
      let ok = true;
      for (const candidate of shifted) {
        if (
          !legalRun(line.variants[variantIndex].timetable.interval ?? [], candidate.stops) ||
          !feasible(candidate) ||
          !conflictFree(candidate)
        ) {
          ok = false;
          break;
        }
        accept(candidate);
      }
      if (ok) {
        added = true;
        break;
      }
      chosen.length = snapshotChosenLength;
      chosenSet.clear();
      for (const candidate of snapshotChosenSet) chosenSet.add(candidate);
      last.clear();
      for (const [key, value] of snapshotLast) last.set(key, value);
      occupied.clear();
      for (const [key, value] of snapshotOccupied) occupied.set(key, value);
    }
    if (!added)
      syntheticNotes.push(
        `${line.id} ${direction} 变体 #${variantIndex}：兜底偏移全部不可用（未补车）`,
      );
  }

  // (d) 收官补车：池子里的候选都盖不住某个空档时（典型：末段各变体的班次网格已经走完，而另一条
  //     交路的时段仍声明更密的间隔，合并间隔压着验收期限），往空档里补一趟 —— 计划决策 3 的
  //     「中途站始发只作为加车 / 优化手段」。优先从该方向首站始发（整趟），退而求其次从该站始发。
  /** 已排班次里超出验收期限最严重的空档（`undefined` = 全部达标） */
  const worstGap = (
    skip: ReadonlySet<string>,
  ): { stationId: string; previous: number; next: number; limit: number } | undefined => {
    let out: { stationId: string; previous: number; next: number; limit: number } | undefined;
    let worst = 0;
    for (const [stationId, times] of chosenAt) {
      if (skip.has(stationId)) continue;
      for (let i = 1; i < times.length; i++) {
        const m = lineStationInterval(line, stationId, times[i - 1]);
        if (!Number.isFinite(m)) continue;
        const limit = gapLimitOf(m);
        const overshoot = times[i] - times[i - 1] - limit;
        if (overshoot > worst) {
          worst = overshoot;
          out = { stationId, previous: times[i - 1], next: times[i], limit };
        }
      }
    }
    return out;
  };

  /** 往空档里补一趟车（到站时刻尽量靠后 = 少用车，且给下一班留余地） */
  const topUp = (gap: { stationId: string; previous: number; next: number }): boolean => {
    const stationId = gap.stationId;
    const limitBefore = gapLimitOf(lineStationInterval(line, stationId, gap.previous));
    if (!Number.isFinite(limitBefore)) return false;
    const variants = line.variants
      .map((variant, variantIndex) => ({ variant, variantIndex }))
      .filter(({ variant }) => {
        const order = direction === 'up' ? variant.stations : [...variant.stations].reverse();
        const index = order.indexOf(stationId);
        return index >= 0 && index < order.length - 1;
      })
      // 承诺由声明间隔最小的那个变体给出，先试它
      .sort(
        (a, b) =>
          variantStationInterval(a.variant, stationId, gap.previous) -
          variantStationInterval(b.variant, stationId, gap.previous),
      );
    for (const { variant, variantIndex } of variants) {
      const bands = variant.timetable.interval ?? [];
      const order = direction === 'up' ? variant.stations : [...variant.stations].reverse();
      const stopIndex = order.indexOf(stationId);
      for (const originIndex of [0, stopIndex]) {
        if (originIndex > stopIndex) continue;
        const tau = arrivalProfile(variant, order, originIndex);
        const firstSegment: [string, string] = [order[originIndex], order[originIndex + 1]];
        for (let attempt = 0; attempt < 90; attempt++) {
          const at = gap.next - 0.5 - attempt;
          if (at <= gap.previous) break;
          if (at - gap.previous > limitBefore) continue;
          if (gap.next - at > gapLimitOf(lineStationInterval(line, stationId, at))) continue;
          const start = at - tau[stopIndex];
          if (start < 0) continue;
          // 与走班次同一口径：始发区间当时必须在运行时段内（列车可以开到时段之外，但得先发得出去）
          if (!Number.isFinite(intervalAt(bands, clockOf(start), firstSegment))) continue;
          const stops = order
            .slice(originIndex)
            .map((id, i) => ({ stationId: id, at: start + tau[originIndex + i] }));
          if (!legalRun(bands, stops)) continue;
          const candidate = makeCandidate(variantIndex, direction, variant.vehicle, stops);
          if (!conflictFree(candidate)) continue;
          accept(candidate);
          return true;
        }
      }
    }
    return false;
  };

  const unrepairable = new Set<string>();
  for (let round = 0; round < MAX_TOP_UPS; round++) {
    const gap = worstGap(unrepairable);
    if (gap === undefined) break;
    if (!topUp(gap)) {
      unrepairable.add(gap.stationId);
      syntheticNotes.push(
        `${line.id} ${direction} 站 ${gap.stationId}：${gap.previous.toFixed(1)}–${gap.next.toFixed(
          1,
        )} 的空档补不上车（期限 ${gap.limit} 分）`,
      );
    }
  }

  chosen.sort((a, b) => a.minutes - b.minutes || a.variantIndex - b.variantIndex);
  return chosen;
}
/** 兜底用的声明间隔：优先取变体基础时段的声明值，全带范围时退回候选自身的实际间距 */
function declaredInterval(list: Candidate[], variant: LineVariant): number | undefined {
  let out = declaredIntervalOf(variant);
  if (out === undefined) {
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].minutes - list[i - 1].minutes;
      if (out === undefined || gap < out) out = gap;
    }
  }
  return out === undefined ? undefined : Math.max(1, Math.round(out));
}

/** 整趟车在时间上平移 `minutes` 分钟 */
function shiftCandidate(candidate: Candidate, minutes: number): Candidate {
  return {
    ...candidate,
    minutes: candidate.minutes + minutes,
    stops: candidate.stops.map((stop) => ({ stationId: stop.stationId, at: stop.at + minutes })),
    spans: candidate.spans.map((span) => ({
      a: span.a,
      b: span.b,
      from: span.from + minutes,
      to: span.to + minutes,
    })),
  };
}

// ---------------- 对外入口 ----------------

/** 首末同站的闭合线路（末尾那个闭合用的重复站不另算一个方向） */
function isLoop(stations: string[]): boolean {
  return stations.length > 3 && stations[0] === stations[stations.length - 1];
}

/** 该线路要排哪几个方向：单向线路与环线只有数据方向一种（环线反向绕圈不在数据语义里） */
function scheduleDirections(line: Line): TimetableDirection[] {
  return line.oneWay || line.variants.some((variant) => isLoop(variant.stations))
    ? ['up']
    : ['up', 'down'];
}

/**
 * 一条线路上「只写 interval」的变体该跑哪些班次。返回 `variantIndex` → 按时刻升序的 departure 列表；
 * 用 `departures` 写时刻表的变体（至冬）不在结果里，只写间隔的变体即使当天不开行也会带一条空列表。
 */
export function syntheticSchedule(line: Line): Map<number, TimetableDeparture[]> {
  const out = new Map<number, TimetableDeparture[]>();
  for (const [variantIndex, variant] of line.variants.entries())
    if (variant.timetable.interval !== undefined) out.set(variantIndex, []);

  // 单向线路与环线只有数据方向一种（环线反向绕圈不在数据语义里）
  for (const direction of scheduleDirections(line)) {
    for (const candidate of buildDirection(line, direction)) {
      const list = out.get(candidate.variantIndex);
      if (!list) continue;
      list.push({
        time: clockOf(candidate.minutes),
        minutes: candidate.minutes,
        station: candidate.station,
        direction,
        vehicle: candidate.vehicle,
      });
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.minutes - b.minutes);
  return out;
}
