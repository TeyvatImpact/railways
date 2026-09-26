// /display 页的变体选择：每条线路只画一条条带 —— 站数最多的那个变体；
// 其余变体（小交路 / 支线）在条带上不做任何标记。

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
