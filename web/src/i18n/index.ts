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

/** Missing string falls back to English, then to the key itself. */
export function t(key: string): string {
  const { locale } = useLocaleStore.getState();
  return dictionaries[locale][key] ?? (en as Strings)[key] ?? key;
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
export function intlLocale(): string {
  return LOCALES[useLocaleStore.getState().locale].numbers;
}
