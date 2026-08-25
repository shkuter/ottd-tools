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
};

const SNAPSHOT: Snapshot = {
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

describe('применение импорта', () => {
  beforeEach(async () => {
    useSettingsStore.getState().reset();
    resetSnapshotStateForTests();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('ottd-tools');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });

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
