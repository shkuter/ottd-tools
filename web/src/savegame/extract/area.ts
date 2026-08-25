/**
 * Rectangles of map tiles, the shape the game stores a station's platforms and an
 * industry's plot in (`TileArea`: a north-west tile plus a width and a height).
 *
 * A saved area is written as three flat fields named after the struct member —
 * `train_station.tile`, `train_station.w`, `train_station.h` — so reading one only needs
 * the prefix the descriptor used.
 */

import { asNumber, type RecordValues } from '../values';

export interface TileArea {
  /** North-west corner. A TileIndex: x is `tile % map width`, y is the rest. */
  tile: number;
  width: number;
  height: number;
}

/** The game's "no tile" marker (tile_type.h:95). */
const INVALID_TILE = 0xffffffff;

/**
 * One area of a record, or null where the game states none: a station with no railway part
 * writes INVALID_TILE, which is exactly how it says "there are no platforms here".
 */
export function readTileArea(values: RecordValues, prefix: string): TileArea | null {
  const tile = asNumber(values.get(`${prefix}.tile`));
  const width = asNumber(values.get(`${prefix}.w`)) ?? 0;
  const height = asNumber(values.get(`${prefix}.h`)) ?? 0;
  if (tile === undefined || tile === INVALID_TILE || width === 0 || height === 0) return null;
  return { tile, width, height };
}

/**
 * Whether two areas share a tile once the first is grown by `radius` on every side — the
 * test behind "is this industry in the station's catchment".
 *
 * Coordinates come out of the tile index the way the game splits it (TileX/TileY,
 * map_func.h), which needs the width of the map the tiles belong to.
 */
export function areasTouch(
  area: TileArea,
  other: TileArea,
  mapWidth: number,
  radius: number,
): boolean {
  const a = bounds(area, mapWidth, radius);
  const b = bounds(other, mapWidth, 0);
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
}

function bounds(area: TileArea, mapWidth: number, radius: number) {
  const x = area.tile % mapWidth;
  const y = Math.floor(area.tile / mapWidth);
  return {
    x0: x - radius,
    x1: x + area.width - 1 + radius,
    y0: y - radius,
    y1: y + area.height - 1 + radius,
  };
}
