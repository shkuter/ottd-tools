import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyIncomeBridge,
  applyNetworkBridge,
  applyOptimizerBridge,
  routePrefillState,
} from '../applyBridge';
import { prefillMatches } from '../../../state/prefill';
import { useConsistStore } from '../../../state/consistStore';
import { useOptimizerStore } from '../../../state/optimizerStore';
import { useRouteStore } from '../../../state/routeStore';
import { trains, cargoByLabel } from '../../../dataset';
import { useSettingsStore } from '../../../state/settingsStore';
import { vanillaTrains } from '../../../vanilla';
import type { IncomeBridge } from '../bridge';

const engine = trains.find((t) => t.kind === 'engine')!;
const wagon = trains.find((t) => t.kind === 'wagon')!;
const cargo = cargoByLabel.get('COAL') ?? [...cargoByLabel.values()][0]!;

const fullBridge: IncomeBridge = {
  entries: [
    { train: engine, count: 1 },
    { train: wagon, count: 8 },
  ],
  cargo,
  trip: { distanceTiles: 96, amount: 240, productionPerMonth: 144, waitForFullLoad: true },
};

beforeEach(() => {
  useSettingsStore.getState().reset();
  // мост несёт состав Iron Horse, а наборы по умолчанию выключены: без них состав считается
  // машинами другого набора и выпадает из сравнения (`activeEntries` в routePrefillState)
  useSettingsStore.getState().applySettings({ trainSet: 'iron_horse', firs: true }, {});
  useRouteStore.setState({
    cargoLabel: 'WOOD',
    distanceTiles: 7,
    amount: 11,
    manualDays: 42,
    productionPerMonth: 999,
    waitForFullLoad: false,
    prefillOrigin: null,
  });
  useConsistStore.setState({ entries: [], cargoLabel: 'WOOD' });
  useOptimizerStore.setState({
    cargoLabel: 'WOOD',
    distanceTiles: 300,
    productionPerMonth: 0,
    prefillOrigin: null,
  });
});

describe('taking the income bridge', () => {
  it('fills the consist, the cargo and the whole trip', () => {
    applyIncomeBridge(fullBridge, 'Coalmouth — Power Station');

    expect(useConsistStore.getState().entries).toEqual(fullBridge.entries);
    expect(useRouteStore.getState().cargoLabel).toBe(cargo.label);
    expect(useRouteStore.getState().distanceTiles).toBe(96);
    expect(useRouteStore.getState().amount).toBe(240);
    expect(useRouteStore.getState().productionPerMonth).toBe(144);
    expect(useRouteStore.getState().waitForFullLoad).toBe(true);
    // the trip is timed by the consist, not by the 42 days left from before
    expect(useRouteStore.getState().manualDays).toBeNull();
  });

  it('an unknown flow is written as zero, not left at the old figure', () => {
    applyIncomeBridge({ ...fullBridge, trip: { ...fullBridge.trip!, productionPerMonth: 0 } }, 'x');

    expect(useRouteStore.getState().productionPerMonth).toBe(0);
  });

  it('a partial bridge leaves everything the route did not state', () => {
    applyIncomeBridge({ ...fullBridge, trip: null }, 'Ring route');

    expect(useConsistStore.getState().entries).toEqual(fullBridge.entries);
    expect(useRouteStore.getState().cargoLabel).toBe(cargo.label);
    // untouched: the ring said nothing about a leg
    expect(useRouteStore.getState().distanceTiles).toBe(7);
    expect(useRouteStore.getState().amount).toBe(11);
    expect(useRouteStore.getState().manualDays).toBe(42);
    expect(useRouteStore.getState().waitForFullLoad).toBe(false);
  });

  it('leaves the calculator settings alone', () => {
    useSettingsStore.getState().reset();
    const before = JSON.stringify(useSettingsStore.getState().game);

    applyIncomeBridge(fullBridge, 'Coalmouth — Power Station');

    // the receiving tab computes with the user's settings; the game's stay in the snapshot
    expect(JSON.stringify(useSettingsStore.getState().game)).toBe(before);
  });

  it('carries a vanilla consist as well, since the store holds catalogue rows', () => {
    const vanillaEngine = vanillaTrains.find((t) => t.kind === 'engine')!;
    applyIncomeBridge({ ...fullBridge, entries: [{ train: vanillaEngine, count: 1 }] }, 'x');

    expect(useConsistStore.getState().entries).toEqual([{ train: vanillaEngine, count: 1 }]);
  });
});

describe('the note the receiving tab shows', () => {
  it('stands while the tab holds what the bridge wrote', () => {
    applyIncomeBridge(fullBridge, 'Coalmouth — Power Station');
    const origin = useRouteStore.getState().prefillOrigin;

    expect(origin!.label).toBe('Coalmouth — Power Station');
    expect(prefillMatches(origin, routePrefillState(useSettingsStore.getState().game))).toBe(true);
  });

  it('goes out when a carried value is edited, and returns when it is put back', () => {
    applyIncomeBridge(fullBridge, 'Coalmouth — Power Station');
    useRouteStore.getState().setDistanceTiles(40);
    expect(prefillMatches(useRouteStore.getState().prefillOrigin, routePrefillState(useSettingsStore.getState().game))).toBe(false);

    useRouteStore.getState().setDistanceTiles(96);
    expect(prefillMatches(useRouteStore.getState().prefillOrigin, routePrefillState(useSettingsStore.getState().game))).toBe(true);
  });

  it('ignores a field the bridge never wrote', () => {
    applyIncomeBridge({ ...fullBridge, trip: null }, 'Ring route');
    useRouteStore.getState().setDistanceTiles(555);

    expect(prefillMatches(useRouteStore.getState().prefillOrigin, routePrefillState(useSettingsStore.getState().game))).toBe(true);
  });

  it('goes out when the consist is changed', () => {
    applyIncomeBridge(fullBridge, 'Coalmouth — Power Station');
    useConsistStore.getState().setCount(wagon.id, 3);

    expect(prefillMatches(useRouteStore.getState().prefillOrigin, routePrefillState(useSettingsStore.getState().game))).toBe(false);
  });
});

describe('taking the optimizer bridge', () => {
  it('fills cargo, leg and flow', () => {
    applyOptimizerBridge(
      { cargoLabel: 'COAL', distanceTiles: 96, productionPerMonth: 144 },
      { source: 'route', label: 'A — B' },
    );
    const state = useOptimizerStore.getState();

    expect(state.cargoLabel).toBe('COAL');
    expect(state.distanceTiles).toBe(96);
    expect(state.productionPerMonth).toBe(144);
    expect(state.prefillOrigin!.label).toBe('A — B');
  });

  it('leaves the leg alone when the bridge carried only a cargo', () => {
    applyOptimizerBridge({ cargoLabel: 'COAL' }, { source: 'route', label: 'Ring route' });
    const state = useOptimizerStore.getState();

    expect(state.cargoLabel).toBe('COAL');
    expect(state.distanceTiles).toBe(300);
    expect(prefillMatches(state.prefillOrigin, state)).toBe(true);
  });
});

describe('taking the network bridge', () => {
  const network = { railPieces: { RAIL: 240, ELRL: 60 }, signals: 18, stations: 12 };

  const noteStands = () =>
    prefillMatches(useRouteStore.getState().networkOrigin, {
      network: useRouteStore.getState().network,
    });

  it('writes the counts and marks them as the company’s', () => {
    applyNetworkBridge(network, 'Checks & Co');

    expect(useRouteStore.getState().network).toEqual(network);
    expect(noteStands()).toBe(true);
  });

  it('the mark goes as soon as a count is edited by hand', () => {
    applyNetworkBridge(network, 'Checks & Co');
    useRouteStore.getState().setRailPieces('RAIL', 241);

    expect(noteStands()).toBe(false);
  });

  it('says nothing about the route: the rest of the tab is not compared', () => {
    applyNetworkBridge(network, 'Checks & Co');
    useRouteStore.getState().setDistanceTiles(7);

    // the note stands: a company card carried no distance, so a changed one cannot disagree
    expect(noteStands()).toBe(true);
  });

  it('leaves the note of a route that was carried over before it', () => {
    applyIncomeBridge(fullBridge, 'Coalmouth — Power Station');
    applyNetworkBridge(network, 'Checks & Co');

    const game = useSettingsStore.getState().game;
    // both halves of the tab keep their own note: neither card said anything about the other
    expect(prefillMatches(useRouteStore.getState().prefillOrigin, routePrefillState(game))).toBe(true);
    expect(noteStands()).toBe(true);
  });
});
