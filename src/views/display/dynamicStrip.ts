// /display 动态模式的进度模型：把「变体站序 + 方向 + 进度序号」翻译成
// 「每列该显示为灰 / 原色 / 闪烁」与「哪几段线路要按原色点亮」，不碰任何 CSS。
// 灰是默认态：不在本趟变体行程上的站与段永远不会被点亮。
import type { StripModel, StripStationModel } from './stripModel';

export type Direction = 'up' | 'down';

/** 一段要着色的线路几何；列号口径 = StripStationModel.col，行 = 7 + lane（见 index.vue 的 .track / .lane-*） */
export interface RouteSpan {
  /** trunk = 主线行区间；diag = 支线 45° 汇入引线（单列）；lane = 支线车道区间 */
  kind: 'trunk' | 'diag' | 'lane';
  /** 0 = 主线行，1 起算 = 第几条支线车道 */
  lane: number;
  fromCol: number;
  /** diag 时 = fromCol */
  toCol: number;
  /** lane 段是否从引线落点起（CSS 需加 lane-row / 2 + 9px 的左缩进） */
  lead: boolean;
}

export type ProgressStep =
  | { kind: 'station'; col: number; label: string; stationId: string }
  | { kind: 'enter' | 'leave'; label: string; spans: RouteSpan[]; fromId: string; toId: string };

/** 站 / 站名在动态模式下的呈现：dim = 灰（不在行程上或已经过）、lit = 原色（还没到）、current = 闪烁 */
export type StationState = 'dim' | 'lit' | 'current';

export interface ProgressModel {
  /** 进度状态总数：2N-1（仅出站）/ 3N-2（出站与即将入站都启用）= N 个停站 + 每段 1~2 个区间状态 */
  count: number;
  /** 当前进度，已夹紧到 [0, count-1] */
  index: number;
  steps: ProgressStep[];
  /** 每一列的状态；键 = 并集列号（环线首末同站占两列，各算一个） */
  states: Record<number, StationState>;
  /** 还没到的行程段：按原色点亮 */
  litSpans: RouteSpan[];
  /** 正在经过的行程段：按原色闪烁（停站状态时为空 —— 闪烁落在该站圆圈上） */
  currentSpans: RouteSpan[];
  /** 本趟行程用到的支线车道（1 起算）；不在里面的车道连「支线」标签块一起保持灰 */
  activeLanes: number[];
}

/** 关闭动态模式时用的空模型（此时不点亮、也不加灰） */
export const EMPTY_PROGRESS: ProgressModel = {
  count: 0,
  index: 0,
  steps: [],
  states: {},
  litSpans: [],
  currentSpans: [],
  activeLanes: [],
};

/**
 * 变体站序 → 条带列序：按列从左到右对变体站序做子序列匹配。
 * 环线的同名首末站因此对应两列；变体不经过的列（如另一条支线的独占站）自动跳过。
 */
export function routeCols(stations: { id: string; col: number }[], stationIds: string[]): number[] {
  const out: number[] = [];
  let k = 0;
  for (const station of stations) {
    if (k < stationIds.length && station.id === stationIds[k]) {
      out.push(station.col);
      k++;
    }
  }
  return out;
}

/** 相邻两站之间的线路段；认不出的组合（跨车道来回）给空数组 —— 进度照常推进，只是没有高亮 */
function intervalSpans(a: StripStationModel, b: StripStationModel): RouteSpan[] {
  if (a.lane === 0 && b.lane === 0) {
    return [{ kind: 'trunk', lane: 0, fromCol: a.col, toCol: b.col, lead: false }];
  }
  if (a.lane === 0) {
    return [
      { kind: 'diag', lane: b.lane, fromCol: a.col, toCol: a.col, lead: false },
      { kind: 'lane', lane: b.lane, fromCol: a.col, toCol: b.col, lead: true },
    ];
  }
  if (a.lane === b.lane) {
    return [{ kind: 'lane', lane: a.lane, fromCol: a.col, toCol: b.col, lead: false }];
  }
  return [];
}

/**
 * 一趟行程的进度模型。`stationIds` 取变体自己的站序（`line.variants[i].stations`）；
 * `dir` = 'up' 顺站序（条带图上从左到右）、`down` 逆站序；
 * `opts.leave` = 是否插入「离开区间（即将入站）」状态（默认 false，由 announce.config 的 PROGRESS_STATES 决定）。
 */
export function buildProgress(
  strip: StripModel,
  stationIds: string[],
  dir: Direction,
  progress: number,
  opts: { leave?: boolean } = {},
): ProgressModel {
  const includeLeave = opts.leave ?? false;
  const cols = routeCols(strip.stations, stationIds);
  if (!cols.length) return EMPTY_PROGRESS;
  if (dir === 'down') cols.reverse();

  const byCol = new Map(strip.stations.map((station) => [station.col, station]));
  const steps: ProgressStep[] = [];
  cols.forEach((col, i) => {
    const station = byCol.get(col)!;
    steps.push({
      kind: 'station',
      col,
      label: `${i + 1}. ${station.name}（到站）`,
      stationId: station.id,
    });
    const next = i + 1 < cols.length ? byCol.get(cols[i + 1])! : null;
    if (!next) return;
    const spans = intervalSpans(station, next);
    steps.push({
      kind: 'enter',
      label: `区间：${station.name} → ${next.name}（出站）`,
      spans,
      fromId: station.id,
      toId: next.id,
    });
    if (includeLeave) {
      steps.push({
        kind: 'leave',
        label: `区间：${station.name} → ${next.name}（即将入站）`,
        spans,
        fromId: station.id,
        toId: next.id,
      });
    }
  });

  const index = Math.min(Math.max(progress, 0), steps.length - 1);
  // 整条线路默认都是灰的（不在本趟行程上的段与站永远不会被点亮），只把「还没走到的行程」点亮
  const states: Record<number, StationState> = {};
  for (const station of strip.stations) states[station.col] = 'dim';
  const litSpans: RouteSpan[] = [];
  const currentSpans: RouteSpan[] = [];
  // 「出站 / 即将入站」两个状态共用同一份 spans，点亮时按数组身份去重（否则同一段会叠两层同样的条）
  const litSpanSets = new Set<RouteSpan[]>();
  for (let i = index; i < steps.length; i++) {
    const step = steps[i];
    if (step.kind === 'station') {
      states[step.col] = i === index ? 'current' : 'lit';
    } else if (i === index) {
      currentSpans.push(...step.spans);
    } else if (!litSpanSets.has(step.spans)) {
      litSpanSets.add(step.spans);
      litSpans.push(...step.spans);
    }
  }

  const activeLanes = [
    ...new Set(cols.map((col) => byCol.get(col)!.lane).filter((lane) => lane > 0)),
  ].sort((a, b) => a - b);

  return { count: steps.length, index, steps, states, litSpans, currentSpans, activeLanes };
}
