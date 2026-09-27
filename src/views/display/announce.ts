// /display 语音播报的纯逻辑：把「原子句 + 组合表 + 事件上下文」翻译成按顺序念的句子列表。
// 不碰 DOM、不碰配置以外的数据 —— 与 dynamicStrip.ts 同一风格（纯函数，可被 node 直接跑）。
import {
  ATOMS,
  COMPOSITION,
  DEFAULT_LANG,
  FALLBACK_BRANCH_NAME,
  FULL_SERVICE_NAME,
  REGION_LANGS,
  TRANSFER_JOIN,
  TRANSFER_LIMIT,
  TRANSFER_OVERFLOW,
  VARIANT_NAMES_JA,
  type AnnounceKind,
  type AnnounceLang,
  type AtomKey,
  type ComposeSlot,
} from '../../config/announce.config';
import { ANNOUNCE_SCRIPTS, type AnnounceScript, type ScriptTexts } from './announceScript';
import type { Direction } from './dynamicStrip';

export interface Announcement {
  lang: AnnounceLang;
  text: string;
}

/** 站 / 线共用的命名字段（Station 就是这个形状，多带的字段无所谓） */
export interface NamedText {
  id: string;
  name: string;
  nameZh?: string;
  nameEn: string;
}

export interface AnnounceContext {
  kind: AnnounceKind;
  /** 线路：线路级事件的语言看它；`stationIds[0]` 的前缀 = 线路所属地区 */
  line: { name: string; nameZh?: string; nameEn: string; stationIds: string[] };
  direction: Direction;
  /** 当前变体（`{ name: '', nameEn: '' }` = 全线交路） */
  variant: { name: string; nameEn: string };
  terminus: NamedText | null;
  /** station = 到达站；enter = 出发站；leave = 下一站 */
  station: NamedText | null;
  next: NamedText | null;
  /** station 用本站、enter / leave 用下一站的换乘线路（已排除本线；空 = 不播换乘句） */
  transfers: { name: string; nameEn: string }[];
  /** 下一站是分岔站时，从该站分出的支线（空 = 不是分岔站） */
  branches: { name: string; nameEn: string }[];
  /** 本趟行程是否走在支线上（决定 branchHint 用哪句） */
  branchTrain: boolean;
}

/** `Inazuma-KNG` → `Inazuma`（站点 id 一定是 `地区-短码` 两段） */
export function regionOf(id: string): string {
  const i = id.indexOf('-');
  return i > 0 ? id.slice(0, i) : id;
}

/** 站点 / 线路所属地区 → 播报语言 */
export function langOf(id: string): AnnounceLang {
  return REGION_LANGS[regionOf(id)] ?? DEFAULT_LANG;
}

/** 线名简称：取最后一个 `·` 之后的一段（与换乘徽章同款），没有 `·` 就整名 */
export function shortLineName(name: string): string {
  return name.split('·').pop() || name;
}

/** 该原子句必须拿到哪些占位符；缺一个就整句跳过 */
const REQUIRED: Partial<Record<AtomKey, string[]>> = {
  welcome: ['line'],
  terminal: ['terminus'],
  variant: ['variant'],
  nextStation: ['next'],
  arrive: ['station'],
  arriveTerminal: ['station'],
  transfer: ['transfers'],
  branchHintBranch: ['branch'],
};

function nameFor(
  obj: { name: string; nameZh?: string; nameEn: string },
  lang: AnnounceLang,
): string {
  if (lang === 'en') return obj.nameEn;
  if (lang === 'ja') return obj.name;
  return obj.nameZh ?? obj.name;
}

function variantName(ctx: AnnounceContext, lang: AnnounceLang): string {
  if (lang === 'en') return ctx.variant.nameEn || FULL_SERVICE_NAME.en;
  if (lang === 'ja')
    return VARIANT_NAMES_JA[ctx.variant.name] ?? (ctx.variant.name || FULL_SERVICE_NAME.ja);
  return ctx.variant.name || FULL_SERVICE_NAME.zh;
}

/** 换乘线路：最多列 TRANSFER_LIMIT 条，多出来的用 TRANSFER_OVERFLOW 收尾 */
function transferName(ctx: AnnounceContext, lang: AnnounceLang): string {
  const names = ctx.transfers.map((line) => shortLineName(lang === 'en' ? line.nameEn : line.name));
  const shown = names.slice(0, TRANSFER_LIMIT);
  const rest = names.length - shown.length;
  const head = shown.join(TRANSFER_JOIN[lang]);
  return rest > 0 ? head + fill(TRANSFER_OVERFLOW[lang], { n: String(rest) }) : head;
}

function branchName(ctx: AnnounceContext, lang: AnnounceLang): string {
  return ctx.branches
    .slice(0, TRANSFER_LIMIT)
    .map((branch) =>
      lang === 'en'
        ? branch.nameEn || FALLBACK_BRANCH_NAME.en
        : branch.name || FALLBACK_BRANCH_NAME[lang],
    )
    .join(TRANSFER_JOIN[lang]);
}

/** 组合表里的槽 → 实际原子句；该槽这次不适用时给 null */
function atomKeyFor(ctx: AnnounceContext, slot: ComposeSlot): AtomKey | null {
  const atTerminus = Boolean(ctx.station && ctx.terminus && ctx.station.id === ctx.terminus.id);
  switch (slot) {
    case 'arrive':
      return atTerminus ? 'arriveTerminal' : 'arrive';
    case 'alight':
      return atTerminus ? 'alightTerminal' : 'alight';
    case 'transfer':
      return ctx.transfers.length ? 'transfer' : null;
    case 'branchHint':
      return ctx.next && ctx.branches.length
        ? ctx.branchTrain
          ? 'branchHintOther'
          : 'branchHintBranch'
        : null;
    default:
      return slot;
  }
}

/** 本地语言：站点级事件看该站，线路级事件看线路首个站的地区 */
function localLang(ctx: AnnounceContext): AnnounceLang {
  if ((ctx.kind === 'station' || ctx.kind === 'enter') && ctx.station)
    return langOf(ctx.station.id);
  if (ctx.kind === 'leave' && ctx.next) return langOf(ctx.next.id);
  return langOf(ctx.line.stationIds[0] ?? '');
}

/** 脚本归属的站点：站点级档位看目标站（station = 到达站，enter / leave = 下一站），线路级档位没有站点 */
function scriptTarget(ctx: AnnounceContext): NamedText | null {
  if (ctx.kind === 'station') return ctx.station;
  if (ctx.kind === 'enter' || ctx.kind === 'leave') return ctx.next;
  return null;
}

/** 文本池里随机取一条；rand 可注入（默认 Math.random），下标夹到池子范围内 */
function pickRandom<T>(list: T[], rand: () => number): T {
  const i = Math.min(list.length - 1, Math.max(0, Math.floor(rand() * list.length)));
  return list[i]!;
}

/** 三段式地区脚本播报：到站提示 + 提前做好准备播报 + 站点专属文本（随机一条）；
 *  每段都取 langs 里存在的语言版本（至冬只有 zh，补 en 即自动中英对照） */
function scriptedAnnouncement(
  script: AnnounceScript,
  station: NamedText,
  local: AnnounceLang,
  langs: AnnounceLang[],
  rand: () => number,
): Announcement[] {
  const entry = script.stations.find((it) => it.id === station.id) ?? null;
  const vars = { station: entry?.announceName ?? nameFor(station, local) };
  const parts: (ScriptTexts | undefined)[] = [script.templates.arrival, script.templates.prepare];
  if (entry?.texts.length) parts.push(pickRandom(entry.texts, rand).text);
  const out: Announcement[] = [];
  for (const part of parts) {
    for (const lang of langs) {
      const text = fill(part?.[lang] ?? '', vars).trim();
      if (text) out.push({ lang, text });
    }
  }
  return out;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

function varsFor(ctx: AnnounceContext, lang: AnnounceLang): Record<string, string> {
  return {
    line: nameFor(ctx.line, lang),
    terminus: ctx.terminus ? nameFor(ctx.terminus, lang) : '',
    station: ctx.station ? nameFor(ctx.station, lang) : '',
    next: ctx.next ? nameFor(ctx.next, lang) : '',
    variant: variantName(ctx, lang),
    transfers: transferName(ctx, lang),
    branch: branchName(ctx, lang),
  };
}

/** 本次播报要念的句子：有地区脚本的地区只念脚本覆盖的档位（其余档位静音），其余地区按组合表展开 */
export function buildAnnouncement(
  ctx: AnnounceContext,
  opts: { rand?: () => number } = {},
): Announcement[] {
  const local = localLang(ctx);
  const langs: AnnounceLang[] = local === 'en' ? ['en'] : [local, 'en'];
  const target = scriptTarget(ctx);
  const script = ANNOUNCE_SCRIPTS[regionOf(target?.id ?? ctx.line.stationIds[0] ?? '')] ?? null;
  if (script) {
    return target && script.kinds.includes(ctx.kind)
      ? scriptedAnnouncement(script, target, local, langs, opts.rand ?? Math.random)
      : [];
  }
  const out: Announcement[] = [];
  for (const slot of COMPOSITION[ctx.kind]) {
    const key = atomKeyFor(ctx, slot);
    if (!key) continue;
    for (const lang of langs) {
      const vars = varsFor(ctx, lang);
      const required = REQUIRED[key];
      if (required?.some((name) => !vars[name])) continue;
      const text = fill(ATOMS[key][lang], vars).trim();
      if (text) out.push({ lang, text });
    }
  }
  return out;
}
