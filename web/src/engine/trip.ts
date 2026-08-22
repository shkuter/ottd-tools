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
  accumulationRoundTrip,
  flowPerYearFromMonthly,
  routeStationRating,
  settleBranchFlows,
} from './waiting';
import type { StationRating } from './rating';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
  engineDaysPerYear,
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
  /** Loading branch: the consist leaves only when full. Defaults to false. */
  waitForFullLoad?: boolean;
  /** Cargo the station is offered over an economy year; only the waiting branch reads it. */
  offeredPerYear?: number;
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
  /** Which loading branch these numbers are for. */
  waitForFullLoad: boolean;
  /** Days of the round trip spent waiting for the load to accumulate (0 outside that branch). */
  waitDays: number;
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
      ? engineDaysPerYear(game) / roundTripDays
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
  /**
   * Loading branch. `false` (the default) is the plain route: the consist leaves with what
   * accumulated, `cargoPerTrip` caps the load and the round trip is the physical one. `true`
   * is the full-load order: the load is always the capacity and the round trip grows by the
   * time the source needs to build it up.
   */
  waitForFullLoad?: boolean;
  /**
   * Cargo the station is offered over an economy year, delivered share included — the flow
   * the waiting branch accumulates from. Only that branch reads it; without it there is
   * nothing to wait for and both branches agree.
   */
  offeredPerYear?: number;
}

export function tripMoney(setup: TripSetup, params: TripMoneyParams): TripEconomics {
  const game = params.game ?? DEFAULT_GAME_SETTINGS;
  const { cargo, distanceTiles } = params;
  const { capacity, daysLoaded, loadingDays, buy, running } = setup;
  const fleetSize = params.fleetSize ?? 1;
  const waitForFullLoad = params.waitForFullLoad ?? false;

  // The full-load branch leaves only when the consist is full, so its round trip cannot be
  // shorter than the time the source needs to fill the whole fleet. Everything downstream —
  // trips per year, the interval callers derive from the round trip — follows from that.
  const accumulation = waitForFullLoad
    ? accumulationRoundTrip({
        physicalRoundTripDays: setup.roundTripDays,
        capacity,
        fleetSize,
        offeredPerYear: params.offeredPerYear ?? 0,
        game,
      })
    : null;
  const waitDays = accumulation?.waitDays ?? 0;
  const roundTripDays = accumulation?.roundTripDays ?? setup.roundTripDays;
  const tripsPerYear =
    waitDays > 0
      ? engineDaysPerYear(game) / roundTripDays
      : setup.tripsPerYear;

  // Waiting for a full load means exactly that: the cap the flow puts on a train that leaves
  // with what accumulated does not apply, because this one does not leave until it is full.
  const cargoPerTrip = waitForFullLoad ? capacity : (params.cargoPerTrip ?? capacity);
  // Cargo ages in the wagons, not on the platform — only `VehicleCargoList::AgeCargo` exists
  // (`cargopacket.cpp`) — and the game pays by the average age of the packets carried
  // (`CargoList::PeriodsInTransit`). A consist under a full-load order takes its load on in
  // two parts: what piled up while it was away is loaded in one go at the start of the stop
  // and ages the whole wait, while the rest trickles in over the wait and ages half of it. At
  // an even inflow the two parts are proportional to the physical round trip and the wait.
  const ageDays =
    waitDays > 0
      ? daysLoaded +
        (waitDays * (setup.roundTripDays + waitDays / 2)) / (setup.roundTripDays + waitDays)
      : daysLoaded;
  const incomePerTrip =
    transportedGoodsIncome(
      cargoPerTrip,
      distanceTiles,
      transitPeriodsFromDays(ageDays),
      { currentPayment: params.payment, transitPeriods: cargo.transit_periods },
      game.cargoAgingRate,
      game.jgrpp ? game.paymentAlgorithm : 'modern',
    ) * (params.subsidised ? subsidyFactor(game.subsidyMultiplier) : 1);

  // JGRPP can charge less while a vehicle stands still: split the year by that share. A
  // consist waiting for its load stands at the platform just like one being loaded, so the
  // wait counts towards the same share.
  const stoppedShare = roundTripDays > 0 ? (loadingDays + waitDays) / roundTripDays : 0;
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
    waitForFullLoad,
    waitDays,
    roundTripDays,
    tripsPerYear,
    incomePerTrip,
    runningCostPerYear,
    buyCostTotal,
    profitPerYear,
    paybackYears: profitPerYear > 0 ? buyCostTotal / profitPerYear : null,
  };
}

export interface TripBranches {
  /** No full-load order: the consist leaves with whatever the station accumulated. */
  runsWithWhatAccumulated: TripEconomics;
  /** Full-load order: the consist leaves only when it is full. */
  waitsForFullLoad: TripEconomics;
  /**
   * The branches actually produce different numbers. False when the source outruns the fleet
   * — and when no flow is stated at all, because then there is nothing to wait for.
   */
  differ: boolean;
}

/**
 * Both loading branches of the same route. Costed off one setup, so a caller comparing them
 * pays for the physics and the prices once — which is what lets the optimizer sweep the
 * branch as a dimension and the UI say what the full-load order does to a route.
 */
export function tripBranches(setup: TripSetup, params: TripMoneyParams): TripBranches {
  const runsWithWhatAccumulated = tripMoney(setup, { ...params, waitForFullLoad: false });
  const waitsForFullLoad = tripMoney(setup, { ...params, waitForFullLoad: true });
  const differ =
    waitsForFullLoad.waitDays > 0 ||
    Math.abs(waitsForFullLoad.cargoPerTrip - runsWithWhatAccumulated.cargoPerTrip) > 1e-9;
  return { runsWithWhatAccumulated, waitsForFullLoad, differ };
}

export function tripEconomics(params: TripParams): TripEconomics {
  return tripMoney(tripSetup(params), params);
}

export interface RouteWithFlowParams extends TripParams {
  /** Output of the source industry per economy month; `0` means "not stated". */
  productionPerMonth: number;
}

export interface RouteWithFlow {
  economics: TripEconomics;
  /** Rating the chosen branch settles at; `null` when no output is stated. */
  rating: StationRating | null;
}

/**
 * A single consist on a stated flow, in the branch the caller picked — what the route income
 * tab shows. The optimizer settles a route the same way for every candidate of its search;
 * this is that path for one consist, so both tabs read one model rather than two copies of it.
 */
export function routeWithFlow(params: RouteWithFlowParams): RouteWithFlow {
  const game = params.game ?? DEFAULT_GAME_SETTINGS;
  const setup = tripSetup(params);
  const flowPerYear = flowPerYearFromMonthly(params.productionPerMonth);
  if (flowPerYear <= 0) return { economics: tripMoney(setup, params), rating: null };

  // One consist, so the interval is the round trip itself. The rating reads the consist's
  // speed limit, as the game does (`economy.cpp` stores `vcache.cached_max_speed`).
  const ratingOf = routeStationRating(flowPerYear, game);
  const flows = settleBranchFlows({
    physicalRoundTripDays: setup.roundTripDays,
    tripsPerYear: setup.tripsPerYear,
    capacity: setup.capacity,
    fleetSize: 1,
    flowPerYear,
    game,
    ratingAt: (interval) => ratingOf(interval, setup.loadedPhysics.maxSpeedInternal),
  });
  const branch = params.waitForFullLoad ? flows.waitsForFullLoad : flows.runsWithWhatAccumulated;
  return {
    economics: tripMoney(setup, {
      ...params,
      cargoPerTrip: flows.cargoPerTrip,
      offeredPerYear: branch.offeredPerYear,
    }),
    rating: branch.rating,
  };
}
