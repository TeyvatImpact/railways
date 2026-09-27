// 时刻表的纯逻辑（无 Vue 依赖）：数据形态、校验、发车时刻展开与区间间隔派生。
// 本阶段只做数据、校验与纯函数派生，不做 UI、不改任何现有行为。
import { hasVehicle } from '../config/vehicles';

export type TimetableDirection = 'up' | 'down';

/** 逐个时间点发车 */
export interface TimetableDeparture {
  /** `HH:mm`（数据里的写法；跨天时间窗展开出的时刻会绕回表盘，时刻值以 `minutes` 为准） */
  time: string;
  /** 当日（可跨天）绝对分钟数：单点 = `time`，时间窗展开后 = 实际时刻 */
  minutes: number;
  /** 发车站（必须是该变体站序里的完整站点 id） */
  station: string;
  /** `up` = 变体站序方向，`down` = 逆站序 */
  direction: TimetableDirection;
  /** 车型 id；解析后必定有值（缺省填该变体的车型） */
  vehicle: string;
  /** 折返：开到该方向的终点后，停站（`dwell`）再按反向开回发车站 —— 一趟车同时是上行与下行 */
  turnback?: boolean;
}

/** 时间窗发车：自 `from` 起每 `every` 分钟一辆，发车时刻 ≤ `to`（去尾）；`to <= from` 视为跨天（+24h） */
export interface TimetableWindow {
  from: string;
  to: string;
  /** 分钟 */
  every: number;
  station: string;
  direction: TimetableDirection;
  vehicle: string;
  /** 折返，同 `TimetableDeparture.turnback` */
  turnback?: boolean;
}

/** 一个时段内的固定间隔：整段作用于变体的区间，除非用 `between` 限定范围 */
export interface TimetableIntervalBand {
  from: string;
  /** `to <= from` 视为跨天（+24h），同时间窗发车；`"24:00"` = 当日 24 时（次日 00:00） */
  to: string;
  /** 分钟（正数）；`null` = 该时段不开行（间隔无限大） */
  interval: number | null;
  /**
   * 只作用于这段范围内的区间：数据里写 `between: [起站, 末站]`（两端都必须在变体站序里、顺序一致），
   * 解析后展开成该范围的站序；省略 = 整条变体的所有区间。
   */
  stations?: readonly string[];
}

/** 停站时间（分钟）：`default` + 逐站覆盖；只作数据与派生，不参与行程时间计算 */
export interface VariantDwell {
  default: number;
  stations?: Record<string, number>;
}

export interface VariantTimetable {
  /**
   * 只写间隔、不含逐条发车信息：按时段给不同间隔。
   * 时段**按数组顺序**依次覆盖，后面的段盖住前面的段（相同时刻以最后一段为准，见 `intervalAt`）；
   * `null` 元素覆盖所有时刻，即「该时刻的间隔无限大」。
   * 空档（没有任何时段覆盖的时刻）同样是「不开行」= 无限大。
   * 与 `departures` 互斥 —— 写间隔的时刻表只能写时段间隔。
   */
  interval?: (TimetableIntervalBand | null)[];
  departures: (TimetableDeparture | TimetableWindow)[];
  /** 停站时间（可选） */
  dwell?: VariantDwell;
}

const BAND_KEYS = new Set(['from', 'to', 'interval', 'between']);
const DWELL_KEYS = new Set(['default', 'stations']);

/** 判别：有时间窗（`every`）即为时间窗发车，否则是逐个时间点 */
export function isWindow(d: TimetableDeparture | TimetableWindow): d is TimetableWindow {
  return 'every' in d;
}

/** `HH:mm`；`24:00` 只作为「当日 24 时」出现（等于次日 00:00，分钟数 1440） */
const TIME_RE = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

function minuteOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function clockOf(minutes: number): string {
  const t = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export interface TimetableContext {
  lineId: string;
  variantIndex: number;
  virtual: boolean;
  oneWay: boolean;
  /** 该变体已展开完整 id 的站序 */
  stations: string[];
  vehicle: string;
}

/** 解析并校验停站时间；`raw === undefined` → 无停站数据 */
function parseDwell(raw: unknown, p: string, ctx: TimetableContext): VariantDwell | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${p}时刻表 dwell 必须是对象`);
  const data = raw as Record<string, unknown>;
  for (const key of Object.keys(data))
    if (!DWELL_KEYS.has(key))
      throw new Error(`${p}时刻表 dwell 只能写 default / stations，多写了 ${key}`);
  const fallback = data.default;
  if (typeof fallback !== 'number' || !Number.isFinite(fallback) || fallback < 0)
    throw new Error(`${p}时刻表 dwell.default 必须是非负数字（分钟）`);
  const out: VariantDwell = { default: fallback };
  if (data.stations === undefined) return out;
  if (typeof data.stations !== 'object' || data.stations === null || Array.isArray(data.stations))
    throw new Error(`${p}时刻表 dwell.stations 必须是「站 id → 分钟」的对象`);
  const overrides: Record<string, number> = {};
  for (const [station, value] of Object.entries(data.stations as Record<string, unknown>)) {
    if (!ctx.stations.includes(station))
      throw new Error(`${p}时刻表 dwell 的站 ${station} 不在该变体的站序里`);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new Error(`${p}时刻表 dwell 的站 ${station} 停站时间必须是非负数字（分钟）`);
    overrides[station] = value;
  }
  if (Object.keys(overrides).length > 0) out.stations = overrides;
  return out;
}

/** 解析并校验一个变体的时刻表；`raw === undefined` → 空时刻表 */
export function parseTimetable(raw: unknown, ctx: TimetableContext): VariantTimetable {
  const p = `线路 ${ctx.lineId} 的变体 #${ctx.variantIndex} `;
  if (raw === undefined || raw === null) return { departures: [] };
  if (ctx.virtual) throw new Error(`${p}虚拟线路不应有时刻表`);
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${p}时刻表必须是对象`);
  const data = raw as Record<string, unknown>;

  const out: VariantTimetable = { departures: [] };
  if (data.interval !== undefined && data.departures !== undefined)
    throw new Error(`${p}时刻表只能二选一：只写间隔的 interval 或逐条发车的 departures`);

  if (data.interval !== undefined) {
    if (!Array.isArray(data.interval) || data.interval.length === 0)
      throw new Error(`${p}时刻表 interval 必须是非空数组（按时段给间隔）`);
    out.interval = data.interval.map((entry, i) => {
      if (entry === null) return null;
      if (typeof entry !== 'object' || Array.isArray(entry))
        throw new Error(`${p}第 ${i} 段间隔必须是对象或 null`);
      const b = entry as Record<string, unknown>;
      for (const key of Object.keys(b))
        if (!BAND_KEYS.has(key))
          throw new Error(`${p}第 ${i} 段间隔只能写 from / to / interval / between，多写了 ${key}`);
      const from = b.from;
      const to = b.to;
      if (typeof from !== 'string' || !TIME_RE.test(from))
        throw new Error(`${p}第 ${i} 段间隔 from ${from} 不是 HH:mm`);
      if (typeof to !== 'string' || !TIME_RE.test(to))
        throw new Error(`${p}第 ${i} 段间隔 to ${to} 不是 HH:mm`);
      const interval = b.interval;
      if (interval !== null && (typeof interval !== 'number' || !(interval > 0)))
        throw new Error(`${p}第 ${i} 段间隔 interval 必须是正数或 null（不开行）`);
      const band: TimetableIntervalBand = { from, to, interval };
      const between = b.between;
      if (between !== undefined) {
        if (
          !Array.isArray(between) ||
          between.length !== 2 ||
          between.some((s) => typeof s !== 'string')
        )
          throw new Error(`${p}第 ${i} 段间隔 between 必须是两个站 id 的数组`);
        const [start, end] = between as [string, string];
        const startIndex = ctx.stations.indexOf(start);
        const endIndex = ctx.stations.indexOf(end);
        if (startIndex < 0 || endIndex < 0)
          throw new Error(
            `${p}第 ${i} 段间隔 between 的站 ${startIndex < 0 ? start : end} 不在该变体的站序里`,
          );
        if (startIndex >= endIndex)
          throw new Error(
            `${p}第 ${i} 段间隔 between 的起止站必须按变体站序给出（${start} 在 ${end} 之前）`,
          );
        band.stations = ctx.stations.slice(startIndex, endIndex + 1);
      }
      return band;
    });
  }

  const dwell = parseDwell(data.dwell, p, ctx);
  if (dwell !== undefined) out.dwell = dwell;

  const departures = data.departures;
  if (departures !== undefined && !Array.isArray(departures))
    throw new Error(`${p}时刻表 departures 必须是数组`);

  (departures ?? []).forEach((entry, i) => {
    const d = entry as Record<string, unknown>;
    const hasTime = d.time !== undefined;
    const hasWindow = d.every !== undefined;
    if (hasTime === hasWindow)
      throw new Error(`${p}第 ${i} 条发车必须写 time 或 from/to/every（二选一）`);

    const station = d.station as string | undefined;
    if (station === undefined || !ctx.stations.includes(station))
      throw new Error(`${p}发车站 ${station} 不在该变体的站序里`);

    const direction = d.direction as string | undefined;
    if (direction !== 'up' && direction !== 'down')
      throw new Error(`${p}方向 ${direction} 必须是 up 或 down`);
    if (ctx.oneWay && direction === 'down') throw new Error(`${p}单向线路不能有 down 方向的发车`);

    const vehicle = (d.vehicle as string | undefined) ?? ctx.vehicle;
    if (!hasVehicle(vehicle)) throw new Error(`${p}引用了未知车型：${vehicle}`);

    const turnback = d.turnback;
    if (turnback !== undefined && typeof turnback !== 'boolean')
      throw new Error(`${p}第 ${i} 条发车的 turnback 必须是布尔值`);
    if (turnback && ctx.oneWay) throw new Error(`${p}第 ${i} 条发车是单向线路，不能折返`);

    if (hasTime) {
      const time = d.time as string;
      if (typeof time !== 'string' || !TIME_RE.test(time))
        throw new Error(`${p}发车时间 ${time} 不是 HH:mm`);
      out.departures.push({
        time,
        minutes: minuteOf(time),
        station,
        direction: direction as TimetableDirection,
        vehicle,
        ...(turnback ? { turnback } : {}),
      });
      return;
    }

    const from = d.from as string;
    const to = d.to as string;
    if (typeof from !== 'string' || !TIME_RE.test(from))
      throw new Error(`${p}发车时间 ${from} 不是 HH:mm`);
    if (typeof to !== 'string' || !TIME_RE.test(to))
      throw new Error(`${p}发车时间 ${to} 不是 HH:mm`);
    if (typeof d.every !== 'number' || !Number.isInteger(d.every) || d.every <= 0)
      throw new Error(`${p}时间窗 every 必须是正整数`);
    out.departures.push({
      from,
      to,
      every: d.every,
      station,
      direction: direction as TimetableDirection,
      vehicle,
      ...(turnback ? { turnback } : {}),
    });
  });

  return out;
}

/**
 * 时间窗展开成逐个时刻，按当日（可跨天）绝对分钟数升序。
 * 同一站、同一方向、同一时刻、同一车型的重复班次只算一班（两个时间窗首尾相接时不会出现两班同刻车）。
 */
export function expandDepartures(t: VariantTimetable): TimetableDeparture[] {
  const out: TimetableDeparture[] = [];
  for (const d of t.departures) {
    if (isWindow(d)) {
      const from = minuteOf(d.from);
      let to = minuteOf(d.to);
      if (to <= from) to += 1440;
      for (let x = from; x <= to; x += d.every) {
        out.push({
          time: clockOf(x),
          minutes: x,
          station: d.station,
          direction: d.direction,
          vehicle: d.vehicle,
          ...(d.turnback ? { turnback: true } : {}),
        });
      }
    } else {
      out.push({ ...d });
    }
  }
  out.sort((a, b) => a.minutes - b.minutes);
  return out.filter(
    (dep, index) =>
      index === 0 ||
      dep.minutes !== out[index - 1].minutes ||
      dep.station !== out[index - 1].station ||
      dep.direction !== out[index - 1].direction ||
      dep.vehicle !== out[index - 1].vehicle,
  );
}

/** 无向站对键：`[a,b].sort().join('|')`（与 connections 的键同口径） */
export function segmentKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/**
 * 该时段是否覆盖这一分钟：时段是**半开区间 `[from, to)`**（服务时段 `06:00–23:00` = 06:00 起、23:00 前），
 * `to <= from` 视为跨天（如 `22:00 → 01:00` 覆盖 22:00–01:00 之前），`to = from` = 全天。
 */
function bandCovers(band: TimetableIntervalBand, minutes: number): boolean {
  const from = minuteOf(band.from);
  const rawTo = minuteOf(band.to);
  const to = rawTo <= from ? rawTo + 1440 : rawTo;
  return (minutes >= from && minutes < to) || (minutes + 1440 >= from && minutes + 1440 < to);
}

/** 该时段的取值变化点（分钟，0–1440）：起点与终点 */
function bandCuts(band: TimetableIntervalBand): number[] {
  return [minuteOf(band.from), minuteOf(band.to) % 1440];
}

/**
 * 某区间（`segment` = 两端站 id，顺序无关）在某时刻（`HH:mm`）的生效间隔（分钟）：
 * 时段**按数组顺序**依次覆盖，后面的段盖住前面的段；带 `stations` 范围的段只作用于两端站都落在该范围内的区间。
 * **没有任何段覆盖该时刻 = 不开行 → `Infinity`**（空档就是不开行），段 `interval: null` 同样是无限大。
 */
export function intervalAt(
  bands: readonly (TimetableIntervalBand | null)[],
  time: string,
  segment: readonly [string, string],
): number {
  const minutes = minuteOf(time);
  let out = Infinity;
  for (const band of bands) {
    if (band === null) {
      out = Infinity;
      continue;
    }
    if (!bandCovers(band, minutes)) continue;
    if (
      band.stations !== undefined &&
      !(band.stations.includes(segment[0]) && band.stations.includes(segment[1]))
    )
      continue;
    out = band.interval ?? Infinity;
  }
  return out;
}

/**
 * 某区间一天里生效间隔的最小值。生效间隔只在时段边界之间恒定，所以取样 00:00 与所有边界
 * （每个 `from`、每个 `to`，模 1440）就够；全天都不开行的区间得到 `Infinity`。
 */
function minIntervalOfDay(
  bands: readonly (TimetableIntervalBand | null)[],
  segment: readonly [string, string],
): number {
  const samples = new Set([0]);
  for (const band of bands) {
    if (band === null) continue;
    for (const cut of bandCuts(band)) samples.add(cut);
  }
  let min = Infinity;
  for (const minutes of samples) min = Math.min(min, intervalAt(bands, clockOf(minutes), segment));
  return min;
}

/**
 * 每条区间的最小固定间隔（分钟）：凡写了时段间隔的变体，按其站序里每对相邻站记该变体一天里的最小生效间隔
 * （见 `intervalAt` / `minIntervalOfDay`）；一天里始终不开行的区间是 `Infinity`。
 * 跨变体取 `min`，所以别的变体的有限间隔不会被某条变体的 `Infinity` 抬高。
 */
export function buildSegmentHeadways(
  lines: readonly {
    variants: { stations: string[]; timetable: VariantTimetable }[];
  }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    for (const variant of line.variants) {
      const bands = variant.timetable.interval;
      if (bands === undefined) continue;
      for (let i = 0; i < variant.stations.length - 1; i++) {
        const a = variant.stations[i];
        const b = variant.stations[i + 1];
        const headway = minIntervalOfDay(bands, [a, b]);
        const key = segmentKey(a, b);
        const cur = map.get(key);
        map.set(key, cur === undefined ? headway : Math.min(cur, headway));
      }
    }
  }
  return map;
}

/** 某站的停站时间（分钟）：逐站覆盖 → `default`；没有停站数据 → `undefined` */
export function dwellAt(dwell: VariantDwell | undefined, stationId: string): number | undefined {
  if (dwell === undefined) return undefined;
  return dwell.stations?.[stationId] ?? dwell.default;
}

/** 一组「时段间隔」+ 它作用的区间 */
export interface IntervalSource {
  bands: readonly (TimetableIntervalBand | null)[];
  segment: readonly [string, string];
}

/** 一段生效间隔：`from`–`to` 之间（`HH:mm`，`to` 为 24:00 表示到日终）间隔恒为 `interval` 分钟 */
export interface IntervalSegment {
  from: string;
  to: string;
  /** 分钟；`Infinity` = 不开行 */
  interval: number;
}

/** `to` 为 24:00 的收尾时刻用 `24:00` 表示（`clockOf(1440)` 会绕回 00:00） */
function dayClockOf(minutes: number): string {
  return minutes >= 1440 ? '24:00' : clockOf(minutes);
}

/**
 * 把多组「时段间隔」按时刻取 `min`，切成按时间顺序排列的段（00:00–24:00 全覆盖，相邻同值合并）。
 * 用于「这个站这条线多久一趟」：同一时刻的多个来源（多交路 / 站两侧的区间）取最密的那一班；
 * 某段被后面的段打断就会被拆成多段分别排出来。
 */
export function mergeIntervalSources(sources: readonly IntervalSource[]): IntervalSegment[] {
  const cuts = new Set([0, 1440]);
  for (const { bands } of sources) {
    for (const band of bands) {
      if (band === null) continue;
      for (const cut of bandCuts(band)) cuts.add(cut);
    }
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const out: IntervalSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    let interval = Infinity;
    for (const source of sources)
      interval = Math.min(interval, intervalAt(source.bands, clockOf(start), source.segment));
    const last = out[out.length - 1];
    if (last !== undefined && last.interval === interval) last.to = dayClockOf(end);
    else out.push({ from: dayClockOf(start), to: dayClockOf(end), interval });
  }
  return out;
}
