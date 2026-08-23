/**
 * Accumulation wait: the part of a round trip a consist under a full-load order spends
 * standing while the source builds its load up.
 *
 * The loop is closed — the wait depends on the flow, the flow on the delivered share, the
 * share on the interval, the interval on the round trip, the round trip on the wait. In a
 * steady state it resolves without iterating: a fleet that leaves only when full cannot come
 * round faster than the source refills it, so
 *
 *   round trip = max(physical round trip, fleet × capacity ÷ accumulation rate)
 *
 * The rate is what the station is *offered* — the flow with the delivered share already taken
 * out, the same figure the haul is counted from (ADR-0001). Each branch reads its own share:
 * a consist that stands for a full load calls less often, so its station rating is lower and
 * the industry hands it less. That is why waiting can cost a route part of its haul instead of
 * merely re-spacing the same deliveries — and why the waiting branch can never haul more over
 * a year than the one that leaves with what accumulated.
 *
 * Assumes the flow splits evenly between the trains of the fleet. Real consists bunch up and
 * wait unevenly; this is the average of that.
 */
import { type StationRating, estimateStationRating } from './rating';
import { type GameSettings, effectiveDayLength, engineDaysPerYear } from './settings';

/** The route a branch is measured on: what one consist must fill, and how many share it. */
export interface RouteLoad {
  /** Round trip without any waiting: both legs plus the stops. */
  physicalRoundTripDays: number;
  /** What one consist has to accumulate before it may leave. */
  capacity: number;
  /** Identical consists sharing the same flow. */
  fleetSize: number;
  game: GameSettings;
}

export interface AccumulationParams extends RouteLoad {
  /**
   * Cargo the station is offered over an economy year, delivered share included.
   * `0` means "not stated": with no flow there is nothing to wait for and the branch
   * collapses onto the physical round trip.
   */
  offeredPerYear: number;
}

export interface Accumulation {
  /** Round trip including the wait. */
  roundTripDays: number;
  /** Days of it spent waiting; `0` when the source outruns the fleet or is not stated. */
  waitDays: number;
}

/**
 * Cargo the station gathers per engine day. A JGRPP day length factor stretches the economy
 * year in those days without changing the monthly output, so a slowed economy gathers
 * proportionally less per day, and filling a fleet takes proportionally longer. The wait
 * itself grows faster than that: the physical round trip it is measured against does not
 * move with the factor.
 */
function accumulationRatePerDay(offeredPerYear: number, game: GameSettings): number {
  if (!(offeredPerYear > 0)) return 0;
  return offeredPerYear / engineDaysPerYear(game);
}

/** The closed form above. */
export function accumulationRoundTrip(p: AccumulationParams): Accumulation {
  const ratePerDay = accumulationRatePerDay(p.offeredPerYear, p.game);
  const physical = p.physicalRoundTripDays;
  const load = p.fleetSize * p.capacity;
  // No flow, no capacity, no fleet: the wait is not defined rather than infinite, and the
  // branch has to stay on the physical round trip instead of poisoning it with NaN.
  if (!(ratePerDay > 0) || !(load > 0) || !Number.isFinite(physical)) {
    return { roundTripDays: physical, waitDays: 0 };
  }
  const filling = load / ratePerDay;
  const roundTripDays = Math.max(physical, filling);
  return { roundTripDays, waitDays: roundTripDays - physical };
}

export interface WaitingSettleParams extends RouteLoad {
  /** Full industry output per economy year, before the delivered share. */
  flowPerYear: number;
  /** Rating the physical interval settles at — where the walk below starts. */
  physicalRating: StationRating;
  /**
   * Rating a pickup interval settles at; the optimizer hands in a cached one. The walk below
   * always asks for a visit that clears the platform, because that is what a full-load order
   * does — so the second argument is not a knob this branch turns.
   */
  ratingAt: (at: VisitLoad) => StationRating;
}

/** How many passes the settling walk may spend before it gives up on convergence. */
export const SETTLE_PASS_CAP = 8;

export interface WaitingSettlement {
  /** Rating the waiting branch settles at: its own interval, not the physical one. */
  rating: StationRating;
  /** What the station is offered at that rating. */
  offeredPerYear: number;
}

/**
 * Where the waiting branch settles. A consist standing for a full load visits the station
 * less often, and a station visited less often is handed less: the interval feeds the rating,
 * the rating the flow, the flow the wait, and the wait the interval again.
 *
 * Walked until the rating stops moving rather than cut at a fixed number of passes — waiting
 * can only ever lower a rating, so the round trip climbs one way across 256 quantised ratings
 * and settles in a pass or two; the cap is a backstop, not the exit. This is what makes the
 * full-load order able to cost a route part of its haul instead of merely re-spacing the same
 * deliveries.
 */
export function settleWaitingBranch(p: WaitingSettleParams): WaitingSettlement {
  // Backstop only: the walk exits when the rating stops moving, which it does in a pass or
  // two. A rating that never repeats itself would otherwise loop forever.
  let rating = p.physicalRating;
  let offeredPerYear = p.flowPerYear * rating.deliveredShare;
  for (let pass = 0; pass < SETTLE_PASS_CAP; pass++) {
    const settled = accumulationRoundTrip({
      physicalRoundTripDays: p.physicalRoundTripDays,
      capacity: p.capacity,
      fleetSize: p.fleetSize,
      offeredPerYear,
      game: p.game,
    });
    // The visit carries off whatever is standing there, not merely its capacity: a consist
    // under a full-load order leaves the moment the platform holds a full load, so it never
    // leaves a pile behind. What balances the flow here is the length of the wait, which the
    // walk above is already solving for — reading the rating against the capacity as well
    // would make the estimate explain that same balance a second time, with a backlog, and
    // the route would be flagged as short of trains for standing still on purpose.
    const next = p.ratingAt({
      pickupIntervalDays: settled.roundTripDays / p.fleetSize,
      visitCapacity: Infinity,
    });
    if (next.rating === rating.rating) break;
    rating = next;
    offeredPerYear = p.flowPerYear * next.deliveredShare;
  }
  return { rating, offeredPerYear };
}

/**
 * Industry output is stated per economy month, trips are counted per economy year. Negative
 * or missing output means "not stated" and reads as no flow at all.
 */
export function flowPerYearFromMonthly(productionPerMonth: number | undefined): number {
  return Math.max(0, productionPerMonth ?? 0) * 12;
}

/** How often a consist calls and how much it takes away — the part a branch varies. */
export interface VisitLoad {
  pickupIntervalDays: number;
  visitCapacity: number;
}

/** One visit of a consist to the station: `VisitLoad` plus the speed the rating reads. */
export interface RouteVisit extends VisitLoad {
  /** Consist top speed, internal units (what the game records as `last_speed`). */
  maxSpeedInternal: number;
}

/**
 * The stated yearly flow as cargo per engine day — the unit every accumulation on a route is
 * counted in. One helper rather than the division at each call site: the station rating and
 * the caches built on it have to agree on the flow to the tonne.
 */
export function flowPerEngineDay(flowPerYear: number, game: GameSettings): number {
  return flowPerYear / engineDaysPerYear(game);
}

/**
 * Station rating of a route as a function of how often it is served and how much a visit
 * carries off. The parts that do not move between candidates — the flow per day and the game
 * settings — are bound here, so both tabs read the rating from one place instead of
 * assembling the call themselves. The caller still supplies the interval, the consist's speed
 * limit and its capacity, and may cache on top.
 */
export function routeStationRating(
  flowPerYear: number,
  game: GameSettings,
  /** Age of the consist in years; the game pays a rating bonus for a young one. */
  vehicleAgeYears = 0,
): (visit: RouteVisit) => StationRating {
  const cargoPerDay = flowPerEngineDay(flowPerYear, game);
  return ({ pickupIntervalDays, maxSpeedInternal, visitCapacity }) =>
    estimateStationRating({
      pickupIntervalDays,
      maxSpeedInternal,
      cargoPerDay,
      visitCapacity,
      jgrpp: game.jgrpp,
      dayLengthFactor: effectiveDayLength(game),
      vehicleAgeYears,
    });
}

export interface BranchFlowParams extends RouteLoad {
  /** Trips one consist makes a year on the physical round trip. */
  tripsPerYear: number;
  /** Full industry output per economy year, before the delivered share. */
  flowPerYear: number;
  /**
   * Rating a pickup interval settles at for a visit of that size; the optimizer hands in a
   * cached one. The capacity travels with the call rather than being bound by the caller so
   * that the rating is always read for the same visit the flow below is shared out over.
   */
  ratingAt: (at: VisitLoad) => StationRating;
}

/** Where one loading branch settles: the rating it earns and the flow that follows from it. */
export interface BranchFlow {
  /** Rating the branch settles at; `null` when no output is stated. */
  rating: StationRating | null;
  /** What the station is offered at that rating. */
  offeredPerYear: number;
}

export interface BranchFlows {
  /** The branch that leaves with what accumulated. */
  runsWithWhatAccumulated: BranchFlow;
  /** The branch that waits to be filled; the same as above with nothing to wait for. */
  waitsForFullLoad: BranchFlow;
  /** What one train of the fleet carries in the branch that leaves with what accumulated. */
  cargoPerTrip: number;
  /** Whether the source leaves anything to wait for at all. */
  canWait: boolean;
}

/**
 * Where both branches of a route settle: the flow the industry actually hands over and the
 * load one train of the fleet gets out of it. Both tabs read this — a route entered by hand
 * must settle exactly where the same route settles inside the optimizer's search.
 */
export function settleBranchFlows(p: BranchFlowParams): BranchFlows {
  const { capacity, fleetSize, flowPerYear } = p;
  // How often the station is served decides its rating, and the rating decides how much of
  // the output the industry hands over at all. This is the interval of a consist that leaves
  // with what accumulated: the physical round trip shared by the fleet.
  // A visit carries off at most the capacity: what the interval piles up beyond it stays on
  // the platform and costs the station rating. Below, `cargoPerTrip` takes the other side of
  // that same `min` — what a visit finds when the fleet is not the limit.
  const rating =
    flowPerYear > 0
      ? p.ratingAt({ pickupIntervalDays: p.physicalRoundTripDays / fleetSize, visitCapacity: capacity })
      : null;

  const offeredPerYear = flowPerYear * (rating?.deliveredShare ?? 1);

  // What the station hands over is shared by the fleet: a train beyond what it can fill adds
  // cost without adding cargo. The share cuts the flow here rather than the income later, so
  // a train that finds a full pile waiting still earns on all of it (ADR-0001). Physics stays
  // on a full load either way.
  const cargoPerTrip =
    flowPerYear > 0 ? Math.min(capacity, offeredPerYear / (fleetSize * p.tripsPerYear)) : capacity;

  // A source that already fills the consist leaves nothing to wait for, so the branches
  // cannot differ and the settling walk is skipped outright. Worth testing up front: this is
  // the common case, and it is the whole cost of the branch dimension.
  //
  // A station that never empties is that same case: it is handed exactly what a visit carries
  // off, so the train leaves full and waiting for a full load buys nothing — the platform
  // already holds one. Read off the load alone the two look alike, which is why the test is
  // whether the station empties rather than whether the train filled up.
  const canWait =
    flowPerYear > 0 &&
    rating !== null &&
    rating.backlog === 0 &&
    cargoPerTrip < capacity - 1e-9;
  const plain = { rating, offeredPerYear };
  if (!canWait || rating === null) {
    return {
      runsWithWhatAccumulated: plain,
      waitsForFullLoad: plain,
      cargoPerTrip,
      canWait: false,
    };
  }

  const settled = settleWaitingBranch({
    physicalRoundTripDays: p.physicalRoundTripDays,
    capacity,
    fleetSize,
    flowPerYear,
    game: p.game,
    physicalRating: rating,
    ratingAt: p.ratingAt,
  });
  return {
    runsWithWhatAccumulated: plain,
    waitsForFullLoad: { rating: settled.rating, offeredPerYear: settled.offeredPerYear },
    cargoPerTrip,
    canWait: true,
  };
}
