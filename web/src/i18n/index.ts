/**
 * Минимальная i18n-обёртка: t(key, params?, locale?). Все UI-строки — в en.json / ru.json,
 * выбранный язык — в state/localeStore; локаль передаётся явно только там, где строка
 * попадает в мемо (см. useLocale ниже).
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
export function t(
  key: string,
  params?: Record<string, string | number>,
  // read off the store when not given; a memoised caller passes it so that its memo is
  // keyed on the language
  locale: Locale = useLocaleStore.getState().locale,
): string {
  const text = dictionaries[locale][key] ?? (en as Strings)[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Subscribes a component to the locale. t() reads the store outside React, so
 * App depends on this to re-render the tree when the language changes; anything
 * that caches translated strings has to do the same — either translate at render
 * time, the way the table headers do, or hand the locale from this hook to t()
 * and the name helpers and key the memo on it, the way the chain graph does.
 */
export function useLocale(): Locale {
  return useLocaleStore((s) => s.locale);
}

/** BCP 47 tag for Intl: number formatting and collation follow the UI language. */
/** BCP 47 tag for Intl formatting; pass the locale explicitly inside memoised code. */
export function intlLocale(locale: Locale = useLocaleStore.getState().locale): string {
  return LOCALES[locale].numbers;
}
