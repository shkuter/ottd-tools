import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
} from '../engine/settings';

/** Валюты OpenTTD: курс от базового фунта и позиция символа — как в игре (currency.cpp). */
export const CURRENCIES = {
  GBP: { rate: 1, symbol: '£', position: 'prefix' },
  USD: { rate: 2, symbol: '$', position: 'prefix' },
  EUR: { rate: 2, symbol: '€', position: 'prefix' },
  JPY: { rate: 220, symbol: '¥', position: 'prefix' },
  RUB: { rate: 80, symbol: ' ₽', position: 'suffix' },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

interface SettingsState {
  currency: CurrencyCode;
  game: GameSettings;
  calc: CalcSettings;
  setCurrency: (currency: CurrencyCode) => void;
  setGame: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  setCalc: <K extends keyof CalcSettings>(key: K, value: CalcSettings[K]) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      currency: 'GBP',
      game: DEFAULT_GAME_SETTINGS,
      calc: DEFAULT_CALC_SETTINGS,
      setCurrency: (currency) => set({ currency }),
      setGame: (key, value) => set((s) => ({ game: { ...s.game, [key]: value } })),
      setCalc: (key, value) => set((s) => ({ calc: { ...s.calc, [key]: value } })),
      reset: () =>
        set({
          currency: 'GBP',
          game: DEFAULT_GAME_SETTINGS,
          calc: DEFAULT_CALC_SETTINGS,
        }),
    }),
    {
      name: 'ottd-tools-settings',
      // новые поля настроек должны появляться у старых пользователей
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          game: { ...DEFAULT_GAME_SETTINGS, ...(p.game ?? {}) },
          calc: { ...DEFAULT_CALC_SETTINGS, ...(p.calc ?? {}) },
        };
      },
    },
  ),
);
