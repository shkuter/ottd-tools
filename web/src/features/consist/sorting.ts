import type { Train } from '../../types';
import type { CalcSettings, GameSettings } from '../../engine/settings';
import type { SortState, SortValues } from '../../components/table/sorting';
import { activeRailtype, activeRailtypes, activeTrainsMeta, trainCapacity } from '../../dataset';
import { poweredOutputOn, topSpeedOn } from '../../engine/tracktypes';
import { trainBuyCost, trainRunningCostPerYear } from '../../engine/costs';

export type CatalogueColumn =
  | 'name'
  | 'intro_year'
  | 'power_hp'
  | 'speed'
  | 'weight_t'
  | 'capacity'
  | 'cost'
  | 'running';

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
 * power it makes on the line being planned, not by its best.
 */
export function catalogueSortValues(
  game: GameSettings,
  calc: CalcSettings,
): SortValues<Train, CatalogueColumn> {
  const track = activeRailtype(game, calc.trackType);
  const railtypes = activeRailtypes(game);
  return {
    name: (train) => train.name,
    intro_year: (train) => train.intro_year,
    power_hp: (train) => poweredOutputOn(train, track, railtypes) || null,
    speed: (train) => topSpeedOn(train, track) || null,
    weight_t: (train) => train.weight_t,
    capacity: (train) => trainCapacity(train, calc.capacityIndex) || null,
    cost: (train) => trainBuyCost(train, activeTrainsMeta(game), game, calc),
    running: (train) => trainRunningCostPerYear(train, activeTrainsMeta(game), game, calc),
  };
}
