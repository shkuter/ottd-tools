/**
 * Turns a savegame file into the chunks the calculator reads.
 *
 * Support starts where settings became self-describing: since savegame version 295 the PATS
 * chunk is a table that names its own fields (settings_sl.cpp:158), and JGRPP writes the same
 * layout once it has the table_pats feature. Older saves store settings positionally and can
 * only be read with the game's full compatibility tables, so they are rejected. The check
 * looks at the chunk type rather than the version number — the patchpack numbers its versions
 * separately, so comparing them against upstream would be guesswork.
 */

import { CH_TABLE, readChunks, type Chunk } from './chunks';
import { decompressSavegame, type SavegameHeader } from './decompress';
import { SavegameFormatError } from './reader';

/** First upstream version that writes table chunks; shown to the user when a file is too old. */
export const MIN_SAVEGAME_VERSION = 295;

/** Chunks the calculator reads; everything else is walked past. */
export const WANTED_CHUNKS = [
  'PATS', 'NGRF', 'ECMY', 'DATE',
  // network of the game, for the snapshot; MAPS states how wide the map is, which is what
  // turns a station's stored tile into coordinates
  'MAPS', 'EIDS', 'IIDS', 'VEHS', 'ORDL', 'ORDR', 'STNN', 'CAPA', 'INDY', 'CITY', 'GRPS', 'PLYR',
  // what the game sells on its own date: it decides availability from rolled dates and
  // ages the data files cannot state, so its answer beats any recomputation
  'ENGN',
] as const;

export interface ParsedSavegame {
  header: SavegameHeader;
  chunks: Map<string, Chunk>;
}

export async function parseSavegame(bytes: Uint8Array): Promise<ParsedSavegame> {
  const { header, data } = await decompressSavegame(bytes);
  const chunks = readChunks(data, WANTED_CHUNKS);

  const pats = chunks.get('PATS');
  if (!pats || pats.type !== CH_TABLE || !pats.fields?.length) {
    throw new SavegameFormatError(
      `settings chunk is not a table (savegame version ${header.version})`,
      'savegame.error.tooOld',
      { version: header.version, minimum: MIN_SAVEGAME_VERSION },
    );
  }

  return { header, chunks };
}
