/**
 * Builds the stored snapshot out of the worker's raw network: trains matched to the
 * catalogue, routes grouped by shared order lists, cargo slots resolved to labels.
 *
 * Matching goes through the save's own id mappings: EIDS tells which GRF defined an
 * engine (Iron Horse ids are `numeric_ids` of trains.json, grfid 0 is the base set),
 * IIDS does the same for industry types. Cargo indexes resolve against the active FIRS
 * economy's slot order, or the climate's vanilla table when FIRS is absent.
 */

import { industries, trains as catalogue, xussrTrains } from '../dataset';
import type { Economy, Industry } from '../types';
import { vanillaTrains, vanillaClimateSlots, vanillaIndustryByType } from '../vanilla';
import { economyFromGrfs } from './import';
import { FIRS_GRFID, IRON_HORSE_GRFID, XUSSR_GRFIDS } from './registry';
import type { RawSavegame, RawStation, RawTrainUnit } from './read';
import {
  isFullLoad,
  isStationOrder,
  OT_GOTO_DEPOT,
  OT_GOTO_WAYPOINT,
  type SavedOrder,
} from './extract/ordl';
import { isRearDualheaded, TS_ARTICULATED_PART, TS_FRONT } from './extract/vehs';
import { isBaseSet } from './extract/ids';
import { areasTouch } from './extract/area';
import stationNamesJson from '../data/station_names.json';
import { TOWNNAME_ENGLISH_ORIGINAL } from './extract/city';
import { englishOriginalTownName } from './names';

export interface SnapshotCompany {
  id: number;
  /** Player-given name; '' when the game generates one — the UI falls back to a stub. */
  name: string;
  isAi: boolean;
}

export interface SnapshotTown {
  id: number;
  /** Custom or generated (English Original) name; null for an unported name style. */
  name: string | null;
}

export interface SnapshotGoods {
  /** Cargo label; null when the save's slot has no cargo in the calculator's data. */
  label: string | null;
  slot: number;
  /** null where the game itself shows no rating for this cargo. */
  rating: number | null;
  waiting: number;
}

export interface SnapshotStation {
  id: number;
  /** Company that owns the station; OWNER_NONE where none does. */
  companyId: number;
  /** Town the name is built from; null when the save names no town. */
  townId: number | null;
  /** Custom name, or '' — then the suffix key renders the name. */
  customName: string;
  /** STR_SV_STNAME_* key, or a FIRS station suffix key for industry naming. */
  suffixKey: string | null;
  /**
   * What the game passes as the {NUM} of the name: the station's own index for a station
   * (strings.cpp:1767), the waypoint's serial within its town for a waypoint (:1798).
   */
  nameNumber: number;
  isWaypoint: boolean;
  goods: SnapshotGoods[];
  /**
   * Industries of the snapshot whose plot falls in this station's catchment — where the
   * cargo it loads comes from. Measured off the station's railway platforms, since that is
   * the part a train route is about, and grown by the game's catchment radius.
   *
   * Empty where the question cannot be answered: a station with no railway part, a save
   * that never said how wide the map is, or one whose layout states no plots at all.
   */
  supplierIds: number[];
}

export interface SnapshotStop {
  kind: 'station' | 'waypoint' | 'depot';
  /** Station pool id for station/waypoint stops; depots point elsewhere. */
  stationId: number | null;
  fullLoad: boolean;
}

export interface SnapshotRoute {
  id: number;
  companyId: number;
  stops: SnapshotStop[];
  trainIds: number[];
  /**
   * Tiles between consecutive station stops, the last entry closing the loop back to the
   * first — the distance the game pays over. Measured between the stations' reference tiles
   * with the game's own metric (`DistanceManhattan`, cargopacket.h:251), which makes it an
   * approximation: the game measures from the tile the cargo was loaded on, and caps the
   * figure with the distance actually travelled.
   *
   * Empty where the distance cannot be stated: fewer than two station stops, a stop whose
   * station is missing, or a save that never said how wide the map is.
   */
  legTiles: number[];
}

export interface SnapshotConsistEntry {
  /** Catalogue id (trains.json / vanilla); null for a vehicle of an unknown GRF. */
  catalogueId: string | null;
  count: number;
}

export interface SnapshotCargoLoad {
  label: string | null;
  slot: number;
  capacity: number;
  loaded: number;
}

export interface SnapshotTrain {
  id: number;
  companyId: number;
  groupId: number | null;
  routeId: number | null;
  unitNumber: number;
  /** Player-given name; '' when the unit number names it. */
  name: string;
  buildYear: number;
  profitThisYear: number;
  profitLastYear: number;
  stopped: boolean;
  consist: SnapshotConsistEntry[];
  cargo: SnapshotCargoLoad[];
}

export interface SnapshotGroup {
  id: number;
  name: string;
  parent: number | null;
  companyId: number;
}

export interface SnapshotProduced {
  label: string | null;
  slot: number;
  /** Last finished month, where the save keeps a history. */
  lastMonthProduction: number | null;
  lastMonthTransported: number | null;
}

export interface SnapshotIndustry {
  id: number;
  /** industries.json id; null for a type the calculator's data does not know. */
  catalogueId: string | null;
  townId: number | null;
  produced: SnapshotProduced[];
}

export interface Snapshot {
  companies: SnapshotCompany[];
  towns: SnapshotTown[];
  stations: SnapshotStation[];
  routes: SnapshotRoute[];
  trains: SnapshotTrain[];
  groups: SnapshotGroup[];
  industries: SnapshotIndustry[];
}

/** VehState::Stopped is bit 1, not bit 0 — bit 0 is Hidden (vehicle_base.h:33). */
const VS_STOPPED = 1 << 1;
/** Sentinels the game uses instead of a real group id (group_type.h:16). */
const DEFAULT_GROUPS = new Set([0xfffc, 0xfffd, 0xfffe, 0xffff]);

export function buildSnapshot(raw: RawSavegame): Snapshot {
  const slots = cargoSlots(raw);
  const engineCatalogue = engineMatcher(raw);
  const label = (slot: number): string | null => slots[slot] ?? null;

  const industryTypeMap = industryTypes(raw, economyFromGrfs(raw.grfs));
  const trains = buildTrains(raw, engineCatalogue, label);
  const routes = buildRoutes(raw, trains);
  return {
    companies: [...raw.network.companies.values()].map((c) => ({
      id: c.index,
      name: c.name,
      isAi: c.isAi,
    })),
    towns: buildTowns(raw),
    stations: buildStations(raw, label, industryTypeMap),
    routes,
    trains,
    groups: [...raw.network.groups.values()]
      .filter((g) => g.vehicleType === 0)
      .map((g) => ({
        id: g.index,
        name: g.name,
        parent: g.parent === 0xffff ? null : g.parent,
        companyId: g.owner,
      })),
    industries: buildIndustries(raw, label, industryTypeMap),
  };
}

/** Slot → cargo label for this save: the FIRS economy's order, or the climate table. */
function cargoSlots(raw: RawSavegame): (string | null)[] {
  // the same resolution the settings import uses, so slots and economy never disagree
  const slots = economyFromGrfs(raw.grfs)?.cargo_slots;
  if (slots) return slots;
  const landscape = Number(raw.settings.get('game_creation.landscape') ?? 0);
  const climate = ['temperate', 'arctic', 'tropic', 'toyland'][landscape] ?? 'temperate';
  return vanillaClimateSlots[climate] ?? [];
}

/**
 * Vehicles of sets built as several GRFs, keyed by GRF id and the id local to it: the
 * local ids restart in every file of the set, so neither half identifies a vehicle alone.
 */
const multiFileIds = new Map<string, string>();
for (const train of xussrTrains) {
  // grf может не быть вовсе (машина без файла) — тогда пары «GRFID + номер» нет
  const grfid = train.grf == null ? undefined : XUSSR_GRFIDS[train.grf];
  if (grfid === undefined) continue;
  for (const numericId of train.numeric_ids) {
    multiFileIds.set(`${grfid}:${numericId}`, train.id);
  }
}

/** Engine pool index → catalogue id, resolved through EIDS. */
function engineMatcher(raw: RawSavegame): (engineType: number) => string | null {
  const ironHorseIds = new Map<number, string>();
  for (const train of catalogue) {
    for (const numericId of train.numeric_ids) ironHorseIds.set(numericId, train.id);
  }
  const vanilla = new Map<number, string>(
    vanillaTrains.flatMap((t) => t.numeric_ids.map((id): [number, string] => [id, t.id])),
  );
  // a save with no mapping chunk at all is the base set in the game's own table order;
  // where the chunk exists, an engine missing from it stays unidentified rather than
  // being read as whatever vanilla vehicle shares its pool index
  const mapped = raw.network.engineIds.size > 0;
  return (engineType) => {
    const mapping = raw.network.engineIds.get(engineType);
    if (!mapped) return vanilla.get(engineType) ?? null;
    if (mapping === undefined) return null;
    if (isBaseSet(mapping)) return vanilla.get(mapping.localId) ?? null;
    if (mapping.grfid === IRON_HORSE_GRFID) return ironHorseIds.get(mapping.localId) ?? null;
    return multiFileIds.get(`${mapping.grfid}:${mapping.localId}`) ?? null;
  };
}

function buildTowns(raw: RawSavegame): SnapshotTown[] {
  return [...raw.network.towns.values()].map((town) => ({
    id: town.index,
    name:
      town.name !== ''
        ? town.name
        : town.grfid === 0 && town.nameType === TOWNNAME_ENGLISH_ORIGINAL
          ? englishOriginalTownName(town.nameParts)
          : null,
  }));
}

function buildRoutes(raw: RawSavegame, trains: SnapshotTrain[]): SnapshotRoute[] {
  const byList = new Map<number, SnapshotTrain[]>();
  for (const train of trains) {
    if (train.routeId === null) continue;
    const members = byList.get(train.routeId);
    if (members === undefined) byList.set(train.routeId, [train]);
    else members.push(train);
  }
  const routes: SnapshotRoute[] = [];
  for (const [listId, members] of byList) {
    const orders = raw.network.orderLists.get(listId) ?? [];
    const stops = orders.map((order) => stopOf(order)).filter((s): s is SnapshotStop => s !== null);
    routes.push({
      id: listId,
      companyId: members[0]?.companyId ?? 0,
      stops,
      trainIds: members.map((t) => t.id).sort((a, b) => a - b),
      legTiles: legDistances(raw, stops),
    });
  }
  return routes.sort((a, b) => a.id - b.id);
}

/**
 * Distance of each leg of the round trip, station stop to station stop and back to the
 * first. Waypoints and depots are skipped: the game pays over source and destination, not
 * over the path between them.
 */
function legDistances(raw: RawSavegame, stops: readonly SnapshotStop[]): number[] {
  const width = raw.network.mapSize?.width;
  if (width === undefined) return [];
  const tiles: number[] = [];
  for (const stop of stops) {
    if (stop.kind !== 'station' || stop.stationId === null) continue;
    const station = raw.network.stations.get(stop.stationId);
    if (!station) return [];
    tiles.push(station.xy);
  }
  if (tiles.length < 2) return [];
  return tiles.map((tile, i) => manhattan(tile, tiles[(i + 1) % tiles.length]!, width));
}

/**
 * The game's DistanceManhattan (map.cpp:169) over two TileIndexes of a map this wide.
 * It splits a tile with a mask and a shift (TileX/TileY, map_func.h:428), which is the same
 * arithmetic as here: the game refuses a map whose side is not a power of two (map.cpp:43).
 */
function manhattan(a: number, b: number, width: number): number {
  return (
    Math.abs((a % width) - (b % width)) + Math.abs(Math.floor(a / width) - Math.floor(b / width))
  );
}

function stopOf(order: SavedOrder): SnapshotStop | null {
  if (isStationOrder(order)) {
    return { kind: 'station', stationId: order.dest, fullLoad: isFullLoad(order) };
  }
  if (order.type === OT_GOTO_WAYPOINT) {
    return { kind: 'waypoint', stationId: order.dest, fullLoad: false };
  }
  if (order.type === OT_GOTO_DEPOT) {
    return { kind: 'depot', stationId: null, fullLoad: false };
  }
  // implicit and conditional orders say nothing about where the route goes
  return null;
}

function buildTrains(
  raw: RawSavegame,
  toCatalogue: (engineType: number) => string | null,
  label: (slot: number) => string | null,
): SnapshotTrain[] {
  const units = raw.network.trains;
  const out: SnapshotTrain[] = [];
  for (const unit of units.values()) {
    if (!(unit.subtype & TS_FRONT)) continue;
    const chain = consistChain(units, unit);
    out.push({
      id: unit.index,
      companyId: unit.owner,
      groupId: DEFAULT_GROUPS.has(unit.groupId) ? null : unit.groupId,
      routeId: unit.ordersRef,
      unitNumber: unit.unitNumber,
      name: unit.name,
      buildYear: unit.buildYear,
      profitThisYear: unit.profitThisYear,
      profitLastYear: unit.profitLastYear,
      stopped: (unit.vehStatus & VS_STOPPED) !== 0,
      consist: consistEntries(chain, toCatalogue),
      cargo: cargoLoads(chain, label),
    });
  }
  return out.sort((a, b) => a.unitNumber - b.unitNumber || a.id - b.id);
}

function consistChain(units: Map<number, RawTrainUnit>, front: RawTrainUnit): RawTrainUnit[] {
  const chain: RawTrainUnit[] = [front];
  const seen = new Set([front.index]);
  let at = front.next;
  while (at !== null && !seen.has(at)) {
    const unit = units.get(at);
    if (!unit) break;
    chain.push(unit);
    seen.add(unit.index);
    at = unit.next;
  }
  return chain;
}

/**
 * Articulated parts and the rear half of a dual-headed engine belong to the vehicle before
 * them, the way the game's own vehicle list counts them; equal neighbours collapse.
 */
function consistEntries(
  chain: RawTrainUnit[],
  toCatalogue: (engineType: number) => string | null,
): SnapshotConsistEntry[] {
  const entries: SnapshotConsistEntry[] = [];
  for (const unit of chain) {
    if (unit.subtype & TS_ARTICULATED_PART) continue;
    if (isRearDualheaded(unit.subtype)) continue;
    const catalogueId = toCatalogue(unit.engineType);
    const last = entries[entries.length - 1];
    if (last && last.catalogueId === catalogueId && catalogueId !== null) {
      last.count++;
    } else {
      entries.push({ catalogueId, count: 1 });
    }
  }
  return entries;
}

function cargoLoads(
  chain: RawTrainUnit[],
  label: (slot: number) => string | null,
): SnapshotCargoLoad[] {
  const bySlot = new Map<number, SnapshotCargoLoad>();
  for (const unit of chain) {
    if (unit.cargoCap === 0 || unit.cargoType === 0xff) continue;
    const entry = bySlot.get(unit.cargoType) ?? {
      label: label(unit.cargoType),
      slot: unit.cargoType,
      capacity: 0,
      loaded: 0,
    };
    entry.capacity += unit.cargoCap;
    entry.loaded += unit.loaded;
    bySlot.set(unit.cargoType, entry);
  }
  return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
}

/**
 * Catchment radius used for the railway part of a station, in tiles. Both of the game's
 * settings land on the same number for trains — CA_TRAIN with "modified catchment" on,
 * CA_UNMODIFIED with it off (station_type.h:117 and :120) — so only JGRPP's extra widening
 * moves it.
 *
 * The game itself takes the largest radius among everything a station is made of
 * (`Station::GetCatchmentRadius`, station.cpp:343), so a station that is also a dock reaches
 * one tile further than this. Undercounting a mixed station's suppliers is the honest way to
 * be wrong here: the alternative credits a train route with cargo that arrives by ship.
 */
function catchmentRadius(raw: RawSavegame): number {
  const CA_TRAIN = 4;
  return CA_TRAIN + (Number(raw.settings.get('station.catchment_increase')) || 0);
}

/**
 * Industries in the catchment of each station, by station index. Computed here for the same
 * reason distances are: the answer is a small list, while the tiles it takes to work it out
 * are the bulk of a savegame and have no other use.
 */
function suppliersByStation(raw: RawSavegame): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const width = raw.network.mapSize?.width;
  if (!width) return out;
  const radius = catchmentRadius(raw);
  const plots = [...raw.network.industries.values()].filter((industry) => industry.location);
  for (const station of raw.network.stations.values()) {
    if (station.kind !== 'station' || station.trainStation === null) continue;
    const suppliers = plots
      .filter((industry) => areasTouch(station.trainStation!, industry.location!, width, radius))
      .map((industry) => industry.index);
    if (suppliers.length > 0) out.set(station.index, suppliers);
  }
  return out;
}

function buildStations(
  raw: RawSavegame,
  label: (slot: number) => string | null,
  byType: ReadonlyMap<number, Industry>,
): SnapshotStation[] {
  const suppliers = suppliersByStation(raw);
  const out: SnapshotStation[] = [];
  for (const station of raw.network.stations.values()) {
    if (station.kind === 'waypoint') {
      // a waypoint is not named by a station suffix: the game formats it from its own
      // strings, and from the second one in a town the serial variant is used
      // (strings.cpp:1798), numbered town_cn + 1
      const buoy = svStnameKey(station.stringId) === 'STR_SV_STNAME_BUOY';
      const serial = station.townCn !== 0;
      out.push({
        id: station.index,
        companyId: station.owner,
        townId: station.town,
        customName: station.name,
        suffixKey: `STR_FORMAT_${buoy ? 'BUOY' : 'WAYPOINT'}_NAME${serial ? '_SERIAL' : ''}`,
        nameNumber: station.townCn + 1,
        isWaypoint: true,
        goods: [],
        supplierIds: [],
      });
      continue;
    }
    out.push({
      id: station.index,
      companyId: station.owner,
      townId: station.town,
      customName: station.name,
      suffixKey: suffixKeyOf(station, byType),
      nameNumber: station.index,
      isWaypoint: false,
      goods: station.goods
        .filter((g) => g.waiting > 0 || g.rating !== null)
        .map((g) => ({
          label: label(g.cargoIndex),
          slot: g.cargoIndex,
          rating: g.rating,
          waiting: g.waiting,
        })),
      supplierIds: suppliers.get(station.index) ?? [],
    });
  }
  return out.sort((a, b) => a.id - b.id);
}

function buildIndustries(
  raw: RawSavegame,
  label: (slot: number) => string | null,
  byType: ReadonlyMap<number, Industry>,
): SnapshotIndustry[] {
  /*
   * A save with no IIDS chunk at all defines no industries of its own, so a type is an index
   * into the game's own table — the same reasoning EIDS-less saves get for vehicles.
   *
   * The corner this misses: a set that only *overrides* base-game slots registers no ids of
   * its own (IndustryOverrideManager::AddEntityID skips overridden slots,
   * newgrf_commons.cpp:213), so its game reads as vanilla here and its industries are named
   * after the base ones they replaced. Sets of that shape are rare — FIRS and the like
   * define their own types — and naming them by the slot they took is still closer than
   * naming them nothing.
   */
  const vanilla = raw.network.industryTypeIds.size === 0;
  const out: SnapshotIndustry[] = [];
  for (const industry of raw.network.industries.values()) {
    const known = vanilla
      ? vanillaIndustryByType.get(industry.typeId)
      : byType.get(industry.typeId);
    out.push({
      id: industry.index,
      catalogueId: known?.id ?? null,
      townId: industry.town,
      produced: industry.produced.map((p) => ({
        label: label(p.cargoIndex),
        slot: p.cargoIndex,
        lastMonthProduction: p.lastMonthProduction ?? null,
        lastMonthTransported: p.lastMonthTransported ?? null,
      })),
    });
  }
  return out.sort((a, b) => a.id - b.id);
}

/**
 * The save's industry types resolved to catalogue entries: through its IIDS mapping where
 * there is one, and by what the industry produces where there is not.
 *
 * A NewGRF industry that takes over a slot of a base-game one is registered as an override
 * (OverrideManagerBase::Add), and such a slot is skipped when ids are handed out
 * (newgrf_commons.cpp:218) — so it never reaches IIDS at all. The economy still says which
 * industry produces what, and where exactly one of its industries matches the produced
 * cargos of an unmapped type, that is the industry the slot holds.
 */
function industryTypes(raw: RawSavegame, economy: Economy | undefined): Map<number, Industry> {
  const byNumericId = new Map<number, Industry>(industries.map((i) => [i.numeric_id, i]));
  const out = new Map<number, Industry>();
  for (const [typeId, mapping] of raw.network.industryTypeIds) {
    if (mapping.grfid !== FIRS_GRFID) continue;
    const industry = byNumericId.get(mapping.localId);
    if (industry !== undefined) out.set(typeId, industry);
  }
  for (const [typeId, industry] of overriddenTypes(raw, economy, out)) out.set(typeId, industry);
  return out;
}

/**
 * Types the mapping does not list at all, matched by the cargos their industries produce.
 * A type the save does name — even by a set the calculator has no data for — is left to
 * the mapping: guessing there would quietly rename someone else's industry.
 */
function overriddenTypes(
  raw: RawSavegame,
  economy: Economy | undefined,
  mapped: ReadonlyMap<number, Industry>,
): Map<number, Industry> {
  const out = new Map<number, Industry>();
  if (economy === undefined) return out;
  const slots = economy.cargo_slots;
  const taken = new Set([...mapped.values()].map((i) => i.id));
  const byProduce = new Map<string, Industry[]>();
  for (const industry of industries) {
    const produces = industry.economies[economy.id]?.produces;
    if (produces === undefined || produces.length === 0 || taken.has(industry.id)) continue;
    const key = produces.map((p) => p.label).sort().join(',');
    byProduce.set(key, [...(byProduce.get(key) ?? []), industry]);
  }
  for (const industry of raw.network.industries.values()) {
    if (raw.network.industryTypeIds.has(industry.typeId) || out.has(industry.typeId)) continue;
    const labels = industry.produced.map((p) => slots[p.cargoIndex] ?? null);
    // a cargo slot this economy cannot name leaves an incomplete key, and an incomplete
    // key can match another industry's full output — such a type stays unnamed
    if (labels.some((label) => label === null)) continue;
    const candidates = byProduce.get([...labels].sort().join(','));
    // only an unambiguous match counts: two industries with the same output stay unnamed
    if (candidates?.length === 1) out.set(industry.typeId, candidates[0]);
  }
  return out;
}

/**
 * The station name's string id resolved to a suffix key, through the map the pipeline
 * extracts from the game's own lang file (##id directives pin the savegame region).
 */
const SV_STNAME_KEYS = new Map<number, string>(
  Object.entries((stationNamesJson as { game_ids: Record<string, string> }).game_ids).map(
    ([stringId, key]) => [Number(stringId), key],
  ),
);

function svStnameKey(stringId: number): string | null {
  return SV_STNAME_KEYS.get(stringId) ?? null;
}

function suffixKeyOf(
  station: Pick<RawStation, 'stringId' | 'indtype'>,
  byType: ReadonlyMap<number, Industry>,
): string | null {
  // a nearby industry names the station whatever its own string id says
  // (strings.cpp:1755) — the id only takes over when the industry states no name
  const key = byType.get(station.indtype)?.station_name_key;
  return key ?? svStnameKey(station.stringId);
}
