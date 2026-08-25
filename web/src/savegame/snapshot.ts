/**
 * Builds the stored snapshot out of the worker's raw network: trains matched to the
 * catalogue, routes grouped by shared order lists, cargo slots resolved to labels.
 *
 * Matching goes through the save's own id mappings: EIDS tells which GRF defined an
 * engine (Iron Horse ids are `numeric_ids` of trains.json, grfid 0 is the base set),
 * IIDS does the same for industry types. Cargo indexes resolve against the active FIRS
 * economy's slot order, or the climate's vanilla table when FIRS is absent.
 */

import { industries, trains as catalogue } from '../dataset';
import type { Economy, Industry } from '../types';
import { vanillaTrains, vanillaClimateSlots } from '../vanilla';
import { economyFromGrfs } from './import';
import { FIRS_GRFID, IRON_HORSE_GRFID } from './registry';
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

/** Engine pool index → catalogue id, resolved through EIDS. */
function engineMatcher(raw: RawSavegame): (engineType: number) => string | null {
  const ironHorse = new Map<number, string>();
  for (const train of catalogue) {
    for (const numericId of train.numeric_ids) ironHorse.set(numericId, train.id);
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
    if (mapping.grfid === IRON_HORSE_GRFID) return ironHorse.get(mapping.localId) ?? null;
    return null;
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
    routes.push({
      id: listId,
      companyId: members[0]?.companyId ?? 0,
      stops: orders.map((order) => stopOf(order)).filter((s): s is SnapshotStop => s !== null),
      trainIds: members.map((t) => t.id).sort((a, b) => a - b),
    });
  }
  return routes.sort((a, b) => a.id - b.id);
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

function buildStations(
  raw: RawSavegame,
  label: (slot: number) => string | null,
  byType: ReadonlyMap<number, Industry>,
): SnapshotStation[] {
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
        townId: station.town,
        customName: station.name,
        suffixKey: `STR_FORMAT_${buoy ? 'BUOY' : 'WAYPOINT'}_NAME${serial ? '_SERIAL' : ''}`,
        nameNumber: station.townCn + 1,
        isWaypoint: true,
        goods: [],
      });
      continue;
    }
    out.push({
      id: station.index,
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
    });
  }
  return out.sort((a, b) => a.id - b.id);
}

function buildIndustries(
  raw: RawSavegame,
  label: (slot: number) => string | null,
  byType: ReadonlyMap<number, Industry>,
): SnapshotIndustry[] {
  const out: SnapshotIndustry[] = [];
  for (const industry of raw.network.industries.values()) {
    out.push({
      id: industry.index,
      catalogueId: byType.get(industry.typeId)?.id ?? null,
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
