/**
 * Turns a parsed savegame into what the calculator would set, without setting anything:
 * the UI shows this to the player and applies it only on confirmation.
 */

import { economies } from '../dataset';
import type { CalcSettings, GameSettings } from '../engine/settings';
import type { SavedInflation } from './extract/ecmy';
import type { SavedGrf } from './extract/ngrf';
import { gameSettingsFrom, INFO_SETTINGS, type InfoSetting } from './mapping';
import type { RawSavegame } from './read';
import { knownGrf, multiplierFromParam, type BaseCostParams, type GrfRole } from './registry';
import type { FieldValue } from './values';

/** One setting the game has but the calculator does not model. */
export interface InfoValue {
  setting: InfoSetting;
  value: number;
}

export interface SavegameImport {
  jgrpp: boolean;
  /** Game settings the savegame states; anything it does not state is absent. */
  game: Partial<GameSettings>;
  calc: Partial<CalcSettings>;
  /** FIRS economy the game runs, when a known FIRS set is active. */
  economyId?: string;
  /** Settings without a model in the calculator, shown for information only. */
  info: InfoValue[];
  /** Inflation the game has accumulated so far, shown for information only. */
  inflation?: SavedInflation;
  /** Sets recognised as changing base costs whose parameters have never been read. */
  unreadBaseCostSets: string[];
}

export function buildImport(raw: RawSavegame): SavegameImport {
  const { settings, grfs } = raw;

  const game: Partial<GameSettings> = {
    jgrpp: raw.jgrpp,
    ...gameSettingsFrom(settings),
    ...grfSettings(grfs),
  };
  const calc: Partial<CalcSettings> = {};

  if (raw.year != null) calc.priceYear = raw.year;

  const capacity = paramOf(grfs, (g) => g.capacityParam);
  if (capacity != null) calc.capacityIndex = capacity;

  const economy = paramOf(grfs, (g) => g.economyParam);

  return {
    jgrpp: raw.jgrpp,
    game,
    calc,
    economyId: economy == null ? undefined : economyIdByMenuIndex(economy),
    info: informationalValues(settings),
    inflation: raw.inflation,
    unreadBaseCostSets: grfs
      .map((grf) => knownGrf(grf.grfid))
      .filter((known) => known?.role === 'baseCosts' && !known.baseCosts)
      .map((known) => known!.labelKey),
  };
}

/** Which sets are loaded, and what their parameters say about prices. */
function grfSettings(grfs: readonly SavedGrf[]): Partial<GameSettings> {
  const roles = new Set(
    grfs
      .map((grf) => knownGrf(grf.grfid)?.role)
      .filter((role): role is GrfRole => role != null),
  );
  const patch: Partial<GameSettings> = {
    ironHorse: roles.has('trains'),
    firs: roles.has('industries'),
    basecostGrf: roles.has('baseCosts'),
  };

  for (const grf of grfs) {
    const params = knownGrf(grf.grfid)?.baseCosts;
    if (params) Object.assign(patch, baseCostMultipliers(grf, params));
  }
  return patch;
}

function baseCostMultipliers(grf: SavedGrf, params: BaseCostParams): Partial<GameSettings> {
  const at = (index: number): number | undefined => {
    const value = grf.params[index];
    return value == null ? undefined : multiplierFromParam(value);
  };
  const patch: Partial<GameSettings> = {};
  const locomotive = at(params.locomotive);
  if (locomotive != null) patch.basecostLocomotive = locomotive;
  const wagon = at(params.wagon);
  if (wagon != null) patch.basecostWagon = wagon;
  const steam = at(params.runningSteam);
  if (steam != null) patch.basecostTrainRunningSteam = steam;
  const diesel = at(params.runningDiesel);
  if (diesel != null) patch.basecostTrainRunningDiesel = diesel;
  const electric = at(params.runningElectric);
  if (electric != null) patch.basecostTrainRunningElectric = electric;
  return patch;
}

function paramOf(
  grfs: readonly SavedGrf[],
  pick: (known: NonNullable<ReturnType<typeof knownGrf>>) => number | undefined,
): number | undefined {
  for (const grf of grfs) {
    const known = knownGrf(grf.grfid);
    if (!known) continue;
    const index = pick(known);
    if (index == null) continue;
    const value = grf.params[index];
    if (value != null) return value;
  }
  return undefined;
}

/**
 * FIRS numbers its economies by their position in the parameter menu, not by their internal
 * id (src/grf/templates/parameters.pynml remaps one to the other). The dataset lists them in
 * that same menu order, so the parameter indexes straight into it.
 */
function economyIdByMenuIndex(index: number): string | undefined {
  return economies[index]?.id;
}

function informationalValues(saved: ReadonlyMap<string, FieldValue>): InfoValue[] {
  const out: InfoValue[] = [];
  for (const setting of INFO_SETTINGS) {
    const value = saved.get(setting.name);
    if (typeof value === 'number') out.push({ setting, value });
  }
  return out;
}
