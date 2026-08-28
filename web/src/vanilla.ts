/**
 * Ванильные машины и грузы OpenTTD — используются, когда игрок отключил
 * Iron Horse и/или FIRS. Приводятся к тем же типам, что и данные NewGRF.
 */
import vanillaIndustriesJson from './data/vanilla_industries.json';
import vanillaTrainsJson from './data/vanilla_trains.json';
import vanillaCargosJson from './data/vanilla_cargos.json';
import type { Cargo, Railtype, Train } from './types';

interface VanillaTrainRaw {
  id: string;
  /** The game's own EngineID: what a savegame's engine pool maps to for the base set. */
  engine_id: number;
  name: string;
  kind: 'engine' | 'wagon';
  dual_headed: boolean;
  intro_year: number;
  intro_month: number;
  vehicle_life: number;
  model_life: number;
  climates: string[];
  power_hp: number;
  weight_t: number;
  speed_mph: number | null;
  /** 0 for wagons: the game's table leaves max_speed at 0. */
  speed_internal: number;
  capacity: number;
  cost_factor: number;
  running_cost_factor: number;
  running_cost_class: string | null;
  engine_class: string;
  railtype: string;
  /** The game's CargoLabels: one for most wagons, several for climate-dependent ones (MCT_*), none for engines. */
  default_cargos: string[];
  te_coefficient: number;
  length: number;
}

interface VanillaCargoRaw {
  id: string;
  label: string;
  name: string;
  initial_payment: number;
  transit_periods: [number, number];
  weight_16ths: number;
  capacity_multiplier: number;
  is_freight: boolean;
  /** icon from the OpenGFX2 base set, see pipeline/extract_opengfx2.py */
  icon: string;
}

/** Engine class of the game → power source in Iron Horse terms (`OHLE` marks pure electrics). */
const POWER_SOURCE: Record<string, string> = {
  steam: 'STEAM',
  diesel: 'DIESEL',
  electric: 'OHLE',
  monorail: 'MONORAIL',
  maglev: 'MAGLEV',
};

/** Extractor's running_cost_class → the RUNNING_COST_* vocabulary Iron Horse uses. */
const RUNNING_COST_BASE: Record<string, string> = {
  running_steam: 'RUNNING_COST_STEAM',
  running_diesel: 'RUNNING_COST_DIESEL',
  running_electric: 'RUNNING_COST_ELECTRIC',
};

/**
 * The game's track label → the family a vehicle of that track belongs to. Plain and
 * electrified rail are one gauge, so their vehicles share a family; what tells them apart
 * is the track type itself (`track_types`), which is where electrification lives.
 */
const RAILTYPE_TRACK: Record<string, Train['base_track_type']> = {
  RAIL: 'RAIL',
  ELRL: 'RAIL',
  MONO: 'MONO',
  MGLV: 'MAGLEV',
};

function toTrain(raw: VanillaTrainRaw): Train {
  const capacity = raw.capacity * (raw.dual_headed ? 2 : 1);
  return {
    id: raw.id,
    // the base set's engine ids are the game's table indexes, one per vehicle
    numeric_ids: [raw.engine_id],
    name: raw.name,
    kind: raw.kind,
    gen: 0,
    role: null,
    subrole: null,
    joker: false,
    randomised: false,
    base_track_type: RAILTYPE_TRACK[raw.railtype] ?? 'RAIL',
    track_types: [raw.railtype],
    lgv_capable: false,
    intro_year: raw.intro_year,
    intro_month: raw.intro_month,
    vehicle_life: raw.vehicle_life,
    model_life: raw.model_life,
    power_hp: raw.power_hp,
    // an engine class the map does not know leaves the breakdown empty rather than
    // keyed by nothing: the physics then reads the stated power, as it did before
    power_by_source:
      raw.power_hp && POWER_SOURCE[raw.engine_class]
        ? { [POWER_SOURCE[raw.engine_class]]: raw.power_hp }
        : null,
    te_coefficient: raw.te_coefficient,
    speed_mph: raw.speed_mph,
    speed_lgv_mph: null,
    speed_internal: raw.speed_mph == null ? null : raw.speed_internal,
    speed_lgv_internal: null,
    weight_t: raw.weight_t,
    length: raw.length,
    dual_headed: raw.dual_headed,
    units: [{ capacities: [capacity], length: raw.length, weight_t: raw.weight_t }],
    cost_factor: raw.cost_factor,
    running_cost_factor: raw.running_cost_factor,
    // same vocabulary as Iron Horse (RUNNING_COST_STEAM/…); wagons (Price::Invalid) cost nothing
    running_cost_base: RUNNING_COST_BASE[raw.running_cost_class ?? ''] ?? 'RUNNING_COST_DIESEL',
    // ванильные машины не имеют GRF-параметра вместимости — одно значение на все 5
    capacities: [capacity, capacity, capacity, capacity, capacity],
    capacity_label: null,
    loading_speed: 5,
    default_cargos: raw.default_cargos,
    refit: { classes: [], labels_allowed: [], labels_disallowed: [] },
  };
}

function toCargo(raw: VanillaCargoRaw): Cargo {
  return {
    id: raw.id,
    label: raw.label,
    name: raw.name,
    classes: [],
    is_freight: raw.is_freight,
    weight_16ths: raw.weight_16ths,
    capacity_multiplier: raw.capacity_multiplier,
    price_factor_by_economy: { VANILLA: raw.initial_payment },
    initial_payment_by_economy: { VANILLA: raw.initial_payment },
    transit_periods: raw.transit_periods,
    units: raw.is_freight ? 'tonnes' : 'items',
    icon: raw.icon,
  };
}

export const vanillaTrains: Train[] = (
  (vanillaTrainsJson as { items: unknown }).items as VanillaTrainRaw[]
).map(toTrain);

/** The game's own four track types (table/railtypes.h). */
export const vanillaRailtypes = (vanillaTrainsJson as { meta: { railtypes: unknown } }).meta
  .railtypes as Railtype[];

/** Cargo labels in slot order per climate (cargo_const.h `_default_climate_cargo`). */
export const vanillaClimateSlots = (
  vanillaCargosJson as { climate_slots: Record<string, (string | null)[]> }
).climate_slots;

export const vanillaCargos: Cargo[] = (
  (vanillaCargosJson as { items: unknown }).items as VanillaCargoRaw[]
).map(toCargo);

/** Ванильный подвижной состав возит только свой груз — рефита в базовой игре нет. */
export function vanillaCanCarry(train: Train, cargo: Cargo): boolean {
  return train.default_cargos.includes(cargo.label);
}

/**
 * Предприятие базовой игры: имя и номер типа, которым его называет сохранение.
 *
 * Не `Industry` из данных FIRS: у базовой игры нет ни экономик, ни цепочек, ни пулов
 * снабжения — есть название, которым игра подписывает предприятие в своём списке.
 */
export interface VanillaIndustry {
  id: string;
  /** Индекс в `_origin_industry_specs` — то, что лежит в сейве как IndustryType. */
  type: number;
  name: string;
}

const vanillaIndustries: VanillaIndustry[] = (
  vanillaIndustriesJson as { items: VanillaIndustry[] }
).items;

/** Тип из сейва → предприятие базовой игры. */
export const vanillaIndustryByType = new Map(
  vanillaIndustries.map((industry) => [industry.type, industry]),
);

export const vanillaIndustryById = new Map(
  vanillaIndustries.map((industry) => [industry.id, industry]),
);
