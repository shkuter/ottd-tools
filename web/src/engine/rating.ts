/**
 * Station rating — station_cmd.cpp `UpdateStationRating` (vanilla) and
 * `GetTargetRating` (JGRPP), which agree as long as the JGRPP-only tweaks
 * `station.cargo_class_rating_wait_time` and `station.station_size_rating_cargo_amount`
 * stay off (both default to false).
 *
 * The rating decides how much of an industry's output reaches the station at all:
 * `MoveGoodsToStation` multiplies the produced amount by `rating + 1` and
 * `UpdateStationWaiting` shifts it right by 8, so the delivered share is
 * `(rating + 1) / 256` — that is the "transported" percentage shown in game.
 */

/** Rating counter period: STATION_RATING_TICKS (185) / DAY_TICKS (74). */
export const RATING_PERIOD_DAYS = 185 / 74;

/**
 * Length of one rating period in game days. `OnTick_Station` only runs from
 * `CallLandscapeTick()`, which JGRPP calls in the "full" tick of a day — the one where
 * `_tick_skip_counter` reached `DayLengthFactor()` (openttd.cpp `StateGameLoop`). So the
 * 185-tick counter advances once per day length factor ticks and the period stretches with
 * it; vanilla ticks the landscape every tick, hence a factor of 1.
 */
export function effectiveRatingPeriodDays(dayLengthFactor: number): number {
  return RATING_PERIOD_DAYS * dayLengthFactor;
}

/**
 * Bonus for the speed of the last train. The game stores `cached_max_speed` (the
 * consist's top speed in internal units, capped at 255), not the speed it actually ran.
 */
export function speedRating(maxSpeedInternal: number): number {
  const b = Math.min(255, Math.floor(maxSpeedInternal)) - 85;
  return b >= 0 ? b >> 2 : 0;
}

/**
 * Steps of the wait-time bonus: an interval of at most `periods` periods collects `bonus`.
 * Written as data because the interval column names the same steps in days, and in days
 * they stretch with the day length factor (`waitTimeThresholdDays`).
 */
export const WAIT_TIME_STEPS = [
  { periods: 21, bonus: 25 },
  { periods: 12, bonus: 25 },
  { periods: 6, bonus: 45 },
  { periods: 3, bonus: 35 },
] as const;

/** Bonus for time since the last pickup, counted in rating periods (`ratingPeriodDays`). */
export function waitTimeRating(periods: number): number {
  const t = Math.min(255, Math.floor(periods));
  let rating = 0;
  for (const step of WAIT_TIME_STEPS) if (t <= step.periods) rating += step.bonus;
  return rating;
}

/**
 * The wait-time steps as pickup intervals in game days. A JGRPP day holds `dayLengthFactor`
 * times fewer rating periods, so with a slowed economy the thresholds sit that much further
 * out — 52.5 days becomes 262.5 at factor 5.
 */
export function waitTimeThresholdDays(dayLengthFactor: number): number[] {
  const periodDays = effectiveRatingPeriodDays(dayLengthFactor);
  return WAIT_TIME_STEPS.map((step) => step.periods * periodDays);
}

/**
 * Steps of the waiting-cargo penalty: a pile of at most `perHop` collects `bonus` on top of
 * the floor. Written as data because the backlog ceiling is derived from the last step, and
 * reading it off the list beats keeping a second copy of the number.
 */
const WAITING_CARGO_STEPS = [
  { perHop: 1500, bonus: 55 },
  { perHop: 1000, bonus: 35 },
  { perHop: 600, bonus: 10 },
  { perHop: 300, bonus: 20 },
  { perHop: 100, bonus: 10 },
] as const;

/** Floor of the penalty: what a station past every step collects. */
const WAITING_CARGO_FLOOR = -90;

/**
 * Waiting amount per hop past which the penalty stops moving: `waitingCargoRating` sits at
 * its floor from here on, so a station this far behind cannot be made to look worse by
 * falling further behind.
 */
const MAX_PENALISED_WAITING_PER_HOP = WAITING_CARGO_STEPS[0].perHop;

/**
 * Ceiling for the backlog an estimate considers. The game counts the pile per next hop, which
 * under manual cargo distribution is half of what stands on the platform, and the last step is
 * inclusive: a pile earns the floor penalty from 1501 per hop, so from 3002 on the platform.
 * Growing it past that changes no number.
 */
export const MAX_BACKLOG = 2 * (MAX_PENALISED_WAITING_PER_HOP + 1);

/** Penalty for cargo piling up; the game counts `max_waiting_cargo`, i.e. per next hop. */
export function waitingCargoRating(waitingPerHop: number): number {
  let rating = WAITING_CARGO_FLOOR;
  for (const step of WAITING_CARGO_STEPS) if (waitingPerHop <= step.perHop) rating += step.bonus;
  return rating;
}

/** Age of the last train in years — JGRPP is far more forgiving than vanilla here. */
export function vehicleAgeRating(years: number, jgrpp: boolean): number {
  const [old, mid, young] = jgrpp ? [30, 20, 10] : [3, 2, 1];
  let rating = 0;
  if (years < old) rating += 10;
  if (years < mid) rating += 10;
  if (years < young) rating += 13;
  return rating;
}

export interface StationRatingParams {
  /** Days between train visits: round trip / number of trains on the route. */
  pickupIntervalDays: number;
  /** Consist top speed, internal units (what the game records as `last_speed`). */
  maxSpeedInternal: number;
  /** Cargo produced per day, in the same days as the interval. */
  cargoPerDay: number;
  /**
   * Cargo one visit takes away — the consist's capacity. `Infinity` is the pre-fix
   * assumption that the train clears the platform whatever it holds. Required rather than
   * defaulted, like `dayLengthFactor`: a forgotten argument would silently drop the backlog
   * of a fleet that cannot keep up, which is the whole point of the estimate.
   */
  visitCapacity: number;
  jgrpp: boolean;
  /**
   * JGRPP day length factor (`effectiveDayLength`), stretching the rating period.
   * Required rather than defaulted: vanilla and JGRPP-off already get 1 from that helper,
   * and a forgotten argument would silently bring the pre-fix numbers back.
   */
  dayLengthFactor: number;
  /** Age of the train in years (0 = just bought). */
  vehicleAgeYears?: number;
  /** Company statue in the station's town. */
  statue?: boolean;
}

export interface StationRating {
  /**
   * 0..255, on the scale the game stores — but not rounded to it. A station balances between
   * two penalty steps rather than on one, and this is the average of the two, so it carries a
   * fraction the game itself never shows. Callers that cache or compare ratings depend on that
   * fraction surviving: it is what keeps the share below in step with the pile above.
   */
  rating: number;
  /**
   * Cargo the fleet never gets round to, standing on the platform at every visit. `0` when
   * the fleet clears the flow; capped at `MAX_BACKLOG`, past which the game stops counting.
   */
  backlog: number;
  /** Share of the industry output that reaches the station: (rating + 1) / 256. */
  deliveredShare: number;
  parts: {
    speed: number;
    waitTime: number;
    waitingCargo: number;
    age: number;
    statue: number;
    /**
     * How far the settled rating sits from what the parts above add up to. The parts move in
     * steps, and a station balances between two of them rather than on one — it swings across
     * the step, handing over the average of the two — so this is normally non-zero, on a
     * station that empties as much as on one that does not; it is `0` only where the balance
     * happens to land on a step exactly. Taken against the raw sum rather than the clamped
     * step, so the parts plus this always come to the rating, including where the sum runs
     * past either end of the scale.
     */
    swing: number;
  };
}

const clampRating = (v: number) => Math.max(0, Math.min(255, v));

/**
 * Cargo the station is handed between two visits at a given share — what one visit has to
 * carry off to leave nothing standing. Takes the same named figures as the test below, for
 * the same reason: three cargo quantities in a row are told apart by name, not by position.
 */
function arrivalsBetweenVisits(flow: Omit<VisitFlow, 'visitCapacity'>): number {
  return flow.cargoPerDay * flow.deliveredShare * flow.pickupIntervalDays;
}

/** What a station is offered between two visits, and what one visit carries off. */
export interface VisitFlow {
  /** Cargo produced per day, in the same days as the interval. */
  cargoPerDay: number;
  /** Share of that production the station is handed at its rating. */
  deliveredShare: number;
  /** Days between train visits. */
  pickupIntervalDays: number;
  /** Cargo one visit takes away. */
  visitCapacity: number;
}

/**
 * Does one visit carry off everything the interval brings in? This is the test the estimate
 * settles its backlog by, and the one a caller caching ratings needs to know whether a rating
 * computed without a fleet limit still applies — so both read it from here rather than each
 * spelling out the comparison. Named arguments because three of the four are cargo figures
 * that would otherwise be told apart only by position.
 */
export function visitClearsFlow(flow: VisitFlow): boolean {
  return arrivalsBetweenVisits(flow) <= flow.visitCapacity;
}

/**
 * Rating periods one pickup interval covers — the counter is capped at 255 and never
 * reads below 1. Exported because it is what a rating result actually depends on: two
 * intervals landing on the same period count give the same rating, which lets callers
 * that sweep many consists cache by it.
 */
export function ratingPeriods(pickupIntervalDays: number, dayLengthFactor: number): number {
  const periodDays = effectiveRatingPeriodDays(dayLengthFactor);
  return Math.max(1, Math.min(255, Math.round(pickupIntervalDays / periodDays)));
}

/**
 * Share interval below which the search stops: a sixty-fourth of the step the game itself
 * counts in, so the balance is pinned far finer than any rating it can produce.
 */
const SHARE_EPSILON = 1 / 256 / 64;

/**
 * Backlog interval below which the search stops: half a tonne moves no penalty step. Halving
 * the ceiling reaches it in thirteen passes, so this is what ends the search — there is no
 * second, looser limit that could quietly cut it short.
 */
const BACKLOG_EPSILON = 0.5;

/**
 * Least value in `[lo, hi]` at which a monotone test holds, found by halving. Both balances
 * this module looks for are of that shape — the share a station reproduces, and the pile that
 * costs it a given rating — and both must land where they land regardless of how long the
 * search runs, which is what rules out walking towards them a step at a time.
 */
function leastWhere(
  lo: number,
  hi: number,
  epsilon: number,
  holds: (value: number) => boolean,
): number {
  while (hi - lo > epsilon) {
    const mid = (lo + hi) / 2;
    if (holds(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

interface SettledShare {
  waitTime: number;
  waitingCargo: number;
  share: number;
}

/**
 * Average wait-time bonus over an interval of `periods` periods. The counter restarts at
 * every pickup, so the interval walks the steps from the top down and the rating the station
 * holds is the mean of what it reads on the way.
 */
function averageWaitTime(periods: number): number {
  let sum = 0;
  for (let t = 1; t <= periods; t++) sum += waitTimeRating(t);
  return sum / periods;
}

/**
 * Average waiting-cargo penalty over the same interval, summed step by step rather than
 * period by period. The pile grows linearly — `backlog` at the pickup plus `perPeriod` on
 * every period after it — so each threshold is crossed once, at a period that can be solved
 * for. Two hundred and fifty-five periods thus cost five divisions instead of 255 comparisons,
 * which is what makes it affordable to search for the share rather than iterate towards it.
 */
function averageWaitingCargo(backlog: number, perPeriod: number, periods: number): number {
  let sum = WAITING_CARGO_FLOOR * periods;
  for (const step of WAITING_CARGO_STEPS) {
    // Periods whose pile is still within this step: `(backlog + perPeriod * t) / 2 <= perHop`.
    const within =
      perPeriod > 0
        ? Math.min(periods, Math.max(0, Math.floor((2 * step.perHop - backlog) / perPeriod)))
        : backlog / 2 <= step.perHop
          ? periods
          : 0;
    sum += step.bonus * within;
  }
  return sum / periods;
}

/**
 * Where the delivered share settles for a given backlog: the share that reproduces itself
 * once the station has been rated on the pile it builds.
 *
 * Found by halving rather than by feeding the result back in. The loop is closed — a larger
 * share piles up more cargo, a larger pile costs rating, a lower rating cuts the share — and
 * feeding it back only converges while that response stays gentle. On a large industry one
 * penalty step moves the share further than the share moved the pile, so the iteration
 * oscillates and lands on the floor of 1/256, which reads as a bigger source being hauled
 * worse. What the loop does have is monotonicity: the share it returns never rises with the
 * share it is given, so the two cross exactly once and that crossing can be searched for.
 */
function settleShare(
  p: StationRatingParams,
  periods: number,
  periodDays: number,
  fixedParts: number,
  backlog: number,
): SettledShare {
  const waitTime = averageWaitTime(periods);
  const ratedAt = (share: number) => {
    const waitingCargo = averageWaitingCargo(
      backlog,
      p.cargoPerDay * share * periodDays,
      periods,
    );
    return {
      waitingCargo,
      share: (clampRating(fixedParts + waitTime + waitingCargo) + 1) / 256,
    };
  };

  // The station can hand over no less than the floor share and no more than everything; one
  // that reproduces even a full share is already at the top and needs no search.
  const atFull = ratedAt(1);
  if (atFull.share >= 1) return { waitTime, waitingCargo: atFull.waitingCargo, share: 1 };
  // Where the two sides cross inside a penalty step, the crossing is the share; where a step
  // falls between them, this is the balance either side of it, which is what the game swings
  // around rather than settling on.
  const share = leastWhere(1 / 256, 1, SHARE_EPSILON, (at) => ratedAt(at).share < at);
  return { waitTime, waitingCargo: ratedAt(share).waitingCargo, share };
}

/**
 * Estimate of the rating a station settles at when one train type serves it at a fixed
 * interval. The pickup counter restarts at zero after every load, so the target rating is
 * averaged over the interval rather than taken at its worst point — the in-game rating only
 * moves ±2 per period and smooths the same way.
 *
 * The waiting pile restarts at zero only for a fleet that clears the flow. One that does not
 * leaves a backlog standing at every visit, and that backlog is what the estimate solves for:
 * the loop is closed, since a bigger pile costs the station rating, a lower rating means the
 * industry hands over less, and less handed over is what lets the fleet catch up with it.
 *
 * Assumes manual cargo distribution, where the game halves the waiting amount because
 * "anywhere" is the only next hop.
 */
export function estimateStationRating(p: StationRatingParams): StationRating {
  const speed = speedRating(p.maxSpeedInternal);
  const age = vehicleAgeRating(p.vehicleAgeYears ?? 0, p.jgrpp);
  const statue = p.statue ? 26 : 0;
  const fixed = speed + age + statue;
  const periodDays = effectiveRatingPeriodDays(p.dayLengthFactor);
  const periods = ratingPeriods(p.pickupIntervalDays, p.dayLengthFactor);
  const settleAt = (backlog: number) => settleShare(p, periods, periodDays, fixed, backlog);

  const clears = settleAt(0);
  let settled = clears;
  let backlog = 0;
  let outrunsAtCeiling = false;

  // The share is read off the point where the station balances, never off the penalty step
  // below it. The parts of a rating move in steps, so the balance rarely lands on one: the
  // game swings around it instead. Reading the step would make the share jump — a step is
  // 1/256 of the output, so on a large industry a bigger source could be handed fewer tonnes
  // — and would leave the share the estimate decides a backlog by different from the share it
  // reports, which is a band of capacities that carry the whole flow yet look short of trains.
  //
  // Two things can balance a station: the rating it settles at on its own, and, when the fleet
  // cannot keep up, what a visit carries off. Whichever binds first is the share.
  const balanceShare = Math.min(
    clears.share,
    p.visitCapacity /
      arrivalsBetweenVisits({
        cargoPerDay: p.cargoPerDay,
        deliveredShare: 1,
        pickupIntervalDays: p.pickupIntervalDays,
      }),
  );

  const balanceRating = clampRating(balanceShare * 256 - 1);

  const clearsFlow = visitClearsFlow({
    cargoPerDay: p.cargoPerDay,
    deliveredShare: clears.share,
    pickupIntervalDays: p.pickupIntervalDays,
    visitCapacity: p.visitCapacity,
  });

  if (!clearsFlow) {
    // The pile grows until the rating it costs has cut the flow down to what the fleet does
    // carry — or until it is large enough that the game stops counting it. The share at that
    // point is already known (the balance above), so what is left to find is the pile that
    // earns it: the penalty only falls as the pile grows, so the point is found by halving the
    // interval it lies in rather than by walking the pile up one interval at a time. Where it
    // lands must not depend on how long we spend looking.
    const penaltyAt = (pile: number) =>
      averageWaitingCargo(pile, p.cargoPerDay * balanceShare * periodDays, periods);
    const earnsBalance = (pile: number) =>
      clampRating(fixed + clears.waitTime + penaltyAt(pile)) <= balanceRating;

    // A station whose pile is at the ceiling and still outrun by its source stays there: the
    // penalty is on its floor and there is nothing left to narrow.
    outrunsAtCeiling = !earnsBalance(MAX_BACKLOG);
    backlog = outrunsAtCeiling
      ? MAX_BACKLOG
      : leastWhere(0, MAX_BACKLOG, BACKLOG_EPSILON, earnsBalance);
    settled = { waitTime: clears.waitTime, waitingCargo: penaltyAt(backlog), share: balanceShare };
  }

  const stepRating = clampRating(fixed + settled.waitTime + settled.waitingCargo);

  // Past the ceiling the station is handed the floor share however far behind the fleet falls,
  // and the pile grows without settling: there is no balance to read, only the step.
  const rating = outrunsAtCeiling ? stepRating : balanceRating;

  return {
    rating,
    backlog,
    deliveredShare: (rating + 1) / 256,
    parts: {
      speed,
      waitTime: settled.waitTime,
      waitingCargo: settled.waitingCargo,
      age,
      statue,
      swing: rating - (fixed + settled.waitTime + settled.waitingCargo),
    },
  };
}
