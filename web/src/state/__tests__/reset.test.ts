import { createJSONStorage } from 'zustand/middleware';
import { describe, expect, it } from 'vitest';
import { resetPersistedState } from '..';
import { useConsistStore } from '../consistStore';
import { useFirsStore } from '../firsStore';
import { useOptimizerStore } from '../optimizerStore';
import { useRouteStore } from '../routeStore';
import { useSettingsStore } from '../settingsStore';
import { memoryStorage } from './memoryStorage';

describe('resetPersistedState', () => {
  it('чистит хранилища всех зарегистрированных сторов', async () => {
    const storage = memoryStorage();
    const stores = [useSettingsStore, useConsistStore, useRouteStore, useOptimizerStore, useFirsStore];
    for (const store of stores) {
      store.persist.setOptions({ storage: createJSONStorage(() => storage) });
      await store.persist.rehydrate();
    }
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
