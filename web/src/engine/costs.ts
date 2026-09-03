/**
 * Цены покупки, running costs и строительства пути (economy.cpp:934 GetPrice, engine.cpp:307).
 * cost = basePrice * costFactor / 256 * 2^grfShift (* инфляция цен).
 * Iron Horse задаёт basecost-шифты в GRF (см. meta.basecost_shifts в trains.json).
 */

import type { ConsistEntry, Railtype, Train, TrainsMeta } from '../types';
import { inflationFactors } from './inflation';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
  type RunningClass,
  basecostBuyFactor,
  basecostRailConstructionFactor,
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
  // Infrastructure upkeep, per month before the type multiplier (table/pricebase.h).
  // These sit in PCAT_RUNNING, so the difficulty knob over them is vehicle_costs — not
  // construction_cost, despite what they pay for.
  infrastructure_rail: 10, // PR_INFRASTRUCTURE_RAIL
  infrastructure_road: 10, // PR_INFRASTRUCTURE_ROAD
  infrastructure_water: 8, // PR_INFRASTRUCTURE_WATER
  infrastructure_station: 100, // PR_INFRASTRUCTURE_STATION
  // Laying and clearing track (table/pricebase.h). These are PCAT_CONSTRUCTION, so the
  // difficulty knob over them is construction_cost — unlike the infrastructure prices above,
  // which pay for the same track and sit in PCAT_RUNNING. Clearing earns money, hence the
  // negative price; the game keeps the sign through every multiplier.
  build_rail: 100, // PR_BUILD_RAIL
  clear_rail: -70, // PR_CLEAR_RAIL
} as const;

export type BasePriceKey = keyof typeof BASE_PRICES;

/**
 * A base price after the multipliers the game applies to every one of them: difficulty,
 * inflation, and whatever a Base Costs GRF scales it by (economy.cpp RecomputePrices).
 *
 * The zero clamp is not here. The game applies it once, after every multiplier including the
 * GRF shift, and vehicle prices reach that point later — `price()` shifts by the GRF after
 * this call. Infrastructure, whose whole chain ends here, clamps in `infrastructure.ts`.
 */
export function basePriceAfterMultipliers(
  baseKey: BasePriceKey,
  difficultyFactor: number,
  inflationPrice: number,
  grfFactor = 1,
): number {
  return Math.floor(BASE_PRICES[baseKey] * difficultyFactor * inflationPrice * grfFactor);
}

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
  const base = basePriceAfterMultipliers(
    baseKey,
    difficultyFactor,
    inflationFactors(year, inflationOn, inflationInterest, inflationFixedDates, startingYear).price,
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

/** running_cost_base набора (RUNNING_COST_*) -> running-класс игры. */
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
 * Yearly running cost of one vehicle. The base price and the NewGRF shift both follow the
 * vehicle's running class: a set states a shift per base price, and a class it states none
 * for gets zero, not a neighbour's (newgrf.cpp action 0x08, economy.cpp RecomputePrices) —
 * an electric engine of a set with only steam and diesel shifts pays the unshifted electric
 * base. Running cost is charged per tick against a fixed 365-day divisor, so a longer day
 * (JGRPP) stretches a calendar year over proportionally more ticks, while a wallclock
 * economy year (360 days) collects proportionally less.
 */
export function trainRunningCostPerYear(
  train: Train,
  meta: TrainsMeta,
  game: GameSettings = DEFAULT_GAME_SETTINGS,
  calc: CalcSettings = DEFAULT_CALC_SETTINGS,
): number {
  const runningClass = runningClassOf(train.running_cost_base);
  const shift = meta.basecost_shifts[`running_${runningClass}`] ?? 0;
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

/**
 * The price inflation of a year under the game's settings — the factor every price rides.
 *
 * The model comes through `inflationModel()`, not off the flag: JGRPP's dated model only
 * exists on the patchpack, and a vanilla game inflates from 1920 whatever a flag saved from
 * some other game says. Reading the flag raw would price track by one model and vehicles by
 * another in the same game.
 */
export function priceInflation(game: GameSettings, year: number): number {
  return inflationFactors(
    year,
    game.inflation,
    game.inflationInterest,
    inflationModel(game),
    game.startingYear,
  ).price;
}

/**
 * Base price of a construction category after the difficulty, inflation and Base Costs
 * multipliers, clamped the way the game clamps it.
 *
 * `RecomputePrices` refuses to let a base price reach zero — a zero cost is how its commands
 * tell "nothing happened" from "done" — and clamps to `Clamp(start_price, -1, 1)`, so a
 * price that earns money stays earning. The clamp in `infrastructure.ts` always answers 1;
 * used here it would turn clearing track into an expense.
 */
function railConstructionBasePrice(
  baseKey: 'build_rail' | 'clear_rail',
  game: GameSettings,
  year: number,
): number {
  const value = basePriceAfterMultipliers(
    baseKey,
    difficultyPriceFactor(game.constructionCost),
    priceInflation(game, year),
    basecostRailConstructionFactor(game),
  );
  return value === 0 ? Math.sign(BASE_PRICES[baseKey]) : value;
}

/**
 * What a piece of this track costs to lay (rail.h RailBuildCost).
 *
 * The game shifts the product right by three; here it is a division, for the reason spelled
 * out in `infrastructure.ts` — a Base Costs multiplier reaches 8192x, the product passes
 * 2^31, and a bitwise shift in JS would wrap it negative.
 */
export function railBuildCost(track: Railtype, game: GameSettings, year: number): number {
  return Math.floor((railConstructionBasePrice('build_rail', game, year) * track.cost_multiplier) / 8);
}

/**
 * What clearing a piece of this track earns (rail.h RailClearCost): a negative figure, and
 * never more than three quarters of what the track cost to lay, so a set with a very low
 * build price cannot be farmed. C++ truncates the division toward zero, and this one is
 * negative, so `Math.trunc` — not `Math.floor` — is the rounding that matches.
 */
export function railClearCost(track: Railtype, game: GameSettings, year: number): number {
  return Math.max(
    railConstructionBasePrice('clear_rail', game, year),
    Math.trunc((-railBuildCost(track, game, year) * 3) / 4),
  );
}

/**
 * Price of converting one piece of track from one type to another (rail.h RailConvertCost).
 *
 * Two ways to get there and the game charges the cheaper: rebuild — clear the old type and
 * lay the new — or, when the types are related by power in either direction, an upgrade at
 * an eighth of the new type's build cost plus whatever the new material costs over the old.
 */
export function railConvertCost(
  from: Railtype,
  to: Railtype,
  game: GameSettings,
  year: number,
): number {
  const build = railBuildCost(to, game, year);
  const rebuild = build + railClearCost(from, game, year);
  const related = from.powered.includes(to.label) || to.powered.includes(from.label);
  if (!related) return rebuild;
  const upgrade =
    Math.floor(build / 8) + Math.max(0, build - railBuildCost(from, game, year));
  return Math.min(upgrade, rebuild);
}
