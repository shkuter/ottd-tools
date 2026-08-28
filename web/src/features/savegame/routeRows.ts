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
  activeRailtypes,
} from '../../dataset';
import { cargoPaymentRate } from '../../engine/income';
import { trackTypeOfConsist } from '../../engine/tracktypes';
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
  /**
   * The same consist as catalogue entries — what the engine and the bridges take. Null as
   * soon as the fleet is not uniform or one vehicle is unmatched, which is exactly when
   * there is no single consist to price or to carry anywhere.
   */
  entries: ConsistEntry[] | null;
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
  const railtypes = activeRailtypes(settings.game);

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
        entries: consist === null ? null : consistEntries(consist, catalogue),
        cargo,
        profitLastYear: trains.reduce((sum, train) => sum + train.profitLastYear, 0),
        profitThisYear: trains.reduce((sum, train) => sum + train.profitThisYear, 0),
        distanceTiles,
        forecast: null,
        blocker: null,
      };

      const blocker = forecastBlocker(row);
      if (blocker !== null) return { ...row, blocker };

      // The save says which trains run the route, not what they run on, and the
      // calculator's own track setting describes a different game. The consist answers it:
      // the track it can work on is one the player built. A consist that works nowhere —
      // vehicles of two gauges in one train — leaves the snapshot's own settings alone;
      // its figures are doubtful either way, and `forecastBlocker` has already had its say.
      const track = trackTypeOfConsist(row.entries!, railtypes);
      const calc = track ? { ...settings.calc, trackType: track.label } : settings.calc;
      const forecast = tripEconomics({
        entries: row.entries!,
        meta,
        cargo: cargo!,
        payment: cargoPaymentRate(cargo!, economyId, settings.game, calc),
        distanceTiles: distanceTiles!,
        fleetSize: trains.length,
        waitForFullLoad: route.stops.some((stop) => stop.fullLoad),
        game: settings.game,
        calc,
      });
      // the game hauls this cargo; if the catalogue says the consist cannot, the figures
      // below it are a running cost against no income at all
      if (forecast.capacity <= 0) return { ...row, blocker: 'cargoNotCarried' };
      return { ...row, forecast };
    });
}

/**
 * What stops a route from being priced as one consist over one leg, regardless of the order
 * a caller cares about it in. The forecast asks about the round trip and so weighs the shape
 * of the route first; a bridge carrying the consist elsewhere weighs the consist first. Both
 * read the same answers from here rather than each deciding what "unusable" means.
 */
export interface RouteObstacles {
  shape: Extract<ForecastBlocker, 'oneStop' | 'multiStop'> | null;
  distance: Extract<ForecastBlocker, 'noDistance'> | null;
  cargo: Extract<ForecastBlocker, 'noCargo'> | null;
  consist: Extract<ForecastBlocker, 'mixedFleet' | 'unmatchedVehicle'> | null;
}

export function routeObstacles(row: RouteRow): RouteObstacles {
  const stations = stationStops(row.stops);
  return {
    shape: stations.length < 2 ? 'oneStop' : stations.length > 2 ? 'multiStop' : null,
    distance: row.distanceTiles === null ? 'noDistance' : null,
    cargo: row.cargo === null ? 'noCargo' : null,
    // one unmatched vehicle is enough: its capacity and its costs are both missing
    consist:
      row.consist === null ? 'mixedFleet' : row.entries === null ? 'unmatchedVehicle' : null,
  };
}

/** What stops the model, in the order the tab would explain it. */
function forecastBlocker(row: RouteRow): ForecastBlocker | null {
  const obstacles = routeObstacles(row);
  return obstacles.shape ?? obstacles.distance ?? obstacles.cargo ?? obstacles.consist;
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
