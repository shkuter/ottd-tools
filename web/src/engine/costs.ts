/**
 * Цены покупки и running costs (economy.cpp:934 GetPrice, engine.cpp:307).
 * cost = basePrice * costFactor / 256 * 2^grfShift (* инфляция цен).
 * Iron Horse задаёт basecost-шифты в GRF (см. meta.basecost_shifts в trains.json).
 */

import type { ConsistEntry, Train, TrainsMeta } from '../types';
import { inflationFactors } from './inflation';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
  type RunningClass,
  basecostBuyFactor,
  basecostRunningFactor,
  difficultyPriceFactor,
  economyYearFraction,
  effectiveDayLength,
  inflationModel,
} from './settings';

export const BASE_PRICES = {
  build_engine: 400000, // PR_BUILD_VEHICLE_TRAIN
  build_wagon: 2000, // PR_BUILD_VEHICLE_WAGON
  running_steam: 5600, // PR_RUNNING_TRAIN_STEAM, в год
  running_diesel: 5200, // PR_RUNNING_TRAIN_DIESEL
  running_electric: 4800, // PR_RUNNING_TRAIN_ELECTRIC
} as const;

export type BasePriceKey = keyof typeof BASE_PRICES;

export function price(
  baseKey: BasePriceKey,
  costFactor: number,
  grfShift = 0,
  year = 1950,
  inflationOn = false,
  /** Множитель сложности: difficulty.construction_cost / vehicle_costs. */
  difficultyFactor = 1,
  inflationInterest = 2,
  inflationFixedDates = true,
  startingYear = 1950,
): number {
  const base = Math.floor(
    BASE_PRICES[baseKey] *
      difficultyFactor *
      inflationFactors(year, inflationOn, inflationInterest, inflationFixedDates, startingYear)
        .price,
  );
  // GetPrice: (base * factor) со сдвигом (grfShift - 8) одной операцией
  const totalShift = grfShift - 8;
  const product = base * costFactor;
  return totalShift >= 0
    ? product * 2 ** totalShift
    : Math.floor(product / 2 ** -totalShift);
}

export function buyCost(
  kind: 'engine' | 'wagon',
  costFactor: number,
  grfShift = 0,
  year = 1950,
  inflationOn = false,
  difficultyFactor = 1,
  inflationInterest = 2,
  inflationFixedDates = true,
  startingYear = 1950,
): number {
  const key = kind === 'engine' ? 'build_engine' : 'build_wagon';
  return price(key, costFactor, grfShift, year, inflationOn, difficultyFactor, inflationInterest, inflationFixedDates, startingYear);
}

export function runningCostPerYear(
  baseKey: BasePriceKey,
  costFactor: number,
  grfShift = 0,
  year = 1950,
  inflationOn = false,
  difficultyFactor = 1,
  inflationInterest = 2,
  inflationFixedDates = true,
  startingYear = 1950,
): number {
  return price(baseKey, costFactor, grfShift, year, inflationOn, difficultyFactor, inflationInterest, inflationFixedDates, startingYear);
}

/** Iron Horse: running_cost_base из trains.json -> running-класс игры. */
export function runningClassOf(runningCostBase: string): RunningClass {
  if (runningCostBase.includes('STEAM')) return 'steam';
  if (runningCostBase.includes('ELECTRIC')) return 'electric';
  return 'diesel';
}

/** Iron Horse: running_cost_base из trains.json -> ключ базовой цены. */
export function runningBaseKey(runningCostBase: string): BasePriceKey {
  return `running_${runningClassOf(runningCostBase)}` as BasePriceKey;
}

/**
 * Buy price of one vehicle: picks the NewGRF basecost shift by vehicle kind and
 * folds in the difficulty and Base Costs GRF multipliers of the current settings.
 */
export function trainBuyCost(
  train: Train,
  meta: TrainsMeta,
  game: GameSettings = DEFAULT_GAME_SETTINGS,
  calc: CalcSettings = DEFAULT_CALC_SETTINGS,
): number {
  const shift =
    train.kind === 'engine'
      ? meta.basecost_shifts.build_engine
      : meta.basecost_shifts.build_wagon;
  return buyCost(
    train.kind,
    train.cost_factor,
    shift,
    calc.priceYear,
    game.inflation,
    difficultyPriceFactor(game.constructionCost) * basecostBuyFactor(game, train.kind),
    game.inflationInterest,
    inflationModel(game),
    game.startingYear,
  );
}

/**
 * Yearly running cost of one vehicle. The base price follows the vehicle's running class
 * (steam/diesel/electric), while the NewGRF shift only distinguishes steam from the rest —
 * Iron Horse ships no separate electric shift. Running cost is charged per tick against a
 * fixed 365-day divisor, so a longer day (JGRPP) stretches a calendar year over proportionally
 * more ticks, while a wallclock economy year (360 days) collects proportionally less.
 */
export function trainRunningCostPerYear(
  train: Train,
  meta: TrainsMeta,
  game: GameSettings = DEFAULT_GAME_SETTINGS,
  calc: CalcSettings = DEFAULT_CALC_SETTINGS,
): number {
  const runningClass = runningClassOf(train.running_cost_base);
  const shift =
    runningClass === 'steam'
      ? meta.basecost_shifts.running_steam
      : meta.basecost_shifts.running_diesel;
  return (
    runningCostPerYear(
      runningBaseKey(train.running_cost_base),
      train.running_cost_factor,
      shift,
      calc.priceYear,
      game.inflation,
      difficultyPriceFactor(game.vehicleCosts) * basecostRunningFactor(game, runningClass),
      game.inflationInterest,
      inflationModel(game),
      game.startingYear,
    ) *
    effectiveDayLength(game) *
    economyYearFraction(game)
  );
}

/** Buy price and yearly running cost of a whole consist. */
export function consistMoney(
  entries: readonly ConsistEntry[],
  meta: TrainsMeta,
  game: GameSettings = DEFAULT_GAME_SETTINGS,
  calc: CalcSettings = DEFAULT_CALC_SETTINGS,
): { buy: number; running: number } {
  let buy = 0;
  let running = 0;
  for (const { train, count } of entries) {
    buy += count * trainBuyCost(train, meta, game, calc);
    running += count * trainRunningCostPerYear(train, meta, game, calc);
  }
  return { buy, running };
}
