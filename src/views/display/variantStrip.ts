// /display 页的变体选择：每条线路画一条条带 —— 站数最多的那个变体作主线；
// 与主线「同前缀之后分岔」的变体（支线）挑出来，交给 stripModel 画成主线下方的一条支线车道。

export interface RawVariant {
  name?: string;
  nameEn?: string;
  stations: string[];
}

/** 只画站数最多的变体；并列时取靠前的（即数据里靠前的那个，通常是全线交路） */
export function pickDisplayVariant<T extends RawVariant>(
  variants: T[],
): { variant: T; index: number } {
  let best = 0;
  for (let i = 1; i < variants.length; i++) {
    if (variants[i].stations.length > variants[best].stations.length) best = i;
  }
  return { variant: variants[best], index: best };
}

/** 从主线中途分出去、之后再无共有站的支线 */
export interface DivergentBranch<T extends RawVariant> {
  variant: T;
  index: number;
  /** 分歧站：主线上最后一个与支线共有的站 */
  junctionId: string;
  /** 支线的独占站 id（按支线自身顺序，不含分歧站） */
  stationIds: string[];
}

/**
 * 把一条线路的变体拆成「主线」+「支线」：
 * 主线 = `pickDisplayVariant`；支线 = 与主线有非空公共前缀、且前缀之后还有独占站的变体。
 * 公共前缀长度 0（从起点就与主线不同，如 L2 的小交路）或 = 变体全长（纯前缀，如 A / M1 的小交路）都不算支线。
 */
export function splitVariants<T extends RawVariant>(
  variants: T[],
): {
  primary: { variant: T; index: number };
  branches: DivergentBranch<T>[];
} {
  const primary = pickDisplayVariant(variants);
  const main = primary.variant.stations;
  const branches: DivergentBranch<T>[] = [];

  variants.forEach((variant, index) => {
    if (index === primary.index) return;
    const stations = variant.stations;
    let k = 0;
    while (k < stations.length && k < main.length && stations[k] === main[k]) k++;
    if (k === 0 || k === stations.length) return;
    branches.push({ variant, index, junctionId: main[k - 1], stationIds: stations.slice(k) });
  });

  return { primary, branches };
}
