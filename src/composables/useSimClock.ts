import { computed, ref } from 'vue';

/**
 * 模拟时钟的模块级单例：地图上的列车按它定位，所以状态不能留在 `SimClock.vue` 组件里。
 * 时钟初值 = 本机时间，播放时按现实时间 × `rate` 推进，走到 24 小时回绕。
 */

/** 倍速档位（相对现实时间） */
export const RATES = [1, 10, 60, 840];
/** 当前「时钟时间」：一天内的秒数（含小数；初始 = 本机时间） */
export const secondsOfDay = ref(localSeconds());
export const playing = ref(true);
export const rate = ref(1);
/** 模拟时刻换算成分钟（含小数，[0, 1440)）——列车模型按它定位 */
export const minutesOfDay = computed(() => secondsOfDay.value / 60);

function localSeconds(): number {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

let raf = 0;
let last = 0;

/** 每帧按现实流逝时间推进时钟；暂停时只更新时间基准，恢复后不跳变 */
function frame(t: number) {
  if (last) {
    const dt = (t - last) / 1000;
    if (playing.value) secondsOfDay.value = (secondsOfDay.value + dt * rate.value) % 86400;
  }
  last = t;
  raf = requestAnimationFrame(frame);
}

/** 启动模块级时钟：幂等，非浏览器环境（Node 冒烟脚本）直接跳过 */
export function useSimClock() {
  if (raf === 0 && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
  return { secondsOfDay, playing, rate, minutesOfDay };
}
