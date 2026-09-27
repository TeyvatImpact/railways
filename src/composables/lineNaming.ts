// 轮渡 / 同站换乘这类「虚拟线路」的线路名不写进数据，而是运行时用端点站的四语站名拼出，
// 这样数据里不会各写一份简繁、也不会随站点改名而漂移。模板只此一处。
import type { NameLocale, StationNames } from './stationNames';

/**
 * 组合线路名用的「朴素」站名：多写法只取第一种（`曚云神社/曚云港` → `曚云神社`），
 * 去掉辞书里的引号（`「花羽会」` → `花羽会`，英文同理）。
 */
export function plainStationName(name: string): string {
  return name
    .split('/')[0]
    .trim()
    .replace(/^["'「『]+|["'」』]+$/g, '');
}

type FerryNameTemplate = Record<NameLocale, (a: string, b: string) => string>;
type SameStationNameTemplate = Record<NameLocale, (a: string) => string>;

/**
 * 轮渡名有两个模板：
 * - `orderless`（双向箭头）：没有固定顺序的场景 —— 线路自身的名字，两端站按数据里 `variants[].stations` 的顺序排列；
 * - `ordered`（单向箭头）：有固定顺序的场景 —— 按行程方向排列，用在路径规划展示线路名的地方。
 */
export const FERRY_NAME_TEMPLATES: { orderless: FerryNameTemplate; ordered: FerryNameTemplate } = {
  orderless: {
    zhCN: (a, b) => `${a}↔${b} 轮渡`,
    zhTW: (a, b) => `${a}↔${b} 渡輪`,
    ja: (a, b) => `${a}↔${b} 渡輪`,
    en: (a, b) => `${a} ↔ ${b} Ferry`,
  },
  ordered: {
    zhCN: (a, b) => `${a}→${b} 轮渡`,
    zhTW: (a, b) => `${a}→${b} 渡輪`,
    ja: (a, b) => `${a}→${b} 渡輪`,
    en: (a, b) => `${a} → ${b} Ferry`,
  },
};

/** 同站换乘的线路名：普通模板，只取首站 */
export const SAME_STATION_NAME_TEMPLATES: SameStationNameTemplate = {
  zhCN: (a) => `${a}同站换乘`,
  zhTW: (a) => `${a}同站轉乘`,
  ja: (a) => `${a}同駅乗り換え`,
  en: (a) => `${a} Same-Station`,
};

function applyFerry(template: FerryNameTemplate, a: StationNames, b: StationNames): StationNames {
  return {
    zhCN: template.zhCN(plainStationName(a.zhCN), plainStationName(b.zhCN)),
    zhTW: template.zhTW(plainStationName(a.zhTW), plainStationName(b.zhTW)),
    ja: template.ja(plainStationName(a.ja), plainStationName(b.ja)),
    en: template.en(plainStationName(a.en), plainStationName(b.en)),
  };
}

/** 轮渡线路名（无固定顺序）：两端站按数据里的 `stations` 顺序排列 */
export function ferryLineNames(a: StationNames, b: StationNames): StationNames {
  return applyFerry(FERRY_NAME_TEMPLATES.orderless, a, b);
}

/** 轮渡乘车段名（有固定顺序）：按行程方向排列，先乘的站在前 */
export function ferrySegmentNames(from: StationNames, to: StationNames): StationNames {
  return applyFerry(FERRY_NAME_TEMPLATES.ordered, from, to);
}

/** 同站换乘线路名：只取首站 */
export function sameStationLineNames(a: StationNames): StationNames {
  const template = SAME_STATION_NAME_TEMPLATES;
  return {
    zhCN: template.zhCN(plainStationName(a.zhCN)),
    zhTW: template.zhTW(plainStationName(a.zhTW)),
    ja: template.ja(plainStationName(a.ja)),
    en: template.en(plainStationName(a.en)),
  };
}
