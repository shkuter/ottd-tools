/**
 * Compares the settings a savegame implies with the ones in use.
 *
 * Values are rendered the same way the settings screen renders them, so the player compares
 * what they see there against what the save says — not raw numbers from the file.
 */

import { economyById } from '../dataset';
import { t } from '../i18n';
import { trainSetName } from '../i18n/names';
import type { CalcSettings, GameSettings, TrainSet } from '../engine/settings';
import { currencyLabel } from '../components/format';
import type { CurrencyCode, DisplaySettings } from '../state/settingsStore';
import type { SavedInflation } from './extract/ecmy';
import type { InfoValue, SavegameImport } from './import';

export interface SettingChange {
  /** Label of the setting, already translated. */
  label: string;
  current: string;
  incoming: string;
}

type Formatter = (value: never) => string;

interface Described<T> {
  labelKey: string;
  format?: (value: T[keyof T]) => string;
}

const onOff = (value: unknown): string => t(value ? 'settings.on' : 'settings.off');
const difficulty = (value: unknown): string =>
  t(value === 0 ? 'settings.low' : value === 1 ? 'settings.medium' : 'settings.high');
const multiplier = (value: unknown): string => `×${value}`;

/** Order follows the settings screen so the list reads top to bottom the same way. */
const GAME_LABELS: Partial<Record<keyof GameSettings, Described<GameSettings>>> = {
  jgrpp: { labelKey: 'settings.jgrpp', format: onOff },
  trainSet: {
    labelKey: 'settings.trainSet',
    format: (v) => trainSetName(v as TrainSet),
  },
  firs: { labelKey: 'settings.firs', format: onOff },
  firsEconomy: {
    labelKey: 'settings.firsEconomy',
    format: (v) => economyById.get(v as string)?.name ?? String(v),
  },
  freightTrains: { labelKey: 'settings.freightTrains' },
  slopeSteepness: { labelKey: 'settings.slopeSteepness' },
  cargoAgingRate: { labelKey: 'settings.cargoAgingRate' },
  dayLengthFactor: { labelKey: 'settings.dayLength' },
  timekeeping: {
    labelKey: 'settings.timekeeping',
    format: (v) => t(v === 'wallclock' ? 'settings.wallclock' : 'settings.calendar'),
  },
  startingYear: { labelKey: 'settings.startingYear' },
  inflation: { labelKey: 'settings.inflation', format: onOff },
  inflationInterest: { labelKey: 'settings.interest' },
  inflationFixedDates: { labelKey: 'settings.inflationFixedDates', format: onOff },
  vehicleCosts: { labelKey: 'settings.vehicleCosts', format: difficulty },
  constructionCost: { labelKey: 'settings.constructionCost', format: difficulty },
  subsidyMultiplier: {
    labelKey: 'settings.subsidyMultiplier',
    format: (v) => (v === 0 ? '×1.5' : v === 1 ? '×2' : v === 2 ? '×3' : '×4'),
  },
  accelerationModel: {
    labelKey: 'settings.accelModel',
    format: (v) => t(v === 'realistic' ? 'settings.accelRealistic' : 'settings.accelOriginal'),
  },
  gradualLoading: { labelKey: 'settings.gradualLoading', format: onOff },
  paymentAlgorithm: {
    labelKey: 'settings.paymentAlgorithm',
    format: (v) => t(v === 'modern' ? 'settings.paymentModern' : 'settings.paymentTraditional'),
  },
  costsWhenStopped: { labelKey: 'settings.costsWhenStopped' },
  vehicleIntroRandomisation: { labelKey: 'settings.introRandomisation', format: onOff },
  basecostGrf: { labelKey: 'settings.basecostGrf', format: onOff },
  basecostLocomotive: { labelKey: 'settings.basecostLoco', format: multiplier },
  basecostWagon: { labelKey: 'settings.basecostWagon', format: multiplier },
  basecostTrainRunningSteam: { labelKey: 'settings.basecostRunningSteam', format: multiplier },
  basecostTrainRunningDiesel: { labelKey: 'settings.basecostRunningDiesel', format: multiplier },
  basecostTrainRunningElectric: {
    labelKey: 'settings.basecostRunningElectric',
    format: multiplier,
  },
};

const CALC_LABELS: Partial<Record<keyof CalcSettings, Described<CalcSettings>>> = {
  priceYear: { labelKey: 'settings.priceYear' },
  capacityIndex: { labelKey: 'consist.capacityParam' },
};

export interface ImportDiff {
  game: SettingChange[];
  calc: SettingChange[];
  /** Currency and speed units the game was played with, when they differ from the current. */
  display: SettingChange[];
  info: InfoValue[];
  /** Inflation the game has accumulated, shown next to the informational settings. */
  inflation?: SavedInflation;
  unreadBaseCostSets: string[];
  /** Label keys of the NewGRF sets recognised in the file, named above the changes. */
  recognisedSets: string[];
  /** True when nothing the savegame states differs from the current settings. */
  identical: boolean;
}

/** Order follows the Display section of the settings screen. */
const DISPLAY_LABELS: Partial<Record<keyof DisplaySettings, Described<DisplaySettings>>> = {
  currency: {
    labelKey: 'settings.currency',
    // named the same way the settings screen names it, rate included: the rate is what
    // makes two currencies differ, and reading a game played on one as the other
    // silently rescales every sum
    format: (v) => currencyLabel(v as CurrencyCode),
  },
  speedUnit: {
    labelKey: 'settings.speedUnit',
    format: (v) => t(v === 'imperial' ? 'settings.speedUnit.imperial' : 'settings.speedUnit.metric'),
  },
};

export function diffImport(
  proposal: SavegameImport,
  game: GameSettings,
  calc: CalcSettings,
  // required, unlike an optional argument that could quietly omit a group: applying an
  // import carries the display settings whether or not the caller asked to see them
  display: DisplaySettings,
): ImportDiff {
  const gameChanges = changesOf(proposal.game, game, GAME_LABELS);
  const calcChanges = changesOf(proposal.calc, calc, CALC_LABELS);
  const displayChanges = changesOf(proposal.display, display, DISPLAY_LABELS);

  return {
    game: gameChanges,
    calc: calcChanges,
    display: displayChanges,
    info: proposal.info,
    inflation: proposal.inflation,
    unreadBaseCostSets: proposal.unreadBaseCostSets,
    recognisedSets: proposal.recognisedSets,
    identical:
      gameChanges.length === 0 && calcChanges.length === 0 && displayChanges.length === 0,
  };
}

function changesOf<T extends object>(
  incoming: Partial<T>,
  current: T,
  labels: Partial<Record<keyof T, Described<T>>>,
): SettingChange[] {
  const out: SettingChange[] = [];
  for (const key of Object.keys(labels) as (keyof T)[]) {
    const described = labels[key];
    const value = incoming[key];
    if (!described || value === undefined || value === current[key]) continue;
    const format = (described.format ?? String) as Formatter;
    out.push({
      label: t(described.labelKey),
      current: format(current[key] as never),
      incoming: format(value as never),
    });
  }
  return out;
}
