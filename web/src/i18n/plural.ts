/**
 * The word that goes with a number: "1 year", "3 года", "5 лет".
 *
 * `t()` only fills placeholders, and one string per unit reads wrong beside every number but
 * the ones it was written for — "1 лет", "1 routes". A language has its own set of plural
 * categories (English one/other, Russian one/few/many/other), so the dictionaries hold one
 * string per category under `<key>.<category>`, and the category comes from `Intl`.
 */
import { useLocaleStore, type Locale } from '../state/localeStore';
import { hasString, intlLocale, t } from '.';
import type en from './en.json';

/**
 * A word that agrees with a number, named by its base: `count.years` for `count.years.one`,
 * `count.years.other`… Taken from the English dictionary's `other` forms — every language has
 * that category, and locales.test holds every dictionary to the same bases — so a mistyped
 * key fails to compile rather than printing the key itself.
 */
export type CountKey = {
  [K in keyof typeof en]: K extends `count.${infer Base}.other` ? `count.${Base}` : never;
}[keyof typeof en];

/**
 * The form of `key` for `value` as it is shown with `digits` decimals.
 *
 * The rules are given the same rounding `num()` prints with, so the form agrees with the
 * figure on screen rather than with the raw value: 1.04 shown as "1" is "1 год", and 1.5 is
 * "1,5 года" — a fraction takes the `other` form in Russian, which is not the form of 5.
 */
export function plural(
  key: CountKey,
  value: number,
  digits = 0,
  locale: Locale = useLocaleStore.getState().locale,
): string {
  const rules = new Intl.PluralRules(intlLocale(locale), {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
  return pluralForm(key, rules.select(value), locale);
}

/**
 * The string of one category, or the `other` one when the dictionary does not name that
 * category: `other` is the one category every language has, so it is the safe fallback.
 */
export function pluralForm(
  key: CountKey,
  category: Intl.LDMLPluralRule,
  locale: Locale = useLocaleStore.getState().locale,
): string {
  const own = `${key}.${category}`;
  return t(hasString(own, locale) ? own : `${key}.other`, undefined, locale);
}
