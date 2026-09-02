/**
 * Turns a parsed savegame into what the calculator would set, without setting anything:
 * the UI shows this to the player and applies it only on confirmation.
 */

import { economies } from '../dataset';
import type { Economy } from '../types';
import type { CalcSettings, GameSettings } from '../engine/settings';
import type { DisplaySettings } from '../state/settingsStore';
import type { SavedInflation } from './extract/ecmy';
import type { SavedGrf } from './extract/ngrf';
import {
  displaySettingsFrom, gameSettingsFrom, INFO_SETTINGS, type InfoSetting,
} from './mapping';
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
  /**
   * Game settings the savegame states. A setting it does not state is absent — except where
   * absence is an answer of its own (a game not on JGRPP grows upkeep the vanilla way).
   */
  game: Partial<GameSettings>;
  calc: Partial<CalcSettings>;
  /** How the game shows its numbers: currency and speed units it was played with. */
  display: Partial<DisplaySettings>;
  /** Settings without a model in the calculator, shown for information only. */
  info: InfoValue[];
  /** Inflation the game has accumulated so far, shown for information only. */
  inflation?: SavedInflation;
  /** Sets recognised as changing base costs whose parameters have never been read. */
  unreadBaseCostSets: string[];
  /**
   * Label keys of the NewGRF sets recognised in the file, each named once. Shown to the
   * player above the differences, so what the calculator concluded about the game — the
   * roster above all — is visible rather than guessed at.
   */
  recognisedSets: string[];
}

export function buildImport(raw: RawSavegame): SavegameImport {
  const { settings, grfs } = raw;

  const game: Partial<GameSettings> = {
    jgrpp: raw.jgrpp,
    ...gameSettingsFrom(settings),
    ...grfSettings(grfs),
  };
  const calc: Partial<CalcSettings> = {};
  const display = displaySettingsFrom(settings);

  if (raw.year != null) calc.priceYear = raw.year;

  const capacity = paramOf(grfs, (g) => g.capacityParam);
  if (capacity != null) calc.capacityIndex = capacity;

  const economy = economyFromGrfs(grfs);
  if (economy) game.firsEconomy = economy.id;

  return {
    jgrpp: raw.jgrpp,
    game,
    calc,
    display,
    info: informationalValues(settings),
    inflation: raw.inflation,
    unreadBaseCostSets: grfs
      .map((grf) => knownGrf(grf.grfid))
      .filter((known) => known?.role === 'baseCosts' && !known.baseCosts)
      .map((known) => known!.labelKey),
    recognisedSets: recognisedSets(grfs),
  };
}

/**
 * Names of the sets the file's GRF list is recognised as, each set once however many
 * files it is spread over, in the order the game loads them.
 */
function recognisedSets(grfs: readonly SavedGrf[]): string[] {
  const seen: string[] = [];
  for (const grf of grfs) {
    const known = knownGrf(grf.grfid);
    if (known && !seen.includes(known.labelKey)) seen.push(known.labelKey);
  }
  return seen;
}

/** Which sets are loaded, and what their parameters say about prices. */
function grfSettings(grfs: readonly SavedGrf[]): Partial<GameSettings> {
  const known = grfs.map((grf) => knownGrf(grf.grfid));
  const roles = new Set(
    known.map((entry) => entry?.role).filter((role): role is GrfRole => role != null),
  );
  const patch: Partial<GameSettings> = {
    // the roster comes from the recognised entry rather than from the bare role: with
    // three sets "a train set is loaded" no longer says which one. A file naming none
    // is a vanilla game — a set absent from the save is as much a fact about it as one
    // present (spec savegame-import).
    trainSet: known.find((entry) => entry?.trainSet)?.trainSet ?? 'vanilla',
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
 * The economy a savegame's GRF parameters select, or undefined when no set states one.
 * Shared with the snapshot so both read the same parameter of the same set.
 *
 * FIRS numbers its economies by their position in the parameter menu, not by their internal
 * id (src/grf/templates/parameters.pynml remaps one to the other); the dataset lists them in
 * that same menu order, so the parameter indexes straight into it.
 */
export function economyFromGrfs(grfs: readonly SavedGrf[]): Economy | undefined {
  const index = paramOf(grfs, (g) => g.economyParam);
  return index === undefined ? undefined : economies[index];
}

function informationalValues(saved: ReadonlyMap<string, FieldValue>): InfoValue[] {
  const out: InfoValue[] = [];
  for (const setting of INFO_SETTINGS) {
    const value = saved.get(setting.name);
    if (typeof value === 'number') out.push({ setting, value });
  }
  return out;
}
