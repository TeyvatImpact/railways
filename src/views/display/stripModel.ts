// /display 条带图的数据模型：只产出「有哪些文字 / 徽章、徽章放哪一行、站名要不要左移」。
// 排版本身全部交给 index.vue 的 CSS（grid + flex + rotate），这里不做像素定位；
// 只有下列常量与 CSS 对应，用来按真实字宽决定徽章换行与站名左移。

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

/** 一行站名：样式由 CSS 类按 kind 决定 */
export interface StripLabelLine {
  text: string;
  kind: 'name' | 'zh' | 'en';
}

export interface StripBadgeModel {
  label: string;
  fill: string;
  textFill: string;
  /** 0 = 贴着主线的那一行，1 = 上方那一行 */
  row: 0 | 1;
}

export interface StripStationModel {
  id: string;
  /** 1 起算的站序（= 圆圈里的号，也 = CSS grid 的列号） */
  index: number;
  label: StripLabelLine[];
  /** 站名块的横向左移量（px，≤ 0）：靠右的车站斜排会顶出面板，用它压回来 */
  labelShift: number;
  /** 徽章簇的横向修正量（px）：簇以本站为中心，顶到内容区边缘时用它挤回来 */
  badgeShift: number;
  badges: StripBadgeModel[];
}

/** 运营公司 / 运营主体：中文主行 + 英文小字 + 可选第三行小字 */
export interface StripOperator {
  name?: string;
  nameEn?: string;
  nameAlt?: string;
}

export interface StripInputStation {
  id: string;
  name: string;
  nameZh?: string;
  nameEn: string;
  badges: { label: string; fill: string }[];
}

export interface StripInput {
  key: string;
  /** 线路颜色（已归一化为不透明色） */
  color: string;
  /** 线路所属区域的中日文字体 */
  cjkFont: string;
  name: string;
  nameZh?: string;
  nameEn: string;
  operator?: StripOperator;
  authority?: StripOperator;
  stations: StripInputStation[];
}

export interface StripModel {
  key: string;
  color: string;
  cjkFont: string;
  name: string;
  nameZh?: string;
  nameEn: string;
  operator?: StripOperator;
  authority?: StripOperator;
  /** 线路名称色块上的文字色 */
  chipTextFill: string;
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
  const count = input.stations.length;
  const contentW = PANEL_W - BORDER * 2 - PAD_X * 2;
  // 首末站各留 EDGE，其余等分：站距与 CSS grid 的 `EDGE repeat(count-1, 1fr) EDGE` 完全一致
  const span = Math.max(1, count - 1);
  const colW = (contentW - EDGE * 2) / span;
  const innerRight = PANEL_W - BORDER - PAD_X;

  const rows = assignBadgeRows(
    input.stations.map((s) => ({
      widths: s.badges.map((b) => measure(b.label, BADGE_LABEL_SIZE, 700, input.cjkFont)),
    })),
    colW,
  );
  // 徽章簇的实际宽度（与 CSS 的 padding 12 / gap 8 对应），用于首末站附近的横向夹紧
  const clusterW = input.stations.map((s) => {
    if (!s.badges.length) return 0;
    const widths = s.badges.map(
      (b) => measure(b.label, BADGE_LABEL_SIZE, 700, input.cjkFont) + BADGE_PAD_X,
    );
    return widths.reduce((a, w) => a + w, 0) + BADGE_GAP * (widths.length - 1);
  });
  const contentLeft = BORDER + PAD_X;
  const contentRight = PANEL_W - BORDER - PAD_X;

  const stations: StripStationModel[] = input.stations.map((station, i) => {
    const wName = measure(station.name, LABEL_NAME_SIZE, 700, input.cjkFont);
    const wZh = station.nameZh ? measure(station.nameZh, LABEL_SUB_SIZE, 700, FONT_ZH) : 0;
    const wEn = measure(station.nameEn, LABEL_SUB_SIZE, 400, FONT_EN);
    const blockW = Math.max(wName, wZh, wEn);
    const blockH =
      LABEL_LINE_RATIO * (LABEL_NAME_SIZE + LABEL_SUB_SIZE + (station.nameZh ? LABEL_SUB_SIZE : 0));
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
      index: i + 1,
      label: [
        { text: station.name, kind: 'name' },
        ...(station.nameZh ? [{ text: station.nameZh, kind: 'zh' as const }] : []),
        { text: station.nameEn, kind: 'en' },
      ],
      labelShift,
      badgeShift,
      badges: station.badges.map((b) => ({
        label: b.label,
        fill: b.fill,
        textFill: textOn(b.fill),
        row: rows[i],
      })),
    };
  });

  return {
    key: input.key,
    color: input.color,
    cjkFont: input.cjkFont,
    name: input.name,
    nameZh: input.nameZh,
    nameEn: input.nameEn,
    operator: input.operator,
    authority: input.authority,
    chipTextFill: textOn(input.color),
    stations,
  };
}
