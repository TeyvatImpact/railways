/**
 * 时间格式化 —— 只用在展示层。
 *
 * 底层的时间（`pairCost` / `useRouting` 的累计）一律保持原始小数、不做任何化整；
 * 只有在这里、真正要上屏时才四舍五入到整秒，再按下列形式拼字符串。
 */

/** 分钟 → 整秒（非有限值或非正数按 0 处理） */
function toSeconds(minutes: number): number {
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0;
}

/**
 * 完整形式，按量级取三种之一：
 *   `[h] 时 [m] 分`（≥ 1 小时，不带秒）/ `[m] 分 [s] 秒`（≥ 1 分钟）/ `[s] 秒`。
 * 例：`1 时 5 分`、`5 分 30 秒`、`30 秒`。
 */
export function formatDuration(minutes: number): string {
  const total = toSeconds(minutes);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} 时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

/**
 * 时钟小字形式（**取整到分**）：`HH:mm`；跨天（绝对分钟数 ≥ 1440）加「次日 」前缀。
 * 用于站点 / 列车的到发时刻 —— 数据与派生都按分钟，秒只影响取整。
 */
export function formatClock(minutes: number): string {
  const rounded = Math.round(minutes);
  const day = Math.floor(rounded / 1440);
  const inDay = ((rounded % 1440) + 1440) % 1440;
  const text = `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`;
  return day > 0 ? `次日 ${text}` : text;
}

/**
 * 线路图小字形式（分 / 秒记号，**不使用小时**，所以分钟可以是 ≥ 60 的数）：
 *   `[m]'[s]"`；整分时省掉秒 → `[m]'`；不足 1 分钟 → `[s]"`。
 * 例：`5'30"`、`5'`、`30"`。
 */
export function formatDurationShort(minutes: number): string {
  const total = toSeconds(minutes);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}"`;
  return s === 0 ? `${m}'` : `${m}'${s}"`;
}
