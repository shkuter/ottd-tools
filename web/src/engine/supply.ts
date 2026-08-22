/**
 * Supply window — whether a fleet visits often enough to keep the receiving industry fed.
 *
 * FIRS remembers a delivery for 27 production cycles of 256 ticks (`meta.supply_window_ticks`,
 * `produce_secondary.pynml` stores 28 in a countdown and takes one off per cycle, "so we get
 * 27 cycles in total"). An input that fell out of the window stops counting as supplied, and
 * what that costs depends on the industry: secondaries convert a smaller share of everything
 * they are fed (`produce_secondary.pynml`), while primaries and ports lose a production bonus
 * they earn by volume across the window (`produce_primary.pynml`).
 *
 * The module answers about one route and one cargo. It knows nothing of the industry's other
 * inputs or of other routes feeding the same industry — callers must say so rather than let a
 * verdict read as the whole picture.
 */
import type { Industry, SupplyPool } from '../types';
import { DAY_TICKS } from './units';

/** Ceiling the summed input ratios hit, and the divisor turning them into a share. */
export const CONVERSION_CEILING = 8;

/**
 * Where the verdict stops being trustworthy. The model spaces a fleet evenly around the
 * route; real consists bunch up and arrive unevenly, so a ratio that only just clears 1 can
 * still miss the window in a real game. The constant marks that doubt rather than measuring
 * it — it wants checking in a game before any of it is quoted as fact.
 */
export const MARGINAL_RATIO = 0.85;

/**
 * Which acceptance rule the receiving industry runs on. `no-supplies` is a rule the calculator
 * knows and that happens to say "nothing": FIRS marks these primaries as taking no supplies at
 * all. That is a different answer from `unknown`, where the rule exists and is simply not
 * modelled here — keeping them apart is the engine's job, or every caller re-derives it from
 * the industry type.
 */
export type SupplyRule = 'conversion' | 'pool' | 'no-supplies' | 'unknown';

/** How a fleet's interval sits against the window. `unknown` when there is no interval yet. */
export type SupplyVerdict = 'holds' | 'marginal' | 'misses' | 'unknown';

export interface PoolOutcome {
  /** 0 = below both thresholds, 1 = improved, 2 = full. */
  level: 0 | 1 | 2;
  /** Production the industry runs at, in percent of its base. */
  productionPercent: number;
}

export interface SupplyAssessment {
  rule: SupplyRule;
  /** Pickup interval measured against the window; null when the interval is unknown. */
  ratio: number | null;
  verdict: SupplyVerdict;
  /** Smallest fleet whose ratio reaches 1; null when the round trip is unknown. */
  trainsForWindow: number | null;
  /** The window itself, in engine days, so callers can name it. */
  windowDays: number;
  /** Conversion rule only: the share of its output the industry gets, 0..1. */
  conversion: number | null;
  /** Pool rule only: which threshold the route's own deliveries reach. */
  pool: PoolOutcome | null;
  /** What this route puts into the pool over one window; null when the output is unknown. */
  deliveredPerWindow: number | null;
}

/**
 * The window in engine days — the unit the pickup interval is already in (`DAY_TICKS`).
 *
 * The conversion lives here alone so the column and the search goal cannot drift apart on it.
 * A JGRPP day length factor does not enter: it leaves both the trip and the window untouched
 * in ticks and only stretches the year (`engineDaysPerYear`).
 */
export function supplyWindowDays(windowTicks: number): number {
  return windowTicks / DAY_TICKS;
}

/**
 * Pickup interval against the window. At most 1 the industry stays supplied between visits;
 * above 1 it drops out of the window and waits.
 */
export function supplyRatio(pickupIntervalDays: number, windowTicks: number): number {
  return pickupIntervalDays / supplyWindowDays(windowTicks);
}

/**
 * Smallest fleet that keeps the industry supplied: the fleet divides the round trip, so it
 * takes as many trains as the round trip holds windows.
 */
export function trainsForWindow(roundTripDays: number, windowTicks: number): number {
  return Math.max(1, Math.ceil(roundTripDays / supplyWindowDays(windowTicks)));
}

/**
 * Share of its output a secondary gets out of what it is fed: the input ratios of the inputs
 * still inside the window, summed, capped at 8, over 8.
 *
 * Every FIRS acceptance rule falls out of this one sum — an industry the game describes as
 * "any three of five" is inputs of ratio 3, any three of which reach the ceiling — so there
 * is deliberately no branch per `accept_mode`.
 */
export function conversion(suppliedInputRatios: number[]): number {
  const summed = suppliedInputRatios.reduce((total, ratio) => total + ratio, 0);
  return Math.min(CONVERSION_CEILING, summed) / CONVERSION_CEILING;
}

/**
 * What a secondary actually produces of one output cargo: the delivered amount through the
 * conversion, then through that cargo's own output ratio under the same divisor
 * (`produce_secondary.pynml`: `(total_cargo_to_distribute_this_cycle * ratio) / 8`).
 * Both multipliers are real — dropping the output one overstates the yield.
 */
export function secondaryOutput(
  deliveredAmount: number,
  conversionShare: number,
  outputRatio: number,
): number {
  return (deliveredAmount * conversionShare * outputRatio) / CONVERSION_CEILING;
}

/**
 * Where a volume delivered across the window lands against the two thresholds. Ports pool
 * every cargo they accept into one count, which is why the caller passes a volume rather than
 * a per-cargo figure — and why the answer describes this route's contribution, not the
 * industry's state: deliveries by anyone else are invisible here.
 */
export function poolOutcome(deliveredPerWindow: number, pool: SupplyPool): PoolOutcome {
  if (deliveredPerWindow >= pool.level2.threshold) {
    return { level: 2, productionPercent: pool.level2.production_percent };
  }
  if (deliveredPerWindow >= pool.level1.threshold) {
    return { level: 1, productionPercent: pool.level1.production_percent };
  }
  return { level: 0, productionPercent: 100 };
}

/**
 * The acceptance rule an industry runs on. Pool industries carry their thresholds in the data,
 * so the rule reads off what is there; secondaries convert. Everything else — tertiaries,
 * primaries FIRS marks as taking no supplies, town producers — is `unknown`, and a caller must
 * say so instead of judging it by a rule that is not its own.
 */
export function supplyRule(industry: Industry): SupplyRule {
  if (industry.supply_pool) return 'pool';
  if (industry.type === 'IndustrySecondary') return 'conversion';
  if (industry.type === 'IndustryPrimaryNoSupplies') return 'no-supplies';
  return 'unknown';
}

/** Rules that produce no verdict at all, for opposite reasons. */
export function hasVerdict(rule: SupplyRule): boolean {
  return rule === 'conversion' || rule === 'pool';
}

/** Verdict for a ratio, with a band near 1 where evenly-spaced trains are too optimistic. */
export function verdictFor(ratio: number | null): SupplyVerdict {
  if (ratio === null || !Number.isFinite(ratio)) return 'unknown';
  if (ratio > 1) return 'misses';
  return ratio > MARGINAL_RATIO ? 'marginal' : 'holds';
}

/** A verdict that keeps the industry inside the window, marginal cases included. */
export function holdsSupplied(verdict: SupplyVerdict): boolean {
  return verdict === 'holds' || verdict === 'marginal';
}

/**
 * The receiving end of a route, as the supply rules need it. Assembled from the active
 * economy by the caller, because the engine holds no dataset of its own.
 */
export interface SupplyTarget {
  industry: Industry;
  /** Supply window in ticks, from `meta.supply_window_ticks`. */
  windowTicks: number;
  /** Input ratio of the hauled cargo at this industry; null when it states none. */
  cargoRatio: number | null;
  /**
   * Input ratios of the industry's other inputs. Taken as supplied by someone else: this
   * change answers for one route, and the column says so rather than implying otherwise.
   */
  otherRatios: number[];
}

/**
 * The one figure the supply column shows, and the one it sorts by.
 *
 * Which figure it is follows the receiving industry's rule, so the two callers — the cell and
 * the sort map — must not each decide for themselves: a header that ordered rows by a number
 * the cell below it does not show would be its own kind of lie. Null when there is nothing to
 * show, which sorts last in either direction rather than to one end.
 */
export type SupplyFigure =
  | { kind: 'ratio'; value: number }
  | { kind: 'bonus'; value: number }
  | null;

export function supplyFigure(assessment: SupplyAssessment | null): SupplyFigure {
  if (!assessment) return null;
  if (assessment.rule === 'pool') {
    return assessment.pool ? { kind: 'bonus', value: assessment.pool.productionPercent } : null;
  }
  if (assessment.rule !== 'conversion' || assessment.ratio === null) return null;
  return { kind: 'ratio', value: assessment.ratio };
}

/** What the route contributes, as the assessment needs it. */
export interface RouteSupply {
  /** Days between arrivals; null when no output was stated, so no interval exists. */
  pickupIntervalDays: number | null;
  /** Round trip of one consist, for the fleet that would reach the window. */
  roundTripDays: number;
  /**
   * Cargo this route delivers across one window, driving the pool rule. Null when the output
   * is unknown: a pool level guessed from fleet capacity would be an invention, and the level
   * it invents is the flattering one.
   */
  deliveredPerWindow: number | null;
}

/**
 * One answer for one route: how its interval sits against the window, and what that means
 * under the receiving industry's own rule. Everything unknown stays null rather than
 * collapsing to a comfortable zero — a missing output must not read as a healthy verdict.
 *
 * The industry's other inputs are taken as fed by somebody else, so the conversion here is
 * what *this* route costs it: with the hauled cargo inside the window against without it.
 * That is the honest scope of a single-route view, and the interface says as much.
 */
export function assessSupply(target: SupplyTarget, route: RouteSupply): SupplyAssessment {
  const { industry, windowTicks, cargoRatio, otherRatios } = target;
  const { pickupIntervalDays, roundTripDays, deliveredPerWindow } = route;
  const rule = supplyRule(industry);
  const ratio =
    pickupIntervalDays === null ? null : supplyRatio(pickupIntervalDays, windowTicks);
  const verdict = hasVerdict(rule) ? verdictFor(ratio) : 'unknown';
  const suppliedInputRatios =
    holdsSupplied(verdict) && cargoRatio !== null ? [cargoRatio, ...otherRatios] : otherRatios;
  return {
    rule,
    ratio,
    verdict,
    trainsForWindow:
      pickupIntervalDays === null ? null : trainsForWindow(roundTripDays, windowTicks),
    windowDays: supplyWindowDays(windowTicks),
    conversion: rule === 'conversion' ? conversion(suppliedInputRatios) : null,
    deliveredPerWindow,
    pool:
      rule === 'pool' && industry.supply_pool && deliveredPerWindow !== null
        ? poolOutcome(deliveredPerWindow, industry.supply_pool)
        : null,
  };
}
