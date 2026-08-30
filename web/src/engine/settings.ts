/**
 * Игровые настройки, влияющие на расчёты. Значения и диапазоны — как в OpenTTD
 * (src/table/settings/*.ini) и JGR's Patchpack.
 */

/**
 * Наборы машин, которые калькулятор умеет считать. Выбор взаимоисключающий: basecost-шифты
 * и таблица путей берутся у одного набора на весь расчёт, машины второго считались бы с
 * чужими деньгами.
 */
/**
 * The rosters, in the order the settings picker offers them. The type is derived from the
 * list rather than written beside it, so a set added later cannot exist as a type without
 * appearing in the menu — and `SETS` in dataset.ts then fails to compile until it is
 * described there too.
 */
export const TRAIN_SETS = ['vanilla', 'iron_horse', 'xussr'] as const;

export type TrainSet = (typeof TRAIN_SETS)[number];

export interface GameSettings {
  /** Играем на JGR's Patchpack: доступны специфичные для патчпака настройки. */
  jgrpp: boolean;
  /** Активный набор машин: ванильные поезда OpenTTD, Iron Horse или xUSSR. */
  trainSet: TrainSet;
  /** Подключён NewGRF FIRS 5 (иначе — ванильные грузы и индустрии). */
  firs: boolean;
  /**
   * FIRS economy the game runs (parameter of the set): it decides which cargos and
   * industries exist, not what they pay. Read only when `firs` is on.
   */
  firsEconomy: string;
  /** vehicle.freight_trains: множитель веса грузов (1..255, def 1). */
  freightTrains: number;
  /** vehicle.train_slope_steepness: крутизна уклона в % (0..10, def 3). */
  slopeSteepness: number;
  /** economy.cargo_aging_rate: скорость старения груза в % (def 100). */
  cargoAgingRate: number;
  /**
   * JGRPP economy.day_length_factor, в свежих версиях называется
   * «Economy speed reduction factor»: экономический период длиннее в N раз.
   */
  dayLengthFactor: number;
  /** economy.timekeeping_units: календарь или wallclock (минуты реального времени). */
  timekeeping: 'calendar' | 'wallclock';
  /**
   * game_creation.starting_year (def 1950): the year the game starts. Only the JGRPP
   * "inflation from the start date" model reads it — that model counts 170 years from here.
   */
  startingYear: number;
  /** Подключён NewGRF Base Costs (глобальные множители базовых цен). */
  basecostGrf: boolean;
  /**
   * Множители Base Costs GRF: степени двойки, 1 = unchanged, 2 = double, 0.5 = half.
   */
  basecostLocomotive: number;
  basecostWagon: number;
  /** Running cost multipliers, one per running class — the set defines them separately. */
  basecostTrainRunningSteam: number;
  basecostTrainRunningDiesel: number;
  basecostTrainRunningElectric: number;
  /** Инфляция включена (Iron Horse с ней несовместим — по умолчанию off). */
  inflation: boolean;
  /** difficulty.initial_interest: скорость инфляции (2..4, def 2). */
  inflationInterest: number;
  /** difficulty.vehicle_costs: содержание техники 0=low, 1=medium, 2=high. */
  vehicleCosts: 0 | 1 | 2;
  /** difficulty.construction_cost: стоимость постройки/покупки 0=low, 1=medium, 2=high. */
  constructionCost: 0 | 1 | 2;
  /** difficulty.subsidy_multiplier: 0=×1.5, 1=×2, 2=×3, 3=×4. */
  subsidyMultiplier: 0 | 1 | 2 | 3;
  /** vehicle.train_acceleration_model: realistic учитывает сопротивление, original — нет. */
  accelerationModel: 'realistic' | 'original';
  /** order.gradual_loading: постепенная погрузка (влияет на длительность стоянки). */
  gradualLoading: boolean;
  /**
   * JGRPP economy.payment_algorithm: traditional обрезает время в пути до 255
   * периодов (очень долгие рейсы не штрафуются сильнее), modern — без обрезки.
   */
  paymentAlgorithm: 'modern' | 'traditional';
  /**
   * JGRPP difficulty.vehicle_costs_when_stopped (1..8): расходы стоящего поезда
   * делятся на это значение (train_cmd.cpp GetRunningCost).
   */
  costsWhenStopped: number;
  /** JGRPP economy.inflation_fixed_dates: инфляция только с 1920 по 2090. */
  inflationFixedDates: boolean;
  /**
   * JGRPP vehicle.vehicle_intro_randomisation («Randomise vehicle introduction
   * dates»): игра сдвигает дату появления машины вперёд на случайные 0…511 дней.
   * В ванили это поведение встроено и не отключается (engine.cpp StartupOneEngine),
   * поэтому настройка читается только при jgrpp.
   */
  vehicleIntroRandomisation: boolean;
  /**
   * vehicle.never_expire_vehicles ("Транспорт не будет выходить из эксплуатации"): a
   * vehicle stays in the buy menu forever. Otherwise the game withdraws it once its age
   * outgrows the selling life it rolled (engine.cpp CalcEngineReliability).
   */
  neverExpireVehicles: boolean;
}

/** Economy a game runs unless it says otherwise; also the fallback for an id the data lost. */
export const DEFAULT_FIRS_ECONOMY = 'STEELTOWN';

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  jgrpp: false,
  // The game loads no NewGRF of its own — a set comes from the savegame — so a calculator
  // that has been told nothing about the player's game starts from vanilla.
  trainSet: 'vanilla',
  firs: false,
  firsEconomy: DEFAULT_FIRS_ECONOMY,
  freightTrains: 1,
  slopeSteepness: 3,
  cargoAgingRate: 100,
  dayLengthFactor: 1,
  inflation: false,
  inflationInterest: 2,
  vehicleCosts: 0,
  constructionCost: 0,
  subsidyMultiplier: 2,
  accelerationModel: 'realistic',
  gradualLoading: true,
  paymentAlgorithm: 'modern',
  timekeeping: 'calendar',
  startingYear: 1950,
  basecostGrf: false,
  basecostLocomotive: 1,
  basecostWagon: 1,
  basecostTrainRunningSteam: 1,
  basecostTrainRunningDiesel: 1,
  basecostTrainRunningElectric: 1,
  costsWhenStopped: 1,
  inflationFixedDates: true,
  vehicleIntroRandomisation: true,
  neverExpireVehicles: false,
};

/**
 * Год в игре: от MIN_YEAR до MAX_YEAR (timer_game_common.h:173). The calculator keeps the
 * same range so a game that started outside the inflation era — 1860, say — can be entered
 * and imported as it is.
 */
export const MIN_GAME_YEAR = 0;
export const MAX_GAME_YEAR = 5_000_000;

/**
 * Keeps a year inside the game's range, falling back to the value already set when the field
 * holds no year at all. It takes the raw field value rather than a number on purpose: an
 * emptied number field hands back '', and `Number('')` is 0 — a year the player never typed,
 * and one the game's range would happily accept.
 */
export function clampGameYear(value: number | string, fallback: number): number {
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const year = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(year)) return fallback;
  return Math.min(MAX_GAME_YEAR, Math.max(MIN_GAME_YEAR, Math.trunc(year)));
}

/**
 * Множитель базовых цен от настройки сложности (economy.cpp RecomputePrices):
 * 0 → ×6/8, 1 → ×8/8 (норма), 2 → ×9/8.
 */
export function difficultyPriceFactor(mod: 0 | 1 | 2): number {
  return (mod === 0 ? 6 : mod === 1 ? 8 : 9) / 8;
}

/**
 * Варианты множителей Base Costs GRF: 1/64…64k×, как их предлагает сам набор
 * (BaseCosts Mod 5.0, Action 14). Нулевого («бесплатно») в игре нет — множитель
 * ограничен снизу MIN_PRICE_MODIFIER = -8 (economy_type.h:228).
 */
export const BASECOST_MULTIPLIERS: { value: number; label: string }[] = [
  { value: 1 / 64, label: '1/64' },
  { value: 1 / 32, label: '1/32' },
  { value: 1 / 16, label: '1/16' },
  { value: 1 / 8, label: '1/8' },
  { value: 1 / 4, label: 'quarter' },
  { value: 1 / 2, label: 'half' },
  { value: 1, label: 'unchanged' },
  { value: 2, label: 'double' },
  { value: 4, label: '4x' },
  { value: 8, label: '8x' },
  { value: 16, label: '16x' },
  { value: 32, label: '32x' },
  { value: 64, label: '64x' },
  { value: 128, label: '128x' },
  { value: 256, label: '256x' },
  { value: 512, label: '512x' },
  { value: 1024, label: '1024x' },
  { value: 2048, label: '2048x' },
  { value: 4096, label: '4096x' },
  { value: 8192, label: '8192x' },
  { value: 16384, label: '16kx' },
  { value: 32768, label: '32kx' },
  { value: 65536, label: '64kx' },
];


/**
 * Множитель Base Costs GRF для покупки машины. Выключенный GRF — нейтральная 1.
 * В игре это глобальный сдвиг базовой цены (newgrf.cpp: multiplier применяется
 * глобально, если GRF не определяет объектов этой фичи).
 */
export function basecostBuyFactor(settings: GameSettings, kind: 'engine' | 'wagon'): number {
  if (!settings.basecostGrf) return 1;
  return kind === 'engine' ? settings.basecostLocomotive : settings.basecostWagon;
}

/**
 * Running-cost classes a train can charge by. `roadveh` is xUSSR's wagons: the set bases
 * their upkeep on the road-vehicle price (PR_RUNNING_ROADVEH, 1600) — a legal NewGRF move,
 * any base price may be named.
 */
export type RunningClass = 'steam' | 'diesel' | 'electric' | 'roadveh';

/**
 * Base Costs GRF multiplier for running costs. The game keeps a separate base price per
 * running class (PR_RUNNING_TRAIN_STEAM / _DIESEL / _ELECTRIC), and a Base Costs set scales
 * each of them with its own parameter, so the multiplier follows the vehicle's class.
 */
export function basecostRunningFactor(
  settings: GameSettings,
  runningClass: RunningClass,
): number {
  if (!settings.basecostGrf) return 1;
  if (runningClass === 'steam') return settings.basecostTrainRunningSteam;
  if (runningClass === 'electric') return settings.basecostTrainRunningElectric;
  // the road-vehicle base xUSSR wagons charge by has no multiplier of its own here:
  // the calculator's Base Costs settings model the train parameters of the set
  if (runningClass === 'roadveh') return 1;
  return settings.basecostTrainRunningDiesel;
}

/** Множитель дохода при действующей субсидии (economy.cpp DeliverGoods). */
export function subsidyFactor(mod: 0 | 1 | 2 | 3): number {
  return mod === 0 ? 1.5 : mod === 1 ? 2 : mod === 2 ? 3 : 4;
}

/**
 * Тики стоянки под погрузку: вагоны грузятся параллельно, порция loading_speed
 * единиц каждые 40 тиков (economy.cpp gradual_loading_wait_time[Train]).
 */
export function loadingTicks(
  capacityPerWagon: number,
  loadingSpeed: number,
  settings: GameSettings,
): number {
  if (!settings.gradualLoading || loadingSpeed <= 0 || capacityPerWagon <= 0) return 0;
  return Math.ceil(capacityPerWagon / loadingSpeed) * 40;
}




/** Настройки калькулятора: не игровые параметры, а допущения расчёта. */
export interface CalcSettings {
  /** Индекс GRF-параметра вместимости вагонов Iron Horse (0..4, default 2). */
  capacityIndex: number;
  /** Длина подъёма в тайлах для колонки «на подъёме». */
  hillTiles: number;
  /**
   * Track the route is built with, as the label of a railtype (`RAIL`, `ELRL`, `NAAN`…).
   * It decides which vehicles are offered and how fast they go, so a set the calculator
   * does not know is read as plain rail rather than left dangling (`activeRailtype`).
   */
  trackType: string;
  /**
   * The one year the calculator works in: it decides which vehicles the buy menu offers on
   * every tab and, with inflation on, which prices apply. The name is historical — the field
   * predates the buy menu reading it — and stays because it travels inside the savegame
   * snapshot in IndexedDB: renaming it would bump the snapshot schema, and a record of an
   * older schema is dropped rather than migrated, so every imported game would have to be
   * imported again for a rename.
   */
  priceYear: number;
}

export const DEFAULT_CALC_SETTINGS: CalcSettings = {
  capacityIndex: 2,
  hillTiles: 2,
  trackType: 'RAIL',
  priceYear: 1950,
};

/** Делитель расходов на стоянке (только JGRPP). */
export function stoppedCostDivisor(settings: GameSettings): number {
  return settings.jgrpp ? Math.max(1, settings.costsWhenStopped) : 1;
}

/** Замедление экономики учитывается только на JGRPP (в ванили настройки нет). */
export function effectiveDayLength(settings: GameSettings): number {
  return settings.jgrpp ? settings.dayLengthFactor : 1;
}

/**
 * Length of an economy year in game days. In wallclock mode it is always 360 days
 * (DAYS_IN_ECONOMY_YEAR, timer_game_economy.h:52) — economy.minutes_per_calendar_year
 * stretches the calendar (dates, vehicle ageing) but never the economy.
 */
export function daysPerEconomyYear(settings: GameSettings): number {
  return settings.timekeeping === 'wallclock' ? 360 : 365;
}

/**
 * Engine days in an economy year: the days trips and accumulation are counted in. A JGRPP day
 * length factor stretches the year in those days without changing what an industry makes in a
 * month, so a slowed economy fits proportionally more of them into the same output.
 */
export function engineDaysPerYear(settings: GameSettings): number {
  return daysPerEconomyYear(settings) * effectiveDayLength(settings);
}

/**
 * Economy year as a share of the calendar year. Running cost is charged per tick against
 * a fixed divisor of 365 days (train_cmd.cpp:4272), so a 360-day economy year collects
 * proportionally less of it.
 */
export function economyYearFraction(settings: GameSettings): number {
  return daysPerEconomyYear(settings) / 365;
}

/**
 * Which inflation model applies: true = fixed dates (1920…2090 regardless of the start
 * year), false = 170 years from the start of the game. The latter only exists in JGRPP;
 * vanilla always uses fixed dates.
 */
export function inflationModel(settings: GameSettings): boolean {
  return !settings.jgrpp || settings.inflationFixedDates;
}

