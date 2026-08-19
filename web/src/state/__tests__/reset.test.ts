import { createJSONStorage, type PersistStorage, type StateStorage } from 'zustand/middleware';
import { describe, expect, it } from 'vitest';
import { resetPersistedState } from '..';
import { useConsistStore } from '../consistStore';
import { useFirsStore } from '../firsStore';
import { useOptimizerStore } from '../optimizerStore';
import { useRouteStore } from '../routeStore';
import { useSettingsStore } from '../settingsStore';
import { memoryStorage } from './memoryStorage';

/** Point one store at the in-memory storage and load it, keeping the store's own state type. */
async function bindStorage<S>(
  store: {
    persist: {
      setOptions: (options: { storage: PersistStorage<S> | undefined }) => void;
      rehydrate: () => Promise<void> | void;
    };
  },
  storage: StateStorage,
): Promise<void> {
  store.persist.setOptions({ storage: createJSONStorage<S>(() => storage) });
  await store.persist.rehydrate();
}

describe('resetPersistedState', () => {
  it('чистит хранилища всех зарегистрированных сторов', async () => {
    const storage = memoryStorage();
    // one call per store, not a loop: the stores persist different shapes, and iterating
    // over them collapses those shapes into an intersection no single storage satisfies
    await Promise.all([
      bindStorage(useSettingsStore, storage),
      bindStorage(useConsistStore, storage),
      bindStorage(useRouteStore, storage),
      bindStorage(useOptimizerStore, storage),
      bindStorage(useFirsStore, storage),
    ]);
    useSettingsStore.getState().setCurrency('EUR');
    useOptimizerStore.getState().setYear(1999);
    useRouteStore.getState().setDistanceTiles(321);
    useFirsStore.getState().setEconomyId('STEELTOWN');
    expect(Object.keys(storage.dump()).length).toBeGreaterThanOrEqual(4);
    resetPersistedState();
    expect(Object.keys(storage.dump())).toEqual([]);
    expect(useSettingsStore.getState().currency).toBe('GBP');
    expect(useConsistStore.getState().entries).toEqual([]);
  });
});
