import { createJSONStorage } from 'zustand/middleware';
import { describe, expect, it } from 'vitest';
import { EMPTY_INPUT, inputKey, useIndustrySupplyStore } from '../industrySupplyStore';
import { memoryStorage } from './memoryStorage';
import { activeIndustries, industrySupplyInputs } from '../../dataset';
import { DEFAULT_GAME_SETTINGS } from '../../engine/settings';

describe('industry supply store', () => {
  it('survives a reload: the routes of the inputs come back from storage', async () => {
    const storage = memoryStorage();
    const store = useIndustrySupplyStore;
    store.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await store.persist.rehydrate();

    const key = inputKey('tyre_plant', 'RUBR');
    store.getState().setIndustryId('tyre_plant');
    store.getState().setInput(key, { distanceTiles: 120, productionPerMonth: 90 });
    await store.persist.rehydrate();

    expect(store.getState().inputs[key]).toEqual({ distanceTiles: 120, productionPerMonth: 90 });
    expect(store.getState().industryId).toBe('tyre_plant');
  });

  it('keeps the routes of two industries apart, even for the same cargo', () => {
    const store = useIndustrySupplyStore;
    store.getState().setInput(inputKey('tyre_plant', 'RUBR'), { distanceTiles: 50 });
    store.getState().setInput(inputKey('rubber_plantation', 'RUBR'), { distanceTiles: 300 });
    expect(store.getState().inputs[inputKey('tyre_plant', 'RUBR')].distanceTiles).toBe(50);
    expect(store.getState().inputs[inputKey('rubber_plantation', 'RUBR')].distanceTiles).toBe(300);
  });

  it('fills the given inputs with one distance and leaves their outputs alone', () => {
    const store = useIndustrySupplyStore;
    const keys = ['a:X', 'b:Y'];
    store.getState().setInput('a:X', { productionPerMonth: 40 });
    store.getState().setCommonDistanceTiles(220);
    store.getState().applyCommonDistance(keys);
    expect(store.getState().inputs['a:X']).toEqual({ distanceTiles: 220, productionPerMonth: 40 });
    expect(store.getState().inputs['b:Y']).toEqual({ ...EMPTY_INPUT, distanceTiles: 220 });
  });

  it('drops an industry the active economy does not have', () => {
    const steeltown = { ...DEFAULT_GAME_SETTINGS, firs: true, firsEconomy: 'STEELTOWN' };
    const temperate = { ...DEFAULT_GAME_SETTINGS, firs: true, firsEconomy: 'BASIC_TEMPERATE' };
    expect(activeIndustries(steeltown).some((i) => i.id === 'tyre_plant')).toBe(true);
    expect(activeIndustries(temperate).some((i) => i.id === 'tyre_plant')).toBe(false);
    // inputs are read off the active economy, so an industry from another one simply has none
    expect(industrySupplyInputs(temperate, 'tyre_plant')).toEqual([]);
  });
});
