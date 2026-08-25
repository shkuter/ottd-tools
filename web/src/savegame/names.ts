/**
 * Names the snapshot renders from seeds and string keys.
 *
 * Town names: the English Original generator ported from the game
 * (townname.cpp:247, MakeEnglishOriginalTownName) over the word tables the pipeline
 * extracts into town_names.json. Other generators fall back to null — the UI shows a
 * numbered stub in its own language.
 *
 * Nothing here reads the locale store: the language is an argument, and the module is
 * pulled in by the snapshot builder, which must stay free of app state.
 *
 * Station names: a suffix key resolved against the game's own strings
 * (data/station_names.json for English, i18n/stations.ru.json for Russian), so the same
 * station reads "Londworth Furnace" or "Londworth Печь" depending on the UI language.
 */

import townNamesJson from '../data/town_names.json';
import stationNamesEn from '../data/station_names.json';
import stationNamesRu from '../i18n/stations.ru.json';
import type { Locale } from '../state/localeStore';

const TABLES = (townNamesJson as { english_original: Record<string, string[]> }).english_original;

/** ReplaceEnglishWords(original=true): applied to the start of the name only. */
const REPLACEMENTS: readonly [string, string][] = [
  ['Ce', 'Ke'],
  ['Ci', 'Ki'],
  ['Cunt', 'East'],
  ['Slag', 'Pits'],
  ['Slut', 'Edin'],
  ['Drar', 'Quar'],
  ['Dreh', 'Bash'],
  ['Frar', 'Shor'],
  ['Grar', 'Aber'],
  ['Brar', 'Over'],
  ['Wrar', 'Inve'],
];

/** SeedChance (townname.cpp:165): 16 bits of the seed scaled into 0…count-1. */
function seedChance(shiftBy: number, count: number, seed: number): number {
  return (((seed >>> shiftBy) & 0xffff) * Math.min(count, 0xffff)) >>> 16;
}

function seedChanceBias(shiftBy: number, count: number, seed: number, bias: number): number {
  return seedChance(shiftBy, count + bias, seed) - bias;
}

/** The game's English Original town name for a saved seed. */
export function englishOriginalTownName(seed: number): string {
  let name = '';
  const first = seedChanceBias(0, TABLES['1'].length, seed, 50);
  if (first >= 0) name += TABLES['1'][first];
  name += TABLES['2'][seedChance(4, TABLES['2'].length, seed)];
  name += TABLES['3'][seedChance(7, TABLES['3'].length, seed)];
  name += TABLES['4'][seedChance(10, TABLES['4'].length, seed)];
  name += TABLES['5'][seedChance(13, TABLES['5'].length, seed)];
  const last = seedChanceBias(15, TABLES['6'].length, seed, 60);
  if (last >= 0) name += TABLES['6'][last];
  for (const [org, rep] of REPLACEMENTS) {
    if (name.startsWith(org)) name = rep + name.slice(org.length);
  }
  return name;
}

interface SuffixDictionaries {
  game: Record<string, string>;
  firs: Record<string, string>;
}

const SUFFIXES: Record<Locale, SuffixDictionaries> = {
  en: stationNamesEn as unknown as SuffixDictionaries,
  ru: stationNamesRu as unknown as SuffixDictionaries,
};

export interface StationNameParts {
  customName: string;
  suffixKey: string | null;
  /** What the game passes as the {NUM} of the name; see SnapshotStation.nameNumber. */
  nameNumber: number;
}

/**
 * Display name of a station: the custom string as-is, or the town name through the
 * suffix template of the given locale. A FIRS industry suffix joins with a space, the
 * way string(STR_STATION, town, suffix) does in the GRF.
 */
export function stationDisplayName(
  station: StationNameParts,
  townName: string,
  locale: Locale,
): string {
  if (station.customName !== '') return station.customName;
  const dicts = SUFFIXES[locale];
  if (station.suffixKey === null) return townName;
  const game = dicts.game[station.suffixKey];
  if (game !== undefined) {
    return game
      .replace('{TOWN}', townName)
      .replace('{NUM}', String(station.nameNumber))
      .trim();
  }
  const firs = dicts.firs[station.suffixKey];
  if (firs !== undefined) return `${townName} ${firs}`;
  return townName;
}
