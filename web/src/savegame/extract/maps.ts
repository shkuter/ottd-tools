/**
 * MAPS — the size of the map, one table record of `dim_x` / `dim_y` (map_sl.cpp:25).
 *
 * Only the width is of interest: a TileIndex is `y * width + x`, so the width is what turns
 * a station's stored tile back into coordinates. Present since savegame version 6, which is
 * far below the border the import supports.
 */

import type { Chunk } from '../chunks';
import { asNumber, readRecord } from '../values';

export interface SavedMapSize {
  width: number;
  height: number;
}

export function readMapSize(chunk: Chunk | undefined): SavedMapSize | undefined {
  if (!chunk?.fields) return undefined;
  const record = chunk.records[0];
  if (!record) return undefined;
  const values = readRecord(record.data, chunk.fields);
  const width = asNumber(values.get('dim_x'));
  const height = asNumber(values.get('dim_y'));
  if (width == null || height == null || width <= 0 || height <= 0) return undefined;
  return { width, height };
}
