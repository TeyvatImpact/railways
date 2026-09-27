// 名称与语言：核心四语（zhCN / zhTW / ja / en，键名与 .temp/words.json 一致）+ 可选的额外语言
// （`ru` / `fr` / `de` / `sw` / `sa` / `ar`，按地区挂在机构、归属与标注上）。
// 「要画哪几行、什么顺序」只在 `nameLabelLines`（站点 / 线路标签）与 `displayNameLines`（机构 / 归属 / 标注）里决定。
/** 核心四语：站点 / 线路名（`StationNames`）只有这四种 */
export const CORE_LOCALES = ['zhCN', 'zhTW', 'ja', 'en'] as const;
export type CoreLocale = (typeof CORE_LOCALES)[number];

/** 额外语言（核心四语之外，按此顺序排在后面显示） */
export const EXTRA_LOCALES = ['ru', 'fr', 'de', 'sw', 'sa', 'ar'] as const;
export type ExtraLocale = (typeof EXTRA_LOCALES)[number];

export type NameLocale = CoreLocale | ExtraLocale;

/** 核心四语 —— 站点 / 线路必写 */
export interface StationNames {
  zhCN: string;
  zhTW: string;
  ja: string;
  en: string;
  pronunciationJa?: string;
}

/** 核心四语 + 可选额外语言：机构（operators / authority）、归属单位、手绘标注共用 */
export interface Names extends StationNames {
  /** 俄语（至冬、须弥、挪德卡莱） */
  ru?: string;
  /** 法语（枫丹） */
  fr?: string;
  /** 德语（蒙德） */
  de?: string;
  /** 斯瓦希里语（纳塔） */
  sw?: string;
  /** 梵文（须弥） */
  sa?: string;
  /** 阿拉伯文（须弥沙漠区域） */
  ar?: string;
}

/** 名称标签的一行；kind 决定样式（主行 / 中文小字 / 英文小字） */
export interface NameLabelLine {
  locale: NameLocale;
  kind: 'name' | 'zh' | 'en';
  text: string;
}

/** 标签要渲染的行（顺序即渲染顺序）：主语言行 → 中文行（主语言非中文时）→ 英文行 */
export function nameLabelLines(names: StationNames, primaryLang: CoreLocale): NameLabelLine[] {
  const locales: CoreLocale[] =
    primaryLang === 'zhCN' ? ['zhCN', 'en'] : [primaryLang, 'zhCN', 'en'];
  return locales.map((locale) => ({
    locale,
    kind: locale === primaryLang ? 'name' : locale === 'en' ? 'en' : 'zh',
    text: names[locale] ?? '',
  }));
}

/** 一行展示用文字（`displayNameLines` 的元素） */
export interface NameTextLine {
  locale: NameLocale;
  text: string;
}

/**
 * 标签 / 机构 / 归属名要展示的各语言文字，顺序 = **地区优先语言**（区域优先语言 → 国家优先语言，由数据给出）
 * → 简中 → 英文。三条规则：
 * - 繁体只有作为地区优先语言才会展示（当前没有地区这么做），默认不展示；
 * - 没有值的语言不显示；
 * - **要展示的一种语言已经展示过、或与已经展示的文字完全相同也不显示**（`Natlan` 的 `sw` 与 `en` 同形、
 *   `Fontaine` 的 `fr` 与 `en` 同形）。
 *
 * 返回值顺序即渲染顺序：**第一个是「文本」，其余是「翻译」**（字号档位见 `MarkerTextRole`）。
 */
export function displayNameLines(names: Names, langs: NameLocale[] = []): NameTextLine[] {
  const order: NameLocale[] = [...langs, 'zhCN', 'en'];
  const seenLocale = new Set<NameLocale>();
  const seenText = new Set<string>();
  const lines: NameTextLine[] = [];
  for (const locale of order) {
    if (seenLocale.has(locale)) continue;
    seenLocale.add(locale);
    const text = names[locale];
    if (!text || seenText.has(text)) continue;
    seenText.add(text);
    lines.push({ locale, text });
  }
  return lines;
}

/** 「机构 / 归属 / 标注名」的一行显示：要展示的各语言用 ` · ` 连起来（顺序与去重见 `displayNameLines`） */
export function displayLabel(names: Names, langs: NameLocale[] = []): string {
  return displayNameLines(names, langs)
    .map((line) => line.text)
    .join(' · ');
}

/** 信息面板里的四语名称行（只列有值的）：标签 + 值，日语行带上假名读音 */
export function nameRows(
  names: StationNames,
): { label: string; value: string; pronunciation?: string }[] {
  const rows: { label: string; value: string; pronunciation?: string }[] = [
    { label: '中文', value: names.zhCN },
    { label: '繁體', value: names.zhTW },
    { label: '日本語', value: names.ja, pronunciation: names.pronunciationJa },
    { label: 'English', value: names.en },
  ];
  return rows.filter((r) => r.value);
}
