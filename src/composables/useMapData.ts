import dataR from '../data/teyvat.json';
import dataI from '../data/inazuma.json';
import dataL from '../data/liyue.json';
import dataS from '../data/snezhnaya.json';
import markersData from '../data/mark.json';
import ferryData from '../data/ferry.json';
import sameData from '../data/same.json';
import {
  BLOCK_SIZE,
  margin,
  palette,
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

export interface StationData {
  id: string;
  prefix: string;
  name: string;
  nameZh?: string;
  nameEn: string;
  x: number;
  y: number;
  labelDir?: string;
  fontFamily: string;
  fontFamilyZh?: string;
}

export interface StationDistanceEntry {
  from: string;
  to: string;
  distance: number;
}

export interface PresetConfig {
  id: string;
  name: string;
  nameEn: string;
  farePerKm: number;
  minutesPerKm: number;
}

export interface LineData {
  id: string;
  name: string;
  nameZh?: string;
  nameEn: string;
  costPreset: string;
  lineLabels?: [string, string][];
  stations: [string, boolean][];
  fontFamily?: string;
  fontFamilyZh?: string;
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

export interface Line {
  id: string;
  name: string;
  nameZh?: string;
  nameEn: string;
  color: string;
  costPreset: string;
  lineLabels?: [string, string][];
  stations: [string, boolean][];
  fontFamily?: string;
  fontFamilyZh?: string;
  lineType?: 'ferry' | 'same-station';
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
  config: { x: number; y: number; name: string; fontFamily?: string };
  stations: {
    id: string;
    nameCn: string;
    nameEn: string;
    x: number;
    y: number;
    labelDir?: string;
  }[];
  lines: LineData[];
  stationDistances?: StationDistanceEntry[];
}

function parseStationsJson(data: RegionFile): {
  stations: StationData[];
  prefix: string;
  fontFamily: string;
} {
  const { config, stations: entries } = data;
  const prefix = config.name;
  const fontFamily = config.fontFamily || 'sans-serif';
  const fontFamilyZh = 'Noto Serif SC';
  const stations = entries.map((e) => ({
    id: prefix + '-' + e.id,
    prefix,
    name: e.nameCn,
    nameZh: (e as any).nameZh || undefined,
    nameEn: e.nameEn,
    x: e.x + config.x,
    y: e.y + config.y,
    labelDir: e.labelDir,
    fontFamily,
    fontFamilyZh: (e as any).nameZh ? fontFamilyZh : undefined,
  }));
  return { stations, prefix, fontFamily };
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

for (const line of parsedLinesR) {
  line.stations = line.stations.map(([id, dir]) => [regionStationId(parsedR.prefix, id), dir]);
  if (line.lineLabels)
    line.lineLabels = line.lineLabels.map(([id, dir]) => [
      regionStationId(parsedR.prefix, id),
      dir,
    ]);
  line.fontFamily = parsedR.fontFamily;
}
for (const line of parsedLinesI) {
  line.stations = line.stations.map(([id, dir]) => [regionStationId(parsedI.prefix, id), dir]);
  if (line.lineLabels)
    line.lineLabels = line.lineLabels.map(([id, dir]) => [
      regionStationId(parsedI.prefix, id),
      dir,
    ]);
  line.fontFamily = parsedI.fontFamily;
  if (line.nameZh) line.fontFamilyZh = 'Noto Serif SC';
}
for (const line of parsedLinesL) {
  line.stations = line.stations.map(([id, dir]) => [regionStationId(parsedL.prefix, id), dir]);
  if (line.lineLabels)
    line.lineLabels = line.lineLabels.map(([id, dir]) => [
      regionStationId(parsedL.prefix, id),
      dir,
    ]);
  line.fontFamily = parsedL.fontFamily;
}
for (const line of parsedLinesS) {
  line.stations = line.stations.map(([id, dir]) => [regionStationId(parsedS.prefix, id), dir]);
  if (line.lineLabels)
    line.lineLabels = line.lineLabels.map(([id, dir]) => [
      regionStationId(parsedS.prefix, id),
      dir,
    ]);
  line.fontFamily = parsedS.fontFamily;
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

const parsedStationDistancesR: StationDistanceEntry[] = (dataR as any).stationDistances ?? [];
const parsedStationDistancesI: StationDistanceEntry[] = (dataI as any).stationDistances ?? [];
const parsedStationDistancesL: StationDistanceEntry[] = (dataL as any).stationDistances ?? [];
const parsedStationDistancesS: StationDistanceEntry[] = (dataS as any).stationDistances ?? [];

function prefixDistances(entries: StationDistanceEntry[], prefix: string): StationDistanceEntry[] {
  return entries.map((e) => ({
    from: regionStationId(prefix, e.from),
    to: regionStationId(prefix, e.to),
    distance: e.distance,
  }));
}

const parsedRegionDistances: StationDistanceEntry[] = [
  ...prefixDistances(parsedStationDistancesR, parsedR.prefix),
  ...prefixDistances(parsedStationDistancesI, parsedI.prefix),
  ...prefixDistances(parsedStationDistancesL, parsedL.prefix),
  ...prefixDistances(parsedStationDistancesS, parsedS.prefix),
];

const parsedFerryDistances: StationDistanceEntry[] = (ferryData as any).stationDistances ?? [];
const parsedSameDistances: StationDistanceEntry[] = (sameData as any).stationDistances ?? [];

const allDistances: StationDistanceEntry[] = [
  ...parsedRegionDistances,
  ...parsedFerryDistances,
  ...parsedSameDistances,
];

export const stationDistanceMap = new Map<string, number>();
for (const d of allDistances) {
  const key = [d.from, d.to].sort().join('|');
  stationDistanceMap.set(key, d.distance);
}

export function lookupDistance(aId: string, bId: string): number {
  const key = [aId, bId].sort().join('|');
  return stationDistanceMap.get(key) ?? 10;
}

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

const stationLineCount = new Map<string, number>();
for (const line of parsedLines) {
  for (const sid of new Set(line.stations.map(([id]) => id))) {
    stationLineCount.set(sid, (stationLineCount.get(sid) || 0) + 1);
  }
}

export const transferStationIds = new Set(
  [...stationLineCount.entries()].filter(([, c]) => c >= 2).map(([id]) => id),
);

export const lines: Line[] = parsedLines.map((line, index) => ({
  ...line,
  color:
    line.lineType === 'ferry'
      ? FERRY_COLOR
      : line.lineType === 'same-station'
        ? SAME_COLOR
        : palette[index % palette.length],
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

function isAllowedSegment(dx: number, dy: number): boolean {
  return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
}

interface RawSegment {
  id: string;
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

function lineWidth(line: LineData): number | undefined {
  return line.lineType === 'ferry'
    ? FERRY_LINE_WIDTH
    : line.lineType === 'same-station'
      ? SAME_LINE_WIDTH
      : undefined;
}

const specialLineTypes = new Set(['ferry', 'same-station']);

for (const line of parsedLines) {
  const lw = lineWidth(line);
  const dash = line.lineType === 'ferry' ? FERRY_DASH : undefined;
  for (let i = 0; i < line.stations.length - 1; i++) {
    const [aId, aDir] = line.stations[i];
    const [bId] = line.stations[i + 1];
    const sa = stationMap.get(aId);
    const sb = stationMap.get(bId);
    if (!sa || !sb) continue;

    const dist = lookupDistance(aId, bId);
    const preset = getPreset(line.costPreset);
    const fare = Math.round(dist * preset.farePerKm);
    const time = Math.round(dist * preset.minutesPerKm);

    const ax = sa.cx,
      ay = sa.cy;
    const bx = sb.cx,
      by = sb.cy;
    const dx = bx - ax,
      dy = by - ay;

    if (specialLineTypes.has(line.lineType!) || isAllowedSegment(dx, dy)) {
      rawSegments.push({
        id: pathId(ax, ay, bx, by),
        lineId: line.id,
        pairIndex: i,
        partIndex: 0,
        x1: ax,
        y1: ay,
        x2: bx,
        y2: by,
        width: lw,
        dasharray: dash,
        fare,
        time,
        distance: dist,
        showLabel: true,
      });
    } else {
      const diagFirst = aDir;
      let cx: number, cy: number;
      if (diagFirst) {
        if (Math.abs(dx) > Math.abs(dy)) {
          cx = ax + Math.sign(dx) * Math.abs(dy);
          cy = by;
        } else {
          cx = bx;
          cy = ay + Math.sign(dy) * Math.abs(dx);
        }
      } else {
        if (Math.abs(dx) > Math.abs(dy)) {
          cx = bx - Math.sign(dx) * Math.abs(dy);
          cy = ay;
        } else {
          cx = ax;
          cy = by - Math.sign(dy) * Math.abs(dx);
        }
      }

      rawSegments.push({
        id: pathId(ax, ay, cx, cy),
        lineId: line.id,
        pairIndex: i,
        partIndex: 0,
        x1: ax,
        y1: ay,
        x2: cx,
        y2: cy,
        fare,
        time,
        distance: dist,
        showLabel: true,
      });
      rawSegments.push({
        id: pathId(cx, cy, bx, by),
        lineId: line.id,
        pairIndex: i,
        partIndex: 1,
        x1: cx,
        y1: cy,
        x2: bx,
        y2: by,
        fare,
        time,
        distance: dist,
        showLabel: false,
      });
    }
  }
}

const segmentGroups = new Map<string, RawSegment[]>();
for (const seg of rawSegments) {
  let group = segmentGroups.get(seg.id);
  if (!group) {
    group = [];
    segmentGroups.set(seg.id, group);
  }
  group.push(seg);
}

function offsetCoords(x1: number, y1: number, x2: number, y2: number, offset: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x1, y1, x2, y2 };
  const ux = (-dy / len) * offset;
  const uy = (dx / len) * offset;
  return { x1: x1 + ux, y1: y1 + uy, x2: x2 + ux, y2: y2 + uy };
}

export const renderSegments: RenderSegment[] = [];

for (const [, segments] of segmentGroups) {
  segments.sort((a, b) => a.lineId.localeCompare(b.lineId));
  const n = segments.length;
  for (let i = 0; i < n; i++) {
    const seg = segments[i];
    const offset = (i - (n - 1) / 2) * LINE_WIDTH;
    const coords = offsetCoords(seg.x1, seg.y1, seg.x2, seg.y2, offset);
    renderSegments.push({
      id: seg.id,
      lineId: seg.lineId,
      color: lineColorMap.get(seg.lineId)!,
      ...coords,
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
