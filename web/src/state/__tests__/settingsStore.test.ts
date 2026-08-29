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
    // единицы скорости в старом сохранении не было — берётся значение по умолчанию
    expect(s.speedUnit).toBe('metric');
  });

  it('выбранная система единиц скорости переживает перезагрузку', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ state: { speedUnit: 'imperial' }, version: 1 }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().speedUnit).toBe('imperial');
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

  it('экономика FIRS, которой больше нет в данных, откатывается на значение по умолчанию', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ state: { game: { firsEconomy: 'NO_SUCH_ECONOMY' } }, version: 1 }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();
    const s = useSettingsStore.getState();
    expect(s.game.firsEconomy).toBe(DEFAULT_GAME_SETTINGS.firsEconomy);
    // сохранённая, но существующая экономика не трогается
    const kept = memoryStorage({
      [KEY]: JSON.stringify({ state: { game: { firsEconomy: 'BASIC_ARCTIC' } }, version: 1 }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => kept) });
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().game.firsEconomy).toBe('BASIC_ARCTIC');
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

describe('миграция до v2: наборы NewGRF выключаются у всех', () => {
  it('сохранение v1 с включёнными наборами доходит до ветки v2, а не возвращается нетронутым', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({
        state: { game: { ironHorse: true, firs: true, freightTrains: 3 } },
        version: 1,
      }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();

    const s = useSettingsStore.getState();
    // v2 выключила набор, v4 перевела выключенный флаг в ванильный ростер
    expect(s.game.trainSet).toBe('vanilla');
    expect(s.game.firs).toBe(false);
    // всё прочее сохранённое осталось при своём
    expect(s.game.freightTrains).toBe(3);
  });

  it('сохранение v0 проходит обе ветки: множители разделяются И наборы выключаются', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({
        state: { game: { ironHorse: true, firs: true, basecostTrainRunning: 4 } },
        version: 0,
      }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();

    const s = useSettingsStore.getState();
    // ветка v1 отработала — иначе множители остались бы дефолтными
    expect(s.game.basecostTrainRunningSteam).toBe(4);
    expect(s.game.basecostTrainRunningDiesel).toBe(4);
    expect(s.game.basecostTrainRunningElectric).toBe(4);
    // и ветки v2/v4 следом
    expect(s.game.trainSet).toBe('vanilla');
    expect(s.game.firs).toBe(false);
  });

  it('сохранение v2 не трогается: набор, включённый после миграции, остаётся включённым', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ state: { game: { ironHorse: true, firs: true } }, version: 2 }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();

    const s = useSettingsStore.getState();
    // v4 переводит включённый флаг в Iron Horse — выбор пользователя не теряется
    expect(s.game.trainSet).toBe('iron_horse');
    expect(s.game.firs).toBe(true);
  });
});

describe('миграция до v4: флаг Iron Horse становится выбором набора', () => {
  it('включённый флаг v3 переводится в Iron Horse, поле исчезает', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ state: { game: { ironHorse: true, firs: true } }, version: 3 }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();

    // живой стор, а не localStorage: гидратация случается раньше любого чтения,
    // и затирание перевода первой же записью видно только здесь
    const s = useSettingsStore.getState();
    expect(s.game.trainSet).toBe('iron_horse');
    expect(s.game).not.toHaveProperty('ironHorse');
  });

  it('выключенный флаг v3 переводится в ванильный ростер', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ state: { game: { ironHorse: false } }, version: 3 }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().game.trainSet).toBe('vanilla');
  });

  it('сохранение v4 не трогается: выбранный xUSSR остаётся выбранным', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ state: { game: { trainSet: 'xussr' } }, version: 4 }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().game.trainSet).toBe('xussr');
  });
});

describe('год расчёта в сохранённых настройках', () => {
  it('переживает перезагрузку: каталог поднимает его из хранилища, а не из дефолта', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ state: { calc: { priceYear: 1975 } }, version: 2 }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().calc.priceYear).toBe(1975);
  });

  it('год вне обычного диапазона поля тоже переживает: границы у года игровые', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({ state: { calc: { priceYear: 1700 } }, version: 2 }),
    });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().calc.priceYear).toBe(1700);
  });
});

describe('миграция типа путей', () => {
  const rehydrate = async (state: unknown, version: number) => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ state, version }) });
    useSettingsStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
    await useSettingsStore.persist.rehydrate();
    return useSettingsStore.getState();
  };

  // семейства колеи стали лейблами путей игры
  it.each([
    ['NG', 'NAAN'],
    ['METRO', 'MTRO'],
    ['MAGLEV', 'MGLV'],
    ['RAIL', 'RAIL'],
    ['MONO', 'MONO'],
  ])('сохранённое семейство %s читается как путь %s', async (saved, expected) => {
    const s = await rehydrate({ calc: { trackType: saved } }, 2);
    expect(s.calc.trackType).toBe(expected);
  });

  it('состояние каждой прошлой версии доходит до текущей', async () => {
    // v0 не знал ни лейблов, ни раздельных множителей содержания
    const fromZero = await rehydrate(
      { game: { basecostTrainRunning: 4 }, calc: { trackType: 'NG' } },
      0,
    );
    expect(fromZero.calc.trackType).toBe('NAAN');
    expect(fromZero.game.basecostTrainRunningSteam).toBe(4);

    const fromOne = await rehydrate({ calc: { trackType: 'METRO' } }, 1);
    expect(fromOne.calc.trackType).toBe('MTRO');
  });

  it('сохранение текущей версии не трогается', async () => {
    const s = await rehydrate({ calc: { trackType: 'ELRL' } }, 3);
    expect(s.calc.trackType).toBe('ELRL');
  });

  it('пустой calc получает путь по умолчанию', async () => {
    const s = await rehydrate({ game: { inflation: true } }, 2);
    expect(s.calc.trackType).toBe('RAIL');
  });
});
