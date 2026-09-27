import { stations, minX, minY } from './useMapData';
import {
  BLOCK_SIZE,
  BORDER_GRID_STEP,
  BORDER_GRID_MARGIN,
  BORDER_SIMPLIFY_EPSILON,
} from '../config/render.config';

/**
 * 归属边界（国家/地区边界线 + 区域边界线）。
 *
 * 划分规则是「离哪个站点最近就归谁」：平面上每一点取最近的站点，用它在 `regions.json`
 * 里的归属单位（国家/地区 × 区域；没有区域的站点在本国之内自成一档）作为该点的归属。
 * 于是每条边界就是相邻两个归属单位之间的 Voronoi 边界 —— 站点坐标一动，边界跟着动。
 *
 * 求法（纯几何，不引第三方依赖）：
 * 1. 在站点外接框上铺一张网格，算每个格点最近的两个「归属单位」及其距离；
 * 2. 用 d(近) - d(次近)（按单位序号定符号，与谁近无关）构成有符号场，其零等值线即全部边界；
 * 3. marching squares 沿格边线性插值出零等值线，得到一串碎线段；
 * 4. 看每段两侧的归属：国家/地区不同 = 国家/地区边界；同国不同区域（含「无区域」）= 区域边界；
 * 5. 把同类碎线接成折线、Douglas–Peucker 去掉栅格锯齿，输出地图像素空间的 SVG path。
 *
 * 边界只画在**相邻归属之间**：两国（或两区域）不挨着就没有线，站点簇最外圈也不会被框起来
 * （凸包之外不画）。模块加载时算一次，结果只依赖站点坐标与 `regions.json`。
 */

export interface TerritoryBorderPath {
  id: string;
  /** SVG path，坐标已换算到地图像素空间（与站点 / 标注同一坐标系） */
  d: string;
}

interface Point {
  x: number;
  y: number;
}

/** 归属单位：一个国家/地区内的一个区域；`areaId` 为 `''` 表示该国内「无区域」的那一档 */
interface Unit {
  nationId: string;
  areaId: string;
  points: Point[];
}

interface Piece {
  a: Point;
  b: Point;
  /** true = 两侧国家/地区不同（国家边界），false = 同国不同区域（区域边界） */
  nation: boolean;
}

const units: Unit[] = [];
const unitIndexById = new Map<string, number>();
for (const station of stations) {
  const key = `${station.nation.id}|${station.area?.id ?? ''}`;
  let index = unitIndexById.get(key);
  if (index === undefined) {
    index = units.length;
    unitIndexById.set(key, index);
    units.push({ nationId: station.nation.id, areaId: station.area?.id ?? '', points: [] });
  }
  units[index].points.push({ x: station.x, y: station.y });
}

/** 某点最近站点所属的归属单位序号 */
function nearestUnitAt(x: number, y: number): number {
  let best = Infinity;
  let bestUnit = -1;
  for (let u = 0; u < units.length; u++) {
    const points = units[u].points;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - x;
      const dy = points[i].y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        bestUnit = u;
      }
    }
  }
  return bestUnit;
}

// ---- 网格：每个格点最近的两个归属单位 ----

const gridMinX = Math.min(...stations.map((s) => s.x)) - BORDER_GRID_MARGIN;
const gridMaxX = Math.max(...stations.map((s) => s.x)) + BORDER_GRID_MARGIN;
const gridMinY = Math.min(...stations.map((s) => s.y)) - BORDER_GRID_MARGIN;
const gridMaxY = Math.max(...stations.map((s) => s.y)) + BORDER_GRID_MARGIN;
const step = BORDER_GRID_STEP;
const cols = Math.max(2, Math.ceil((gridMaxX - gridMinX) / step) + 1);
const rows = Math.max(2, Math.ceil((gridMaxY - gridMinY) / step) + 1);

/** 有符号场：`d(序号小的那个单位) - d(序号大的那个单位)`，负值一侧属于序号小的单位 */
const field = new Float32Array(cols * rows);
const nearestUnit = new Int32Array(cols * rows);
const secondUnit = new Int32Array(cols * rows);

for (let row = 0; row < rows; row++) {
  const y = gridMinY + row * step;
  for (let col = 0; col < cols; col++) {
    const x = gridMinX + col * step;
    let nearSq = Infinity;
    let secondSq = Infinity;
    let near = -1;
    let second = -1;
    for (let u = 0; u < units.length; u++) {
      const points = units[u].points;
      let unitSq = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dx = points[i].x - x;
        const dy = points[i].y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < unitSq) unitSq = d2;
      }
      if (unitSq < nearSq) {
        secondSq = nearSq;
        second = near;
        nearSq = unitSq;
        near = u;
      } else if (unitSq < secondSq) {
        secondSq = unitSq;
        second = u;
      }
    }
    const index = row * cols + col;
    nearestUnit[index] = near;
    secondUnit[index] = second;
    const nearDist = Math.sqrt(nearSq);
    const secondDist = Math.sqrt(secondSq);
    field[index] = near < second ? nearDist - secondDist : secondDist - nearDist;
  }
}

// ---- 站点凸包：边界只画在站点云内部 ----

const hullPoints = stations.map((s) => ({ x: s.x, y: s.y }));

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const build = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2) {
        const o = out[out.length - 2];
        const q = out[out.length - 1];
        if ((q.x - o.x) * (p.y - o.y) - (q.y - o.y) * (p.x - o.x) > 0) break;
        out.pop();
      }
      out.push(p);
    }
    return out;
  };
  const lower = build(sorted);
  const upper = build([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const hull = convexHull(hullPoints);

/** 点是否落在站点凸包内（含边上）；凸包是凸多边形，逐边判同号即可 */
function insideHull(p: Point): boolean {
  if (hull.length < 3) return true;
  let positive = false;
  let negative = false;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const side = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (side > 0) positive = true;
    else if (side < 0) negative = true;
    if (positive && negative) return false;
  }
  return true;
}

// ---- marching squares：插值出零等值线 ----

const pieces: Piece[] = [];

/** 两条单位序号构成的「配对」是否一致（不一致说明该格边跨过了一个三方交汇点，插值不可用） */
function samePair(a: number, b: number): boolean {
  return (
    Math.min(nearestUnit[a], secondUnit[a]) === Math.min(nearestUnit[b], secondUnit[b]) &&
    Math.max(nearestUnit[a], secondUnit[a]) === Math.max(nearestUnit[b], secondUnit[b])
  );
}

/** 格边上的零交点：两侧场值线性插值；跨过三方交汇点时退回格边中点 */
function edgeCrossing(
  kA: number,
  kB: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Point {
  const fa = field[kA];
  const fb = field[kB];
  let t = 0.5;
  if (samePair(kA, kB) && fa !== fb) t = fa / (fa - fb);
  t = Math.max(0, Math.min(1, t));
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
}

/** 线段两侧的归属是否分属不同国家/地区；两侧同属一个单位（交汇点附近的碎线）返回 null */
function pieceTouchesNation(a: Point, b: Point): boolean | null {
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  // 沿法线取三档偏移投票：线段落在三个单位的交汇点附近时，单次采样容易踩错邻居
  let nationVotes = 0;
  let areaVotes = 0;
  for (const factor of [0.25, 0.45, 0.65]) {
    const offset = step * factor;
    const left = nearestUnitAt(midX + nx * offset, midY + ny * offset);
    const right = nearestUnitAt(midX - nx * offset, midY - ny * offset);
    if (left < 0 || right < 0 || left === right) continue;
    if (units[left].nationId !== units[right].nationId) nationVotes++;
    else areaVotes++;
  }
  // 两种判定都出现过 = 这段落在三个单位的交汇点里，两类的碎线互相覆盖；
  // 一票都没投出（三档偏移两侧都同属一个单位）= 根本不是边界 —— 两种情况都丢掉
  if (nationVotes === 0 && areaVotes === 0) return null;
  if (nationVotes > 0 && areaVotes > 0) return null;
  return nationVotes > 0;
}

function pushPiece(a: Point, b: Point): void {
  if (a.x === b.x && a.y === b.y) return;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (!insideHull(mid)) return;
  const nation = pieceTouchesNation(a, b);
  if (nation === null) return;
  pieces.push({ a, b, nation });
}

for (let row = 0; row < rows - 1; row++) {
  const y0 = gridMinY + row * step;
  const y1 = y0 + step;
  for (let col = 0; col < cols - 1; col++) {
    const x0 = gridMinX + col * step;
    const x1 = x0 + step;
    const kbl = row * cols + col;
    const kbr = kbl + 1;
    const ktl = kbl + cols;
    const ktr = ktl + 1;
    const s0 = field[kbl] < 0 ? 1 : 0;
    const s1 = field[kbr] < 0 ? 2 : 0;
    const s2 = field[ktr] < 0 ? 4 : 0;
    const s3 = field[ktl] < 0 ? 8 : 0;
    const code = s0 | s1 | s2 | s3;

    // 0 = 下边（bl–br）、1 = 右边（br–tr）、2 = 上边（tl–tr）、3 = 左边（bl–tl）
    const edgePoint = (edge: number): Point => {
      if (edge === 0) return edgeCrossing(kbl, kbr, x0, y0, x1, y0);
      if (edge === 1) return edgeCrossing(kbr, ktr, x1, y0, x1, y1);
      if (edge === 2) return edgeCrossing(ktl, ktr, x0, y1, x1, y1);
      return edgeCrossing(kbl, ktl, x0, y0, x0, y1);
    };
    const emit = (edgeA: number, edgeB: number) => pushPiece(edgePoint(edgeA), edgePoint(edgeB));

    switch (code) {
      case 0:
      case 15:
        break;
      case 1:
        emit(3, 0);
        break;
      case 2:
        emit(0, 1);
        break;
      case 3:
        emit(3, 1);
        break;
      case 4:
        emit(1, 2);
        break;
      case 6:
        emit(0, 2);
        break;
      case 7:
        emit(3, 2);
        break;
      case 8:
        emit(2, 3);
        break;
      case 9:
        emit(2, 0);
        break;
      case 11:
        emit(2, 1);
        break;
      case 12:
        emit(1, 3);
        break;
      case 13:
        emit(1, 0);
        break;
      case 14:
        emit(0, 3);
        break;
      // 鞍点：用格子中心属于哪一侧决定两条线怎么连
      case 5:
        if (centerShares(code, kbl, x0, y0, x1, y1)) {
          emit(0, 1);
          emit(2, 3);
        } else {
          emit(3, 0);
          emit(1, 2);
        }
        break;
      case 10:
        if (centerShares(code, kbr, x0, y0, x1, y1)) {
          emit(3, 0);
          emit(1, 2);
        } else {
          emit(0, 1);
          emit(2, 3);
        }
        break;
    }
  }
}

/** 鞍点消歧：格子中心与某个「内部角」是否同属一个归属单位 */
function centerShares(
  _code: number,
  corner: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const centerUnit = nearestUnitAt((x0 + x1) / 2, (y0 + y1) / 2);
  return centerUnit === nearestUnit[corner];
}

// ---- 碎线接成折线 ----

function nodeKey(p: Point): string {
  return `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
}

function chain(list: Piece[]): Point[][] {
  const buckets = new Map<string, number[]>();
  const add = (key: string, index: number) => {
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  };
  list.forEach((piece, index) => {
    add(nodeKey(piece.a), index);
    add(nodeKey(piece.b), index);
  });

  const used = new Uint8Array(list.length);
  const polylines: Point[][] = [];
  const extend = (poly: Point[], atTail: boolean) => {
    for (;;) {
      const end = atTail ? poly[poly.length - 1] : poly[0];
      const bucket = buckets.get(nodeKey(end));
      let advanced = false;
      if (bucket) {
        for (const index of bucket) {
          if (used[index]) continue;
          const piece = list[index];
          used[index] = 1;
          const next = nodeKey(piece.a) === nodeKey(end) ? piece.b : piece.a;
          if (atTail) poly.push(next);
          else poly.unshift(next);
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
    const poly = [list[i].a, list[i].b];
    extend(poly, true);
    extend(poly, false);
    polylines.push(poly);
  }
  return polylines;
}

/** Douglas–Peucker：去掉等值线上的栅格锯齿 */
function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let maxIndex = 0;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.hypot(dx, dy);
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dist =
      len === 0
        ? Math.hypot(p.x - first.x, p.y - first.y)
        : Math.abs(dy * p.x - dx * p.y + last.x * first.y - last.y * first.x) / len;
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }
  if (maxDist <= epsilon) return [first, last];
  const head = simplify(points.slice(0, maxIndex + 1), epsilon);
  const tail = simplify(points.slice(maxIndex), epsilon);
  return [...head.slice(0, -1), ...tail];
}

function format(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

function buildPaths(list: Piece[], idPrefix: string): TerritoryBorderPath[] {
  const paths: TerritoryBorderPath[] = [];
  // 交汇点附近会残留几个格点的碎线（甚至绕成小菱形），比两个格点还短的直接丢掉
  const minLength = step * 2;
  for (const polyline of chain(list)) {
    let length = 0;
    for (let i = 1; i < polyline.length; i++) {
      length += Math.hypot(polyline[i].x - polyline[i - 1].x, polyline[i].y - polyline[i - 1].y);
    }
    if (length < minLength) continue;
    // 交汇点上还会残留一个格点大小的碎圈，外框不超过两格 —— 同样丢掉
    const xs = polyline.map((p) => p.x);
    const ys = polyline.map((p) => p.y);
    if (
      Math.max(...xs) - Math.min(...xs) < minLength &&
      Math.max(...ys) - Math.min(...ys) < minLength
    )
      continue;
    const points = simplify(polyline, BORDER_SIMPLIFY_EPSILON);
    if (points.length < 2) continue;
    const d = points
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'} ${format((p.x - minX) * BLOCK_SIZE)},${format((p.y - minY) * BLOCK_SIZE)}`,
      )
      .join(' ');
    paths.push({ id: `${idPrefix}-${paths.length}`, d });
  }
  return paths;
}

/** 国家/地区边界线（加粗） */
export const nationBorderPaths: TerritoryBorderPath[] = buildPaths(
  pieces.filter((p) => p.nation),
  'nation-border',
);

/** 区域边界线（同国之内，含「无区域」一档） */
export const areaBorderPaths: TerritoryBorderPath[] = buildPaths(
  pieces.filter((p) => !p.nation),
  'area-border',
);
