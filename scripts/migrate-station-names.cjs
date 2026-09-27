#!/usr/bin/env node
/**
 * 一次性迁移：站点的 nameCn/nameZh/nameEn → names { zhCN, zhTW, ja, en, pronunciationJa? }，
 * 并给 config 补 primaryLang（inazuma = "ja"，其余 = "zhCN"）。
 * 名称来源：.temp/words.json（四语辞书，键 en / ja / zhCN / zhTW + 可选 pronunciationJa）。
 * 运行：node scripts/migrate-station-names.cjs
 *
 * 自动匹配（141 站）：非稻妻要求 norm(zhCN) 与 norm(nameCn)、norm(en) 与 norm(nameEn) 同时相等
 * （唯一差异是 6 个部落名的英文引号）；稻妻要求 ja === nameCn && zhCN === nameZh && en === nameEn。
 * 命中数必须恰为 1；辞书没有直接词条或写法不一致的 39 站写在 OVERRIDES 里。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WORDS = path.join(ROOT, '.temp', 'words.json');
const REGIONS = ['teyvat', 'inazuma', 'liyue', 'snezhnaya'];

/** 比对用归一化：去掉首尾空白与引号/书名号（辞书里部落名带英文双引号，站名不带） */
const norm = (s) => (s ?? '').trim().replace(/^["'「」『』《》\s]+|["'「」『』《》\s]+$/g, '');

const OVERRIDES = {
  // teyvat.json（16）
  'Teyvat-LYS': { zhCN: '璃月港南', zhTW: '璃月港南', ja: '璃月港南', en: 'Liyue Harbor South' }, // liyue-harbor + 南
  'Teyvat-SAA': { zhCN: '风神像', zhTW: '風神像', ja: '風神像', en: 'Statue of Anemo Archon' }, // anemo-archon + 像
  'Teyvat-MSC': { zhCN: '蒙德城', zhTW: '蒙德城', ja: 'モンド城', en: 'Mondstadt City' }, // mondstadt + 城
  'Teyvat-MSG': { zhCN: '蒙德城门', zhTW: '蒙德城門', ja: 'モンド城門', en: 'Mondstadt City Gate' },
  'Teyvat-LYN': { zhCN: '璃月港北', zhTW: '璃月港北', ja: '璃月港北', en: 'Liyue Harbor North' },
  'Teyvat-WSV': {
    zhCN: '折胫谷',
    zhTW: '折脛谷',
    ja: '失脚の谷',
    en: 'Wounded Shin Valley',
    pronunciationJa: 'しっきゃくのたに',
  },
  'Teyvat-DSC': {
    zhCN: '龙脊雪山营地',
    zhTW: '龍脊雪山營地',
    ja: 'ドラゴンスパインのキャンプ',
    en: 'Dragonspine Camp',
  }, // dragonspine
  'Teyvat-MAE': {
    zhCN: '秋分山东',
    zhTW: '秋分山東',
    ja: 'モン・オトンヌキ東',
    en: 'Mont Automnequi East',
  }, // mont-automnequi
  'Teyvat-MCT': { zhCN: '茉洁', zhTW: '茉潔', ja: 'マルコット', en: 'Marcotte' }, // 枫丹地名「茉洁站」，读音取自 marcotte 条目去掉「草」
  'Teyvat-CWF': { zhCN: '楚汶市集', zhTW: '楚汶市集', ja: 'チュエンマーケット', en: 'Chuwen Fair' }, // stadium-of-the-sacred-flame-chuwen-fair 的子地点
  'Teyvat-NWW': {
    zhCN: '巡夜者战争纪念碑',
    zhTW: '巡夜者戰爭紀念碑',
    ja: '夜巡者の戦争記念碑',
    en: 'Night Warden Wars Memorial',
  }, // night-warden-wars + 記念碑
  'Teyvat-EBP': { zhCN: '悠悠港', zhTW: '悠悠港', ja: 'のびのび港', en: 'Easybreeze Port' }, // easybreeze-* → のびのび
  'Teyvat-NSP': { zhCN: '那夏港', zhTW: '那夏港', ja: 'ナシャ港', en: 'Nasha Port' }, // nasha-town → ナシャ
  'Teyvat-KEE': {
    zhCN: '月矩力试验设计局·东',
    zhTW: '月矩力試驗設計局·東',
    ja: 'クーヴァキ実験設計局・東',
    en: 'Kuuvahki Experimental Design Bureau East',
  },
  'Teyvat-KEW': {
    zhCN: '月矩力试验设计局·西',
    zhTW: '月矩力試驗設計局·西',
    ja: 'クーヴァキ実験設計局・西',
    en: 'Kuuvahki Experimental Design Bureau West',
  },
  'Teyvat-VOP': {
    zhCN: '虚海望港',
    zhTW: '虛海望港',
    ja: '海を望めぬ峰の港',
    en: 'Voidsea Outlook Port',
  }, // voidsea-outlook（海を望めぬ峰）+ 港
  // inazuma.json（9）
  'Inazuma-RTP': { zhCN: '离岛港', zhTW: '離島港', ja: '離島港', en: 'Ritou Port' }, // ritou + 港
  'Inazuma-HMZ': { zhCN: '花见坂', zhTW: '花見坂', ja: '花見坂', en: 'Hanamizaka' }, // 辞书无词条，字面沿用站名
  'Inazuma-YGN': { zhCN: '影向山北', zhTW: '影向山北', ja: '影向山北', en: 'Mt. Yougou North' }, // mt-yougou + 北
  // 以辞书为准（zhCN 由「神无塚」改「神无冢」）
  'Inazuma-KNZ': {
    zhCN: '神无冢',
    zhTW: '神無冢',
    ja: '神無塚',
    en: 'Kannazuka',
    pronunciationJa: 'かんなづか',
  },
  // 以辞书为准（矿坑 → 矿洞）
  'Inazuma-JTM': {
    zhCN: '蛇骨矿洞',
    zhTW: '蛇骨礦洞',
    ja: '蛇骨鉱坑',
    en: 'Jakotsu Mine',
    pronunciationJa: 'じゃこつこうこう',
  },
  // 以辞书为准（en 补 Shrine）
  'Inazuma-SGM': {
    zhCN: '珊瑚宫',
    zhTW: '珊瑚宮',
    ja: '珊瑚宮',
    en: 'Sangonomiya Shrine',
    pronunciationJa: 'さんごのみや',
  },
  'Inazuma-WTE': { zhCN: '海祇东', zhTW: '海祇東', ja: '海祇東', en: 'Watatsumi East' }, // watatsumi-island + 東
  // 例外：辞书写「矇云神社」，游戏官方与日文均为「曚」，保留「曚」
  'Inazuma-MUS': {
    zhCN: '曚云神社/曚云港',
    zhTW: '曚雲神社/曚雲港',
    ja: '曚雲神社/曚雲港',
    en: 'Mouun Shrine / Mouun Port',
  },
  'Inazuma-TMP': { zhCN: '鹤观港', zhTW: '鶴觀港', ja: '鶴観港', en: 'Tsurumi Port' }, // tsurumi-island + 港
  // liyue.json（14）
  // 站 → 駅（沿用辞书里「曙光车站 → ザーリャ駅」的口径）
  'Liyue-LYG': { zhCN: '璃月港站', zhTW: '璃月港站', ja: '璃月港駅', en: 'Liyue Harbor Station' },
  'Liyue-HET': { zhCN: '荷塘', zhTW: '荷塘', ja: '荷塘', en: 'Lotus Pond' },
  // en 原为「Feiyun Harbor South Station」，系笔误，随迁移修正
  'Liyue-LYN': {
    zhCN: '璃月港南站',
    zhTW: '璃月港南站',
    ja: '璃月港南駅',
    en: 'Liyue Harbor South Station',
  },
  'Liyue-PSC': { zhCN: '喷水池', zhTW: '噴水池', ja: '噴水池', en: 'The Fountain' },
  // 辞书双写「吃虎岩 / 螭虎岩」，取第一写法
  'Liyue-CHY': {
    zhCN: '吃虎岩',
    zhTW: '吃虎巖',
    ja: 'チ虎岩',
    en: 'Chihu Rock',
    pronunciationJa: 'ちこがん',
  },
  'Liyue-HYG': { zhCN: '货运港', zhTW: '貨運港', ja: '貨物港', en: 'Cargo Port' },
  'Liyue-NCM': { zhCN: '南城门', zhTW: '南城門', ja: '南城門', en: 'South Gate' },
  'Liyue-KYN': { zhCN: '客运港南', zhTW: '客運港南', ja: '旅客港南', en: 'Passenger Port South' },
  'Liyue-KYB': { zhCN: '客运港北', zhTW: '客運港北', ja: '旅客港北', en: 'Passenger Port North' },
  'Liyue-BCM': { zhCN: '北城门', zhTW: '北城門', ja: '北城門', en: 'North Gate' },
  // sea-of-clouds / 雲来釣爺 → 雲来
  'Liyue-YLQ': { zhCN: '云来新区', zhTW: '雲來新區', ja: '雲来新区', en: 'Yunlai New District' },
  'Liyue-LYB': {
    zhCN: '璃月港北站',
    zhTW: '璃月港北站',
    ja: '璃月港北駅',
    en: 'Liyue Harbor North Station',
  },
  'Liyue-YLY': { zhCN: '云来崖', zhTW: '雲來崖', ja: '雲来崖', en: 'Yunlai Cliff' }, // ja 参照「丹砂崖」保留汉字的写法
  'Liyue-GYX': {
    zhCN: '孤云阁西',
    zhTW: '孤雲閣西',
    ja: '孤雲閣西',
    en: 'Guyun Stone Forest West',
  }, // guyun-stone-forest + 西
};

if (!fs.existsSync(WORDS)) throw new Error(`找不到辞书：${WORDS}`);
const words = JSON.parse(fs.readFileSync(WORDS, 'utf8'));

let autoCount = 0;
let overrideCount = 0;
let pronCount = 0;

for (const region of REGIONS) {
  const file = path.join(ROOT, 'src', 'data', `${region}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const prefix = data.config.name; // 'Teyvat' / 'Inazuma' / 'Liyue' / 'Snezhnaya'
  const primaryLang = region === 'inazuma' ? 'ja' : 'zhCN';

  const stations = data.stations.map((st) => {
    const fullId = `${prefix}-${st.id}`;
    if (st.names && !st.nameCn) return st; // 幂等：已迁移过
    let names = OVERRIDES[fullId] ?? null;
    if (names) {
      overrideCount++;
    } else {
      const hits = words.filter((w) =>
        region === 'inazuma'
          ? w.ja === st.nameCn && w.zhCN === st.nameZh && w.en === st.nameEn
          : norm(w.zhCN) === norm(st.nameCn) && norm(w.en) === norm(st.nameEn),
      );
      if (hits.length !== 1)
        throw new Error(`${fullId} 命中 ${hits.length} 条辞书词条，需写进 OVERRIDES`);
      const w = hits[0];
      names = { zhCN: w.zhCN, zhTW: w.zhTW, ja: w.ja, en: w.en };
      if (w.pronunciationJa) names.pronunciationJa = w.pronunciationJa;
      autoCount++;
    }
    for (const key of ['zhCN', 'zhTW', 'ja', 'en']) {
      if (!names[key]) throw new Error(`${fullId} 缺少 names.${key}`);
    }
    if (names.pronunciationJa) pronCount++;
    const { id, nameCn, nameZh, nameEn, ...rest } = st; // rest = { id, x, y, labelDir? }
    return { id, names, ...rest };
  });

  const unknown = Object.keys(OVERRIDES).filter(
    (id) => id.startsWith(`${prefix}-`) && !data.stations.some((st) => `${prefix}-${st.id}` === id),
  );
  if (unknown.length) throw new Error(`${region}.json 里没有这些站点：${unknown.join(', ')}`);

  // config 追加 primaryLang（其余键原样、顺序不变）
  const out = { ...data, config: { ...data.config, primaryLang }, stations };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`${region}: ${stations.length} 站，primaryLang=${primaryLang}`);
}

console.log(
  `自动匹配 ${autoCount} 站 / OVERRIDES ${overrideCount} 站 / 带 pronunciationJa ${pronCount} 站`,
);
