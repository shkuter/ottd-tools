import { createJSONStorage } from 'zustand/middleware';
import { describe, expect, it } from 'vitest';
import { useOptimizerStore } from '../optimizerStore';
import { useIndustrySupplyStore } from '../industrySupplyStore';
import { memoryStorage } from './memoryStorage';

/**
 * The year moved out to the settings, where one of it serves the whole calculator. A state
 * saved before that carries a `year` of its own, and persist would hand it back to the store
 * as a stray field — unused by the tab, but alive in localStorage to confuse the next
 * migration.
 */
describe('tab stores after the year moved out', () => {
  it('drops the orphaned year from an optimizer state saved before the move', async () => {
    const storage = memoryStorage({
      'ottd-tools-optimizer': JSON.stringify({
        state: { year: 1999, cargoLabel: 'COAL', distanceTiles: 42 },
        version: 0,
      }),
    });
    useOptimizerStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useOptimizerStore.persist.rehydrate();

    const s = useOptimizerStore.getState();
    expect(s).not.toHaveProperty('year');
    // everything else that was saved is still there
    expect(s.cargoLabel).toBe('COAL');
    expect(s.distanceTiles).toBe(42);
  });

  it('drops it from a supply state as well', async () => {
    const storage = memoryStorage({
      'ottd-tools-industry-supply': JSON.stringify({
        state: { year: 1999, industryId: 'coke_oven', commonDistanceTiles: 77 },
        version: 0,
      }),
    });
    useIndustrySupplyStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useIndustrySupplyStore.persist.rehydrate();

    const s = useIndustrySupplyStore.getState();
    expect(s).not.toHaveProperty('year');
    expect(s.industryId).toBe('coke_oven');
    expect(s.commonDistanceTiles).toBe(77);
  });

  it('leaves a state saved after the move untouched', async () => {
    const storage = memoryStorage({
      'ottd-tools-optimizer': JSON.stringify({
        state: { cargoLabel: 'FEAL', maxTrains: 7 },
        version: 1,
      }),
    });
    useOptimizerStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useOptimizerStore.persist.rehydrate();

    const s = useOptimizerStore.getState();
    expect(s).not.toHaveProperty('year');
    expect(s.maxTrains).toBe(7);
  });
});

/**
 * Electrification left the tabs the way the year did: it describes not the search but the
 * track the route is built with. The value itself is carried over by the upgrade step
 * (state/upgrade.ts) before any store hydrates; what is checked here is that state saved by
 * earlier versions still reads afterwards.
 */
describe('the tabs after electrification moved out', () => {
  it('reads state that has the flag, and keeps no field for it', async () => {
    const storage = memoryStorage({
      'ottd-tools-optimizer': JSON.stringify({
        state: { allowElectric: true, cargoLabel: 'COAL', maxTrains: 3 },
        version: 1,
      }),
    });
    useOptimizerStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useOptimizerStore.persist.rehydrate();

    const s = useOptimizerStore.getState();
    expect(s).not.toHaveProperty('allowElectric');
    expect(s.cargoLabel).toBe('COAL');
    expect(s.maxTrains).toBe(3);
  });

  it('the same for the supply tab', async () => {
    const storage = memoryStorage({
      'ottd-tools-industry-supply': JSON.stringify({
        state: { allowElectric: true, industryId: 'tyre_plant', commonDistanceTiles: 55 },
        version: 1,
      }),
    });
    useIndustrySupplyStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useIndustrySupplyStore.persist.rehydrate();

    const s = useIndustrySupplyStore.getState();
    expect(s).not.toHaveProperty('allowElectric');
    expect(s.industryId).toBe('tyre_plant');
    expect(s.commonDistanceTiles).toBe(55);
  });

  it('state saved before the year moved out walks all the way to the current version', async () => {
    const storage = memoryStorage({
      'ottd-tools-optimizer': JSON.stringify({
        state: { year: 1999, allowElectric: true, cargoLabel: 'FEAL' },
        version: 0,
      }),
    });
    useOptimizerStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useOptimizerStore.persist.rehydrate();

    const s = useOptimizerStore.getState();
    expect(s).not.toHaveProperty('year');
    expect(s).not.toHaveProperty('allowElectric');
    expect(s.cargoLabel).toBe('FEAL');
  });
});
