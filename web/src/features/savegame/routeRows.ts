/**
 * Turns the snapshot's routes into what the tab lists: the fleet, its cargo, the profit the
 * game itself recorded, and — where the model applies — the calculator's forecast beside it.
 *
 * Pure on purpose: a function of the snapshot and the settings it was taken with, so it runs
 * in tests without React and can be reused when routes start feeding the other tabs.
 */

import {
  activeCargoByLabel,
  activeTrains,
  activeTrainsMeta,
  economyIdForPayment,
} from '../../dataset';
import { cargoPaymentRate } from '../../engine/income';
import { tripEconomics, type TripEconomics } from '../../engine/trip';
import type { Cargo, ConsistEntry } from '../../types';
import type {
  Snapshot,
  SnapshotConsistEntry,
  SnapshotStop,
  SnapshotTrain,
} from '../../savegame/snapshot';
import type { SnapshotSettings } from '../../savegame/snapshotStore';

/**
 * Why a route states no forecast. Each one is a case the model cannot answer honestly, and
 * the tab names it instead of showing a number that would be wrong.
 */
export type ForecastBlocker =
  /** Fewer than two station stops: there is no leg to run. */
  | 'oneStop'
  /**
   * More than two station stops. The model is a there-and-back trip between two stations;
   * a longer rotation is a different shape, not a longer leg.
   */
  | 'multiStop'
  /** No cargo the calculator knows: nothing to be paid for. */
  | 'noCargo'
  /** A vehicle of a set the catalogue does not know — capacity and costs would be short. */
  | 'unmatchedVehicle'
  /**
   * The consist has no room for this cargo as far as the catalogue is concerned. The game
   * plainly hauls it, so the disagreement is the calculator's — a refit it does not know, or
   * a capacity index the game was not played with. Pricing it anyway would state a running
   * cost against an income of zero, which is a loss the route does not make.
   */
  | 'cargoNotCarried'
  /** The fleet is not one consist repeated, which is what the model prices. */
  | 'mixedFleet'
  /** The savegame never said how wide the map is, so no distance could be measured. */
  | 'noDistance';

/**
 * Stops that name a station of the snapshot — the ones a route is described by. A stop
 * pointing at nothing is dropped here rather than at each caller, or a list of names and a
 * list of stops built from different predicates would line up wrongly.
 */
export function stationStops(stops: readonly SnapshotStop[]): SnapshotStop[] {
  return stops.filter((stop) => stop.kind === 'station' && stop.stationId !== null);
}

export interface RouteRow {
  id: number;
  stops: SnapshotStop[];
  /** Trains sharing this route, in the snapshot's order. */
  trains: SnapshotTrain[];
  /**
   * The consist every train of the fleet runs, or null where they differ — what the model
   * prices, and what the list states beside the number of trains.
   */
  consist: SnapshotConsistEntry[] | null;
  cargo: Cargo | null;
  /** Profit of the whole fleet over the last finished year — the figure a forecast meets. */
  profitLastYear: number;
  /** Profit so far this year: the year is not over, so it is a note, not a comparison. */
  profitThisYear: number;
  /** Distance of the loaded leg, where the snapshot could state one. */
  distanceTiles: number | null;
  forecast: TripEconomics | null;
  blocker: ForecastBlocker | null;
}

export function routeRows(
  snapshot: Snapshot,
  settings: SnapshotSettings,
  companyId: number,
): RouteRow[] {
  const byId = new Map(snapshot.trains.map((train) => [train.id, train]));
  const meta = activeTrainsMeta(settings.game);
  const byLabel = activeCargoByLabel(settings.game);
  const catalogue = new Map(activeTrains(settings.game).map((train) => [train.id, train]));
  const economyId = economyIdForPayment(settings.game);

  return snapshot.routes
    .filter((route) => route.companyId === companyId)
    .map((route) => {
      const trains = route.trainIds
        .map((id) => byId.get(id))
        .filter((train): train is SnapshotTrain => train !== undefined);
      const cargo = routeCargo(trains, byLabel);
      const consist = uniformConsist(trains);
      const distanceTiles = route.legTiles[0] ?? null;

      const row: RouteRow = {
        id: route.id,
        stops: route.stops,
        trains,
        consist,
        cargo,
        profitLastYear: trains.reduce((sum, train) => sum + train.profitLastYear, 0),
        profitThisYear: trains.reduce((sum, train) => sum + train.profitThisYear, 0),
        distanceTiles,
        forecast: null,
        blocker: null,
      };

      const entries = consist === null ? null : consistEntries(consist, catalogue);
      const blocker = forecastBlocker(row, entries);
      if (blocker !== null) return { ...row, blocker };

      const forecast = tripEconomics({
        entries: entries!,
        meta,
        cargo: cargo!,
        payment: cargoPaymentRate(cargo!, economyId, settings.game, settings.calc),
        distanceTiles: distanceTiles!,
        fleetSize: trains.length,
        waitForFullLoad: route.stops.some((stop) => stop.fullLoad),
        game: settings.game,
        calc: settings.calc,
      });
      // the game hauls this cargo; if the catalogue says the consist cannot, the figures
      // below it are a running cost against no income at all
      if (forecast.capacity <= 0) return { ...row, blocker: 'cargoNotCarried' };
      return { ...row, forecast };
    });
}

/** What stops the model, in the order the tab would explain it. */
function forecastBlocker(row: RouteRow, entries: ConsistEntry[] | null): ForecastBlocker | null {
  const stations = stationStops(row.stops);
  if (stations.length < 2) return 'oneStop';
  if (stations.length > 2) return 'multiStop';
  if (row.distanceTiles === null) return 'noDistance';
  if (row.cargo === null) return 'noCargo';
  if (row.consist === null) return 'mixedFleet';
  // one unmatched vehicle is enough: its capacity and its costs are both missing
  if (entries === null) return 'unmatchedVehicle';
  return null;
}

/**
 * The consist as the engine takes it — catalogue entries, not ids. Null as soon as one
 * vehicle is unmatched: a consist priced without it would read as a cheaper, smaller train.
 */
function consistEntries(
  consist: readonly SnapshotConsistEntry[],
  catalogue: ReadonlyMap<string, ConsistEntry['train']>,
): ConsistEntry[] | null {
  const entries: ConsistEntry[] = [];
  for (const entry of consist) {
    const train = entry.catalogueId === null ? undefined : catalogue.get(entry.catalogueId);
    if (train === undefined) return null;
    entries.push({ train, count: entry.count });
  }
  return entries;
}

/**
 * The cargo the route is about: what the fleet has the most room for. A train refitted for
 * two cargoes still hauls mostly one, and that one is what the forecast prices.
 */
function routeCargo(
  trains: readonly SnapshotTrain[],
  byLabel: ReadonlyMap<string, Cargo>,
): Cargo | null {
  const capacityByLabel = new Map<string, number>();
  for (const train of trains) {
    for (const load of train.cargo) {
      if (load.label === null) continue;
      capacityByLabel.set(load.label, (capacityByLabel.get(load.label) ?? 0) + load.capacity);
    }
  }
  let best: { cargo: Cargo; capacity: number } | null = null;
  for (const [label, capacity] of capacityByLabel) {
    const cargo = byLabel.get(label);
    if (cargo && (best === null || capacity > best.capacity)) best = { cargo, capacity };
  }
  return best?.cargo ?? null;
}

/** The consist every train of the fleet runs, or null where they differ. */
function uniformConsist(trains: readonly SnapshotTrain[]): SnapshotConsistEntry[] | null {
  const first = trains[0]?.consist;
  if (!first || first.length === 0) return null;
  const shape = (consist: readonly SnapshotConsistEntry[]) =>
    consist.map((entry) => `${entry.catalogueId ?? '?'}x${entry.count}`).join('+');
  const wanted = shape(first);
  return trains.every((train) => shape(train.consist) === wanted) ? first : null;
}
