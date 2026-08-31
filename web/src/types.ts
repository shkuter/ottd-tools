export interface TrainUnit {
  capacities: number[];
  /** Единицы длины OpenTTD: 16 = тайл. */
  length: number;
  weight_t: number;
}

/**
 * Track families a vehicle belongs to — the gauge Iron Horse states its speeds and
 * capacities by. Several track types share one family: RAIL covers plain, electrified and
 * high speed track alike, so a family does not say what runs where. That is `Railtype`.
 */
export type TrackType = 'RAIL' | 'NG' | 'METRO' | 'MONO' | 'MAGLEV';

/**
 * One kind of track a route can be built with, as the set defines it.
 *
 * `powered` lists the types a vehicle of this type pulls under its own power on, and
 * `compatible` the ones it can physically travel on; both include this type itself, the
 * extractors having normalised the sets' differing conventions. A `speed_limit_internal`
 * of 0 means the track sets no limit — neither vanilla nor Iron Horse states one.
 */
export interface Railtype {
  /** The game's four-character label: `RAIL`, `ELRL`, `MGLV`, `NAAN`… */
  label: string;
  /** Lang string id the type names itself by — how a translation is matched to it. */
  string_id: string;
  name: string;
  /** Overhead wires (RailTypeFlag::Catenary): what makes an electric vehicle draw power. */
  catenary: boolean;
  /**
   * Current systems the track feeds a vehicle with, in the order the set checks them:
   * `OHLE` for wires, `METRO` for third rail; empty when the track powers nothing. A set
   * that states voltages names them here instead, and a multi-system line lists several.
   */
  power_source: string[];
  /**
   * The game keeps this type out of its build menu (RailTypeFlag::Hidden). It still takes
   * part in the relations — a hidden type is how a set keeps vehicles compatible across
   * tracks — but it is no route to build, so it is not offered as a choice.
   */
  hidden: boolean;
  speed_limit_internal: number;
  powered: string[];
  compatible: string[];
  /** High speed track: vehicles able to run faster there use their LGV speed. */
  lgv: boolean;
  sort: number;
}

export interface Train {
  id: string;
  /** Engine ids the game knows this model by — one per unit of every livery (EIDS). */
  numeric_ids: number[];
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
  /**
   * Head of the variant series this vehicle ages with, keyed as `meta.variant_groups` keys
   * it; `null` when it ages by its own intro date. The game takes the age off the head
   * rather than the vehicle (engine.cpp CalcEngineReliability), walking the chain up while
   * each link asks for reliability syncing — so a set that folds vehicles into a group
   * without that flag leaves them ageing alone, and they carry no head here. Vanilla
   * declares no series at all, hence optional.
   */
  variant_group?: string | null;
  /**
   * Years the set brings the retirement forward by, negative to push it back — Iron Horse
   * states −10 for every vehicle. Non-zero fixes the last of the three buy-menu phases at
   * its minimum instead of leaving it to the game's dice (engine.cpp CalcEngineReliability).
   */
  retire_early?: number;
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

/** The vehicle a variant series ages by. */
export interface VariantGroupHead {
  /** Item name inside the set, kept so the data can be traced back to its source. */
  item: string;
  intro_year: number | null;
  intro_month: number | null;
  /** A head the player can buy ages from its own intro date; a placeholder from game start. */
  buyable: boolean;
}

export interface TrainsMeta {
  roster: string;
  describe: string;
  /** Track types this set defines, in the order its build menu lists them. */
  railtypes: Railtype[];
  basecost_shifts: {
    build_engine: number;
    build_wagon: number;
    running_steam: number;
    running_diesel: number;
    running_electric: number;
  };
  /**
   * Iron Horse only, both of them: the capacity parameter is its own GRF setting, and the
   * refit groups are how its vehicles state what they carry. Vanilla answers those
   * questions with a default cargo instead and holds neither key, so `IronHorseMeta` is
   * what promises them.
   */
  capacity_param_multipliers?: number[];
  refit_groups?: Record<string, RefitGroup>;
  /**
   * Heads of the variant series the set declares, by the key its vehicles name them with.
   * A head the player cannot buy is a menu-only placeholder, and the game marks such a
   * vehicle introduced on the first day of the game — which ages the whole series by the
   * age of the game rather than by its own dates.
   */
  variant_groups?: Record<string, VariantGroupHead>;
  counts: { engines: number; wagons: number };
}

/** Iron Horse's own metadata, which does state the two fields its catalogue needs. */
export interface IronHorseMeta extends TrainsMeta {
  capacity_param_multipliers: number[];
  refit_groups: Record<string, RefitGroup>;
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
  /** The industry's grf-local id, which a savegame's IIDS mapping resolves to. */
  numeric_id: number;
  name: string;
  type: string;
  map_colour: string | null;
  economies: Record<string, IndustryEconomyData>;
  name_by_economy?: Record<string, string>;
  supply_pool?: SupplyPool;
  /** Key of the suffix a station named after this industry gets (station_names.json). */
  station_name_key?: string;
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
  /** Cargo labels in slot order: a savegame's cargo index resolves against this. */
  cargo_slots: (string | null)[];
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
