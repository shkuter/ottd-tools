import type { OptimizeResult } from '../../engine/optimize';
import { supplyFigure } from '../../engine/supply';

/**
 * What each sortable column compares by. Numbers sort as numbers and names as text, so the
 * table needs both — and the map is the single place a column's value is defined, so a header
 * cannot end up sorting by a different figure than the cell below it shows.
 */
const SORT_VALUES = {
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
  rating: (r: OptimizeResult) => r.stationRating?.deliveredShare ?? -1,
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
} satisfies Record<string, (r: OptimizeResult) => number | string | null>;

export type SortColumn = keyof typeof SORT_VALUES;
export type SortState = { column: SortColumn; descending: boolean } | null;

/**
 * The rows in the order the table shows them: the search order when nothing is sorted, and
 * a reordering of exactly those rows otherwise. Sorting is a view, never a second ranking —
 * it must not drop, add or change a row, only move it.
 */
export function sortRows(
  rows: readonly OptimizeResult[],
  sort: SortState,
  collator: Intl.Collator,
): OptimizeResult[] {
  if (!sort) return [...rows];
  const value = SORT_VALUES[sort.column];
  const direction = sort.descending ? -1 : 1;
  // Rows with no value at all leave the comparison and are appended: a placeholder like
  // Infinity would sort to one end, which means it heads the list the moment the user reverses
  // the direction — and a row the calculator knows nothing about is never the answer.
  const rated = rows.filter((row) => value(row) !== null);
  const unrated = rows.filter((row) => value(row) === null);
  const sorted = [...rated].sort((a, b) => {
    const va = value(a)!;
    const vb = value(b)!;
    if (typeof va === 'string' || typeof vb === 'string') {
      return direction * collator.compare(String(va), String(vb));
    }
    return direction * ((va as number) - (vb as number));
  });
  return [...sorted, ...unrated];
}

/** Next state of a header clicked: ascending, then descending, then back to search order. */
export function nextSort(current: SortState, column: SortColumn): SortState {
  if (current?.column !== column) return { column, descending: false };
  return current.descending ? null : { column, descending: true };
}

