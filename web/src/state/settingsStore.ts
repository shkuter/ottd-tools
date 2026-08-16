import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Валюты OpenTTD: курс от базового фунта и позиция символа — как в игре (currency.cpp). */
export const CURRENCIES = {
  GBP: { rate: 1, symbol: '£', position: 'prefix' },
  USD: { rate: 2, symbol: '$', position: 'prefix' },
  EUR: { rate: 2, symbol: '€', position: 'prefix' },
  JPY: { rate: 220, symbol: '¥', position: 'prefix' },
  RUB: { rate: 80, symbol: ' ₽', position: 'suffix' },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

interface SettingsState {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      currency: 'GBP',
      setCurrency: (currency) => set({ currency }),
    }),
    { name: 'ottd-tools-settings' },
  ),
);
