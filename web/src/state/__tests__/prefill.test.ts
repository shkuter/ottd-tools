import { describe, expect, it } from 'vitest';
import { createJSONStorage } from 'zustand/middleware';
import { prefillMatches, type PrefillOrigin } from '../prefill';
import { EMPTY_NETWORK_INPUTS, useRouteStore, type RoutePrefill } from '../routeStore';
import { memoryStorage } from './memoryStorage';

const carried: PrefillOrigin<RoutePrefill> = {
  source: 'route',
  label: 'Coalmouth — Power Station',
  values: {
    cargoLabel: 'COAL',
    distanceTiles: 96,
    amount: 240,
    manualDays: null,
    productionPerMonth: 144,
    waitForFullLoad: true,
    consist: [
      { id: 'haar', count: 1 },
      { id: 'hopper', count: 8 },
    ],
  },
};

const current = (over: Partial<RoutePrefill> = {}): RoutePrefill => ({
  cargoLabel: 'COAL',
  distanceTiles: 96,
  amount: 240,
  manualDays: null,
  productionPerMonth: 144,
  waitForFullLoad: true,
  consist: [
    { id: 'haar', count: 1 },
    { id: 'hopper', count: 8 },
  ],
  network: EMPTY_NETWORK_INPUTS,
  ...over,
});

describe('the note follows the values it was given', () => {
  it('stands while every carried field still matches', () => {
    expect(prefillMatches(carried, current())).toBe(true);
  });

  it('goes out when any carried field is edited', () => {
    expect(prefillMatches(carried, current({ distanceTiles: 97 }))).toBe(false);
    expect(prefillMatches(carried, current({ waitForFullLoad: false }))).toBe(false);
    expect(prefillMatches(carried, current({ manualDays: 12 }))).toBe(false);
  });

  it('compares the consist by vehicle and by count', () => {
    expect(prefillMatches(carried, current({ consist: [{ id: 'haar', count: 1 }] }))).toBe(false);
    expect(
      prefillMatches(
        carried,
        current({
          consist: [
            { id: 'haar', count: 1 },
            { id: 'hopper', count: 9 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('comes back when the old value is typed back in', () => {
    const edited = current({ distanceTiles: 40 });
    expect(prefillMatches(carried, edited)).toBe(false);
    expect(prefillMatches(carried, { ...edited, distanceTiles: 96 })).toBe(true);
  });

  it('ignores fields the bridge never wrote', () => {
    // a partial bridge: only the cargo and the consist travelled
    const partial: PrefillOrigin<RoutePrefill> = {
      source: 'route',
      label: 'Ring route',
      values: { cargoLabel: 'COAL', consist: [{ id: 'haar', count: 1 }] },
    };
    const now = current({ distanceTiles: 5, amount: 1, consist: [{ id: 'haar', count: 1 }] });
    expect(prefillMatches(partial, now)).toBe(true);
  });

  it('matches nothing without an origin, or with an empty set of values', () => {
    expect(prefillMatches(null, current())).toBe(false);
    expect(prefillMatches({ source: 'route', label: 'x', values: {} }, current())).toBe(false);
  });
});

describe('the note survives a reload', () => {
  it('comes back from the saved state along with the carried values', async () => {
    const live = memoryStorage({});
    useRouteStore.persist.setOptions({ storage: createJSONStorage(() => live) });
    useRouteStore.getState().setDistanceTiles(96);
    useRouteStore.getState().setPrefillOrigin(carried);
    const saved = live.dump()['ottd-tools-route'];

    // a reload: default state again, with storage holding last session's snapshot
    useRouteStore.setState({ prefillOrigin: null, distanceTiles: 1 });
    useRouteStore.persist.setOptions({
      storage: createJSONStorage(() => memoryStorage({ 'ottd-tools-route': saved })),
    });
    await useRouteStore.persist.rehydrate();

    const revived = useRouteStore.getState().prefillOrigin;
    expect(revived?.label).toBe(carried.label);
    expect(revived?.source).toBe('route');
    expect(useRouteStore.getState().distanceTiles).toBe(96);
  });
});
