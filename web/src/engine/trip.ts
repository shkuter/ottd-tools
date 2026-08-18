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
   * Cargo actually hauled per trip when the source industry cannot fill the train.
   * Defaults to the consist capacity.
   */
  cargoPerTrip?: number;
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
  incomePerTrip: number;
  /** Running cost over a calendar year, discounted for time spent stopped (JGRPP). */
  runningCostPerYear: number;
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

export function tripEconomics(params: TripParams): TripEconomics {
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

  const { buy, running } = consistMoney(entries, meta, game, calc);
  // JGRPP can charge less while a vehicle stands still: split the year by that share.
  const stoppedShare = roundTripDays > 0 ? loadingDays / roundTripDays : 0;
  const runningCostPerYear =
    running * (1 - stoppedShare + stoppedShare / stoppedCostDivisor(game));
  const profitPerYear = incomePerTrip * tripsPerYear - runningCostPerYear;

  return {
    capacity,
    cargoPerTrip,
    loadedSpeedInternal,
    emptySpeedInternal,
    daysLoaded,
    daysEmpty,
    loadingDays,
    roundTripDays,
    tripsPerYear,
    incomePerTrip,
    runningCostPerYear,
    buyCostTotal: buy,
    profitPerYear,
    paybackYears: profitPerYear > 0 ? buy / profitPerYear : null,
  };
}
