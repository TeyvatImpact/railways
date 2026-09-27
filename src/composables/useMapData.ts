import dataR from '../data/teyvat.json';
import dataI from '../data/inazuma.json';
import dataL from '../data/liyue.json';
import dataS from '../data/snezhnaya.json';
import markersData from '../data/mark.json';
import ferryData from '../data/ferry.json';
import sameData from '../data/same.json';
import connectionsData from '../data/connections.json';
import {
  BLOCK_SIZE,
  margin,
  linePalette,
  LINE_WIDTH,
  FERRY_COLOR,
  FERRY_LINE_WIDTH,
  FERRY_DASH,
  SAME_COLOR,
  SAME_LINE_WIDTH,
  MARKER_STROKE,
  MARKER_STROKE_WIDTH,
  MARKER_FILL,
  MARKER_FONT_SIZE,
  MARKER_TEXT_FILL,
  MARKER_FONT_FAMILY,
} from '../config/render.config';
import farePresets from '../config/fare-presets.json';
import type { NameLocale, OrgNames, StationNames } from './stationNames';

export interface StationData {
  id: string;
  prefix: string;
  names: StationNames;
  /** 本站名的「主语言」= 所属区域 config.primaryLang；标签主行、搜索结果、路由站名都用它 */
  primaryLang: NameLocale;
  x: number;
  y: number;
  labelDir?: string;
  fontFamily: string;
  /** 主语言非 zhCN 时，names.zhCN 那一行用的字体 */
  fontFamilyZh?: string;
}

/** connections.json 的一条：两个站点之间如何连接。from/to 为完整站点 id；waypoints 按 from → to 方向链式给出 */
export interface ConnectionEntry {
  from: string;
  to: string;
  /** 公里；缺省 = DEFAULT_CONNECTION_DISTANCE */
  distance?: number;
  /** 链式增量途经点（数据单位）；缺省或空 = 两站之间直线 */
  waypoints?: Waypoints;
}

export interface PresetConfig {
  id: string;
  name: string;
  nameEn: string;
  farePerKm: number;
  minutesPerKm: number;
}

/** 途经点：链式增量，单位为数据坐标单位（与 station.x/y 同尺度）。第 1 个点相对区间起点站，之后每个点相对前一个点 */
export type Waypoints = [number, number][];

/** 运营公司 / 运营主体：与线路一样把名称放在 `names` 下（未来可加别的字段） */
export interface OrgInfo {
  names: OrgNames;
}

export interface LineVariantData {
  /** 短变体名（如 `支线` / `小交路`）；空或省略表示该线路的全线交路 */
  name?: string;
  nameEn?: string;
  /** 该变体的站序（短 id；跨区引用写完整 id） */
  stations: string[];
}

export interface LineData {
  id: string;
  /** 线路名：与站点同一套四语键（运营公司 / 运营主体见 `OrgNames`） */
  names: StationNames;
  /** 线路名的主语言；缺省时继承所属区域 config.primaryLang（ferry.json / same.json 无 config → `zhCN`） */
  primaryLang?: NameLocale;
  costPreset: string;
  lineLabels?: [string, string][];
  /** 同一线路的多个交路（支线 / 大小交路），至少一个；变体之间共用线路名与颜色 */
  variants: LineVariantData[];
  /** true = 单向线路，所有变体都只按各自 `stations` 的顺序开行 */
  oneWay?: boolean;
  fontFamily?: string;
  fontFamilyZh?: string;
  /** 运营公司；缺省时取所属区域文件 config 的同名字段 */
  operator?: OrgInfo;
  /** 运营主体（提瓦特铁路xx局 / 稻妻幕府 / 枫丹廷 …）；缺省同上 */
  authority?: OrgInfo;
  lineType?: 'ferry' | 'same-station';
}

const presetsMap = new Map<string, PresetConfig>();
for (const p of farePresets as PresetConfig[]) {
  presetsMap.set(p.id, p);
}

export function getPreset(id: string): PresetConfig {
  return presetsMap.get(id) ?? presetsMap.get('standard')!;
}

export interface Station extends StationData {
  cx: number;
  cy: number;
}

export interface LineVariant {
  name: string;
  nameEn: string;
  stations: string[];
}

export interface Line extends Omit<LineData, 'variants'> {
  /** 已解析的线路名主语言（线路对象上的值优先，否则所属区域 config.primaryLang，再否则 `zhCN`） */
  primaryLang: NameLocale;
  color: string;
  variants: LineVariant[];
  /** 派生：所有变体站点的并集（按首次出现顺序），用于「站 ↔ 线路」查询 */
  stations: string[];
}

export interface RenderSegment {
  id: string;
  lineId: string;
  color: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  dasharray?: string;
  fare: number;
  time: number;
  distance: number;
  showLabel: boolean;
  /** 本段所属站间区间在该线路内的序号（同一区间可能因折线中间点拆成两段） */
  pairIndex: number;
  /** 区间内的第几段：0 = 起点侧（单段区间恒为 0），1 = 折线中间点之后的部分 */
  partIndex: number;
}

export interface MarkerPath {
  id: string;
  d: string;
  stroke: string;
  strokeWidth: number;
  fill: string;
}

export interface MarkerText {
  id: string;
  content: string;
  x: number;
  y: number;
  fontSize: number;
  fill: string;
  fontFamily: string;
}

interface RegionFile {
  config: {
    x: number;
    y: number;
    name: string;
    fontFamily?: string;
    /** 本文件站名与线路名的「主语言」：inazuma = 'ja'，其余 = 'zhCN' */
    primaryLang?: NameLocale;
    /** 该文件所有线路的默认运营公司 / 运营主体，线路对象可各自覆盖 */
    operator?: OrgInfo;
    authority?: OrgInfo;
  };
  stations: {
    id: string;
    names: StationNames;
    x: number;
    y: number;
    labelDir?: string;
  }[];
  lines: LineData[];
}

interface ConnectionsFile {
  connections: ConnectionEntry[];
}

function parseStationsJson(data: RegionFile): {
  stations: StationData[];
  prefix: string;
  fontFamily: string;
  primaryLang: NameLocale;
  operator?: OrgInfo;
  authority?: OrgInfo;
} {
  const { config, stations: entries } = data;
  const prefix = config.name;
  const fontFamily = config.fontFamily || 'sans-serif';
  const fontFamilyZh = 'Noto Serif SC';
  const primaryLang: NameLocale = config.primaryLang ?? 'zhCN';
  const stations = entries.map((e) => {
    for (const key of ['zhCN', 'zhTW', 'ja', 'en'] as const) {
      if (!e.names?.[key]) throw new Error(`站点 ${prefix}-${e.id} 缺少 names.${key}`);
    }
    return {
      id: prefix + '-' + e.id,
      prefix,
      names: e.names,
      primaryLang,
      x: e.x + config.x,
      y: e.y + config.y,
      labelDir: e.labelDir,
      fontFamily,
      fontFamilyZh: primaryLang === 'zhCN' ? undefined : fontFamilyZh,
    };
  });
  return {
    stations,
    prefix,
    fontFamily,
    primaryLang,
    operator: config.operator,
    authority: config.authority,
  };
}

/**
 * Region files reference their own stations by short id (e.g. `LYH` → `Teyvat-LYH`).
 * Ids that already carry a prefix separator (e.g. `Teyvat-STR`) are used as-is, which
 * lets a region file declare links to stations owned by another region.
 */
function regionStationId(prefix: string, id: string): string {
  return id.includes('-') ? id : `${prefix}-${id}`;
}

const parsedR = parseStationsJson(dataR as unknown as RegionFile);
const parsedI = parseStationsJson(dataI as unknown as RegionFile);
const parsedL = parseStationsJson(dataL as unknown as RegionFile);
const parsedS = parseStationsJson(dataS as unknown as RegionFile);
const parsedStations: StationData[] = [
  ...parsedR.stations,
  ...parsedI.stations,
  ...parsedL.stations,
  ...parsedS.stations,
];

const parsedLinesR = dataR.lines as unknown as LineData[];
const parsedLinesI = dataI.lines as unknown as LineData[];
const parsedLinesL = dataL.lines as unknown as LineData[];
const parsedLinesS = dataS.lines as unknown as LineData[];

const regionLineSets: {
  lines: LineData[];
  prefix: string;
  fontFamily: string;
  primaryLang: NameLocale;
  operator?: OrgInfo;
  authority?: OrgInfo;
}[] = [
  {
    lines: parsedLinesR,
    prefix: parsedR.prefix,
    fontFamily: parsedR.fontFamily,
    primaryLang: parsedR.primaryLang,
    operator: parsedR.operator,
    authority: parsedR.authority,
  },
  {
    lines: parsedLinesI,
    prefix: parsedI.prefix,
    fontFamily: parsedI.fontFamily,
    primaryLang: parsedI.primaryLang,
    operator: parsedI.operator,
    authority: parsedI.authority,
  },
  {
    lines: parsedLinesL,
    prefix: parsedL.prefix,
    fontFamily: parsedL.fontFamily,
    primaryLang: parsedL.primaryLang,
    operator: parsedL.operator,
    authority: parsedL.authority,
  },
  {
    lines: parsedLinesS,
    prefix: parsedS.prefix,
    fontFamily: parsedS.fontFamily,
    primaryLang: parsedS.primaryLang,
    operator: parsedS.operator,
    authority: parsedS.authority,
  },
];

/** 线路变体校验：至少一个变体，每个变体至少两个站点 */
function assertVariants(line: LineData): void {
  if (!Array.isArray(line.variants) || line.variants.length === 0)
    throw new Error(`线路 ${line.id} 缺少 variants`);
  for (const variant of line.variants) {
    if (!Array.isArray(variant.stations) || variant.stations.length < 2)
      throw new Error(`线路 ${line.id} 的变体站点数不足 2 个`);
  }
}

for (const { lines, prefix, fontFamily, primaryLang, operator, authority } of regionLineSets) {
  for (const line of lines) {
    assertVariants(line);
    for (const variant of line.variants) {
      variant.stations = variant.stations.map((id) => regionStationId(prefix, id));
    }
    if (line.lineLabels)
      line.lineLabels = line.lineLabels.map(([id, dir]) => [regionStationId(prefix, id), dir]);
    line.fontFamily = fontFamily;
    if (primaryLang !== 'zhCN') line.fontFamilyZh = 'Noto Serif SC';
    line.primaryLang = line.primaryLang ?? primaryLang;
    // 运营公司 / 运营主体：线路对象上的值优先，否则落到本文件的默认值
    if (!line.operator) line.operator = operator;
    if (!line.authority) line.authority = authority;
  }
}

const parsedFerryLines = (ferryData as any).lines as LineData[];
const parsedSameLines = (sameData as any).lines as LineData[];

const parsedLines: LineData[] = [
  ...parsedLinesR,
  ...parsedLinesI,
  ...parsedLinesL,
  ...parsedLinesS,
  ...parsedFerryLines,
  ...parsedSameLines,
];

// 轮渡 / 同站线路不在 regionLineSets 里（不需要加前缀），单独校验变体
for (const line of [...parsedFerryLines, ...parsedSameLines]) assertVariants(line);

export const minX = Math.min(...parsedStations.map((s) => s.x)) - margin;
const maxX = Math.max(...parsedStations.map((s) => s.x)) + margin;
export const minY = Math.min(...parsedStations.map((s) => s.y)) - margin;
const maxY = Math.max(...parsedStations.map((s) => s.y)) + margin;
const width = maxX - minX;
const height = maxY - minY;

export const svgWidth = width * BLOCK_SIZE;
export const svgHeight = height * BLOCK_SIZE;

const translateX = (maxX + minX) / 2;
const translateY = (maxY + minY) / 2;

export const stations: Station[] = parsedStations.map((s) => ({
  ...s,
  cx: (s.x + width / 2 - translateX) * BLOCK_SIZE,
  cy: (s.y + height / 2 - translateY) * BLOCK_SIZE,
}));

export const stationMap = new Map(stations.map((s) => [s.id, s]));

/** 连接条目缺 distance 时的默认公里数（等价旧的 `?? 10` 行为） */
export const DEFAULT_CONNECTION_DISTANCE = 10;

const connectionMap = new Map<string, ConnectionEntry>();

function connectionKey(aId: string, bId: string): string {
  return [aId, bId].sort().join('|');
}

const connectionsFile = connectionsData as unknown as ConnectionsFile;

for (const entry of connectionsFile.connections) {
  if (!entry.from.includes('-') || !entry.to.includes('-'))
    throw new Error(`connections.json 必须使用完整站点 id：${entry.from} ~ ${entry.to}`);
  if (!stationMap.has(entry.from) || !stationMap.has(entry.to))
    throw new Error(`connections.json 引用了不存在的站点：${entry.from} ~ ${entry.to}`);
  const key = connectionKey(entry.from, entry.to);
  if (connectionMap.has(key))
    throw new Error(`connections.json 中重复的站点对：${entry.from} ~ ${entry.to}`);
  connectionMap.set(key, entry);
}

/** 两站之间的连接定义；无条目时返回 undefined（距离回退默认值、几何回退直线） */
export function lookupConnection(aId: string, bId: string): ConnectionEntry | undefined {
  return connectionMap.get(connectionKey(aId, bId));
}

export function lookupDistance(aId: string, bId: string): number {
  return lookupConnection(aId, bId)?.distance ?? DEFAULT_CONNECTION_DISTANCE;
}

/** 所有变体站点的并集（按首次出现顺序） */
function unionStations(variants: { stations: string[] }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const variant of variants) {
    for (const sid of variant.stations) {
      if (seen.has(sid)) continue;
      seen.add(sid);
      out.push(sid);
    }
  }
  return out;
}

const stationLineCount = new Map<string, number>();
for (const line of parsedLines) {
  // 一条线路的多个变体算同一条线路 → 换乘站判定只看线路，不看变体
  for (const sid of unionStations(line.variants)) {
    stationLineCount.set(sid, (stationLineCount.get(sid) || 0) + 1);
  }
}

export const transferStationIds = new Set(
  [...stationLineCount.entries()].filter(([, c]) => c >= 2).map(([id]) => id),
);

// 每个数据文件内的常规线路单独配色：文件内第 n 条线路取 linePalette[n]
const fileLineIndex = new Map<LineData, number>();
for (const { lines: fileLines } of regionLineSets) {
  let index = 0;
  for (const line of fileLines) if (!line.lineType) fileLineIndex.set(line, index++);
}

export const lines: Line[] = parsedLines.map((line) => ({
  ...line,
  // 轮渡 / 同站线路不在 regionLineSets 里，主语言取默认值
  primaryLang: line.primaryLang ?? 'zhCN',
  variants: line.variants.map((variant) => ({
    name: variant.name ?? '',
    nameEn: variant.nameEn ?? '',
    stations: variant.stations,
  })),
  stations: unionStations(line.variants),
  color:
    line.lineType === 'ferry'
      ? FERRY_COLOR
      : line.lineType === 'same-station'
        ? SAME_COLOR
        : linePalette[(fileLineIndex.get(line) ?? 0) % linePalette.length],
}));

export const lineColorMap = new Map(lines.map((l) => [l.id, l.color]));

function transformPathD(d: string, fn: (x: number, y: number) => [number, number]): string {
  return d.replace(/([MLCQHVAZ])([^MLCQHVAZ]*)/gi, (_, cmd, rest) => {
    const nums = rest
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    const c = cmd.toUpperCase();
    if (c === 'Z') return 'Z';
    if (c === 'H') return `H ${fn(nums[0], 0)[0]}`;
    if (c === 'V') return `V ${fn(0, nums[0])[1]}`;
    let result = cmd;
    if (c === 'M' || c === 'L') {
      for (let i = 0; i < nums.length; i += 2) {
        const [px, py] = fn(nums[i], nums[i + 1]);
        result += ` ${px},${py}`;
      }
    } else if (c === 'Q') {
      for (let i = 0; i < nums.length; i += 4) {
        const [px1, py1] = fn(nums[i], nums[i + 1]);
        const [px2, py2] = fn(nums[i + 2], nums[i + 3]);
        result += ` ${px1},${py1} ${px2},${py2}`;
      }
    } else if (c === 'C') {
      for (let i = 0; i < nums.length; i += 6) {
        const [px1, py1] = fn(nums[i], nums[i + 1]);
        const [px2, py2] = fn(nums[i + 2], nums[i + 3]);
        const [px3, py3] = fn(nums[i + 4], nums[i + 5]);
        result += ` ${px1},${py1} ${px2},${py2} ${px3},${py3}`;
      }
    } else if (c === 'A') {
      for (let i = 0; i < nums.length; i += 7) {
        const [px, py] = fn(nums[i + 5], nums[i + 6]);
        result += ` ${nums[i]},${nums[i + 1]},${nums[i + 2]},${nums[i + 3]},${nums[i + 4]},${px},${py}`;
      }
    }
    return result;
  });
}

const markerPathsData: { d: string; stroke?: string; strokeWidth?: number; fill?: string }[] =
  (markersData as any).paths ?? [];
const markerTextsData: {
  content: string;
  x: number;
  y: number;
  fontSize?: number;
  fill?: string;
  fontFamily?: string;
}[] = (markersData as any).texts ?? [];

export const markerPaths: MarkerPath[] = markerPathsData.map((p, i) => ({
  id: `marker-path-${i}`,
  d: transformPathD(p.d, (x, y) => [(x - minX) * BLOCK_SIZE, (y - minY) * BLOCK_SIZE]),
  stroke: p.stroke ?? MARKER_STROKE,
  strokeWidth: p.strokeWidth ?? MARKER_STROKE_WIDTH,
  fill: p.fill ?? MARKER_FILL,
}));

export const markerTexts: MarkerText[] = markerTextsData.map((t, i) => ({
  id: `marker-text-${i}`,
  content: t.content,
  x: (t.x - minX) * BLOCK_SIZE,
  y: (t.y - minY) * BLOCK_SIZE,
  fontSize: t.fontSize ?? MARKER_FONT_SIZE,
  fill: t.fill ?? MARKER_TEXT_FILL,
  fontFamily: t.fontFamily ?? MARKER_FONT_FAMILY,
}));

function pathId(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 < x2 || (x1 === x2 && y1 < y2)) {
    return `${x1},${y1}|${x2},${y2}`;
  }
  return `${x2},${y2}|${x1},${y1}`;
}

/** 展开「站点 a →（链式增量途经点）→ 站点 b」为渲染坐标顶点序列；waypoints 省略/为空时只有 [a, b] */
function pairVertices(a: Station, b: Station, waypoints?: Waypoints): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [{ x: a.cx, y: a.cy }];
  for (const [dx, dy] of waypoints ?? []) {
    const prev = pts[pts.length - 1];
    pts.push({ x: prev.x + dx * BLOCK_SIZE, y: prev.y + dy * BLOCK_SIZE });
  }
  pts.push({ x: b.cx, y: b.cy });
  return pts;
}

/** 线路按 a → b 方向走时，该站间区间的顶点序列：连接表的 from→to 是规范方向，反向经过时把整条顶点序列逆序 */
function connectionVertices(a: Station, b: Station): { x: number; y: number }[] {
  const conn = lookupConnection(a.id, b.id);
  if (!conn?.waypoints?.length)
    return [
      { x: a.cx, y: a.cy },
      { x: b.cx, y: b.cy },
    ];
  const canonFrom = stationMap.get(conn.from)!;
  const canonTo = stationMap.get(conn.to)!;
  const verts = pairVertices(canonFrom, canonTo, conn.waypoints);
  return conn.from === a.id ? verts : [...verts].reverse();
}

/** 折线几何签名（方向无关），用于平行轨道分组 */
function polylineKey(pts: { x: number; y: number }[]): string {
  const fwd = pts.map((p) => `${p.x},${p.y}`).join('|');
  const rev = [...pts]
    .reverse()
    .map((p) => `${p.x},${p.y}`)
    .join('|');
  return fwd < rev ? fwd : rev;
}

/** `${lineId}|${stationA}|${stationB}` → 该站间区间各渲染段的 id（两个方向都登记）；用于线路高亮定位 */
export const pairSegmentIds = new Map<string, string[]>();

interface RawSegment {
  id: string;
  /** 整条站间折线的几何签名，用于平行轨道分组 */
  groupKey: string;
  lineId: string;
  pairIndex: number;
  partIndex: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width?: number;
  dasharray?: string;
  fare: number;
  time: number;
  distance: number;
  showLabel: boolean;
}

const rawSegments: RawSegment[] = [];

/** 一条站间折线（同一线路、同一区间）的全部渲染段，按 partIndex 升序 */
interface RawPolyline {
  lineId: string;
  pairIndex: number;
  parts: RawSegment[];
}

function lineWidth(line: LineData): number | undefined {
  return line.lineType === 'ferry'
    ? FERRY_LINE_WIDTH
    : line.lineType === 'same-station'
      ? SAME_LINE_WIDTH
      : undefined;
}

/**
 * 线路全部变体按顺序展开后的站间区间。同一无向站对只保留首次出现的方向：变体共用同一段轨道，
 * 不能因为两个变体都经过而占两个平行轨道槽位。
 */
function linePairs(variants: { stations: string[] }[]): [string, string][] {
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const variant of variants) {
    for (let i = 0; i < variant.stations.length - 1; i++) {
      const a = variant.stations[i];
      const b = variant.stations[i + 1];
      const key = [a, b].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([a, b]);
    }
  }
  return out;
}

for (const line of parsedLines) {
  const lw = lineWidth(line);
  const dash = line.lineType === 'ferry' ? FERRY_DASH : undefined;
  const pairs = linePairs(line.variants);
  for (let i = 0; i < pairs.length; i++) {
    const [aId, bId] = pairs[i];
    const sa = stationMap.get(aId);
    const sb = stationMap.get(bId);
    if (!sa || !sb) continue;

    const dist = lookupDistance(aId, bId);
    const preset = getPreset(line.costPreset);
    const fare = Math.round(dist * preset.farePerKm);
    const time = Math.round(dist * preset.minutesPerKm);

    const verts = connectionVertices(sa, sb);
    const groupKey = polylineKey(verts);
    const ids: string[] = [];
    for (let k = 0; k < verts.length - 1; k++) {
      const id = pathId(verts[k].x, verts[k].y, verts[k + 1].x, verts[k + 1].y);
      ids.push(id);
      rawSegments.push({
        id,
        groupKey,
        lineId: line.id,
        pairIndex: i,
        partIndex: k,
        x1: verts[k].x,
        y1: verts[k].y,
        x2: verts[k + 1].x,
        y2: verts[k + 1].y,
        width: lw,
        dasharray: dash,
        fare,
        time,
        distance: dist,
        showLabel: k === 0,
      });
    }
    pairSegmentIds.set(`${line.id}|${aId}|${bId}`, ids);
    pairSegmentIds.set(`${line.id}|${bId}|${aId}`, ids);
  }
}
const polylineGroups = new Map<string, RawPolyline[]>();
for (const seg of rawSegments) {
  let group = polylineGroups.get(seg.groupKey);
  if (!group) {
    group = [];
    polylineGroups.set(seg.groupKey, group);
  }
  let polyline = group.find((p) => p.lineId === seg.lineId && p.pairIndex === seg.pairIndex);
  if (!polyline) {
    polyline = { lineId: seg.lineId, pairIndex: seg.pairIndex, parts: [] };
    group.push(polyline);
  }
  polyline.parts.push(seg);
}

export const renderSegments: RenderSegment[] = [];

// 每个分组 = 一组几何完全相同的站间折线（由不同线路/区间共用），组内按 lineId 决定平行轨道偏移次序
const groups = [...polylineGroups.values()];
for (const polylines of groups) polylines.sort((a, b) => a.lineId.localeCompare(b.lineId));

for (const polylines of groups) {
  const n = polylines.length;
  for (let i = 0; i < n; i++) {
    const parts = polylines[i].parts.sort((a, b) => a.partIndex - b.partIndex);
    const offset = (i - (n - 1) / 2) * LINE_WIDTH;
    const first = parts[0];
    const last = parts[parts.length - 1];
    // 整条区间沿「起点 → 终点」弦的法向平移，折角保持连续
    const cdx = last.x2 - first.x1;
    const cdy = last.y2 - first.y1;
    const clen = Math.sqrt(cdx * cdx + cdy * cdy);
    const ux = clen === 0 ? 0 : (-cdy / clen) * offset;
    const uy = clen === 0 ? 0 : (cdx / clen) * offset;

    for (const seg of parts) {
      renderSegments.push({
        id: seg.id,
        lineId: seg.lineId,
        color: lineColorMap.get(seg.lineId)!,
        x1: seg.x1 + ux,
        y1: seg.y1 + uy,
        x2: seg.x2 + ux,
        y2: seg.y2 + uy,
        width: seg.width ?? LINE_WIDTH,
        dasharray: seg.dasharray,
        fare: seg.fare,
        time: seg.time,
        distance: seg.distance,
        showLabel: seg.showLabel && i === 0,
        pairIndex: seg.pairIndex,
        partIndex: seg.partIndex,
      });
    }
  }
}
