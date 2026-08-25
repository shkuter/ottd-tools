/**
 * Towns (CITY): the pieces a name needs. A renamed town is a plain string; anything else
 * is a generator (`townnametype`) plus a seed the snapshot renders — English Original
 * only, the rest fall back to a numbered stub.
 */

import type { Chunk } from '../chunks';
import { asNumber, asString, readTable } from '../values';

/** The first built-in name generator, English Original (SPECSTR_TOWNNAME_START,
 * strings_type.h:64; the generator list is townname.cpp:945). */
export const TOWNNAME_ENGLISH_ORIGINAL = 0x20c0;

export interface SavedTown {
  index: number;
  grfid: number;
  nameType: number;
  nameParts: number;
  /** Player-given name; empty means "generate from the seed". */
  name: string;
}

export function readTowns(chunk: Chunk | undefined): Map<number, SavedTown> {
  return readTable(chunk, (values, index) => ({
    index,
    grfid: asNumber(values.get('townnamegrfid')) ?? 0,
    nameType: asNumber(values.get('townnametype')) ?? 0,
    nameParts: asNumber(values.get('townnameparts')) ?? 0,
    name: asString(values.get('name')),
  }));
}
