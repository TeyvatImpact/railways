// /display 语音播报的纯逻辑：把「配音模板（原子句 + 组合表 + 条件槽 + 站点文本池）+ 事件上下文」
// 翻译成按顺序念的句子列表。不碰 DOM、不碰引擎 —— 与 dynamicStrip.ts 同一风格（纯函数，可被 node 直接跑）。
//
// 模板数据化：一个模板 = 一个 JSON 文件（`src/data/voice/*.json`），命名空间 = 文件名（stem），模板 id 也是它；
// `extends` 引用另一个模板。文件内可自定义原子句 key、组合序列按数组顺序、条件槽（`when`）与站点文本池
// （`{ source: 'stationText' }`）表达「自定义逻辑」。装配见 voiceTemplates.ts。
import {
  DEFAULT_VOICE_TEMPLATE,
  type AnnounceKind,
  type AnnounceLang,
} from '../../config/announce.config';
import type { NameLocale, StationNames } from '../../composables/stationNames';

export interface Announcement {
  lang: AnnounceLang;
  text: string;
}

const KINDS: AnnounceKind[] = ['on', 'direction', 'variant', 'station', 'enter', 'leave'];

/** 模板设置里必须齐全的字段 */
const SETTINGS_KEYS = [
  'transferLimit',
  'transferJoin',
  'transferOverflow',
  'fullServiceName',
  'fallbackBranchName',
  'variantNames',
] as const;

/** 内置谓词（可加 `!` 取反） */
export type VoiceCondition =
  | 'atTerminus'
  | 'hasTransfers'
  | 'hasNext'
  | 'nextIsJunction'
  | 'branchTrain';

const CONDITIONS = new Set<string>([
  'atTerminus',
  'hasTransfers',
  'hasNext',
  'nextIsJunction',
  'branchTrain',
]);

/** 原子句文本里允许出现的占位符 */
const PLACEHOLDERS = new Set([
  'line',
  'terminus',
  'station',
  'next',
  'variant',
  'transfers',
  'branch',
  'n',
]);

/** 一份文本的各语言版本（zh / ja / en） */
export type VoiceTexts = Partial<Record<AnnounceLang, string>>;

/** 组合表的一项：字符串 = 原子句 key；对象带 when 条件；source = 站点文本池 */
export type ComposeEntry =
  | string
  | { key: string; when?: string[] }
  | { source: 'stationText'; when?: string[] };

/** 模板设置：换乘列举规则、`{n}` / 变体名 / 支线名；`variantNames` 的键 = 数据里的变体中文名 */
export interface VoiceSettings {
  transferLimit: number;
  transferJoin: Record<AnnounceLang, string>;
  transferOverflow: Record<AnnounceLang, string>;
  fullServiceName: Record<AnnounceLang, string>;
  fallbackBranchName: Record<AnnounceLang, string>;
  variantNames: Record<string, Partial<Record<AnnounceLang, string>>>;
}

export interface VoiceStationText {
  announcer?: string;
  text: VoiceTexts;
}

export interface VoiceStationPool {
  id: string;
  announceName?: string;
  texts: VoiceStationText[];
}

/** 一个 JSON 文件的原样数据 */
export interface VoiceTemplateData {
  extends?: string;
  kinds?: AnnounceKind[];
  extraLanguages?: AnnounceLang[];
  atoms?: Record<string, VoiceTexts>;
  composition?: Partial<Record<AnnounceKind, ComposeEntry[]>>;
  settings?: Partial<VoiceSettings>;
  stations?: VoiceStationPool[];
}

/** 解析后的模板（id = 文件名 = 命名空间） */
export interface VoiceTemplate {
  id: string;
  kinds: AnnounceKind[];
  extraLanguages: AnnounceLang[];
  /** 键 = `<命名空间>.<key>`，含继承链上的全部原子句 */
  atoms: Record<string, VoiceTexts>;
  composition: Record<AnnounceKind, ComposeEntry[]>;
  settings: VoiceSettings;
  stations: VoiceStationPool[];
  /** 命名空间链（叶 → 根），用于解析未限定的原子句 key */
  namespaces: string[];
}

/** 站点名：四语齐全 + 主语言（按播报语言取 names） */
export interface StationText {
  id: string;
  names: StationNames;
  primaryLang: NameLocale;
}

export interface AnnounceContext {
  kind: AnnounceKind;
  /** 线路：线路级事件的语言看它；`voice` = 该线路选用的模板 id */
  line: { names: StationNames; primaryLang: NameLocale; voice: string };
  /** 当前变体（`{ name: '', nameEn: '' }` = 全线交路） */
  variant: { name: string; nameEn: string };
  terminus: StationText | null;
  /** station = 到达站；enter = 出发站；leave = 出发站 */
  station: StationText | null;
  next: StationText | null;
  /** station 用本站、enter / leave 用下一站的换乘线路（已排除本线；空 = 不播换乘句） */
  transfers: { names: StationNames }[];
  /** 下一站是分岔站时，从该站分出的支线（空 = 不是分岔站） */
  branches: { name: string; nameEn: string }[];
  /** 本趟行程是否走在支线上（决定 branchHint 用哪句） */
  branchTrain: boolean;
}

/** 线名简称：取最后一个 `·` 之后的一段（与换乘徽章同款），没有 `·` 就整名 */
export function shortLineName(name: string): string {
  return name.split('·').pop() || name;
}

// ================= 注册表 =================

function placeholdersIn(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

function resolveAtomKey(tpl: VoiceTemplate, name: string): string | undefined {
  if (tpl.atoms[name]) return name;
  for (const ns of tpl.namespaces) {
    const key = `${ns}.${name}`;
    if (tpl.atoms[key]) return key;
  }
  return undefined;
}

function validateTemplate(tpl: VoiceTemplate): void {
  for (const kind of tpl.kinds) {
    if (!KINDS.includes(kind)) throw new Error(`配音模板 ${tpl.id} 的 kinds 含非档位名：${kind}`);
  }
  for (const key of SETTINGS_KEYS) {
    if (tpl.settings[key] === undefined)
      throw new Error(`配音模板 ${tpl.id} 的 settings 缺少 ${key}`);
  }
  for (const kind of KINDS) {
    for (const entry of tpl.composition[kind]) {
      const when = typeof entry === 'string' ? undefined : entry.when;
      for (const cond of when ?? []) {
        const base = cond.startsWith('!') ? cond.slice(1) : cond;
        if (!CONDITIONS.has(base))
          throw new Error(`配音模板 ${tpl.id} 的组合表 ${kind} 出现未知条件：${cond}`);
      }
      if (typeof entry === 'string') {
        if (!resolveAtomKey(tpl, entry))
          throw new Error(`配音模板 ${tpl.id} 的组合表 ${kind} 引用了未知原子句：${entry}`);
      } else if (!('source' in entry)) {
        if (!resolveAtomKey(tpl, entry.key))
          throw new Error(`配音模板 ${tpl.id} 的组合表 ${kind} 引用了未知原子句：${entry.key}`);
      }
    }
  }
  for (const [key, texts] of Object.entries(tpl.atoms)) {
    for (const text of Object.values(texts ?? {})) {
      for (const ph of placeholdersIn(text ?? '')) {
        if (!PLACEHOLDERS.has(ph)) throw new Error(`配音模板 ${key} 出现未知占位符：{${ph}}`);
      }
    }
  }
}

/**
 * 装配注册表：逐个模板沿 `extends` 链（根 → 叶）合并 `atoms`（带各自命名空间前缀）与 `settings`；
 * 叶覆盖 `kinds` / `composition` / `extraLanguages`；`stations` 不继承（只有本文件自己的池）。
 * 构建期做全部校验（extends 不存在 / 成环、未知原子句、未知条件、未知占位符、settings 缺字段、非档位名）。
 */
export function createVoiceRegistry(
  datas: Record<string, VoiceTemplateData>,
): Map<string, VoiceTemplate> {
  const cache = new Map<string, VoiceTemplate>();
  const building = new Set<string>();

  function build(id: string): VoiceTemplate {
    const cached = cache.get(id);
    if (cached) return cached;
    const data = datas[id];
    if (!data) throw new Error(`配音模板 ${id} 不存在`);
    if (building.has(id)) throw new Error(`配音模板 ${id} 的 extends 成环`);
    building.add(id);
    const parent = data.extends ? build(data.extends) : undefined;
    building.delete(id);

    const namespaces = [id, ...(parent?.namespaces ?? [])];
    const atoms: Record<string, VoiceTexts> = { ...(parent?.atoms ?? {}) };
    for (const [key, texts] of Object.entries(data.atoms ?? {})) atoms[`${id}.${key}`] = texts;

    const composition = {} as Record<AnnounceKind, ComposeEntry[]>;
    for (const kind of KINDS)
      composition[kind] = data.composition?.[kind] ?? parent?.composition[kind] ?? [];

    const tpl: VoiceTemplate = {
      id,
      kinds: data.kinds ?? parent?.kinds ?? [...KINDS],
      extraLanguages: data.extraLanguages ?? parent?.extraLanguages ?? ['en'],
      atoms,
      composition,
      settings: { ...(parent?.settings ?? {}), ...(data.settings ?? {}) } as VoiceSettings,
      stations: data.stations ?? [],
      namespaces,
    };
    cache.set(id, tpl);
    return tpl;
  }

  for (const id of Object.keys(datas)) build(id);
  for (const tpl of cache.values()) validateTemplate(tpl);
  return cache;
}

// ================= 播报组装 =================

/** 站点 / 线路所属地区 → 播报语言（`primaryLang` 是语言，不是地区）：ja → ja，其余 → zh */
function voiceLangOf(primaryLang: NameLocale): AnnounceLang {
  return primaryLang === 'ja' ? 'ja' : 'zh';
}

/** 站名 / 线名：按播报语言取 names（站点与线路都四语齐全） */
function localNameFor(obj: { names: StationNames }, lang: AnnounceLang): string {
  if (lang === 'en') return obj.names.en;
  if (lang === 'ja') return obj.names.ja;
  return obj.names.zhCN;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

/** 渲染一个句子：任一占位符取值为空 → 整句跳过；文本缺该语言或为空 → 跳过 */
function render(template: string | undefined, vars: Record<string, string>): string | null {
  if (!template) return null;
  let ok = true;
  const text = template
    .replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = vars[key] ?? '';
      if (!value) ok = false;
      return value;
    })
    .trim();
  return ok && text ? text : null;
}

/** 变体名（数据里只有中文名 + 英文名，日文走 settings.variantNames） */
function variantNameFor(
  tpl: VoiceTemplate,
  variant: { name: string; nameEn: string },
  lang: AnnounceLang,
): string {
  if (lang === 'en') return variant.nameEn || tpl.settings.fullServiceName.en;
  if (lang === 'ja')
    return (
      tpl.settings.variantNames[variant.name]?.ja ??
      (variant.name || tpl.settings.fullServiceName.ja)
    );
  return variant.name || tpl.settings.fullServiceName.zh;
}

/** 换乘线路：最多列 transferLimit 条，多出来的用 transferOverflow 收尾 */
function transferName(ctx: AnnounceContext, tpl: VoiceTemplate, lang: AnnounceLang): string {
  const { settings } = tpl;
  const names = ctx.transfers.map((line) => shortLineName(localNameFor(line, lang)));
  const shown = names.slice(0, settings.transferLimit);
  const rest = names.length - shown.length;
  const head = shown.join(settings.transferJoin[lang]);
  return rest > 0 ? head + fill(settings.transferOverflow[lang], { n: String(rest) }) : head;
}

function branchName(ctx: AnnounceContext, tpl: VoiceTemplate, lang: AnnounceLang): string {
  const { settings } = tpl;
  return ctx.branches
    .slice(0, settings.transferLimit)
    .map((branch) =>
      branch.name
        ? variantNameFor(tpl, branch, lang)
        : lang === 'en'
          ? settings.fallbackBranchName.en
          : settings.fallbackBranchName[lang],
    )
    .join(settings.transferJoin[lang]);
}

/** `{station}`：该站在模板的文本池里写了 `announceName` 时用报站名（只决定念法），否则用当语言站名 */
function stationVar(ctx: AnnounceContext, tpl: VoiceTemplate, lang: AnnounceLang): string {
  if (!ctx.station) return '';
  const pool = tpl.stations.find((s) => s.id === ctx.station!.id);
  if (pool?.announceName) return pool.announceName;
  return localNameFor(ctx.station, lang);
}

function varsFor(
  ctx: AnnounceContext,
  tpl: VoiceTemplate,
  lang: AnnounceLang,
): Record<string, string> {
  return {
    line: localNameFor(ctx.line, lang),
    terminus: ctx.terminus ? localNameFor(ctx.terminus, lang) : '',
    station: stationVar(ctx, tpl, lang),
    next: ctx.next ? localNameFor(ctx.next, lang) : '',
    variant: variantNameFor(tpl, ctx.variant, lang),
    transfers: transferName(ctx, tpl, lang),
    branch: branchName(ctx, tpl, lang),
  };
}

function conditionHolds(ctx: AnnounceContext, cond: string): boolean {
  const negative = cond.startsWith('!');
  const base = negative ? cond.slice(1) : cond;
  let value: boolean;
  switch (base) {
    case 'atTerminus':
      value = Boolean(ctx.station && ctx.terminus && ctx.station.id === ctx.terminus.id);
      break;
    case 'hasTransfers':
      value = ctx.transfers.length > 0;
      break;
    case 'hasNext':
      value = Boolean(ctx.next);
      break;
    case 'nextIsJunction':
      value = Boolean(ctx.next && ctx.branches.length);
      break;
    case 'branchTrain':
      value = ctx.branchTrain;
      break;
    default:
      value = false;
  }
  return negative ? !value : value;
}

function whenHolds(ctx: AnnounceContext, when: string[] | undefined): boolean {
  return (when ?? []).every((cond) => conditionHolds(ctx, cond));
}

/**
 * 本次播报要念的句子：外层按组合序列、内层按语言（本地语言 + 额外语言，去重）。
 * 模板的 `kinds` 白名单未包含本次档位 → 静音（返回空数组）。
 */
export function buildAnnouncement(
  ctx: AnnounceContext,
  templates: Map<string, VoiceTemplate>,
  opts: { rand?: () => number } = {},
): Announcement[] {
  const tpl = templates.get(ctx.line.voice);
  if (!tpl) throw new Error(`配音模板 ${ctx.line.voice} 不存在`);
  if (!tpl.kinds.includes(ctx.kind)) return [];

  // 站点级事件的语言看目标站，线路级事件看线路主语言
  const target =
    ctx.kind === 'station'
      ? ctx.station
      : ctx.kind === 'enter' || ctx.kind === 'leave'
        ? ctx.next
        : null;
  const local = voiceLangOf(target ? target.primaryLang : ctx.line.primaryLang);
  const langs: AnnounceLang[] = [local, ...tpl.extraLanguages].filter(
    (lang, i, arr) => arr.indexOf(lang) === i,
  );
  const rand = opts.rand ?? Math.random;

  const out: Announcement[] = [];
  for (const entry of tpl.composition[ctx.kind]) {
    if (typeof entry !== 'string' && 'source' in entry) {
      if (!whenHolds(ctx, entry.when)) continue;
      if (!target) continue;
      const pool = tpl.stations.find((s) => s.id === target.id);
      if (!pool || pool.texts.length === 0) continue;
      const i = Math.min(
        pool.texts.length - 1,
        Math.max(0, Math.floor(rand() * pool.texts.length)),
      );
      const chosen = pool.texts[i];
      for (const lang of langs) {
        const station = pool.announceName ?? localNameFor(target, lang);
        const text = render(chosen.text[lang], { station });
        if (text) out.push({ lang, text });
      }
      continue;
    }
    const e = typeof entry === 'string' ? { key: entry, when: undefined } : entry;
    if (!whenHolds(ctx, e.when)) continue;
    const key = resolveAtomKey(tpl, e.key);
    if (!key) continue;
    for (const lang of langs) {
      const text = render(tpl.atoms[key][lang], varsFor(ctx, tpl, lang));
      if (text) out.push({ lang, text });
    }
  }
  return out;
}

export { DEFAULT_VOICE_TEMPLATE };
