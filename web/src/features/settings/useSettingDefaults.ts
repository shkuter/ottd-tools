import { activeEconomy, activeRailtype } from '../../dataset';
import type { SettingDefault } from '../../components/SettingRow';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
} from '../../engine/settings';
import {
  DEFAULT_CURRENCY,
  DEFAULT_SPEED_UNIT,
  useSettingsStore,
  type DisplaySettings,
} from '../../state/settingsStore';

type Store = ReturnType<typeof useSettingsStore.getState>;

const DISPLAY_DEFAULTS: DisplaySettings = { currency: DEFAULT_CURRENCY, speedUnit: DEFAULT_SPEED_UNIT };

/*
 * "Changed" compares what the row shows, not what is stored: an economy the data lost reads
 * back as the default one, and a track the set does not offer as the set's first — a mark on
 * a row that shows the default would point at nothing. Everything else is a primitive and is
 * compared as it is. A reset writes the default through the setter the row itself uses, so
 * it is saved and reaches the calculation exactly as typing the default in would.
 */

function gameDefault<K extends keyof GameSettings>(store: Store, key: K): SettingDefault {
  const { game, setGame } = store;
  const fallback = DEFAULT_GAME_SETTINGS[key];
  const changed =
    key === 'firsEconomy'
      ? activeEconomy(game).id !== activeEconomy({ ...game, firsEconomy: DEFAULT_GAME_SETTINGS.firsEconomy }).id
      : game[key] !== fallback;
  return { changed, reset: () => setGame(key, fallback) };
}

function calcDefault<K extends keyof CalcSettings>(store: Store, key: K): SettingDefault {
  const { game, calc, setCalc } = store;
  const fallback = DEFAULT_CALC_SETTINGS[key];
  const changed =
    key === 'trackType'
      ? activeRailtype(game, calc.trackType).label !== activeRailtype(game, DEFAULT_CALC_SETTINGS.trackType).label
      : calc[key] !== fallback;
  return { changed, reset: () => setCalc(key, fallback) };
}

/** The setter each display row writes through, keyed like the defaults. */
const DISPLAY_SETTERS: { [K in keyof DisplaySettings]: (store: Store, value: DisplaySettings[K]) => void } = {
  currency: (store, value) => store.setCurrency(value),
  speedUnit: (store, value) => store.setSpeedUnit(value),
};

function displayDefault<K extends keyof DisplaySettings>(store: Store, key: K): SettingDefault {
  const fallback = DISPLAY_DEFAULTS[key];
  return { changed: store[key] !== fallback, reset: () => DISPLAY_SETTERS[key](store, fallback) };
}

/**
 * The state of every setting against its default — game, calculation and display — for a page
 * that has a row for each: one subscription instead of one per row, and rows that come and go
 * with their parent switch call no hook of their own.
 */
export function useSettingDefaults() {
  const store = useSettingsStore();
  return {
    game: <K extends keyof GameSettings>(key: K) => gameDefault(store, key),
    calc: <K extends keyof CalcSettings>(key: K) => calcDefault(store, key),
    display: <K extends keyof DisplaySettings>(key: K) => displayDefault(store, key),
  };
}
