/**
 * The map, read field by field rather than tile by tile.
 *
 * A tile of OpenTTD is eight bytes spread over named fields (`type`, `height`, `m1`..`m8`),
 * and the two games write them differently: upstream puts one chunk per field
 * (`saveload/map_sl.cpp`), JGRPP puts the whole map in `WMAP` as two arrays in a row — one
 * of `Tile` (8 bytes: type, height, m2 lo, m2 hi, m1, m3, m4, m5), then one of
 * `TileExtended` (4 bytes: m6, m7, m8 lo, m8 hi) — see `sl/map_sl.cpp` Load_WMAP.
 *
 * What the caller gets either way is one set of readers by tile index, so whatever counts or
 * measures the map is written once. Nothing is copied: the readers index into the chunk
 * payloads, which are already views over the decompressed file — a 4096x4096 map is 200 MB
 * of `WMAP` alone.
 *
 * `m2` is read only because JGRPP keeps the road bits of a custom bridge head there
 * (`bridge_map.h` GetCustomBridgeHeadRoadBits); nothing else the calculator asks of the map
 * lives in it.
 */

import type { Chunk } from '../chunks';
import { CH_RIFF } from '../chunks';
import type { SavedMapSize } from './maps';

/** A reader per field of a tile, plus the shape of the map they belong to. */
export interface TileMap {
  width: number;
  height: number;
  /** Number of tiles; a tile index is `y * width + x`, as in the game. */
  size: number;
  type: (tile: number) => number;
  /**
   * The game's `GetTileZ` (tile_map.cpp): the lowest of the tile's four corners, not the
   * `height` byte, which is the northern corner alone. A tunnel mouth stands on a slope, so
   * the two ends of one tunnel differ by the byte and agree by this — and agreeing by this
   * is how the game tells its own far end from the mouth of a tunnel crossing underneath.
   */
  z: (tile: number) => number;
  /** Sixteen bits wide, like `m8`. */
  m2: (tile: number) => number;
  m1: (tile: number) => number;
  m3: (tile: number) => number;
  m4: (tile: number) => number;
  m5: (tile: number) => number;
  m6: (tile: number) => number;
  m7: (tile: number) => number;
  /** Sixteen bits wide, unlike the rest. */
  m8: (tile: number) => number;
}

/** Bytes per tile of the two arrays JGRPP writes (`sizeof(Tile)`, `sizeof(TileExtended)`). */
const WMAP_TILE_BYTES = 8;
const WMAP_EXTENDED_BYTES = 4;

/**
 * The readers for this save's map, or undefined where the map cannot be read: the chunks are
 * missing, their length does not match the size the save states, or the layout is one this
 * does not know — the first version of JGRPP's `WHOLE_MAP_CHUNK`, whose extended array is two
 * bytes wide and carries no `m8` at all, which is where a tile states its rail type.
 *
 * Undefined is not "an empty map": a caller must be able to tell "nothing there" from
 * "could not look".
 */
export function readTiles(
  chunks: Map<string, Chunk>,
  mapSize: SavedMapSize | undefined,
): TileMap | undefined {
  if (!mapSize) return undefined;
  const size = mapSize.width * mapSize.height;
  const shape = { width: mapSize.width, height: mapSize.height, size };
  return wholeMap(chunks.get('WMAP'), shape) ?? fieldChunks(chunks, shape);
}

type MapShape = { width: number; height: number; size: number };

/** The payload of a RIFF chunk of exactly this length, or undefined. */
function payload(chunk: Chunk | undefined, bytes: number): Uint8Array | undefined {
  if (!chunk || chunk.type !== CH_RIFF) return undefined;
  const data = chunk.records[0]?.data;
  return data && data.length === bytes ? data : undefined;
}

/** JGRPP: one chunk, two arrays in a row. */
function wholeMap(chunk: Chunk | undefined, shape: MapShape): TileMap | undefined {
  const { size } = shape;
  const data = payload(chunk, size * (WMAP_TILE_BYTES + WMAP_EXTENDED_BYTES));
  if (!data) return undefined;
  const ext = size * WMAP_TILE_BYTES;
  return {
    ...shape,
    type: (tile) => data[tile * 8],
    z: tileZ(shape, (tile) => data[tile * 8 + 1]),
    m2: (tile) => data[tile * 8 + 2] | (data[tile * 8 + 3] << 8),
    m1: (tile) => data[tile * 8 + 4],
    m3: (tile) => data[tile * 8 + 5],
    m4: (tile) => data[tile * 8 + 6],
    m5: (tile) => data[tile * 8 + 7],
    m6: (tile) => data[ext + tile * 4],
    m7: (tile) => data[ext + tile * 4 + 1],
    m8: (tile) => data[ext + tile * 4 + 2] | (data[ext + tile * 4 + 3] << 8),
  };
}

/** Upstream: a chunk per field, one byte per tile except `MAP2` and `MAP8`, which are two. */
function fieldChunks(chunks: Map<string, Chunk>, shape: MapShape): TileMap | undefined {
  const { size } = shape;
  const byte = (id: string) => payload(chunks.get(id), size);
  const type = byte('MAPT');
  const z = byte('MAPH');
  const m2 = payload(chunks.get('MAP2'), size * 2);
  const m1 = byte('MAPO');
  const m3 = byte('M3LO');
  const m4 = byte('M3HI');
  const m5 = byte('MAP5');
  const m6 = byte('MAPE');
  const m7 = byte('MAP7');
  const m8 = payload(chunks.get('MAP8'), size * 2);
  if (!type || !z || !m1 || !m2 || !m3 || !m4 || !m5 || !m6 || !m7 || !m8) return undefined;
  return {
    ...shape,
    type: (tile) => type[tile],
    z: tileZ(shape, (tile) => z[tile]),
    m2: (tile) => m2[tile * 2] | (m2[tile * 2 + 1] << 8),
    m1: (tile) => m1[tile],
    m3: (tile) => m3[tile],
    m4: (tile) => m4[tile],
    m5: (tile) => m5[tile],
    m6: (tile) => m6[tile],
    m7: (tile) => m7[tile],
    m8: (tile) => m8[tile * 2] | (m8[tile * 2 + 1] << 8),
  };
}

/**
 * `GetTileZ`: the lowest corner of the tile, read off the northern corner of the tile itself
 * and of its three neighbours to the south and west, clamped at the edge of the map as the
 * game clamps it.
 */
function tileZ(shape: MapShape, height: (tile: number) => number): (tile: number) => number {
  const maxX = shape.width - 1;
  const maxY = shape.height - 1;
  return (tile) => {
    const x = tile % shape.width;
    const y = (tile - x) / shape.width;
    const x2 = x < maxX ? x + 1 : maxX;
    const y2 = y < maxY ? y + 1 : maxY;
    return Math.min(
      height(tile),
      height(y * shape.width + x2),
      height(y2 * shape.width + x),
      height(y2 * shape.width + x2),
    );
  };
}
