/**
 * Round-trip economics: how long a consist takes to run a route, how often it can do it
 * in a year, and what it earns net of running cost.
 *
 * Both tabs that show money over time (the optimizer and the route income page) go through
 * this module, so the same consist on the same route can only produce one set of numbers.
 */
import type { Cargo, ConsistEntry, TrainsMeta } from '../types';
import { canCarryIn } from '../dataset';
import { consistPhysics } from './consist';
import type { ConsistPhysics } from './physics';
import { consistMoney } from './costs';
import { balancingSpeed } from './physics';
import { transportedGoodsIncome } from './income';
import { daysForDistance, transitPeriodsFromDays } from './units';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
  daysPerEconomyYear,
  effectiveDayLength,
  loadingTicks,
  stoppedCostDivisor,
  subsidyFactor,
} from './settings';
import { DAY_TICKS } from './units';

export interface TripParams {
  entries: readonly ConsistEntry[];
  cargo: Cargo;
  /** Payment rate of the cargo in the selected economy. */
  payment: number;
  distanceTiles: number;
  meta: TrainsMeta;
  game?: GameSettings;
  calc?: CalcSettings;
  /** Cargo is under subsidy: income is multiplied (difficulty.subsidy_multiplier). */
  subsidised?: boolean;
  /**
   * Cargo actually hauled per trip when the source industry cannot fill the train — the
   * share of what the station hands over falling to one train of the fleet. The delivered
   * share belongs in this figure, not in a separate income multiplier: a train that finds
   * a full load waiting earns on all of it (see docs/adr/0001).
   * Defaults to the consist capacity.
   */
  cargoPerTrip?: number;
  /**
   * Identical consists running the route. Buy cost, running cost and yearly income are
   * stated for the whole fleet, so rows with different fleet sizes compare directly.
   * Defaults to 1.
   */
  fleetSize?: number;
  /**
   * Loaded leg duration set by hand (route income tab). The empty leg is scaled by the
   * speed ratio, so a manual figure still gets a faster return run.
   */
  loadedDaysOverride?: number | null;
}

export interface TripEconomics {
  /** What the consist can carry of this cargo. */
  capacity: number;
  /** What it actually hauls per trip (capacity unless production limits it). */
  cargoPerTrip: number;
  loadedSpeedInternal: number;
  emptySpeedInternal: number;
  daysLoaded: number;
  daysEmpty: number;
  /** Days spent standing: loading at one end, unloading at the other. */
  loadingDays: number;
  roundTripDays: number;
  tripsPerYear: number;
  /** Income of a single trip of a single consist, for the cargo it actually carries. */
  incomePerTrip: number;
  /** Running cost of the whole fleet over a calendar year, discounted for time spent stopped (JGRPP). */
  runningCostPerYear: number;
  /** Buy cost of the whole fleet. */
  buyCostTotal: number;
  profitPerYear: number;
  paybackYears: number | null;
}

/**
 * Days a train stands at both ends of the route. Wagons load in parallel, so the stop
 * lasts as long as the slowest wagon of the consist needs; the same time is spent
 * unloading at the far end. Engines with their own cargo hold (railcars) are ignored
 * here on purpose — whether they stretch the stop is an open question for the
 * formula-verification pass (see the route-economics spec).
 */
export function tripLoadingDays(
  entries: readonly ConsistEntry[],
  cargo: Cargo,
  capacityIndex: number,
  game: GameSettings,
): number {
  const perWagonTicks = entries
    .filter((e) => e.count > 0 && e.train.kind === 'wagon' && canCarryIn(game, e.train, cargo))
    .map((e) =>
      loadingTicks(
        e.train.capacities[capacityIndex] ?? e.train.capacities[2] ?? 0,
        e.train.loading_speed ?? 0,
        game,
      ),
    );
  const slowest = perWagonTicks.length ? Math.max(...perWagonTicks) : 0;
  return (2 * slowest) / DAY_TICKS;
}

/**
 * The half of a trip that does not depend on the load or the fleet: physics, timings and
 * the price of one consist. Split out so a search over fleet sizes and loads pays for the
 * consist physics once instead of once per candidate.
 */
export interface TripSetup {
  capacity: number;
  /** Loaded consist physics, reused by callers that need e.g. speed on a grade. */
  loadedPhysics: ConsistPhysics;
  loadedSpeedInternal: number;
  emptySpeedInternal: number;
  daysLoaded: number;
  daysEmpty: number;
  loadingDays: number;
  roundTripDays: number;
  tripsPerYear: number;
  /** Buy cost and yearly running cost of a single consist. */
  buy: number;
  running: number;
}

export function tripSetup(params: TripParams): TripSetup {
  const game = params.game ?? DEFAULT_GAME_SETTINGS;
  const calc = params.calc ?? DEFAULT_CALC_SETTINGS;
  const { entries, cargo, distanceTiles, meta } = params;
  const capacityIndex = calc.capacityIndex;

  const loaded = consistPhysics(entries, cargo, capacityIndex, game);
  const empty = consistPhysics(entries, null, capacityIndex, game);
  const capacity = loaded.stats.capacityForCargo;
  const loadedSpeedInternal = entries.length
    ? balancingSpeed(loaded.physics, 0, game.accelerationModel)
    : 0;
  const emptySpeedInternal = entries.length
    ? balancingSpeed(empty.physics, 0, game.accelerationModel)
    : 0;

  const naturalLoaded = daysForDistance(distanceTiles, loadedSpeedInternal);
  const daysLoaded = params.loadedDaysOverride ?? naturalLoaded;
  // A hand-entered leg keeps the physical speed ratio: the empty return is still faster.
  const speedRatio =
    emptySpeedInternal > 0 ? loadedSpeedInternal / emptySpeedInternal : 1;
  const daysEmpty =
    params.loadedDaysOverride != null
      ? params.loadedDaysOverride * speedRatio
      : daysForDistance(distanceTiles, emptySpeedInternal);

  const loadingDays = tripLoadingDays(entries, cargo, capacityIndex, game);
  const roundTripDays = daysLoaded + daysEmpty + loadingDays;
  // JGRPP: a longer day does not change the trip in ticks, but the calendar year holds more of them.
  const tripsPerYear =
    roundTripDays > 0 && Number.isFinite(roundTripDays)
      ? (daysPerEconomyYear(game) * effectiveDayLength(game)) / roundTripDays
      : 0;

  const { buy, running } = consistMoney(entries, meta, game, calc);

  return {
    capacity,
    loadedPhysics: loaded.physics,
    loadedSpeedInternal,
    emptySpeedInternal,
    daysLoaded,
    daysEmpty,
    loadingDays,
    roundTripDays,
    tripsPerYear,
    buy,
    running,
  };
}

/**
 * The cheap half: what the trip earns and costs for a given load and fleet size. Takes the
 * setup above so both can be varied without recomputing physics; the formula still lives in
 * this one module.
 */
/**
 * What the money half of a trip needs on top of a computed setup. The setup already carries
 * the physics, so the vehicles, the route and the settings that shaped it are not asked for
 * again — only the cargo being paid for and the load actually hauled.
 */
export interface TripMoneyParams {
  cargo: Cargo;
  /** Payment rate of the cargo in the selected economy. */
  payment: number;
  distanceTiles: number;
  game?: GameSettings;
  /** Cargo is under subsidy: income is multiplied (difficulty.subsidy_multiplier). */
  subsidised?: boolean;
  /** Cargo actually hauled per trip; defaults to the consist capacity. */
  cargoPerTrip?: number;
  /** Identical consists running the route; money is stated for all of them. Defaults to 1. */
  fleetSize?: number;
}

export function tripMoney(setup: TripSetup, params: TripMoneyParams): TripEconomics {
  const game = params.game ?? DEFAULT_GAME_SETTINGS;
  const { cargo, distanceTiles } = params;
  const { capacity, daysLoaded, roundTripDays, loadingDays, tripsPerYear, buy, running } = setup;

  const cargoPerTrip = params.cargoPerTrip ?? capacity;
  const incomePerTrip =
    transportedGoodsIncome(
      cargoPerTrip,
      distanceTiles,
      transitPeriodsFromDays(daysLoaded),
      { currentPayment: params.payment, transitPeriods: cargo.transit_periods },
      game.cargoAgingRate,
      game.jgrpp ? game.paymentAlgorithm : 'modern',
    ) * (params.subsidised ? subsidyFactor(game.subsidyMultiplier) : 1);

  const fleetSize = params.fleetSize ?? 1;
  // JGRPP can charge less while a vehicle stands still: split the year by that share.
  const stoppedShare = roundTripDays > 0 ? loadingDays / roundTripDays : 0;
  const runningCostPerYear =
    running * fleetSize * (1 - stoppedShare + stoppedShare / stoppedCostDivisor(game));
  const buyCostTotal = buy * fleetSize;
  const profitPerYear = incomePerTrip * tripsPerYear * fleetSize - runningCostPerYear;

  return {
    capacity,
    cargoPerTrip,
    loadedSpeedInternal: setup.loadedSpeedInternal,
    emptySpeedInternal: setup.emptySpeedInternal,
    daysLoaded,
    daysEmpty: setup.daysEmpty,
    loadingDays,
    roundTripDays,
    tripsPerYear,
    incomePerTrip,
    runningCostPerYear,
    buyCostTotal,
    profitPerYear,
    paybackYears: profitPerYear > 0 ? buyCostTotal / profitPerYear : null,
  };
}

export function tripEconomics(params: TripParams): TripEconomics {
  return tripMoney(tripSetup(params), params);
}
