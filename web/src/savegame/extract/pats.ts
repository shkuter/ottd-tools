/**
 * PATS — the game settings. The chunk is self-describing, so this is a plain name → value
 * map: whatever the game saved is what shows up here, including settings the calculator
 * has no model for.
 */

import type { Chunk } from '../chunks';
import { readRecord, type FieldValue } from '../values';

export type SavedSettings = ReadonlyMap<string, FieldValue>;

export function readSettings(chunk: Chunk | undefined): SavedSettings {
  const record = chunk?.records[0];
  if (!record || !chunk?.fields) return new Map();
  return readRecord(record.data, chunk.fields);
}
