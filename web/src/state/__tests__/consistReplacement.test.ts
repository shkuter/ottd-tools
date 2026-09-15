import { beforeEach, describe, expect, it } from 'vitest';
import { trains } from '../../dataset';
import {
  captureConsistAndRoute,
  replaceConsist,
  restoreConsistAndRoute,
} from '../consistReplacement';
import { useConsistStore } from '../consistStore';
import { useRouteStore } from '../routeStore';
import { useSettingsStore } from '../settingsStore';
import { TRIP_BEFORE, tripOf } from './tripFixture';

const engine = trains.find((t) => t.kind === 'engine')!;
const wagon = trains.find((t) => t.kind === 'wagon')!;

/** Every field a replacement may overwrite, written somewhere else. */
function overwriteEverything() {
  useConsistStore.getState().setEntries([{ train: wagon, count: 9 }]);
  const route = useRouteStore.getState();
  route.setCargoLabel('COAL');
  route.setDistanceTiles(96);
  route.setAmount(240);
  route.setManualDays(null);
  route.setProductionPerMonth(144);
  route.setWaitForFullLoad(true);
  route.setPrefillOrigin({
    source: 'route',
    label: 'Coalmouth — Power Station',
    values: {
      cargoLabel: 'COAL',
      distanceTiles: 96,
      amount: 240,
      manualDays: null,
      productionPerMonth: 144,
      waitForFullLoad: true,
      consist: [{ id: wagon.id, count: 9 }],
      network: { railPieces: {}, signals: 0, stations: 0 },
    },
  });
}

beforeEach(() => {
  // the vehicles below are of the Iron Horse set, so that set is the one the builder shows
  useSettingsStore.getState().reset();
  useSettingsStore.getState().setGame('trainSet', 'iron_horse');
  useConsistStore.setState({ entries: [{ train: engine, count: 1 }] });
  useRouteStore.setState(TRIP_BEFORE);
});

describe('replacing the consist', () => {
  it('restores the consist and every field of the trip it overwrote', () => {
    const before = captureConsistAndRoute();
    overwriteEverything();

    restoreConsistAndRoute(before);

    expect(useConsistStore.getState().entries).toEqual([{ train: engine, count: 1 }]);
    expect(tripOf(useRouteStore.getState())).toEqual(TRIP_BEFORE);
  });

  it('leaves what a replacement never writes alone', () => {
    // the network counts belong to the company card, not to a consist being replaced
    const before = captureConsistAndRoute();
    useRouteStore.getState().setRailPieces('RAIL', 30);
    restoreConsistAndRoute(before);
    expect(useRouteStore.getState().network.railPieces).toEqual({ RAIL: 30 });
  });

  it('hands back what the write replaced', () => {
    const replaced = replaceConsist(overwriteEverything);
    expect(useConsistStore.getState().entries).toEqual([{ train: wagon, count: 9 }]);
    expect(replaced?.entries).toEqual([{ train: engine, count: 1 }]);
    expect(replaced?.route.distanceTiles).toBe(7);
  });

  it('hands back nothing when the builder was empty: there was nothing to lose', () => {
    useConsistStore.setState({ entries: [] });
    expect(replaceConsist(overwriteEverything)).toBeNull();
    // the write still happened
    expect(useConsistStore.getState().entries).toHaveLength(1);
  });

  it('counts only what the builder shows: a consist of another set of vehicles is not on screen', () => {
    // the stored entries are of the set that is switched off, so the builder looks empty
    const otherSet = useSettingsStore.getState().game.trainSet === 'iron_horse' ? 'vanilla' : 'iron_horse';
    useSettingsStore.getState().setGame('trainSet', otherSet);
    expect(replaceConsist(overwriteEverything)).toBeNull();
  });
});
