// /display 条带图的数据模型：只产出「有哪些文字 / 徽章、徽章放哪一行、站名要不要左移、支线车道画在哪几列」。
// 排版本身全部交给 index.vue 的 CSS（grid + flex + rotate），这里不做像素定位；
// 只有下列常量与 CSS 对应，用来按真实字宽决定徽章换行与站名左移。

import type { NameLabelLine, OrgNames } from '../../composables/stationNames';

export type MeasureFn = (text: string, size: number, weight: number, family: string) => number;

/** 英文小字字体（与地图标签同一套：Barlow 只装了 400） */
const FONT_EN = 'Barlow';
/** 稻妻中译字体 */
const FONT_ZH = 'Noto Serif SC';

/** 面板尺寸与内边距：index.vue 的 .strip 用同一组数值 */
const PANEL_W = 1920;
const PAD_X = 16;
const BORDER = 2.5;

/**
 * 首末站到内容区左右边缘的固定距离（px）：index.vue 的 grid 模板用同一数值
 * （`${EDGE}px repeat(N-1, 1fr) ${EDGE}px`）。取 64px 是给圆圈、引线留出呼吸空间，
 * 同时不让站距被压缩；末尾站的 45° 长站名放不下时由 labelShift 往左回缩。
 */
export const EDGE = 64;

/** 站名三行的字号（.st-name / .st-zh / .st-en 用同一组数值）与统一行高比 */
const LABEL_NAME_SIZE = 12;
const LABEL_SUB_SIZE = 8;
const LABEL_LINE_RATIO = 1.35;

const BADGE_LABEL_SIZE = 11;
/** 单枚徽章的左右内边距合计 */
const BADGE_PAD_X = 24;
const BADGE_GAP = 8;
const COS45 = Math.SQRT1_2;

/** 支线站名与「支线」标签块的红（参考图：主线站名黑、支线站名红） */
const BRANCH_LABEL_COLOR = '#c0392b';

export interface StripBadgeModel {
  label: string;
  fill: string;
  textFill: string;
  /** 0 = 贴着主线的那一行，1 = 上方那一行 */
  row: 0 | 1;
}

/** 一个站点在条带上要画的文字（主线段与支线段共用）：标签行由 stationLabelLines 产出 */
export interface StripStationBase {
  id: string;
  /** 站名标签行（顺序即渲染顺序；第一行是主语言行） */
  lines: NameLabelLine[];
}

export interface StripStationModel extends StripStationBase {
  /** 并集列号（0 起算）：CSS 网格列线 = col + 2，站距也按它算 */
  col: number;
  /** 1 起算的站序（= 圆圈里的号）= col + 1 */
  index: number;
  /** 0 = 主线车道，1 起算 = 第几条支线车道（CSS 网格行 = 7 + lane） */
  lane: number;
  /** 主语言站名（= lines[0].text，进度 / 播报标签用） */
  name: string;
  /** 站名块的横向左移量（px，≤ 0）：靠右的车站斜排会顶出面板，用它压回来 */
  labelShift: number;
  /** 徽章簇的横向修正量（px）：簇以本站为中心，顶到内容区边缘时用它挤回来 */
  badgeShift: number;
  badges: StripBadgeModel[];
}

/** 一条支线车道：45° 引线从分歧站落到车道，横线画到末站列，末端挂支线名标签块 */
export interface StripLaneModel {
  /** 1 起算的支线序号（CSS 网格行 = 7 + lane） */
  lane: number;
  /** 分歧站所在列：45° 引线与车道横线都从这里起 */
  junctionCol: number;
  /** 该支线最后一站所在列（车道横线的末端列线 = lastCol + 2） */
  lastCol: number;
  /** 车道末端的支线名标签块；末站后面没有列时为 null（此时不画标签） */
  tag: { text: string; textEn: string; col: number } | null;
}

export interface StripInputStation extends StripStationBase {
  badges: { label: string; fill: string }[];
}

/** 一条支线：分歧站 + 独占站（按支线自身顺序，不含分歧站） */
export interface StripBranchInput {
  /** 支线短名（`支线`）；缺省 `支线` */
  name?: string;
  /** 缺省 `Branch` */
  nameEn?: string;
  /** 分歧站（主变体里的站 id） */
  junctionId: string;
  stations: StripStationBase[];
}

export interface StripInput {
  key: string;
  /** 线路颜色（已归一化为不透明色） */
  color: string;
  /** 线路所属区域的中日文字体 */
  cjkFont: string;
  /** 页头线路名的各行（主语言行 → 中文行 → 英文行） */
  labelLines: NameLabelLine[];
  operator?: OrgNames;
  authority?: OrgNames;
  stations: StripInputStation[];
  /** 与主线分岔的支线（纯子集的小交路不算），无支线时传空数组 */
  branches: StripBranchInput[];
  /** 环线条带：主线首尾各画一段 32px 虚线延伸，表示线路继续绕圈（见 index.vue 的 .strip-loop） */
  loop?: boolean;
}

export interface StripModel {
  key: string;
  color: string;
  cjkFont: string;
  /** 页头线路名的各行（主行 / 中文小字 / 英文小字） */
  labelLines: NameLabelLine[];
  operator?: OrgNames;
  authority?: OrgNames;
  /** 线路名称色块上的文字色 */
  chipTextFill: string;
  /** 主线最后一个站的列号（主线横线的末端列线 = trunkEndCol + 2） */
  trunkEndCol: number;
  /** 支线车道（按变体顺序）；空数组 = 该线路没有支线 */
  lanes: StripLaneModel[];
  /** 支线站名与标签块的颜色 */
  branchLabelColor: string;
  /** 环线：主线首尾各画一段 32px 虚线延伸（线路在视觉上继续绕圈，不是额外站点） */
  loop: boolean;
  stations: StripStationModel[];
}

// ===== 颜色工具 =====

/** 解析 `#rgb` / `#rrggbb` / 带 alpha 的变体，返回 [r, g, b]；无法解析返回 null */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1];
  const to = (s: string) => parseInt(s, 16);
  if (h.length === 3 || h.length === 4) return [to(h[0] + h[0]), to(h[1] + h[1]), to(h[2] + h[2])];
  if (h.length === 6 || h.length === 8) {
    return [to(h.slice(0, 2)), to(h.slice(2, 4)), to(h.slice(4, 6))];
  }
  return null;
}

function toHex(rgb: [number, number, number]): string {
  const part = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

/** 按比例混合两色：0 = 全 a，1 = 全 b；任一色无法解析时返回 a */
function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  return toHex([
    ca[0] + (cb[0] - ca[0]) * t,
    ca[1] + (cb[1] - ca[1]) * t,
    ca[2] + (cb[2] - ca[2]) * t,
  ]);
}

function linearize(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 相对亮度，0（黑）~1（白）；无法解析按 0 处理 */
function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return 0.2126 * linearize(rgb[0]) + 0.7152 * linearize(rgb[1]) + 0.0722 * linearize(rgb[2]);
}

/** 该底色上可读的文字色 */
function textOn(fill: string): string {
  return luminance(fill) > 0.5 ? '#111111' : '#ffffff';
}

/** 白纸上可读的该色（过亮则混黑 50%） */
function readableOn(fill: string): string {
  return luminance(fill) > 0.5 ? mixHex(fill, '#000000', 0.5) : fill;
}

// ===== 模型 =====

/**
 * 换乘徽章的行分配：徽章簇居中在本站列上，若与同一行左邻的簇在列坐标上重叠，
 * 就换到上面那一行（两行都放不下时接受第二行的重叠 —— 当前数据不会走到）。
 * 入参数组按「并集列序」逐列给出（没有徽章的列给空数组），因此下标即列号。
 */
function assignBadgeRows(clusters: { widths: number[] }[], colW: number): (0 | 1)[] {
  const rows: (0 | 1)[] = clusters.map(() => 0);
  const rowEnd = [0, 0];
  for (let i = 0; i < clusters.length; i++) {
    const widths = clusters[i].widths;
    if (!widths.length) continue;
    const clusterW =
      widths.reduce((a, w) => a + w + BADGE_PAD_X, 0) + BADGE_GAP * (widths.length - 1);
    const half = clusterW / 2 / colW;
    const gap = BADGE_GAP / colW;
    let placed = false;
    for (const r of [0, 1] as const) {
      if (i - half >= rowEnd[r] + gap) {
        rows[i] = r;
        rowEnd[r] = i + half;
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows[i] = 1;
      rowEnd[1] = Math.max(rowEnd[1], i + half);
    }
  }
  return rows;
}

export function buildStrip(input: StripInput, measure: MeasureFn): StripModel {
  // ===== 并集列：主线各站依次成列；某个分歧站之后紧接着插入对应支线的独占站 =====
  const cols: { station: StripStationBase; lane: number; badges: StripInputStation['badges'] }[] =
    [];
  /** 第 bi 条支线的分歧站在并集列里的列号；-1 = 分歧站不在主线里（该支线整条丢弃） */
  const laneJunctionCol: number[] = input.branches.map(() => -1);
  let trunkEndCol = 0;

  input.stations.forEach((station) => {
    cols.push({ station, lane: 0, badges: station.badges });
    trunkEndCol = cols.length - 1;
    input.branches.forEach((branch, bi) => {
      if (branch.junctionId !== station.id) return;
      laneJunctionCol[bi] = cols.length - 1;
      for (const branchStation of branch.stations) {
        cols.push({ station: branchStation, lane: bi + 1, badges: [] });
      }
    });
  });

  const count = cols.length;
  const contentW = PANEL_W - BORDER * 2 - PAD_X * 2;
  // 首末站各留 EDGE，其余等分：站距与 CSS grid 的 `EDGE repeat(count-1, 1fr) EDGE` 完全一致
  const span = Math.max(1, count - 1);
  const colW = (contentW - EDGE * 2) / span;
  const innerRight = PANEL_W - BORDER - PAD_X;

  const rows = assignBadgeRows(
    cols.map((col) => ({
      widths: col.badges.map((b) => measure(b.label, BADGE_LABEL_SIZE, 700, input.cjkFont)),
    })),
    colW,
  );
  // 徽章簇的实际宽度（与 CSS 的 padding 12 / gap 8 对应），用于首末站附近的横向夹紧
  const clusterW = cols.map((col) => {
    if (!col.badges.length) return 0;
    const widths = col.badges.map(
      (b) => measure(b.label, BADGE_LABEL_SIZE, 700, input.cjkFont) + BADGE_PAD_X,
    );
    return widths.reduce((a, w) => a + w, 0) + BADGE_GAP * (widths.length - 1);
  });
  const contentLeft = BORDER + PAD_X;
  const contentRight = PANEL_W - BORDER - PAD_X;

  const stations: StripStationModel[] = cols.map(({ station, lane, badges }, i) => {
    const sizes = station.lines.map((l) => (l.kind === 'name' ? LABEL_NAME_SIZE : LABEL_SUB_SIZE));
    const widths = station.lines.map((l, k) =>
      measure(
        l.text,
        sizes[k],
        l.kind === 'en' ? 400 : 700,
        l.kind === 'name' ? input.cjkFont : l.kind === 'zh' ? FONT_ZH : FONT_EN,
      ),
    );
    const blockW = Math.max(...widths);
    const blockH = LABEL_LINE_RATIO * sizes.reduce((a, b) => a + b, 0);
    // 45° 斜排的块占 (W+H)/√2；锚点就在本站（首末站因此离边缘各 EDGE）
    const extent = COS45 * (blockW + blockH);
    const anchorX = BORDER + PAD_X + EDGE + i * colW;
    const room = innerRight - anchorX - extent;
    const labelShift = Math.min(0, room);

    // 徽章簇以本站为中心（CSS 里 -50%），但整簇必须留在内容区内：
    // 首末站上的宽簇（如至冬环线各 2 枚）会被挤回面板内，这里给出修正量
    const centered = anchorX - clusterW[i] / 2;
    const badgeShift = clusterW[i]
      ? Math.min(
          Math.max(centered, contentLeft),
          Math.max(contentLeft, contentRight - clusterW[i]),
        ) - centered
      : 0;

    return {
      id: station.id,
      col: i,
      index: i + 1,
      lane,
      name: station.lines[0].text,
      lines: station.lines,
      labelShift,
      badgeShift,
      badges: badges.map((b) => ({
        label: b.label,
        fill: b.fill,
        textFill: textOn(b.fill),
        row: rows[i],
      })),
    };
  });

  // 支线车道：分歧站列 → 末站列之间画横线；末站后面还有列时，把支线名标签块挂在那一列
  const lanes: StripLaneModel[] = input.branches
    .map((branch, bi) => ({ branch, lane: bi + 1, junctionCol: laneJunctionCol[bi] }))
    .filter(({ junctionCol }) => junctionCol >= 0)
    .map(({ branch, lane, junctionCol }) => {
      const lastCol = junctionCol + branch.stations.length;
      return {
        lane,
        junctionCol,
        lastCol,
        tag:
          lastCol + 1 <= count - 1
            ? { text: branch.name || '支线', textEn: branch.nameEn || 'Branch', col: lastCol + 1 }
            : null,
      };
    });

  return {
    key: input.key,
    color: input.color,
    cjkFont: input.cjkFont,
    labelLines: input.labelLines,
    operator: input.operator,
    authority: input.authority,
    chipTextFill: textOn(input.color),
    trunkEndCol,
    lanes,
    branchLabelColor: BRANCH_LABEL_COLOR,
    loop: input.loop === true,
    stations,
  };
}
