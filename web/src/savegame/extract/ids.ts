/**
 * The savegame's id mapping chunks: EIDS maps every engine pool index to the GRF that
 * defines it (engine_sl.cpp:150), IIDS does the same for industry types
 * (newgrf_sl.cpp:32). An entry of the base set carries INVALID_GRFID, not a real GRF id
 * (engine.cpp:515), and its local id is the game's own table index.
 */

import type { Chunk } from '../chunks';
import { asNumber, readTable } from '../values';

/** What the game writes for an entry of its own base set (newgrf.h:103). */
const INVALID_GRFID = 0xffffffff;

/** Does this mapping point at the base set rather than at a NewGRF? */
export function isBaseSet(mapping: GrfEntityId): boolean {
  // 0 is not a grfid the game writes, but a zeroed entry still means "not a NewGRF"
  return mapping.grfid === INVALID_GRFID || mapping.grfid === 0;
}

export interface GrfEntityId {
  grfid: number;
  /** The id inside the defining GRF: `internal_id` for engines, `entity_id` for industries. */
  localId: number;
  /**
   * Vehicle type of an engine entry (`VehicleType`: 0 train, 1 road, 2 ship, 3 aircraft).
   * The game numbers `internal_id` from zero again for every type
   * (`EngineOverrideManager::ResetToDefaultMapping`), so a GRF and a local id name a
   * vehicle only together with this. Absent for industry mappings.
   */
  type?: number;
}

/** Engine pool index → defining GRF and id; empty map when the chunk is absent. */
export function readEngineIds(chunk: Chunk | undefined): Map<number, GrfEntityId> {
  return readMapping(chunk, 'internal_id');
}

/** The `type` of a train entry — road vehicles, ships and aircraft repeat the same ids. */
export const VEHICLE_TYPE_TRAIN = 0;

/** Industry type → defining GRF and id; empty map when the chunk is absent. */
export function readIndustryTypeIds(chunk: Chunk | undefined): Map<number, GrfEntityId> {
  return readMapping(chunk, 'entity_id');
}

function readMapping(chunk: Chunk | undefined, idField: string): Map<number, GrfEntityId> {
  return readTable(chunk, (values) => {
    const grfid = asNumber(values.get('grfid'));
    const localId = asNumber(values.get(idField));
    if (grfid === undefined || localId === undefined) return undefined;
    return { grfid, localId, type: asNumber(values.get('type')) };
  });
}
