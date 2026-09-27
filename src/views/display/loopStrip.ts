// 环线（首尾同站的闭合线路）在 /display 上的专用数据：规范化 → 按运行方向取序 → 按当前站滚动。
// 原始数据一律不改：数据里末尾那个「闭合用的重复站」只在这里被去掉（静态条带）或再补回来（滚动条带）。
import {
  splitSpans,
  type Direction,
  type ProgressModel,
  type ProgressStep,
  type RouteSpan,
  type StationState,
} from './dynamicStrip';

/**
 * 环线判定：数据把闭合站写在末尾（首尾同站）。要求扣掉重复站后至少还有 3 站 ——
 * `A → B → A` 这种往返不是环线，仍按普通线路画。
 */
export function isLoop(stations: string[]): boolean {
  return stations.length > 3 && stations[0] === stations[stations.length - 1];
}

/** 规范化环序：去掉末尾那个重复的闭合站（非环线原样返回一份拷贝） */
export function loopRing(stations: string[]): string[] {
  return isLoop(stations) ? stations.slice(0, -1) : [...stations];
}

/** 运行方向上的环序：上行 = 数据顺序，下行 = 反向绕行（内环 / 外环两个方向各画各的序） */
export function ringOrder(ring: string[], dir: Direction): string[] {
  return dir === 'down' ? [...ring].reverse() : [...ring];
}

/**
 * 滚动后的渲染站序：**刚经过的那一站**（接缝站）打头、其余按运行方向顺延，末尾再补一次它。
 * 于是接缝站在条带上出现两次（首尾同站），列车位置永远落在条带的接缝旁，
 * 跨过起点 / 终点时也只是整条条带向前滚一格，不会跳变。
 */
export function rollRing(ring: string[], seamId: string, dir: Direction): string[] {
  const order = ringOrder(ring, dir);
  const at = order.indexOf(seamId);
  const rolled = at > 0 ? [...order.slice(at), ...order.slice(0, at)] : order;
  return [...rolled, rolled[0]];
}

export interface LoopProgress extends ProgressModel {
  /** 这一步条带的接缝站（首末两列那一个）= 刚经过的站；视图据此重建滚动后的条带 */
  rollId: string;
}

/** 滚动后条带上的第 i 段区间（列 i → 列 i + 1） */
function interval(i: number): RouteSpan {
  return { kind: 'trunk', lane: 0, fromCol: i, toCol: i + 1, lead: false };
}

/**
 * 环线的进度模型。列口径 = **滚动后**的条带：第 0 列与第 n 列是同一个站（**刚经过的接缝站**），
 * 第 1 列是列车正对着的那一站（到站状态下就是它），其余是整圈的前方站。
 * `order` 是运行方向上的环序（`ringOrder` 的结果，站名只用于步骤标签）。
 *
 * 与直线的 `buildProgress` 不同：环线上没有「不在本趟行程上」的站，条带永远只画
 * 「刚经过的接缝站 + 前方一整圈」，于是站色只有三档 —— 首列（刚经过的接缝站）灰；
 * 到站的那一站（第 1 列）原色 + 闪站名；**第 2 列到末尾全亮**（末尾那一列虽然与首列同站，
 * 但它是这一圈最后要到的站，所以照样亮）。当前区间永远是滚动后条带的第一段（0 → 1）：
 * 区间状态下它正在一段一段点亮，到站状态下它已经是刚走完的那一段（因此不亮，两端之间其余整圈都亮）。
 */
export function buildLoopProgress(
  order: { id: string; name: string }[],
  progress: number,
  opts: { leave?: boolean } = {},
): LoopProgress {
  const leave = opts.leave ?? false;
  const n = Math.max(1, order.length);
  const per = leave ? 3 : 2;
  const first = [interval(0)];

  const steps: ProgressStep[] = [];
  order.forEach((station, k) => {
    const next = order[(k + 1) % n];
    steps.push({
      kind: 'station',
      col: 0,
      label: `${k + 1}. ${station.name}（到站）`,
      stationId: station.id,
    });
    steps.push({
      kind: 'enter',
      label: `区间：${station.name} → ${next.name}（出站）`,
      spans: first,
      fromId: station.id,
      toId: next.id,
    });
    if (leave) {
      steps.push({
        kind: 'leave',
        label: `区间：${station.name} → ${next.name}（即将入站）`,
        spans: first,
        fromId: station.id,
        toId: next.id,
      });
    }
  });

  const index = Math.min(Math.max(progress, 0), steps.length - 1);
  const k = Math.floor(index / per); // 第几个停站（0 起算）
  const phase = index % per; // 0 = 到站，> 0 = 区间（出站 / 即将入站）
  const atStation = phase === 0;

  // 接缝站（首末两列那一个）= 刚经过的站：区间状态下是出发站，到站状态下是**上一站** ——
  // 于是到站的那一站落在第二列（= 当前站，闪站名）。
  const seam = atStation ? order[(k - 1 + n) % n] : order[k];

  // 滚动后的条带有 n + 1 列：首列是刚经过的接缝站（灰）；从第 2 列到末尾一律常态高亮 ——
  // 末尾那一列虽然与首列同站，但它是这一圈最后要到的站，所以照样亮
  const states: Record<number, StationState> = {};
  for (let i = 0; i <= n; i++) {
    states[i] = i === 0 ? 'dim' : atStation && i === 1 ? 'current' : 'lit';
  }
  const intervals: RouteSpan[] = Array.from({ length: n }, (_, i) => interval(i));

  return {
    count: steps.length,
    index,
    steps,
    states,
    // 第一段永远在身后（到站的瞬间是刚走完的那一段，区间状态是正在经过的那一段），其余整圈都还没走到
    litSpans: intervals.slice(1),
    currentParts: atStation ? [] : splitSpans(first),
    activeLanes: [],
    rollId: seam.id,
  };
}
