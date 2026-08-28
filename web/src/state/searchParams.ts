/**
 * The two inputs every consist search needs, whichever tab runs it: how long a consist may
 * be and how many of them share a route.
 *
 * They live here rather than in each store because both tabs start from the same defaults, and
 * a default that drifts between them is a difference the player has no way to explain: the same
 * route, entered twice, would answer differently. Two inputs left this file for the same
 * reason: the year the search runs in (`CalcSettings.priceYear`) and whether the line is
 * electrified — that one is not a search input at all but a property of the track the route
 * is built with (`CalcSettings.trackType`).
 */
export interface SearchParams {
  /** Station length in tiles — the length limit a consist is built under. */
  stationTiles: number;
  /** Upper bound on trains sharing one route. */
  maxTrains: number;
}

export const DEFAULT_SEARCH_PARAMS: SearchParams = {
  stationTiles: 5,
  maxTrains: 4,
};

/** The version the two tab stores share: what changed, changed in both at once. */
const SEARCH_STORE_VERSION = 2;

/**
 * How a tab store persists itself. Both stores hold the same search params and went through
 * the same history, so they share the options rather than keeping two copies that could
 * drift; the name is what tells them apart.
 *
 * The migration steps run in ascending order and each is skipped by the version that already
 * has it, so a state saved at any version walks the rest of the way — returning early on the
 * first step that does not apply would strand it one version short.
 *
 * v1: the search year moved out to the settings, where one year serves the whole calculator.
 * A state saved before that still carries its own `year`, and persist would merge it back in
 * as a stray field.
 */
export function searchStorePersist<T>(name: string) {
  return {
    name,
    version: SEARCH_STORE_VERSION,
    migrate: (persisted: unknown, version: number): T => {
      if (version >= SEARCH_STORE_VERSION) return persisted as T;
      let state = (persisted ?? {}) as Record<string, unknown>;

      if (version < 1) {
        const { year: _dropped, ...rest } = state;
        state = rest;
      }

      if (version < 2) {
        // electrification became the track type; the value itself was carried into that
        // choice by the upgrade step in state/upgrade.ts, which runs before any store
        const { allowElectric: _moved, ...rest } = state;
        state = rest;
      }

      return state as T;
    },
  };
}
