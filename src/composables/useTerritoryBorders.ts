import { stations, minX, minY } from './useMapData';
import { BLOCK_SIZE, BORDER_CORNER_RADIUS, type BorderSmoothing } from '../config/render.config';
import { bezierControls, type Pt } from './useCurveGeometry';

/**
 * 归属边界（国家/地区边界线 + 区域边界线）。
 *
 * 划分规则是「离哪个站点最近就归谁」：平面上每一点取最近的站点，用它在 `regions.json`
 * 里的归属单位（国家/地区 × 区域；同一国家里「没有区域」的站点自成一档）作为该点的归属。
 * 于是边界就是相邻归属单位之间的 **Voronoi 边界** —— 站点坐标一动，边界跟着动。
 *
 * 算法（Delaunay 三角剖分 + marching triangles，精确解、无栅格、无容差）：
 * 1. 对全部站点做 Delaunay 三角剖分（Bowyer–Watson + Lawson 翻边修复）；
 * 2. 每个三角形的外心就是它三个站点 Voronoi 单元的真实交汇点；每条 Delaunay 边的中点
 *    就是该边两端站点 Voronoi 边的经过点（两端与这对站点等距）；
 * 3. 只保留**两端归属单位不同**的 Delaunay 边：它的中点连到相邻三角形的外心，得到的正是
 *    这两个单位之间的那截 Voronoi 边（精确，不是近似）；
 * 4. 边的类别由它两端站点决定：国家/地区不同 = 国家/地区边界；同国不同区域（含「无区域」）= 区域边界；
 * 5. 相邻三角形共用同一条 Delaunay 边 ⇒ 共用同一个交点，边界天然无缝、无重叠、无双线；
 *    最后按类别把线段接成折线、裁到站点凸包内，输出地图像素空间的 SVG path。
 *
 * 凸包裁剪只做「段与凸多边形求交」，不改拓扑：边界要么在凸包边上收口（外侧的 Voronoi 射线不画），
 * 要么是闭环（被完全包围的飞地）。近共线的边缘三角形外心会飞到很远，全靠这一步裁掉。
 * 模块加载时算一次（本机约 10ms），结果只依赖站点坐标与 `regions.json`。
 */

/** 两类边界：国家/地区边界线（粗）与区域边界线（细） */
export type TerritoryBorderKind = 'nation' | 'area';

export interface TerritoryBorderPath {
  id: string;
  /** SVG path，坐标已换算到地图像素空间（与站点 / 标注同一坐标系） */
  d: string;
}

interface Point {
  x: number;
  y: number;
}

type Triangle = [number, number, number];

// ---- 归属单位：一个国家/地区内的一个区域；`areaId` 为 `''` 表示该国内「无区域」的那一档 ----

const points: Point[] = stations.map((s) => ({ x: s.x, y: s.y }));
const units: { nationId: string; areaId: string }[] = [];
const unitIndexById = new Map<string, number>();
const stationUnit = new Int32Array(points.length);
stations.forEach((station, index) => {
  const key = `${station.nation.id}|${station.area?.id ?? ''}`;
  let unit = unitIndexById.get(key);
  if (unit === undefined) {
    unit = units.length;
    unitIndexById.set(key, unit);
    units.push({ nationId: station.nation.id, areaId: station.area?.id ?? '' });
  }
  stationUnit[index] = unit;
});

/** 节点标识：按 1e-4 单位量化坐标 —— 共享同一个 Voronoi 顶点的边（共圆）因此自动互相接上 */
const nodeKey = (p: Point): string => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;

/**
 * 最短可保留的边界段（数据单位，0.5px）：凸包裁剪会在边上留下亚像素级的碎段，
 * 它们短于输出精度（path 坐标取到 0.1px），画出来就是零长自环 —— 直接丢掉。
 */
const MIN_SEGMENT = 0.5 / BLOCK_SIZE;

// ---- 几何谓词 ----

function orient(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** d 是否落在 a、b、c 的外接圆内（与三点绕向无关） */
function inCircle(a: Point, b: Point, c: Point, d: Point): boolean {
  const adx = a.x - d.x;
  const ady = a.y - d.y;
  const bdx = b.x - d.x;
  const bdy = b.y - d.y;
  const cdx = c.x - d.x;
  const cdy = c.y - d.y;
  const det =
    (adx * adx + ady * ady) * (bdx * cdy - bdy * cdx) -
    (bdx * bdx + bdy * bdy) * (adx * cdy - ady * cdx) +
    (cdx * cdx + cdy * cdy) * (adx * bdy - ady * bdx);
  return orient(a, b, c) > 0 ? det > 0 : det < 0;
}

/** 三边（含端点序号）→ 与绕向无关的整数键，便于按边索引寻址 */
function edgeKey(a: number, b: number, vertexCount: number): number {
  return (a < b ? a : b) * vertexCount + (a < b ? b : a);
}

// ---- Delaunay：Bowyer–Watson + Lawson 翻边修复 ----

function buildDelaunay(pts: Point[]): Triangle[] {
  const n = pts.length;
  if (n < 3) return [];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  // 超三角形：足够大，保证所有点都落在它内部
  const all: Point[] = [
    ...pts,
    { x: centerX - 20 * span, y: centerY - span },
    { x: centerX + 20 * span, y: centerY - span },
    { x: centerX, y: centerY + 20 * span },
  ];
  const vertexCount = all.length;
  let triangles: Triangle[] = [[n, n + 1, n + 2]];

  for (let i = 0; i < n; i++) {
    const kept: Triangle[] = [];
    const cavity = new Map<number, [number, number, number]>();
    for (const t of triangles) {
      if (!inCircle(all[t[0]], all[t[1]], all[t[2]], pts[i])) {
        kept.push(t);
        continue;
      }
      const edges: [number, number][] = [
        [t[0], t[1]],
        [t[1], t[2]],
        [t[2], t[0]],
      ];
      for (const [a, b] of edges) {
        const key = edgeKey(a, b, vertexCount);
        const entry = cavity.get(key);
        if (entry) entry[2]++;
        else cavity.set(key, [a, b, 1]);
      }
    }
    // 空洞的边界 = 只被一个坏三角形用到的边，把它们与新点连成新三角形
    for (const [a, b, count] of cavity.values()) if (count === 1) kept.push([a, b, i]);
    triangles = kept;
  }

  let result = triangles.filter((t) => t[0] < n && t[1] < n && t[2] < n);

  // 修复：共圆退化（本项目站点落在 1 单位格点上，四点共圆很常见）可能留下非 Delaunay 的边，
  // 用 Lawson 翻边把每条边的空圆性质修正过来；已经是 Delaunay 时一轮即退出。
  for (let pass = 0; pass < 8; pass++) {
    const byEdge = new Map<number, number[]>();
    result.forEach((t, index) => {
      const edges: [number, number][] = [
        [t[0], t[1]],
        [t[1], t[2]],
        [t[2], t[0]],
      ];
      for (const [a, b] of edges) {
        const key = edgeKey(a, b, vertexCount);
        const list = byEdge.get(key);
        if (list) list.push(index);
        else byEdge.set(key, [index]);
      }
    });
    let flipped = false;
    for (const [key, list] of byEdge) {
      if (list.length !== 2) continue;
      const first = result[list[0]];
      const second = result[list[1]];
      const a = Math.floor(key / vertexCount);
      const b = key % vertexCount;
      const p =
        first[0] !== a && first[0] !== b
          ? first[0]
          : first[1] !== a && first[1] !== b
            ? first[1]
            : first[2];
      const q =
        second[0] !== a && second[0] !== b
          ? second[0]
          : second[1] !== a && second[1] !== b
            ? second[1]
            : second[2];
      if (p === q) continue;
      // 只处理真正非 Delaunay 且翻边后不产生退化三角形的情形
      if (!inCircle(pts[a], pts[b], pts[p], pts[q])) continue;
      if (orient(pts[a], pts[p], pts[q]) === 0 || orient(pts[p], pts[b], pts[q]) === 0) continue;
      result[list[0]] = [a, p, q];
      result[list[1]] = [p, b, q];
      flipped = true;
    }
    if (!flipped) break;
  }
  return result;
}

// ---- 站点凸包（逆时针，用于把边界裁进站点云） ----

function convexHull(pts: Point[]): Point[] {
  const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const build = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2) {
        const o = out[out.length - 2];
        const q = out[out.length - 1];
        if (orient(o, q, p) > 0) break;
        out.pop();
      }
      out.push(p);
    }
    return out;
  };
  const lower = build(sorted);
  const upper = build([...sorted].reverse());
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  let area = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area < 0 ? hull.reverse() : hull;
}

/** 线段裁到凸包（凸多边形半平面裁剪）；完全在外返回 null */
function clipToHull(a: Point, b: Point, hull: Point[]): [Point, Point] | null {
  if (hull.length < 3) return [a, b];
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i];
    const q = hull[(i + 1) % hull.length];
    const nx = -(q.y - p.y);
    const ny = q.x - p.x;
    const fa = nx * (a.x - p.x) + ny * (a.y - p.y);
    const fb = nx * (b.x - p.x) + ny * (b.y - p.y);
    const delta = fb - fa;
    if (delta === 0) {
      if (fa < 0) return null;
      continue;
    }
    const t = -fa / delta;
    if (delta > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    { x: a.x + dx * t0, y: a.y + dy * t0 },
    { x: a.x + dx * t1, y: a.y + dy * t1 },
  ];
}

// ---- 主流程：每个三角形贡献「跨单位边中点 → 外心」的精确 Voronoi 边 ----

interface Segment {
  a: Point;
  b: Point;
  nation: boolean;
}

const segments: Segment[] = [];
if (points.length >= 3) {
  const triangles = buildDelaunay(points);
  const hull = convexHull(points);
  const vertexCount = points.length + 3;
  // 凸包边上的 Voronoi 射线要射到凸包之外才裁得动，长度取站点范围的数倍即可
  const boundsX = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
  const boundsY = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));

  const circumcenters = triangles.map((t) => {
    const [a, b, c] = t.map((v) => points[v]);
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    // 退化（三点共线）时外心在无穷远，退回重心 —— 拓扑不变，只是几何近似
    if (Math.abs(d) < 1e-12) {
      return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    }
    return {
      x:
        ((a.x ** 2 + a.y ** 2) * (b.y - c.y) +
          (b.x ** 2 + b.y ** 2) * (c.y - a.y) +
          (c.x ** 2 + c.y ** 2) * (a.y - b.y)) /
        d,
      y:
        ((a.x ** 2 + a.y ** 2) * (c.x - b.x) +
          (b.x ** 2 + b.y ** 2) * (a.x - c.x) +
          (c.x ** 2 + c.y ** 2) * (b.x - a.x)) /
        d,
    };
  });

  // 按 Delaunay 边组织：一条跨单位边的 Voronoi 边 = 它两侧三角形外心之间的那段平分线。
  // 凸包边只有一侧有三角形，Voronoi 边在那里是一条射线（从外心朝远离站点的一侧射出），
  // 射进凸包的那截靠裁剪拿到；共圆时相邻三角形外心重合，两条重合的边只画一次。
  const edgeTriangles = new Map<number, number[]>();
  triangles.forEach((triangle, index) => {
    const edges: [number, number][] = [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ];
    for (const [a, b] of edges) {
      const key = edgeKey(a, b, vertexCount);
      const list = edgeTriangles.get(key);
      if (list) list.push(index);
      else edgeTriangles.set(key, [index]);
    }
  });

  const rayLength = 2 * (boundsX + boundsY);
  for (const [key, adjacent] of edgeTriangles) {
    const a = Math.floor(key / vertexCount);
    const b = key % vertexCount;
    const unitA = stationUnit[a];
    const unitB = stationUnit[b];
    if (unitA === unitB) continue;
    const nation = units[unitA].nationId !== units[unitB].nationId;
    let start: Point;
    let end: Point;
    if (adjacent.length === 2) {
      start = circumcenters[adjacent[0]];
      end = circumcenters[adjacent[1]];
    } else {
      // 凸包边：Voronoi 边是从外心射向**远离第三个站**那一侧的射线（第三站就在另一侧等着切进来）
      const center = circumcenters[adjacent[0]];
      const triangle = triangles[adjacent[0]];
      const third =
        triangle[0] !== a && triangle[0] !== b
          ? triangle[0]
          : triangle[1] !== a && triangle[1] !== b
            ? triangle[1]
            : triangle[2];
      const midpoint = { x: (points[a].x + points[b].x) / 2, y: (points[a].y + points[b].y) / 2 };
      let dx = center.x - midpoint.x;
      let dy = center.y - midpoint.y;
      const length = Math.hypot(dx, dy);
      if (length < MIN_SEGMENT) continue;
      dx /= length;
      dy /= length;
      if (dx * (points[third].x - midpoint.x) + dy * (points[third].y - midpoint.y) > 0) {
        dx = -dx;
        dy = -dy;
      }
      start = center;
      end = { x: center.x + dx * rayLength, y: center.y + dy * rayLength };
    }
    const clipped = clipToHull(start, end, hull);
    if (!clipped) continue;
    const [clippedStart, clippedEnd] = clipped;
    if (
      Math.abs(clippedStart.x - clippedEnd.x) < MIN_SEGMENT &&
      Math.abs(clippedStart.y - clippedEnd.y) < MIN_SEGMENT
    )
      continue;
    segments.push({ a: clippedStart, b: clippedEnd, nation });
  }
}

// ---- 接成折线：交点坐标即节点标识（共享 Delaunay 边 ⇒ 共享交点 ⇒ 自动接得上） ----

function chain(list: Segment[]): Point[][] {
  const buckets = new Map<string, number[]>();
  const push = (key: string, index: number) => {
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  };
  list.forEach((segment, index) => {
    push(nodeKey(segment.a), index);
    push(nodeKey(segment.b), index);
  });

  const used = new Uint8Array(list.length);
  const polylines: Point[][] = [];
  const extend = (polyline: Point[], atTail: boolean) => {
    for (;;) {
      const end = atTail ? polyline[polyline.length - 1] : polyline[0];
      const bucket = buckets.get(nodeKey(end));
      let advanced = false;
      if (bucket) {
        for (const index of bucket) {
          if (used[index]) continue;
          const segment = list[index];
          used[index] = 1;
          const next = nodeKey(segment.a) === nodeKey(end) ? segment.b : segment.a;
          if (atTail) polyline.push(next);
          else polyline.unshift(next);
          advanced = true;
          break;
        }
      }
      if (!advanced) return;
    }
  };

  for (let i = 0; i < list.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const polyline = [list[i].a, list[i].b];
    extend(polyline, true);
    extend(polyline, false);
    polylines.push(polyline);
  }
  return polylines;
}

/** 去掉共线的中间点（格点布局下边界多为直线，这一步能省掉大量冗余顶点） */
function dropCollinear(polyline: Point[]): Point[] {
  if (polyline.length <= 2) return polyline;
  const out: Point[] = [polyline[0]];
  for (let i = 1; i < polyline.length - 1; i++) {
    const prev = out[out.length - 1];
    const next = polyline[i + 1];
    const span = Math.max(Math.abs(next.x - prev.x), Math.abs(next.y - prev.y));
    if (span > 0 && Math.abs(orient(prev, polyline[i], next)) > span * 1e-4) out.push(polyline[i]);
  }
  out.push(polyline[polyline.length - 1]);
  return out;
}

const format = (value: number): string => (Math.round(value * 10) / 10).toString();

/**
 * 一个转角的圆角切点：沿两条边各退回 `cut`，用「以原折点为控制点的二次贝塞尔」把切点连起来。
 * 控制点就是原来的折点，所以圆角完全落在原转角内（不会鼓出去），切向仍沿原边；
 * `cut` 不超过相邻段长的一半，密集的小转角不会互相吃掉。退化的短段返回 null（保持折角）。
 */
function cornerFillet(prev: Pt, corner: Pt, next: Pt): { start: Pt; end: Pt } | null {
  const inLength = Math.hypot(corner.x - prev.x, corner.y - prev.y);
  const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
  if (inLength < 1e-6 || outLength < 1e-6) return null;
  const cut = Math.min(BORDER_CORNER_RADIUS, inLength / 2, outLength / 2);
  return {
    start: {
      x: corner.x + ((prev.x - corner.x) / inLength) * cut,
      y: corner.y + ((prev.y - corner.y) / inLength) * cut,
    },
    end: {
      x: corner.x + ((next.x - corner.x) / outLength) * cut,
      y: corner.y + ((next.y - corner.y) / outLength) * cut,
    },
  };
}

/**
 * 折线 → path，按 `BORDER_SMOOTHING` 选平滑方式。三种方式都是**插值**的：节点（含多个单位
 * 共用的 Voronoi 顶点）精确落在曲线上，因此相邻区域的边界不会各自平滑而错位撕裂。
 *
 * - `none`：精确折线；
 * - `round`：只在转角做统一半径的圆角，直线段一点不动；
 * - `flow`：整条链的向心 Catmull–Rom（控制点数学与线路曲线共用 `bezierControls`）——最圆滑，
 *   但切线不设上限，节点间距悬殊处会冲出真实边界几十像素。
 */
function buildPath(vertices: Point[], smoothing: BorderSmoothing): string | null {
  if (vertices.length < 2) return null;
  const pixels: Pt[] = vertices.map((p) => ({
    x: (p.x - minX) * BLOCK_SIZE,
    y: (p.y - minY) * BLOCK_SIZE,
  }));
  const count = pixels.length;
  const closed =
    Math.hypot(pixels[count - 1].x - pixels[0].x, pixels[count - 1].y - pixels[0].y) < 1e-3;
  const points = closed ? pixels.slice(0, count - 1) : pixels;
  const size = points.length;
  const ring = (index: number): Pt => points[((index % size) + size) % size];
  const at = (p: Pt): string => `${format(p.x)},${format(p.y)}`;

  if (smoothing === 'flow' && size > 2) {
    let d = `M ${at(points[0])}`;
    for (let i = 0; i < (closed ? size : size - 1); i++) {
      const p1 = ring(i);
      const p2 = ring(i + 1);
      const p0 = closed || i > 0 ? ring(i - 1) : p1;
      const p3 = closed || i + 2 < size ? ring(i + 2) : p2;
      const { c1, c2 } = bezierControls(p0, p1, p2, p3);
      d += ` C ${at(c1)} ${at(c2)} ${at(p2)}`;
    }
    return closed ? `${d} Z` : d;
  }

  // none / round：开链两端不做圆角，闭环每个节点都做
  const fillets = points.map((corner, index) =>
    smoothing === 'round' && (closed || (index > 0 && index < size - 1))
      ? cornerFillet(ring(index - 1), corner, ring(index + 1))
      : null,
  );
  /** 进入某个节点的落点：有圆角就是圆角起点，否则就是节点本身 */
  const enter = (index: number): Pt => fillets[index]?.start ?? points[index];

  if (!closed) {
    let d = `M ${at(points[0])}`;
    let pen = points[0];
    const same = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
    for (let i = 1; i < size; i++) {
      const fillet = fillets[i];
      if (fillet) {
        if (!same(pen, fillet.start)) d += ` L ${at(fillet.start)}`;
        d += ` Q ${at(points[i])} ${at(fillet.end)}`;
        pen = fillet.end;
      } else if (!same(pen, points[i])) {
        d += ` L ${at(points[i])}`;
        pen = points[i];
      }
    }
    return d;
  }

  // 闭环：从节点 0 的落点起笔，绕一圈正好回到它（最后一步的直线就是闭合边）
  let d = `M ${at(enter(0))}`;
  for (let i = 0; i < size; i++) {
    const fillet = fillets[i];
    if (fillet) d += ` Q ${at(points[i])} ${at(fillet.end)}`;
    const from = fillet ? fillet.end : points[i];
    const to = enter((i + 1) % size);
    if (Math.hypot(from.x - to.x, from.y - to.y) > 1e-6) d += ` L ${at(to)}`;
  }
  return d;
}

/** 两类边界的节点折线（像素坐标）：几何只算一次，换平滑方式只是重新拼 path 字符串 */
const borderChains: Record<TerritoryBorderKind, Point[][]> = {
  nation: chain(segments.filter((segment) => segment.nation)),
  area: chain(segments.filter((segment) => !segment.nation)),
};

const pathCache = new Map<string, TerritoryBorderPath[]>();

/**
 * 某一类边界在指定平滑方式下的 SVG path（结果按「类别 + 方式」缓存，
 * 控制面板上反复切换不会重算——几何本来也只算一次）。
 */
export function buildBorderPaths(
  kind: TerritoryBorderKind,
  smoothing: BorderSmoothing,
): TerritoryBorderPath[] {
  const key = `${kind}|${smoothing}`;
  const cached = pathCache.get(key);
  if (cached) return cached;
  const paths: TerritoryBorderPath[] = [];
  for (const polyline of borderChains[kind]) {
    const d = buildPath(dropCollinear(polyline), smoothing);
    if (!d) continue;
    paths.push({ id: `${kind}-border-${paths.length}`, d });
  }
  pathCache.set(key, paths);
  return paths;
}
