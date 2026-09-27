import type { RenderSegment } from './useMapData';

/** 一段渲染线段在曲线模式下的几何信息 */
export interface CurveSegment {
  /** SVG path；空串表示该段不单独绘制（同一站间区间的曲线画在区间首段上） */
  d: string;
  /** 是否真的存在曲线；false 时标签按原直线几何定位 */
  curved: boolean;
  /** 曲线中点坐标（用于标签定位） */
  midX: number;
  /** 曲线中点坐标（用于标签定位） */
  midY: number;
  /** 曲线中点处的切线方向（度，沿参数增大的方向） */
  angle: number;
}

/** 判定零长度的容差（SVG 用户单位，等于 1/50 数据单位） */
const EPS = 0.01;

/** 合并重合顶点的容差：相邻区间的并行轨道偏移要么完全相同，要么相差一个线宽 */
const MERGE = 1e-6;

/** 向心 Catmull-Rom 参数化指数 */
const ALPHA = 0.5;

/** 曲线顶点（SVG 用户单位） */
export interface Pt {
  x: number;
  y: number;
}

/**
 * 向心 Catmull-Rom 三次贝塞尔控制点：曲线经过 p1、p2，p0/p3 决定两端切线。
 * 节点取累计弦长的 ALPHA 次幂（非均匀参数化，避免不等距站点处的过冲与打结）。
 */
export function bezierControls(p0: Pt, p1: Pt, p2: Pt, p3: Pt): { c1: Pt; c2: Pt } {
  // 重合点会让节点增量归零；取一个下限，此时对应的差向量本身也是零向量，公式仍然有限
  const k01 = Math.max(Math.pow(Math.hypot(p1.x - p0.x, p1.y - p0.y), ALPHA), 1e-3);
  const k12 = Math.max(Math.pow(Math.hypot(p2.x - p1.x, p2.y - p1.y), ALPHA), 1e-3);
  const k23 = Math.max(Math.pow(Math.hypot(p3.x - p2.x, p3.y - p2.y), ALPHA), 1e-3);
  const t0 = 0;
  const t1 = t0 + k01;
  const t2 = t1 + k12;
  const t3 = t2 + k23;

  const m1x =
    (t2 - t1) * ((p1.x - p0.x) / (t1 - t0) - (p2.x - p0.x) / (t2 - t0) + (p2.x - p1.x) / (t2 - t1));
  const m1y =
    (t2 - t1) * ((p1.y - p0.y) / (t1 - t0) - (p2.y - p0.y) / (t2 - t0) + (p2.y - p1.y) / (t2 - t1));
  const m2x =
    (t2 - t1) * ((p2.x - p1.x) / (t2 - t1) - (p3.x - p1.x) / (t3 - t1) + (p3.x - p2.x) / (t3 - t2));
  const m2y =
    (t2 - t1) * ((p2.y - p1.y) / (t2 - t1) - (p3.y - p1.y) / (t3 - t1) + (p3.y - p2.y) / (t3 - t2));

  return {
    c1: { x: p1.x + m1x / 3, y: p1.y + m1y / 3 },
    c2: { x: p2.x - m2x / 3, y: p2.y - m2y / 3 },
  };
}

function bezierPoint(p1: Pt, c1: Pt, c2: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p1.x + b * c1.x + c * c2.x + d * p2.x,
    y: a * p1.y + b * c1.y + c * c2.y + d * p2.y,
  };
}

function bezierTangent(p1: Pt, c1: Pt, c2: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: 3 * u * u * (c1.x - p1.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (p2.x - c2.x),
    y: 3 * u * u * (c1.y - p1.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (p2.y - c2.y),
  };
}

/** 数值取整到 3 位小数，压缩 path 字符串 */
function round3(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
}

function straight(a: Pt, b: Pt): string {
  return `M ${round3(a.x)} ${round3(a.y)} L ${round3(b.x)} ${round3(b.y)}`;
}

/**
 * 一条链（同一线路上首尾相接的一串站间区间）转成 Catmull-Rom 曲线。
 *
 * 顶点只取区间两端（即真实站点位置）——折线为了走直角/对角而插入的中间点
 * 不参与曲线，因此曲线不会假设它存在。
 */
function buildChain(
  pairs: readonly number[][],
  segments: readonly RenderSegment[],
  out: CurveSegment[],
) {
  const verts: Pt[] = [];
  const from: number[] = [];
  const to: number[] = [];

  const push = (p: Pt): number => {
    const prev = verts[verts.length - 1];
    if (!prev || Math.abs(prev.x - p.x) > MERGE || Math.abs(prev.y - p.y) > MERGE) verts.push(p);
    return verts.length - 1;
  };

  for (const parts of pairs) {
    const first = segments[parts[0]];
    const last = segments[parts[parts.length - 1]];
    from.push(push({ x: first.x1, y: first.y1 }));
    to.push(push({ x: last.x2, y: last.y2 }));
  }

  for (let k = 0; k < pairs.length; k++) {
    const parts = pairs[k];
    const p1 = verts[from[k]];
    const p2 = verts[to[k]];
    const hidden: CurveSegment = { d: '', curved: true, midX: 0, midY: 0, angle: 0 };

    if (from[k] === to[k]) {
      // 零长度区间（同站连接）：没有可平滑的跨度，保持原样渲染
      const d = straight(p1, p2);
      out[parts[0]] = { d, curved: false, midX: p1.x, midY: p1.y, angle: 0 };
      for (let i = 1; i < parts.length; i++) out[parts[i]] = { ...hidden, d, curved: false };
      continue;
    }

    // 链端用镜像点补全，得到自然的出/入切线
    const p0 = from[k] > 0 ? verts[from[k] - 1] : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
    const end = to[k];
    const p3 = end < verts.length - 1 ? verts[end + 1] : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    const { c1, c2 } = bezierControls(p0, p1, p2, p3);

    const mid = bezierPoint(p1, c1, c2, p2, 0.5);
    const tan = bezierTangent(p1, c1, c2, p2, 0.5);
    const angle = (Math.atan2(tan.y, tan.x) * 180) / Math.PI;
    const d =
      `M ${round3(p1.x)} ${round3(p1.y)}` +
      ` C ${round3(c1.x)} ${round3(c1.y)} ${round3(c2.x)} ${round3(c2.y)}` +
      ` ${round3(p2.x)} ${round3(p2.y)}`;

    // 整条区间的曲线画在区间首段上；折线中间点之后的残余段不单独绘制
    out[parts[0]] = { d, curved: true, midX: mid.x, midY: mid.y, angle };
    for (let i = 1; i < parts.length; i++)
      out[parts[i]] = { ...hidden, midX: mid.x, midY: mid.y, angle };
  }
}

/**
 * 把渲染线段转成穿过站点的向心 Catmull-Rom 曲线。
 * 返回与入参数组等长的数组、按索引对齐（线段 id 可能重复，不能作为键）。
 */
export function buildCurveSegments(segments: readonly RenderSegment[]): CurveSegment[] {
  const out: CurveSegment[] = segments.map(() => ({
    d: '',
    curved: false,
    midX: 0,
    midY: 0,
    angle: 0,
  }));

  // 线路 → 站间区间 → 区间内的各段（折线中间点会把一个区间拆成两段）
  const byLine = new Map<string, Map<number, number[]>>();
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    let pairs = byLine.get(seg.lineId);
    if (!pairs) {
      pairs = new Map();
      byLine.set(seg.lineId, pairs);
    }
    let parts = pairs.get(seg.pairIndex);
    if (!parts) {
      parts = [];
      pairs.set(seg.pairIndex, parts);
    }
    parts.push(i);
  }

  for (const pairMap of byLine.values()) {
    // 线段按几何分组输出，顺序未必等于站点顺序，必须按区间序号排序
    const pairs = [...pairMap.entries()].sort((a, b) => a[0] - b[0]).map(([, parts]) => parts);
    for (const parts of pairs) parts.sort((a, b) => segments[a].partIndex - segments[b].partIndex);

    // 折返（下一区间与原区间几何相同）处断链，避免曲线自己绕回去
    const chains: number[][][] = [];
    let chain: number[][] = [];
    let prevId = '';
    for (const parts of pairs) {
      if (chain.length && segments[parts[0]].id === prevId) {
        chains.push(chain);
        chain = [];
      }
      chain.push(parts);
      prevId = segments[parts[0]].id;
    }
    if (chain.length) chains.push(chain);

    for (const c of chains) buildChain(c, segments, out);
  }

  return out;
}
