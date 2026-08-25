/**
 * Everything that has to touch the file itself: unpack, walk the chunks, pull out the values.
 * The result holds plain data only, so it survives a postMessage from the worker that does
 * this work. Interpreting it against the calculator's settings happens in `import.ts`.
 */

import type { Chunk } from './chunks';
import { readPacketCounts, sumPackets } from './extract/capa';
import { readTowns, type SavedTown } from './extract/city';
import { readGameYear } from './extract/date';
import { readInflation, type SavedInflation } from './extract/ecmy';
import { readGroups, type SavedGroup } from './extract/grps';
import { readEngineIds, readIndustryTypeIds, type GrfEntityId } from './extract/ids';
import { readIndustries, type SavedIndustry } from './extract/indy';
import { readMapSize, type SavedMapSize } from './extract/maps';
import { readNewGrfs, type SavedGrf } from './extract/ngrf';
import { readOrderLists, type SavedOrder } from './extract/ordl';
import { readSettings } from './extract/pats';
import { readCompanies, type SavedCompany } from './extract/plyr';
import { readStations, type SavedStation, type SavedWaypoint } from './extract/stnn';
import { readTrains, type SavedTrainUnit } from './extract/vehs';
import { parseSavegame } from './parse';
import type { FieldValue } from './values';

/** One train unit with its load resolved from the cargo packet pool. */
export interface RawTrainUnit extends Omit<SavedTrainUnit, 'packetRefs'> {
  loaded: number;
}

/** One goods entry with its waiting amount resolved from the cargo packet pool. */
export interface RawGoods {
  cargoIndex: number;
  /** null where the game itself shows no rating for this cargo. */
  rating: number | null;
  waiting: number;
}

export interface RawStation extends Omit<SavedStation, 'goods'> {
  goods: RawGoods[];
}

/**
 * The game's network, reduced in the worker: packet refs are already summed, so the CAPA
 * pool — the biggest chunk of a large save — never crosses the worker boundary.
 */
export interface RawNetwork {
  /** Absent where the save states no map size; distances cannot be measured without it. */
  mapSize?: SavedMapSize;
  engineIds: Map<number, GrfEntityId>;
  industryTypeIds: Map<number, GrfEntityId>;
  trains: Map<number, RawTrainUnit>;
  orderLists: Map<number, SavedOrder[]>;
  stations: Map<number, RawStation | SavedWaypoint>;
  industries: Map<number, SavedIndustry>;
  towns: Map<number, SavedTown>;
  groups: Map<number, SavedGroup>;
  companies: Map<number, SavedCompany>;
}

export interface RawSavegame {
  jgrpp: boolean;
  version: number;
  /** Settings exactly as the game named them. */
  settings: Map<string, FieldValue>;
  grfs: SavedGrf[];
  /** Year the game is in, absent if the savegame did not state a date. */
  year?: number;
  inflation?: SavedInflation;
  network: RawNetwork;
}

export async function readSavegame(bytes: Uint8Array): Promise<RawSavegame> {
  const parsed = await parseSavegame(bytes);
  return {
    jgrpp: parsed.header.jgrpp,
    version: parsed.header.version,
    settings: new Map(readSettings(parsed.chunks.get('PATS'))),
    grfs: readNewGrfs(parsed.chunks.get('NGRF')),
    year: readGameYear(parsed.chunks.get('DATE')),
    inflation: readInflation(parsed.chunks.get('ECMY')),
    network: readNetwork(parsed.chunks),
  };
}

function readNetwork(chunks: Map<string, Chunk>): RawNetwork {
  const packetCounts = readPacketCounts(chunks.get('CAPA'));
  const trains = new Map<number, RawTrainUnit>();
  for (const [index, unit] of readTrains(chunks.get('VEHS'))) {
    const { packetRefs, ...rest } = unit;
    trains.set(index, { ...rest, loaded: sumPackets(packetCounts, packetRefs) });
  }
  const stations = new Map<number, RawStation | SavedWaypoint>();
  for (const [index, station] of readStations(chunks.get('STNN'))) {
    if (station.kind === 'waypoint') {
      stations.set(index, station);
      continue;
    }
    stations.set(index, {
      ...station,
      goods: station.goods.map((g) => ({
        cargoIndex: g.cargoIndex,
        rating: g.rating,
        waiting: sumPackets(packetCounts, g.packetRefs),
      })),
    });
  }
  return {
    mapSize: readMapSize(chunks.get('MAPS')),
    engineIds: readEngineIds(chunks.get('EIDS')),
    industryTypeIds: readIndustryTypeIds(chunks.get('IIDS')),
    trains,
    orderLists: readOrderLists(chunks.get('ORDL'), chunks.get('ORDR')),
    stations,
    industries: readIndustries(chunks.get('INDY')),
    towns: readTowns(chunks.get('CITY')),
    groups: readGroups(chunks.get('GRPS')),
    companies: readCompanies(chunks.get('PLYR')),
  };
}
