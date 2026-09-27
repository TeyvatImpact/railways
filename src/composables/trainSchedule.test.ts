// 排班合成与列车模型的回归测试（`pnpm test`）：
// 只写 `timetable.interval` 的变体由 `trainSchedule.ts` 合成班次，验收条件、封段、结构、
// 覆盖与「下一班」都得在真实数据上成立 —— 改合成算法或改数据后跑它，别靠肉眼。
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_DWELL_MINUTES, MAX_SYNTHETIC_TRIPS } from '../config/schedule.config';
import { formatClock } from './formatTime';
import { nextArrivalsAt } from './stationTimetable';
import {
  bandCovers,
  closedAt,
  clockOf,
  dwellAt,
  minuteOf,
  type TimetableIntervalBand,
} from './timetable';
import { dwellMinutes, stopArrival, stopLeave, trainRuns, type TrainRun } from './trainRuns';
import { gapLimitOf, lineStationInterval, syntheticNotes } from './trainSchedule';
import { lines, stationMap, stations } from './useMapData';

/** 该方向的完整站序 */
function orderOf(run: TrainRun): string[] {
  return run.dep.direction === 'up' ? run.variant.stations : [...run.variant.stations].reverse();
}

describe('时刻表 / 排班的纯函数', () => {
  it('验收上限 = min(m × 1.5, m + 10)，不开行 = 无穷', () => {
    assert.equal(gapLimitOf(30), 40, 'm=30：min(45, 40)');
    assert.equal(gapLimitOf(4), 6, 'm=4：间隔很小时按倍数算');
    assert.equal(gapLimitOf(10), 15);
    assert.equal(gapLimitOf(Infinity), Infinity);
  });

  it('分钟 ↔ HH:mm：小数分钟向下取整到分', () => {
    assert.equal(clockOf(0), '00:00');
    assert.equal(clockOf(503), '08:23');
    assert.equal(clockOf(503.9), '08:23');
    assert.equal(clockOf(1440), '00:00');
    assert.equal(minuteOf('08:23'), 503);
    assert.equal(minuteOf('24:00'), 1440);
  });

  it('显式 null 时段封掉区间：按数组顺序覆盖，与「没有时段覆盖」区分开', () => {
    const bands: (TimetableIntervalBand | null)[] = [
      { from: '06:00', to: '24:00', interval: 20 },
      { from: '18:00', to: '24:00', interval: null },
    ];
    const segment: [string, string] = ['a', 'b'];
    assert.equal(closedAt(bands, '07:00', segment), false);
    assert.equal(closedAt(bands, '18:30', segment), true);
    assert.equal(closedAt(bands, '05:00', segment), false, '时段之外不算封掉');
    assert.equal(closedAt([], '07:00', segment), false);
    assert.equal(bandCovers({ from: '18:00', to: '06:00', interval: 30 }, minuteOf('02:00')), true);
  });

  it('停站时间：逐站覆盖 → default → 缺省常量', () => {
    assert.equal(dwellAt(undefined, 'x'), DEFAULT_DWELL_MINUTES);
    assert.equal(dwellAt({ default: 3 }, 'x'), 3);
    assert.equal(dwellAt({ default: 3, stations: { x: 7 } }, 'x'), 7);
    assert.equal(dwellAt({ default: 3, stations: { x: 7 } }, 'y'), 3, '没逐站覆盖就用 default');
  });
});

describe('停站（真实数据）', () => {
  it('每站开出 − 到站 = 该站停站；没写 dwell 的变体用缺省常量', () => {
    let checked = 0;
    for (const run of trainRuns) {
      const written = run.variant.timetable.dwell !== undefined;
      for (let i = 1; i < run.stops.length; i++) {
        const stop = run.stops[i];
        const dwell = stopLeave(run, i) - (stop.arrival ?? stopArrival(run, i));
        assert.ok(
          Math.abs(dwell - dwellMinutes(run, stop.stationId)) < 1e-9,
          `${run.id} 在 ${stop.stationId} 的停站与 dwellMinutes 不一致`,
        );
        if (!written)
          assert.ok(
            Math.abs(dwell - DEFAULT_DWELL_MINUTES) < 1e-9,
            `${run.id} ${stop.stationId} 停站 ${dwell}`,
          );
        checked++;
      }
    }
    assert.ok(checked > 10000, `只检查了 ${checked} 处停站`);
  });
});

describe('合成班次（真实数据）', () => {
  /** 每个 (线路, 方向, 站) 的到站时刻（升序） */
  const arrivals = new Map<string, Map<string, number[]>>();
  for (const run of trainRuns) {
    const key = `${run.line.id}|${run.dep.direction}`;
    let byStation = arrivals.get(key);
    if (!byStation) arrivals.set(key, (byStation = new Map()));
    for (let i = 0; i < run.stops.length; i++) {
      const list = byStation.get(run.stops[i].stationId);
      if (list) list.push(stopArrival(run, i));
      else byStation.set(run.stops[i].stationId, [stopArrival(run, i)]);
    }
  }
  for (const list of arrivals.values())
    for (const times of list.values()) times.sort((a, b) => a - b);

  it('硬性验收条件：相邻到站间隔 ≤ min(m × 1.5, m + 10)', () => {
    let pairs = 0;
    let worst = 0;
    let worstWhere = '';
    for (const [key, byStation] of arrivals) {
      const [lineId] = key.split('|');
      const line = lines.find((l) => l.id === lineId);
      assert.ok(line);
      for (const [stationId, times] of byStation) {
        for (let i = 1; i < times.length; i++) {
          const limit = gapLimitOf(lineStationInterval(line, stationId, times[i - 1]));
          if (!Number.isFinite(limit)) continue;
          pairs++;
          const gap = times[i] - times[i - 1];
          if (gap / limit > worst) {
            worst = gap / limit;
            worstWhere = `${lineId} ${stationId} ${key.split('|')[1]}`;
          }
          assert.ok(gap <= limit + 1e-9, `${lineId} ${stationId}：间隔 ${gap} > 上限 ${limit}`);
        }
      }
    }
    assert.ok(pairs > 10000, `只检查了 ${pairs} 对相邻到站`);
    assert.ok(worst <= 1 + 1e-9, `最大占用比 ${worst}（${worstWhere}）`);
  });

  it('没有列车落在显式封掉的区间里', () => {
    for (const run of trainRuns) {
      const bands = run.variant.timetable.interval;
      if (bands === undefined) continue;
      for (let i = 0; i + 1 < run.stops.length; i++) {
        const segment: [string, string] = [run.stops[i].stationId, run.stops[i + 1].stationId];
        for (const at of [stopLeave(run, i), stopArrival(run, i + 1)])
          assert.equal(
            closedAt(bands, clockOf(at), segment),
            false,
            `${run.id} ${segment.join('→')} @ ${clockOf(at)}`,
          );
      }
    }
  });

  it('结构：首站只有开出、末站只有到站、时刻单调、终点站收尾不早于到站', () => {
    for (const run of trainRuns) {
      const order = orderOf(run);
      const first = run.stops[0];
      const last = run.stops[run.stops.length - 1];
      assert.equal(first.arrival, undefined, `${run.id} 首站不该有到站时刻`);
      assert.equal(typeof first.departure, 'number', `${run.id} 首站缺开出时刻`);
      assert.ok(order.includes(first.stationId), `${run.id} 始发站不在站序里`);
      // 折返车开回发车站，末站是发车站自己；其余车末站 = 该方向终点
      assert.equal(
        last.stationId,
        run.dep.turnback ? first.stationId : order[order.length - 1],
        `${run.id} 末站不对`,
      );
      assert.ok(last.arrival !== undefined, `${run.id} 末站缺到站时刻`);
      assert.ok(
        run.end + 1e-9 >= stopArrival(run, run.stops.length - 1),
        `${run.id} end 早于末站到站`,
      );
      for (let i = 1; i < run.stops.length; i++) {
        assert.ok(
          stopArrival(run, i) + 1e-9 >= stopLeave(run, i - 1),
          `${run.id} 到站时刻早于上一站开出`,
        );
        assert.ok(
          stopLeave(run, i) + 1e-9 >= stopArrival(run, i),
          `${run.id} 开出时刻早于本站到站`,
        );
      }
      const maxStops = run.dep.turnback ? order.length * 2 : order.length;
      assert.ok(run.stops.length <= maxStops, `${run.id} 停站数超过站序`);
    }
  });

  it('覆盖：每个只写间隔的变体都有班次，班次首站在其行程里', () => {
    for (const line of lines) {
      line.variants.forEach((variant, variantIndex) => {
        if (variant.timetable.interval === undefined) return;
        const list = trainRuns.filter(
          (run) => run.line === line && run.variantIndex === variantIndex,
        );
        assert.ok(list.length > 0, `${line.id}#${variantIndex} 没有任何班次`);
        for (const run of list) assert.ok(orderOf(run).includes(run.stops[0].stationId));
      });
    }
  });

  it('车次号：每条线路内唯一且非空', () => {
    const seen = new Map<string, Set<string>>();
    for (const run of trainRuns) {
      assert.ok(run.number.length > 0, `${run.id} 没有车次号`);
      let set = seen.get(run.line.id);
      if (!set) seen.set(run.line.id, (set = new Set()));
      assert.equal(set.has(run.number), false, `车次号重复：${run.line.id} ${run.number}`);
      set.add(run.number);
    }
  });

  it('合成的规模与记录：班次上限之内，且没有「承诺补不上」的记录', () => {
    assert.ok(trainRuns.length > 3000 && trainRuns.length < 20000, `列车 ${trainRuns.length} 班`);
    assert.ok(stations.length > 100);
    const bad = syntheticNotes.filter((note) => note.includes('违规') || note.includes('补不上车'));
    assert.deepEqual(bad, []);
    assert.ok(MAX_SYNTHETIC_TRIPS >= 1000);
  });

  it('下一班：等待时间、钟点、去向唯一且按等待升序', () => {
    // 「下一班」用的是 run 的 stops，所以任何一条返回项的到站时刻都必须真的在某个 run 的停站里
    const stationId = 'Teyvat-SMC';
    const minute = 8 * 60;
    const list = nextArrivalsAt(stationId, minute);
    assert.ok(list.length > 0, `${stationId} 没有下一班`);
    assert.ok(stationMap.get(stationId));
    const keys = new Set<string>();
    for (const arrival of list) {
      assert.ok(arrival.waitMinutes >= 0 && arrival.waitMinutes < 1440);
      assert.equal(arrival.clock, formatClock(minute + arrival.waitMinutes));
      const key = `${arrival.lineId}|${arrival.direction}|${arrival.terminusId}`;
      assert.equal(keys.has(key), false, `同一个去向出现两行：${key}`);
      keys.add(key);
      const run = trainRuns.find((candidate) => candidate.id === arrival.runId);
      assert.ok(run, `runId 不存在：${arrival.runId}`);
      assert.ok(run.stops.some((stop) => stop.stationId === stationId));
      assert.equal(arrival.terminusId, run.stops[run.stops.length - 1].stationId);
    }
    for (let i = 1; i < list.length; i++)
      assert.ok(list[i].waitMinutes >= list[i - 1].waitMinutes, '下一班没有按等待时间升序');
  });
});
