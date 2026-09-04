import type { VehicleAvailability } from '../../engine/availability';
import type { PrefillOrigin } from '../../state/prefill';

/**
 * What the specimens of the interface-elements page are made of.
 *
 * Named here rather than read from the dataset or the stores on purpose: the page has to look
 * the same whatever set is chosen, whatever the settings hold and whatever savegame was
 * imported — a specimen that changed with them would make a check of the look depend on what
 * the person running it last played.
 *
 * The vehicles are real ids of the two sets, because their sprites are filed by id and a made
 * up one would draw nothing. Everything else is invented: figures on this page mean nothing.
 */

/** Vehicles of the Iron Horse set — the sprite comes from the id, so these have to exist. */
export const SPECIMEN_TRAINS = [
  { value: 'bean_feast', label: '2-6-4 Bean Feast' },
  { value: 'buffalo', label: '0-6-2 Buffalo' },
  { value: 'cheese_bug', label: '2-6-2 Cheese Bug' },
];

/** A vanilla vehicle, for the sprite that comes from the base set rather than from Iron Horse. */
export const SPECIMEN_VANILLA_TRAIN = 'vanilla_0';

/** A cargo of FIRS, for the icon beside a name. */
export const SPECIMEN_CARGO_ICON = 'icons/cargo/coal.png';

/**
 * Cargoes for the list that picks one. Only the two fields such a list reads — the label it is
 * keyed by and the icon it shows — so this needs nothing from the dataset. The name is a key of
 * the dictionaries rather than a word: everything the page shows follows the interface
 * language, and an invented English name would be the one string that does not.
 */
export const SPECIMEN_CARGOS = [
  { label: 'COAL', name: 'kit.cargoCoal', icon: SPECIMEN_CARGO_ICON },
  { label: 'IORE', name: 'kit.cargoIronOre', icon: 'icons/cargo/iron_ore.png' },
  { label: 'STEL', name: 'kit.cargoSteel', icon: 'icons/cargo/steel.png' },
];

/** Rows of the list specimen: a name with a picture, a figure that is a profit or a loss. */
export const SPECIMEN_ROWS = [
  { id: 'bean_feast', name: '2-6-4 Bean Feast', power: 1300, cost: 12_400, profit: 8_900 },
  { id: 'buffalo', name: '0-6-2 Buffalo', power: 900, cost: 9_100, profit: 2_150 },
  { id: 'cheese_bug', name: '2-6-2 Cheese Bug', power: 700, cost: 7_600, profit: -430 },
  { id: SPECIMEN_VANILLA_TRAIN, name: 'Kirby Paul Tank', power: 300, cost: 5_200, profit: -1_780 },
];

/** A series for the chart specimen: a shape to look at, not a computation. */
export const SPECIMEN_SERIES = [
  { days: 0, income: 0 },
  { days: 30, income: 4_200 },
  { days: 60, income: 7_400 },
  { days: 90, income: 9_100 },
  { days: 120, income: 9_800 },
  { days: 150, income: 9_950 },
];

/** A vehicle whose introduction is in doubt — what BuyMenuNote is there to explain. */
export const SPECIMEN_AVAILABILITY: VehicleAvailability = {
  state: 'uncertain',
  reason: 'intro',
  intro: {
    year: 1927,
    month: 3,
    latestYear: 1932,
    latestMonth: 3,
    randomised: true,
    certain: false,
  },
};

/** Values a bridge from the game tab would have written, and the note that follows them. */
export const SPECIMEN_PREFILL_VALUES = { cargoLabel: 'COAL' };

export function specimenPrefill(label: string): PrefillOrigin<typeof SPECIMEN_PREFILL_VALUES> {
  return { source: 'industry', label, values: SPECIMEN_PREFILL_VALUES };
}
