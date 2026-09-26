const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const REGIONS = {
  'teyvat.json': 'Teyvat',
  'inazuma.json': 'Inazuma',
  'liyue.json': 'Liyue',
  'snezhnaya.json': 'Snezhnaya',
};
const FILES = [...Object.keys(REGIONS), 'ferry.json', 'same.json'];

// 全局站点坐标（数据单位）：区域文件加 config 偏移；ferry/same 的 id 已带前缀，原样使用
const pos = new Map();
for (const [file, prefix] of Object.entries(REGIONS)) {
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
  for (const s of data.stations)
    pos.set(`${prefix}-${s.id}`, [s.x + data.config.x, s.y + data.config.y]);
}

for (const file of FILES) {
  const filePath = path.join(DATA_DIR, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (data.lines.some((l) => l.stations.some((t) => Array.isArray(t[1])))) {
    console.log(`${file}: already migrated, skipped`);
    continue;
  }
  const prefix = REGIONS[file];
  for (const line of data.lines) {
    const rid = (id) => (id.includes('-') ? id : `${prefix}-${id}`);
    line.stations = line.stations.map((tuple, i, all) => {
      const [id, diagFirst] = tuple;
      const next = all[i + 1];
      if (!next) return [id]; // 末位元组不对应任何区间
      const a = pos.get(rid(id));
      const b = pos.get(rid(next[0]));
      if (!a || !b) return [id];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      if (line.lineType || dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) return [id];
      // 复刻 useMapData 原折点公式（数据单位），转成链式增量：折点相对起点站
      const waypoint = diagFirst
        ? Math.abs(dx) > Math.abs(dy)
          ? [Math.sign(dx) * Math.abs(dy), dy]
          : [dx, Math.sign(dy) * Math.abs(dx)]
        : Math.abs(dx) > Math.abs(dy)
          ? [dx - Math.sign(dx) * Math.abs(dy), 0]
          : [0, dy - Math.sign(dy) * Math.abs(dx)];
      return [id, [waypoint]];
    });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`Updated ${file}`);
}
console.log('Done.');
