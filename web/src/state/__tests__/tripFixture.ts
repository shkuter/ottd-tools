/**
 * The trip a consist replacement may overwrite, shared by the tests of every way the consist is
 * replaced. Kept out of any `*.test.ts`: a helper exported from a test file registers that
 * file's tests again in every importer.
 *
 * The fields are read by the replacement's own `pickTrip`, so a field added to its list is
 * compared by every test at once instead of being missed by the ones that spelled the fields out.
 */
import { pickTrip, type TripFields } from '../consistReplacement';
import type { RouteState } from '../routeStore';

/** A trip set by hand before a replacement: every field different from what a bridge writes. */
export const TRIP_BEFORE: TripFields = {
  cargoLabel: 'WOOD',
  distanceTiles: 7,
  amount: 11,
  manualDays: 42,
  productionPerMonth: 999,
  waitForFullLoad: false,
  prefillOrigin: null,
};

/** The fields of the trip as the route store holds them now. */
export function tripOf(state: RouteState): TripFields {
  return pickTrip(state);
}
