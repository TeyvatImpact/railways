import { ref } from 'vue';

/** `straight` = 原版直角/直线连接；`curve` = Catmull-Rom 平滑曲线连接 */
export type RenderMode = 'straight' | 'curve';

/**
 * 线路连接方式。曲线模式已完整实现但**当前未启用**：默认恒为 `straight`，
 * 不做持久化，界面上也没有任何切换入口。
 * 需要启用时（例如加进 dev 面板或给 MapControls 加回按钮）调用 `toggleRenderMode()`。
 */
const renderMode = ref<RenderMode>('straight');

export function useRenderMode() {
  function toggleRenderMode() {
    renderMode.value = renderMode.value === 'straight' ? 'curve' : 'straight';
  }

  return { renderMode, toggleRenderMode };
}
