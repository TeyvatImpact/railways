// 联合提瓦特（Union Teyvat, UT）：TR 线路 / 站点的上级运营主体。
//
// 这家机关的**全称**由各级机关名直接拼接而成 —— 联合提瓦特 → 提瓦特交通集团 → 提瓦特铁路总公司 ——
// 所以不在数据表里写那串长名字，而在代码里拼（`joinOrgNames`），其它地方用 id 引用：
//   - `union-teyvat`：TR 线路的运营主体之一（另一个是该国本地管理方，写在 `lines.json` 里）；
//   - `nod-krai-confederation`：挪德卡莱的本地管理方，名字里也含 `联合提瓦特`，同样在代码里拼。
//
// 拼接规则：中文（简 / 繁）与日文不加分隔符（需要分层时用 `·`），英文按分隔符留词距。
import type { CoreLocale, Names, StationNames } from '../composables/stationNames';
import { CORE_LOCALES } from '../composables/stationNames';

/** 各级机关之间的句读（按语言）：中文 / 日文直接连写，英文留一个词距 */
const DEFAULT_SEPARATORS: Record<CoreLocale, string> = {
  zhCN: '',
  zhTW: '',
  ja: '',
  en: ' ',
};

/** 需要分层时的句读（如「同盟会·自治委员会」） */
const DOT_SEPARATORS: Record<CoreLocale, string> = {
  zhCN: '·',
  zhTW: '·',
  ja: '・',
  en: ' · ',
};

const UNION_TEYVAT: StationNames = {
  zhCN: '联合提瓦特',
  zhTW: '聯合提瓦特',
  ja: '連合テイワット',
  en: 'Union Teyvat',
};

const TEYVAT_TRANSPORT_GROUP: StationNames = {
  zhCN: '提瓦特交通集团',
  zhTW: '提瓦特交通集團',
  ja: 'テイワット交通グループ',
  en: 'Teyvat Transport Group',
};

const TEYVAT_RAILWAY_CORPORATION: StationNames = {
  zhCN: '提瓦特铁路总公司',
  zhTW: '提瓦特鐵路總公司',
  ja: 'テイワット鉄道総公司',
  en: 'Teyvat Railway Corporation',
};

const NOD_KRAI_CONFEDERATION: StationNames = {
  zhCN: '挪德卡莱同盟会',
  zhTW: '挪德卡萊同盟會',
  ja: 'ナド・クライ同盟会',
  en: 'Nod-Krai Confederation',
};

const NOD_KRAI_COMMITTEE: StationNames = {
  zhCN: '挪德卡莱自治委员会',
  zhTW: '挪德卡萊自治委員會',
  ja: 'ナド・クライ自治委員会',
  en: 'Nod-Krai Autonomous Committee',
};

/** 逐语言拼接机关名；`separators` 缺省 = 中文 / 日文连写、英文空格 */
export function joinOrgNames(
  parts: StationNames[],
  separators: Record<CoreLocale, string> = DEFAULT_SEPARATORS,
): StationNames {
  const joined = {} as StationNames;
  for (const locale of CORE_LOCALES) {
    joined[locale] = parts.map((part) => part[locale]).join(separators[locale]);
  }
  return joined;
}

/** 代码内置机构：名字由多级机关名拼出，不写进 `organizations.json`；`nation` 决定展示语言链 */
export interface BuiltinOrg {
  id: string;
  names: Names;
  nation?: string;
}

export const BUILTIN_ORGS: BuiltinOrg[] = [
  {
    // 联合提瓦特提瓦特交通集团提瓦特铁路总公司
    id: 'union-teyvat',
    names: joinOrgNames([UNION_TEYVAT, TEYVAT_TRANSPORT_GROUP, TEYVAT_RAILWAY_CORPORATION]),
  },
  {
    // 挪德卡莱同盟会·联合提瓦特挪德卡莱自治委员会
    id: 'nod-krai-confederation',
    names: joinOrgNames(
      [NOD_KRAI_CONFEDERATION, joinOrgNames([UNION_TEYVAT, NOD_KRAI_COMMITTEE])],
      DOT_SEPARATORS,
    ),
    nation: 'nodkrai',
  },
];

/**
 * 地区（国家/地区 id，或更细的**区域** id）→ 该地区的运营方，按体系分：`地区 -> 体系 -> { operator, authority }`。
 *
 * 运营方是**地域属性**：线路跨地区开行时，区间由**所在地**的机构运营 —— 所以站点信息里的运营公司 /
 * 运营主体取「站所属的地区」（有区域用区域，否则用国家/地区），而不是「服务它的线路归哪个局」：
 *
 * - TR（`teyvat`）：五个地区局 + 联合提瓦特 + 本国本地管理方；`snezhnaya` 不是 TR 地区，TR 的列车
 *   开进至冬境内即由至冬皇家铁路运营；
 * - IR（`inazuma`）：稻妻按岛分三家 —— 鸣神岛 / 神无冢 = `ir-east-inazuma`（IR 东稻妻）、
 *   鹤观岛 = `ir-tsurumi`（IR 鹤观）、八酝岛 / 海祇岛 = `ir-sangonomiya`（IR 珊瑚宫，八酝岛线归它）；
 *   运营主体是稻妻幕府，海祇岛另加珊瑚宫自治政府。
 *
 * 表里没有的「地区 × 体系」组合（稻妻 / 枫丹的轮渡、以及地区未覆盖的新线路）用线路自己的运营方。
 */
const IR = (
  operator: string,
  authority: string[] = ['inazuma-shogunate'],
): Record<string, { operator: string; authority: string[] }> => ({
  inazuma: { operator, authority },
});

export const REGION_ORGS: Record<
  string,
  Record<string, { operator: string; authority: string[] }>
> = {
  mondstadt: {
    teyvat: {
      operator: 'tr-mondstadt-bureau',
      authority: ['union-teyvat', 'knights-of-favonius'],
    },
  },
  liyue: {
    teyvat: {
      operator: 'tr-liyue-bureau',
      authority: ['union-teyvat', 'liyue-ministry-of-civil-affairs'],
    },
  },
  sumeru: {
    teyvat: {
      operator: 'tr-sumeru-bureau',
      authority: ['union-teyvat', 'sumeru-akademiya'],
    },
  },
  natlan: {
    teyvat: {
      operator: 'tr-natlan-bureau',
      authority: ['union-teyvat', 'pyro-archon-office'],
    },
  },
  nodkrai: {
    teyvat: {
      operator: 'tr-nod-krai-bureau',
      authority: ['union-teyvat', 'nod-krai-confederation'],
    },
  },
  snezhnaya: {
    teyvat: {
      operator: 'snezhnaya-royal-railway',
      authority: ['snezhnaya-royal-railway-transport-bureau'],
    },
  },
  'narukami-island': IR('ir-east-inazuma'),
  kannazuka: IR('ir-east-inazuma'),
  'tsurumi-island': IR('ir-tsurumi'),
  'yashiori-island': IR('ir-sangonomiya'),
  'watatsumi-island': IR('ir-sangonomiya', ['watatsumi-sangonomiya-autonomous-government']),
};
