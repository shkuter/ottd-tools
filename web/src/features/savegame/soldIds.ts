/**
 * The imported game's own answer to "what does the buy menu offer", for the lists to use.
 *
 * Kept apart from the store so the store stays free of React: this is the subscription the
 * catalogue and the optimizer share, and both must see the same answer — a list that
 * disagreed with another list would be worse than no list at all.
 */

import { useMemo, useSyncExternalStore } from 'react';
import { getSnapshotState, subscribeSnapshot, soldIdsFor } from '../../savegame/snapshotStore';
import type { GameSettings } from '../../engine/settings';

/** Vehicles the imported game sells, or null when the year or the sets are not the game's own. */
export function useSoldIds(year: number, game: GameSettings): ReadonlySet<string> | null {
  const state = useSyncExternalStore(subscribeSnapshot, getSnapshotState);
  const { trainSet, firs, firsEconomy } = game;
  return useMemo(
    () => soldIdsFor(state.record, year, { trainSet, firs, firsEconomy }),
    [state.record, year, trainSet, firs, firsEconomy],
  );
}
