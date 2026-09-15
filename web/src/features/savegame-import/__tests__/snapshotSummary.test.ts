import { afterEach, describe, expect, it } from 'vitest';
import { snapshotSummary } from '../snapshotSummary';
import { useLocaleStore } from '../../../state/localeStore';
import type { Snapshot } from '../../../savegame/snapshot';

/** A snapshot holding the given counts and nothing else the summary reads. */
function snapshotOf(trains: number, routes: number, stations: number): Snapshot {
  const many = <T>(n: number, item: T): T[] => Array.from({ length: n }, () => item);
  return {
    soldIds: null,
    companies: [],
    towns: [],
    groups: [],
    industries: [],
    trains: many(trains, {}),
    routes: many(routes, {}),
    // a waypoint is a station in the save but not one the player counts
    stations: [...many(stations, { isWaypoint: false }), { isWaypoint: true }],
  } as unknown as Snapshot;
}

afterEach(() => useLocaleStore.setState({ locale: 'en' }));

describe('the summary of an imported game', () => {
  it('agrees each word with its own count in English', () => {
    useLocaleStore.setState({ locale: 'en' });
    expect(snapshotSummary(snapshotOf(2, 1, 1))).toBe('2 trains, 1 route, 1 station');
  });

  it('agrees them by the Russian rules, which have more than two forms', () => {
    useLocaleStore.setState({ locale: 'ru' });
    expect(snapshotSummary(snapshotOf(21, 3, 5))).toBe('21 поезд, 3 маршрута, 5 станций');
  });
});
