/**
 * What each company owns, counted the way the game counts it.
 *
 * The save holds no counters: the game rebuilds them by walking every tile on load
 * (`sl/company_sl.cpp` AfterLoadCompanyStats), so this walks the same tiles by the same
 * rules. Rules that are easy to miss and each move the total: a depot is one piece of track,
 * a road stop two road bits per road type, a station tile counts for every kind of station
 * but an airport and a buoy, a lock's middle tile counts three times over and not as canal,
 * a bridge is counted from one end only and its middle costs four times a plain tile.
 *
 * The two games differ in a few of those rules, and where they do, this follows the game the
 * save came from — JGRPP gives a tile a second rail type, custom bridge heads and signals
 * simulated inside a tunnel, none of which upstream writes. Where JGRPP's rule is a
 * generalisation of upstream's (a bridge head is a set of track bits rather than always one
 * diagonal), the upstream shape is fed into the same formula instead of branching:
 * `(TUNNELBRIDGE_TRACKBIT_FACTOR / 2) * (1 + 1)` is exactly the end tile upstream charges.
 *
 * Sources: `sl/company_sl.cpp`, `tunnelbridge_cmd.cpp`
 * Update{Rail,Road}TunnelBridgeInfrastructure, `tunnelbridge_map.h`, `economy_type.h`.
 */

import type { NetworkCounts } from '../../engine/infrastructure';
import type { TileMap } from './tiles';
import {
  ROAD_TRAM_TYPE_TRAM,
  type RoadTypeEntry,
} from './labelmaps';

/** `TileType` (tile_type.h); the ones with infrastructure on them. */
const TT_RAILWAY = 1;
const TT_ROAD = 2;
export const TT_STATION = 5;
const TT_WATER = 6;
export const TT_TUNNELBRIDGE = 9;
const TT_OBJECT = 10;

/** `RailTileType` (rail_map.h); Depot is 3, and 2 is not used. */
const RAIL_TILE_NORMAL = 0;
const RAIL_TILE_SIGNALS = 1;

/** `RoadTileType` (road_map.h). */
const ROAD_TILE_NORMAL = 0;
const ROAD_TILE_CROSSING = 1;
const ROAD_TILE_DEPOT = 2;

/** `StationType` (station_type.h). */
const ST_RAIL = 0;
export const ST_AIRPORT = 1;
const ST_TRUCK = 2;
const ST_BUS = 3;
const ST_DOCK = 5;
const ST_BUOY = 6;
const ST_RAIL_WAYPOINT = 7;
const ST_ROAD_WAYPOINT = 8;

/** `WaterTileType` (water_map.h) and the part of a lock that owns it. */
const WATER_TILE_LOCK = 2;
const WATER_TILE_DEPOT = 3;
const LOCK_PART_MIDDLE = 0;

/** `WaterClass::Canal` (water_map.h). */
const WATER_CLASS_CANAL = 1;

/** `m5` bits a tunnel or bridge marks simulated signals with; both set means bidirectional. */
const SIGNAL_SIMULATION_MASK = 0b0110_0000;

/** `TransportType` (transport_type.h). */
const TRANSPORT_RAIL = 0;
const TRANSPORT_ROAD = 1;
const TRANSPORT_WATER = 2;

/** `TrackBits` of two tracks that do not cross (track_type.h). */
const TRACK_BIT_HORZ = 0b001100;
const TRACK_BIT_VERT = 0b110000;

/** The pieces a structure is billed as, over a plain tile (economy_type.h). */
const TUNNELBRIDGE_TRACKBIT_FACTOR = 4;
const LEVELCROSSING_TRACKBIT_FACTOR = 2;
const LOCK_DEPOT_TILE_FACTOR = 2;

/** `INVALID_ROADTYPE` (road_type.h): the tile carries no road of this kind. */
const INVALID_ROADTYPE = 63;

/** Companies are 0..14; 15 and up are the town, nobody, the water and the deity. */
const MAX_COMPANIES = 15;
/** `OWNER_TOWN` and `OWNER_NONE` (company_type.h). */
const OWNER_TOWN = 0x0f;
const OWNER_NONE = 0x10;

/** Tracks reachable when entering a tile from a direction (`_exitdir_reaches_tracks`). */
const EXITDIR_REACHES_TRACKS = [
  0b011001, // NE: X, lower, left
  0b010110, // SE: Y, left, upper
  0b100101, // SW: X, upper, right
  0b101010, // NW: Y, right, lower
];

/** The two halves of the road numbering, in the order the game iterates them. */
const ROAD_TRAM_TYPES = [0, 1] as const;

/**
 * What one company owns, by the labels its game gave the types — the same shape the upkeep
 * model is priced from, with one difference: the roads and trams are keyed by whatever label
 * the save states, while the model bills only the two the game itself defines. A file may
 * name a third, and saying so is the point — a count quietly dropped would understate the
 * total the model is checked against.
 */
export interface InfrastructureCounts extends Omit<NetworkCounts, 'road' | 'tram'> {
  road: Record<string, number>;
  tram: Record<string, number>;
}

/**
 * One walk of the map: what is being read, where the pieces go, and which game's rules to
 * follow. Passed as one thing because all three travel together through every rule below.
 */
interface Walk {
  tiles: TileMap;
  /** The counters of this owner, or undefined where the owner is nobody's company. */
  countersFor: (owner: number) => Accumulator | undefined;
  jgrpp: boolean;
}

/** Counters while walking, still keyed by the indices the tiles state. */
interface Accumulator {
  rail: number[];
  road: number[];
  signals: number;
  stations: number;
  canals: number;
}

export interface CountOptions {
  /** Company ids the save has; a tile owned by anyone else is nobody's infrastructure. */
  companies: Iterable<number>;
  /**
   * Whether the save came from JGRPP. It decides the rules that only exist there — a second
   * rail type on a tile, custom bridge heads, signals simulated on a bridge — and those read
   * bits that upstream fills with something else entirely.
   */
  jgrpp: boolean;
}

/**
 * Walks the map once and returns what each company owns — every company asked about, zeroed
 * where it owns nothing. Absence is reserved for a map that could not be read at all, which
 * is the caller's answer to give, not this one's.
 */
export function countInfrastructure(
  tiles: TileMap,
  railLabels: Map<number, string>,
  roadLabels: Map<number, RoadTypeEntry>,
  options: CountOptions,
): Map<number, InfrastructureCounts> {
  const valid = new Set<number>();
  for (const id of options.companies) if (id < MAX_COMPANIES) valid.add(id);

  const accumulators = new Map<number, Accumulator>();
  const countersFor = (owner: number): Accumulator | undefined => {
    if (!valid.has(owner)) return undefined;
    let found = accumulators.get(owner);
    if (found === undefined) {
      found = { rail: [], road: [], signals: 0, stations: 0, canals: 0 };
      accumulators.set(owner, found);
    }
    return found;
  };

  walkMap({ tiles, countersFor, jgrpp: options.jgrpp });

  const counts = new Map<number, InfrastructureCounts>();
  for (const id of valid) {
    counts.set(id, withLabels(accumulators.get(id), railLabels, roadLabels));
  }
  return counts;
}

/* Tile fields, named as the game names the accessors that read them. */

export const tileType = (tiles: TileMap, t: number) => (tiles.type(t) >> 4) & 0xf;
const tileOwner = (tiles: TileMap, t: number) => tiles.m1(t) & 0x1f;
const waterClass = (tiles: TileMap, t: number) => (tiles.m1(t) >> 5) & 0x3;
const railType = (tiles: TileMap, t: number) => tiles.m8(t) & 0x3f;
const secondaryRailType = (tiles: TileMap, t: number) => (tiles.m8(t) >> 6) & 0x3f;
const railTileType = (tiles: TileMap, t: number) => (tiles.m5(t) >> 6) & 0x3;
const trackBits = (tiles: TileMap, t: number) => tiles.m5(t) & 0x3f;
const presentSignals = (tiles: TileMap, t: number) => (tiles.m3(t) >> 4) & 0xf;
const roadTileType = (tiles: TileMap, t: number) => (tiles.m5(t) >> 6) & 0x3;
export const stationType = (tiles: TileMap, t: number) => (tiles.m6(t) >> 3) & 0xf;
const stationTileBlocked = (tiles: TileMap, t: number) => (tiles.m6(t) & 1) !== 0;
const waterTileType = (tiles: TileMap, t: number) => (tiles.m5(t) >> 4) & 0xf;
const lockPart = (tiles: TileMap, t: number) => (tiles.m5(t) >> 2) & 0x3;
const isBridge = (tiles: TileMap, t: number) => (tiles.m5(t) & 0x80) !== 0;
const tunnelBridgeDirection = (tiles: TileMap, t: number) => tiles.m5(t) & 0x3;
const tunnelBridgeTransport = (tiles: TileMap, t: number) => (tiles.m5(t) >> 2) & 0x3;

/** `GetRoadType`: road lives in `m4`, tram in the upper half of `m8`. */
function roadType(tiles: TileMap, t: number, rtt: number): number {
  return rtt === ROAD_TRAM_TYPE_TRAM ? (tiles.m8(t) >> 6) & 0x3f : tiles.m4(t) & 0x3f;
}

/**
 * `GetRoadOwner`. Only a plain road tile keeps the road's owner in the tile's own owner
 * field; everywhere else — a crossing, a depot, a road stop, a bridge head — it is in `m7`,
 * because the tile itself belongs to whoever built the thing standing on it. Trams get four
 * bits and spend the sixteenth value on "nobody", which they would otherwise not fit.
 */
function roadOwner(tiles: TileMap, t: number, rtt: number, normalRoad: boolean): number {
  if (rtt !== ROAD_TRAM_TYPE_TRAM) return (normalRoad ? tiles.m1(t) : tiles.m7(t)) & 0x1f;
  const owner = (tiles.m3(t) >> 4) & 0xf;
  return owner === OWNER_TOWN ? OWNER_NONE : owner;
}

/** `GetRoadBits`; only ever asked of a plain road tile. */
function roadBits(tiles: TileMap, t: number, rtt: number): number {
  return rtt === ROAD_TRAM_TYPE_TRAM ? tiles.m3(t) & 0xf : tiles.m5(t) & 0xf;
}

/**
 * The road types a tile actually carries, road and tram alike — the loop the game repeats
 * at every kind of road tile, "as each can have a different owner". Who that owner is, and
 * how much the tile is billed, is the caller's rule and differs at every one of them.
 */
function* roadTypesOf(tiles: TileMap, t: number): Generator<{ rtt: number; rt: number }> {
  for (const rtt of ROAD_TRAM_TYPES) {
    const rt = roadType(tiles, t, rtt);
    if (rt !== INVALID_ROADTYPE) yield { rtt, rt };
  }
}

function countBits(value: number): number {
  let bits = 0;
  for (let v = value; v !== 0; v &= v - 1) bits++;
  return bits;
}

/** Pieces a set of track bits is billed as: one each, squared where they cross. */
function trackPieces(bits: number): number {
  const pieces = countBits(bits);
  return tracksOverlap(bits) ? pieces * pieces : pieces;
}

/** `TracksOverlap`: two tracks cross unless they are the upper/lower or left/right pair. */
function tracksOverlap(bits: number): boolean {
  if (bits === 0 || (bits & (bits - 1)) === 0) return false;
  return bits !== TRACK_BIT_HORZ && bits !== TRACK_BIT_VERT;
}

/** `DiagDirToDiagTrackBits`: the one diagonal a tunnel or a plain bridge head carries. */
const diagDirTrackBits = (dir: number) => (dir & 1 ? 0b10 : 0b01);
/** `DiagDirToRoadBits`. */
const diagDirRoadBits = (dir: number) => 1 << (3 ^ dir);
/** `ROAD_X` / `ROAD_Y`: a full road along the axis of the bridge. */
const axisRoadBits = (dir: number) => (dir & 1 ? 0b0101 : 0b1010);
const reverseDiagDir = (dir: number) => dir ^ 2;

function walkMap(walk: Walk): void {
  const { tiles } = walk;
  for (let tile = 0; tile < tiles.size; tile++) {
    switch (tileType(tiles, tile)) {
      case TT_RAILWAY:
        countRailway(walk, tile);
        break;
      case TT_ROAD:
        countRoad(walk, tile);
        break;
      case TT_STATION:
        countStation(walk, tile);
        break;
      case TT_WATER:
        countWater(walk, tile);
        break;
      case TT_OBJECT:
        countCanalTile(walk, tile);
        break;
      case TT_TUNNELBRIDGE:
        countTunnelBridge(walk, tile);
        break;
      default:
        break;
    }
  }
}

function countRailway(walk: Walk, tile: number): void {
  const { tiles, countersFor, jgrpp } = walk;
  const acc = countersFor(tileOwner(tiles, tile));
  if (acc === undefined) return;
  const kind = railTileType(tiles, tile);
  let pieces = 1;
  if (kind === RAIL_TILE_NORMAL || kind === RAIL_TILE_SIGNALS) {
    const bits = trackBits(tiles, tile);
    if (jgrpp && (bits === TRACK_BIT_HORZ || bits === TRACK_BIT_VERT)) {
      // two tracks that never meet may be of two types; the tile bills one of each
      add(acc.rail, secondaryRailType(tiles, tile), 1);
    } else {
      pieces = trackPieces(bits);
    }
  }
  add(acc.rail, railType(tiles, tile), pieces);
  if (kind === RAIL_TILE_SIGNALS) acc.signals += countBits(presentSignals(tiles, tile));
}

function countRoad(walk: Walk, tile: number): void {
  const { tiles, countersFor } = walk;
  const kind = roadTileType(tiles, tile);
  if (kind === ROAD_TILE_CROSSING) {
    const acc = countersFor(tileOwner(tiles, tile));
    if (acc !== undefined) {
      add(acc.rail, railType(tiles, tile), LEVELCROSSING_TRACKBIT_FACTOR);
    }
  }
  const normalRoad = kind === ROAD_TILE_NORMAL;
  for (const { rtt, rt } of roadTypesOf(tiles, tile)) {
    // a depot belongs to whoever built it; a crossing's and a plain road's to the road
    const owner =
      kind === ROAD_TILE_DEPOT
        ? tileOwner(tiles, tile)
        : roadOwner(tiles, tile, rtt, normalRoad);
    const acc = countersFor(owner);
    if (acc === undefined) continue;
    add(acc.road, rt, normalRoad ? countBits(roadBits(tiles, tile, rtt)) : 2);
  }
}

function countStation(walk: Walk, tile: number): void {
  const { tiles, countersFor } = walk;
  const acc = countersFor(tileOwner(tiles, tile));
  const kind = stationType(tiles, tile);
  // an airport is billed per airport, not per tile, and a buoy is not billed at all
  if (acc !== undefined && kind !== ST_AIRPORT && kind !== ST_BUOY) acc.stations++;

  switch (kind) {
    case ST_RAIL:
    case ST_RAIL_WAYPOINT:
      if (acc !== undefined && !stationTileBlocked(tiles, tile)) {
        add(acc.rail, railType(tiles, tile), 1);
      }
      break;
    case ST_BUS:
    case ST_TRUCK:
    case ST_ROAD_WAYPOINT:
      for (const { rtt, rt } of roadTypesOf(tiles, tile)) {
        const road = countersFor(roadOwner(tiles, tile, rtt, false));
        if (road !== undefined) add(road.road, rt, 2); // a road stop has two road bits
      }
      break;
    case ST_DOCK:
    case ST_BUOY:
      if (acc !== undefined && waterClass(tiles, tile) === WATER_CLASS_CANAL) acc.canals++;
      break;
    default:
      break;
  }
}

function countWater(walk: Walk, tile: number): void {
  const { tiles, countersFor } = walk;
  const kind = waterTileType(tiles, tile);
  if (kind === WATER_TILE_DEPOT || kind === WATER_TILE_LOCK) {
    const acc = countersFor(tileOwner(tiles, tile));
    if (acc !== undefined) {
      if (kind === WATER_TILE_DEPOT) acc.canals += LOCK_DEPOT_TILE_FACTOR;
      if (kind === WATER_TILE_LOCK && lockPart(tiles, tile) === LOCK_PART_MIDDLE) {
        // the middle tile stands for the whole lock, and is not canal on top of that
        acc.canals += 3 * LOCK_DEPOT_TILE_FACTOR;
        return;
      }
    }
  }
  countCanalTile(walk, tile);
}

/** A tile whose water class is canal is one piece of canal, whoever else it belongs to. */
function countCanalTile(walk: Walk, tile: number): void {
  const { tiles, countersFor } = walk;
  if (waterClass(tiles, tile) !== WATER_CLASS_CANAL) return;
  const acc = countersFor(tileOwner(tiles, tile));
  if (acc !== undefined) acc.canals++;
}

function countTunnelBridge(walk: Walk, tile: number): void {
  const { tiles, countersFor } = walk;
  // counted once, from the western end — the end whose ramp faces north-east or south-east.
  // Upstream picks the northern end instead (`tile < other_end`), which is the other one of
  // the pair on the NE/SW axis; the totals agree, because both ends share the owner and the
  // type, and the roads are billed per end either way
  if (tunnelBridgeDirection(tiles, tile) >= 2) return;
  const other = otherEnd(tiles, tile);
  if (other === undefined) return;
  const middle = tunnelBridgeLength(tiles, tile, other) * TUNNELBRIDGE_TRACKBIT_FACTOR;

  switch (tunnelBridgeTransport(tiles, tile)) {
    case TRANSPORT_RAIL:
      countRailTunnelBridge(walk, tile, other, middle);
      break;
    case TRANSPORT_ROAD:
      countRoadTunnelBridge(walk, tile, other, middle);
      break;
    case TRANSPORT_WATER: {
      const acc = countersFor(tileOwner(tiles, tile));
      if (acc !== undefined) acc.canals += middle + 2 * TUNNELBRIDGE_TRACKBIT_FACTOR;
      break;
    }
    default:
      break;
  }
}

/**
 * Track bits of a bridge head. JGRPP lets a head hold any set of them and keeps it in `m4`;
 * upstream has only the one diagonal that leads onto the bridge, and puts something else in
 * `m4` entirely, so it is derived from the direction instead of read.
 */
function customHeadTrackBits({ tiles, jgrpp }: Walk, t: number): number | undefined {
  return jgrpp && isBridge(tiles, t) ? tiles.m4(t) & 0x3f : undefined;
}

function headTrackBits(walk: Walk, t: number): number {
  return (
    customHeadTrackBits(walk, t) ??
    diagDirTrackBits(tunnelBridgeDirection(walk.tiles, t))
  );
}

/** `GetPrimaryTunnelBridgeTrackBits`: of two parallel tracks, the one crossing the bridge. */
function primaryHeadTrackBits(walk: Walk, t: number): number {
  const bits = headTrackBits(walk, t);
  if (bits !== TRACK_BIT_HORZ && bits !== TRACK_BIT_VERT) return bits;
  return bits & acrossBridgeTrackBits(walk.tiles, t);
}

/** `GetSecondaryTunnelBridgeTrackBits`: the parallel track that does not cross. */
function secondaryHeadTrackBits(walk: Walk, t: number): number {
  const bits = customHeadTrackBits(walk, t);
  if (bits !== TRACK_BIT_HORZ && bits !== TRACK_BIT_VERT) return 0;
  return bits & ~acrossBridgeTrackBits(walk.tiles, t);
}

const acrossBridgeTrackBits = (tiles: TileMap, t: number) =>
  EXITDIR_REACHES_TRACKS[reverseDiagDir(tunnelBridgeDirection(tiles, t))];

/**
 * `GetTunnelBridgeHeadOnlyRailInfrastructureCountFromTrackBits`: half the factor for the
 * tile itself, plus half for each piece of track on it, crossings squared as everywhere.
 */
function headRailCount(bits: number): number {
  return (TUNNELBRIDGE_TRACKBIT_FACTOR / 2) * (1 + trackPieces(bits));
}

function countRailTunnelBridge(walk: Walk, tile: number, other: number, middle: number): void {
  const { tiles, countersFor, jgrpp } = walk;
  const acc = countersFor(tileOwner(tiles, tile));
  if (acc === undefined) return;
  const head = (t: number) =>
    isBridge(tiles, t)
      ? headRailCount(primaryHeadTrackBits(walk, t))
      : TUNNELBRIDGE_TRACKBIT_FACTOR;
  add(acc.rail, railType(tiles, tile), middle + head(tile) + head(other));

  for (const t of [tile, other]) {
    if (secondaryHeadTrackBits(walk, t) === 0) continue;
    add(acc.rail, secondaryRailType(tiles, t), TUNNELBRIDGE_TRACKBIT_FACTOR / 2);
  }

  if (jgrpp && hasSignalSimulation(tiles, tile)) {
    acc.signals += simulatedSignals(tiles, tile, other);
  }
}

/** JGRPP simulates signals inside a tunnel or on a bridge; upstream has no such thing. */
export const hasSignalSimulation = (tiles: TileMap, t: number) =>
  (tiles.m5(t) & SIGNAL_SIMULATION_MASK) !== 0;

/**
 * `GetTunnelBridgeSignalSimulationSignalCount`: one at each end plus one every `spacing`
 * tiles, doubled where the two directions are signalled apart.
 */
function simulatedSignals(tiles: TileMap, tile: number, other: number): number {
  const spacing = 1 + ((tiles.m8(tile) >> 12) & 0xf);
  const count = 2 + Math.floor(tunnelBridgeLength(tiles, tile, other) / spacing);
  const bidirectional = (tiles.m5(tile) & SIGNAL_SIMULATION_MASK) === SIGNAL_SIMULATION_MASK;
  return bidirectional ? count * 2 : count;
}

/**
 * `UpdateRoadTunnelBridgeInfrastructure`: each end is billed on its own, because the two may
 * belong to different companies. A bridge head is billed for the road bits it actually
 * carries, and only the one whose road reaches the bridge pays for the span.
 */
function countRoadTunnelBridge(walk: Walk, tile: number, other: number, middle: number): void {
  const { tiles, countersFor } = walk;
  for (const t of [tile, other]) {
    for (const { rtt, rt } of roadTypesOf(tiles, t)) {
      const acc = countersFor(roadOwner(tiles, t, rtt, false));
      if (acc === undefined) continue;
      if (!isBridge(tiles, t)) {
        add(acc.road, rt, middle + 2 * TUNNELBRIDGE_TRACKBIT_FACTOR);
        continue;
      }
      const bits = headRoadBits(walk, t, rtt);
      let infra = countBits(bits) * TUNNELBRIDGE_TRACKBIT_FACTOR;
      if (bits & diagDirRoadBits(tunnelBridgeDirection(tiles, t))) infra += middle;
      add(acc.road, rt, infra);
    }
  }
}

/**
 * `GetCustomBridgeHeadRoadBits`: the road along the bridge's axis, flipped by the four bits
 * JGRPP keeps in `m2` for a head built at an angle. Upstream has no such heads and fills
 * `m2` with the bridge type, so there the axis is the answer.
 */
function headRoadBits({ tiles, jgrpp }: Walk, t: number, rtt: number): number {
  const axis = axisRoadBits(tunnelBridgeDirection(tiles, t));
  if (!jgrpp) return axis;
  return axis ^ ((tiles.m2(t) >> (rtt === ROAD_TRAM_TYPE_TRAM ? 4 : 0)) & 0xf);
}

/** `GetTunnelBridgeLength`: the tiles between the two ends, neither end included. */
function tunnelBridgeLength(tiles: TileMap, a: number, b: number): number {
  const ax = a % tiles.width;
  const ay = Math.floor(a / tiles.width);
  const bx = b % tiles.width;
  const by = Math.floor(b / tiles.width);
  return Math.abs(bx + by - ax - ay) - 1;
}

/**
 * The far end of this tunnel or bridge, found the way the game finds it: step tile by tile
 * in the direction the ramp faces until an end facing back turns up. A tunnel also has to
 * match in height — two tunnels may cross, one under the other, and the nearer mouth would
 * otherwise be taken for this one's.
 *
 * Undefined where none turns up before the edge of the map: a save that says that is not one
 * to guess about.
 */
function otherEnd(tiles: TileMap, tile: number): number | undefined {
  const dir = tunnelBridgeDirection(tiles, tile);
  const bridge = isBridge(tiles, tile);
  const z = tiles.z(tile);
  const back = reverseDiagDir(dir);
  // NE -x, SE +y, SW +x, NW -y (map.cpp _tileoffs_by_diagdir)
  const step = dir === 0 ? -1 : dir === 1 ? tiles.width : dir === 2 ? 1 : -tiles.width;
  const limit = tiles.width + tiles.height;
  let at = tile;
  for (let taken = 0; taken < limit; taken++) {
    at += step;
    if (at < 0 || at >= tiles.size) return undefined;
    if (tileType(tiles, at) !== TT_TUNNELBRIDGE) continue;
    if (isBridge(tiles, at) !== bridge) continue;
    if (tunnelBridgeDirection(tiles, at) !== back) continue;
    if (!bridge && tiles.z(at) !== z) continue;
    return at;
  }
  return undefined;
}

function add(counts: number[], index: number, pieces: number): void {
  counts[index] = (counts[index] ?? 0) + pieces;
}

/** Turns the indices a save happens to use into the labels the calculator is keyed by. */
function withLabels(
  acc: Accumulator | undefined,
  railLabels: Map<number, string>,
  roadLabels: Map<number, RoadTypeEntry>,
): InfrastructureCounts {
  const counts: InfrastructureCounts = {
    rail: {},
    signals: acc?.signals ?? 0,
    stations: acc?.stations ?? 0,
    road: {},
    tram: {},
    canals: acc?.canals ?? 0,
  };
  if (acc === undefined) return counts;
  acc.rail.forEach((pieces, index) => {
    const name = railLabels.get(index);
    if (name !== undefined && pieces > 0) counts.rail[name] = (counts.rail[name] ?? 0) + pieces;
  });
  acc.road.forEach((pieces, index) => {
    const entry = roadLabels.get(index);
    if (entry === undefined || pieces <= 0) return;
    const into = entry.subtype === ROAD_TRAM_TYPE_TRAM ? counts.tram : counts.road;
    into[entry.label] = (into[entry.label] ?? 0) + pieces;
  });
  return counts;
}
