// /display 语音播报的「地区脚本」：按站点所属地区（站点 id 前缀）查一套专用报站文本。
// 纯数据 + 纯查表，不含随机与拼接（拼接在 announce.ts）；与 announce.config.ts 的分工：
// 通用原子句在 config，地区专用文本在 src/data/*.announce.json。
import snezhnayaScript from '../../data/snezhnaya.announce.json';
import type { AnnounceKind, AnnounceLang } from '../../config/announce.config';

/** 一条文本的各语言版本；当前至冬只有 zh，补 en 即自动中英对照 */
export type ScriptTexts = Partial<Record<AnnounceLang, string>>;

/** 站点专属文本池里的一条；announcer = 报站员，隐藏 metadata：只记录谁念的这句，不进 UI、不进日志 */
export interface ScriptEntry {
  announcer: string;
  text: ScriptTexts;
}

/** 一个站点的脚本：报站名（可与地图站名不同）+ 专属文本池 */
export interface ScriptStation {
  /** 完整站点 id（`地区-短码`） */
  id: string;
  /** 报站用名；缺省用站点自己的中文名 */
  announceName?: string;
  /** 专属文本池（每次播报随机取一条） */
  texts: ScriptEntry[];
}

/** 一个地区的报站脚本 */
export interface AnnounceScript {
  /** 本脚本覆盖哪些播报档位；未列出的档位在该地区不发声（至冬目前只有 `station` = 到站档） */
  kinds: AnnounceKind[];
  /** 三段式的前两句模板；`{station}` = 报站名 */
  templates: { arrival: ScriptTexts; prepare: ScriptTexts };
  /** 有专属文本的站点；没列在这里的站点仍走模板（只念前两段） */
  stations: ScriptStation[];
}

/** 地区前缀 → 脚本（与 announce.config.ts 的 REGION_LANGS 同口径）。JSON 的数组字面量类型会被
 *  展开成 string[]，这里收窄回 AnnounceKind[]；若 vue-tsc 不接受这个断言，写 `as unknown as AnnounceScript`。 */
export const ANNOUNCE_SCRIPTS: Record<string, AnnounceScript> = {
  Snezhnaya: snezhnayaScript as AnnounceScript,
};
