import { ref } from 'vue';

/**
 * 右侧面板「选中了什么」的唯一来源：站点信息 / 线路信息 / 什么都没选。
 *
 * 地图（点击站点、点击线路、点击空白）与搜索框都写它，右侧面板与地图高亮都读它 ——
 * 这样「点地图」和「点搜索结果」走的是同一条路径，高亮与信息面板永远一致。
 */
export type Selection = { kind: 'station'; id: string } | { kind: 'line'; id: string };

export const selection = ref<Selection | null>(null);

export function selectStation(id: string) {
  selection.value = { kind: 'station', id };
}

export function selectLine(id: string) {
  selection.value = { kind: 'line', id };
}

export function clearSelection() {
  selection.value = null;
}
