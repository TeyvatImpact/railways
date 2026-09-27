/**
 * 车型（列车 / 船只）配置 —— 线路的每个变体选用一种（数据里变体的 `vehicle` 字段写车型 id）。
 *
 * 取代旧的 `fare-presets.json`：旧配置只有「每公里票价 / 每公里分钟」两个系数，
 * 现在拆成「设计时速」（推导时间）与「票价系数」（推导票价），并允许整段覆写计算公式；
 * 给出加/减速度时会按含加减速的梯形速度曲线算时间（见 `travelMinutes`）。
 * 可载人数是预留字段，当前未参与任何计算（现有车型也没填）。
 */

export interface Vehicle {
  /** 稳定 id；线路变体的 `vehicle` 引用它 */
  id: string;
  /** 名称 */
  name: string;
  /** 英文名称 */
  nameEn?: string;
  /** 设计时速（km/h）：缺省公式用它算时间 */
  designSpeed: number;
  /** 票价系数：缺省公式用「距离(km) × 票价系数」算票价（摩拉） */
  fareCoefficient: number;
  /** 加速度（m/s²）：与 `deceleration` 同时给出且大于 0 时，缺省公式才计入加减速过程；`Infinity` = 瞬时达速 */
  acceleration?: number;
  /** 减速度（m/s²）：与 `acceleration` 同时给出且大于 0 时，缺省公式才计入加减速过程；`Infinity` = 瞬时停住 */
  deceleration?: number;
  /** 可载人数；当前未使用 */
  capacity?: number;
  /**
   * 数据计算公式：`(距离(km), 本车型配置) => { time: 分钟, fare: 摩拉 }`。
   * 缺省 = `defaultCompute`：票价 = 距离 × 票价系数，时间见 `travelMinutes`（有加/减速度时含加减速过程）。
   */
  compute?: (distance: number, vehicle: Vehicle) => { time: number; fare: number };
}

/**
 * 缺省计算公式：时间由设计时速（若配了正数的加/减速度，则按含加减速的梯形速度曲线）推出，
 * 票价 = 距离 × 票价系数。
 */
export function defaultCompute(distance: number, vehicle: Vehicle): { time: number; fare: number } {
  return {
    time: travelMinutes(distance, vehicle),
    fare: distance * vehicle.fareCoefficient,
  };
}

/**
 * 一程行驶时间（分钟）。距离 km、设计时速 km/h、加/减速度 m/s²。
 *
 * 只有**同时**给出正的 `acceleration` 与 `deceleration` 时才计入加减速过程：
 * 起步到设计时速用掉 `v² / 2a`、停站再要 `v² / 2d`，够长就「加速 → 匀速 → 减速」，
 * 区间太短到不了设计时速，就取由 `加速距离 + 减速距离 = 全程` 解出的峰值速度（没有匀速段）。
 * 否则退化为按设计时速的纯匀速 —— 缺省、非正数、`NaN` 都走这条路；`Infinity` 表示瞬时达速/停住，
 * 此时加速与减速段各为 0，公式自然退化成纯匀速。
 */
export function travelMinutes(distance: number, vehicle: Vehicle): number {
  const speed = vehicle.designSpeed / 60;
  if (!(speed > 0)) return 0;
  const constant = distance / speed;
  const a = vehicle.acceleration;
  const dec = vehicle.deceleration;
  if (a === undefined || dec === undefined) return constant;
  // 0 / 负数 / NaN 都退化为纯匀速；Infinity 保留，下面自然算出 0 长的加速与减速段
  if (!(a > 0) || !(dec > 0)) return constant;
  // m/s² → km/min²：1 m/s² = 0.06 km/min 每秒 = 3.6 km/min²
  const aRate = a * 3.6;
  const dRate = dec * 3.6;
  const accelDistance = (speed * speed) / (2 * aRate);
  const decelDistance = (speed * speed) / (2 * dRate);
  if (accelDistance + decelDistance <= distance) {
    return speed / aRate + (distance - accelDistance - decelDistance) / speed + speed / dRate;
  }
  const peak = Math.sqrt((2 * distance) / (1 / aRate + 1 / dRate));
  return peak / aRate + peak / dRate;
}

/** 变体未写 `vehicle` 时用的车型 */
export const DEFAULT_VEHICLE_ID = 'standard';

/**
 * 全部车型。票价系数 = 摩拉/千米；设计时速与加/减速度按各线路的设定手工取值，
 * 加/减速度取 `Infinity` 表示「瞬时达速 / 瞬时停住」（结果与纯匀速一致，如虚拟的同站换乘）。
 */
export const VEHICLES: Vehicle[] = [
  {
    id: 'standard',
    name: '提瓦特铁路标准列车',
    nameEn: 'Teyvat Railway Standard Train',
    designSpeed: 80,
    fareCoefficient: 100,
    acceleration: 0.8,
    deceleration: 1,
  },
  {
    id: 'aquabus',
    name: '枫丹巡轨船',
    nameEn: 'Fontaine Aquabus',
    designSpeed: 40,
    fareCoefficient: 80,
    acceleration: 0.5,
    deceleration: 1.5,
  },
  {
    id: 'natlan-resort',
    name: '纳塔度假村专用列车',
    nameEn: 'Natlan Resort Train',
    designSpeed: 30,
    fareCoefficient: 0,
    acceleration: 0.5,
    deceleration: 0.8,
  },
  {
    id: 'inazuma',
    name: '稻妻铁道',
    nameEn: 'Inazuma Railway',
    designSpeed: 100,
    fareCoefficient: 180,
    acceleration: 1.2,
    deceleration: 1.5,
  },
  {
    id: 'liyue-metro',
    name: '璃月港地铁',
    nameEn: 'Liyue Harbor Metro',
    designSpeed: 100,
    fareCoefficient: 80,
    acceleration: 1,
    deceleration: 1.2,
  },
  {
    id: 'ferry',
    name: '轮渡',
    nameEn: 'Ferry',
    designSpeed: 15,
    fareCoefficient: 50,
    acceleration: 0.05,
    deceleration: 0.2,
  },
  {
    // 同站换乘是虚拟线路、不是真实运具；保留一个配置项只为沿用旧费用口径
    id: 'same-station',
    name: '同站换乘',
    nameEn: 'Same-Station Transfer',
    designSpeed: 5,
    fareCoefficient: 0,
    acceleration: Infinity,
    deceleration: Infinity,
  },
];

const vehicleMap = new Map(VEHICLES.map((v) => [v.id, v]));

export function hasVehicle(id: string): boolean {
  return vehicleMap.has(id);
}

/** 取车型；未知 id 回退到 `standard`（数据层会先行校验，这里只是兜底） */
export function getVehicle(id: string): Vehicle {
  return vehicleMap.get(id) ?? vehicleMap.get(DEFAULT_VEHICLE_ID)!;
}
