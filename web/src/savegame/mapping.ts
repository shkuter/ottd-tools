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
import type { FieldValue } from './values';

type Patch = Partial<GameSettings>;

interface SettingSource {
  /** Name of the setting as the game saves it. */
  name: string;
  read: (value: number) => Patch | undefined;
}

const clampChoice = <T extends number>(value: number, max: number): T =>
  Math.min(Math.max(Math.round(value), 0), max) as T;

export const GAME_SETTING_SOURCES: readonly SettingSource[] = [
  { name: 'vehicle.freight_trains', read: (v) => ({ freightTrains: v }) },
  { name: 'vehicle.train_slope_steepness', read: (v) => ({ slopeSteepness: v }) },
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
    name: 'vehicle.vehicle_intro_randomisation',
    read: (v) => ({ vehicleIntroRandomisation: v !== 0 }),
  },
];

/** Builds the game settings a savegame implies, leaving out anything it does not state. */
export function gameSettingsFrom(saved: ReadonlyMap<string, FieldValue>): Patch {
  let patch: Patch = {};
  for (const source of GAME_SETTING_SOURCES) {
    const value = saved.get(source.name);
    if (typeof value !== 'number') continue;
    patch = { ...patch, ...source.read(value) };
  }
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
  { name: 'vehicle.wagon_speed_limits', labelKey: 'savegame.info.wagonSpeedLimits', kind: 'flag' },
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
    name: 'economy.infrastructure_maintenance',
    labelKey: 'savegame.info.infrastructureMaintenance',
    kind: 'flag',
  },
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
  {
    name: 'vehicle.never_expire_vehicles',
    labelKey: 'savegame.info.neverExpireVehicles',
    kind: 'flag',
  },
  { name: 'vehicle.extend_vehicle_life', labelKey: 'savegame.info.extendVehicleLife', kind: 'number' },
  { name: 'station.station_spread', labelKey: 'savegame.info.stationSpread', kind: 'number' },
  { name: 'difficulty.max_loan', labelKey: 'savegame.info.maxLoan', kind: 'number' },
  { name: 'difficulty.industry_density', labelKey: 'savegame.info.industryDensity', kind: 'number' },
];
