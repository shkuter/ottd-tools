/**
 * Единицы OpenTTD.
 * Внутренняя единица скорости: display mph = internal * 10/16 (strings.cpp:990).
 * День = 74 тика (timer_game_tick.h), период старения груза = 185 тиков = 2.5 дня.
 */

export const DAY_TICKS = 74;
export const CARGO_AGING_TICKS = 185;
export const DAYS_PER_TRANSIT_PERIOD = CARGO_AGING_TICKS / DAY_TICKS; // 2.5

export function mphToInternal(mph: number): number {
  return Math.round((mph * 16) / 10);
}

export function internalToMph(internal: number): number {
  return Math.floor((internal * 10) / 16);
}

/**
 * The same conversion without the truncation, for a figure that goes into the physics
 * rather than onto the screen. `internalToMph` truncates the way the game's own display
 * does, which is right for what the interface prints and wrong for what is computed from:
 * there a lost unit stays lost.
 */
export function internalToMphExact(internal: number): number {
  return (internal * 10) / 16;
}

/**
 * Internal speed to km/h, the way the game does it: ConvertKmhishSpeedToDisplaySpeed =
 * ToDisplay(speed * 10, round = false) / 16 with the metric factor 1.609344
 * (strings.cpp:858 and :993). ToDisplay truncates when not rounding, the /16 is integer.
 */
export function internalToKmh(internal: number): number {
  return Math.floor(Math.trunc(internal * 10 * 1.609344) / 16);
}

/** Тайлов в игровой день при постоянной скорости (v*3/4 прогресса дважды за тик, тайл = 3072). */
export function tilesPerDay(internalSpeed: number): number {
  return (internalSpeed * DAY_TICKS) / 2048;
}

/** Дней пути на дистанцию (в тайлах) при постоянной скорости. */
export function daysForDistance(tiles: number, internalSpeed: number): number {
  if (internalSpeed <= 0) return Infinity;
  return tiles / tilesPerDay(internalSpeed);
}

export function transitPeriodsFromDays(days: number): number {
  return Math.floor(days / DAYS_PER_TRANSIT_PERIOD);
}
