import { intlLocale, t } from '../i18n';
import { displaySpeed } from '../engine/units';
import { CURRENCIES, useSettingsStore, type CurrencyCode } from '../state/settingsStore';
import { trainName } from '../i18n/names';
import { plural, type CountKey } from '../i18n/plural';

/**
 * Money: every calculation is in pounds, converted at the game's own rates.
 *
 * The sign is written by hand in front of the whole amount: `toLocaleString` puts a hyphen
 * between the symbol and the digits ("£-98"), and a minus (U+2212) before the symbol is how a
 * loss is written ("−£98", "−98 ₽"). An amount that rounds to zero carries no sign: `n < 0` is
 * false for the `-0` that rounding a small loss gives.
 */
export function money(value: number): string {
  const { rate, symbol, position } = CURRENCIES[useSettingsStore.getState().currency];
  const rounded = Math.round(value * rate);
  const digits = Math.abs(rounded).toLocaleString(intlLocale());
  const sign = rounded < 0 ? '−' : '';
  return position === 'prefix' ? sign + symbol + digits : sign + digits + symbol;
}

/**
 * How a currency is named wherever it is chosen or compared: code, sign and rate. The rate
 * is part of the name because two currencies can differ by nothing else the player sees —
 * the game's two roubles convert at 50 and 80 to the pound under three letters each.
 */
export function currencyLabel(code: CurrencyCode): string {
  const { symbol, rate } = CURRENCIES[code];
  return `${code} (${symbol.trim() || code}) ×${rate}`;
}

/**
 * Speed: the engine and the dataset carry the game's internal unit, the displayed value is
 * derived from it exactly as the game does (units.ts), never from an already rounded mph.
 */
export function speed(internal: number): string {
  return `${speedValue(internal)} ${speedUnitLabel()}`;
}

/** The bare number, for rows that print several speeds under one unit label. */
export function speedValue(internal: number): string {
  return String(displaySpeed(internal, useSettingsStore.getState().speedUnit));
}

export function speedUnitLabel(): string {
  return useSettingsStore.getState().speedUnit === 'imperial' ? t('units.mph') : t('units.kmh');
}

export function num(value: number, digits = 0): string {
  return value.toLocaleString(intlLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

/**
 * A number with the word that goes with it, agreed by the plural rules of the language:
 * "1 year", "5 лет". The form follows the figure as printed, so both take the same `digits`.
 * A column heading naming a unit with no number beside it keeps `withUnit` and `units.*`.
 */
export function countLabel(key: CountKey, value: number, digits = 0): string {
  return `${num(value, digits)} ${plural(key, value, digits)}`;
}

/** A 0..1 share as whole percent, the way both tabs print the delivered share. */
export function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/**
 * How a consist is written wherever one is shown. Every tab reads from here, so the same train
 * is never spelled two ways: the count sits in front of the name, and a single engine carries
 * no count at all.
 */
export function engineLabel(
  row: { engine: { id: string; name: string }; engineCount: number },
): string {
  const name = trainName(row.engine);
  return row.engineCount > 1 ? `${row.engineCount}× ${name}` : name;
}

export function wagonLabel(row: { wagon: { id: string; name: string }; wagonCount: number }): string {
  return `${row.wagonCount}× ${trainName(row.wagon)}`;
}

/** Both halves in one line, for places that name a consist outside a table. */
export function consistLabel(
  row: {
    engine: { id: string; name: string };
    engineCount: number;
    wagon: { id: string; name: string };
    wagonCount: number;
  },
): string {
  return row.wagonCount > 0 ? `${engineLabel(row)} + ${wagonLabel(row)}` : engineLabel(row);
}

/**
 * A column heading with the unit its figures are in: "Round trip, days".
 *
 * The unit is named once, in the heading, rather than repeated in every cell —
 * the way the game heads its own lists. Money keeps its symbol beside the
 * figure, as the game writes it there too.
 *
 * A unit that opens with a slash reads as "per" rather than as a noun, and "per"
 * takes no comma before it: "Source output/month", not "Source output, /month".
 */
export function withUnit(label: string, unit: string): string {
  return unit.startsWith('/') ? `${label}${unit}` : `${label}, ${unit}`;
}

/**
 * The unit as a field shows it, beside the number the user is typing: " tiles".
 *
 * The space belongs to the unit rather than to each caller — every field asks for
 * the same suffix, and one of them writing it differently is exactly the kind of
 * drift this change is about. A unit that agrees with the number goes through
 * `countSuffix` instead.
 */
export function unitSuffix(unit: string): string {
  return ` ${unit}`;
}

/** Decimals a typed value can carry; the plural rules see all of them rather than a rounding. */
const FIELD_DIGITS = 10;

/**
 * The suffix of a field whose unit agrees with the number typed into it: " tile" beside 1,
 * " tiles" beside 3. The field prints the value as typed, with no rounding of its own, so the
 * form is taken from the value itself; an empty field reads as zero.
 */
export function countSuffix(key: CountKey, value: number | string): string {
  return unitSuffix(plural(key, Number(value) || 0, FIELD_DIGITS));
}

/** The currency symbol on its own, for a heading that names what a column holds. */
export function currencySymbol(): string {
  return CURRENCIES[useSettingsStore.getState().currency].symbol.trim();
}
