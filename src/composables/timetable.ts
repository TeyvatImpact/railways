// 时刻表的纯逻辑（无 Vue 依赖）：数据形态、校验、发车时刻展开与区间间隔派生。
// 本阶段只做数据、校验与纯函数派生，不做 UI、不改任何现有行为。
import { hasVehicle } from '../config/vehicles';

export type TimetableDirection = 'up' | 'down';

/** 逐个时间点发车 */
export interface TimetableDeparture {
  /** `HH:mm`（00:00–23:59） */
  time: string;
  /** 发车站（必须是该变体站序里的完整站点 id） */
  station: string;
  /** `up` = 变体站序方向，`down` = 逆站序 */
  direction: TimetableDirection;
  /** 车型 id；解析后必定有值（缺省填该变体的车型） */
  vehicle: string;
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
}

/** 一个时段内的固定间隔（分钟）：整段作用于变体的所有区间 */
export interface TimetableIntervalBand {
  from: string;
  /** `to <= from` 视为跨天（+24h），同时间窗发车 */
  to: string;
  /** 分钟，正数 */
  interval: number;
}

export interface VariantTimetable {
  /**
   * 只写间隔、不含逐条发车信息：按时段给不同间隔。
   * 元素可为 `null` —— `null` 表示「任何时间的间隔都是无限大」，出现即压过同数组里的有限时段。
   * 与 `departures` 互斥 —— 写间隔的时刻表只能写时段间隔。
   */
  interval?: (TimetableIntervalBand | null)[];
  departures: (TimetableDeparture | TimetableWindow)[];
}

const BAND_KEYS = new Set(['from', 'to', 'interval']);

/** 判别：有时间窗（`every`）即为时间窗发车，否则是逐个时间点 */
export function isWindow(d: TimetableDeparture | TimetableWindow): d is TimetableWindow {
  return 'every' in d;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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
          throw new Error(`${p}第 ${i} 段间隔只能写 from / to / interval，多写了 ${key}`);
      const from = b.from;
      const to = b.to;
      if (typeof from !== 'string' || !TIME_RE.test(from))
        throw new Error(`${p}第 ${i} 段间隔 from ${from} 不是 HH:mm`);
      if (typeof to !== 'string' || !TIME_RE.test(to))
        throw new Error(`${p}第 ${i} 段间隔 to ${to} 不是 HH:mm`);
      if (typeof b.interval !== 'number' || !(b.interval > 0))
        throw new Error(`${p}第 ${i} 段间隔 interval 必须是正数`);
      return { from, to, interval: b.interval };
    });
  }

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

    if (hasTime) {
      const time = d.time as string;
      if (typeof time !== 'string' || !TIME_RE.test(time))
        throw new Error(`${p}发车时间 ${time} 不是 HH:mm`);
      out.departures.push({
        time,
        station,
        direction: direction as TimetableDirection,
        vehicle,
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
    });
  });

  return out;
}

/** 时间窗展开成逐个时刻，按当日（可跨天）绝对分钟数升序（同刻保持数组顺序） */
export function expandDepartures(t: VariantTimetable): TimetableDeparture[] {
  const out: { abs: number; dep: TimetableDeparture }[] = [];
  for (const d of t.departures) {
    if (isWindow(d)) {
      const from = minuteOf(d.from);
      let to = minuteOf(d.to);
      if (to <= from) to += 1440;
      for (let x = from; x <= to; x += d.every) {
        out.push({
          abs: x,
          dep: { time: clockOf(x), station: d.station, direction: d.direction, vehicle: d.vehicle },
        });
      }
    } else {
      out.push({ abs: minuteOf(d.time), dep: { ...d } });
    }
  }
  return out.sort((a, b) => a.abs - b.abs).map((x) => x.dep);
}

/** 无向站对键：`[a,b].sort().join('|')`（与 connections 的键同口径） */
export function segmentKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/**
 * 每条区间的最小固定间隔（分钟）：凡写了时段间隔的变体，对其站序里每对相邻站取所有时段 interval 的 `min`。
 * `interval` 里出现 `null` 的变体 —— 它声明「任何时间间隔无限大」—— 该变体的间隔视为 `Infinity`（压过自己的有限时段）。
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
      let headway: number | undefined;
      for (const band of bands) {
        if (band === null) {
          headway = Infinity;
          break;
        }
        headway = headway === undefined ? band.interval : Math.min(headway, band.interval);
      }
      if (headway === undefined) continue;
      for (let i = 0; i < variant.stations.length - 1; i++) {
        const key = segmentKey(variant.stations[i], variant.stations[i + 1]);
        const cur = map.get(key);
        map.set(key, cur === undefined ? headway : Math.min(cur, headway));
      }
    }
  }
  return map;
}
