import type { Train } from '../../types';
import type { CalcSettings, GameSettings } from '../../engine/settings';
import type { SortState, SortValues } from '../../components/table/sorting';
import { activeRailtype, activeRailtypes, activeTrainsMeta, trainCapacity } from '../../dataset';
import { poweredOutputOn, topSpeedOn } from '../../engine/tracktypes';
import { vehicleWeightT } from '../../engine/vehicle';
import { trainBuyCost, trainRunningCostPerYear } from '../../engine/costs';
import type { SpeedUnit } from '../../engine/units';
import { capacityPerTile, capacityTimesSpeed } from './metrics';

export type CatalogueColumn =
  | 'name'
  | 'intro_year'
  | 'power_hp'
  | 'speed'
  | 'weight_t'
  | 'capacity'
  | 'capacity_per_tile'
  | 'capacity_speed'
  | 'cost'
  | 'running';

/** The columns the catalogue only shows once a cargo is picked, and only sorts by then. */
const CARGO_COLUMNS = ['capacity_per_tile', 'capacity_speed'] as const satisfies
  readonly CatalogueColumn[];

/** Whether this column is one of those, asked wherever their being conditional matters. */
export function isCargoColumn(column: CatalogueColumn): boolean {
  return (CARGO_COLUMNS as readonly CatalogueColumn[]).includes(column);
}

/**
 * The order the catalogue is in when nothing is sorted by hand: the year a model appears, which
 * is the order of the game's purchase list. A third click on a header comes back here, so this
 * is a state the catalogue really holds rather than a `null` standing in for it.
 */
export const DEFAULT_SORT: SortState<CatalogueColumn> = {
  column: 'intro_year',
  descending: false,
};

/**
 * What each sortable column of the catalogue compares by — including the figures computed
 * rather than stored (price, running cost, capacity), which is why the settings are arguments.
 *
 * A column sorts by what it shows: where the cell draws an em dash the row has no value here,
 * so the map says `null` and the row leaves the ordering instead of passing for a zero that
 * would head the list the moment the direction is reversed. Power and speed are the figures
 * for the chosen track, the same ones the cells print — an electro-diesel is ranked by the
 * power it makes on the line being planned, not by its best. The displayed speed unit is an
 * argument for the same reason: the "capacity × speed" column multiplies by the figure its own
 * cell prints, so the order has to be built from that figure and not from a proportional one.
 */
export function catalogueSortValues(
  game: GameSettings,
  calc: CalcSettings,
  speedUnit: SpeedUnit,
): SortValues<Train, CatalogueColumn> {
  const track = activeRailtype(game, calc.trackType);
  const railtypes = activeRailtypes(game);
  return {
    name: (train) => train.name,
    intro_year: (train) => train.intro_year,
    power_hp: (train) => poweredOutputOn(train, track, railtypes) || null,
    speed: (train) => topSpeedOn(train, track) || null,
    weight_t: (train) => vehicleWeightT(train),
    capacity: (train) => trainCapacity(train, calc.capacityIndex) || null,
    capacity_per_tile: (train) => capacityPerTile(train, calc),
    capacity_speed: (train) => capacityTimesSpeed(train, track, game, calc, speedUnit),
    cost: (train) => trainBuyCost(train, activeTrainsMeta(game), game, calc),
    running: (train) => trainRunningCostPerYear(train, activeTrainsMeta(game), game, calc),
  };
}
