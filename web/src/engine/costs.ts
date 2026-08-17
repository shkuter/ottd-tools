/**
 * Цены покупки и running costs (economy.cpp:934 GetPrice, engine.cpp:307).
 * cost = basePrice * costFactor / 256 * 2^grfShift (* инфляция цен).
 * Iron Horse задаёт basecost-шифты в GRF (см. meta.basecost_shifts в trains.json).
 */

import { inflationFactors } from './inflation';

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
): number {
  const base = Math.floor(
    BASE_PRICES[baseKey] *
      difficultyFactor *
      inflationFactors(year, inflationOn, inflationInterest, inflationFixedDates).price,
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
): number {
  const key = kind === 'engine' ? 'build_engine' : 'build_wagon';
  return price(key, costFactor, grfShift, year, inflationOn, difficultyFactor, inflationInterest, inflationFixedDates);
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
): number {
  return price(baseKey, costFactor, grfShift, year, inflationOn, difficultyFactor, inflationInterest, inflationFixedDates);
}

/** Iron Horse: running_cost_base из trains.json -> ключ базовой цены. */
export function runningBaseKey(runningCostBase: string): BasePriceKey {
  if (runningCostBase.includes('STEAM')) return 'running_steam';
  if (runningCostBase.includes('ELECTRIC')) return 'running_electric';
  return 'running_diesel';
}
