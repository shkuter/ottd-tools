/**
 * Минимальная i18n-обёртка: t(key). Все UI-строки — в en.json / ru.json,
 * выбранный язык — в state/localeStore.
 * При реальной локализации заменяется на i18next без переписывания вызовов t().
 */
import { LOCALES, useLocaleStore, type Locale } from '../state/localeStore';
import en from './en.json';
import ru from './ru.json';

type Strings = Record<string, string>;

const dictionaries: Record<Locale, Strings> = { en: en as Strings, ru: ru as Strings };

/**
 * Missing string falls back to English, then to the key itself. Placeholders are written
 * as {name} in the dictionaries and filled from `params`.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const { locale } = useLocaleStore.getState();
  const text = dictionaries[locale][key] ?? (en as Strings)[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Subscribes a component to the locale. t() reads the store outside React, so
 * App depends on this to re-render the tree when the language changes; anything
 * that caches translated strings has to do the same (or translate at render
 * time, the way the table headers do).
 */
export function useLocale(): Locale {
  return useLocaleStore((s) => s.locale);
}

/** BCP 47 tag for Intl: number formatting and collation follow the UI language. */
/** BCP 47 tag for Intl formatting; pass the locale explicitly inside memoised code. */
export function intlLocale(locale: Locale = useLocaleStore.getState().locale): string {
  return LOCALES[locale].numbers;
}
