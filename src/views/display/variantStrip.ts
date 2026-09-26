// /display 页的变体选择：每条线路只画一条条带（站数最多的变体），其余变体中构成本条带连续区间的
// 用一段带名字的短线标出（大小交路）；构成分叉的（真正的支线）本次不画。

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

/**
 * 其余变体中，站点在绘制变体里构成连续区间的那些 → `{ name, start, end }`（下标针对绘制变体的站序）。
 * 跳过：无名变体、绘制变体自身、有站点不在绘制变体里的（分叉）、下标不连续的。
 */
export function contiguousSpans(
  drawn: string[],
  variants: RawVariant[],
  drawnIndex: number,
): { name: string; start: number; end: number }[] {
  const position = new Map(drawn.map((id, i) => [id, i]));
  const spans: { name: string; start: number; end: number }[] = [];

  for (let i = 0; i < variants.length; i++) {
    if (i === drawnIndex) continue;
    const variant = variants[i];
    if (!variant.name || variant.stations.length < 2) continue;

    const indexes: number[] = [];
    for (const sid of variant.stations) {
      const pos = position.get(sid);
      if (pos === undefined) break;
      indexes.push(pos);
    }
    if (indexes.length !== variant.stations.length) continue;

    const start = Math.min(...indexes);
    const end = Math.max(...indexes);
    if (end - start + 1 !== indexes.length) continue;

    spans.push({ name: variant.name, start, end });
  }

  return spans;
}
