/**
 * Maps saved settings onto the calculator's own.
 *
 * The table is keyed by the setting name the game writes into PATS, not by field order, so a
 * new game version that adds or drops settings changes nothing here. A name the savegame does
 * not carry is not an error: the setting may belong to a later version or to the patchpack.
 *
 * Enum values follow the game's headers: TKU_CALENDAR = 0 (settings_type.h:77),
 * AM_ORIGINAL = 0 (vehicle_type.h:69), CPA_TRADITIONAL = 0 (JGRPP economy_type.h:235).
 */

import type { GameSettings } from '../engine/settings';
import type { CurrencyCode, DisplaySettings } from '../state/settingsStore';
import type { FieldValue } from './values';

type Patch = Partial<GameSettings>;

interface SettingSource {
  /** Name of the setting as the game saves it. */
  name: string;
  read: (value: number) => Patch | undefined;
  /**
   * What the absence of this setting says. A game that has no such switch is not a game the
   * calculator knows nothing about: it is one that behaves the way the switch off behaves,
   * and leaving the field out of the patch would keep another game's answer instead.
   */
  whenAbsent?: Patch;
}

const clampChoice = <T extends number>(value: number, max: number): T =>
  Math.min(Math.max(Math.round(value), 0), max) as T;

export const GAME_SETTING_SOURCES: readonly SettingSource[] = [
  { name: 'vehicle.freight_trains', read: (v) => ({ freightTrains: v }) },
  { name: 'vehicle.train_slope_steepness', read: (v) => ({ slopeSteepness: v }) },
  { name: 'vehicle.wagon_speed_limits', read: (v) => ({ wagonSpeedLimits: v !== 0 }) },
  { name: 'economy.cargo_aging_rate', read: (v) => ({ cargoAgingRate: v }) },
  { name: 'economy.day_length_factor', read: (v) => ({ dayLengthFactor: v }) },
  { name: 'economy.timekeeping_units', read: (v) => ({ timekeeping: v === 1 ? 'wallclock' : 'calendar' }) },
  { name: 'game_creation.starting_year', read: (v) => ({ startingYear: v }) },
  { name: 'economy.inflation', read: (v) => ({ inflation: v !== 0 }) },
  { name: 'difficulty.initial_interest', read: (v) => ({ inflationInterest: v }) },
  { name: 'difficulty.vehicle_costs', read: (v) => ({ vehicleCosts: clampChoice(v, 2) }) },
  { name: 'difficulty.construction_cost', read: (v) => ({ constructionCost: clampChoice(v, 2) }) },
  { name: 'difficulty.subsidy_multiplier', read: (v) => ({ subsidyMultiplier: clampChoice(v, 3) }) },
  {
    name: 'vehicle.train_acceleration_model',
    read: (v) => ({ accelerationModel: v === 1 ? 'realistic' : 'original' }),
  },
  { name: 'order.gradual_loading', read: (v) => ({ gradualLoading: v !== 0 }) },
  {
    name: 'economy.payment_algorithm',
    read: (v) => ({ paymentAlgorithm: v === 1 ? 'modern' : 'traditional' }),
  },
  { name: 'difficulty.vehicle_costs_when_stopped', read: (v) => ({ costsWhenStopped: v }) },
  { name: 'economy.inflation_fixed_dates', read: (v) => ({ inflationFixedDates: v !== 0 }) },
  {
    name: 'economy.infrastructure_maintenance',
    read: (v) => ({ infrastructureMaintenance: v !== 0 }),
    // saved from version 166 on; older games charged nothing for infrastructure
    whenAbsent: { infrastructureMaintenance: false },
  },
  {
    name: 'economy.linear_maintenance',
    read: (v) => ({ linearMaintenance: v !== 0 }),
    // JGRPP-only: a game not on the patchpack grows upkeep the vanilla way
    whenAbsent: { linearMaintenance: false },
  },
  {
    name: 'vehicle.vehicle_intro_randomisation',
    read: (v) => ({ vehicleIntroRandomisation: v !== 0 }),
  },
  { name: 'vehicle.never_expire_vehicles', read: (v) => ({ neverExpireVehicles: v !== 0 }) },
];

/**
 * Builds the game settings a savegame implies. A setting the file does not state is left out,
 * unless its absence is itself an answer — see `whenAbsent`.
 */
export function gameSettingsFrom(saved: ReadonlyMap<string, FieldValue>): Patch {
  let patch: Patch = {};
  for (const source of GAME_SETTING_SOURCES) {
    const value = saved.get(source.name);
    if (typeof value !== 'number') {
      patch = { ...patch, ...(source.whenAbsent ?? {}) };
      continue;
    }
    patch = { ...patch, ...source.read(value) };
  }
  return patch;
}

/**
 * Currencies by the index the game stores in `locale.currency` — its own enum order
 * (currency.h `CURRENCY_*`). Only the ones the calculator offers are listed; a game on
 * any other currency keeps whatever the user picked, since the figures would be in a
 * unit the calculator cannot state.
 *
 * The two roubles are the reason this is imported at all: RUR (21) converts at 50 to the
 * pound and RUB (34) at 80, so reading a game played on RUR as RUB overstates every sum
 * by 1.6.
 */
const CURRENCY_BY_INDEX: Readonly<Record<number, CurrencyCode>> = {
  0: 'GBP',
  1: 'USD',
  2: 'EUR',
  3: 'JPY',
  21: 'RUR',
  34: 'RUB',
};

/**
 * How the game shows its numbers. Not a matter of calculation — the engine works in pounds
 * and the game's internal speed unit — but of whether what the player reads here matches
 * what they read there, so it travels with the rest of the settings.
 */
export function displaySettingsFrom(
  saved: ReadonlyMap<string, FieldValue>,
): Partial<DisplaySettings> {
  const patch: Partial<DisplaySettings> = {};
  const currency = saved.get('locale.currency');
  if (typeof currency === 'number' && CURRENCY_BY_INDEX[currency]) {
    patch.currency = CURRENCY_BY_INDEX[currency];
  }
  // locale.units_velocity: 0 imperial, 1 metric, 2 SI, 3 gameunits, 4 knots (settings.ini).
  // Only the two the calculator shows are read; the rest leave the choice alone.
  const velocity = saved.get('locale.units_velocity');
  if (velocity === 0) patch.speedUnit = 'imperial';
  if (velocity === 1) patch.speedUnit = 'metric';
  return patch;
}

/** How an informational value is shown: as a flag, a plain number, a percentage or a choice. */
export type InfoKind = 'flag' | 'number' | 'percent' | 'choice';

export interface InfoSetting {
  name: string;
  labelKey: string;
  kind: InfoKind;
  /** For choices: one i18n key per value, indexed by the saved number. */
  choiceKeys?: readonly string[];
}

/**
 * Settings that change the game but have no model in the calculator. They are shown with
 * their value so the player can see what the calculator is not accounting for.
 */
export const INFO_SETTINGS: readonly InfoSetting[] = [
  { name: 'vehicle.max_train_length', labelKey: 'savegame.info.maxTrainLength', kind: 'number' },
  {
    name: 'vehicle.train_braking_model',
    labelKey: 'savegame.info.trainBrakingModel',
    kind: 'choice',
    choiceKeys: ['savegame.info.brakingOriginal', 'savegame.info.brakingRealistic'],
  },
  {
    name: 'order.station_length_loading_penalty',
    labelKey: 'savegame.info.stationLengthPenalty',
    kind: 'flag',
  },
  { name: 'order.improved_load', labelKey: 'savegame.info.improvedLoad', kind: 'flag' },
  { name: 'economy.feeder_payment_share', labelKey: 'savegame.info.feederShare', kind: 'percent' },
  {
    name: 'difficulty.vehicle_breakdowns',
    labelKey: 'savegame.info.vehicleBreakdowns',
    kind: 'choice',
    choiceKeys: [
      'savegame.info.breakdownsNone',
      'savegame.info.breakdownsReduced',
      'savegame.info.breakdownsNormal',
    ],
  },
  { name: 'difficulty.subsidy_duration', labelKey: 'savegame.info.subsidyDuration', kind: 'number' },
  {
    name: 'economy.type',
    labelKey: 'savegame.info.economyType',
    kind: 'choice',
    choiceKeys: [
      'savegame.info.economyOriginal',
      'savegame.info.economySmooth',
      'savegame.info.economyFrozen',
    ],
  },
  { name: 'economy.town_cargo_scale', labelKey: 'savegame.info.townCargoScale', kind: 'percent' },
  {
    name: 'economy.industry_cargo_scale',
    labelKey: 'savegame.info.industryCargoScale',
    kind: 'percent',
  },
  { name: 'vehicle.extend_vehicle_life', labelKey: 'savegame.info.extendVehicleLife', kind: 'number' },
  { name: 'station.station_spread', labelKey: 'savegame.info.stationSpread', kind: 'number' },
  { name: 'difficulty.max_loan', labelKey: 'savegame.info.maxLoan', kind: 'number' },
  { name: 'difficulty.industry_density', labelKey: 'savegame.info.industryDensity', kind: 'number' },
];
