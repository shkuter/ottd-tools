import { intlLocale } from '../i18n';
import { CURRENCIES, useSettingsStore } from '../state/settingsStore';

/** Деньги: базовая валюта расчётов — фунт, конвертация по курсам игры. */
export function money(value: number): string {
  const { rate, symbol, position } = CURRENCIES[useSettingsStore.getState().currency];
  const formatted = Math.round(value * rate).toLocaleString(intlLocale());
  return position === 'prefix' ? symbol + formatted : formatted + symbol;
}

export function num(value: number, digits = 0): string {
  return value.toLocaleString(intlLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}
