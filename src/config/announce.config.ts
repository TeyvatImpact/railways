// /display 动态模式的语音播报配置 —— 通用播报词（原子句 / 组合表）与地区专用文本都搬到了
// src/data/voice/*.json（模型见 views/display/announce.ts，装配见 views/display/voiceTemplates.ts）。
// 这里只留与「引擎」相关的常量：语言 / 档位类型、进度状态开关、音色筛选与试听、存储键、日志上限。

export type AnnounceLang = 'zh' | 'ja' | 'en';
export type AnnounceKind = 'on' | 'direction' | 'variant' | 'station' | 'enter' | 'leave';

/** 线路 / 体系未指定配音模板时用的模板 id（= src/data/voice/common.json） */
export const DEFAULT_VOICE_TEMPLATE = 'common';

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
/** 三个音色的试听句 */
export const PREVIEW: Record<AnnounceLang, string> = {
  zh: '语音试听：本次列车终点站璃月港，下一站遗珑埠。',
  ja: '音声テスト：この列車の終点は鳴神島です。',
  en: 'Voice preview. This train is bound for Liyue Harbor.',
};
/** 日志最多保留多少条 */
export const LOG_LIMIT = 60;
