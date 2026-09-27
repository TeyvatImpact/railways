// 时刻表 / 排班的常量（`composables/timetable.ts` 的 `dwell` 与 `composables/trainSchedule.ts` 的合成）：
// 只写 `timetable.interval` 的变体没有逐条发车信息，列车由这些常量约束的贪心算法合成。
//
// 硬性验收条件（容差系数是数据语义的一部分）：
//   对每个车站 S、每条服务它的线路 L、每个方向 d，设 m = 该站该线在时刻 t 的**合并间隔**
//   （该线在该站相邻区间各变体 interval 的最小值，与站点面板「间隔时间」同一口径），
//   则「上一班到站时刻 = t」到「下一班到站时刻」的间隔必须 ≤ min(m × GAP_FACTOR, m + GAP_SLACK_MINUTES)。
//   只在「上一班到站时刻落在覆盖窗口内（m 有限）」时有义务；窗口开始到首班车之间没有义务。
//   不要求最优：满足上限 + 尽量均匀 + 尽量少用车即可。

/**
 * 停站时长（分钟）的缺省值：变体没写 `dwell`、或写了 `default` 之外没覆盖到的站，都用它。
 * 数据里的 `dwell` 是逐站覆盖，所以这条常量对所有列车（含写了 `departures` 的）都生效 ——
 * 列车到发时刻、折返停留、车站面板的到发行都按它算。
 */
export const DEFAULT_DWELL_MINUTES = 1;

/** 容差系数：下一班最晚可以晚到 `间隔 × GAP_FACTOR` */
export const GAP_FACTOR = 1.5;

/** 容差兜底：间隔很小时至少允许晚到 `间隔 + GAP_SLACK_MINUTES` 分钟 */
export const GAP_SLACK_MINUTES = 10;

/** 合成单个方向班次的循环上限（防御性，正常远不会触及） */
export const MAX_SYNTHETIC_TRIPS = 5000;

/** 单个方向最多补几趟「收官车」（空档补车：某站合并间隔压着期限、池子里却没有候选时用） */
export const MAX_TOP_UPS = 200;
