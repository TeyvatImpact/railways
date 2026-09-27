#!/usr/bin/env node
/**
 * 一次性迁移：线路名与运营公司/主体的 `name` / `nameZh?` / `nameEn` → `names` 四语对象。
 *
 * - 轨道交通线路：ja / zhTW 取自下面的 LINE_NAMES 表（ja 按 `.temp/words.json` 的同族词条拟定，
 *   跨局线去掉机构前缀；zhTW 逐字繁化），en 沿用原值，个别笔误在表里改。
 * - 轮渡 / 同站换乘线路：名称由端点站（同站换乘取首站）的四语站名派生，故简繁不会再漂移；
 *   派生结果会与原有 zh / en 名逐条比对，不一致即报错。
 * - 运营公司 / 运营主体：ORG_NAMES 按数据里的原 `name` 查表（稻妻的机构名本身就是日文）。
 * - 线路不写 `primaryLang`：运行时继承所属区域 `config.primaryLang`（ferry.json / same.json 无 config → zhCN）。
 *
 * 运行：node scripts/migrate-line-names.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REGION_FILES = ['teyvat', 'inazuma', 'liyue', 'snezhnaya'];

/** 轨道交通线路：`<文件>:<线路 id>` → `{ ja?, zhTW, en? }`（稻妻线路的 ja 取数据里的 name，故不写） */
const LINE_NAMES = {
  // teyvat.json —— ja 去「局」前缀，保留地区/城市前缀；跨局线（A / B）只留线名
  'teyvat:A': { ja: 'げんしょ線', zhTW: '跨局·原初線', en: 'Primordial Line' },
  'teyvat:B': { ja: '風岩草線', zhTW: '跨局·風岩草線' },
  'teyvat:M1': { ja: 'モンド自由線', zhTW: '蒙德局·自由線' },
  'teyvat:L1': { ja: '璃月沈玉線', zhTW: '璃月局·璃沉線', en: 'Liyue Chenyu Line' },
  'teyvat:L2': { ja: '璃月沈玉の谷線', zhTW: '璃月局·沉玉谷線' },
  'teyvat:S1': { ja: 'スメール南北線', zhTW: '須彌局·須彌南北線' },
  'teyvat:S2': { ja: 'スメール環状線', zhTW: '須彌局·須彌環線' },
  'teyvat:F1': { ja: 'フォンテーヌ巡水船カーレス線', zhTW: '楓丹局·巡軌船·卡雷斯線' },
  'teyvat:F2': { ja: 'フォンテーヌ巡水船ナヴィア線', zhTW: '楓丹局·巡軌船·娜維婭線' },
  'teyvat:F3': { ja: 'フォンテーヌ巡水船クレメンタイン線', zhTW: '楓丹局·巡軌船·克萊門汀線' },
  'teyvat:N0': { ja: 'ナタ連絡線', zhTW: '納塔局·連接線' },
  'teyvat:N1': { ja: 'ナタハボリム線', zhTW: '納塔局·赫布里穆線' },
  'teyvat:N2': { ja: 'ナタトゥマイニ線', zhTW: '納塔局·杜麥尼線' },
  'teyvat:N3': { ja: 'ナタカピターノ線', zhTW: '納塔局·卡皮塔諾線' },
  'teyvat:N4': { ja: 'ナタのびのびリゾート線', zhTW: '納塔局·悠悠度假村線' },
  'teyvat:K1': { ja: 'ナド・クライ・ヒーシ島線', zhTW: '挪德卡萊局·希汐島線' },
  'teyvat:K2': { ja: 'ナド・クライ・パハ島線', zhTW: '挪德卡萊局·帕哈島線' },
  'teyvat:K3': { ja: 'ナド・クライ・海を望めぬ峰線', zhTW: '挪德卡莱局·虛海望線' },
  // inazuma.json —— ja 用数据里的 `name`，zhCN 用 `nameZh`
  'inazuma:NK': { zhTW: 'IR 東稻妻·鳴神島線' },
  'inazuma:YG': { zhTW: 'IR 東稻妻·影向山環狀線' },
  'inazuma:NW': { zhTW: 'IR 東稻妻·鳴海線' },
  'inazuma:NS': { zhTW: 'IR 東稻妻·鳴神大社線' },
  'inazuma:YS': { zhTW: 'IR 東稻妻·八醞島線' },
  'inazuma:WT': { zhTW: 'IR 珊瑚宮·海祇島線' },
  'inazuma:TA': { zhTW: 'IR 鶴觀·一號線' },
  'inazuma:TB': { zhTW: 'IR 鶴觀·二號線' },
  // liyue.json
  'liyue:LHM-1': { ja: '璃月港メトロ1号線', zhTW: '璃月港地鐵·1號線', en: 'Liyue Harbor Line 1' },
  'liyue:LHM-2': { ja: '璃月港メトロ2号線', zhTW: '璃月港地鐵·2號線', en: 'Liyue Harbor Line 2' },
  'liyue:LHM-3': { ja: '璃月港メトロ3号線', zhTW: '璃月港地鐵·3號線', en: 'Liyue Harbor Line 3' },
  'liyue:LHM-S1': {
    ja: '璃月港メトロS1号線',
    zhTW: '璃月港地鐵·S1號線',
    en: 'Liyue Harbor Line S1',
  },
  // snezhnaya.json
  'snezhnaya:Trian-1': { ja: 'スネージナヤ列車大環状線', zhTW: '至冬列車大環線' },
  'snezhnaya:Trian-2': { ja: 'スネージナヤ列車小環状線', zhTW: '至冬列車小環線' },
  'snezhnaya:Trian-3': { ja: 'スネージナヤ列車焔翼の谷線', zhTW: '至冬列車焰羽谷線' },
  'snezhnaya:Trian-4': { ja: 'スネージナヤ列車ペールクラウンパレス線', zhTW: '至冬列車白冕宮線' },
  'snezhnaya:Trian-5': {
    ja: 'スネージナヤ列車・ナド・クライ連絡線',
    zhTW: '至冬列車·挪德卡萊連接線',
  },
};

/** 运营公司 / 运营主体：键 = 数据里的原 `name`（稻妻的机构名是日文原文） */
const ORG_NAMES = {
  // 运营公司
  提瓦特铁路: {
    zhCN: '提瓦特铁路',
    zhTW: '提瓦特鐵路',
    ja: 'テイワット鉄道',
    en: 'Teyvat Railway',
  },
  枫丹巡轨船: {
    zhCN: '枫丹巡轨船',
    zhTW: '楓丹巡軌船',
    ja: 'フォンテーヌ巡水船',
    en: 'Fontaine Aquabus',
  },
  悠悠度假村轨道交通: {
    zhCN: '悠悠度假村轨道交通',
    zhTW: '悠悠度假村軌道交通',
    ja: 'のびのびリゾート軌道交通',
    en: 'Easybreeze Holiday Resort Transit',
  },
  稲妻旅客鉄道株式会社: {
    zhCN: '稻妻旅客铁道株式会社',
    zhTW: '稻妻旅客鐵道株式會社',
    ja: '稲妻旅客鉄道株式会社',
    en: 'Inazuma Railways',
  },
  璃月港地铁: {
    zhCN: '璃月港地铁',
    zhTW: '璃月港地鐵',
    ja: '璃月港メトロ',
    en: 'Liyue Harbor Metro',
  },
  至冬皇家铁路: {
    zhCN: '至冬皇家铁路',
    zhTW: '至冬皇家鐵路',
    ja: 'スネージナヤ皇立鉄道',
    en: 'Snezhnaya Royal Railway',
  },
  // 运营主体
  跨局: { zhCN: '跨局', zhTW: '跨局', ja: 'クロスビューロー', en: 'Cross-Bureau' },
  蒙德局: { zhCN: '蒙德局', zhTW: '蒙德局', ja: 'モンド局', en: 'Mondstadt Bureau' },
  璃月局: { zhCN: '璃月局', zhTW: '璃月局', ja: '璃月局', en: 'Liyue Bureau' },
  须弥局: { zhCN: '须弥局', zhTW: '須彌局', ja: 'スメール局', en: 'Sumeru Bureau' },
  纳塔局: { zhCN: '纳塔局', zhTW: '納塔局', ja: 'ナタ局', en: 'Natlan Bureau' },
  挪德卡莱局: {
    zhCN: '挪德卡莱局',
    zhTW: '挪德卡萊局',
    ja: 'ナド・クライ局',
    en: 'Nod-Krai Bureau',
  },
  // 辞书作「枫丹廷」（フォンテーヌ廷 / Court of Fontaine），原数据「枫丹庭」是笔误
  枫丹庭: { zhCN: '枫丹廷', zhTW: '楓丹廷', ja: 'フォンテーヌ廷', en: 'Court of Fontaine' },
  悠悠度假村管理委员会: {
    zhCN: '悠悠度假村管理委员会',
    zhTW: '悠悠度假村管理委員會',
    ja: 'のびのびリゾート管理委員会',
    en: 'Easybreeze Holiday Resort Management Committee',
  },
  稲妻幕府: { zhCN: '稻妻幕府', zhTW: '稻妻幕府', ja: '稲妻幕府', en: 'Inazuma Shogunate' },
  稲妻国海祇島珊瑚宮自治政府: {
    zhCN: '稻妻国海祇岛珊瑚宫自治政府',
    zhTW: '稻妻國海祇島珊瑚宮自治政府',
    ja: '稲妻国海祇島珊瑚宮自治政府',
    en: 'Watatsumi Sangonomiya Autonomous Government',
  },
  璃月总务司: {
    zhCN: '璃月总务司',
    zhTW: '璃月總務司',
    ja: '璃月総務司',
    en: 'Liyue Ministry of Civil Affairs',
  },
  至冬皇家轨道运输局: {
    zhCN: '至冬皇家轨道运输局',
    zhTW: '至冬皇家軌道運輸局',
    ja: 'スネージナヤ皇立軌道運輸局',
    en: 'Snezhnaya Royal Railway Transport Bureau',
    ru: 'Королевское управление железнодорожного транспорта Снежной',
  },
};

/** 轮渡 / 同站换乘：名称由站名派生（两端站 / 首站），顺带消掉原数据里的简繁漂移 */
const DERIVED = {
  ferry: {
    zhCN: (a, b) => `${a}↔${b} 轮渡`,
    zhTW: (a, b) => `${a}↔${b} 渡輪`,
    ja: (a, b) => `${a}↔${b} 渡輪`,
    en: (a, b) => `${a} ↔ ${b} Ferry`,
  },
  'same-station': {
    zhCN: (a) => `${a}同站换乘`,
    zhTW: (a) => `${a}同站轉乘`,
    ja: (a) => `${a}同駅乗り換え`,
    en: (a) => `${a} Same-Station`,
  },
};

const LOCALES = ['zhCN', 'zhTW', 'ja', 'en'];
/** 组合线路名用的「朴素」站名：去掉辞书里的引号（「花羽会」/ "Flower-Feather Clan"），多写法只取第一个（曚云神社/曚云港 → 曚云神社） */
const plain = (s) =>
  String(s)
    .split('/')[0]
    .trim()
    .replace(/^["'「『]+|["'」』]+$/g, '');
/**
 * 派生名与原 zh / en 名的已知差异 —— 原数据里的笔误，派生值以站名为准
 * （`inazuma:ferry-hgv-wte` 原写 `Higii Village`，站名是 `Higi Village`；
 *  `inazuma:ferry-*` 的 zh 原作「渡轮」，其余 10 条作「轮渡」，统一取「轮渡」；
 *  `ferry:ferry-*-mus` 原把「曚云神社」的中文写成繁体「曚雲神社」）
 */
const NAME_FIXES = {
  // 下面 4 条的 zhCN = 派生值（简体「曚云神社」+「轮渡」），原数据写法有误，故显式列出以便比对
  'inazuma:ferry-hgv-wte': {
    en: 'Higi Village ↔ Watatsumi East Ferry',
    zhCN: '绯木村↔海祇东 轮渡',
  },
  'inazuma:ferry-izc-tmp': { zhCN: '稻妻城↔鹤观港 轮渡' },
  'ferry:ferry-kyn-mus': { zhCN: '客运港南↔曚云神社 轮渡' },
  'ferry:ferry-pom-mus': { zhCN: '奥摩斯港↔曚云神社 轮渡' },
};

const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', file), 'utf8'));
const writeJson = (file, data) =>
  fs.writeFileSync(
    path.join(ROOT, 'src', 'data', file),
    JSON.stringify(data, null, 2) + '\n',
    'utf8',
  );

// 全站点的四语站名（key = 完整 id），用于派生轮渡 / 同站换乘的线路名
const stationNames = new Map();
for (const region of REGION_FILES) {
  const data = readJson(`${region}.json`);
  for (const st of data.stations) stationNames.set(`${data.config.name}-${st.id}`, st.names);
}
const stationNamesOf = (id) => {
  const names = stationNames.get(id);
  if (!names) throw new Error(`找不到站点 ${id}（派生线路名用）`);
  return names;
};

/** 轮渡 / 同站换乘线路：从端点站派生，并与原 zh / en 名核对 */
function deriveNames(line, file, prefix, expectEn) {
  const ids = (line.variants?.[0]?.stations ?? []).map((id) =>
    id.includes('-') ? id : `${prefix}-${id}`,
  );
  const tpl = DERIVED[line.lineType];
  const table = LINE_NAMES[`${file}:${line.id}`];
  if (table) throw new Error(`${file}:${line.id} 是派生名线路，不该出现在 LINE_NAMES 里`);
  if (line.lineType === 'ferry') {
    if (ids.length !== 2) throw new Error(`${file}:${line.id} 轮渡应恰好 2 站，实际 ${ids.length}`);
    const [na, nb] = [stationNamesOf(ids[0]), stationNamesOf(ids[1])];
    // 名字的书写顺序可能与 stations 数组相反，用 en 名定序
    const [pa, pb] = [LOCALES.map((l) => plain(na[l])), LOCALES.map((l) => plain(nb[l]))];
    const wrap = (vals) => LOCALES.reduce((acc, l, i) => ((acc[l] = vals[i]), acc), {});
    const A = wrap(pa);
    const B = wrap(pb);
    const enFwd = tpl.en(A.en, B.en);
    const [a, b] = enFwd === expectEn ? [A, B] : [B, A];
    if (tpl.en(a.en, b.en) !== expectEn)
      throw new Error(`${file}:${line.id} 的站点与 nameEn 对不上：${expectEn}`);
    return LOCALES.reduce((acc, l) => ((acc[l] = tpl[l](a[l], b[l])), acc), {});
  }
  // 同站换乘：名称取首站
  const a = LOCALES.reduce((acc, l) => ((acc[l] = plain(stationNamesOf(ids[0])[l])), acc), {});
  return LOCALES.reduce((acc, l) => ((acc[l] = tpl[l](a[l])), acc), {});
}

let lineCount = 0;
let derivedCount = 0;
const usedLineKeys = new Set();
const usedOrgKeys = new Set();
/** zhCN 名 → ORG_NAMES 的键（重跑时用已迁移的机构反查，免得误报「没用上」） */
const ORG_BY_ZH = new Map(Object.entries(ORG_NAMES).map(([key, names]) => [names.zhCN, key]));

/** 运营公司 / 运营主体 → `{ names }`（键里没有的机构名直接报错，避免漏译） */
const migrateOrg = (org, where) => {
  if (!org) return undefined;
  if (org.names) {
    // 幂等：已经迁移过，反查一下表键
    const key = ORG_BY_ZH.get(org.names.zhCN);
    if (key) usedOrgKeys.add(key);
    return org;
  }
  const names = ORG_NAMES[org.name];
  if (!names) throw new Error(`${where} 的机构「${org.name}」不在 ORG_NAMES 里`);
  usedOrgKeys.add(org.name);
  for (const l of LOCALES) if (!names[l]) throw new Error(`机构「${org.name}」缺 ${l}`);
  return { names };
};

for (const file of [...REGION_FILES, 'ferry', 'same']) {
  const data = readJson(`${file}.json`);
  const primaryLang = data.config?.primaryLang ?? 'zhCN';
  const prefix = data.config?.name ?? '';
  const isJa = primaryLang === 'ja';

  if (data.config?.operator)
    data.config.operator = migrateOrg(data.config.operator, `${file}.config`);
  if (data.config?.authority)
    data.config.authority = migrateOrg(data.config.authority, `${file}.config`);

  data.lines = data.lines.map((line) => {
    const where = `${file}:${line.id}`;
    if (line.operator) line.operator = migrateOrg(line.operator, where);
    if (line.authority) line.authority = migrateOrg(line.authority, where);
    if (line.names && !line.name) {
      // 幂等：已经迁移过；表键照记，免得重跑时误报「没用上」
      usedLineKeys.add(`${file}:${line.id}`);
      return line;
    }

    let names;
    if (line.lineType) {
      names = deriveNames(line, file, prefix, NAME_FIXES[`${file}:${line.id}`]?.en ?? line.nameEn);
      derivedCount++;
      // 与原 zh / en 名核对（已知笔误见 NAME_FIXES）
      const fix = NAME_FIXES[`${file}:${line.id}`] ?? {};
      const zh = line.nameZh ?? line.name;
      if (names.zhCN !== (fix.zhCN ?? zh))
        throw new Error(`${where} 派生的中文名（${names.zhCN}）与原值（${zh}）不一致`);
      if (names.en !== (fix.en ?? line.nameEn))
        throw new Error(`${where} 派生的英文名（${names.en}）与原值（${line.nameEn}）不一致`);
      if (line.nameZh && line.name !== names.ja)
        throw new Error(`${where} 数据里的 name（${line.name}）与派生的日文名不一致`);
    } else {
      const key = `${file}:${line.id}`;
      const table = LINE_NAMES[key];
      if (!table) throw new Error(`${where} 不在 LINE_NAMES 里`);
      usedLineKeys.add(key);
      names = isJa
        ? { zhCN: line.nameZh, zhTW: table.zhTW, ja: line.name, en: table.en ?? line.nameEn }
        : { zhCN: line.name, zhTW: table.zhTW, ja: table.ja, en: table.en ?? line.nameEn };
      if (isJa && !line.nameZh) throw new Error(`${where} 是主语言为日文的线路，但缺 nameZh`);
    }
    for (const l of LOCALES) if (!names[l]) throw new Error(`${where} 缺 names.${l}`);
    lineCount++;
    const { id, name, nameZh, nameEn, ...rest } = line;
    return { id, names, ...rest };
  });

  writeJson(`${file}.json`, data);
  console.log(`${file}: ${data.lines.length} 条线路`);
}

// 表里没用到的键 = 打错 id / 已删除的线路，直接报错
const staleLineKeys = Object.keys(LINE_NAMES).filter((k) => !usedLineKeys.has(k));
if (staleLineKeys.length) throw new Error(`LINE_NAMES 里这些键没用上：${staleLineKeys.join(', ')}`);
const staleOrgKeys = Object.keys(ORG_NAMES).filter((k) => !usedOrgKeys.has(k));
if (staleOrgKeys.length) throw new Error(`ORG_NAMES 里这些键没用上：${staleOrgKeys.join(', ')}`);

console.log(
  `线路 ${lineCount} 条（其中轮渡 / 同站换乘派生 ${derivedCount} 条）/ 机构 ${usedOrgKeys.size} 个`,
);
