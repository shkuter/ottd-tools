/**
 * Сборка статистики состава из выбранных машин Iron Horse.
 * Все игровые формулы — в physics.ts/costs.ts, здесь только агрегация.
 */
import type { Cargo, Train, TrainsMeta } from '../types';
import { buyCost, runningBaseKey, runningCostPerYear } from './costs';
import type { ConsistPhysics } from './physics';
import { balancingSpeed } from './physics';
import { mphToInternal } from './units';
import { canCarry } from '../dataset';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
  effectiveDayLength,
} from './settings';

export interface ConsistEntry {
  train: Train;
  count: number;
}

export interface ConsistStats {
  powerHp: number;
  maxTeN: number;
  emptyWeightT: number;
  loadedWeightT: number;
  lengthTiles: number;
  /** Лимит скорости состава, mph (null = не ограничен машинами). */
  speedLimitMph: number | null;
  buyCostTotal: number;
  runningCostTotal: number;
  capacityForCargo: number;
  balancingSpeedMph: number;
  balancingSpeedOnGradeMph: number;
  numUnits: number;
}

export function consistPhysics(
  entries: ConsistEntry[],
  cargo: Cargo | null,
  capacityIndex: number,
  game: GameSettings = DEFAULT_GAME_SETTINGS,
): { physics: ConsistPhysics; stats: Omit<ConsistStats, 'balancingSpeedMph' | 'balancingSpeedOnGradeMph'> } {
  let powerHp = 0;
  let teWeightProduct = 0;
  let emptyWeightT = 0;
  let cargoWeightT = 0;
  let lengthUnits = 0;
  let speedLimit: number | null = null;
  let capacityForCargo = 0;
  let numUnits = 0;

  for (const { train, count } of entries) {
    numUnits += count * Math.max(1, train.units.length);
    powerHp += count * train.power_hp;
    emptyWeightT += count * train.weight_t;
    lengthUnits += count * train.length;
    if (train.power_hp > 0) {
      teWeightProduct += count * train.weight_t * train.te_coefficient;
    }
    if (train.speed_mph != null) {
      speedLimit = speedLimit == null ? train.speed_mph : Math.min(speedLimit, train.speed_mph);
    }
    if (cargo && canCarry(train, cargo)) {
      const capacity = count * (train.capacities[capacityIndex] ?? train.capacities[2]);
      capacityForCargo += capacity;
      if (cargo.is_freight) {
        // вес груза: units × freight_trains × weight/16 т (cargotype.cpp:256)
        cargoWeightT += (capacity * game.freightTrains * cargo.weight_16ths) / 16;
      }
    }
  }

  return {
    physics: {
      massT: Math.round(emptyWeightT + cargoWeightT),
      powerHp,
      teWeightProduct,
      maxSpeedInternal: mphToInternal(speedLimit ?? 200),
      numParts: numUnits,
      slopeSteepness: game.slopeSteepness,
    },
    stats: {
      powerHp,
      maxTeN: Math.floor(teWeightProduct * 9800),
      emptyWeightT,
      loadedWeightT: emptyWeightT + cargoWeightT,
      lengthTiles: lengthUnits / 16, // тайл = 16 единиц длины
      speedLimitMph: speedLimit,
      buyCostTotal: 0,
      runningCostTotal: 0,
      capacityForCargo,
      numUnits,
    },
  };
}

export function consistStats(
  entries: ConsistEntry[],
  cargo: Cargo | null,
  capacityIndex: number,
  meta: TrainsMeta,
  game: GameSettings = DEFAULT_GAME_SETTINGS,
  calc: CalcSettings = DEFAULT_CALC_SETTINGS,
): ConsistStats {
  const { physics, stats } = consistPhysics(entries, cargo, capacityIndex, game);
  let buy = 0;
  let running = 0;
  for (const { train, count } of entries) {
    const buyShift =
      train.kind === 'engine'
        ? meta.basecost_shifts.build_engine
        : meta.basecost_shifts.build_wagon;
    const runShift = train.running_cost_base.includes('STEAM')
      ? meta.basecost_shifts.running_steam
      : meta.basecost_shifts.running_diesel;
    buy += count * buyCost(train.kind, train.cost_factor, buyShift, calc.priceYear, game.inflation);
    running +=
      count *
      runningCostPerYear(
        runningBaseKey(train.running_cost_base),
        train.running_cost_factor,
        runShift,
        calc.priceYear,
        game.inflation,
      ) *
      // JGRPP: running cost начисляется по тикам, календарный год длиннее в N раз
      effectiveDayLength(game);
  }
  const flat = entries.length ? balancingSpeed(physics) : 0;
  // на уклоне не больше hillTiles тайлов состава
  const massOnSlope =
    physics.massT * Math.min(calc.hillTiles / Math.max(stats.lengthTiles, 0.1), 1);
  const grade = entries.length ? balancingSpeed(physics, massOnSlope) : 0;
  return {
    ...stats,
    buyCostTotal: buy,
    runningCostTotal: running,
    balancingSpeedMph: Math.floor((flat * 10) / 16),
    balancingSpeedOnGradeMph: Math.floor((grade * 10) / 16),
  };
}
