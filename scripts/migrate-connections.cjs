// 一次性迁移：把散落在 6 个数据文件的 stationDistances 与线路元组里的途经点
// 合并成全局 src/data/connections.json，并把线路 stations 改成裸站点 id 数组。
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const CONNECTIONS_PATH = path.join(DATA_DIR, 'connections.json');
const REGIONS = {
  'teyvat.json': 'Teyvat',
  'inazuma.json': 'Inazuma',
  'liyue.json': 'Liyue',
  'snezhnaya.json': 'Snezhnaya',
};
const FILES = [...Object.keys(REGIONS), 'ferry.json', 'same.json'];

const read = (file) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
const rid = (file, id) => (id.includes('-') ? id : `${REGIONS[file]}-${id}`);
const keyOf = (a, b) => [a, b].sort().join(' ~ ');

// 全局站点坐标（数据单位）：区域文件加 config 偏移；ferry/same 的 id 已带前缀，原样使用
const pos = new Map();
for (const [file, prefix] of Object.entries(REGIONS)) {
  const data = read(file);
  for (const s of data.stations)
    pos.set(`${prefix}-${s.id}`, [s.x + data.config.x, s.y + data.config.y]);
}

const filesData = new Map(FILES.map((file) => [file, read(file)]));

// 幂等守卫：所有线路的 stations 都已是字符串 → 元组数据已丢，无法重新推导
const alreadyMigrated = [...filesData.values()].every((data) =>
  data.lines.every((line) => line.stations.every((s) => typeof s === 'string')),
);
if (alreadyMigrated) {
  console.log('already migrated, nothing to do');
  process.exit(0);
}

const geo = new Map(); // key -> { from, to, waypoints }，规范方向（from < to）
const skippedPairs = new Set();
const perFile = [];

for (const file of FILES) {
  const data = filesData.get(file);
  let tupleCount = 0;
  let pairCount = 0;
  const filePairKeys = new Set();

  for (const line of data.lines) {
    const ids = line.stations.map((tuple) => {
      tupleCount++;
      return rid(file, tuple[0]);
    });
    for (let i = 0; i < ids.length - 1; i++) {
      const a = ids[i];
      const b = ids[i + 1];
      const wp = line.stations[i][1] ?? [];
      const aPos = pos.get(a);
      const bPos = pos.get(b);
      if (!aPos || !bPos) {
        skippedPairs.add(`${a} ~ ${b} (unknown station, line ${line.id})`);
        continue;
      }

      // 绝对顶点序列（数据单位），按线路行进方向
      const verts = [aPos];
      for (const [dx, dy] of wp) {
        const prev = verts[verts.length - 1];
        verts.push([prev[0] + dx, prev[1] + dy]);
      }
      verts.push(bPos);
      // 规范方向：from < to
      const canonical = a < b ? verts : [...verts].reverse();
      const waypoints = [];
      for (let k = 1; k < canonical.length - 1; k++) {
        waypoints.push([
          canonical[k][0] - canonical[k - 1][0],
          canonical[k][1] - canonical[k - 1][1],
        ]);
      }

      const key = keyOf(a, b);
      const [from, to] = a < b ? [a, b] : [b, a];
      const existing = geo.get(key);
      if (existing) {
        if (JSON.stringify(existing.waypoints) !== JSON.stringify(waypoints)) {
          throw new Error(
            `geometry conflict: ${key}\n  ${JSON.stringify(existing.waypoints)}\n  ${JSON.stringify(waypoints)}`,
          );
        }
      } else {
        geo.set(key, { from, to, waypoints });
      }
      filePairKeys.add(key);
    }
  }

  pairCount = filePairKeys.size;
  perFile.push({ file, tupleCount, pairCount });
}

// 距离
const dist = new Map();
for (const file of FILES) {
  const data = filesData.get(file);
  for (const entry of data.stationDistances ?? []) {
    const key = keyOf(rid(file, entry.from), rid(file, entry.to));
    if (dist.has(key)) throw new Error(`duplicate distance entry: ${key}`);
    dist.set(key, entry.distance);
  }
}
for (const key of dist.keys()) {
  if (!geo.has(key)) throw new Error(`orphan distance (no line uses this pair): ${key}`);
}

// 组装条目
const entries = [];
const withoutDistance = [];
for (const [key, { from, to, waypoints }] of geo) {
  const hasDistance = dist.has(key);
  const hasWaypoints = waypoints.length > 0;
  if (!hasDistance && !hasWaypoints) {
    skippedPairs.add(`${from} ~ ${to} (default distance + straight)`);
    continue;
  }
  const entry = { from, to };
  if (hasDistance) entry.distance = dist.get(key);
  else withoutDistance.push(`${from} ~ ${to}`);
  if (hasWaypoints) entry.waypoints = waypoints;
  entries.push(entry);
}
entries.sort((x, y) => (x.from + '|' + x.to < y.from + '|' + y.to ? -1 : 1));

fs.writeFileSync(
  CONNECTIONS_PATH,
  JSON.stringify({ connections: entries }, null, 2) + '\n',
  'utf-8',
);

// 改写数据文件
for (const file of FILES) {
  const data = filesData.get(file);
  for (const line of data.lines) line.stations = line.stations.map((tuple) => rid(file, tuple[0]));
  delete data.stationDistances;
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

console.log('--- per file ---');
for (const { file, tupleCount, pairCount } of perFile) {
  console.log(
    `${file.padEnd(14)} stationIds ${String(tupleCount).padStart(3)}  uniquePairs ${String(pairCount).padStart(3)}`,
  );
}
console.log('--- connections.json ---');
console.log('entries          ', entries.length);
console.log('with distance    ', entries.filter((e) => e.distance !== undefined).length);
console.log('with waypoints   ', entries.filter((e) => e.waypoints?.length).length);
console.log('skipped pairs    ', [...skippedPairs].length);
console.log('--- entries without distance (runtime default 10km) ---');
for (const pair of withoutDistance) console.log('  ' + pair);
console.log('--- skipped pairs (no entry written) ---');
for (const pair of skippedPairs) console.log('  ' + pair);
