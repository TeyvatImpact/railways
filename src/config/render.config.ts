// ===== 标签配置 =====

/** 标签内边距（px），文字与标签框边缘之间的距离 */
export const pad = 2;

/** 中文字体大小（px） */
export const fsCNSmall = 12;

/** 英文字体大小（px） */
export const fsENSmall = 8;

/** 站点与标签之间的间距（px） */
export const gap = 2;

/** 标签内中文与英文的垂直间距（px） */
export const textGap = 2;

/** 站点圆圈的半径（px） */
export const stationR = 8;

// ===== 线路配置 =====

/** 线路的描边宽度（px） */
export const LINE_WIDTH = 4;

/** 基础 7 色（红橙黄绿青蓝紫），即 linePalette 的前 7 项 */
const LINE_COLORS_BASE = [
  '#e6194b', // 红
  '#f58231', // 橙
  '#ffe119', // 黄
  '#3cb44b', // 绿
  '#42d4f4', // 青
  '#4363d8', // 蓝
  '#911eb4', // 紫
];

/** 「加亮 / 加暗 / 更加亮 / 更加暗」与白/黑的混合比例 */
const TINT_LIGHT = 0.35;
const TINT_LIGHTER = 0.65;
const SHADE_DARK = 0.3;
const SHADE_DARKER = 0.55;

/** 与目标色按比例混合：0 = 原色，1 = 目标色 */
function mixColor(hex: string, target: string, ratio: number): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = rgb(hex);
  const [r2, g2, b2] = rgb(target);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * ratio);
  const channel = (v: number) => v.toString(16).padStart(2, '0');
  return `#${channel(mix(r1, r2))}${channel(mix(g1, g2))}${channel(mix(b1, b2))}`;
}

/**
 * 单条线路体系（一个数据文件）的线路配色，按该文件内的线路序号取用：
 * 第 1~7 条基础 7 色（红橙黄绿青蓝紫），8~14 加亮，15~21 加暗，22~28 更加亮，29~35 更加暗。
 * 轮渡 / 同站换乘线路不用这套配色（见 FERRY_COLOR / SAME_COLOR）。
 */
export const linePalette: string[] = [
  ...LINE_COLORS_BASE,
  ...LINE_COLORS_BASE.map((c) => mixColor(c, '#ffffff', TINT_LIGHT)),
  ...LINE_COLORS_BASE.map((c) => mixColor(c, '#000000', SHADE_DARK)),
  ...LINE_COLORS_BASE.map((c) => mixColor(c, '#ffffff', TINT_LIGHTER)),
  ...LINE_COLORS_BASE.map((c) => mixColor(c, '#000000', SHADE_DARKER)),
];

// ===== 坐标与缩放配置 =====

/** 数据坐标中每 1 单位对应的像素数。**改这一个值即改变整张地图的比例**（站点坐标、SVG 尺寸、鼠标坐标读数都跟着走） */
export const BLOCK_SIZE = 64;

/** 边界留白（数据坐标单位），用于计算 SVG 尺寸时的额外边距 */
export const margin = 2;

// ===== 标注配置 =====

/** 标注路径描边颜色 */
export const MARKER_STROKE = '#ff00007f';

/** 标注路径描边宽度（px） */
export const MARKER_STROKE_WIDTH = 2;

/** 标注路径填充色 */
export const MARKER_FILL = 'none';

/**
 * 标注文字的四行角色（自上而下的排列顺序，也是 `mark.json` 里的字段名）：
 * `text` 主文字（1 行）/ `subtext` 副文字（1 行）/ `trans` 主文字的翻译（**数组，每种语言一行**）/
 * `subtextTrans` 副文字的翻译（同样是数组）。
 */
export type MarkerTextRole = 'text' | 'subtext' | 'trans' | 'subtextTrans';

/** 标注文字的两种类别：大标识 / 小标识 */
export type MarkerSize = 'large' | 'small';

/** 每类标识的四行字号（px），键为 `MarkerTextRole`（同一角色的多行共用同一字号） */
export const MARKER_FONT_SIZES: Record<MarkerSize, Record<MarkerTextRole, number>> = {
  large: { text: 32, subtext: 24, trans: 24, subtextTrans: 16 },
  small: { text: 24, subtext: 16, trans: 16, subtextTrans: 12 },
};

/** 标注文字默认颜色 */
export const MARKER_TEXT_FILL = '#777';

/** 重点标注（`emphasis: true`）的文字颜色 */
export const MARKER_EMPHASIS_FILL = '#3f3f3f';

/** 深色模式下重点标注的文字颜色（浅色那支贴在深底上看不见，换成浅灰） */
export const MARKER_EMPHASIS_FILL_DARK = '#aeaeae';

/** 标注文字默认字体 */
export const MARKER_FONT_FAMILY = 'sans-serif';

/** 标注文字的日语字体（标识上 `ja: true` 时使用）—— 不带衬线，与地图上的稻妻站名标签不同 */
export const MARKER_FONT_FAMILY_JA = '"Noto Sans JP", sans-serif';

/**
 * 标注文字每一行之间额外增加的间距（数据单位）。
 * 第 n 行的 y = 第 n-1 行的 y + **第 n 行自己的**字号 / `BLOCK_SIZE` + 本间距 —— 逐行累加，
 * 所以 `text` 之后的每一行都会再多 0.1。
 */
export const MARKER_LINE_GAP = 0.1;

// ===== 网格配置 =====

/**
 * 背景网格线的步长（px）。网格就是数据坐标单位本身，所以**必须**等于 `BLOCK_SIZE`，
 * 否则网格线与站点 / 线路 / 鼠标坐标读数不再对齐 —— 这里直接派生，不再单独写死一个数。
 */
export const gridStep = BLOCK_SIZE;

// ===== 特殊线路配置 =====

/** 轮渡线路颜色 */
export const FERRY_COLOR = '#0d47a17f';

/** 轮渡线路高亮色（无透明通道版本） */
export const FERRY_COLOR_HIGHLIGHT = '#0d47a1';

/** 轮渡线路描边宽度（px） */
export const FERRY_LINE_WIDTH = 2;

/** 轮渡线路虚线样式 */
export const FERRY_DASH = '8,5';

/** 同站点连接线颜色 */
export const SAME_COLOR = '#7777';

/** 同站点连接线描边宽度（px） */
export const SAME_LINE_WIDTH = 2;

// ===== 归属边界配置 =====

/** 国家/地区边界线颜色 */
export const NATION_BORDER_COLOR = '#7f7f7f';

/** 国家/地区边界线宽度（px） */
export const NATION_BORDER_WIDTH = 2.5;

/** 区域边界线颜色 */
export const AREA_BORDER_COLOR = '#7f7f7f';

/** 区域边界线宽度（px） */
export const AREA_BORDER_WIDTH = 1.25;

/** 归属边界的平滑方式（几何层的全部选项） */
export type BorderSmoothing = 'none' | 'round' | 'flow';

/**
 * 归属边界的**初始**平滑方式（地图控制面板上的按钮可以在运行时临时改，见 `useBorderSmoothing.ts`）：
 * - `none`：精确折线（Voronoi 顶点处的真实折角，直线段一点不动）；
 * - `round`：只在转角做统一半径的圆角，直线段仍然精确；
 * - `flow`：整条链走一遍向心 Catmull–Rom —— 最圆滑，但节点间距悬殊处会冲出真实边界几十像素。
 */
export const BORDER_SMOOTHING: BorderSmoothing = 'flow';

/** 转角圆角半径（px），仅 `round` 模式使用；相邻段太短时自动收到段长的一半，避免圆角互相重叠 */
export const BORDER_CORNER_RADIUS = 6;

/** 区域边界线虚线样式（空字符串 = 实线） */
export const AREA_BORDER_DASH = '5,4';

// ===== 信息面板配置 =====

/** 「时刻表发车」每条线路默认显示的车次行数，超过此数即折叠，可展开 */
export const TIMETABLE_COLLAPSED_ROWS = 5;
