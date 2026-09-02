import { createJSONStorage } from 'zustand/middleware';
import { describe, expect, it } from 'vitest';
import { useRouteStore } from '../routeStore';
import { memoryStorage } from './memoryStorage';

const KEY = 'ottd-tools-route';

async function rehydrateFrom(json: unknown) {
  // merge() receives the live state, so start each case from the defaults
  useRouteStore.setState({ network: { railPieces: {}, signals: 0, stations: 0 } });
  const storage = memoryStorage({ [KEY]: JSON.stringify(json) });
  useRouteStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
  await useRouteStore.persist.rehydrate();
  return storage;
}

describe('routeStore persist', () => {
  it('keeps the network counts across a reload', async () => {
    await rehydrateFrom({
      state: { network: { railPieces: { RAIL: 10372, ELRL: 400 }, signals: 1612, stations: 514 } },
      version: 0,
    });
    expect(useRouteStore.getState().network).toEqual({
      railPieces: { RAIL: 10372, ELRL: 400 },
      signals: 1612,
      stations: 514,
    });
  });

  it('gives a state saved before the network existed an empty one', async () => {
    await rehydrateFrom({ state: { distanceTiles: 96, amount: 240 }, version: 0 });
    const s = useRouteStore.getState();
    expect(s.network).toEqual({ railPieces: {}, signals: 0, stations: 0 });
    expect(s.distanceTiles).toBe(96);
  });

  it('fills back a field a partly saved network is missing', async () => {
    // persist merges field by field, so a saved `network` replaces the whole object: without
    // the store's own merge, a state saved before one of its fields existed would come back
    // with that field undefined and the panel would read NaN off it
    await rehydrateFrom({ state: { network: { railPieces: { RAIL: 12 } } }, version: 0 });
    expect(useRouteStore.getState().network).toEqual({
      railPieces: { RAIL: 12 },
      signals: 0,
      stations: 0,
    });
  });
});
