/**
 * Игровые настройки, влияющие на расчёты. Значения и диапазоны — как в OpenTTD
 * (src/table/settings/*.ini) и JGR's Patchpack.
 */

export interface GameSettings {
  /** Играем на JGR's Patchpack: доступны специфичные для патчпака настройки. */
  jgrpp: boolean;
  /** vehicle.freight_trains: множитель веса грузов (1..255, def 1). */
  freightTrains: number;
  /** vehicle.train_slope_steepness: крутизна уклона в % (0..10, def 3). */
  slopeSteepness: number;
  /** economy.cargo_aging_rate: скорость старения груза в % (def 100). */
  cargoAgingRate: number;
  /** JGRPP economy.day_length_factor: день = 74 × N тиков (1..125, def 1). */
  dayLengthFactor: number;
  /** Инфляция включена (Iron Horse с ней несовместим — по умолчанию off). */
  inflation: boolean;
  /** difficulty.initial_interest: скорость инфляции (2..4, def 2). */
  inflationInterest: number;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  jgrpp: false,
  freightTrains: 1,
  slopeSteepness: 3,
  cargoAgingRate: 100,
  dayLengthFactor: 1,
  inflation: false,
  inflationInterest: 2,
};

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

/** Длина дня учитывается только на JGRPP (в ванили такой настройки нет). */
export function effectiveDayLength(settings: GameSettings): number {
  return settings.jgrpp ? settings.dayLengthFactor : 1;
}

/** Тиков в календарном году с учётом длины дня. */
export function yearTicks(settings: GameSettings): number {
  return 365 * 74 * effectiveDayLength(settings);
}
