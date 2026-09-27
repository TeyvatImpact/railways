import { ref } from 'vue';
import { BORDER_SMOOTHING, type BorderSmoothing } from '../config/render.config';

/** 控制面板上循环切换的顺序 */
const CYCLE: BorderSmoothing[] = ['flow', 'round', 'none'];

/**
 * 归属边界的平滑方式（运行时状态，**只对本会话有效、不落盘**）。
 *
 * 初值取自 `render.config.ts` 的 `BORDER_SMOOTHING`；地图左下角的控制面板上有一个临时按钮
 * 可以循环切换，用来现场比较三种观感（几何本身不变，只是重新拼 path 字符串）。
 */
const borderSmoothing = ref<BorderSmoothing>(BORDER_SMOOTHING);

export function useBorderSmoothing() {
  function cycleBorderSmoothing() {
    const next = (CYCLE.indexOf(borderSmoothing.value) + 1) % CYCLE.length;
    borderSmoothing.value = CYCLE[next];
  }

  return { borderSmoothing, cycleBorderSmoothing };
}
