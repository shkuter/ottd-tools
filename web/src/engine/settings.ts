/**
 * Игровые настройки, влияющие на расчёты. Значения и диапазоны — как в OpenTTD
 * (src/table/settings/*.ini) и JGR's Patchpack.
 */

import type { TrackType } from '../types';

export interface GameSettings {
  /** Играем на JGR's Patchpack: доступны специфичные для патчпака настройки. */
  jgrpp: boolean;
  /** Подключён NewGRF Iron Horse (иначе — ванильные поезда OpenTTD). */
  ironHorse: boolean;
  /** Подключён NewGRF FIRS 5 (иначе — ванильные грузы и индустрии). */
  firs: boolean;
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
  basecostTrainRunning: number;
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
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  jgrpp: false,
  ironHorse: true,
  firs: true,
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
  basecostTrainRunning: 1,
  costsWhenStopped: 1,
  inflationFixedDates: true,
  vehicleIntroRandomisation: true,
};

/**
 * Множитель базовых цен от настройки сложности (economy.cpp RecomputePrices):
 * 0 → ×6/8, 1 → ×8/8 (норма), 2 → ×9/8.
 */
export function difficultyPriceFactor(mod: 0 | 1 | 2): number {
  return (mod === 0 ? 6 : mod === 1 ? 8 : 9) / 8;
}

/**
 * Варианты множителей Base Costs GRF: 1/64…8192×. Нулевого («бесплатно») в игре нет —
 * множитель ограничен снизу MIN_PRICE_MODIFIER = -8 (economy_type.h:228).
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

/** Множитель Base Costs GRF для расходов на содержание поездов. */
export function basecostRunningFactor(settings: GameSettings): number {
  return settings.basecostGrf ? settings.basecostTrainRunning : 1;
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
  /** Тип пути по умолчанию. */
  trackType: TrackType;
  /** Год для цен (используется при включённой инфляции). */
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

