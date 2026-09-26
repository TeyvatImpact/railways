// 一次性迁移：把 lines[].stations 包装成 lines[].variants，并为部分线路建立变体
//
//   M1 蒙德局·自由线 / A 跨局·原初线 / L2 璃月局·沉玉谷线 → 追加「小交路」变体（现站序的前缀或后缀）
//   K2 挪德卡莱局·帕哈岛线 / K3 挪德卡莱局·虚海望线 → 吞并 K2-B / K3-B 作为「支线」变体并删除原条目
//
// 用 `node scripts/migrate-line-variants.cjs` 运行一次；已迁移过的文件会抛错而不是重复执行。
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'src', 'data');
const FILES = ['teyvat', 'inazuma', 'liyue', 'snezhnaya', 'ferry', 'same'];

function readFile(name) {
  return JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
}

function writeFile(name, data) {
  fs.writeFileSync(path.join(DIR, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
}

function expectStations(stations, want, label) {
  if (JSON.stringify(stations) !== JSON.stringify(want)) {
    throw new Error(
      `${label} 站序与预期不符\n got  ${JSON.stringify(stations)}\n want ${JSON.stringify(want)}`,
    );
  }
}

/** 把 line.stations 换成 variants: [{ stations }]，保持其它键的书写顺序 */
function wrapLine(line) {
  if (line.variants) throw new Error(`线路 ${line.id} 已有 variants（迁移已执行过？）`);
  if (!Array.isArray(line.stations) || line.stations.length < 2)
    throw new Error(`线路 ${line.id} 的 stations 非法`);
  const out = {};
  for (const [key, value] of Object.entries(line)) {
    if (key === 'stations') out.variants = [{ stations: value }];
    else out[key] = value;
  }
  return out;
}

const files = {};
for (const name of FILES) {
  const data = readFile(name);
  if (!Array.isArray(data.lines)) throw new Error(`${name}.json 缺少 lines`);
  const before = data.lines.length;
  data.lines = data.lines.map(wrapLine);
  files[name] = data;
  console.log(`${name}.json: ${before} 条线路包装为单变体`);
}

// ---- teyvat.json 上的结构改动 ----

const teyvat = files.teyvat;
const findLine = (id) => {
  const line = teyvat.lines.find((l) => l.id === id);
  if (!line) throw new Error(`找不到线路 ${id}`);
  return line;
};
const addVariant = (line, variant) => line.variants.push(variant);
const shortTurnback = (line, stations) =>
  addVariant(line, { name: '小交路', nameEn: 'Short Turnback', stations });

// M1：全线 + 前 4 站（星落湖 → 风起地）
{
  const line = findLine('M1');
  expectStations(
    line.variants[0].stations,
    [
      'Teyvat-SFL',
      'Teyvat-WSW',
      'Teyvat-MSG',
      'Teyvat-WDR',
      'Teyvat-DSC',
      'Teyvat-SCP',
      'Teyvat-WRV',
    ],
    'M1',
  );
  shortTurnback(line, line.variants[0].stations.slice(0, 4));
}

// A：全线 + 前 16 站（风神像 → 须弥城）
{
  const line = findLine('A');
  expectStations(
    line.variants[0].stations,
    [
      'Teyvat-SAA',
      'Teyvat-MSC',
      'Teyvat-MSG',
      'Teyvat-SPV',
      'Teyvat-DWW',
      'Teyvat-STG',
      'Teyvat-DHM',
      'Teyvat-WSI',
      'Teyvat-GLP',
      'Teyvat-LYN',
      'Teyvat-LYH',
      'Teyvat-LSA',
      'Teyvat-CHM',
      'Teyvat-CBC',
      'Teyvat-GHV',
      'Teyvat-SMC',
      'Teyvat-PDD',
      'Teyvat-CVR',
      'Teyvat-ARV',
      'Teyvat-MKD',
      'Teyvat-DOM',
      'Teyvat-WSV',
      'Teyvat-TMM',
      'Teyvat-VKO',
    ],
    'A',
  );
  shortTurnback(line, line.variants[0].stations.slice(0, 16));
}

// L2：全线 + 第 3 站起（遗珑埠 → 望舒客栈）
{
  const line = findLine('L2');
  expectStations(
    line.variants[0].stations,
    [
      'Teyvat-CWT',
      'Teyvat-MMY',
      'Teyvat-YLW',
      'Teyvat-QYV',
      'Teyvat-QCV',
      'Teyvat-DHM',
      'Teyvat-WSI',
    ],
    'L2',
  );
  shortTurnback(line, line.variants[0].stations.slice(2));
}

// 支线：K2-B → K2、K3-B → K3 的「支线」变体
function mergeBranch(parentId, childId) {
  const parent = findLine(parentId);
  const child = findLine(childId);
  if (parent.variants.length !== 1 || child.variants.length !== 1)
    throw new Error(`${parentId}/${childId} 应各只有 1 个变体`);
  addVariant(parent, {
    name: '支线',
    nameEn: 'Branch',
    stations: child.variants[0].stations,
  });
  parent.lineLabels = [...(parent.lineLabels ?? []), ...(child.lineLabels ?? [])];
  teyvat.lines = teyvat.lines.filter((l) => l !== child);
  console.log(
    `合并 ${childId} → ${parentId}（支线），lineLabels = ${JSON.stringify(parent.lineLabels)}`,
  );
}
mergeBranch('K2', 'K2-B');
mergeBranch('K3', 'K3-B');

writeFile('teyvat', teyvat);
for (const name of FILES) if (name !== 'teyvat') writeFile(name, files[name]);

console.log('--- teyvat.json 变体摘要 ---');
for (const line of teyvat.lines) {
  const detail = line.variants
    .map((v) => `${v.name ? v.name : '(无名)'}:${v.stations.length}`)
    .join(' , ');
  if (line.variants.length > 1) console.log(`  ${line.id}  ${line.name}  →  ${detail}`);
}
