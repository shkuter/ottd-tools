/**
 * Stations (STNN). A record is either a station proper (`normal`) or a waypoint/buoy
 * (`waypoint`); both share the `base` struct with the town reference and the name — a
 * custom string, or a STR_SV_STNAME_* string id the snapshot renders itself. Waiting cargo
 * is stored as packet refs into CAPA, per goods entry.
 */

import type { Chunk } from '../chunks';
import {
  asNumber,
  asPoolRef,
  asPoolRefs,
  asString,
  readTable,
  type FieldValue,
  type RecordValues,
} from '../values';
import { readTileArea, type TileArea } from './area';

/** GoodsEntry::State::Rating (station_base.h:184): the cargo has a rating at all. */
const GES_RATING = 1 << 1;

/** No company owns it (company_type.h:26) — what a save without the field reads as. */
export const OWNER_NONE = 0x10;

export interface SavedGoods {
  /** Position in the goods list — the game's cargo id for this save. */
  cargoIndex: number;
  /** 0…255, only where the entry has a rating; null when the game shows none. */
  rating: number | null;
  packetRefs: number[];
}

export interface SavedStationBase {
  index: number;
  /** Town pool index; null when the save states none. */
  town: number | null;
  stringId: number;
  /** Player-given name; empty when the string id names it. */
  name: string;
  /** Company that owns the station (station_sl.cpp:559). */
  owner: number;
  /**
   * The station's reference tile — what the game measures distances from
   * (station_sl.cpp:554). A TileIndex: x is `xy % map width`, y is the rest.
   */
  xy: number;
}

export interface SavedStation extends SavedStationBase {
  kind: 'station';
  /** Industry type the station is named after; 0xff (IT_INVALID) for none. */
  indtype: number;
  /**
   * The station's railway platforms (`SlStationNormal`, station_sl.cpp:591-595), null
   * where it has none.
   * The station's full extent is not saved at all — `StationRect` is NOSAVE
   * (base_station_base.h:84) and the game rebuilds it on load — and the railway part is
   * what a train route is about anyway.
   */
  trainStation: TileArea | null;
  goods: SavedGoods[];
}

export interface SavedWaypoint extends SavedStationBase {
  kind: 'waypoint';
  /** Serial number of this waypoint within its town; 0 for the first one. */
  townCn: number;
}

export function readStations(chunk: Chunk | undefined): Map<number, SavedStation | SavedWaypoint> {
  return readTable(chunk, (values, index) => {
    const normal = (values.get('normal') as RecordValues[] | undefined)?.[0];
    const waypoint = (values.get('waypoint') as RecordValues[] | undefined)?.[0];
    const body = normal ?? waypoint;
    const base = (body?.get('base') as RecordValues[] | undefined)?.[0];
    if (!body || !base) return undefined;
    const shared: SavedStationBase = {
      index,
      town: asPoolRef(base.get('town')),
      stringId: asNumber(base.get('string_id')) ?? 0,
      name: asString(base.get('name')),
      owner: asNumber(base.get('owner')) ?? OWNER_NONE,
      xy: asNumber(base.get('xy')) ?? 0,
    };
    return normal
      ? {
          ...shared,
          kind: 'station' as const,
          indtype: asNumber(normal.get('indtype')) ?? 0xff,
          trainStation: readTileArea(normal, 'train_station'),
          goods: readGoods(normal.get('goods')),
        }
      : { ...shared, kind: 'waypoint' as const, townCn: asNumber(body.get('town_cn')) ?? 0 };
  });
}

function readGoods(value: FieldValue | undefined): SavedGoods[] {
  const rows = (value as RecordValues[] | undefined) ?? [];
  return rows.map((row, cargoIndex) => ({
    cargoIndex,
    // an entry no cargo ever reached still stores INITIAL_STATION_RATING; the game hides
    // it behind HasRating() (station_base.h:267), so an ungated read invents ratings
    rating: ((asNumber(row.get('status')) ?? 0) & GES_RATING) !== 0
      ? (asNumber(row.get('rating')) ?? 0)
      : null,
    packetRefs: packetRefsOf(row),
  }));
}

/**
 * Packet refs of one goods entry. Both branches store them per source station as a struct
 * list of {first, second[]} (station_sl.cpp:232), so every number list inside a field
 * whose name starts with "cargo" is a run of packet references.
 */
function packetRefsOf(row: RecordValues): number[] {
  const refs: number[] = [];
  for (const [name, value] of row) {
    if (!name.startsWith('cargo')) continue;
    if (Array.isArray(value) && value.every((v) => typeof v === 'number')) {
      refs.push(...asPoolRefs(value));
    } else if (Array.isArray(value)) {
      for (const sub of value as RecordValues[]) {
        // asPoolRefs drops whatever is not a reference, so every list is safe to pass
        for (const subValue of sub.values()) refs.push(...asPoolRefs(subValue));
      }
    }
  }
  return refs;
}
