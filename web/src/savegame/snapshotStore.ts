/**
 * The stored snapshot: one record in IndexedDB, replaced by every import, versioned by
 * schema. Not a zustand store on purpose — the payload is megabytes and lives outside
 * localStorage; React subscribes through useSyncExternalStore-compatible subscribe().
 *
 * A record whose schemaVersion differs from the current one is dropped on load and the
 * state says so, so the UI can ask for the file again instead of misreading old data.
 */

import type { Snapshot } from './snapshot';

/** Bump when the Snapshot shape changes; an old record is dropped, not migrated. */
export const SNAPSHOT_SCHEMA_VERSION = 1;

const DB_NAME = 'ottd-tools';
const STORE = 'snapshot';
const KEY = 'current';

export interface SnapshotRecord {
  schemaVersion: number;
  fileName: string;
  savedAt: number;
  snapshot: Snapshot;
}

export interface SnapshotState {
  /** Not yet read from the database. */
  loading: boolean;
  record: SnapshotRecord | null;
  /** True when a stored record was dropped because its schema is outdated. */
  droppedOutdated: boolean;
}

let state: SnapshotState = { loading: true, record: null, droppedOutdated: false };
const listeners = new Set<() => void>();

export function getSnapshotState(): SnapshotState {
  return state;
}

export function subscribeSnapshot(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(next: SnapshotState): void {
  state = next;
  for (const listener of listeners) listener();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
  });
}

function requestDone<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await requestDone(run(db.transaction(STORE, mode).objectStore(STORE)));
  } finally {
    db.close();
  }
}

/** Reads the stored record once at startup; an outdated one is deleted right here. */
export async function loadSnapshot(): Promise<SnapshotState> {
  try {
    const record = (await withStore('readonly', (s) => s.get(KEY))) as SnapshotRecord | undefined;
    if (record === undefined) {
      setState({ loading: false, record: null, droppedOutdated: false });
    } else if (record.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      await withStore('readwrite', (s) => s.delete(KEY));
      setState({ loading: false, record: null, droppedOutdated: true });
    } else {
      setState({ loading: false, record, droppedOutdated: false });
    }
  } catch {
    // a browser without IndexedDB (or a blocked one) just has no stored snapshot
    setState({ loading: false, record: null, droppedOutdated: false });
  }
  return state;
}

/** Replaces the stored snapshot — the confirmed import calls this. */
export async function saveSnapshot(fileName: string, snapshot: Snapshot, savedAt: number): Promise<void> {
  const record: SnapshotRecord = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fileName,
    savedAt,
    snapshot,
  };
  await withStore('readwrite', (s) => s.put(record, KEY));
  setState({ loading: false, record, droppedOutdated: false });
}

/** Test hook: forget the in-memory state without touching the database. */
export function resetSnapshotStateForTests(): void {
  state = { loading: true, record: null, droppedOutdated: false };
}
