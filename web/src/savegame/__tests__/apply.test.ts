import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { applyImport, type ConfirmedImport } from '../apply';
import type { SavegameImport } from '../import';
import type { Snapshot } from '../snapshot';
import {
  loadSnapshot,
  resetSnapshotStateForTests,
  SNAPSHOT_SCHEMA_VERSION,
} from '../snapshotStore';
import { useSettingsStore } from '../../state/settingsStore';
import { useOptimizerStore } from '../../state/optimizerStore';
import { useIndustrySupplyStore } from '../../state/industrySupplyStore';

const PROPOSAL: SavegameImport = {
  jgrpp: true,
  game: {
    jgrpp: true,
    dayLengthFactor: 5,
    vehicleCosts: 2,
    basecostGrf: true,
    firsEconomy: 'BASIC_ARCTIC',
  },
  calc: { priceYear: 1860, capacityIndex: 2 },
  info: [],
  unreadBaseCostSets: [],
  recognisedSets: [],
  display: {},
};

const SNAPSHOT: Snapshot = {
  soldIds: null,
  companies: [{ id: 0, name: '', isAi: false }],
  towns: [],
  stations: [],
  routes: [],
  trains: [],
  groups: [],
  industries: [],
};

const CONFIRMED: ConfirmedImport = {
  proposal: PROPOSAL,
  snapshot: SNAPSHOT,
  fileName: 'londworth.sav',
};

beforeEach(async () => {
  useSettingsStore.getState().reset();
  resetSnapshotStateForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('ottd-tools');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
});

describe('применение импорта', () => {
  it('пока подтверждения нет, ничего не меняется и снапшот не сохраняется', async () => {
    const { game } = useSettingsStore.getState();
    expect(game.dayLengthFactor).toBe(1);
    expect(game.firsEconomy).toBe('STEELTOWN');
    expect((await loadSnapshot()).record).toBeNull();
  });

  it('одно подтверждение применяет настройки и сохраняет снапшот', async () => {
    await applyImport(CONFIRMED, 1_755_000_000_000);
    expect(useSettingsStore.getState().game.dayLengthFactor).toBe(5);

    resetSnapshotStateForTests();
    const stored = await loadSnapshot();
    expect(stored.record).toMatchObject({
      fileName: 'londworth.sav',
      savedAt: 1_755_000_000_000,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    });
    expect(stored.record?.snapshot.companies).toHaveLength(1);
  });

  it('подтверждение применяет значения из сейва', async () => {
    await applyImport(CONFIRMED, 1);
    const { game, calc } = useSettingsStore.getState();
    expect(game).toMatchObject({ jgrpp: true, dayLengthFactor: 5, vehicleCosts: 2 });
    expect(calc).toMatchObject({ priceYear: 1860, capacityIndex: 2 });
    // настройки, которых в сейве нет, остаются прежними
    expect(game.freightTrains).toBe(1);
  });

  it('валюта партии применяется вместе с остальным', async () => {
    // курс валюты пересчитывает каждую показанную сумму, поэтому подтверждение
    // переносит и её: партия на RUR, оставленная на RUB, завышала бы деньги в 1.6 раза
    useSettingsStore.setState({ currency: 'RUB', speedUnit: 'imperial' });
    await applyImport(
      {
        ...CONFIRMED,
        proposal: { ...PROPOSAL, display: { currency: 'RUR', speedUnit: 'metric' } },
      },
      1,
    );

    const s = useSettingsStore.getState();
    expect(s.currency).toBe('RUR');
    expect(s.speedUnit).toBe('metric');
  });

  it('сейв без валюты выбор не трогает', async () => {
    useSettingsStore.setState({ currency: 'JPY' });
    await applyImport({ ...CONFIRMED, proposal: { ...PROPOSAL, display: {} } }, 1);
    expect(useSettingsStore.getState().currency).toBe('JPY');
  });

  it('год партии становится годом всего калькулятора', async () => {
    // год живёт одной настройкой, и вкладки берут список покупки из неё: после импорта
    // каталог, подбор и снабжение считают на год партии, а не на то, что стояло раньше
    const year = 1975;
    await applyImport(
      { ...CONFIRMED, proposal: { ...PROPOSAL, calc: { ...PROPOSAL.calc, priceYear: year } } },
      1,
    );

    expect(useSettingsStore.getState().calc.priceYear).toBe(year);
    // и своего года ни у одной вкладки не осталось — иначе он бы тут и всплыл
    expect(useOptimizerStore.getState()).not.toHaveProperty('year');
    expect(useIndustrySupplyStore.getState()).not.toHaveProperty('year');
  });

  it('экономика FIRS приезжает обычной настройкой партии', async () => {
    await applyImport(CONFIRMED, 1);
    expect(useSettingsStore.getState().game.firsEconomy).toBe('BASIC_ARCTIC');
  });

  it('без экономики в сейве настройка не трогается', async () => {
    const { firsEconomy: _dropped, ...game } = PROPOSAL.game;
    await applyImport({ ...CONFIRMED, proposal: { ...PROPOSAL, game } }, 1);
    expect(useSettingsStore.getState().game.firsEconomy).toBe('STEELTOWN');
  });

  it('в записи лежат настройки партии, а не то, что настроено в калькуляторе', async () => {
    // до импорта пользователь крутил свои настройки: они не должны попасть в запись
    useSettingsStore.getState().applySettings({ dayLengthFactor: 9, freightTrains: 4 }, {});

    await applyImport(CONFIRMED, 1);
    resetSnapshotStateForTests();
    const record = (await loadSnapshot()).record!;

    // значения сейва — из сейва
    expect(record.settings.game).toMatchObject({ dayLengthFactor: 5, vehicleCosts: 2 });
    expect(record.settings.calc).toMatchObject({ priceYear: 1860, capacityIndex: 2 });
    // то, чего сейв не называл, — значение по умолчанию, а не 4 из стора
    expect(record.settings.game.freightTrains).toBe(1);
  });

  it('правки настроек после импорта запись не трогают', async () => {
    await applyImport(CONFIRMED, 1);
    useSettingsStore.getState().applySettings({ dayLengthFactor: 9 }, { priceYear: 2000 });

    resetSnapshotStateForTests();
    const record = (await loadSnapshot()).record!;
    expect(record.settings.game.dayLengthFactor).toBe(5);
    expect(record.settings.calc.priceYear).toBe(1860);
  });
});

/**
 * Импорт кончается не настройкой, а тем, что видно на вкладке: сейв доезжает до списка
 * покупки и до активного набора. Тесты выше проверяют, что применилось; эти — что
 * применённое дошло по назначению.
 */
describe('импорт доезжает до вкладок', () => {
  it('год партии решает список покупки, а не только настройку', async () => {
    const { activeTrains } = await import('../../dataset');
    const { introAvailability } = await import('../../engine/availability');
    await applyImport(
      { ...CONFIRMED, proposal: { ...PROPOSAL, game: { ...PROPOSAL.game, trainSet: 'iron_horse' as const }, calc: { priceYear: 1975 } } },
      1,
    );

    const { game, calc } = useSettingsStore.getState();
    expect(calc.priceYear).toBe(1975);
    // список покупки того года: машина 1975 года продаётся, машина 1990-го ещё нет
    const trains = activeTrains(game);
    const later = trains.find((t) => t.intro_year > calc.priceYear)!;
    expect(introAvailability(later, calc.priceYear, game).certain).toBe(false);
    const earlier = trains.find((t) => t.intro_year < calc.priceYear)!;
    expect(introAvailability(earlier, calc.priceYear, game).certain).toBe(true);
  });

  it('год вне обычного диапазона переживает импорт и остаётся годом расчёта', async () => {
    await applyImport(
      { ...CONFIRMED, proposal: { ...PROPOSAL, calc: { ...PROPOSAL.calc, priceYear: 1700 } } },
      1,
    );
    // поле года на вкладках диапазон не сужает: партия может быть начата когда угодно
    expect(useSettingsStore.getState().calc.priceYear).toBe(1700);
  });

  it('сейв без наборов выключает включённые и оставляет каталог ванильным', async () => {
    const { activeTrains } = await import('../../dataset');
    const { buildImport } = await import('../import');
    const { readSavegame } = await import('../read');
    const { fixture } = await import('./fixture');

    // до импорта пользователь играл с наборами — иначе тест сравнивал бы дефолт с дефолтом
    useSettingsStore.getState().applySettings({ trainSet: 'iron_horse' as const, firs: true }, {});
    expect(activeTrains(useSettingsStore.getState().game).some((t) => !t.id.startsWith('vanilla_')))
      .toBe(true);

    // настоящая ванильная партия: предложение собирается из её списка GRF, а не пишется руками
    const proposal = buildImport(await readSavegame(fixture('vanilla-1951')));
    await applyImport({ ...CONFIRMED, proposal }, 1);

    const { game } = useSettingsStore.getState();
    expect(game.trainSet).toBe('vanilla');
    expect(game.firs).toBe(false);
    expect(activeTrains(game).every((t) => t.id.startsWith('vanilla_'))).toBe(true);
  });
});
