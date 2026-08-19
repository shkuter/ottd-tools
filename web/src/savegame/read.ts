/**
 * Everything that has to touch the file itself: unpack, walk the chunks, pull out the values.
 * The result holds plain data only, so it survives a postMessage from the worker that does
 * this work. Interpreting it against the calculator's settings happens in `import.ts`.
 */

import { readGameYear } from './extract/date';
import { readInflation, type SavedInflation } from './extract/ecmy';
import { readNewGrfs, type SavedGrf } from './extract/ngrf';
import { readSettings } from './extract/pats';
import { parseSavegame } from './parse';
import type { FieldValue } from './values';

export interface RawSavegame {
  jgrpp: boolean;
  version: number;
  /** Settings exactly as the game named them. */
  settings: Map<string, FieldValue>;
  grfs: SavedGrf[];
  /** Year the game is in, absent if the savegame did not state a date. */
  year?: number;
  inflation?: SavedInflation;
}

export async function readSavegame(bytes: Uint8Array): Promise<RawSavegame> {
  const parsed = await parseSavegame(bytes);
  return {
    jgrpp: parsed.header.jgrpp,
    version: parsed.header.version,
    settings: new Map(readSettings(parsed.chunks.get('PATS'))),
    grfs: readNewGrfs(parsed.chunks.get('NGRF')),
    year: readGameYear(parsed.chunks.get('DATE')),
    inflation: readInflation(parsed.chunks.get('ECMY')),
  };
}
