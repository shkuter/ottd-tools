/**
 * The four inputs every consist search needs, whichever tab runs it: which vehicles the buy
 * menu offers, how long a consist may be, how many of them share a route, and whether the line
 * is electrified.
 *
 * They live here rather than in each store because both tabs start from the same defaults, and
 * a default that drifts between them is a difference the player has no way to explain: the same
 * route, entered twice, would answer differently.
 */
export interface SearchParams {
  /** Year the search runs in: which vehicles the buy menu would offer. */
  year: number;
  /** Station length in tiles — the length limit a consist is built under. */
  stationTiles: number;
  /** Upper bound on trains sharing one route. */
  maxTrains: number;
  /** The line is electrified: let the search use OHLE-only engines. */
  allowElectric: boolean;
}

export const DEFAULT_SEARCH_PARAMS: SearchParams = {
  year: 1938,
  stationTiles: 5,
  maxTrains: 4,
  allowElectric: false,
};
