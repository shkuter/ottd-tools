/**
 * Минимальная i18n-обёртка: t(key). Все UI-строки — в en.json.
 * При реальной локализации заменяется на i18next без переписывания вызовов t().
 */
import en from './en.json';

type Strings = Record<string, string>;

const locales: Record<string, Strings> = { en: en as Strings };
let current = 'en';

export function setLocale(locale: string): void {
  if (locales[locale]) current = locale;
}

export function t(key: string): string {
  return locales[current][key] ?? key;
}
