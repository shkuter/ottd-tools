import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getSnapshotState,
  loadSnapshot,
  resetSnapshotStateForTests,
  saveSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  subscribeSnapshot,
} from '../snapshotStore';
import type { Snapshot } from '../snapshot';

const EMPTY: Snapshot = {
  companies: [],
  towns: [],
  stations: [],
  routes: [],
  trains: [],
  groups: [],
  industries: [],
};

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
    await saveSnapshot('londworth.sav', EMPTY, 1_755_000_000_000);
    expect(notified).toBeGreaterThan(0);
    unsubscribe();

    resetSnapshotStateForTests();
    const state = await loadSnapshot();
    expect(state.record?.fileName).toBe('londworth.sav');
    expect(state.record?.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(state.droppedOutdated).toBe(false);
  });

  it('новый импорт заменяет предыдущий', async () => {
    await saveSnapshot('old.sav', EMPTY, 1);
    await saveSnapshot('new.sav', EMPTY, 2);
    resetSnapshotStateForTests();
    const state = await loadSnapshot();
    expect(state.record?.fileName).toBe('new.sav');
  });

  it('устаревшая схема удаляется и об этом сообщается', async () => {
    await saveSnapshot('old.sav', EMPTY, 1);
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
});
