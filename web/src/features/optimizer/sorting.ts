import type { OptimizeResult } from '../../engine/optimize';
import type { SortState, SortValues } from '../../components/table/sorting';
import { supplyFigure } from '../../engine/supply';

/**
 * What each sortable column of the optimizer compares by. The mechanics of sorting are shared
 * (components/table/sorting.ts); this map is what makes them specific to a result row.
 */
export const SORT_VALUES = {
  engine: (r: OptimizeResult) => r.engine.name,
  wagon: (r: OptimizeResult) => r.wagon.name,
  cargoTrip: (r: OptimizeResult) => r.cargoPerTrip,
  speed: (r: OptimizeResult) => r.loadedSpeedInternal,
  gradeSpeed: (r: OptimizeResult) => r.gradeSpeedInternal,
  dwell: (r: OptimizeResult) => r.loadingDays,
  roundTrip: (r: OptimizeResult) => r.roundTripDays,
  trips: (r: OptimizeResult) => r.tripsPerYear,
  fleet: (r: OptimizeResult) => r.fleetSize,
  interval: (r: OptimizeResult) => r.pickupIntervalDays,
  // No rating at all is not "the lowest rating": the cell draws an em dash, so the row has no
  // value here and leaves the ordering, the way it does in the payback column below. A -1
  // placeholder would head the list the moment the user reverses the direction.
  rating: (r: OptimizeResult) => r.stationRating?.deliveredShare ?? null,
  // The very figure the cell shows, through the same function the cell calls: the ratio for a
  // conversion industry, the production bonus for a pool one. Ascending therefore puts the best
  // rows on top for the first and the worst for the second, which is what the column means in
  // each case.
  supply: (r: OptimizeResult) => supplyFigure(r.supply)?.value ?? null,
  hauled: (r: OptimizeResult) => r.hauledPerYear,
  incomeTrip: (r: OptimizeResult) => r.incomePerTrip,
  running: (r: OptimizeResult) => r.runningCostPerYear,
  cost: (r: OptimizeResult) => r.buyCostTotal,
  profit: (r: OptimizeResult) => r.profitPerYear,
  // Never paying back is not "pays back in zero years", and not "pays back in infinite years"
  // either: it has no value, so it leaves the ordering entirely and lands at the end.
  payback: (r: OptimizeResult) => r.paybackYears ?? null,
} satisfies SortValues<OptimizeResult, string>;

/**
 * `satisfies` checks what the entries return without widening the object: the column names stay
 * the literal keys written above, so a header naming a column the map has never heard of is a
 * type error.
 */
export type SortColumn = keyof typeof SORT_VALUES;
export type OptimizerSort = SortState<SortColumn>;
