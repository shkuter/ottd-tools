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

/**
 * How one input of an industry stands. `unset` is its own state, not a zero: an input the
 * user has not routed yet must not read as one that misses the window — a figure computed
 * from a distance nobody gave is wrong in the most visible place on the tab.
 */
export type InputState = 'holds' | 'marginal' | 'misses' | 'unset';

/** What a route contributes to one input, as the summary layer needs it. */
export interface InputOutcome {
  /** Verdict of that route, from `verdictFor` — the marginal band included. */
  verdict: SupplyVerdict;
  /** Interval against the window; null when there is no interval. */
  ratio: number | null;
  /** Smallest fleet whose ratio reaches 1; null when the round trip is unknown. */
  trainsForWindow: number | null;
  /**
   * Nothing in the buy menu of that year can haul this cargo on this route. It is its own
   * answer, not a missing number: naming a fleet for a route no consist can run is advice the
   * player cannot follow.
   */
  unserved: boolean;
  /** What the route puts into the pool over one window; null when unknown. */
  deliveredPerWindow: number | null;
}

/** One input of an industry, with the route the user gave it (null while none was given). */
export interface IndustryInput {
  cargoLabel: string;
  /** Input ratio of this cargo at this industry; 0 when the industry states none. */
  ratio: number;
  outcome: InputOutcome | null;
}

/**
 * The input holding the industry back, and what would move it. `fleet` names the fleet that
 * reaches the window — the number the player acts on, whether or not it fits the limit they
 * set. `limit` is for an input no consist can serve at all, where naming a fleet would be
 * advice they cannot follow.
 *
 * It carries the input itself rather than its cargo label: the caller already holds these
 * objects, and handing back a label only makes it look the same one up again.
 */
export type SupplyBottleneck<T extends IndustryInput = IndustryInput> =
  | { kind: 'fleet'; input: T; trains: number }
  | { kind: 'limit'; input: T };

export interface IndustrySupply<T extends IndustryInput = IndustryInput> {
  rule: SupplyRule;
  /** State of every input, in the order they were passed. */
  states: InputState[];
  /** Conversion rule only: share of its output the industry gets from the inputs that hold. */
  conversion: number | null;
  /**
   * At least one input has no route yet, so the figures answer for part of the industry.
   * The tab says so instead of presenting a partial answer as the final one.
   */
  incomplete: boolean;
  /** The input to fix first; null when fixing any of them would not move the conversion. */
  bottleneck: SupplyBottleneck<T> | null;
  /** Pool rule only: what the routes given on the tab add up to across one window. */
  pool: PoolOutcome | null;
  /** Pool rule only: that same volume, so the tab can show it against the thresholds. */
  deliveredPerWindow: number | null;
}

/** State of one input: no route, or the route's own verdict. */
export function inputState(outcome: InputOutcome | null): InputState {
  if (!outcome || outcome.verdict === 'unknown') return 'unset';
  return outcome.verdict;
}

/**
 * Supply of a whole industry: every input at once, which is the question a player actually
 * has — an input that fell out of the window cuts the output of the deliveries that arrived
 * on time too, so answering one input at a time cannot say which one to fix.
 *
 * The conversion here is computed from the real state of every input, not taken from an
 * optimizer row: a row assumes the industry's *other* inputs are fed by somebody else
 * (`assessSupply`), and counting that assumption on top of the states known here would put
 * the answer above the truth exactly where the tab is meant to help.
 */
export function assessIndustrySupply<T extends IndustryInput>(
  industry: Industry,
  inputs: T[],
): IndustrySupply<T> {
  const rule = supplyRule(industry);
  const states = inputs.map((input) => inputState(input.outcome));
  const incomplete = states.includes('unset');
  const base: IndustrySupply<T> = {
    rule,
    states,
    conversion: null,
    incomplete,
    bottleneck: null,
    pool: null,
    deliveredPerWindow: null,
  };
  if (!hasVerdict(rule)) return base;

  if (rule === 'pool') {
    // Only the routes the user put on the tab: deliveries by anyone else stay invisible, the
    // way they are for a single route, so the volume is the total of *these* routes.
    const routed = inputs.filter((input) => input.outcome?.deliveredPerWindow != null);
    const delivered = routed.reduce(
      (total, input) => total + (input.outcome?.deliveredPerWindow ?? 0),
      0,
    );
    if (routed.length === 0) return base;
    return {
      ...base,
      deliveredPerWindow: delivered,
      pool: industry.supply_pool ? poolOutcome(delivered, industry.supply_pool) : null,
    };
  }

  const supplied = inputs.filter(
    (input) => input.outcome !== null && holdsSupplied(input.outcome.verdict),
  );
  const suppliedShare = conversion(supplied.map((input) => input.ratio));
  return {
    ...base,
    conversion: suppliedShare,
    bottleneck: bottleneckOf(inputs, states, suppliedShare),
  };
}

/**
 * Which missing input to fix first. Only inputs whose ratio would actually raise the
 * conversion count: with the others already at the ceiling — FIRS's "any three of five" —
 * hauling a fifth cargo changes nothing, and naming it would send the player after a train
 * that buys them no output.
 *
 * Among those, the one a fleet reaches wins over one that runs into a limit, and the smaller
 * fleet wins between two of them: that is the cheapest thing the player can do next. When
 * nothing can serve several inputs at all, the one with the largest ratio is named — it is the
 * one cutting the conversion hardest, and the order the data happens to list them in says
 * nothing.
 */
function bottleneckOf<T extends IndustryInput>(
  inputs: T[],
  states: InputState[],
  suppliedShare: number,
): SupplyBottleneck<T> | null {
  if (suppliedShare >= 1) return null;
  const missing = inputs
    .map((input, i) => ({ input, state: states[i] }))
    .filter(({ state }) => state === 'misses')
    .filter(({ input }) => input.ratio > 0);
  if (missing.length === 0) return null;

  const withFleet = missing
    .map(({ input }) => ({ input, trains: input.outcome?.trainsForWindow }))
    .filter((entry): entry is { input: T; trains: number } => entry.trains != null)
    .sort((a, b) => a.trains - b.trains);
  const cheapest = withFleet[0];
  if (cheapest) {
    return { kind: 'fleet', input: cheapest.input, trains: cheapest.trains };
  }
  const worst = missing.reduce((a, b) => (b.input.ratio > a.input.ratio ? b : a));
  return { kind: 'limit', input: worst.input };
}
