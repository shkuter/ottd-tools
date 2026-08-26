import 'fake-indexeddb/auto';
import { createJSONStorage, type PersistStorage, type StateStorage } from 'zustand/middleware';
import { describe, expect, it } from 'vitest';
import { resetPersistedState } from '..';
import { useConsistStore } from '../consistStore';
import { useOptimizerStore } from '../optimizerStore';
import { useRouteStore } from '../routeStore';
import { useSettingsStore } from '../settingsStore';
import { memoryStorage } from './memoryStorage';
import {
  getSnapshotState,
  loadSnapshot,
  resetSnapshotStateForTests,
  saveSnapshot,
  snapshotSettings,
} from '../../savegame/snapshotStore';
import type { Snapshot } from '../../savegame/snapshot';

const SNAPSHOT: Snapshot = {
  companies: [{ id: 0, name: '', isAi: false }],
  towns: [],
  stations: [],
  routes: [],
  trains: [],
  groups: [],
  industries: [],
};

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
    ]);
    useSettingsStore.getState().setCurrency('EUR');
    useSettingsStore.getState().setSpeedUnit('imperial');
    useOptimizerStore.getState().setDistanceTiles(199);
    useRouteStore.getState().setDistanceTiles(321);
    expect(Object.keys(storage.dump()).length).toBeGreaterThanOrEqual(3);
    await resetPersistedState();
    expect(Object.keys(storage.dump())).toEqual([]);
    expect(useSettingsStore.getState().currency).toBe('GBP');
    expect(useSettingsStore.getState().speedUnit).toBe('metric');
    expect(useConsistStore.getState().entries).toEqual([]);
  });

  it('удаляет и импортированную партию — она тоже сохранённые данные', async () => {
    await saveSnapshot('londworth.sav', SNAPSHOT, 1, snapshotSettings({}, {}));
    expect(await loadSnapshot()).toMatchObject({ record: { fileName: 'londworth.sav' } });

    await resetPersistedState();
    // ни в памяти, ни в базе: страница перезагрузится и не должна найти партию заново
    expect(getSnapshotState().record).toBeNull();
    resetSnapshotStateForTests();
    expect((await loadSnapshot()).record).toBeNull();
  });
});
