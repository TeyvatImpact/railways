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

export const FONT_EN = 'Barlow';
export const FONT_ZH = 'Noto Serif SC';

export interface Box {
  id: string;
  w: number;
  h: number;
  cx: number;
  cy: number;
  left: number;
  top: number;
  cnX: number;
  zhX: number;
  enX: number;
  name: string;
  nameZh: string;
  nameEn: string;
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
  cnX: number;
  zhX: number;
  enX: number;
  name: string;
  nameZh: string;
  nameEn: string;
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

// ---- station label boxes ----

function computeAllBoxes(fsCN_: number, fsEN_: number): Box[] {
  return allStations.map((s) => {
    const ff = s.fontFamily;
    const fZh = s.fontFamilyZh || FONT_ZH;
    const hasZh = !!s.nameZh;
    const wCN = measureText(s.name, fsCN_, true, ff);
    const wZh = hasZh ? measureText(s.nameZh!, fsEN_, true, fZh) : 0;
    const wEN = measureText(s.nameEn, fsEN_, true, FONT_EN);
    const w = Math.max(wCN, wZh, wEN) + pad * 2;
    const h = hasZh
      ? fsCN_ * 1.2 + textGap + fsEN_ * 1.2 + textGap + fsEN_ * 1.2
      : fsCN_ * 1.2 + textGap + fsEN_ * 1.2;
    const dir = s.labelDir || 'R';
    const { left, top } = getLabelPosition(s.cx, s.cy, w, h, dir);
    const textAreaStart = left + pad;
    const textAreaWidth = Math.max(wCN, wZh, wEN);
    return {
      id: s.id,
      w,
      h,
      cx: s.cx,
      cy: s.cy,
      left,
      top,
      cnX: textAreaStart + (textAreaWidth - wCN) / 2,
      zhX: hasZh ? textAreaStart + (textAreaWidth - wZh) / 2 : textAreaStart,
      enX: textAreaStart + (textAreaWidth - wEN) / 2,
      name: s.name,
      nameZh: s.nameZh || '',
      nameEn: s.nameEn,
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
      const hasZh = !!line.nameZh;
      const wCN = measureText(line.name, fCN, true, ff);
      const wZh = hasZh ? measureText(line.nameZh!, fEN, true, fZh) : 0;
      const wEN = measureText(line.nameEn, fEN, true, FONT_EN);
      const w = Math.max(wCN, wZh, wEN) + pad * 2 + 6;
      const h = hasZh
        ? fCN * 1.2 + textGap + fEN * 1.2 + textGap + fEN * 1.2
        : fCN * 1.2 + textGap + fEN * 1.2;
      const { left, top } = getLabelPosition(st.cx, st.cy, w, h, dir || 'R');
      const textAreaStart = left + pad + 6;
      const textAreaWidth = Math.max(wCN, wZh, wEN);
      boxes.push({
        id: `line-label-${line.id}-${sid}`,
        lineId: line.id,
        w,
        h,
        cx: st.cx,
        cy: st.cy,
        left,
        top,
        cnX: textAreaStart + (textAreaWidth - wCN) / 2,
        zhX: hasZh ? textAreaStart + (textAreaWidth - wZh) / 2 : textAreaStart,
        enX: textAreaStart + (textAreaWidth - wEN) / 2,
        name: line.name,
        nameZh: line.nameZh || '',
        nameEn: line.nameEn,
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
