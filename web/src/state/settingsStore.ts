import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { activeEconomy } from '../dataset';
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

/** Where the settings live, and at which version; exported so checks seed the real thing. */
export const SETTINGS_KEY = 'ottd-tools-settings';
export const SETTINGS_VERSION = 2;

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
 * The same treatment goes to an economy the data no longer has — a FIRS release renaming
 * one would otherwise leave the calculator with an empty cargo list.
 */
function normaliseGame(game: GameSettings): GameSettings {
  const known = new Set(BASECOST_MULTIPLIERS.map((m) => m.value));
  const fix = (v: number) => (known.has(v) ? v : 1);
  return {
    ...game,
    firsEconomy: activeEconomy(game).id,
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
      name: SETTINGS_KEY,
      version: SETTINGS_VERSION,
      /**
       * Steps run in ascending order and each one is skipped by the version that already has
       * it, so a state saved at any version walks the rest of the way. Returning early on the
       * first step that does not apply would strand the state one version short — which is
       * what a single `version >= 1` guard did while v1 was the newest.
       */
      migrate: (persisted, version) => {
        if (version >= SETTINGS_VERSION) return persisted as SettingsState;
        type Persisted = Omit<Partial<SettingsState>, 'game'> & {
          game?: Partial<GameSettings> & { basecostTrainRunning?: number };
        };
        let p = (persisted ?? {}) as Persisted;

        /*
         * v1 split the single Base Costs running-cost multiplier into one per running class.
         * The saved value applied to every train, so it carries over to all three and the
         * migrated settings keep producing the numbers they produced before.
         */
        const legacy = p.game?.basecostTrainRunning;
        if (version < 1 && legacy != null) {
          const { basecostTrainRunning: _dropped, ...game } = p.game ?? {};
          p = {
            ...p,
            game: {
              ...game,
              basecostTrainRunningSteam: legacy,
              basecostTrainRunningDiesel: legacy,
              basecostTrainRunningElectric: legacy,
            },
          };
        }

        /*
         * v2 turned every NewGRF off by default: the calculator no longer claims a game it
         * knows nothing about. persist keeps a saved value ahead of a default, and it cannot
         * tell "agreed with the old default" from "chose the same thing", so the switch is
         * rewritten for everyone. Two switches — or one savegame import — bring the sets back.
         */
        if (version < 2) {
          p = { ...p, game: { ...p.game, ironHorse: false, firs: false } };
        }

        return p as SettingsState;
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
