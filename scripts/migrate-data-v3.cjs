// 一次性迁移：把 4 个地区分册 + ferry.json + same.json + regions.json 合并成
// stations.json / lines.json / networks.json / organizations.json / territories.json。
// 运行：node scripts/migrate-data-v3.cjs
// 不删除旧文件，只打印待删清单；色位校验不通过则不写任何新文件。
'use strict';

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'src', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf-8'));

// ---- linePalette（与 render.config.ts 同算法，脚本自足） ----
const BASE = ['#e6194b', '#f58231', '#ffe119', '#3cb44b', '#42d4f4', '#4363d8', '#911eb4'];
function mixColor(hex, target, ratio) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = rgb(hex);
  const [r2, g2, b2] = rgb(target);
  const mix = (a, b) => Math.round(a + (b - a) * ratio);
  const ch = (v) => v.toString(16).padStart(2, '0');
  return `#${ch(mix(r1, r2))}${ch(mix(g1, g2))}${ch(mix(b1, b2))}`;
}
const linePalette = [
  ...BASE,
  ...BASE.map((c) => mixColor(c, '#ffffff', 0.35)),
  ...BASE.map((c) => mixColor(c, '#000000', 0.3)),
  ...BASE.map((c) => mixColor(c, '#ffffff', 0.65)),
  ...BASE.map((c) => mixColor(c, '#000000', 0.55)),
];

// ---- 输入 ----
const REGION_FILES = [
  { key: 'teyvat', data: read('teyvat.json'), network: 'teyvat' },
  { key: 'inazuma', data: read('inazuma.json'), network: 'inazuma' },
  { key: 'liyue', data: read('liyue.json'), network: 'liyue-metro' },
  { key: 'snezhnaya', data: read('snezhnaya.json'), network: 'snezhnaya' },
];
const ferryFile = read('ferry.json');
const sameFile = read('same.json');
const regions = read('regions.json');

// 每条轨道线路所属体系（按线路 id）
const LINE_NETWORK = {};
for (const rf of REGION_FILES) {
  for (const line of rf.data.lines) {
    if (line.lineType) continue;
    LINE_NETWORK[line.id] = rf.network;
  }
}
// 区域轮渡的体系（其余轮渡无体系）
const FERRY_NETWORK = {
  'ferry-fnc-vop': 'teyvat',
  'ferry-hgv-wte': 'inazuma',
  'ferry-izc-tmp': 'inazuma',
};

const orgId = (en) =>
  en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const NAMES_KEYS = ['zhCN', 'zhTW', 'ja', 'en', 'pronunciationJa'];

function orderedNames(src) {
  const out = {};
  for (const k of NAMES_KEYS) if (src && src[k] !== undefined) out[k] = src[k];
  return out;
}

function orgNames(src) {
  const out = {};
  for (const k of [...NAMES_KEYS, 'ru']) if (src && src[k] !== undefined) out[k] = src[k];
  return out;
}

function regionStationId(prefix, id) {
  return id.includes('-') ? id : `${prefix}-${id}`;
}

// ================= stations.json + territories.json =================
const stationTerritory = regions.stations;
const stationsOut = {};
for (const rf of REGION_FILES) {
  const { config, stations } = rf.data;
  const prefix = config.name;
  for (const s of stations) {
    const id = `${prefix}-${s.id}`;
    const terr = stationTerritory[id];
    if (!terr) throw new Error(`regions.json 缺少站点 ${id} 的归属`);
    const entry = {
      names: orderedNames(s.names),
      x: s.x + config.x,
      y: s.y + config.y,
      nation: terr.nation,
    };
    if (terr.area) entry.area = terr.area;
    if (s.labelDir) entry.labelDir = s.labelDir;
    stationsOut[id] = entry;
  }
}

const territoriesOut = { nations: {}, areas: {} };
for (const [id, n] of Object.entries(regions.nations)) {
  const entry = { names: orderedNames(n.names) };
  if (id === 'inazuma') {
    entry.primaryLang = 'ja';
    entry.fontFamily = 'Noto Serif JP';
  }
  territoriesOut.nations[id] = entry;
}
for (const [id, a] of Object.entries(regions.areas)) {
  territoriesOut.areas[id] = { names: orderedNames(a.names), nation: a.nation };
}

// ================= organizations.json =================
const orgs = new Map(); // id -> { names }
function collectOrg(obj) {
  if (!obj) return null;
  const id = orgId(obj.names.en);
  if (id === 'cross-bureau') return null; // 跨局不再迁移
  if (!orgs.has(id)) orgs.set(id, { names: orgNames(obj.names) });
  return id;
}

// config 级
for (const rf of REGION_FILES) {
  collectOrg(rf.data.config.operator);
  collectOrg(rf.data.config.authority);
}
// 线路级
for (const rf of REGION_FILES) {
  for (const line of rf.data.lines) {
    collectOrg(line.operator);
    collectOrg(line.authority);
  }
}

const OP_ORDER = [
  'teyvat-railway',
  'liyue-harbor-metro',
  'fontaine-aquabus',
  'easybreeze-holiday-resort-transit',
  'inazuma-railways',
  'snezhnaya-royal-railway',
];
const AUTH_ORDER = [
  'mondstadt-bureau',
  'liyue-bureau',
  'sumeru-bureau',
  'natlan-bureau',
  'nod-krai-bureau',
  'court-of-fontaine',
  'inazuma-shogunate',
  'watatsumi-sangonomiya-autonomous-government',
  'liyue-ministry-of-civil-affairs',
  'snezhnaya-royal-railway-transport-bureau',
  'easybreeze-holiday-resort-management-committee',
];

// ================= networks.json =================
const networksOut = {
  teyvat: { operator: 'teyvat-railway' },
  'liyue-metro': { operator: 'liyue-harbor-metro', authority: 'liyue-ministry-of-civil-affairs' },
  aquabus: { operator: 'fontaine-aquabus', authority: 'court-of-fontaine' },
  inazuma: {
    operator: 'inazuma-railways',
    authority: 'inazuma-shogunate',
    primaryLang: 'ja',
    fontFamily: 'Noto Serif JP',
  },
  snezhnaya: {
    operator: 'snezhnaya-royal-railway',
    authority: 'snezhnaya-royal-railway-transport-bureau',
  },
  easybreeze: {
    operator: 'easybreeze-holiday-resort-transit',
    authority: 'easybreeze-holiday-resort-management-committee',
  },
};

// ================= lines.json =================
const linesOut = {};

function buildVariants(line) {
  return line.variants.map((v) => {
    const out = {};
    if (v.name) out.name = v.name;
    if (v.nameEn) out.nameEn = v.nameEn;
    if (v.vehicle && v.vehicle !== 'standard') out.vehicle = v.vehicle;
    out.stations = v.stations.slice();
    return out;
  });
}

function authorityOverride(line, prefix, network) {
  // 线路自己的 authority：A/B 的「跨局」改为 liyue-bureau
  let raw = line.authority ? orgId(line.authority.names.en) : null;
  if (raw === 'cross-bureau') raw = 'liyue-bureau';
  const net = networksOut[network];
  const netAuth = net ? net.authority : undefined;
  if (raw && raw !== netAuth) return raw;
  return undefined;
}

// 轨道线路
for (const rf of REGION_FILES) {
  const prefix = rf.data.config.name;
  const network = rf.network;
  let slot = 0;
  for (const line of rf.data.lines) {
    if (line.lineType) continue;
    const out = { names: orderedNames(line.names), network };
    const auth = authorityOverride(line, prefix, network);
    if (auth) out.authority = auth;
    out.colorSlot = slot++;
    if (line.oneWay) out.oneWay = true;
    if (line.lineLabels && line.lineLabels.length) {
      out.lineLabels = line.lineLabels.map(([id, dir]) => [regionStationId(prefix, id), dir]);
    }
    out.variants = buildVariants(line);
    linesOut[line.id] = out;
  }
}

// 轮渡：区域轮渡（已带完整 id）→ ferry.json
const ferryOrder = ['ferry-fnc-vop', 'ferry-hgv-wte', 'ferry-izc-tmp'];
const allFerries = new Map();
for (const rf of REGION_FILES) {
  for (const line of rf.data.lines) if (line.lineType === 'ferry') allFerries.set(line.id, line);
}
for (const line of ferryFile.lines) allFerries.set(line.id, line);
const orderedFerries = [...ferryOrder, ...ferryFile.lines.map((l) => l.id)];
for (const id of orderedFerries) {
  const line = allFerries.get(id);
  const out = { lineType: 'ferry' };
  if (FERRY_NETWORK[id]) out.network = FERRY_NETWORK[id];
  out.variants = buildVariants(line);
  linesOut[id] = out;
}

// 同站换乘
for (const line of sameFile.lines) {
  linesOut[line.id] = { lineType: 'same-station', variants: buildVariants(line) };
}

// ================= 校验：旧颜色 vs 新 colorSlot =================
const errors = [];
const table = [];
for (const rf of REGION_FILES) {
  let idx = 0;
  for (const line of rf.data.lines) {
    if (line.lineType) continue;
    const oldColor = linePalette[idx % linePalette.length];
    const slot = linesOut[line.id].colorSlot;
    const newColor = linePalette[slot % linePalette.length];
    const ok = oldColor === newColor;
    table.push({ line: line.id, slot, oldColor, newColor, ok });
    if (!ok) errors.push(`线路 ${line.id}：旧色 ${oldColor} ≠ 新色 ${newColor}`);
    idx++;
  }
}
console.log('=== 色位校验 ===');
for (const r of table)
  console.log(`${r.line}\tslot=${r.slot}\t${r.newColor}\t${r.ok ? 'OK' : 'MISMATCH'}`);
if (errors.length) {
  console.error('色位校验失败，不写任何新文件：');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

// ================= 写出 =================
const writeJson = (file, data) =>
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(data, null, 2) + '\n', 'utf-8');

// organizations.json：按固定顺序拼装
const organizationsOut = {};
for (const id of [...OP_ORDER, ...AUTH_ORDER]) {
  const entry = orgs.get(id);
  if (!entry) {
    console.error(`organizations 缺少预期条目：${id}`);
    process.exit(1);
  }
  organizationsOut[id] = entry;
}
for (const id of orgs.keys()) {
  if (!organizationsOut[id]) {
    console.error(`organizations 出现未列入顺序表的条目：${id}`);
    process.exit(1);
  }
}

writeJson('stations.json', stationsOut);
writeJson('territories.json', territoriesOut);
writeJson('organizations.json', organizationsOut);
writeJson('networks.json', networksOut);
writeJson('lines.json', linesOut);

console.log(
  '\n已写出：stations.json / territories.json / organizations.json / networks.json / lines.json',
);
console.log(
  `stations=${Object.keys(stationsOut).length} lines=${Object.keys(linesOut).length} networks=${Object.keys(networksOut).length} orgs=${Object.keys(organizationsOut).length}`,
);
console.log('\n待删清单（校验通过后手动删除）：');
console.log(
  '  src/data/teyvat.json src/data/inazuma.json src/data/liyue.json src/data/snezhnaya.json',
);
console.log('  src/data/ferry.json src/data/same.json src/data/regions.json');
