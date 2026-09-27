import stationsData from '../data/stations.json';
import linesData from '../data/lines.json';
import networksData from '../data/networks.json';
import organizationsData from '../data/organizations.json';
import territoriesData from '../data/territories.json';
import markersData from '../data/mark.json';
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
  MARKER_FONT_SIZES,
  MARKER_EMPHASIS_FILL,
  MARKER_LINE_GAP,
  MARKER_TEXT_FILL,
  MARKER_FONT_FAMILY,
  MARKER_FONT_FAMILY_JA,
  type MarkerSize,
  type MarkerTextRole,
} from '../config/render.config';
import { DEFAULT_VEHICLE_ID, defaultCompute, getVehicle, hasVehicle } from '../config/vehicles';
import { DEFAULT_VOICE_TEMPLATE } from '../config/announce.config';
import {
  buildSegmentHeadways,
  parseTimetable,
  segmentKey,
  type VariantTimetable,
} from './timetable';
import { CORE_LOCALES } from './stationNames';
import type { CoreLocale, NameLocale, Names, StationNames } from './stationNames';
import { displayNameLines } from './stationNames';
import { ferryLineNames, sameStationLineNames } from './lineNaming';

export interface StationData {
  id: string;
  names: StationNames;
  /** 本站名的「主语言」= 所属国家/地区的 `primaryLang`；标签主行、搜索结果、路由站名都用它 */
  primaryLang: CoreLocale;
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

/** 途经点：链式增量，单位为数据坐标单位（与 station.x/y 同尺度）。第 1 个点相对区间起点站，之后每个点相对前一个点 */
export type Waypoints = [number, number][];

/** 运营公司 / 运营主体：与线路一样把名称放在 `names` 下（未来可加别的字段） */
export interface OrgInfo {
  names: Names;
  /** 该机构的展示语言 = 所属地区的优先语言（跨地区机构 = 空，只展示简中 / 英文） */
  langs: NameLocale[];
}

export interface LineVariantData {
  /** 短变体名（如 `支线` / `小交路`）；空或省略表示该线路的全线交路 */
  name?: string;
  nameEn?: string;
  /** 本变体选用的车型 id（`config/vehicles.ts`）；省略 = `DEFAULT_VEHICLE_ID` */
  vehicle?: string;
  /** 该变体的站序（完整站点 id） */
  stations: string[];
  /** 变体级时刻表（可选；见 `composables/timetable.ts`），缺省 = 无 */
  timetable?: unknown;
}

export interface LineData {
  id: string;
  /**
   * 线路名：与站点同一套四语键（运营公司 / 运营主体见 `Names`）。
   * 轮渡 / 同站换乘线路不写死名字 —— 运行时由端点站的四语站名派生（`lineNaming.ts`），故此处缺省。
   */
  names?: StationNames;
  /** 线路所属体系（`networks.json`）的 id；轨道线路必有，同站换乘禁止写，区域轮渡可选 */
  network?: string;
  /** 运营公司（`organizations.json` 的 id）；缺省时取体系的同名字段 */
  operator?: string;
  /** 运营主体（`organizations.json` 的 id）；缺省同上 */
  authority?: string;
  /** 配色槽位（轨道线路必有）：`linePalette[slot % length]` */
  colorSlot?: number;
  lineLabels?: [string, string][];
  /** 同一线路的多个交路（支线 / 大小交路），至少一个；变体之间共用线路名与颜色 */
  variants: LineVariantData[];
  /** true = 单向线路，所有变体都只按各自 `stations` 的顺序开行 */
  oneWay?: boolean;
  /** 配音模板 id（`src/data/voice/*.json` 的文件名）；缺省 = 体系的 `voice`，再缺省 = `common` */
  voice?: string;
  lineType?: 'ferry' | 'same-station';
}

/** territories.json 的一级划分（「国家/地区」或「区域」）：稳定 id + 名称 + 该单位的优先语言 */
export interface Territory {
  id: string;
  names: Names;
  /**
   * 该单位的**优先语言**（区域写了就排在国家前面，见 `displayNameLines`）：标签 / 机构名按它决定
   * 「第一个是文本、其余是翻译」。
   */
  langs: NameLocale[];
  /** 名称主语言 = 优先语言里第一个核心四语（`ja` 的稻妻 = `ja`，其余 = `zhCN`）；站点标签、搜索、路由用它 */
  primaryLang: CoreLocale;
}

export interface Station extends StationData {
  /** 所属「国家/地区」（`territories.json` 的 `nations`）；每个站点必有 */
  nation: Territory;
  /** 所属「区域」（`territories.json` 的 `areas`）；该站不属于任何区域时缺省 */
  area?: Territory;
  cx: number;
  cy: number;
}

export interface LineVariant {
  name: string;
  nameEn: string;
  /** 已解析的车型 id（数据里的值，缺省补 `DEFAULT_VEHICLE_ID`） */
  vehicle: string;
  stations: string[];
  /** 已解析并校验的时刻表（缺省 = `{ departures: [] }`） */
  timetable: VariantTimetable;
}

export interface Line extends Omit<LineData, 'variants' | 'names' | 'operator' | 'authority'> {
  /** 已解析的线路名：区域线路取数据里的 `names`，轮渡 / 同站换乘由端点站派生 */
  names: StationNames;
  /** 已解析的线路名主语言（体系 `primaryLang`，缺省 `zhCN`） */
  primaryLang: CoreLocale;
  /** 渲染字体（体系 `fontFamily`，缺省 `Noto Sans SC`） */
  fontFamily: string;
  /** 主语言非 zhCN 时，`names.zhCN` 那一行用的字体 */
  fontFamilyZh?: string;
  /** 已解析的运营公司 / 运营主体对象 */
  operator?: OrgInfo;
  authority?: OrgInfo;
  /** 已解析的配音模板 id（线路 → 体系 → `common`） */
  voice: string;
  color: string;
  variants: LineVariant[];
  /** 派生：所有变体站点的并集（按首次出现顺序），用于「站 ↔ 线路」查询 */
  stations: string[];
  /**
   * 虚拟线路（同站换乘）：它只是换乘关系的载体，不是能乘坐 / 能搜索的真实线路
   * —— 搜索、站点可乘坐线路列表等地方要把它们排除或排在最后。
   */
  virtual: boolean;
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

/**
 * 标注文字的一行 —— `mark.json` 里一条标识的 `names` / `subNames` 在渲染时会被摊平成若干行，
 * 每行一个实例（字号、颜色、字体由标识的类别与开关决定）。
 */
export interface MarkerTextLine {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill: string;
  fontFamily: string;
}

// ---- 输入表的数据形态 ----

interface StationsFileEntry {
  names: StationNames;
  x: number;
  y: number;
  nation: string;
  area?: string;
  labelDir?: string;
}

interface TerritoriesFile {
  nations: Record<string, { names: Names; langs?: NameLocale[]; fontFamily?: string }>;
  areas: Record<string, { names: Names; nation: string; langs?: NameLocale[] }>;
}

interface NetworksFileEntry {
  operator?: string;
  authority?: string;
  primaryLang?: CoreLocale;
  fontFamily?: string;
  voice?: string;
}

interface OrganizationsFileEntry {
  names: Names;
  /** 机构所属地区：只用来取该地区的优先语言（跨地区的机构不写） */
  nation?: string;
}

interface LinesFileEntry extends LineData {}

interface ConnectionsFile {
  connections: ConnectionEntry[];
}

const DEFAULT_NETWORK_FONT = 'Noto Sans SC';
const DEFAULT_PRIMARY_LANG: CoreLocale = 'zhCN';

/** 名称主语言：优先语言里第一个核心四语（须弥的 `sa` / 纳塔的 `sw` 都不是核心四语 → 回落 `zhCN`） */
function primaryLangOf(langs: NameLocale[]): CoreLocale {
  return (
    langs.find((lang): lang is CoreLocale => (CORE_LOCALES as readonly string[]).includes(lang)) ??
    DEFAULT_PRIMARY_LANG
  );
}
const FONT_ZH = 'Noto Serif SC';

function requireNames<T extends Names>(what: string, names: T | undefined): T {
  for (const key of ['zhCN', 'zhTW', 'ja', 'en'] as const) {
    if (!names?.[key]) throw new Error(`${what} 缺少 names.${key}`);
  }
  return names!;
}

// ================= 1. 归属 =================

const territories = territoriesData as unknown as TerritoriesFile;

interface NationInfo {
  territory: Territory;
  primaryLang: CoreLocale;
  fontFamily: string;
}

const nationMap = new Map<string, NationInfo>();
for (const [id, entry] of Object.entries(territories.nations)) {
  const langs = entry.langs ?? [];
  nationMap.set(id, {
    territory: {
      id,
      names: requireNames(`国家/地区 ${id}`, entry.names),
      langs,
      primaryLang: primaryLangOf(langs),
    },
    primaryLang: primaryLangOf(langs),
    fontFamily: entry.fontFamily ?? DEFAULT_NETWORK_FONT,
  });
}

const areaMap = new Map<string, { territory: Territory; nation: string }>();
for (const [id, entry] of Object.entries(territories.areas)) {
  const nation = nationMap.get(entry.nation);
  if (!nation) throw new Error(`区域 ${id} 的国家/地区 ${entry.nation} 不存在`);
  // 优先语言：区域自己写的排在国家前面（区域优先语言 → 国家优先语言）
  const langs = [...(entry.langs ?? []), ...nation.territory.langs];
  areaMap.set(id, {
    territory: {
      id,
      names: requireNames(`区域 ${id}`, entry.names),
      langs,
      primaryLang: primaryLangOf(langs),
    },
    nation: entry.nation,
  });
}

// ================= 2. 机构 =================

const organizations = organizationsData as unknown as Record<string, OrganizationsFileEntry>;
const orgMap = new Map<string, OrgInfo>();
function regionLangs(what: string, regionId: string | undefined): NameLocale[] {
  if (regionId === undefined) return [];
  const found = areaMap.get(regionId) ?? nationMap.get(regionId);
  if (!found) throw new Error(`${what} 的地区 ${regionId} 不存在`);
  return found.territory.langs;
}
for (const [id, entry] of Object.entries(organizations)) {
  orgMap.set(id, {
    names: requireNames(`机构 ${id}`, entry.names) as Names,
    langs: regionLangs(`机构 ${id}`, entry.nation),
  });
}

function requireOrg(lineId: string, what: string, orgId: string | undefined): OrgInfo | undefined {
  if (orgId === undefined) return undefined;
  const org = orgMap.get(orgId);
  if (!org) throw new Error(`线路 ${lineId} 的${what} ${orgId} 不存在`);
  return org;
}

// ================= 3. 体系 =================

const networks = networksData as unknown as Record<string, NetworksFileEntry>;

interface NetworkInfo {
  id: string;
  fontFamily: string;
  primaryLang: CoreLocale;
  operator?: OrgInfo;
  authority?: OrgInfo;
  voice: string;
}

const networkMap = new Map<string, NetworkInfo>();
for (const [id, entry] of Object.entries(networks)) {
  networkMap.set(id, {
    id,
    fontFamily: entry.fontFamily ?? DEFAULT_NETWORK_FONT,
    primaryLang: entry.primaryLang ?? DEFAULT_PRIMARY_LANG,
    operator: requireOrg(id, '运营公司', entry.operator),
    authority: requireOrg(id, '运营主体', entry.authority),
    voice: entry.voice ?? DEFAULT_VOICE_TEMPLATE,
  });
}

// ================= 4. 站点 =================

const stationsFile = stationsData as unknown as Record<string, StationsFileEntry>;

const parsedStations: StationData[] = [];
for (const [id, entry] of Object.entries(stationsFile)) {
  const nation = nationMap.get(entry.nation);
  if (!nation) throw new Error(`站点 ${id} 的国家/地区 ${entry.nation} 不存在`);
  if (entry.area) {
    const area = areaMap.get(entry.area);
    if (!area) throw new Error(`站点 ${id} 的区域 ${entry.area} 不存在`);
    if (area.nation !== entry.nation)
      throw new Error(`站点 ${id} 的区域 ${entry.area} 不属于国家/地区 ${entry.nation}`);
  }
  const primaryLang = nation.primaryLang;
  parsedStations.push({
    id,
    names: requireNames(`站点 ${id}`, entry.names),
    primaryLang,
    x: entry.x,
    y: entry.y,
    labelDir: entry.labelDir,
    fontFamily: nation.fontFamily,
    fontFamilyZh: primaryLang === 'zhCN' ? undefined : FONT_ZH,
  });
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

function territoryOf(
  stationId: string,
  entry: StationsFileEntry,
): { nation: Territory; area?: Territory } {
  const nation = nationMap.get(entry.nation);
  if (!nation) throw new Error(`站点 ${stationId} 的国家/地区 ${entry.nation} 不存在`);
  return {
    nation: nation.territory,
    area: entry.area ? areaMap.get(entry.area)?.territory : undefined,
  };
}

export const stations: Station[] = parsedStations.map((s) => ({
  ...s,
  ...territoryOf(s.id, stationsFile[s.id]),
  cx: (s.x + width / 2 - translateX) * BLOCK_SIZE,
  cy: (s.y + height / 2 - translateY) * BLOCK_SIZE,
}));

export const stationMap = new Map(stations.map((s) => [s.id, s]));

// ================= 5. 连接与费用 =================

/** 连接条目缺 distance 时的默认公里数（等价旧的 `?? 10` 行为） */
export const DEFAULT_CONNECTION_DISTANCE = 10;

const connectionMap = new Map<string, ConnectionEntry>();

const connectionsFile = connectionsData as unknown as ConnectionsFile;

for (const entry of connectionsFile.connections) {
  if (!entry.from.includes('-') || !entry.to.includes('-'))
    throw new Error(`connections.json 必须使用完整站点 id：${entry.from} ~ ${entry.to}`);
  if (!stationMap.has(entry.from) || !stationMap.has(entry.to))
    throw new Error(`connections.json 引用了不存在的站点：${entry.from} ~ ${entry.to}`);
  const key = segmentKey(entry.from, entry.to);
  if (connectionMap.has(key))
    throw new Error(`connections.json 中重复的站点对：${entry.from} ~ ${entry.to}`);
  connectionMap.set(key, entry);
}

/** 两站之间的连接定义；无条目时返回 undefined（距离回退默认值、几何回退直线） */
export function lookupConnection(aId: string, bId: string): ConnectionEntry | undefined {
  return connectionMap.get(segmentKey(aId, bId));
}

export function lookupDistance(aId: string, bId: string): number {
  return lookupConnection(aId, bId)?.distance ?? DEFAULT_CONNECTION_DISTANCE;
}

/** 一段站间行程的费用（摩拉 / 分钟 / 千米） */
export interface PairCost {
  fare: number;
  time: number;
  distance: number;
}

/**
 * 线路变体在某站对上的一程费用：距离先由 `connections.json` 查出，再交给该变体车型的
 * 计算公式（缺省 = 设计时速推时间、票价系数推票价）。
 * **时间不化整**（保留原始小数，展示层再用 `formatDuration` / `formatDurationShort` 处理），
 * 票价四舍五入到整数摩拉。渲染段的标签、路由图的边权、信息面板的区间费用都走这一个函数。
 */
export function pairCost(vehicleId: string, aId: string, bId: string): PairCost {
  const distance = lookupDistance(aId, bId);
  const vehicle = getVehicle(vehicleId);
  const { time, fare } = (vehicle.compute ?? defaultCompute)(distance, vehicle);
  return {
    fare: Math.round(fare),
    time,
    distance,
  };
}

// ================= 6. 线路 =================

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

function namesOfStation(lineId: string, id: string): StationNames {
  const st = stationMap.get(id);
  if (!st) throw new Error(`线路 ${lineId} 引用了不存在的站点：${id}`);
  return st.names;
}

/** 轮渡 / 同站换乘线路名：由端点站的四语站名派生（数据里不写 names），同站换乘取首站 */
function derivedLineNames(line: LineData): StationNames {
  const ids = line.variants[0].stations;
  if (line.lineType === 'ferry') {
    if (ids.length !== 2)
      throw new Error(`轮渡 ${line.id} 应有恰好 2 个端点站，实际 ${ids.length} 个`);
    return ferryLineNames(namesOfStation(line.id, ids[0]), namesOfStation(line.id, ids[1]));
  }
  return sameStationLineNames(namesOfStation(line.id, ids[0]));
}

/** 线路名：轨道线路用数据里的四语名，轮渡 / 同站换乘线路名一律派生，数据里写了就是矛盾 */
function resolveLineNames(line: LineData): StationNames {
  if (!line.lineType) {
    if (!line.names) throw new Error(`线路 ${line.id} 缺少 names`);
    for (const key of ['zhCN', 'zhTW', 'ja', 'en'] as const) {
      if (!line.names[key]) throw new Error(`线路 ${line.id} 缺少 names.${key}`);
    }
    return line.names;
  }
  if (line.names) throw new Error(`线路 ${line.id} 的线路名由端点站动态派生，数据里不应写 names`);
  return derivedLineNames(line);
}

/** 校验：至少一个变体，每个变体至少两个站点且引用真实站点 */
function assertVariants(line: LineData): void {
  if (!Array.isArray(line.variants) || line.variants.length === 0)
    throw new Error(`线路 ${line.id} 缺少 variants`);
  for (const variant of line.variants) {
    if (!Array.isArray(variant.stations) || variant.stations.length < 2)
      throw new Error(`线路 ${line.id} 的变体站点数不足 2 个`);
    if (variant.vehicle && !hasVehicle(variant.vehicle))
      throw new Error(`线路 ${line.id} 的变体引用了未知车型：${variant.vehicle}`);
    for (const sid of variant.stations) {
      if (!stationMap.has(sid)) throw new Error(`线路 ${line.id} 引用了不存在的站点：${sid}`);
    }
  }
}

const linesFile = linesData as unknown as Record<string, LinesFileEntry>;

export const lines: Line[] = Object.entries(linesFile).map(([id, entry]) => {
  const line: LineData = { ...entry, id };
  assertVariants(line);

  // 体系 / 配色槽位
  let network: NetworkInfo | undefined;
  if (line.lineType === 'same-station') {
    if (line.network) throw new Error(`线路 ${id} 不应有 network`);
  } else if (line.lineType === 'ferry') {
    if (line.network) {
      network = networkMap.get(line.network);
      if (!network) throw new Error(`线路 ${id} 的 network ${line.network} 不存在`);
    }
  } else {
    if (!line.network) throw new Error(`线路 ${id} 缺少 network`);
    network = networkMap.get(line.network);
    if (!network) throw new Error(`线路 ${id} 的 network ${line.network} 不存在`);
    if (line.colorSlot === undefined) throw new Error(`线路 ${id} 缺少 colorSlot`);
  }
  if (line.lineType && line.colorSlot !== undefined) throw new Error(`线路 ${id} 不应有 colorSlot`);

  const primaryLang = network?.primaryLang ?? DEFAULT_PRIMARY_LANG;
  const fontFamily = network?.fontFamily ?? DEFAULT_NETWORK_FONT;

  return {
    ...line,
    names: resolveLineNames(line),
    network: line.network,
    primaryLang,
    fontFamily,
    fontFamilyZh: primaryLang === 'zhCN' ? undefined : FONT_ZH,
    operator: requireOrg(id, '运营公司', line.operator) ?? network?.operator,
    authority: requireOrg(id, '运营主体', line.authority) ?? network?.authority,
    voice: line.voice ?? network?.voice ?? DEFAULT_VOICE_TEMPLATE,
    color:
      line.lineType === 'ferry'
        ? FERRY_COLOR
        : line.lineType === 'same-station'
          ? SAME_COLOR
          : linePalette[(line.colorSlot ?? 0) % linePalette.length],
    variants: line.variants.map((variant, variantIndex) => {
      const vehicle = variant.vehicle ?? DEFAULT_VEHICLE_ID;
      return {
        name: variant.name ?? '',
        nameEn: variant.nameEn ?? '',
        vehicle,
        stations: variant.stations,
        timetable: parseTimetable(variant.timetable, {
          lineId: id,
          variantIndex,
          virtual: line.lineType === 'same-station',
          oneWay: line.oneWay === true,
          stations: variant.stations,
          vehicle,
        }),
      };
    }),
    stations: unionStations(line.variants),
    virtual: line.lineType === 'same-station',
  };
});

export const lineColorMap = new Map(lines.map((l) => [l.id, l.color]));

/**
 * 每条区间的最小固定间隔（分钟），由各变体的 `timetable.interval` 派生（一天里各时段的最小值）。
 * `Infinity` = 该区间一天里始终不开行（空档 / `interval: null`）；无条目 = 该区间没有时刻表数据。
 * 无消费方，供后续时刻表层使用。
 */
export const segmentHeadways: Map<string, number> = buildSegmentHeadways(lines);

/** 某对站点之间的最小固定间隔（分钟）；无条目 = 未定义，`Infinity` = 不开行 */
export function headwayFor(aId: string, bId: string): number | undefined {
  return segmentHeadways.get(segmentKey(aId, bId));
}

// 换乘站判定：一条线路的多个变体算同一条线路 → 只看线路，不看变体
const stationLineCount = new Map<string, number>();
for (const line of lines) {
  for (const sid of line.stations) {
    stationLineCount.set(sid, (stationLineCount.get(sid) || 0) + 1);
  }
}

export const transferStationIds = new Set(
  [...stationLineCount.entries()].filter(([, c]) => c >= 2).map(([id]) => id),
);

/** 站点 → 服务它的线路（按 `lines` 顺序；站点信息面板与地图高亮共用一份） */
export const stationLineMap = new Map<string, Line[]>();
for (const line of lines) {
  for (const sid of line.stations) {
    const arr = stationLineMap.get(sid);
    if (arr) arr.push(line);
    else stationLineMap.set(sid, [line]);
  }
}

/** 列线路时的顺序：真实线路在前，虚拟线路（同站换乘）排最后；同档保持原有顺序 */
export function sortLinesForDisplay<T extends { virtual: boolean }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(a.virtual) - Number(b.virtual));
}

// ================= 7. 标注 =================

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

/** `mark.json` 里的一条标识：`names` 是主文字（其坐标是整条标识的锚点）、`subNames` 是副文字，都可选额外语言 */
interface MarkTextData {
  /** 标识类别：`large` 大标识 / `small` 小标识（缺省 = 小标识）；JSON 导入时字面量会被拓宽成 string */
  size?: string;
  names: Names;
  subNames?: Names;
  /** 重点标识：文字用 `MARKER_EMPHASIS_FILL` */
  emphasis?: boolean;
  /** 日文标识：用日语字体 `MARKER_FONT_FAMILY_JA`（语言顺序由 `region` 的优先语言决定） */
  ja?: boolean;
  /**
   * 该标识属于哪个地区（`territories.json` 的 nation 或 area id）：展示语言 = 该地区的优先语言 + 简中 + 英文。
   * 不写 = 只展示简中 + 英文。
   */
  region?: string;
  /** `names` 一行的坐标（数据坐标单位） */
  x: number;
  y: number;
}

interface MarkPathData {
  d: string;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
}

const markerPathsData: MarkPathData[] = markersData.paths ?? [];
const markerTextsData: MarkTextData[] = markersData.texts ?? [];

export const markerPaths: MarkerPath[] = markerPathsData.map((p, i) => ({
  id: `marker-path-${i}`,
  d: transformPathD(p.d, (x, y) => [(x - minX) * BLOCK_SIZE, (y - minY) * BLOCK_SIZE]),
  stroke: p.stroke ?? MARKER_STROKE,
  strokeWidth: p.strokeWidth ?? MARKER_STROKE_WIDTH,
  fill: p.fill ?? MARKER_FILL,
}));

/**
 * 把每条标识摊平成逐行文字：`names` 按 `displayNameLines` 决定的语言顺序（主语言 → 简中 → 繁中 → 英文 →
 * 额外语言，同文的跳过）铺开，第一行用 `text` 字号、其余用 `trans` 字号；`subNames` 同样铺开
 * （第一行 `subtext`、其余 `subtextTrans`）。
 * 一行一个实例，从 `names` 的 y 起，每多一行就下移「**这一行自己的**字号 / `BLOCK_SIZE` + `MARKER_LINE_GAP`」
 * （逐行累加，所以第 3 行比第 2 行又多 0.1）。
 */
export const markerTexts: MarkerTextLine[] = markerTextsData.flatMap((t, i) => {
  const sizes = MARKER_FONT_SIZES[t.size === 'large' ? 'large' : 'small'];
  const fill = t.emphasis ? MARKER_EMPHASIS_FILL : MARKER_TEXT_FILL;
  const fontFamily = t.ja ? MARKER_FONT_FAMILY_JA : MARKER_FONT_FAMILY;
  const x = (t.x - minX) * BLOCK_SIZE;
  const langs = regionLangs(`标注 ${i}`, t.region);

  const rows: { role: MarkerTextRole; text: string }[] = [];
  const names = displayNameLines(requireNames(`标注 ${i}`, t.names), langs);
  rows.push(
    ...names.map((line, k) => ({ role: k === 0 ? 'text' : 'trans', text: line.text }) as const),
  );
  if (t.subNames) {
    const subs = displayNameLines(requireNames(`标注 ${i} 的副文字`, t.subNames), langs);
    rows.push(
      ...subs.map(
        (line, k) => ({ role: k === 0 ? 'subtext' : 'subtextTrans', text: line.text }) as const,
      ),
    );
  }

  const lines: MarkerTextLine[] = [];
  let y = t.y;
  rows.forEach((row, k) => {
    const fontSize = sizes[row.role];
    if (lines.length) y += fontSize / BLOCK_SIZE + MARKER_LINE_GAP;
    lines.push({
      id: `marker-text-${i}-${k}-${row.role}`,
      text: row.text,
      x,
      y: (y - minY) * BLOCK_SIZE,
      fontSize,
      fill,
      fontFamily,
    });
  });
  return lines;
});

// ================= 8. 渲染段 =================

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

function lineWidth(line: { lineType?: 'ferry' | 'same-station' }): number | undefined {
  return line.lineType === 'ferry'
    ? FERRY_LINE_WIDTH
    : line.lineType === 'same-station'
      ? SAME_LINE_WIDTH
      : undefined;
}

/**
 * 线路全部变体按顺序展开后的站间区间。同一无向站对只保留首次出现的方向与车型：变体共用同一段轨道，
 * 不能因为两个变体都经过而占两个平行轨道槽位（费用标签同理，取首个经过该区间的变体的车型）。
 */
function linePairs(variants: LineVariantData[]): { a: string; b: string; vehicle: string }[] {
  const seen = new Set<string>();
  const out: { a: string; b: string; vehicle: string }[] = [];
  for (const variant of variants) {
    for (let i = 0; i < variant.stations.length - 1; i++) {
      const a = variant.stations[i];
      const b = variant.stations[i + 1];
      const key = [a, b].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a, b, vehicle: variant.vehicle ?? DEFAULT_VEHICLE_ID });
    }
  }
  return out;
}

for (const line of lines) {
  const lw = lineWidth(line);
  const dash = line.lineType === 'ferry' ? FERRY_DASH : undefined;
  const pairs = linePairs(line.variants);
  for (let i = 0; i < pairs.length; i++) {
    const { a: aId, b: bId, vehicle } = pairs[i];
    const sa = stationMap.get(aId);
    const sb = stationMap.get(bId);
    if (!sa || !sb) continue;

    const { fare, time, distance } = pairCost(vehicle, aId, bId);

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
        distance,
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
