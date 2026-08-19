import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  BASECOST_MULTIPLIERS,
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

/** Speed units of the game's Localisation settings (locale.units_velocity), metric by default. */
export type SpeedUnit = 'imperial' | 'metric';

interface SettingsState {
  currency: CurrencyCode;
  speedUnit: SpeedUnit;
  game: GameSettings;
  calc: CalcSettings;
  setCurrency: (currency: CurrencyCode) => void;
  setSpeedUnit: (speedUnit: SpeedUnit) => void;
  setGame: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  setCalc: <K extends keyof CalcSettings>(key: K, value: CalcSettings[K]) => void;
  /** Applies several settings at once, e.g. everything a savegame states. */
  applySettings: (game: Partial<GameSettings>, calc: Partial<CalcSettings>) => void;
  reset: () => void;
}

/**
 * A Base Costs multiplier saved before "free (no costs)" was dropped from the list would
 * zero out every price, so anything the list no longer offers falls back to "unchanged".
 */
function normaliseGame(game: GameSettings): GameSettings {
  const known = new Set(BASECOST_MULTIPLIERS.map((m) => m.value));
  const fix = (v: number) => (known.has(v) ? v : 1);
  return {
    ...game,
    basecostLocomotive: fix(game.basecostLocomotive),
    basecostWagon: fix(game.basecostWagon),
    basecostTrainRunningSteam: fix(game.basecostTrainRunningSteam),
    basecostTrainRunningDiesel: fix(game.basecostTrainRunningDiesel),
    basecostTrainRunningElectric: fix(game.basecostTrainRunningElectric),
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      currency: 'GBP',
      speedUnit: 'metric',
      game: DEFAULT_GAME_SETTINGS,
      calc: DEFAULT_CALC_SETTINGS,
      setCurrency: (currency) => set({ currency }),
      setSpeedUnit: (speedUnit) => set({ speedUnit }),
      setGame: (key, value) => set((s) => ({ game: { ...s.game, [key]: value } })),
      setCalc: (key, value) => set((s) => ({ calc: { ...s.calc, [key]: value } })),
      applySettings: (game, calc) =>
        set((s) => ({ game: { ...s.game, ...game }, calc: { ...s.calc, ...calc } })),
      reset: () =>
        set({
          currency: 'GBP',
          speedUnit: 'metric',
          game: DEFAULT_GAME_SETTINGS,
          calc: DEFAULT_CALC_SETTINGS,
        }),
    }),
    {
      name: 'ottd-tools-settings',
      version: 1,
      /**
       * v1 split the single Base Costs running-cost multiplier into one per running class.
       * The saved value applied to every train, so it carries over to all three and the
       * migrated settings keep producing the numbers they produced before.
       */
      migrate: (persisted, version) => {
        if (version >= 1) return persisted as SettingsState;
        const p = (persisted ?? {}) as Partial<SettingsState> & {
          game?: Partial<GameSettings> & { basecostTrainRunning?: number };
        };
        const legacy = p.game?.basecostTrainRunning;
        if (legacy == null) return p as SettingsState;
        const { basecostTrainRunning: _dropped, ...game } = p.game ?? {};
        return {
          ...p,
          game: {
            ...game,
            basecostTrainRunningSteam: legacy,
            basecostTrainRunningDiesel: legacy,
            basecostTrainRunningElectric: legacy,
          },
        } as SettingsState;
      },
      // новые поля настроек должны появляться у старых пользователей
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          game: normaliseGame({ ...DEFAULT_GAME_SETTINGS, ...(p.game ?? {}) }),
          calc: { ...DEFAULT_CALC_SETTINGS, ...(p.calc ?? {}) },
        };
      },
    },
  ),
);
