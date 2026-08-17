/**
 * Игровые настройки, влияющие на расчёты. Значения и диапазоны — как в OpenTTD
 * (src/table/settings/*.ini) и JGR's Patchpack.
 */

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
  /** economy.minutes_per_calendar_year (только wallclock, def 12). */
  minutesPerYear: number;
  /** Подключён NewGRF Base Costs (глобальные множители базовых цен). */
  basecostGrf: boolean;
  /**
   * Множители Base Costs GRF: степени двойки, 1 = unchanged, 2 = double,
   * 0.5 = half; 0 = free (no costs).
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
  vehicleCosts: 1,
  constructionCost: 1,
  subsidyMultiplier: 1,
  accelerationModel: 'realistic',
  gradualLoading: true,
  paymentAlgorithm: 'modern',
  timekeeping: 'calendar',
  minutesPerYear: 12,
  basecostGrf: false,
  basecostLocomotive: 1,
  basecostWagon: 1,
  basecostTrainRunning: 1,
  costsWhenStopped: 1,
  inflationFixedDates: true,
};

/**
 * Множитель базовых цен от настройки сложности (economy.cpp RecomputePrices):
 * 0 → ×6/8, 1 → ×8/8 (норма), 2 → ×9/8.
 */
export function difficultyPriceFactor(mod: 0 | 1 | 2): number {
  return (mod === 0 ? 6 : mod === 1 ? 8 : 9) / 8;
}

/** Варианты множителей Base Costs GRF: от «free» до 8192×. */
export const BASECOST_MULTIPLIERS: { value: number; label: string }[] = [
  { value: 0, label: 'free (no costs)' },
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
  trackType: 'RAIL' | 'NG' | 'METRO';
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
 * Длительность «года» в игровых днях. В wallclock-режиме экономический период —
 * это minutesPerYear минут реального времени, минута ≈ 30 дней календаря.
 */
export function daysPerEconomyYear(settings: GameSettings): number {
  if (settings.timekeeping === 'wallclock') return settings.minutesPerYear * 30;
  return 365;
}

/** Тиков в календарном году с учётом длины дня. */
export function yearTicks(settings: GameSettings): number {
  return 365 * 74 * effectiveDayLength(settings);
}
