/**
 * 车型（列车 / 船只）配置 —— 线路的每个变体选用一种（数据里变体的 `vehicle` 字段写车型 id）。
 *
 * 取代旧的 `fare-presets.json`：旧配置只有「每公里票价 / 每公里分钟」两个系数，
 * 现在拆成「设计时速」（推导时间）与「票价系数」（推导票价），并允许整段覆写计算公式。
 * 加/减速度与可载人数是预留字段，当前未参与任何计算（现有车型也都没填）。
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
  /** 加速度（m/s²）；当前未使用 */
  acceleration?: number;
  /** 减速度（m/s²）；当前未使用 */
  deceleration?: number;
  /** 可载人数；当前未使用 */
  capacity?: number;
  /**
   * 数据计算公式：`(距离(km), 本车型配置) => { time: 分钟, fare: 摩拉 }`。
   * 缺省 = `defaultCompute`：时间 = 距离 / (设计时速 / 60)，票价 = 距离 × 票价系数。
   */
  compute?: (distance: number, vehicle: Vehicle) => { time: number; fare: number };
}

/** 缺省计算公式：时间由设计时速推出，票价 = 距离 × 票价系数 */
export function defaultCompute(distance: number, vehicle: Vehicle): { time: number; fare: number } {
  return {
    time: distance / (vehicle.designSpeed / 60),
    fare: distance * vehicle.fareCoefficient,
  };
}

/** 变体未写 `vehicle` 时用的车型 */
export const DEFAULT_VEHICLE_ID = 'standard';

/**
 * 全部车型。设计时速由旧的「每公里分钟」换算：时速 = 60 / minutesPerKm（km/h）；
 * 票价系数就是旧的 farePerKm（摩拉/千米）。
 */
export const VEHICLES: Vehicle[] = [
  {
    id: 'standard',
    name: '提瓦特铁路标准',
    nameEn: 'Teyvat Railway Standard',
    designSpeed: 60,
    fareCoefficient: 100,
  },
  {
    id: 'aquabus',
    name: '枫丹巡轨船',
    nameEn: 'Fontaine Aquabus',
    designSpeed: 30,
    fareCoefficient: 80,
  },
  {
    id: 'natlan-resort',
    name: '纳塔度假村',
    nameEn: 'Natlan Resort Line',
    designSpeed: 30,
    fareCoefficient: 0,
  },
  {
    id: 'inazuma',
    name: '稻妻铁道',
    nameEn: 'Inazuma Railway',
    designSpeed: 60 / 0.7,
    fareCoefficient: 150,
  },
  {
    id: 'liyue-metro',
    name: '璃月港地铁',
    nameEn: 'Liyue Harbor Metro',
    designSpeed: 50,
    fareCoefficient: 80,
  },
  {
    id: 'ferry',
    name: '轮渡',
    nameEn: 'Ferry',
    designSpeed: 15,
    fareCoefficient: 50,
  },
  {
    // 同站换乘是虚拟线路、不是真实运具；保留一个配置项只为沿用旧费用口径
    id: 'same-station',
    name: '同站换乘',
    nameEn: 'Same-Station Transfer',
    designSpeed: 5,
    fareCoefficient: 0,
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
