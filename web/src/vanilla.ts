/**
 * Ванильные машины и грузы OpenTTD — используются, когда игрок отключил
 * Iron Horse и/или FIRS. Приводятся к тем же типам, что и данные NewGRF.
 */
import vanillaTrainsJson from './data/vanilla_trains.json';
import vanillaCargosJson from './data/vanilla_cargos.json';
import type { Cargo, Train } from './types';

interface VanillaTrainRaw {
  id: string;
  name: string;
  kind: 'engine' | 'wagon';
  dual_headed: boolean;
  intro_year: number;
  vehicle_life: number;
  model_life: number;
  climates: string[];
  power_hp: number;
  weight_t: number;
  speed_mph: number | null;
  capacity: number;
  cost_factor: number;
  running_cost_factor: number;
  running_cost_class: string | null;
  engine_class: string;
  railtype: string;
  default_cargo: string;
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

const RAILTYPE_TRACK: Record<string, Train['base_track_type']> = {
  'RailTypes{RAILTYPE_RAIL}': 'RAIL',
  'RailTypes{RAILTYPE_ELECTRIC}': 'RAIL',
  'RailTypes{RAILTYPE_MONO}': 'RAIL',
  'RailTypes{RAILTYPE_MAGLEV}': 'RAIL',
};

function toTrain(raw: VanillaTrainRaw): Train {
  const capacity = raw.capacity * (raw.dual_headed ? 2 : 1);
  return {
    id: raw.id,
    name: raw.name,
    kind: raw.kind,
    gen: 0,
    role: null,
    subrole: null,
    joker: false,
    base_track_type: RAILTYPE_TRACK[raw.railtype] ?? 'RAIL',
    track_types: [raw.railtype.replace(/^RailTypes\{RAILTYPE_|\}$/g, '')],
    lgv_capable: false,
    intro_year: raw.intro_year,
    vehicle_life: raw.vehicle_life,
    model_life: raw.model_life,
    power_hp: raw.power_hp,
    power_by_source: raw.power_hp
      ? { [raw.engine_class.replace('EngineClass::', '').toUpperCase()]: raw.power_hp }
      : null,
    te_coefficient: raw.te_coefficient,
    speed_mph: raw.speed_mph,
    speed_lgv_mph: null,
    weight_t: raw.weight_t,
    length: raw.length,
    dual_headed: raw.dual_headed,
    units: [{ capacities: [capacity], length: raw.length, weight_t: raw.weight_t }],
    cost_factor: raw.cost_factor,
    running_cost_factor: raw.running_cost_factor,
    running_cost_base: raw.running_cost_class ?? 'running_diesel',
    // ванильные машины не имеют GRF-параметра вместимости — одно значение на все 5
    capacities: [capacity, capacity, capacity, capacity, capacity],
    capacity_label: null,
    loading_speed: 5,
    default_cargos: [raw.default_cargo.replace('CT_', '')],
    refit: { classes: [], labels_allowed: [], labels_disallowed: [] },
  };
}

function toCargo(raw: VanillaCargoRaw): Cargo {
  const label = raw.label.replace('CT_', '');
  return {
    id: raw.id,
    label,
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

export const vanillaCargos: Cargo[] = (
  (vanillaCargosJson as { items: unknown }).items as VanillaCargoRaw[]
).map(toCargo);

/** Ванильный подвижной состав возит только свой груз — рефита в базовой игре нет. */
export function vanillaCanCarry(train: Train, cargo: Cargo): boolean {
  return train.default_cargos.includes(cargo.label);
}
