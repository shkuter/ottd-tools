/**
 * One optimizer run per input of the receiving industry.
 *
 * The tab builds no search of its own: every figure on it comes from the same sweep the
 * Best-train tab runs, called once per input with that input's own distance and output. The
 * inputs are independent — a fleet hauling one cargo does not help another — so running them
 * together would multiply the search space for nothing.
 */
import {
  activeCargoByLabel,
  activeTrains,
  activeTrainsMeta,
  economyIdForPayment,
  supplyTargetFor,
} from '../../dataset';
import { optimizeConsists, type OptimizeResult } from '../../engine/optimize';
import { createOptimizerCache, type OptimizerCache } from '../../engine/optimizeCache';
import type { InputOutcome } from '../../engine/supply';
import type { CalcSettings, GameSettings } from '../../engine/settings';
import type { InputRouteParams } from '../../state/industrySupplyStore';
import type { Cargo } from '../../types';

/** One input of the industry, with the search result for the route the user gave it. */
export interface InputRun {
  cargoLabel: string;
  /** Null when the active economy has no such cargo — nothing can be hauled then. */
  cargo: Cargo | null;
  /** Input ratio at this industry, the conversion sums over it. */
  ratio: number;
  params: InputRouteParams;
  /** Best consist found for this input; null while the route is unset or nothing can haul it. */
  best: OptimizeResult | null;
  /**
   * The consist reaching the window with the fewest trains. The advice names its fleet, so it
   * has to name this consist too — the winning row may need more trains, and a count taken
   * from one consist applied to another does not hold the window.
   */
  leanest: OptimizeResult | null;
  /** What that consist means for the window; null while the input is unset. */
  outcome: InputOutcome | null;
}

export interface RunOptions {
  game: GameSettings;
  calc: CalcSettings;
  industryId: string;
  inputs: { cargoLabel: string; ratio: number; params: InputRouteParams }[];
  year: number;
  stationTiles: number;
  maxTrains: number;
  /** One cache per cargo: the caches key on the route length, which differs per input. */
  caches: Map<string, OptimizerCache>;
  /**
   * Catalogue ids the imported game sells, when the year is its own. The tab searches with
   * the same sweep as the other two, so it has to ask the same question about what is on
   * sale — a supply figure built from a vehicle the game withdrew is advice nobody can take.
   */
  soldIds?: ReadonlySet<string> | null;
}

/** An input the user has given both a distance and a source output. */
function isRouted(params: InputRouteParams): boolean {
  return params.distanceTiles > 0 && params.productionPerMonth > 0;
}

export function runSupplyInputs(options: RunOptions): InputRun[] {
  const { game, calc, industryId, inputs, year, stationTiles, maxTrains } = options;
  const trains = activeTrains(game);
  const meta = activeTrainsMeta(game);
  const economyId = economyIdForPayment(game);
  const cargoByLabel = activeCargoByLabel(game);

  return inputs.map(({ cargoLabel, ratio, params }) => {
    const cargo = cargoByLabel.get(cargoLabel) ?? null;
    const empty: InputRun = {
      cargoLabel, cargo, ratio, params, best: null, leanest: null, outcome: null,
    };
    if (!cargo || !isRouted(params)) return empty;

    let cache = options.caches.get(cargoLabel);
    if (!cache) {
      cache = createOptimizerCache();
      options.caches.set(cargoLabel, cache);
    }
    const rows = optimizeConsists(
      trains,
      {
        year,
        distanceTiles: params.distanceTiles,
        cargo,
        economyId,
        maxLengthTiles: stationTiles,
        productionPerMonth: params.productionPerMonth,
        goal: 'supply',
        supplyTarget: supplyTargetFor(game, cargoLabel, industryId),
        maxTrains,
        soldIds: options.soldIds,
        game,
        calc,
      },
      meta,
      ROWS_FOR_FLEET,
      cache,
    );
    const best = rows[0];
    // A route the user set up that nothing can haul is not an unset input: it misses the
    // window, and the tab says why instead of showing a blank the player already filled in.
    if (!best?.supply) return { ...empty, outcome: UNSERVED };

    const leanest = leanestOf(rows);
    return { ...empty, best, leanest, outcome: outcomeOf(best, leanest) };
  });
}

/**
 * How many ranked rows to look at. Only the first is shown, but the fleet the advice names is
 * the smallest any of them reaches the window with, and the goal ranks by conversion first —
 * among rows that all miss the window the winner is decided on profit, whose fleet can be
 * larger than necessary.
 */
const ROWS_FOR_FLEET = 30;

/** An input the buy menu of that year cannot serve at all: no consist, so no fleet to name. */
const UNSERVED: InputOutcome = {
  verdict: 'misses',
  ratio: null,
  trainsForWindow: null,
  unserved: true,
  deliveredPerWindow: null,
};

/**
 * What the winning row says about this input.
 *
 * The row is already the best one under the supply goal, which sweeps every fleet size up to
 * the user's limit and ranks the ones holding the window first — so a row that still misses
 * means no allowed fleet holds it, and the fleet it would take is the advice, whether or not
 * it fits the limit the user set: raising the limit is something they can do, and the tab has
 * to say by how much.
 *
 * That fleet comes from the leanest row rather than the winner: sending the player to buy more
 * trains than any of the offered consists needs is advice they should not follow.
 */
function outcomeOf(best: OptimizeResult, leanest: OptimizeResult | null): InputOutcome {
  const supply = best.supply!;
  return {
    verdict: supply.verdict,
    ratio: supply.ratio,
    trainsForWindow: leanest?.supply?.trainsForWindow ?? null,
    unserved: false,
    deliveredPerWindow: supply.deliveredPerWindow,
  };
}

/**
 * Row reaching the window with the fewest trains. Ties go to the row the goal ranked higher,
 * so the advice keeps naming the consist the tab would recommend anyway whenever it can.
 */
function leanestOf(rows: readonly OptimizeResult[]): OptimizeResult | null {
  let leanest: OptimizeResult | null = null;
  for (const row of rows) {
    const trains = row.supply?.trainsForWindow;
    if (trains == null) continue;
    if (!leanest || trains < (leanest.supply?.trainsForWindow ?? Infinity)) leanest = row;
  }
  return leanest;
}
