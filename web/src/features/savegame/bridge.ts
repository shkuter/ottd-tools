/**
 * What a card of the game tab hands to a calculating tab. Pure on purpose, like `routeRows`:
 * a bridge is a function of the snapshot, so the decision of what may be carried over — and
 * what has to be refused — is testable without a browser.
 *
 * A bridge either carries values or names why it cannot. What it refuses on is not simply
 * "the card has no forecast": the number of stops decides how *much* travels, never whether
 * anything does, so a ring route still carries its consist while a route whose fleet is
 * built two different ways carries nothing.
 */

import type { Cargo, ConsistEntry } from '../../types';
import type { Snapshot, SnapshotProduced } from '../../savegame/snapshot';
import type { OptimizerPrefill } from '../../state/optimizerStore';
import type { RoutePrefill } from '../../state/routeStore';
import { routeObstacles, stationStops, type ForecastBlocker, type RouteRow } from './routeRows';

/** A bridge that may be taken, or the reason it may not. */
export type Bridge<V> = { values: V; blocker?: never } | { blocker: ForecastBlocker; values?: never };

export interface IncomeBridge {
  /** Catalogue rows for the consist builder, from the set the imported game was played with. */
  entries: ConsistEntry[];
  cargo: Cargo;
  /** Everything else the route settles, or null where only the consist and cargo travel. */
  trip: {
    distanceTiles: number;
    amount: number;
    productionPerMonth: number;
    waitForFullLoad: boolean;
  } | null;
}

/**
 * Route → Route income. The whole trip where the model applies, the consist and its cargo
 * where the route is a longer rotation: a ring has no single leg, and inventing an
 * "equivalent" one would be a lie in the one number the tab is about.
 */
export function routeToIncome(row: RouteRow, snapshot: Snapshot): Bridge<IncomeBridge> {
  const obstacles = routeObstacles(row);
  // the consist and the cargo are what travels in every case, so they are asked about first
  const blocker = obstacles.consist ?? obstacles.cargo;
  if (blocker !== null) return { blocker };
  const entries = row.entries!;
  const cargo = row.cargo!;

  const full = row.forecast !== null && obstacles.shape === null && obstacles.distance === null;
  if (!full) return { values: { entries, cargo, trip: null } };
  return {
    values: {
      entries,
      cargo,
      trip: {
        distanceTiles: row.distanceTiles!,
        // the capacity the forecast was computed over, so the tab opens on the same trip
        amount: row.forecast!.capacity,
        // the income tab states a flow of zero as "not given", which is what an unanswerable
        // flow means there too
        productionPerMonth: loadingFlow(row, snapshot) ?? 0,
        waitForFullLoad: row.stops.some((stop) => stop.fullLoad),
      },
    },
  };
}

/**
 * Route → Best train. The optimizer picks a consist itself, so what a route contributes is
 * the question: this cargo, over this leg, from a source that makes this much. Nothing about
 * the consist can stand in the way — which is why a route the income bridge refuses on an
 * unmatched vehicle still reaches the optimizer.
 */
export function routeToOptimizer(row: RouteRow, snapshot: Snapshot): Bridge<Partial<OptimizerPrefill>> {
  const obstacles = routeObstacles(row);
  if (obstacles.cargo !== null) return { blocker: obstacles.cargo };
  const values: Partial<OptimizerPrefill> = { cargoLabel: row.cargo!.label };
  // a leg exists only between two stations, and only where the save could measure it
  if (obstacles.shape === null && obstacles.distance === null) {
    values.distanceTiles = row.distanceTiles!;
  }
  // the flow belongs to the loading end, which a two-station route has even where the save
  // could not measure the distance between the ends; a flow the snapshot cannot state is
  // left out rather than written as a zero over whatever the user had
  if (obstacles.shape === null) {
    const flow = loadingFlow(row, snapshot);
    if (flow !== null) values.productionPerMonth = flow;
  }
  return { values };
}

/**
 * Industry → Best train, from one of the cargoes it makes. Only the cargo travels: which
 * industry it came from is the note's business, not the search's.
 */
export function industryToOptimizer(produced: SnapshotProduced): Bridge<Partial<OptimizerPrefill>> {
  if (produced.label === null || produced.lastMonthProduction === null) return { blocker: 'noCargo' };
  return {
    values: {
      cargoLabel: produced.label,
      productionPerMonth: produced.lastMonthProduction,
    },
  };
}

/**
 * Output of the industries feeding the loading station, in units per month — the flow the
 * waiting branch of the trip model accumulates from.
 *
 * Null where the snapshot cannot answer: no loading end, or a station it worked out no
 * catchment for — which covers both a station nothing feeds and a save that never said how
 * wide the map is. The two are one answer here on purpose: neither states a flow, and a
 * number stated for either would be made up.
 */
export function loadingFlow(row: RouteRow, snapshot: Snapshot): number | null {
  const stationId = loadingStationOf(row, snapshot);
  const station = snapshot.stations.find((s) => s.id === stationId);
  if (!station || row.cargo === null) return null;
  const suppliers = new Set(station.supplierIds);
  let flow: number | null = null;
  for (const industry of snapshot.industries) {
    if (!suppliers.has(industry.id)) continue;
    for (const produced of industry.produced) {
      // only industries making this very cargo say anything about its flow: a passenger run
      // is fed by towns, which are no industry, and its flow is unknown rather than zero
      if (produced.label === row.cargo.label) flow = (flow ?? 0) + (produced.lastMonthProduction ?? 0);
    }
  }
  return flow;
}

/**
 * Which end of the leg the cargo is loaded at. The game keeps a rating where cargo is
 * handled for pickup, so the rating for what the route hauls tells the two ends apart; where
 * it cannot — both rated, or neither — the run begins at the first stop of the order list.
 */
function loadingStationOf(row: RouteRow, snapshot: Snapshot): number | null {
  const stops = stationStops(row.stops);
  if (stops.length === 0) return null;
  if (row.cargo === null) return stops[0]!.stationId;
  const rated = stops.filter((stop) => {
    const station = snapshot.stations.find((s) => s.id === stop.stationId);
    return station?.goods.some((g) => g.label === row.cargo!.label && g.rating !== null) ?? false;
  });
  return rated.length === 1 ? rated[0]!.stationId : stops[0]!.stationId;
}

/** The prefill a full income bridge writes, as the note compares it later. */
export function incomePrefillValues(bridge: IncomeBridge): Partial<RoutePrefill> {
  const consist = bridge.entries.map((entry) => ({ id: entry.train.id, count: entry.count }));
  if (bridge.trip === null) return { cargoLabel: bridge.cargo.label, consist };
  return {
    cargoLabel: bridge.cargo.label,
    consist,
    distanceTiles: bridge.trip.distanceTiles,
    amount: bridge.trip.amount,
    productionPerMonth: bridge.trip.productionPerMonth,
    waitForFullLoad: bridge.trip.waitForFullLoad,
    // the trip is timed by the consist that just arrived, not by a number left over from
    // whatever was being worked out before
    manualDays: null,
  };
}
