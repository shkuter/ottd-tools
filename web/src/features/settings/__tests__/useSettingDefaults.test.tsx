/**
 * Every setting of the game, of the calculation and of the display is marked once it differs
 * from its default and resets by itself — walked key by key over the defaults, the way
 * settings-effect.test.ts walks them, so a setting added without a mark fails here. "Changed" is
 * read off what a row shows, against the calculator's default, and a reset writes that default
 * back through the ordinary setter.
 *
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SettingsPage from '../SettingsPage';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
} from '../../../engine/settings';
import {
  DEFAULT_CURRENCY,
  DEFAULT_SPEED_UNIT,
  useSettingsStore,
  type DisplaySettings,
} from '../../../state/settingsStore';
import { useLocaleStore } from '../../../state/localeStore';
import { t } from '../../../i18n';
import { useSettingDefaults } from '../useSettingDefaults';

const defaults = () => renderHook(() => useSettingDefaults());

function draw() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

/** The switches every other row hangs off, all on, so every row the tab has is drawn. */
const PARENTS: Partial<GameSettings> = {
  jgrpp: true,
  inflation: true,
  basecostGrf: true,
  trainSet: 'iron_horse',
  firs: true,
};

/** The caption of each setting's row: what its reset button is named after. */
const GAME_LABELS: Record<keyof GameSettings, string> = {
  jgrpp: 'settings.jgrpp',
  trainSet: 'settings.trainSet',
  firs: 'settings.firs',
  firsEconomy: 'settings.firsEconomy',
  freightTrains: 'settings.freightTrains',
  slopeSteepness: 'settings.slopeSteepness',
  wagonSpeedLimits: 'settings.wagonSpeedLimits',
  cargoAgingRate: 'settings.cargoAgingRate',
  dayLengthFactor: 'settings.dayLength',
  inflation: 'settings.inflation',
  inflationInterest: 'settings.interest',
  vehicleCosts: 'settings.vehicleCosts',
  constructionCost: 'settings.constructionCost',
  subsidyMultiplier: 'settings.subsidyMultiplier',
  accelerationModel: 'settings.accelModel',
  brakingModel: 'settings.brakingModel',
  trainAccBrakingPercent: 'settings.accBrakingPercent',
  gradualLoading: 'settings.gradualLoading',
  paymentAlgorithm: 'settings.paymentAlgorithm',
  timekeeping: 'settings.timekeeping',
  startingYear: 'settings.startingYear',
  basecostGrf: 'settings.basecostGrf',
  basecostLocomotive: 'settings.basecostLoco',
  basecostWagon: 'settings.basecostWagon',
  basecostTrainRunningSteam: 'settings.basecostRunningSteam',
  basecostTrainRunningDiesel: 'settings.basecostRunningDiesel',
  basecostTrainRunningElectric: 'settings.basecostRunningElectric',
  basecostInfrastructure: 'settings.basecostInfrastructure',
  basecostRailConstruction: 'settings.basecostRailConstruction',
  costsWhenStopped: 'settings.costsWhenStopped',
  inflationFixedDates: 'settings.inflationFixedDates',
  infrastructureMaintenance: 'settings.infrastructureMaintenance',
  linearMaintenance: 'settings.linearMaintenance',
  vehicleIntroRandomisation: 'settings.introRandomisation',
  neverExpireVehicles: 'settings.neverExpire',
};

const CALC_LABELS: Record<keyof CalcSettings, string> = {
  capacityIndex: 'consist.capacityParam',
  hillTiles: 'settings.hillTiles',
  trackType: 'settings.trackType',
  priceYear: 'settings.priceYear',
};

const DISPLAY_LABELS: Record<keyof DisplaySettings, string> = {
  currency: 'settings.currency',
  speedUnit: 'settings.speedUnit',
};

/** A value other than the default that the row offers: the other state, the next option, one more. */
const OTHER: { [K in keyof GameSettings]?: GameSettings[K] } & { [K in keyof CalcSettings]?: CalcSettings[K] } = {
  firsEconomy: 'BASIC_ARCTIC',
  accelerationModel: 'original',
  brakingModel: 'realistic',
  paymentAlgorithm: 'traditional',
  timekeeping: 'wallclock',
  basecostLocomotive: 2,
  basecostWagon: 2,
  basecostTrainRunningSteam: 2,
  basecostTrainRunningDiesel: 2,
  basecostTrainRunningElectric: 2,
  basecostInfrastructure: 2,
  basecostRailConstruction: 2,
  trackType: 'ELRL',
};

function otherThan<T>(key: string, value: T): T {
  if (key in PARENTS) return PARENTS[key as keyof GameSettings] as T;
  if (key in OTHER) return OTHER[key as keyof typeof OTHER] as T;
  if (typeof value === 'boolean') return !value as T;
  if (typeof value === 'number') return (value + 1) as T;
  throw new Error(`useSettingDefaults.test knows no value other than the default for ${key}`);
}

const resetButtons = (label: string) =>
  screen.queryAllByRole('button', { name: t('settings.resetOne', { name: t(label) }) });

beforeEach(() => {
  useSettingsStore.getState().reset();
  useLocaleStore.getState().setLocale('en');
});
afterEach(cleanup);

describe('the mark and the reset of each setting', () => {
  it.each(Object.keys(DEFAULT_GAME_SETTINGS) as (keyof GameSettings)[])('game setting %s', (key) => {
    const value = otherThan(key, DEFAULT_GAME_SETTINGS[key]);
    useSettingsStore.setState({ game: { ...DEFAULT_GAME_SETTINGS, ...PARENTS, [key]: value } });
    draw();
    // the parents that are on carry buttons of their own: counted by the name, not all of them
    const buttons = resetButtons(GAME_LABELS[key]);
    expect(buttons, `one reset for ${key}`).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(useSettingsStore.getState().game[key]).toBe(DEFAULT_GAME_SETTINGS[key]);
  });

  it.each(Object.keys(DEFAULT_CALC_SETTINGS) as (keyof CalcSettings)[])('calculation setting %s', (key) => {
    const value = otherThan(key, DEFAULT_CALC_SETTINGS[key]);
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, ...PARENTS },
      calc: { ...DEFAULT_CALC_SETTINGS, [key]: value },
    });
    draw();
    const buttons = resetButtons(CALC_LABELS[key]);
    expect(buttons, `one reset for ${key}`).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(useSettingsStore.getState().calc[key]).toBe(DEFAULT_CALC_SETTINGS[key]);
  });

  it.each([
    ['currency', 'RUB', DEFAULT_CURRENCY],
    ['speedUnit', 'imperial', DEFAULT_SPEED_UNIT],
  ] as const)('display setting %s', (key, value, fallback) => {
    useSettingsStore.setState({ [key]: value });
    draw();
    const buttons = resetButtons(DISPLAY_LABELS[key]);
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(useSettingsStore.getState()[key]).toBe(fallback);
  });

  it('leaves a row with the default value unmarked', () => {
    draw();
    expect(document.querySelectorAll('.setting-changed')).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /^Reset "/ })).toHaveLength(0);
  });

  it('never marks the language, whichever is chosen', () => {
    useLocaleStore.getState().setLocale('ru');
    draw();
    const name = t('settings.resetOne', { name: t('settings.language') });
    expect(screen.queryByRole('button', { name })).toBeNull();
    useLocaleStore.getState().setLocale('en');
  });

  it('does not mark a patchpack setting while the patchpack is off, and keeps its value', () => {
    useSettingsStore.setState({ game: { ...DEFAULT_GAME_SETTINGS, dayLengthFactor: 5 } });
    draw();
    expect(resetButtons(GAME_LABELS.dayLengthFactor)).toHaveLength(0);
    expect(useSettingsStore.getState().game.dayLengthFactor).toBe(5);
    act(() => useSettingsStore.getState().setGame('jgrpp', true));
    expect(resetButtons(GAME_LABELS.dayLengthFactor)).toHaveLength(1);
    expect(useSettingsStore.getState().game.dayLengthFactor).toBe(5);
  });

  it('resets one Base Costs multiplier alone, and the set without touching its multipliers', () => {
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, basecostGrf: true, basecostLocomotive: 2, basecostWagon: 4 },
    });
    draw();
    fireEvent.click(resetButtons(GAME_LABELS.basecostLocomotive)[0]);
    let game = useSettingsStore.getState().game;
    expect(game.basecostLocomotive).toBe(1);
    expect(game.basecostWagon).toBe(4);
    expect(game.basecostGrf).toBe(true);

    fireEvent.click(resetButtons(GAME_LABELS.basecostGrf)[0]);
    game = useSettingsStore.getState().game;
    expect(game.basecostGrf).toBe(false);
    expect(game.basecostWagon).toBe(4);
  });

  it('measures an imported year against the default, not against the import', () => {
    useSettingsStore.getState().applySettings({ startingYear: 1990 }, {});
    draw();
    const buttons = resetButtons(GAME_LABELS.startingYear);
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(useSettingsStore.getState().game.startingYear).toBe(1950);
  });
});

describe('the default of a setting', () => {
  it('marks running costs above the default and puts them back', () => {
    useSettingsStore.getState().setGame('vehicleCosts', 1);
    const { result } = defaults();
    expect(result.current.game('vehicleCosts').changed).toBe(true);
    act(() => result.current.game('vehicleCosts').reset());
    expect(useSettingsStore.getState().game.vehicleCosts).toBe(0);
    expect(result.current.game('vehicleCosts').changed).toBe(false);
  });

  it('does not mark a track the set does not offer, which shows as the default track', () => {
    // Iron Horse has no maglev: the stored label falls back to the set's first track, RAIL,
    // which is what the default shows as well
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' },
      calc: { ...DEFAULT_CALC_SETTINGS, trackType: 'MGLV' },
    });
    const { result } = defaults();
    expect(result.current.calc('trackType').changed).toBe(false);
    act(() => useSettingsStore.getState().setCalc('trackType', 'ELRL'));
    expect(result.current.calc('trackType').changed).toBe(true);
  });

  it('does not mark an economy the data has lost, which shows as the default economy', () => {
    useSettingsStore.setState({ game: { ...DEFAULT_GAME_SETTINGS, firs: true, firsEconomy: 'NO_SUCH_ECONOMY' } });
    const { result } = defaults();
    expect(result.current.game('firsEconomy').changed).toBe(false);
    act(() => useSettingsStore.getState().setGame('firsEconomy', 'BASIC_ARCTIC'));
    expect(result.current.game('firsEconomy').changed).toBe(true);
  });

  it('marks and resets the currency and the speed units as well', () => {
    useSettingsStore.getState().setCurrency('RUB');
    useSettingsStore.getState().setSpeedUnit('imperial');
    const { result } = defaults();
    expect(result.current.display('currency').changed).toBe(true);
    expect(result.current.display('speedUnit').changed).toBe(true);
    act(() => result.current.display('currency').reset());
    expect(useSettingsStore.getState().currency).toBe(DEFAULT_CURRENCY);
    // one reset puts back one setting
    expect(useSettingsStore.getState().speedUnit).toBe('imperial');
  });
});
