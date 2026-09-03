/**
 * What each setting is called in the interface.
 *
 * The dictionaries name settings after the game's own wording, which is not always the name
 * of the field holding them (`dayLengthFactor` is "Economy speed reduction factor",
 * `settings.dayLength`). Deriving the key from the field name therefore breaks on about a
 * third of them, and a missing key renders as itself — the user would read
 * "settings.dayLengthFactor". The map is the one place that correspondence lives, and
 * `__tests__/game.test.ts` fails when a field or a key is missing from it.
 */

import type { CalcSettings, GameSettings } from '../../engine/settings';

type SettingKey = keyof GameSettings | keyof CalcSettings;

export const SETTING_LABEL_KEYS: Record<SettingKey, string> = {
  // game settings
  jgrpp: 'settings.jgrpp',
  trainSet: 'settings.trainSet',
  firs: 'settings.firs',
  firsEconomy: 'settings.firsEconomy',
  freightTrains: 'settings.freightTrains',
  slopeSteepness: 'settings.slopeSteepness',
  wagonSpeedLimits: 'settings.wagonSpeedLimits',
  cargoAgingRate: 'settings.cargoAgingRate',
  dayLengthFactor: 'settings.dayLength',
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
  costsWhenStopped: 'settings.costsWhenStopped',
  inflationFixedDates: 'settings.inflationFixedDates',
  infrastructureMaintenance: 'settings.infrastructureMaintenance',
  linearMaintenance: 'settings.linearMaintenance',
  vehicleIntroRandomisation: 'settings.introRandomisation',
  neverExpireVehicles: 'settings.neverExpire',
  // calculator settings
  // the settings page labels it from the consist section, and so does this
  capacityIndex: 'consist.capacityParam',
  hillTiles: 'settings.hillTiles',
  trackType: 'settings.trackType',
  priceYear: 'settings.priceYear',
};
