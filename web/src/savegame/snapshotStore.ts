/**
 * The stored snapshot: one record in IndexedDB, replaced by every import, versioned by
 * schema. Not a zustand store on purpose — the payload is megabytes and lives outside
 * localStorage; React subscribes through useSyncExternalStore-compatible subscribe().
 *
 * A record whose schemaVersion differs from the current one is dropped on load and the
 * state says so, so the UI can ask for the file again instead of misreading old data.
 */

import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  TRAIN_SETS,
  type CalcSettings,
  type GameSettings,
} from '../engine/settings';
import type { Snapshot } from './snapshot';

/** Bump when the Snapshot shape changes; an old record is dropped, not migrated. */
export const SNAPSHOT_SCHEMA_VERSION = 6;

/**
 * The settings of the game the snapshot was taken from — what the savegame itself stated,
 * completed with the calculator's defaults where it stated nothing.
 *
 * Complete on purpose, and never filled from the settings store: the tab computes its
 * forecasts from these, so they have to describe the game rather than whatever the user has
 * configured since.
 */
export interface SnapshotSettings {
  game: GameSettings;
  calc: CalcSettings;
}

/** Completes what the import extracted into a set that stands on its own. */
export function snapshotSettings(
  game: Partial<GameSettings>,
  calc: Partial<CalcSettings>,
): SnapshotSettings {
  return {
    game: { ...DEFAULT_GAME_SETTINGS, ...game },
    calc: { ...DEFAULT_CALC_SETTINGS, ...calc },
  };
}

/** Where the snapshot lives; exported so tests seed the same place rather than a copy. */
export const SNAPSHOT_DB = { name: 'ottd-tools', version: 1, store: 'snapshot', key: 'current' };

const DB_NAME = SNAPSHOT_DB.name;
const STORE = SNAPSHOT_DB.store;
const KEY = SNAPSHOT_DB.key;

export interface SnapshotRecord {
  schemaVersion: number;
  fileName: string;
  savedAt: number;
  snapshot: Snapshot;
  /** Settings of the game this snapshot came from; forecasts are computed from these. */
  settings: SnapshotSettings;
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
    const request = indexedDB.open(DB_NAME, SNAPSHOT_DB.version);
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

/**
 * Does the calculator still ship the sets this record was taken with?
 *
 * A record of a game played on a roster since removed is as unreadable as one of an older
 * schema: every list on the tab resolves its vehicles through the active roster, and there
 * is none to resolve them with — the lookup answers `undefined` and the tab throws. The
 * roster is read as a plain string on purpose: its type no longer has the value a record
 * written before the removal may hold.
 */
function knowsItsSets(record: SnapshotRecord): boolean {
  const set: string | undefined = record.settings?.game?.trainSet;
  return set !== undefined && (TRAIN_SETS as readonly string[]).includes(set);
}

/** Reads the stored record once at startup; one it cannot read is deleted right here. */
export async function loadSnapshot(): Promise<SnapshotState> {
  try {
    const record = (await withStore('readonly', (s) => s.get(KEY))) as SnapshotRecord | undefined;
    if (record === undefined) {
      setState({ loading: false, record: null, droppedOutdated: false });
    } else if (record.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || !knowsItsSets(record)) {
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
export async function saveSnapshot(
  fileName: string,
  snapshot: Snapshot,
  savedAt: number,
  settings: SnapshotSettings,
): Promise<void> {
  const record: SnapshotRecord = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fileName,
    savedAt,
    snapshot,
    settings,
  };
  await withStore('readwrite', (s) => s.put(record, KEY));
  setState({ loading: false, record, droppedOutdated: false });
}

/**
 * Forgets the imported game — what "reset everything" on the settings page wipes along with
 * the stored settings. The snapshot is the largest thing the calculator keeps of the user's
 * own data, so a reset that left it behind would not be one.
 */
export async function deleteSnapshot(): Promise<void> {
  // a browser without IndexedDB stored nothing to begin with; anything past this point that
  // fails is a real failure to delete and is not swallowed — a state saying the game is gone
  // while the record is still in the database would show a shell whose tab returns on the
  // next reload
  if (typeof indexedDB !== 'undefined') {
    await withStore('readwrite', (s) => s.delete(KEY));
  }
  setState({ loading: false, record: null, droppedOutdated: false });
}

/** Test hook: forget the in-memory state without touching the database. */
export function resetSnapshotStateForTests(): void {
  state = { loading: true, record: null, droppedOutdated: false };
}

/**
 * Vehicles the imported game sells, when the year and the roster being calculated are its own.
 *
 * The answer belongs to the date of the save: at another year the calculator is asking about
 * a game that has not happened, and the model takes over.
 */
export function soldIdsFor(
  record: SnapshotRecord | null,
  year: number,
  game: Pick<GameSettings, 'trainSet' | 'firs' | 'firsEconomy'>,
): ReadonlySet<string> | null {
  if (!record || record.settings.calc.priceYear !== year) return null;
  // The answer belongs to that game's sets as much as to its date: ids name vehicles of its
  // roster, and what a vehicle may carry — which decides whether the game offers it at all —
  // follows the cargo set. Under different sets the list describes a game that never was.
  const its = record.settings.game;
  if (its.trainSet !== game.trainSet) return null;
  if (its.firs !== game.firs || (game.firs && its.firsEconomy !== game.firsEconomy)) return null;
  const ids = record.snapshot.soldIds;
  return ids ? new Set(ids) : null;
}
