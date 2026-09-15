/**
 * Replacing the consist, undoably.
 *
 * Three actions overwrite what the consist builder holds — the optimizer's "→", the route
 * bridge of the game tab and the builder's own clear button — and each of them writes more
 * than the vehicles: the cargo and the trip travel with the consist. Undoing only the vehicles
 * would leave the income tab pricing the old consist on the new route, so the snapshot takes
 * every field such an action may write, and the restore puts all of them back.
 *
 * Pure store logic, with no interface. The actions reach it through `replaceConsistWithUndo`
 * (components/consistReplacedNotice.tsx), which also offers the undo, so a fourth action cannot
 * replace the consist without one.
 */

import type { ConsistEntry } from '../types';
import { activeEntries } from '../dataset';
import { useConsistStore } from './consistStore';
import { useRouteStore, type RouteState } from './routeStore';
import { useSettingsStore } from './settingsStore';

/**
 * The fields of the trip a replacement may write. One list for the snapshot and its type, so a
 * field added to a bridge and to this list is taken back by the undo, and one left off the list
 * is visibly not.
 */
export const TRIP_FIELDS = [
  'cargoLabel',
  'distanceTiles',
  'amount',
  'manualDays',
  'productionPerMonth',
  'waitForFullLoad',
  'prefillOrigin',
] as const satisfies readonly (keyof RouteState)[];

export type TripFields = Pick<RouteState, (typeof TRIP_FIELDS)[number]>;

/** The fields of the trip a replacement may write, as a route state holds them. */
export function pickTrip(route: RouteState): TripFields {
  return Object.fromEntries(TRIP_FIELDS.map((field) => [field, route[field]])) as TripFields;
}

/** What a replacement may overwrite, taken just before it does. */
export interface ConsistAndRoute {
  entries: ConsistEntry[];
  route: TripFields;
}

export function captureConsistAndRoute(): ConsistAndRoute {
  return {
    entries: useConsistStore.getState().entries,
    route: pickTrip(useRouteStore.getState()),
  };
}

/** Puts a snapshot back, one write per store. */
export function restoreConsistAndRoute(snapshot: ConsistAndRoute): void {
  useConsistStore.setState({ entries: snapshot.entries });
  useRouteStore.setState({ ...snapshot.route });
}

/**
 * Runs `write` and returns what it replaced — or null when the builder showed nothing before
 * it, as there is nothing to lose then and nothing to offer back. What the builder shows is the
 * consist of the active set of vehicles: entries of another set stay stored but are not on
 * screen, and offering them "back" would restore a consist the player never saw.
 */
export function replaceConsist(write: () => void): ConsistAndRoute | null {
  const before = captureConsistAndRoute();
  write();
  const shown = activeEntries(before.entries, useSettingsStore.getState().game);
  return shown.length > 0 ? before : null;
}
