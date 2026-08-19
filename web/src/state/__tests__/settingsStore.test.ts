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

  it('сохранённые настройки сложности не перетираются новыми дефолтами', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ state: { game: { vehicleCosts: 1 } }, version: 0 }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();
    const s = useSettingsStore.getState();
    expect(s.game.vehicleCosts).toBe(1);
    // а год начала игры, которого в старом сохранении нет, приходит из дефолтов
    expect(s.game.startingYear).toBe(1950);
  });

  it('множитель Base Costs, которого больше нет в списке, становится «unchanged»', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({
        state: {
          game: {
            basecostGrf: true,
            basecostLocomotive: 0,
            basecostWagon: 0,
            basecostTrainRunningSteam: 0,
          },
        },
        version: 1,
      }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();
    const s = useSettingsStore.getState();
    expect(s.game.basecostLocomotive).toBe(1);
    expect(s.game.basecostWagon).toBe(1);
    expect(s.game.basecostTrainRunningSteam).toBe(1);
    // GRF при этом остаётся включённым: сбрасываются только сами множители
    expect(s.game.basecostGrf).toBe(true);
  });

  it('старый общий множитель содержания переносится во все три running-класса', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({
        state: { game: { basecostGrf: true, basecostTrainRunning: 4 } },
        version: 0,
      }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();
    const s = useSettingsStore.getState();
    // раньше множитель действовал на все поезда — значит и после миграции числа те же
    expect(s.game.basecostTrainRunningSteam).toBe(4);
    expect(s.game.basecostTrainRunningDiesel).toBe(4);
    expect(s.game.basecostTrainRunningElectric).toBe(4);
    expect(s.game).not.toHaveProperty('basecostTrainRunning');
  });
});
