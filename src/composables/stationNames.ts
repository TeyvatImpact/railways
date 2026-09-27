// 站点 / 线路的四语名称：键名与 .temp/words.json 一致（zhCN / zhTW / ja / en）；新增语言 = 加一个键。
// 渲染侧只认 kind（name / zh / en），「要画哪几行、什么顺序」只在 nameLabelLines 里决定。
export type NameLocale = 'zhCN' | 'zhTW' | 'ja' | 'en';

/** 站点名称；线路名（`Line`）用同一形状。pronunciationJa = 日语假名读音（辞书条目带则抄录，可选） */
export interface StationNames {
  zhCN: string;
  zhTW: string;
  ja: string;
  en: string;
  pronunciationJa?: string;
}

/** 运营公司 / 运营主体：与站点、线路同一套键，另可带一种「额外语言」（至冬主体的俄文用 `ru`） */
export interface OrgNames extends StationNames {
  ru?: string;
}

/** 名称标签的一行；kind 决定样式（主行 / 中文小字 / 英文小字） */
export interface NameLabelLine {
  locale: NameLocale;
  kind: 'name' | 'zh' | 'en';
  text: string;
}

/** 标签要渲染的行（顺序即渲染顺序）：主语言行 → 中文行（主语言非中文时）→ 英文行 */
export function nameLabelLines(names: StationNames, primaryLang: NameLocale): NameLabelLine[] {
  const locales: NameLocale[] =
    primaryLang === 'zhCN' ? ['zhCN', 'en'] : [primaryLang, 'zhCN', 'en'];
  return locales.map((locale) => ({
    locale,
    kind: locale === primaryLang ? 'name' : locale === 'en' ? 'en' : 'zh',
    text: names[locale],
  }));
}

/**
 * 「中文 · 英文（· 额外语言）」的一行显示，用于信息面板里的机构名与归属单位名
 * （站点 / 归属单位是 `StationNames`，机构是 `OrgNames` —— 后者可能多一种语言）。
 */
export function bilingualLabel(names: StationNames & { ru?: string }): string {
  return [names.zhCN, names.en, names.ru].filter(Boolean).join(' · ');
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
