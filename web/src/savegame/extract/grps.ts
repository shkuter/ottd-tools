/** Vehicle groups (GRPS): names and hierarchy for the trains list. */

import type { Chunk } from '../chunks';
import { asNumber, asString, readTable } from '../values';

export interface SavedGroup {
  index: number;
  name: string;
  owner: number;
  vehicleType: number;
  /** Parent group index; 0xffff at the root. */
  parent: number;
}

export function readGroups(chunk: Chunk | undefined): Map<number, SavedGroup> {
  return readTable(chunk, (values, index) => ({
    index,
    name: asString(values.get('name')),
    owner: asNumber(values.get('owner')) ?? 0,
    vehicleType: asNumber(values.get('vehicle_type')) ?? 0,
    parent: asNumber(values.get('parent')) ?? 0xffff,
  }));
}
