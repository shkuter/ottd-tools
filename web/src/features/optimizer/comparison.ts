/**
 * Comparing the ticked engines: a column per engine, a row per figure.
 *
 * The figures are not computed again here — each column comes out of the same search that
 * produced the table, narrowed to one engine and one wagon. Fleet, loading branch, station
 * rating and the active goal therefore apply to a comparison exactly as they do to the answer,
 * and a column repeats its row wherever the conditions match. The one figure this module does
 * compute is cost per unit delivered, which divides two of them.
 */
import type { Train, TrainsMeta } from '../../types';
import {
  searchConsists,
  type Insufficiency,
  type OptimizeParams,
  type OptimizeResult,
} from '../../engine/optimize';
import type { OptimizerCache } from '../../engine/optimizeCache';
import { hasVerdict, supplyFigure, supplyRule } from '../../engine/supply';

/** More than four columns do not fit: the fifth pushes rows off the side of the screen. */
export const MAX_COMPARED = 4;

/**
 * How many rows to ask the search for on a single pair: the answer collapses by "engine ×
 * number of units" and two unit counts are swept, so one pair can never yield more than two.
 */
const ROWS_PER_PAIR = 2;

/**
 * What is ticked in the answer. A pair rather than an engine: the table holds one row per
 * "engine × number of units", and a single engine is a different answer from a doubled one.
 */
export interface ComparisonPick {
  engineId: string;
  engineCount: number;
}

/** One column: the engine and its row under the shared conditions, or why there is none. */
export interface ComparisonColumn {
  engine: Train;
  engineCount: number;
  /** That search's row on the shared wagon; null when the sweep produced nothing at all. */
  row: OptimizeResult | null;
  /**
   * The goal's conditions that turned every variant of this engine away. Empty when there were
   * no variants for another reason — the sweep produced nothing worth a row at all.
   */
  refused: readonly Insufficiency[];
}

export function samePick(a: ComparisonPick, b: ComparisonPick): boolean {
  return a.engineId === b.engineId && a.engineCount === b.engineCount;
}

export function pickOf(row: OptimizeResult): ComparisonPick {
  return { engineId: row.engine.id, engineCount: row.engineCount };
}

/**
 * The wagon the conditions are levelled by: the one from the first ticked row. The order of
 * ticks therefore matters, which is why the panel names the wagon.
 */
export function sharedWagon(
  picks: readonly ComparisonPick[],
  rows: readonly OptimizeResult[],
): Train | null {
  // The first tick still present in the answer: rows are rebuilt when the goal changes, and a
  // tick can outlive its row — the wagon then comes from the next one rather than vanishing.
  for (const pick of picks) {
    const wagon = rows.find((r) => samePick(pickOf(r), pick))?.wagon;
    if (wagon) return wagon;
  }
  return null;
}

/** What `comparisonColumns` answers: the wagon it levelled on and the columns it built. */
export interface ComparisonBuild {
  /** The wagon every column was built on; null when no ticked row is left to take one from. */
  wagon: Train | null;
  columns: ComparisonColumn[];
}

/**
 * The comparison: the shared wagon and a column per ticked pair. Each column is its own search
 * over "this engine + the shared wagon"; from its answer the row with the ticked unit count is
 * taken, since the search collapses by "engine × number of units" and may return both.
 *
 * The wagon comes back with the columns rather than being looked up again by the caller, so the
 * panel names the wagon its columns were actually built on.
 */
export function comparisonColumns(
  picks: readonly ComparisonPick[],
  rows: readonly OptimizeResult[],
  trains: readonly Train[],
  params: OptimizeParams,
  meta: TrainsMeta,
  cache?: OptimizerCache,
): ComparisonBuild {
  const wagon = sharedWagon(picks, rows);
  if (!wagon) return { wagon: null, columns: [] };
  const byId = new Map(trains.map((t) => [t.id, t]));
  const columns: ComparisonColumn[] = [];
  for (const pick of picks) {
    const engine = byId.get(pick.engineId);
    if (!engine) continue;
    const search = searchConsists([engine, wagon], params, meta, ROWS_PER_PAIR, cache);
    const row = search.rows.find((r) => r.engineCount === pick.engineCount) ?? null;
    columns.push({ engine, engineCount: pick.engineCount, row, refused: search.refused });
  }
  return { wagon, columns };
}

/** What a cell draws: the label and the number format follow from this. */
export type MetricKind =
  | 'force'
  | 'speed'
  | 'cargo'
  | 'tiles'
  | 'count'
  | 'days'
  | 'share'
  | 'supplyRatio'
  | 'supplyBonus'
  | 'money'
  | 'moneyPerUnit'
  | 'years';

export interface ComparisonMetric {
  /** Which figure this is. Rows are addressed by it rather than by a translation key. */
  id: MetricId;
  /** i18n key of the row's label. */
  key: string;
  kind: MetricKind;
  /** The value per column; null where this engine has none. */
  values: (number | null)[];
  /** The row's best value; on a tie everyone standing on it is marked. */
  best: boolean[];
  /** Which way is "better": up, down, or neither — a descriptive figure has no best. */
  direction: MetricDirection;
}

/**
 * Consist length, wagon count and fleet size say nothing about an engine being better or worse:
 * longer means both more cargo and more to run, fewer trains means cheaper and rarer. Such
 * figures stand in the panel for the sake of the profile and get no best value.
 */
export type MetricDirection = 'up' | 'down' | 'none';

/** The panel's figures by name — how rows are addressed in code and in tests. */
export type MetricId =
  | 'tractiveEffort'
  | 'speedFlat'
  | 'speedGrade'
  | 'capacity'
  | 'length'
  | 'wagons'
  | 'fleet'
  | 'roundTrip'
  | 'hauled'
  | 'rating'
  | 'supply'
  | 'running'
  | 'buy'
  | 'profit'
  | 'payback'
  | 'costPerUnit';

interface MetricSpec {
  id: MetricId;
  key: string;
  kind: MetricKind;
  direction: MetricDirection;
  of: (row: OptimizeResult) => number | null;
}

/**
 * The panel's rows in the order they are shown: what the engine can do, then the trip, then the
 * money. Cost per unit delivered comes last — it folds running cost and haul into one figure.
 */
function metricSpecs(productionPerMonth: number, pool: boolean): MetricSpec[] {
  return [
    { id: 'tractiveEffort', key: 'consist.stats.maxTe', kind: 'force', direction: 'up', of: (r) => r.tractiveEffortN },
    { id: 'speedFlat', key: 'consist.stats.balancing', kind: 'speed', direction: 'up', of: (r) => r.loadedSpeedInternal },
    { id: 'speedGrade', key: 'opt.gradeSpeed', kind: 'speed', direction: 'up', of: (r) => r.gradeSpeedInternal },
    { id: 'capacity', key: 'table.capacity', kind: 'cargo', direction: 'up', of: (r) => r.capacity },
    { id: 'length', key: 'consist.stats.length', kind: 'tiles', direction: 'none', of: (r) => r.lengthTiles },
    { id: 'wagons', key: 'compare.wagonCount', kind: 'count', direction: 'none', of: (r) => r.wagonCount },
    { id: 'fleet', key: 'opt.fleet', kind: 'count', direction: 'none', of: (r) => r.fleetSize },
    { id: 'roundTrip', key: 'combined.roundTrip', kind: 'days', direction: 'down', of: (r) => r.roundTripDays },
    { id: 'hauled', key: 'opt.hauled', kind: 'cargo', direction: 'up', of: (r) => r.hauledPerYear },
    {
      id: 'rating',
      key: 'opt.rating',
      kind: 'share',
      direction: 'up',
      of: (r) => r.stationRating?.deliveredShare ?? null,
    },
    {
      id: 'supply',
      key: 'opt.supply',
      // The same figure, format and direction as the supply column of the answer: at an
      // industry with a pool it is the production bonus in percent (more is better), at one
      // with a conversion the interval against the window (less is better).
      kind: pool ? 'supplyBonus' : 'supplyRatio',
      direction: pool ? 'up' : 'down',
      of: (r) => supplyFigure(r.supply)?.value ?? null,
    },
    { id: 'running', key: 'table.running', kind: 'money', direction: 'down', of: (r) => r.runningCostPerYear },
    { id: 'buy', key: 'table.cost', kind: 'money', direction: 'down', of: (r) => r.buyCostTotal },
    { id: 'profit', key: 'opt.profitYear', kind: 'money', direction: 'up', of: (r) => r.profitPerYear },
    { id: 'payback', key: 'opt.payback', kind: 'years', direction: 'down', of: (r) => r.paybackYears },
    {
      id: 'costPerUnit',
      key: 'compare.costPerUnit',
      kind: 'moneyPerUnit',
      direction: 'down',
      // Without a stated output the yearly haul is what the fleet could carry, not what is
      // delivered: dividing by it would show "running cost per what it might have hauled".
      of: (r) =>
        productionPerMonth > 0 && r.hauledPerYear > 0
          ? r.runningCostPerYear / r.hauledPerYear
          : null,
    },
  ];
}

export interface ComparisonMetricsParams {
  /** The source's output: it decides whether cost per unit delivered is defined at all. */
  productionPerMonth: number;
  /** The search's receiving industry — the supply row exists only where it has a verdict. */
  supplyTarget: OptimizeParams['supplyTarget'];
}

/**
 * The panel's figures: values per column and the best of each row. A missing value takes no
 * part in choosing the best — otherwise "no answer" would read as a zero.
 */
export function comparisonMetrics(
  columns: readonly ComparisonColumn[],
  { productionPerMonth, supplyTarget }: ComparisonMetricsParams,
): ComparisonMetric[] {
  const industry = supplyTarget?.industry ?? null;
  const rule = industry ? supplyRule(industry) : null;
  const showsSupply = rule !== null && hasVerdict(rule);
  const metrics: ComparisonMetric[] = [];
  for (const spec of metricSpecs(productionPerMonth, rule === 'pool')) {
    const values = columns.map((c) => (c.row ? spec.of(c.row) : null));
    // The supply row stands only where the receiver really has an answer: without the source's
    // output nobody has a verdict, and a dash in every column tells the player nothing.
    if (spec.id === 'supply' && (!showsSupply || values.every((v) => v === null))) continue;
    const present = values.filter((v): v is number => v !== null);
    const bestValue =
      spec.direction === 'none' || present.length === 0
        ? null
        : spec.direction === 'up'
          ? Math.max(...present)
          : Math.min(...present);
    metrics.push({
      id: spec.id,
      key: spec.key,
      kind: spec.kind,
      values,
      best: values.map((v) => bestValue !== null && v === bestValue),
      direction: spec.direction,
    });
  }
  return metrics;
}
