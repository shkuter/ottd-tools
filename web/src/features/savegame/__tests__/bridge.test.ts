import { describe, expect, it } from 'vitest';
import { routeRows, stationStops, type RouteRow } from '../routeRows';
import {
  chainTaskToSupply,
  incomePrefillValues,
  industryToOptimizer,
  loadingFlow,
  routeToIncome,
  routeToOptimizer,
} from '../bridge';
import { DEFAULT_GAME_SETTINGS } from '../../../engine/settings';
import { buildSnapshot } from '../../../savegame/snapshot';
import { readSavegame, type RawSavegame } from '../../../savegame/read';
import { snapshotSettings, type SnapshotSettings } from '../../../savegame/snapshotStore';
import { buildImport } from '../../../savegame/import';
import { fixture } from '../../../savegame/__tests__/fixture';
import type { Snapshot } from '../../../savegame/snapshot';

let cached: RawSavegame | undefined;
async function raw(): Promise<RawSavegame> {
  cached ??= await readSavegame(fixture('londworth-1975'));
  return cached;
}

async function londworth(): Promise<{ snapshot: Snapshot; settings: SnapshotSettings }> {
  const base = await raw();
  const proposal = buildImport(base);
  return { snapshot: buildSnapshot(base), settings: snapshotSettings(proposal.game, proposal.calc) };
}

async function rows(): Promise<{ rows: RouteRow[]; snapshot: Snapshot }> {
  const { snapshot, settings } = await londworth();
  return { rows: routeRows(snapshot, settings, 0), snapshot };
}

describe('route to Route income', () => {
  it('carries the whole trip where the route is one leg the model applies to', async () => {
    const { rows: all, snapshot } = await rows();
    const row = all.find((r) => r.forecast !== null)!;
    const bridge = routeToIncome(row, snapshot);

    expect(bridge.blocker).toBeUndefined();
    expect(bridge.values!.entries).toEqual(row.entries);
    expect(bridge.values!.cargo).toBe(row.cargo);
    expect(bridge.values!.trip).not.toBeNull();
    expect(bridge.values!.trip!.distanceTiles).toBe(row.distanceTiles);
    // the same capacity the card's forecast was priced over
    expect(bridge.values!.trip!.amount).toBe(row.forecast!.capacity);
  });

  it('a ring route carries its consist and cargo, and nothing that needs one leg', async () => {
    const { rows: all, snapshot } = await rows();
    const ring = all.find((r) => r.blocker === 'multiStop' && r.entries !== null && r.cargo);
    // the game this fixture came from has such a route; without one the rule is untested
    expect(ring, 'a route of more than two stops').toBeDefined();
    const bridge = routeToIncome(ring!, snapshot);

    expect(bridge.blocker).toBeUndefined();
    expect(bridge.values!.entries).toEqual(ring!.entries);
    expect(bridge.values!.trip).toBeNull();
  });

  it('refuses a fleet built two different ways, naming the fleet', async () => {
    const { rows: all, snapshot } = await rows();
    const base = all.find((r) => r.forecast !== null)!;
    const mixed: RouteRow = { ...base, consist: null, entries: null, blocker: 'mixedFleet' };

    expect(routeToIncome(mixed, snapshot).blocker).toBe('mixedFleet');
  });

  it('refuses a consist holding a vehicle the catalogue does not know', async () => {
    const { rows: all, snapshot } = await rows();
    const base = all.find((r) => r.forecast !== null)!;
    const unmatched: RouteRow = { ...base, entries: null };

    expect(routeToIncome(unmatched, snapshot).blocker).toBe('unmatchedVehicle');
  });

  it('names the fleet, not the number of stops, on a ring route built two ways', async () => {
    const { rows: all, snapshot } = await rows();
    const base = all.find((r) => r.forecast !== null)!;
    const ringMixed: RouteRow = {
      ...base,
      stops: [...base.stops, { kind: 'station', stationId: base.stops[0]!.stationId, fullLoad: false }],
      consist: null,
      entries: null,
    };

    // the card would say "more than two stops" here; the bridge says what actually stops it
    expect(routeToIncome(ringMixed, snapshot).blocker).toBe('mixedFleet');
  });

  it('carries the consist but not the trip where the catalogue gives it no capacity', async () => {
    const { rows: all, snapshot } = await rows();
    const base = all.find((r) => r.forecast !== null)!;
    // the game hauls this cargo; the catalogue disagrees, so the trip cannot be priced —
    // but the consist and the cargo are still exactly what the route runs
    const noCapacity: RouteRow = { ...base, forecast: null, blocker: 'cargoNotCarried' };
    const bridge = routeToIncome(noCapacity, snapshot);

    expect(bridge.blocker).toBeUndefined();
    expect(bridge.values!.entries).toEqual(base.entries);
    expect(bridge.values!.trip).toBeNull();
  });

  it('carries no cargo where none is known', async () => {
    const { rows: all, snapshot } = await rows();
    const base = all.find((r) => r.forecast !== null)!;

    expect(routeToIncome({ ...base, cargo: null }, snapshot).blocker).toBe('noCargo');
  });

  it('states the trip as a prefill, timing it by the consist', async () => {
    const { rows: all, snapshot } = await rows();
    const row = all.find((r) => r.forecast !== null)!;
    const values = incomePrefillValues(routeToIncome(row, snapshot).values!);

    expect(values.cargoLabel).toBe(row.cargo!.label);
    expect(values.consist).toEqual(row.entries!.map((e) => ({ id: e.train.id, count: e.count })));
    expect(values.manualDays).toBeNull();
  });
});

describe('a game played without Iron Horse', () => {
  it('carries its vanilla consist as catalogue rows all the same', async () => {
    const base = await readSavegame(fixture('vanilla-1951'));
    const proposal = buildImport(base);
    const settings = snapshotSettings(proposal.game, proposal.calc);
    const snapshot = buildSnapshot(base);
    expect(settings.game.trainSet, 'the fixture is a vanilla game').toBe('vanilla');

    const company = snapshot.routes[0]?.companyId ?? 0;
    const row = routeRows(snapshot, settings, company).find((r) => r.entries !== null);
    expect(row, 'a route with a matched consist').toBeDefined();

    const bridge = routeToIncome(row!, snapshot);
    expect(bridge.values!.entries.length).toBeGreaterThan(0);
    // vanilla rows, and every one of them a real catalogue entry rather than a stub
    expect(bridge.values!.entries.every((e) => e.train.id.startsWith('vanilla_'))).toBe(true);
  });
});

describe('route to Best train', () => {
  it('carries cargo, leg and flow', async () => {
    const { rows: all, snapshot } = await rows();
    const row = all.find((r) => r.forecast !== null)!;
    const bridge = routeToOptimizer(row, snapshot);

    expect(bridge.values!.cargoLabel).toBe(row.cargo!.label);
    expect(bridge.values!.distanceTiles).toBe(row.distanceTiles);
    expect(bridge.values!.productionPerMonth).toBe(loadingFlow(row, snapshot));
  });

  it('is open where the income bridge is shut by the consist', async () => {
    const { rows: all, snapshot } = await rows();
    const base = all.find((r) => r.forecast !== null)!;
    const unmatched: RouteRow = { ...base, entries: null };

    expect(routeToIncome(unmatched, snapshot).blocker).toBe('unmatchedVehicle');
    const bridge = routeToOptimizer(unmatched, snapshot);
    expect(bridge.blocker).toBeUndefined();
    expect(bridge.values!.cargoLabel).toBe(base.cargo!.label);
    expect(bridge.values!.distanceTiles).toBe(base.distanceTiles);
  });

  it('leaves the leg alone on a ring route', async () => {
    const { rows: all, snapshot } = await rows();
    const ring = all.find((r) => r.blocker === 'multiStop' && r.cargo)!;
    const bridge = routeToOptimizer(ring, snapshot);

    expect(bridge.values!.cargoLabel).toBe(ring.cargo!.label);
    expect(bridge.values!.distanceTiles).toBeUndefined();
    expect(bridge.values!.productionPerMonth).toBeUndefined();
  });

  it('leaves the leg alone where the save stated no distance, but still carries the flow', async () => {
    const { rows: all, snapshot } = await rows();
    const base = all.find(
      (r) => r.forecast !== null && (loadingFlow(r, snapshot) ?? 0) > 0,
    )!;
    const bridge = routeToOptimizer({ ...base, distanceTiles: null }, snapshot);

    expect(bridge.values!.cargoLabel).toBe(base.cargo!.label);
    expect(bridge.values!.distanceTiles).toBeUndefined();
    // the flow belongs to the loading end, which this route has either way
    expect(bridge.values!.productionPerMonth).toBe(loadingFlow(base, snapshot));
  });

  it('carries no consist: the optimizer picks one itself', async () => {
    const { rows: all, snapshot } = await rows();
    const row = all.find((r) => r.forecast !== null)!;

    expect(Object.keys(routeToOptimizer(row, snapshot).values!)).not.toContain('consist');
  });

  it('refuses only where the cargo is unknown', async () => {
    const { rows: all, snapshot } = await rows();
    const base = all.find((r) => r.forecast !== null)!;

    expect(routeToOptimizer({ ...base, cargo: null }, snapshot).blocker).toBe('noCargo');
  });
});

describe('industry to Best train', () => {
  it('carries the cargo picked, not the first one the industry makes', () => {
    const two = {
      id: 1,
      catalogueId: null,
      townId: null,
      produced: [
        { label: 'OIL_', slot: 3, lastMonthProduction: 60, lastMonthTransported: 60 },
        { label: 'RFPR', slot: 4, lastMonthProduction: 90, lastMonthTransported: 10 },
      ],
    };
    const bridge = industryToOptimizer(two.produced[1]!);

    expect(bridge.values!.cargoLabel).toBe('RFPR');
    expect(bridge.values!.productionPerMonth).toBe(90);
  });

  it('carries the cargo picked and what the industry made of it', async () => {
    const { snapshot } = await londworth();
    const industry = snapshot.industries.find((i) =>
      i.produced.some((p) => p.label !== null && (p.lastMonthProduction ?? 0) > 0),
    )!;
    const produced = industry.produced.find(
      (p) => p.label !== null && (p.lastMonthProduction ?? 0) > 0,
    )!;
    const bridge = industryToOptimizer(produced);

    expect(bridge.values!.cargoLabel).toBe(produced.label);
    expect(bridge.values!.productionPerMonth).toBe(produced.lastMonthProduction);
  });

  it('has nothing to carry from a cargo the save stated no month for', () => {
    expect(
      industryToOptimizer({
        label: 'COAL',
        slot: 1,
        lastMonthProduction: null,
        lastMonthTransported: null,
      }).blocker,
    ).toBe('noCargo');
  });
});

/** What the industries feeding one station make of one cargo, added up by hand. */
function flowAt(snapshot: Snapshot, stationId: number | null, label: string): number {
  const station = snapshot.stations.find((s) => s.id === stationId);
  if (!station) return 0;
  return snapshot.industries
    .filter((i) => station.supplierIds.includes(i.id))
    .flatMap((i) => i.produced)
    .filter((p) => p.label === label)
    .reduce((sum, p) => sum + (p.lastMonthProduction ?? 0), 0);
}

describe('the loading end of a leg', () => {
  it('sums what the industries in its catchment make of the cargo hauled', async () => {
    const { rows: all, snapshot } = await rows();
    const withFlow = all.filter((r) => r.forecast !== null && (loadingFlow(r, snapshot) ?? 0) > 0);
    expect(withFlow.length, 'a route loading at a served station').toBeGreaterThan(0);

    for (const row of withFlow) {
      const ends = stationStops(row.stops).map((stop) => stop.stationId);
      const sums = ends.map((id) => flowAt(snapshot, id, row.cargo!.label));
      // the figure is one end's output, not both ends added together
      expect(sums).toContain(loadingFlow(row, snapshot));
    }
  });

  it('loads at the end the game keeps a rating for, not simply at the first stop', async () => {
    const { rows: all, snapshot } = await rows();
    // a route whose two ends disagree about which of them the cargo is rated at, and whose
    // rated end is not the one the orders happen to start with
    const row = all.find((r) => {
      const ends = stationStops(r.stops).map((s) => s.stationId);
      if (ends.length !== 2 || r.cargo === null) return false;
      const rated = ends.filter((id) =>
        snapshot.stations
          .find((s) => s.id === id)
          ?.goods.some((g) => g.label === r.cargo!.label && g.rating !== null),
      );
      return rated.length === 1 && rated[0] !== ends[0];
    });
    expect(row, 'a route rated at its far end').toBeDefined();

    const ends = stationStops(row!.stops).map((s) => s.stationId);
    const rated = ends.find((id) =>
      snapshot.stations
        .find((s) => s.id === id)
        ?.goods.some((g) => g.label === row!.cargo!.label && g.rating !== null),
    );
    // the flow is the rated end's, so taking the first stop instead would be wrong here
    expect(loadingFlow(row!, snapshot)).toBe(flowAt(snapshot, rated!, row!.cargo!.label));
  });

  it('adds up two mines feeding the same station', async () => {
    const { rows: all, snapshot } = await rows();
    const row = all.find((r) => r.forecast !== null && (loadingFlow(r, snapshot) ?? 0) > 0)!;
    const label = row.cargo!.label;
    const loading = stationStops(row.stops)
      .map((s) => s.stationId)
      .find((id) => flowAt(snapshot, id, label) === loadingFlow(row, snapshot))!;

    // two industries in the same catchment, making 144 and 96 of what the route hauls
    const seeded: Snapshot = {
      ...snapshot,
      stations: snapshot.stations.map((s) =>
        s.id === loading ? { ...s, supplierIds: [9001, 9002] } : { ...s, supplierIds: [] },
      ),
      industries: [
        {
          id: 9001,
          catalogueId: null,
          townId: null,
          plot: null,
          produced: [{ label, slot: 0, lastMonthProduction: 144, lastMonthTransported: 0 }],
        },
        {
          id: 9002,
          catalogueId: null,
          townId: null,
          plot: null,
          produced: [{ label, slot: 0, lastMonthProduction: 96, lastMonthTransported: 0 }],
        },
      ],
    };

    expect(loadingFlow(row, seeded)).toBe(240);
  });

  it('states no flow for a cargo none of the suppliers makes', async () => {
    const { rows: all, snapshot } = await rows();
    const row = all.find((r) => r.forecast !== null)!;
    // the station is served by industries, but none of them makes what this route hauls —
    // a passenger run out of a town is the everyday case. Zero would be a claim; it is not one
    const otherCargo: Snapshot = {
      ...snapshot,
      industries: snapshot.industries.map((industry) => ({
        ...industry,
        produced: industry.produced.map((p) => ({ ...p, label: '__NOBODY__' })),
      })),
    };

    expect(loadingFlow(row, otherCargo)).toBeNull();
    expect(routeToOptimizer(row, otherCargo).values!.productionPerMonth).toBeUndefined();
  });

  it('states no flow at all where the snapshot worked out no catchment', async () => {
    const { rows: all, snapshot } = await rows();
    const stripped: Snapshot = {
      ...snapshot,
      stations: snapshot.stations.map((s) => ({ ...s, supplierIds: [] })),
    };
    const row = all.find((r) => r.forecast !== null)!;

    expect(loadingFlow(row, stripped)).toBeNull();
  });

  it('an unanswerable flow reads as "not given" on the income tab, and is left out of the optimizer', async () => {
    const { rows: all, snapshot } = await rows();
    const stripped: Snapshot = {
      ...snapshot,
      stations: snapshot.stations.map((s) => ({ ...s, supplierIds: [] })),
    };
    const row = all.find((r) => r.forecast !== null)!;

    expect(routeToIncome(row, stripped).values!.trip!.productionPerMonth).toBe(0);
    // writing a zero here would overwrite whatever the user had entered before
    expect(routeToOptimizer(row, stripped).values!.productionPerMonth).toBeUndefined();
  });
});

describe('chainTaskToSupply', () => {
  const firsGame = { ...DEFAULT_GAME_SETTINGS, firs: true };
  const task = {
    cargoLabel: 'COAL',
    industryId: 'coke_oven',
    distanceTiles: 40,
    productionPerMonth: 144,
  };

  it('carries the industry, cargo and both figures of a game', () => {
    expect(chainTaskToSupply(task, firsGame).values).toEqual({
      industryId: 'coke_oven',
      cargoLabel: 'COAL',
      distanceTiles: 40,
      productionPerMonth: 144,
    });
  });

  it('carries the pair alone when there is no game to measure by', () => {
    const values = chainTaskToSupply(
      { ...task, distanceTiles: null, productionPerMonth: null },
      firsGame,
    ).values;
    // the two figures are left out entirely, so what the player typed on the tab stands
    expect(values).toEqual({ industryId: 'coke_oven', cargoLabel: 'COAL' });
  });

  it('refuses a cargo the active set does not have, and says why', () => {
    expect(chainTaskToSupply({ ...task, cargoLabel: 'NOPE' }, firsGame).blocker).toBe('noCargo');
  });

  it('refuses an industry the active economy does not have, and says why', () => {
    expect(chainTaskToSupply({ ...task, industryId: 'nonexistent' }, firsGame).blocker)
      .toBe('noIndustry');
  });
});
