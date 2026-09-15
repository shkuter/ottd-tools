import { countLabel } from '../../components/format';
import type { Snapshot } from '../../savegame/snapshot';

/**
 * "92 trains, 55 routes, 100 stations" — what the import panel says about a snapshot.
 *
 * Each count carries the word agreed with it ("1 route", "21 маршрут"), so the summary is
 * three counts in a row rather than one string with the numbers slotted in: a single string
 * could only be right for the numbers its wording was chosen for. Both languages write such a
 * list with a comma.
 */
export function snapshotSummary(snapshot: Snapshot): string {
  return [
    countLabel('count.trains', snapshot.trains.length),
    countLabel('count.routes', snapshot.routes.length),
    countLabel('count.stations', snapshot.stations.filter((s) => !s.isWaypoint).length),
  ].join(', ');
}
