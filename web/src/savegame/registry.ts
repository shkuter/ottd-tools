import type { TrainSet } from '../engine/settings';
import xussrTrainsJson from '../data/xussr_trains.json';

/**
 * What the calculator knows about NewGRF sets it may meet in a savegame.
 *
 * The savegame stores a GRF id and the player's parameters, never the set itself, so meaning
 * has to come from here. Role and parameter map are separate on purpose: knowing that a set
 * changes base costs is cheap (its id), while knowing what its parameter 15 means requires
 * reading that exact version's Action 14. A set with a role but no map is reported to the
 * player instead of being silently guessed at.
 */

export type GrfRole = 'trains' | 'industries' | 'baseCosts';

export interface KnownGrf {
  grfid: number;
  role: GrfRole;
  labelKey: string;
  /**
   * Which train set this entry belongs to. The role alone stopped being enough once
   * there was more than one roster: "a set of trains is loaded" no longer says which.
   * A set spread over several files (xUSSR ships nine) names the same set from each.
   */
  trainSet?: TrainSet;
  /** Base cost parameters, present only where the set's Action 14 has been read. */
  baseCosts?: BaseCostParams;
  /** Index of the parameter holding the wagon capacity setting (Iron Horse). */
  capacityParam?: number;
  /** Index of the parameter holding the economy selection (FIRS). */
  economyParam?: number;
}

export interface BaseCostParams {
  locomotive: number;
  wagon: number;
  runningSteam: number;
  runningDiesel: number;
  runningElectric: number;
}

/**
 * Iron Horse: parameter 0 is "adjust vehicle capacity", the same 0…4 index the calculator
 * keeps in CalcSettings (src/templates/header.pynml).
 */
export const IRON_HORSE_GRFID = 0x23124143;
/** FIRS: parameter 0 selects the economy by its position in the parameter menu. */
export const FIRS_GRFID = 0x100025f1;
/** BaseCosts Mod 5.0, parameters read from its own Action 14. */
export const BASE_COSTS_MOD_GRFID = 0x0503474d;
/** Altered Costs and Prices: known to change base costs, parameters never read. */
export const ALTERED_COSTS_GRFID = 0x21212121;

/**
 * xUSSR Railway Set: separate GRFs built from one repository, id "Meo" plus a file byte.
 * Any of them means the player runs xUSSR, so each names the same set — the rails file
 * included: the calculator's track table comes from the set either way.
 *
 * The ids are read from the extracted data rather than copied here — the extractor takes
 * them from each GRF's own block, and a file renumbered upstream would otherwise part
 * ways with this list without a word. The data spells an id the way the GRF writes it
 * (the four characters in order, hex), while a savegame holds the number the game read
 * from those bytes, little end first: `"Meo\xb1"` is `0xb16f654d`, the same convention
 * `IRON_HORSE_GRFID` follows.
 */
function grfidFromHex(hex: string): number {
  const bytes = hex.match(/../g)!.map((pair) => parseInt(pair, 16));
  return bytes.reduce((id, byte, index) => id | (byte << (index * 8)), 0) >>> 0;
}

export const XUSSR_GRFIDS = Object.fromEntries(
  Object.entries(xussrTrainsJson.meta.grfids).map(([file, hex]) => [file, grfidFromHex(hex)]),
) as Record<string, number>;

/**
 * Files of the set the calculator recognises but has no vehicle data for: the combined
 * pre-split set ("AKA\x08", the monolithic xussr.grf the repository no longer builds),
 * the Subways set and the Ivolga addon, neither of which has sources in the repository.
 * Recognising them still settles the roster — the player is playing xUSSR — and naming
 * them keeps the gap visible rather than silent (see README).
 */
export const XUSSR_UNBUILT_GRFIDS = {
  combined: 0x08414b41,
  subways: 0xb96f654d,
  ivolga: 0x03aa5a59,
} as const;

export const KNOWN_GRFS: readonly KnownGrf[] = [
  {
    grfid: IRON_HORSE_GRFID,
    role: 'trains',
    labelKey: 'savegame.grf.ironHorse',
    trainSet: 'iron_horse',
    capacityParam: 0,
  },
  ...Object.values(XUSSR_GRFIDS).map((grfid): KnownGrf => ({
    grfid,
    // one role for all nine, the rails file included: the role answers what the file
    // brings to the game, and every one of them brings the same train set — its track
    // table arrives with it rather than instead of it
    role: 'trains',
    // one label for all nine: the player loaded one set, however many files it took
    labelKey: 'savegame.grf.xussr',
    trainSet: 'xussr',
  })),
  {
    grfid: XUSSR_UNBUILT_GRFIDS.combined,
    role: 'trains',
    labelKey: 'savegame.grf.xussr',
    trainSet: 'xussr',
  },
  {
    grfid: XUSSR_UNBUILT_GRFIDS.subways,
    role: 'trains',
    labelKey: 'savegame.grf.xussrSubways',
    trainSet: 'xussr',
  },
  {
    grfid: XUSSR_UNBUILT_GRFIDS.ivolga,
    role: 'trains',
    labelKey: 'savegame.grf.xussrIvolga',
    trainSet: 'xussr',
  },
  { grfid: FIRS_GRFID, role: 'industries', labelKey: 'savegame.grf.firs', economyParam: 0 },
  {
    grfid: BASE_COSTS_MOD_GRFID,
    role: 'baseCosts',
    labelKey: 'savegame.grf.baseCostsMod',
    baseCosts: {
      locomotive: 15,
      wagon: 16,
      runningSteam: 42,
      runningDiesel: 43,
      runningElectric: 44,
    },
  },
  { grfid: ALTERED_COSTS_GRFID, role: 'baseCosts', labelKey: 'savegame.grf.alteredCosts' },
];

export function knownGrf(grfid: number): KnownGrf | undefined {
  return KNOWN_GRFS.find((g) => g.grfid === grfid);
}

/**
 * Parameter value → price multiplier. Base cost sets scale in powers of two around
 * "unchanged", which BaseCosts Mod stores as 8. The game clamps anything below
 * MIN_PRICE_MODIFIER = -8 (economy_type.h), so "free" ends up at 1/256.
 */
export const UNCHANGED_PARAM = 8;
const MIN_MULTIPLIER = 1 / 256;

export function multiplierFromParam(value: number): number {
  return Math.max(MIN_MULTIPLIER, 2 ** (value - UNCHANGED_PARAM));
}
