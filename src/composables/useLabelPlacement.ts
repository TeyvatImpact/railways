import { ref, computed } from 'vue';
import { prepareWithSegments, measureNaturalWidth } from '@chenglou/pretext';
import type { PreparedTextWithSegments } from '@chenglou/pretext';
import {
  pad,
  fsCNSmall,
  fsENSmall,
  gap,
  textGap,
  stationR,
  gridStep,
} from '../config/render.config';
import {
  svgWidth,
  svgHeight,
  stations as allStations,
  transferStationIds as allTransferIds,
  stationMap,
  lines as allLines,
} from './useMapData';
import { nameLabelLines } from './stationNames';

export const FONT_EN = 'Barlow';
export const FONT_ZH = 'Noto Serif SC';

/** 标签的样式档：主行（大字号 + 区域字体）/ 中文小字 / 英文小字 */
type LabelKind = 'name' | 'zh' | 'en';

/** 标签的一行（坐标与样式档已定） */
export interface LabelBoxLine {
  /** v-for 的 key：站点标签用 locale，线路标签用 'name' | 'zh' | 'en' */
  key: string;
  text: string;
  kind: LabelKind;
  x: number;
  y: number;
}

export interface Box {
  id: string;
  w: number;
  h: number;
  cx: number;
  cy: number;
  left: number;
  top: number;
  lines: LabelBoxLine[];
  fontFamily: string;
  fontFamilyZh: string;
  fontFamilyEn: string;
  fCN: number;
  fEN: number;
}

export interface LineLabelBox {
  id: string;
  lineId: string;
  w: number;
  h: number;
  cx: number;
  cy: number;
  left: number;
  top: number;
  lines: LabelBoxLine[];
  color: string;
  fontFamily: string;
  fontFamilyZh: string;
  fontFamilyEn: string;
  fCN: number;
  fEN: number;
}

const prepCache = new Map<string, PreparedTextWithSegments>();

/** 用 @chenglou/pretext 量一行文字的宽度（px）。带缓存；字体未加载时用当前可用的度量 */
export function measureText(
  text: string,
  fontSize: number,
  bold: boolean,
  fontFamily = 'sans-serif',
): number {
  const font = `${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
  const key = `${text}|${font}`;
  if (!prepCache.has(key)) prepCache.set(key, prepareWithSegments(text, font));
  return measureNaturalWidth(prepCache.get(key)!);
}

const dirMap: Record<string, { dx: number; dy: number }> = {
  R: { dx: 1, dy: 0 },
  RT: { dx: 1, dy: -1 },
  T: { dx: 0, dy: -1 },
  LT: { dx: -1, dy: -1 },
  L: { dx: -1, dy: 0 },
  LB: { dx: -1, dy: 1 },
  B: { dx: 0, dy: 1 },
  RB: { dx: 1, dy: 1 },
};

function getLabelPosition(cx: number, cy: number, w: number, h: number, dir: string) {
  const d = dirMap[dir] || dirMap.R;
  const left = cx + d.dx * (stationR + gap) - (d.dx === 0 ? w / 2 : d.dx > 0 ? 0 : w);
  const top = cy + d.dy * (stationR + gap) - (d.dy === 0 ? h / 2 : d.dy > 0 ? 0 : h);
  return { left, top };
}

/** 多行标签的每行基线：第 i 行 = top + Σ_{k<i}(1.2·size_k + textGap) + 1.1·size_i，最后一行固定 top + h - pad
 *  （等价于旧实现里三行的 top + fCN*1.1 / top + fCN*1.2 + textGap + fEN*1.1 / top + h - pad） */
function lineBaselines(sizes: number[], top: number, h: number): number[] {
  const out: number[] = [];
  let cursor = 0;
  sizes.forEach((size, i) => {
    out.push(i === sizes.length - 1 ? top + h - pad : top + cursor + 1.1 * size);
    cursor += 1.2 * size + textGap;
  });
  return out;
}

// ---- station label boxes ----

function computeAllBoxes(fsCN_: number, fsEN_: number): Box[] {
  return allStations.map((s) => {
    const ff = s.fontFamily;
    const fZh = s.fontFamilyZh || FONT_ZH;
    const lines = nameLabelLines(s.names, s.primaryLang);
    const sizeOf = (kind: LabelKind) => (kind === 'name' ? fsCN_ : fsEN_);
    const fontOf = (kind: LabelKind) => (kind === 'name' ? ff : kind === 'zh' ? fZh : FONT_EN);
    const widths = lines.map((l) => measureText(l.text, sizeOf(l.kind), true, fontOf(l.kind)));
    const w = Math.max(...widths) + pad * 2;
    const h =
      lines.reduce((sum, l) => sum + 1.2 * sizeOf(l.kind), 0) + textGap * (lines.length - 1);
    const dir = s.labelDir || 'R';
    const { left, top } = getLabelPosition(s.cx, s.cy, w, h, dir);
    const textAreaStart = left + pad;
    const textAreaWidth = Math.max(...widths);
    const baselines = lineBaselines(
      lines.map((l) => sizeOf(l.kind)),
      top,
      h,
    );
    return {
      id: s.id,
      w,
      h,
      cx: s.cx,
      cy: s.cy,
      left,
      top,
      lines: lines.map((l, i) => ({
        key: l.locale,
        text: l.text,
        kind: l.kind,
        x: textAreaStart + (textAreaWidth - widths[i]) / 2,
        y: baselines[i],
      })),
      fontFamily: ff,
      fontFamilyZh: fZh,
      fontFamilyEn: FONT_EN,
      fCN: fsCN_,
      fEN: fsEN_,
    };
  });
}

// ---- line label boxes ----

function computeLineLabels(): LineLabelBox[] {
  const boxes: LineLabelBox[] = [];
  const fCN = fsCNSmall;
  const fEN = fsENSmall;

  for (const line of allLines) {
    if (!line.lineLabels) continue;
    for (const [sid, dir] of line.lineLabels) {
      const st = stationMap.get(sid);
      if (!st) continue;
      const ff = line.fontFamily || 'sans-serif';
      const fZh = line.fontFamilyZh || FONT_ZH;
      const lines = nameLabelLines(line.names, line.primaryLang);
      // 线路标签比站点标签在左上多留 6px（保持旧排版）
      const xOffset = 6;
      const sizeOf = (kind: LabelKind) => (kind === 'name' ? fCN : fEN);
      const fontOf = (kind: LabelKind) => (kind === 'name' ? ff : kind === 'zh' ? fZh : FONT_EN);
      const widths = lines.map((l) => measureText(l.text, sizeOf(l.kind), true, fontOf(l.kind)));
      const w = Math.max(...widths) + pad * 2 + xOffset;
      const h =
        lines.reduce((sum, l) => sum + 1.2 * sizeOf(l.kind), 0) + textGap * (lines.length - 1);
      const { left, top } = getLabelPosition(st.cx, st.cy, w, h, dir || 'R');
      const textAreaStart = left + pad + xOffset;
      const textAreaWidth = Math.max(...widths);
      const baselines = lineBaselines(
        lines.map((l) => sizeOf(l.kind)),
        top,
        h,
      );
      boxes.push({
        id: `line-label-${line.id}-${sid}`,
        lineId: line.id,
        w,
        h,
        cx: st.cx,
        cy: st.cy,
        left,
        top,
        lines: lines.map((l, i) => ({
          key: l.locale,
          text: l.text,
          kind: l.kind,
          x: textAreaStart + (textAreaWidth - widths[i]) / 2,
          y: baselines[i],
        })),
        color: line.color,
        fontFamily: ff,
        fontFamilyZh: fZh,
        fontFamilyEn: FONT_EN,
        fCN,
        fEN,
      });
    }
  }
  return boxes;
}

// ---- grid ----

const gridX = computed(() => {
  const a: number[] = [];
  for (let x = 0; x <= svgWidth; x += gridStep) a.push(x);
  return a;
});
const gridY = computed(() => {
  const a: number[] = [];
  for (let y = 0; y <= svgHeight; y += gridStep) a.push(y);
  return a;
});

export function useLabelPlacement() {
  const revision = ref(0);

  if (typeof document !== 'undefined' && document.fonts) {
    document.fonts.ready.then(() => {
      prepCache.clear();
      revision.value++;
    });
  }

  const allBoxes = computed(() => {
    void revision.value;
    return computeAllBoxes(fsCNSmall, fsENSmall);
  });
  const allLineLabels = computed(() => {
    void revision.value;
    return computeLineLabels();
  });

  const boxMap = computed(() => new Map(allBoxes.value.map((b) => [b.id, b])));

  const visibleStations = allStations;

  const labelBoxes = computed(() => {
    const map = boxMap.value;
    return allStations.map((s) => map.get(s.id)).filter((b): b is Box => !!b);
  });

  const leaderLines = computed(() =>
    labelBoxes.value.map((b) => {
      const cx = b.left + b.w / 2;
      const cy = b.top + b.h / 2;
      const dx = b.cx - cx;
      const dy = b.cy - cy;
      if (dx === 0 && dy === 0) return { id: b.id, x1: b.cx, y1: b.cy, x2: b.cx, y2: b.cy };
      const sx = dx === 0 ? Infinity : b.w / 2 / Math.abs(dx);
      const sy = dy === 0 ? Infinity : b.h / 2 / Math.abs(dy);
      const s = Math.min(sx, sy);
      return { id: b.id, x1: b.cx, y1: b.cy, x2: cx + dx * s, y2: cy + dy * s };
    }),
  );

  const lineLabels = computed(() => allLineLabels.value);

  const lineLeaderLines = computed(() =>
    lineLabels.value.map((b) => {
      const cx = b.left + b.w / 2;
      const cy = b.top + b.h / 2;
      const dx = b.cx - cx;
      const dy = b.cy - cy;
      if (dx === 0 && dy === 0) return { id: b.id, x1: b.cx, y1: b.cy, x2: b.cx, y2: b.cy };
      const sx = dx === 0 ? Infinity : b.w / 2 / Math.abs(dx);
      const sy = dy === 0 ? Infinity : b.h / 2 / Math.abs(dy);
      const s = Math.min(sx, sy);
      return { id: b.id, x1: b.cx, y1: b.cy, x2: cx + dx * s, y2: cy + dy * s };
    }),
  );

  return {
    visibleStations,
    labelBoxes,
    leaderLines,
    lineLabels,
    lineLeaderLines,
    gridX,
    gridY,
  };
}
