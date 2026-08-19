import { intlLocale, t } from '../i18n';
import { internalToKmh, internalToMph } from '../engine/units';
import { CURRENCIES, useSettingsStore } from '../state/settingsStore';

/** Деньги: базовая валюта расчётов — фунт, конвертация по курсам игры. */
export function money(value: number): string {
  const { rate, symbol, position } = CURRENCIES[useSettingsStore.getState().currency];
  const formatted = Math.round(value * rate).toLocaleString(intlLocale());
  return position === 'prefix' ? symbol + formatted : formatted + symbol;
}

/**
 * Speed: the engine and the dataset carry the game's internal unit, the displayed value is
 * derived from it exactly as the game does (units.ts), never from an already rounded mph.
 */
export function speed(internal: number): string {
  return useSettingsStore.getState().speedUnit === 'imperial'
    ? `${internalToMph(internal)} ${t('units.mph')}`
    : `${internalToKmh(internal)} ${t('units.kmh')}`;
}

export function num(value: number, digits = 0): string {
  return value.toLocaleString(intlLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}
