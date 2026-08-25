/** Companies (PLYR): who owns what the snapshot lists. */

import type { Chunk } from '../chunks';
import { asNumber, asString, readTable } from '../values';

export interface SavedCompany {
  index: number;
  /** Player-given name; empty when the game generates one. */
  name: string;
  isAi: boolean;
}

export function readCompanies(chunk: Chunk | undefined): Map<number, SavedCompany> {
  return readTable(chunk, (values, index) => ({
    index,
    name: asString(values.get('name')),
    isAi: (asNumber(values.get('is_ai')) ?? 0) !== 0,
  }));
}
