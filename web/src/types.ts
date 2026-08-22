export interface TrainUnit {
  capacities: number[];
  /** Единицы длины OpenTTD: 16 = тайл. */
  length: number;
  weight_t: number;
}

/**
 * Track families the calculator can pick vehicles for. RAIL/NG/METRO come from Iron Horse,
 * MONO/MAGLEV exist only in the vanilla catalogue.
 */
export type TrackType = 'RAIL' | 'NG' | 'METRO' | 'MONO' | 'MAGLEV';

export interface Train {
  id: string;
  name: string;
  kind: 'engine' | 'wagon';
  gen: number;
  role: string | null;
  subrole: string | null;
  joker: boolean;
  /** Wagon whose look is picked at random; the game hides it inside a variant group. */
  randomised: boolean;
  base_track_type: TrackType;
  track_types: string[];
  lgv_capable: boolean;
  intro_year: number;
  /** Месяц появления (1..12): игра вводит машину не 1 января, а по дате из GRF. */
  intro_month: number;
  vehicle_life: number;
  model_life: number | null;
  power_hp: number;
  power_by_source: Record<string, number> | null;
  te_coefficient: number;
  speed_mph: number | null;
  speed_lgv_mph: number | null;
  /** Speed in the game's internal unit — what the game derives the displayed number from. */
  speed_internal: number | null;
  speed_lgv_internal: number | null;
  weight_t: number;
  /** Единицы длины OpenTTD: 16 = тайл. */
  length: number;
  dual_headed: boolean;
  units: TrainUnit[];
  cost_factor: number;
  running_cost_factor: number;
  running_cost_base: string;
  capacities: number[];
  capacity_label: string | null;
  loading_speed: number | null;
  default_cargos: string[];
  refit: {
    classes: string[];
    labels_allowed: string[];
    labels_disallowed: string[];
  };
}

export interface RefitGroup {
  allowed: string[];
  disallowed: string[];
}

export interface TrainsMeta {
  roster: string;
  describe: string;
  basecost_shifts: {
    build_engine: number;
    build_wagon: number;
    running_steam: number;
    running_diesel: number;
  };
  capacity_param_multipliers: number[];
  refit_groups: Record<string, RefitGroup>;
  counts: { engines: number; wagons: number };
}

export interface Cargo {
  id: string;
  label: string;
  name: string;
  classes: string[];
  is_freight: boolean;
  weight_16ths: number;
  capacity_multiplier: number;
  price_factor_by_economy: Record<string, number>;
  initial_payment_by_economy: Record<string, number>;
  transit_periods: [number, number];
  units: string;
  icon: string;
}

export interface IndustryCargoEntry {
  label: string;
  ratio?: number | null;
  value?: number;
}

export interface IndustryEconomyData {
  accepts: IndustryCargoEntry[];
  accept_mode: string;
  produces: IndustryCargoEntry[];
}

/** One threshold of the supply pool, with the production bonus reaching it grants. */
export interface SupplyPoolLevel {
  threshold: number;
  production_percent: number;
}

/**
 * Thresholds a primary or port measures its deliveries against. Absent on industries the
 * pool does not drive: secondaries convert what they are fed instead, and some primaries
 * take no supplies at all.
 */
export interface SupplyPool {
  level1: SupplyPoolLevel;
  level2: SupplyPoolLevel;
}

export interface Industry {
  id: string;
  name: string;
  type: string;
  map_colour: string | null;
  economies: Record<string, IndustryEconomyData>;
  name_by_economy?: Record<string, string>;
  supply_pool?: SupplyPool;
}

export interface IndustriesMeta {
  source: string;
  commit: string;
  describe: string;
  /** How long one delivery keeps an industry supplied: 27 production cycles of 256 ticks. */
  supply_window_ticks: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: 'produces' | 'accepts';
}

export interface Economy {
  id: string;
  numeric_id: number;
  name: string;
  cargo_labels: string[];
  industry_ids: string[];
  graph: {
    excluded_labels: string[];
    edges: GraphEdge[];
    dot: string;
  };
}

/** A vehicle picked for a consist, with how many of it are coupled. */
export interface ConsistEntry {
  train: Train;
  count: number;
}
