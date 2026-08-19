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

export const KNOWN_GRFS: readonly KnownGrf[] = [
  {
    grfid: IRON_HORSE_GRFID,
    role: 'trains',
    labelKey: 'savegame.grf.ironHorse',
    capacityParam: 0,
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
