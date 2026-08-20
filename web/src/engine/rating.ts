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

/** Bonus for time since the last pickup, counted in rating periods (`ratingPeriodDays`). */
export function waitTimeRating(periods: number): number {
  const t = Math.min(255, Math.floor(periods));
  let rating = 0;
  if (t <= 21) rating += 25;
  if (t <= 12) rating += 25;
  if (t <= 6) rating += 45;
  if (t <= 3) rating += 35;
  return rating;
}

/** Penalty for cargo piling up; the game counts `max_waiting_cargo`, i.e. per next hop. */
export function waitingCargoRating(waitingPerHop: number): number {
  let rating = -90;
  if (waitingPerHop <= 1500) rating += 55;
  if (waitingPerHop <= 1000) rating += 35;
  if (waitingPerHop <= 600) rating += 10;
  if (waitingPerHop <= 300) rating += 20;
  if (waitingPerHop <= 100) rating += 10;
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
  /** 0..255, as the game stores it. */
  rating: number;
  /** Share of the industry output that reaches the station: (rating + 1) / 256. */
  deliveredShare: number;
  parts: {
    speed: number;
    waitTime: number;
    waitingCargo: number;
    age: number;
    statue: number;
  };
}

const clampRating = (v: number) => Math.max(0, Math.min(255, v));

/**
 * Estimate of the rating a station settles at when one train type serves it at a fixed
 * interval. Both the pickup counter and the waiting pile restart at zero after every
 * load, so the target rating is averaged over the interval rather than taken at its
 * worst point — the in-game rating only moves ±2 per period and smooths the same way.
 *
 * Assumes the train takes everything that accumulated (which is what `trainsNeeded`
 * ensures) and manual cargo distribution, where the game halves the waiting amount
 * because "anywhere" is the only next hop.
 */
export function estimateStationRating(p: StationRatingParams): StationRating {
  const speed = speedRating(p.maxSpeedInternal);
  const age = vehicleAgeRating(p.vehicleAgeYears ?? 0, p.jgrpp);
  const statue = p.statue ? 26 : 0;
  const periodDays = effectiveRatingPeriodDays(p.dayLengthFactor);
  const periods = Math.max(1, Math.min(255, Math.round(p.pickupIntervalDays / periodDays)));

  let waitTime = 0;
  let waitingCargo = 0;
  // how much of the output actually arrives depends on the rating, which depends on the
  // pile the arrivals build up — a few passes are enough for that loop to settle
  let share = 1;
  for (let pass = 0; pass < 5; pass++) {
    let waitSum = 0;
    let cargoSum = 0;
    for (let t = 1; t <= periods; t++) {
      waitSum += waitTimeRating(t);
      const waiting = (p.cargoPerDay * share * t * periodDays) / 2;
      cargoSum += waitingCargoRating(waiting);
    }
    waitTime = waitSum / periods;
    waitingCargo = cargoSum / periods;
    share = (clampRating(speed + waitTime + waitingCargo + age + statue) + 1) / 256;
  }

  const rating = clampRating(speed + waitTime + waitingCargo + age + statue);
  return {
    rating,
    deliveredShare: (rating + 1) / 256,
    parts: { speed, waitTime, waitingCargo, age, statue },
  };
}
