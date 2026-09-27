// /display 动态模式的语音播报配置 —— 通用播报词（原子句 / 组合表）只改这个文件；
// 地区专用报站脚本在 src/data/<地区>.announce.json（查表见 views/display/announceScript.ts，拼装在 announce.ts）。
// 结构：ATOMS = 原子句（句子级最小单位，每句三语各写一份）；COMPOSITION = 组合表（每次播报按顺序念哪几句）。
// 占位符：{line} {terminus} {station} {next} {variant} {transfers} {branch} {n}
// 站名与线名都四语齐全（见 composables/stationNames.ts），按语言取 names：zh → names.zhCN、ja → names.ja、en → names.en
// 变体名（支线 / 小交路）数据里只有中文名 + 英文名，日文走 VARIANT_NAMES_JA

export type AnnounceLang = 'zh' | 'ja' | 'en';
export type AnnounceKind = 'on' | 'direction' | 'variant' | 'station' | 'enter' | 'leave';

/** 原子句：每句都要写全三语；空串 = 该句不播 */
export const ATOMS = {
  /** 开启动态模式（对应「上车」） */
  welcome: {
    zh: '欢迎您乘坐{line}。',
    ja: 'ご乗車ありがとうございます。{line}をご利用ください。',
    en: 'Welcome to {line}.',
  },
  /** 终点站告知（方向 / 变体调整与出站播报都用它） */
  terminal: {
    zh: '本次列车终点站{terminus}。',
    ja: 'この列車の終点は{terminus}です。',
    en: 'The terminal station of this train is {terminus}.',
  },
  /** 交路告知（支线 / 小交路 / 全线） */
  variant: {
    zh: '本次列车为{variant}。',
    ja: 'この列車は{variant}です。',
    en: 'This train is a {variant} service.',
  },
  nextStation: {
    zh: '下一站{next}。',
    ja: '次は{next}です。',
    en: 'The next station is {next}.',
  },
  arrive: {
    zh: '{station}到了。',
    ja: '{station}です。',
    en: 'We are now at {station}.',
  },
  /** 终点站到达：到站事件自动替换 arrive */
  arriveTerminal: {
    zh: '终点站{station}到了。',
    ja: '終点、{station}です。',
    en: 'We are now at the terminal station, {station}.',
  },
  alight: {
    zh: '下车，当心脚下空隙。',
    ja: 'お降りの際は足元にご注意ください。',
    en: 'Please mind the gap when leaving the train.',
  },
  /** 终点站下车：到站事件自动替换 alight */
  alightTerminal: {
    zh: '请您携带好随身物品下车，当心脚下空隙。',
    ja: 'お荷物をお忘れなく、足元にご注意ください。',
    en: 'Please take your belongings with you, and mind the gap.',
  },
  /** 换乘告知（该站没有其他轨道线路时整句省略） */
  transfer: {
    zh: '可换乘{transfers}。',
    ja: '{transfers}にお乗り換えです。',
    en: 'You can transfer to {transfers} here.',
  },
  /** 支线车开向分岔站：提醒换乘（仅该条件下出现） */
  branchHintOther: {
    zh: '前往其他方向的乘客请在本站换乘。',
    ja: '別方向へお越しの方は、この駅でお乗り換えください。',
    en: 'Passengers continuing in other directions, please transfer here.',
  },
  /** 主线车开向分岔站：提醒换乘支线（仅该条件下出现） */
  branchHintBranch: {
    zh: '前往{branch}方向的乘客请在本站换乘。',
    ja: '{branch}方面へお越しの方は、この駅でお乗り換えください。',
    en: 'Passengers for the {branch} branch, please transfer here.',
  },
  /** 中性开门句（不含左右）：暂不进任何组合表，留着备用 */
  doors: {
    zh: '车门即将打开。',
    ja: 'ドアが開きます。',
    en: 'Doors will open.',
  },
  /** 站台广播（开往 X 的列车即将进站）：保留但不启用 */
  platformArriving: {
    zh: '开往{terminus}的列车即将进站，请先下后上，排队候车，上车当心脚下空隙。',
    ja: '{terminus}行きの列車がまもなく参ります。お降りのお客様が先です。',
    en: 'The train bound for {terminus} is arriving. Please line up waiting and mind the gap between the train and the platform while boarding.',
  },
} as const satisfies Record<string, Record<AnnounceLang, string>>;

export type AtomKey = keyof typeof ATOMS;
/** 组合表里的条件槽：branchHint 会在支线车 / 主线车之间自动选句 */
export type ComposeSlot = AtomKey | 'branchHint';

/** 组合表 = 每次播报按顺序念哪些原子句（顺序即播放顺序）。条件替换规则见 announce.ts：
 *  arrive / alight → 终点站时换成 arriveTerminal / alightTerminal；
 *  transfer        → 该站（station 看本站、enter 看下一站）没有其他轨道线路时整句省略；
 *  branchHint      → 仅当「下一站是分岔站」时出现：支线车 → branchHintOther，主线车 → branchHintBranch，否则省略。 */
export const COMPOSITION = {
  on: ['welcome'],
  direction: ['terminal'],
  variant: ['terminal', 'variant'],
  station: ['arrive', 'transfer', 'alight'],
  enter: ['terminal', 'nextStation', 'transfer', 'branchHint'],
  leave: ['arrive', 'transfer', 'alight'],
} as const satisfies Record<AnnounceKind, readonly ComposeSlot[]>;

/** 进度状态开关：enter（进入区间 / 出站）已启用；leave（离开区间 / 即将入站）暂时禁用 ——
 *  原子句与组合表都已备好，改成 true 即生效（进度下拉里同时多出这一档）。 */
export const PROGRESS_STATES = { enter: true, leave: false };

/** 音色筛选：voice.lang 前缀 */
export const VOICE_LANGS: Record<AnnounceLang, string> = { zh: 'zh', ja: 'ja', en: 'en' };
/** utterance.lang（找不到对应音色时用它让浏览器选默认音色） */
export const UTTERANCE_LANGS: Record<AnnounceLang, string> = {
  zh: 'zh-CN',
  ja: 'ja-JP',
  en: 'en-US',
};
/** 音色选择与自动播报开关的 localStorage 键（值 { zh, ja, en, auto }，音色存 voiceURI） */
export const VOICE_STORAGE_KEY = 'teyvat-railways-voices';
/** 地区前缀 → 播报语言（站点 id 形如 `Inazuma-XXX`）；未列出的地区用 DEFAULT_LANG */
export const REGION_LANGS: Record<string, AnnounceLang> = { Inazuma: 'ja' };
export const DEFAULT_LANG: AnnounceLang = 'zh';
/** 三个音色的试听句 */
export const PREVIEW: Record<AnnounceLang, string> = {
  zh: '语音试听：本次列车终点站璃月港，下一站遗珑埠。',
  ja: '音声テスト：この列車の終点は鳴神島です。',
  en: 'Voice preview. This train is bound for Liyue Harbor.',
};
/** 未命名变体（全线交路）与未命名支线的播报名 */
export const FULL_SERVICE_NAME: Record<AnnounceLang, string> = {
  zh: '全线',
  ja: '全区間',
  en: 'full service',
};
export const FALLBACK_BRANCH_NAME: Record<AnnounceLang, string> = {
  zh: '支线',
  ja: '支線',
  en: 'branch',
};
/** 变体名（数据里的中文名）→ 日文播报名；没列出的直接用中文名（日语音色读汉字） */
export const VARIANT_NAMES_JA: Record<string, string> = { 支线: '支線', 小交路: '区間運転' };
/** 换乘线路最多列几条；超出部分用 TRANSFER_OVERFLOW 收尾（{n} = 剩余条数） */
export const TRANSFER_LIMIT = 2;
export const TRANSFER_JOIN: Record<AnnounceLang, string> = { zh: '、', ja: '、', en: ', ' };
export const TRANSFER_OVERFLOW: Record<AnnounceLang, string> = {
  zh: '等{n}条线路',
  ja: 'など{n}線',
  en: ' and {n} more lines',
};
/** 日志最多保留多少条 */
export const LOG_LIMIT = 60;
