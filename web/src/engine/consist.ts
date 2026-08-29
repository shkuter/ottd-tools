/**
 * Сборка статистики состава из выбранных машин Iron Horse.
 * Все игровые формулы — в physics.ts/costs.ts, здесь только агрегация.
 */
import type { Cargo, ConsistEntry, Railtype, TrainsMeta } from '../types';
import { consistMoney } from './costs';
import type { ConsistPhysics } from './physics';
import { balancingSpeed } from './physics';
import { poweredOutputOn, trackSpeedLimit, vehicleSpeedOn } from './tracktypes';
import { internalToMphExact, mphToInternal } from './units';
import { activeRailtype, activeRailtypes, canCarryIn, trainCapacity } from '../dataset';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
} from './settings';

export interface ConsistStats {
  powerHp: number;
  maxTeN: number;
  emptyWeightT: number;
  loadedWeightT: number;
  lengthTiles: number;
  /** Лимит скорости состава, внутренние единицы (null = не ограничен машинами). */
  speedLimitInternal: number | null;
  buyCostTotal: number;
  runningCostTotal: number;
  capacityForCargo: number;
  balancingSpeedInternal: number;
  balancingSpeedOnGradeInternal: number;
  numUnits: number;
}

function minOf(current: number | null, value: number): number {
  return current == null ? value : Math.min(current, value);
}

export function consistPhysics(
  entries: readonly ConsistEntry[],
  cargo: Cargo | null,
  capacityIndex: number,
  game: GameSettings,
  // no default, here or on `game`: a consist computed without a track would silently read
  // every electric vehicle as making no power at all. `activeRailtype` always answers with
  // one, so there is no null case to carry either.
  track: Railtype,
): {
  physics: ConsistPhysics;
  stats: Omit<ConsistStats, 'balancingSpeedInternal' | 'balancingSpeedOnGradeInternal'>;
} {
  let powerHp = 0;
  let teWeightProduct = 0;
  let emptyWeightT = 0;
  let cargoWeightT = 0;
  let lengthUnits = 0;
  let speedLimitMph: number | null = null;
  let speedLimitInternal: number | null = null;
  let capacityForCargo = 0;
  let numUnits = 0;

  // the set's own table, needed to tell whether a vehicle draws power on this track at all
  const railtypes = activeRailtypes(game);

  for (const { train, count } of entries) {
    numUnits += count * Math.max(1, train.units.length);
    // what the vehicle actually contributes here: nothing unless the track powers it, and a
    // dual-power engine's electric figure only where the wires are
    const power = poweredOutputOn(train, track, railtypes);
    powerHp += count * power;
    emptyWeightT += count * train.weight_t;
    lengthUnits += count * train.length;
    // tractive effort comes with power, so it follows the track as well: a vehicle that
    // makes no power here pulls nothing (ground_vehicle.cpp: `if (current_power > 0)`)
    if (power > 0) {
      teWeightProduct += count * train.weight_t * train.te_coefficient;
    }
    // both units are tracked: physics keeps using mph (see the note below), the display
    // takes the internal speed straight from the data so it matches the game
    const speed = vehicleSpeedOn(train, track);
    if (speed.mph != null) {
      speedLimitMph = minOf(speedLimitMph, speed.mph);
      speedLimitInternal = minOf(speedLimitInternal, speed.internal ?? mphToInternal(speed.mph));
    }
    if (cargo && canCarryIn(game, train, cargo)) {
      const capacity = count * trainCapacity(train, cargo, capacityIndex);
      capacityForCargo += capacity;
      // вес груза: units × weight/16 т; множитель freight_trains — только для
      // грузовых (cargotype.cpp:254 WeightOfNUnitsInTrain)
      const freightMultiplier = cargo.is_freight ? game.freightTrains : 1;
      cargoWeightT += (capacity * freightMultiplier * cargo.weight_16ths) / 16;
    }
  }

  // the track's own limit binds the whole consist, so it is taken once over the finished
  // train rather than per vehicle. Neither vanilla nor Iron Horse states one; sets that do
  // (xUSSR-style track grids) cap the train here, exactly as the game does.
  const trackLimit = trackSpeedLimit(track);
  if (trackLimit != null) {
    speedLimitInternal = minOf(speedLimitInternal, trackLimit);
    // the exact conversion, not internalToMph(): this figure feeds the physics, where the
    // truncation the game's display does would lose a unit for good
    speedLimitMph = minOf(speedLimitMph, internalToMphExact(trackLimit));
  }

  return {
    physics: {
      massT: Math.round(emptyWeightT + cargoWeightT),
      powerHp,
      teWeightProduct,
      // deliberately not speed_internal: mphToInternal rounds mph * 1.6 and lands one unit
      // below the real internal speed on fast trains. Swapping it would move the calculated
      // numbers, and this change only touches display (see design.md, Risks)
      maxSpeedInternal: mphToInternal(speedLimitMph ?? 200),
      numParts: numUnits,
      slopeSteepness: game.slopeSteepness,
    },
    stats: {
      powerHp,
      maxTeN: Math.floor(teWeightProduct * 9800),
      emptyWeightT,
      loadedWeightT: emptyWeightT + cargoWeightT,
      lengthTiles: lengthUnits / 16, // тайл = 16 единиц длины
      speedLimitInternal,
      buyCostTotal: 0,
      runningCostTotal: 0,
      capacityForCargo,
      numUnits,
    },
  };
}

export function consistStats(
  entries: readonly ConsistEntry[],
  cargo: Cargo | null,
  capacityIndex: number,
  meta: TrainsMeta,
  game: GameSettings = DEFAULT_GAME_SETTINGS,
  calc: CalcSettings = DEFAULT_CALC_SETTINGS,
): ConsistStats {
  const track = activeRailtype(game, calc.trackType);
  const { physics, stats } = consistPhysics(entries, cargo, capacityIndex, game, track);
  const { buy, running } = consistMoney(entries, meta, game, calc);
  const flat = entries.length ? balancingSpeed(physics, 0, game.accelerationModel) : 0;
  // на уклоне не больше hillTiles тайлов состава
  const massOnSlope =
    physics.massT * Math.min(calc.hillTiles / Math.max(stats.lengthTiles, 0.1), 1);
  const grade = entries.length
    ? balancingSpeed(physics, massOnSlope, game.accelerationModel)
    : 0;
  return {
    ...stats,
    buyCostTotal: buy,
    runningCostTotal: running,
    balancingSpeedInternal: flat,
    balancingSpeedOnGradeInternal: grade,
  };
}
