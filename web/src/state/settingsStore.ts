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

/**
 * OpenTTD currencies: rate against the base pound and where the sign goes, as in the game
 * (currency.cpp).
 *
 * The game ships two roubles, and they are not synonyms: RUR, the "Russian Rouble", at 50
 * to the pound, and RUB, the "New Russian Ruble", at 80. A game played on RUR shows sums
 * 1.6 times smaller than the same game on RUB, so both belong here, and a savegame import
 * carries whichever the game is set to.
 */
export const CURRENCIES = {
  GBP: { rate: 1, symbol: '£', position: 'prefix' },
  USD: { rate: 2, symbol: '$', position: 'prefix' },
  EUR: { rate: 2, symbol: '€', position: 'prefix' },
  JPY: { rate: 220, symbol: '¥', position: 'prefix' },
  RUR: { rate: 50, symbol: ' p', position: 'suffix' },
  RUB: { rate: 80, symbol: ' ₽', position: 'suffix' },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

/** Speed units of the game's Localisation settings (locale.units_velocity), metric by default. */
export type SpeedUnit = 'imperial' | 'metric';

/**
 * How the numbers are shown. Not a matter of calculation — that works in pounds and the
 * game's internal speed unit — but of whether what the player reads here matches what they
 * read in the game, which is why a savegame import carries it.
 */
export interface DisplaySettings {
  currency: CurrencyCode;
  speedUnit: SpeedUnit;
}

/** Where the settings live, and at which version; exported so checks seed the real thing. */
export const SETTINGS_KEY = 'ottd-tools-settings';
export const SETTINGS_VERSION = 5;

/**
 * Gauge families the track setting used to hold → the label of the track each stood for.
 * `RAIL` and `MONO` name themselves; `MAGLEV` is the family, `MGLV` the game's label.
 */
const TRACK_FAMILY_LABELS: Record<string, string> = {
  NG: 'NAAN',
  METRO: 'MTRO',
  MAGLEV: 'MGLV',
};

interface SettingsState extends DisplaySettings {
  game: GameSettings;
  calc: CalcSettings;
  setCurrency: (currency: CurrencyCode) => void;
  setSpeedUnit: (speedUnit: SpeedUnit) => void;
  setGame: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  setCalc: <K extends keyof CalcSettings>(key: K, value: CalcSettings[K]) => void;
  /** Applies several settings at once, e.g. everything a savegame states. */
  applySettings: (
    game: Partial<GameSettings>,
    calc: Partial<CalcSettings>,
    display?: Partial<DisplaySettings>,
  ) => void;
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
    basecostInfrastructure: fix(game.basecostInfrastructure),
    basecostRailConstruction: fix(game.basecostRailConstruction),
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
      applySettings: (game, calc, display) =>
        set((s) => ({
          ...display,
          game: { ...s.game, ...game },
          calc: { ...s.calc, ...calc },
        })),
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
          game?: Omit<Partial<GameSettings>, 'trainSet'> & {
            basecostTrainRunning?: number;
            ironHorse?: boolean;
            // the roster is read as a plain string: a state saved before v5 may name a set
            // the type no longer has, which is exactly what that step is here to fix
            trainSet?: string;
          };
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

        /*
         * v3 made the track a railtype rather than a gauge family, so a saved family becomes
         * the label of the track it stood for. Electrification is not here: it was saved by
         * the tab stores, and carrying it into this choice needs all three at once — that is
         * `carryElectrificationIntoTrackType` in state/upgrade.ts, which runs before any store.
         */
        if (version < 3 && p.calc?.trackType) {
          const label = TRACK_FAMILY_LABELS[p.calc.trackType] ?? p.calc.trackType;
          p = { ...p, calc: { ...p.calc, trackType: label } };
        }

        /*
         * v4 turned the Iron Horse switch into the train-set choice: two booleans could
         * claim two sets at once. The saved flag carries over losslessly — on means Iron
         * Horse, off means vanilla — and the old field leaves the saved state.
         */
        if (version < 4 && p.game) {
          const { ironHorse, ...game } = p.game;
          p = {
            ...p,
            game: { ...game, trainSet: ironHorse ? 'iron_horse' : 'vanilla' },
          };
        }

        /*
         * v5 dropped the xUSSR roster. A state that names it has no catalogue to answer
         * with, so it moves to vanilla — and the track goes with it: the labels of that
         * set's tracks (ER2D, ER3a…) mean nothing in the vanilla table, and leaving one
         * saved would only be written back on the next change.
         */
        if (version < 5 && p.game?.trainSet === 'xussr') {
          p = { ...p, game: { ...p.game, trainSet: 'vanilla' } };
          // nothing saved: the default is the vanilla track anyway
          if (p.calc) p = { ...p, calc: { ...p.calc, trackType: 'RAIL' } };
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
