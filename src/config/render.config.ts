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

/** 数据坐标中每 1 单位对应的像素数 */
export const BLOCK_SIZE = 50;

/** 边界留白（数据坐标单位），用于计算 SVG 尺寸时的额外边距 */
export const margin = 2;

// ===== 标注配置 =====

/** 标注路径描边颜色 */
export const MARKER_STROKE = '#ff00007f';

/** 标注路径描边宽度（px） */
export const MARKER_STROKE_WIDTH = 2;

/** 标注路径填充色 */
export const MARKER_FILL = 'none';

/** 标注文字字号（px） */
export const MARKER_FONT_SIZE = 32;

/** 标注文字颜色 */
export const MARKER_TEXT_FILL = '#777';

/** 标注文字字体 */
export const MARKER_FONT_FAMILY = 'sans-serif';

// ===== 网格配置 =====

/** 背景网格线的步长（px） */
export const gridStep = 50;

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
