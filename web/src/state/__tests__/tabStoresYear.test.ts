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
