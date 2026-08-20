/**
 * Cache for the expensive half of an optimizer sweep.
 *
 * Physics, timings and the price of a consist depend on the vehicles, the route length and
 * the settings — not on the production flow, the search goal or the fleet limit. Those are
 * exactly the fields a user tweaks most on the tab, so the expensive half is worth keeping
 * between calls. The cache belongs to the caller (the tab holds one for its lifetime) rather
 * than to the search: a search with its own cache stays a pure function of its arguments,
 * which is what tests and any second caller need.
 */
import type { TrainsMeta } from '../types';
import type { CalcSettings, GameSettings } from './settings';
import type { TripSetup } from './trip';

export interface OptimizerCache {
  setups: Map<string, TripSetup>;
  /** Everything the setups depend on, serialised; a change here empties the map. */
  epoch: string;
}

export function createOptimizerCache(): OptimizerCache {
  return { setups: new Map(), epoch: '' };
}

/** Guards against a session of edits growing the cache without bound. */
const SETUP_CACHE_LIMIT = 50_000;

/**
 * Everything a cached setup depends on. It lives here, next to the cache it invalidates:
 * a new input to the physics has to be added in one place, not remembered at the call site.
 */
export interface SetupDependencies {
  cargoLabel: string;
  /** Payment rate of the cargo in the selected economy. */
  payment: number;
  distanceTiles: number;
  basecostShifts: TrainsMeta['basecost_shifts'];
  game: GameSettings;
  calc: CalcSettings;
}

/**
 * Empties the cache when the world it was filled for is gone — and when it has simply grown
 * too large, which a long session of edits would otherwise do without bound.
 */
export function resetIfStale(cache: OptimizerCache, deps: SetupDependencies): void {
  const epoch = JSON.stringify([
    deps.cargoLabel, deps.payment, deps.distanceTiles, deps.basecostShifts, deps.game, deps.calc,
  ]);
  if (cache.epoch !== epoch || cache.setups.size > SETUP_CACHE_LIMIT) {
    cache.setups.clear();
    cache.epoch = epoch;
  }
}

/** The setup for one consist, computed at most once per epoch. */
export function cachedSetup(
  cache: OptimizerCache,
  key: string,
  build: () => TripSetup,
): TripSetup {
  let setup = cache.setups.get(key);
  if (!setup) {
    setup = build();
    cache.setups.set(key, setup);
  }
  return setup;
}
