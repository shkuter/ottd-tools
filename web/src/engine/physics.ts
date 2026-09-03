/**
 * Физика поезда (realistic acceleration) —
 * openttd/src/ground_vehicle.cpp:100 GetAcceleration, train.h.
 * Скорость всюду — внутренние единицы (~км/ч): internal = mph * 16/10.
 */

import type { AccelerationType } from '../types';
import { brakingPercent, type GameSettings } from './settings';

const GROUND_ACCELERATION = 9800;
const HP_TO_WATTS = 746;
const AIR_DRAG_AREA_TRAIN = 14;
/** Brake force and power a unit of train length contributes (train.h:78-81). */
const BRAKE_FORCE_PER_LENGTH = 2400;
const BRAKE_POWER_PER_LENGTH = 15000;
/** (400 × 5) / 18 — the game's own integer conversion for the slope term. */
const SLOPE_KE_FACTOR = 111;
/** World units in one height level (tile_type.h TILE_HEIGHT); the game's z is in them. */
export const HEIGHT_LEVEL_UNITS = 8;
/** engine_type.h VehicleAccelerationModel::Maglev — the branch without air or rolling drag. */
const MAGLEV_ACCELERATION: AccelerationType = 2;
/** Length units in a tile; the game's positions are counted in them (tile_type.h). */
const TILE_LENGTH_UNITS = 16;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

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
  /**
   * Length the brakes act over, in OpenTTD length units (16 = tile). The game inflates it
   * for loaded freight when the weight multiplier is on, so it is not the consist's own
   * length (train_cmd.cpp UpdateAcceleration). Not optional: a forgotten one would not fail,
   * it would quietly halve the braking force and shorten every distance built on it.
   */
  brakingLengthUnits: number;
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
export function balancingSpeed(
  c: ConsistPhysics,
  massOnSlopeT = 0,
  /** 'original' — упрощённая модель TTD: сопротивление скорость не ограничивает. */
  model: 'realistic' | 'original' = 'realistic',
): number {
  if (model === 'original') {
    // train_cmd.cpp:447 — ускорение из мощности и веса, предел только max speed
    return c.powerHp > 0 ? c.maxSpeedInternal : 0;
  }
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


/**
 * Integer cube root, the game's IntCbrt (core/math_func.cpp).
 *
 * Everything below is realistic braking (JGRPP): the patchpack plans a stop from a cached
 * deceleration rather than from the force balance it accelerates by (train_cmd.cpp
 * UpdateAcceleration). Position there is a sixteenth of a tile and speed is the internal unit
 * (~km/h), so a distance in tiles is `v² / (32 × decel)` — the figure the game's own comment
 * quotes as "about 6.2 tiles from 160 km/h" at a deceleration of 130.
 */
function intCbrt(value: number): number {
  if (value <= 0) return 0;
  let root = Math.floor(Math.cbrt(value));
  // Math.cbrt is a float: step back onto the integer the game would have reached
  while (root > 0 && root * root * root > value) root--;
  while ((root + 1) ** 3 <= value) root++;
  return root;
}

/**
 * Braking deceleration the game plans with, in its own units (train_cmd.cpp:1266-1352).
 *
 * `accelerationType` is the track's own (rail.h): 0 plain, 1 monorail, 2 maglev. It steps the
 * cap, and maglev brakes by a branch of its own besides.
 */
export function brakingDeceleration(
  c: ConsistPhysics,
  settings: Pick<GameSettings, 'jgrpp' | 'accelerationModel' | 'trainAccBrakingPercent'>,
  // no default: a forgotten one would quietly cap a maglev at plain rail's 120, the same
  // silent kind of wrong that made brakingLengthUnits required
  accelerationType: AccelerationType,
): number {
  const mass = Math.max(1, c.massT);
  if (settings.accelerationModel === 'original') {
    // the original acceleration model has no force balance to read, so the game derives the
    // deceleration from the same crude acceleration figure it drives by. The division is
    // integer and happens before the multiplication, as it does in the game
    const acceleration = clamp(Math.floor(c.powerHp / mass) * 4, 1, 255);
    return clamp(Math.floor((acceleration * 7) / 2), 1, 200);
  }
  return clamp(
    uncappedDeceleration(c, accelerationType),
    1,
    decelerationLimit(settings, accelerationType),
  );
}

/**
 * The deceleration before the "defensive driving" cap — what the game falls back on when a
 * descent needs more braking than the cap allows.
 */
function uncappedDeceleration(c: ConsistPhysics, accelerationType: AccelerationType): number {
  const mass = Math.max(1, c.massT);
  const length = c.brakingLengthUnits;
  const powerW = c.powerHp * HP_TO_WATTS;
  let force = length * BRAKE_FORCE_PER_LENGTH;
  if (accelerationType === MAGLEV_ACCELERATION) {
    force += Math.floor(powerW / 25);
  } else {
    const powerB = powerW + length * BRAKE_POWER_PER_LENGTH;
    const drag = airDrag(c);
    // the game reads the vehicle's own maximum here; ours carries the track's limit folded
    // in already (consist.ts). Neither set states a track limit, so the two agree today —
    // a set that grades its track by speed would brake fractionally harder here than in game
    let evaluationSpeed = c.maxSpeedInternal;
    if (drag > 0) {
      evaluationSpeed = Math.min(
        evaluationSpeed,
        intCbrt(Math.floor((1800 * powerB) / (AIR_DRAG_AREA_TRAIN * drag))),
      );
    }
    if (evaluationSpeed > 0) {
      force += Math.floor((powerB * 18) / (evaluationSpeed * 5));
      force += Math.floor(
        (AIR_DRAG_AREA_TRAIN * drag * evaluationSpeed * evaluationSpeed) / 1000,
      );
    }
    force += 10 * mass; // axle resistance (ground_vehicle.cpp:141)
    force += mass * 16; // the lowest rolling friction a moving vehicle has
  }
  force -= Math.floor(force / 8); // "slightly underestimate braking for defensive driving"
  return clamp(Math.floor(force / (mass * 4)), 1, 65535);
}

/**
 * Cap on planned deceleration (train_settings.h:16-19): 120 on plain rail, stepped by 48 per
 * acceleration type, scaled by the game's percentage. Integer arithmetic, as in the game — a
 * detour through a fraction loses a unit at some percentages.
 */
function decelerationLimit(
  settings: Pick<GameSettings, 'jgrpp' | 'trainAccBrakingPercent'>,
  accelerationType: AccelerationType,
): number {
  return Math.floor((brakingPercent(settings) * (120 + accelerationType * 48)) / 100);
}

/**
 * Braking distance in tiles, from `speedInternal` to a stop.
 *
 * `descentUnits` is the drop over the braking distance in the game's own world units, of
 * which a height level is eight — the unit its `z_delta` is in. The game lengthens the
 * distance for a descent only under the realistic acceleration model (train_cmd.cpp:912),
 * and lets it use the uncapped deceleration there.
 */
export function brakingDistanceTiles(
  c: ConsistPhysics,
  settings: Pick<
    GameSettings,
    'jgrpp' | 'accelerationModel' | 'trainAccBrakingPercent' | 'slopeSteepness'
  >,
  speedInternal: number,
  descentUnits: number,
  accelerationType: AccelerationType,
): number {
  if (speedInternal <= 0) return 0;
  const decel = brakingDeceleration(c, settings, accelerationType);
  const keDelta = speedInternal * speedInternal;
  // the game divides in integers here, and the truncation is worth keeping: it is what makes
  // the figure the one the train actually plans with
  let units = Math.floor(keDelta / (2 * decel));
  if (descentUnits > 0 && settings.accelerationModel !== 'original') {
    // 111 is the game's own (5/18) conversion of the km/h-derived kinetic energy
    const slope = descentUnits * SLOPE_KE_FACTOR * (settings.slopeSteepness ?? 3);
    const uncapped = uncappedDeceleration(c, accelerationType);
    units = Math.max(units, Math.floor((keDelta + slope) / (2 * uncapped)));
  }
  return units / TILE_LENGTH_UNITS;
}
