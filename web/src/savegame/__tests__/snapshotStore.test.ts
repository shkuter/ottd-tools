import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getSnapshotState,
  loadSnapshot,
  resetSnapshotStateForTests,
  saveSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  snapshotSettings,
  soldIdsFor,
  subscribeSnapshot,
  type SnapshotRecord,
} from '../snapshotStore';
import type { Snapshot } from '../snapshot';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type GameSettings,
} from '../../engine/settings';

const EMPTY: Snapshot = {
  soldIds: null,
  companies: [],
  towns: [],
  stations: [],
  routes: [],
  trains: [],
  groups: [],
  industries: [],
};

const SETTINGS = snapshotSettings({}, {});

describe('хранилище снапшота', () => {
  beforeEach(async () => {
    resetSnapshotStateForTests();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('ottd-tools');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });

  it('запись переживает перечтение и уведомляет подписчиков', async () => {
    let notified = 0;
    const unsubscribe = subscribeSnapshot(() => notified++);
    await saveSnapshot('londworth.sav', EMPTY, 1_755_000_000_000, SETTINGS);
    expect(notified).toBeGreaterThan(0);
    unsubscribe();

    resetSnapshotStateForTests();
    const state = await loadSnapshot();
    expect(state.record?.fileName).toBe('londworth.sav');
    expect(state.record?.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(state.droppedOutdated).toBe(false);
  });

  it('новый импорт заменяет предыдущий', async () => {
    await saveSnapshot('old.sav', EMPTY, 1, SETTINGS);
    await saveSnapshot('new.sav', EMPTY, 2, SETTINGS);
    resetSnapshotStateForTests();
    const state = await loadSnapshot();
    expect(state.record?.fileName).toBe('new.sav');
  });

  it('устаревшая схема удаляется и об этом сообщается', async () => {
    await saveSnapshot('old.sav', EMPTY, 1, SETTINGS);
    // руками старим запись в базе
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('ottd-tools', 1);
      req.onsuccess = () => resolve(req.result);
    });
    const tx = db.transaction('snapshot', 'readwrite');
    tx.objectStore('snapshot').put(
      { schemaVersion: SNAPSHOT_SCHEMA_VERSION - 1, fileName: 'old.sav', savedAt: 1, snapshot: EMPTY },
      'current',
    );
    await new Promise((r) => (tx.oncomplete = r));
    db.close();

    resetSnapshotStateForTests();
    const state = await loadSnapshot();
    expect(state.record).toBeNull();
    expect(state.droppedOutdated).toBe(true);
    // повторное чтение: записи больше нет вовсе
    resetSnapshotStateForTests();
    const again = await loadSnapshot();
    expect(again.record).toBeNull();
    expect(again.droppedOutdated).toBe(false);
    expect(getSnapshotState().loading).toBe(false);
  });

  it('партия на ростере, которого больше нет, удаляется так же', async () => {
    // схема та же, а набор из калькулятора удалён (xUSSR): каталога для его машин нет,
    // и вкладка «Партия» разложила бы такую запись в undefined вместо ростера
    await saveSnapshot('old.sav', EMPTY, 1, SETTINGS);
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('ottd-tools', 1);
      req.onsuccess = () => resolve(req.result);
    });
    const tx = db.transaction('snapshot', 'readwrite');
    tx.objectStore('snapshot').put(
      {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        fileName: 'xussr.sav',
        savedAt: 1,
        snapshot: EMPTY,
        settings: {
          ...SETTINGS,
          game: { ...SETTINGS.game, trainSet: 'xussr' as unknown as GameSettings['trainSet'] },
        },
      },
      'current',
    );
    await new Promise((r) => (tx.oncomplete = r));
    db.close();

    resetSnapshotStateForTests();
    const state = await loadSnapshot();
    expect(state.record).toBeNull();
    expect(state.droppedOutdated).toBe(true);
  });
});

describe('настройки партии в записи', () => {
  it('извлечённое побеждает, недостающее берётся из значений по умолчанию', () => {
    const settings = snapshotSettings({ firs: true, firsEconomy: 'steeltown' }, { priceYear: 1975 });
    expect(settings.game.firs).toBe(true);
    expect(settings.game.firsEconomy).toBe('steeltown');
    expect(settings.calc.priceYear).toBe(1975);
    // сейв ничего не сказал про инфляцию — значит значение по умолчанию
    expect(settings.game.inflation).toBe(DEFAULT_GAME_SETTINGS.inflation);
    expect(settings.calc.capacityIndex).toBe(DEFAULT_CALC_SETTINGS.capacityIndex);
  });

  it('набор полон: у каждого поля значение есть', () => {
    const settings = snapshotSettings({}, {});
    for (const [key, value] of Object.entries(settings.game)) {
      expect(value, `game.${key}`).not.toBeUndefined();
    }
    for (const [key, value] of Object.entries(settings.calc)) {
      expect(value, `calc.${key}`).not.toBeUndefined();
    }
  });
});

describe('что продаёт партия — только своей партии', () => {
  const SETS = { trainSet: 'iron_horse' as const, firs: true, firsEconomy: 'STEELTOWN' };
  const record = (year: number, sets: Partial<GameSettings> = {}): SnapshotRecord => ({
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fileName: 'game.sav',
    savedAt: 0,
    snapshot: { ...EMPTY, soldIds: ['abernant'] },
    settings: snapshotSettings({ ...SETS, ...sets }, { priceYear: year }),
  });

  it('в свой год и на своих наборах список отдаётся', () => {
    expect([...(soldIdsFor(record(1875), 1875, SETS) ?? [])]).toEqual(['abernant']);
  });

  it('в другой год — не отдаётся: ответ относится к дате сейва', () => {
    expect(soldIdsFor(record(1875), 1900, SETS)).toBeNull();
  });

  it('под другим ростером — не отдаётся: id той партии там ничего не значат', () => {
    expect(soldIdsFor(record(1875), 1875, { ...SETS, trainSet: 'vanilla' })).toBeNull();
  });

  it('под другой экономикой — не отдаётся: она решает, что машине возить', () => {
    expect(soldIdsFor(record(1875), 1875, { ...SETS, firsEconomy: 'BASIC_TEMPERATE' })).toBeNull();
    expect(soldIdsFor(record(1875), 1875, { ...SETS, firs: false })).toBeNull();
  });

  it('без записи — не отдаётся', () => {
    expect(soldIdsFor(null, 1875, SETS)).toBeNull();
  });
});
