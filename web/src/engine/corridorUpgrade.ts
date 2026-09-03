/**
 * Is it worth converting this corridor to another track type — electrifying it, usually?
 *
 * The question is not "is the electric engine better" but "does the corridor carry enough
 * traffic to pay for the wire": the upkeep of the track is shared by every train that runs
 * on it, so the answer turns on their number. That number is what this module names.
 *
 * Both sides of the comparison are computed by the same route model the income tab shows
 * (`trip.ts`), with two arguments swapped — the track and the leading vehicles — so the
 * "as it is" column cannot drift from the panel above it.
 */

import type { ConsistEntry, Railtype, Train } from '../types';
import { activeRailtype, activeRailtypes } from '../dataset';
import { standsInBuyMenu, type AvailabilityContext } from './availability';
import { consistStats } from './consist';
import { railConvertCost, trainBuyCost } from './costs';
import { networkMaintenance, type NetworkCounts, type RailtypeMultipliers } from './infrastructure';
import { purchaseRepresentatives } from './purchase';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
} from './settings';
import { poweredOutputOn } from './tracktypes';
import { routeWithFlow, type RouteWithFlowParams, type TripEconomics } from './trip';

/** The corridor itself: everything the route params do not already say. */
export interface CorridorInputs {
  /** Track the corridor would be converted to; the one it runs on now is `calc.trackType`. */
  target: Railtype;
  /**
   * Length in **track pieces**, the unit upkeep and conversion are both billed in — a tile
   * carries one piece per track on it, so a double-track corridor is twice its tiles.
   */
  pieces: number;
  /** Trains sharing the corridor, and so sharing the cost of its track. */
  trains: number;
  /** Engine that replaces the consist's leading vehicles; nothing is computed without one. */
  replacement: Train | null;
  /** Network the corridor is part of, as the upkeep panel holds it. */
  network: NetworkCounts;
}

/** One side of the comparison. */
export interface CorridorSide {
  track: Railtype;
  economics: TripEconomics;
  /** Steady speed of the loaded consist on a grade, for callers that show the hill. */
  gradeSpeedInternal: number;
}

export interface CorridorUpgradeResult {
  before: CorridorSide;
  after: CorridorSide;
  /** Yearly upkeep the conversion adds to the network, over every category it touches. */
  maintenanceDelta: number;
  /** What one train gains a year by the conversion; the delta is linear in this. */
  gainPerTrain: number;
  /** Yearly delta at the stated number of trains. */
  yearlyDelta: number;
  /**
   * Fewest trains at which the yearly delta turns positive — the load threshold. `null`
   * when no number of trains makes it: the conversion loses on the trains themselves.
   */
  threshold: number | null;
  /** Converting the track, and buying the engines that replace the old ones. */
  trackCapital: number;
  engineCapital: number;
  capital: number;
  /** Year the capital is back, counting from the price year; `null` when it never is. */
  breakEvenYear: number | null;
}

/**
 * Engines the player could put on this track in this year.
 *
 * The rule the optimizer offers engines by — powered here, and standing in the buy menu —
 * narrowed to one entry per purchase, the way a list the player picks from has to be
 * (`purchase.ts`): a roster states the same machine in a dozen liveries, and a select box of
 * identical names is not a choice.
 */
export function replacementCandidates(
  trains: readonly Train[],
  target: Railtype,
  game: GameSettings,
  calc: CalcSettings,
  buyMenu: AvailabilityContext,
): Train[] {
  const railtypes = activeRailtypes(game);
  const powered = trains.filter(
    (train) =>
      train.kind === 'engine' &&
      poweredOutputOn(train, target, railtypes) > 0 &&
      standsInBuyMenu(train, calc.priceYear, buyMenu),
  );
  return purchaseRepresentatives(powered, calc.capacityIndex, game, (train) =>
    standsInBuyMenu(train, calc.priceYear, buyMenu),
  );
}

/**
 * The same consist with every leading vehicle swapped for `replacement`.
 *
 * `bought` counts only the ones that actually change: a consist already running the chosen
 * engine buys nothing, and a double-headed one that swaps a single head pays for that head.
 */
function reEngined(
  entries: readonly ConsistEntry[],
  replacement: Train,
): { entries: ConsistEntry[]; bought: number } {
  let bought = 0;
  const swapped = entries.map((entry) => {
    if (entry.train.kind !== 'engine') return entry;
    if (entry.train.id === replacement.id) return entry;
    bought += entry.count;
    return { train: replacement, count: entry.count };
  });
  return { entries: swapped, bought };
}

/**
 * Yearly upkeep the conversion adds, as the difference of two whole networks.
 *
 * Not the difference of the two type multipliers: every line is truncated to whole pounds a
 * month, so the difference of two lines is not the line of the difference. The corridor is
 * assumed to exist — a network stating fewer pieces of the current type than the corridor
 * has is topped up to it, because a corridor nobody built cannot be converted either.
 */
function maintenanceDeltaOf(
  inputs: CorridorInputs,
  from: Railtype,
  railtypes: RailtypeMultipliers,
  game: GameSettings,
  year: number,
): number {
  const counts = inputs.network;
  const owned = Math.max(counts.rail[from.label] ?? 0, inputs.pieces);
  const before: NetworkCounts = { ...counts, rail: { ...counts.rail, [from.label]: owned } };
  const after: NetworkCounts = {
    ...before,
    rail: {
      ...before.rail,
      [from.label]: owned - inputs.pieces,
      [inputs.target.label]: (before.rail[inputs.target.label] ?? 0) + inputs.pieces,
    },
  };
  return (
    networkMaintenance(after, railtypes, game, year).yearly -
    networkMaintenance(before, railtypes, game, year).yearly
  );
}

/**
 * Fewest whole trains at which `trains × gain − maintenance` turns positive.
 *
 * Solved rather than swept: the delta is linear in the number of trains, and "how many
 * trains" has no upper bound to sweep to.
 *
 * Where the trains gain nothing (or lose), the delta does not rise with their number, so the
 * best case is a single train — and the answer is whether even that one is in the black. A
 * conversion onto cheaper track passes that test with the same engine still hauling; saying
 * "no number of trains makes it pay" beside a positive year would be plainly wrong.
 */
export function loadThreshold(gainPerTrain: number, maintenanceDelta: number): number | null {
  if (gainPerTrain > 0) return Math.max(1, Math.floor(maintenanceDelta / gainPerTrain) + 1);
  return gainPerTrain - maintenanceDelta > 0 ? 1 : null;
}

/**
 * Steady speed of the loaded consist on a grade — the hill the settings describe.
 *
 * Takes the route it belongs to: the cargo, the roster and the game are its, and only the
 * vehicles and the track differ between the two sides being compared.
 */
function gradeSpeed(
  route: RouteWithFlowParams,
  entries: readonly ConsistEntry[],
  game: GameSettings,
  calc: CalcSettings,
): number {
  return consistStats(entries, route.cargo, calc.capacityIndex, route.meta, game, calc)
    .balancingSpeedOnGradeInternal;
}

/**
 * `route` carries the settings the comparison runs under — it is the very object the income
 * panel is computed from, and taking them from anywhere else is how the "as it is" column
 * would start drifting from the panel it claims to repeat.
 */
export function corridorUpgrade(
  route: RouteWithFlowParams,
  inputs: CorridorInputs,
): CorridorUpgradeResult | null {
  const game = route.game ?? DEFAULT_GAME_SETTINGS;
  const calc = route.calc ?? DEFAULT_CALC_SETTINGS;
  const from = activeRailtype(game, calc.trackType);
  // An unstated length is not a corridor of nothing, and an unstated fleet is not a corridor
  // nobody runs on (ADR-0004, ADR-0006): priced as zero, the first reports free wire and the
  // second a conversion no train ever pays for.
  if (
    !inputs.replacement ||
    inputs.target.label === from.label ||
    inputs.pieces <= 0 ||
    inputs.trains <= 0
  ) {
    return null;
  }

  const before = routeWithFlow(route);
  const { entries, bought } = reEngined(route.entries, inputs.replacement);
  const after = routeWithFlow({
    ...route,
    entries,
    calc: { ...calc, trackType: inputs.target.label },
  });

  const railtypes = activeRailtypes(game);
  const maintenanceDelta = maintenanceDeltaOf(inputs, from, railtypes, game, calc.priceYear);
  // Taken as the model states it rather than rebuilt from income and running cost: the
  // addition already happened there, and a second copy of it would drift.
  const gainPerTrain = after.economics.profitPerYear - before.economics.profitPerYear;
  const yearlyDelta = inputs.trains * gainPerTrain - maintenanceDelta;

  const trackCapital = railConvertCost(from, inputs.target, game, calc.priceYear) * inputs.pieces;
  const engineCapital =
    trainBuyCost(inputs.replacement, route.meta, game, calc) * bought * inputs.trains;
  const capital = trackCapital + engineCapital;

  return {
    before: {
      track: from,
      economics: before.economics,
      gradeSpeedInternal: gradeSpeed(route, route.entries, game, calc),
    },
    after: {
      track: inputs.target,
      economics: after.economics,
      gradeSpeedInternal: gradeSpeed(route, entries, game, {
        ...calc,
        trackType: inputs.target.label,
      }),
    },
    maintenanceDelta,
    gainPerTrain,
    yearlyDelta,
    threshold: loadThreshold(gainPerTrain, maintenanceDelta),
    trackCapital,
    engineCapital,
    capital,
    breakEvenYear: yearlyDelta > 0 ? calc.priceYear + capital / yearlyDelta : null,
  };
}
