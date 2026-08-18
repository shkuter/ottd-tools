import { createJSONStorage } from 'zustand/middleware';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../engine/settings';
import { useSettingsStore } from '../settingsStore';
import { memoryStorage } from './memoryStorage';

const KEY = 'ottd-tools-settings';

describe('settingsStore persist', () => {
  it('старое сохранение без новых полей получает их из дефолтов, своё сохраняет', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({
        state: { currency: 'EUR', game: { inflation: true, freightTrains: 4 }, calc: { priceYear: 1975 } },
        version: 0,
      }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();
    const s = useSettingsStore.getState();
    expect(s.currency).toBe('EUR');
    expect(s.game.inflation).toBe(true);
    expect(s.game.freightTrains).toBe(4);
    expect(s.calc.priceYear).toBe(1975);
    for (const k of Object.keys(DEFAULT_GAME_SETTINGS)) expect(s.game).toHaveProperty(k);
    for (const k of Object.keys(DEFAULT_CALC_SETTINGS)) expect(s.calc).toHaveProperty(k);
    expect(s.game.jgrpp).toBe(DEFAULT_GAME_SETTINGS.jgrpp);
  });
});
