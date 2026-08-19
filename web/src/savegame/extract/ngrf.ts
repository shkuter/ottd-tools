/**
 * NGRF — the NewGRF sets active in the game, with the parameters the player set for each.
 * The set itself is not in the savegame, so a set is identified by its GRF id alone.
 */

import type { Chunk } from '../chunks';
import { asNumber, readRecord } from '../values';

export interface SavedGrf {
  /** GRF id as stored in the savegame. */
  grfid: number;
  /** Name the set reports in game, empty on saves that did not store it. */
  name: string;
  filename: string;
  version: number;
  params: number[];
}

export function readNewGrfs(chunk: Chunk | undefined): SavedGrf[] {
  if (!chunk?.fields) return [];
  const out: SavedGrf[] = [];
  for (const record of chunk.records) {
    const values = readRecord(record.data, chunk.fields);
    const params = values.get('param');
    // pre-JGRPP saves cap the list with a separate count; later ones store it already trimmed
    const declared = asNumber(values.get('num_params'));
    const all = Array.isArray(params) ? params : [];
    out.push({
      grfid: asNumber(values.get('ident.grfid')) ?? 0,
      name: String(values.get('grf_name') ?? ''),
      filename: String(values.get('filename') ?? ''),
      version: asNumber(values.get('version')) ?? 0,
      params: declared == null ? all : all.slice(0, declared),
    });
  }
  return out;
}
