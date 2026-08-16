/**
 * Физика поезда (realistic acceleration) —
 * openttd/src/ground_vehicle.cpp:100 GetAcceleration, train.h.
 * Скорость всюду — внутренние единицы (~км/ч): internal = mph * 16/10.
 */

const GROUND_ACCELERATION = 9800;
const HP_TO_WATTS = 746;
const AIR_DRAG_AREA_TRAIN = 14;

export interface ConsistPhysics {
  /** Полная масса состава, т (с грузом). */
  massT: number;
  /** Суммарная мощность, л.с. */
  powerHp: number;
  /** Σ (вес движимых юнитов, т × TE-коэффициент). */
  teWeightProduct: number;
  /** Максимальная скорость состава (внутр. ед.), для расчёта air drag. */
  maxSpeedInternal: number;
  /** Число юнитов (частей) в составе — влияет на air drag. */
  numParts: number;
  /** Крутизна уклона в % (настройка train_slope_steepness, def 3). */
  slopeSteepness?: number;
}

export function maxTractiveEffortN(c: ConsistPhysics): number {
  return Math.floor(c.teWeightProduct * GROUND_ACCELERATION);
}

function airDrag(c: ConsistPhysics): number {
  // NewGRF air_drag == 0 (дефолт Iron Horse) -> зависит от макс. скорости
  const base =
    c.maxSpeedInternal <= 10
      ? 192
      : Math.max(Math.floor(2048 / c.maxSpeedInternal), 1);
  return base + Math.floor((3 * base * c.numParts) / 20);
}

function rollingFriction(v: number): number {
  return Math.floor((15 * (512 + v)) / 512);
}

/** Сопротивление в ньютонах; massOnSlopeT — тоннаж на подъёме (0 = ровно). */
export function resistanceN(
  c: ConsistPhysics,
  v: number,
  massOnSlopeT = 0,
): number {
  const m = Math.max(1, c.massT);
  let r = 10 * m; // axle resistance
  r += m * rollingFriction(v);
  r += Math.floor((AIR_DRAG_AREA_TRAIN * airDrag(c) * v * v) / 1000);
  r += massOnSlopeT * (c.slopeSteepness ?? 3) * 100;
  return r;
}

/** Сила тяги в ньютонах на скорости v (внутр. ед.). */
export function forceN(c: ConsistPhysics, v: number): number {
  const powerW = c.powerHp * HP_TO_WATTS;
  const maxTE = maxTractiveEffortN(c);
  if (v > 0) {
    return Math.min(Math.floor((powerW * 18) / (v * 5)), maxTE);
  }
  return Math.max(Math.min(maxTE, powerW), c.massT * 8);
}

/**
 * Установившаяся скорость (внутр. ед.), где тяга сравнивается с сопротивлением.
 * Ограничена maxSpeedInternal. massOnSlopeT > 0 — весь состав на подъёме.
 */
export function balancingSpeed(c: ConsistPhysics, massOnSlopeT = 0): number {
  let lo = 1;
  let hi = c.maxSpeedInternal;
  if (forceN(c, hi) >= resistanceN(c, hi, massOnSlopeT)) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (forceN(c, mid) >= resistanceN(c, mid, massOnSlopeT)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface AccelSimResult {
  /** Игровых дней до достижения targetSpeed (или предела). */
  days: number;
  /** Пройдено тайлов за время разгона. */
  tiles: number;
  /** Достигнутая скорость (внутр. ед.). */
  reachedSpeed: number;
}

/**
 * Потиковая симуляция разгона с нуля (2 вызова обработчика за тик, dv = accel/256
 * на вызов с накоплением subspeed; прогресс floor(v*3/4), тайл = 3072 единиц).
 */
export function accelSimulation(
  c: ConsistPhysics,
  targetSpeed?: number,
  maxTicks = 74 * 100,
): AccelSimResult {
  const limit = Math.min(targetSpeed ?? c.maxSpeedInternal, c.maxSpeedInternal);
  let v = 0;
  let subspeed = 0;
  let progress = 0;
  let ticks = 0;
  while (ticks < maxTicks && v < limit) {
    for (let call = 0; call < 2; call++) {
      const f = forceN(c, v);
      const r = resistanceN(c, v);
      const m = Math.max(1, c.massT);
      let accel: number;
      if (f === r) accel = 0;
      else {
        accel = Math.trunc((f - r) / (4 * m));
        accel = f < r ? Math.min(-1, accel) : Math.max(1, accel);
      }
      const spd = subspeed + accel;
      subspeed = spd & 0xff;
      v = Math.max(Math.min(v + (spd >> 8), limit), 2);
      progress += Math.floor((v * 3) / 4);
    }
    ticks++;
  }
  return {
    days: ticks / 74,
    tiles: progress / 3072,
    reachedSpeed: v,
  };
}
