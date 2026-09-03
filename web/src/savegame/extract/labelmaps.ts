/**
 * RAIL and ROTT — what a rail or road type index in the map means (`labelmaps_sl.cpp`).
 *
 * A tile states its rail type as a small number, and that number is only an index into the
 * table the game built when it loaded its GRFs: the same index is Iron Horse's narrow gauge
 * in one game and something else in the next. The save writes the four-character label of
 * every index for exactly this reason — so a later load can remap. The calculator reads them
 * for the same reason: its own tables are keyed by label.
 */

import type { Chunk } from '../chunks';
import { asNumber, readTable } from '../values';

/** Road types live in one numbering; this says which half of it an index belongs to. */
export const ROAD_TRAM_TYPE_ROAD = 0;
export const ROAD_TRAM_TYPE_TRAM = 1;

export interface RoadTypeEntry {
  label: string;
  /** `RoadTramType` as the save states it: road and tram share the index space. */
  subtype: number;
}

/**
 * The four characters of a label, as the game packs them into a uint32 ('RAIL' is
 * `'R' << 24 | 'A' << 16 | 'I' << 8 | 'L'`). An index the game never filled in reads as
 * zero, which is not a label and is left out.
 */
function labelText(packed: number | undefined): string | undefined {
  if (packed === undefined || packed === 0) return undefined;
  const text = String.fromCharCode(
    (packed >>> 24) & 0xff,
    (packed >>> 16) & 0xff,
    (packed >>> 8) & 0xff,
    packed & 0xff,
  );
  return /^[\x20-\x7e]{4}$/.test(text) ? text : undefined;
}

/** Rail type index → label; empty where the save states none. */
export function readRailTypeLabels(chunk: Chunk | undefined): Map<number, string> {
  return readTable(chunk, (values) => labelText(asNumber(values.get('label'))));
}

/** Road type index → label and which of road or tram it is. */
export function readRoadTypeLabels(chunk: Chunk | undefined): Map<number, RoadTypeEntry> {
  return readTable(chunk, (values) => {
    const label = labelText(asNumber(values.get('label')));
    if (label === undefined) return undefined;
    return { label, subtype: asNumber(values.get('subtype')) ?? ROAD_TRAM_TYPE_ROAD };
  });
}
