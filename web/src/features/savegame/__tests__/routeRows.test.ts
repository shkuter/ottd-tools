import { describe, expect, it } from 'vitest';
import { routeRows } from '../routeRows';
import { buildSnapshot } from '../../../savegame/snapshot';
import { readSavegame, type RawSavegame } from '../../../savegame/read';
import { snapshotSettings, type SnapshotSettings } from '../../../savegame/snapshotStore';
import { buildImport } from '../../../savegame/import';
import { fixture } from '../../../savegame/__tests__/fixture';
import type { Snapshot, SnapshotTrain } from '../../../savegame/snapshot';
import { useSettingsStore } from '../../../state/settingsStore';
import { activeTrainsMeta } from '../../../dataset';
import { consistStats } from '../../../engine/consist';

let cached: RawSavegame | undefined;
async function raw(): Promise<RawSavegame> {
  cached ??= await readSavegame(fixture('londworth-1975'));
  return cached;
}

async function londworth(): Promise<{ snapshot: Snapshot; settings: SnapshotSettings }> {
  const base = await raw();
  const proposal = buildImport(base);
  return {
    snapshot: buildSnapshot(base),
    settings: snapshotSettings(proposal.game, proposal.calc),
  };
}

describe('route rows of a real game', () => {
  it('states the fleet, its cargo and both years of profit', async () => {
    const { snapshot, settings } = await londworth();
    const rows = routeRows(snapshot, settings, 0);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.trains.length).toBeGreaterThan(0);
      // the fleet's profit is the sum of its trains', not one train's
      expect(row.profitLastYear).toBe(
        row.trains.reduce((sum: number, t: SnapshotTrain) => sum + t.profitLastYear, 0),
      );
      expect(row.profitThisYear).toBe(
        row.trains.reduce((sum: number, t: SnapshotTrain) => sum + t.profitThisYear, 0),
      );
    }
  });

  it('forecasts the plain two-station routes and prices the whole fleet', async () => {
    const { snapshot, settings } = await londworth();
    const rows = routeRows(snapshot, settings, 0);
    const forecast = rows.filter((row) => row.forecast !== null);

    expect(forecast.length).toBeGreaterThan(0);
    for (const row of forecast) {
      expect(row.blocker).toBeNull();
      expect(row.cargo).not.toBeNull();
      expect(row.distanceTiles).toBeGreaterThan(0);
      expect(row.forecast!.capacity).toBeGreaterThan(0);
      // yearly figures are stated for the fleet, so a bigger fleet earns more of the same
      expect(row.forecast!.incomePerTrip).toBeGreaterThan(0);
    }
  });

  it('every route without a forecast says why', async () => {
    const { snapshot, settings } = await londworth();
    for (const row of routeRows(snapshot, settings, 0)) {
      expect(row.forecast === null).toBe(row.blocker !== null);
    }
  });

  it('another company gets its own rows, an unknown one gets none', async () => {
    const { snapshot, settings } = await londworth();
    expect(routeRows(snapshot, settings, 0).length).toBeGreaterThan(0);
    expect(routeRows(snapshot, settings, 7)).toEqual([]);
  });

  it('the forecast follows the snapshot, not the settings edited since', async () => {
    const { snapshot, settings } = await londworth();
    const before = routeRows(snapshot, settings, 0).find((row) => row.forecast !== null)!;

    // settings do move the figures: a slower economy fits fewer trips into the year
    const slower = {
      game: { ...settings.game, dayLengthFactor: settings.game.dayLengthFactor * 4 },
      calc: settings.calc,
    };
    const after = routeRows(snapshot, slower, 0).find((row) => row.id === before.id)!;
    expect(after.forecast!.profitPerYear).not.toBe(before.forecast!.profitPerYear);

    // and yet editing the calculator's own settings leaves the snapshot's figures alone,
    // because the rows are computed from what was passed in, never from the store
    useSettingsStore.getState().applySettings({ vehicleCosts: 2, dayLengthFactor: 8 }, {});
    const stillSame = routeRows(snapshot, settings, 0).find((row) => row.id === before.id)!;
    expect(stillSame.forecast!.profitPerYear).toBe(before.forecast!.profitPerYear);
    useSettingsStore.getState().reset();
  });

  it('runs every route on the track its own consist needs, not the one in the settings', async () => {
    const { snapshot, settings } = await londworth();
    const before = routeRows(snapshot, settings, 0).filter((row) => row.forecast !== null);

    // the track type is the one setting the tab is deaf to: a route's track comes from the
    // consist that runs it, so picking another one on the searching tabs moves nothing here
    for (const trackType of ['ELRL', 'NAAN', 'MTRO']) {
      const rows = routeRows(snapshot, { ...settings, calc: { ...settings.calc, trackType } }, 0);
      for (const was of before) {
        const now = rows.find((row) => row.id === was.id)!;
        expect(now.forecast!.profitPerYear).toBe(was.forecast!.profitPerYear);
        expect(now.forecast!.loadedSpeedInternal).toBe(was.forecast!.loadedSpeedInternal);
      }
    }
  });

  it('an electric fleet is forecast on its full power, not stalled on plain rail', async () => {
    const { snapshot, settings } = await londworth();
    const source = routeRows(snapshot, settings, 0).find((row) => row.forecast !== null)!;
    const route = snapshot.routes.find((r) => r.id === source.id)!;
    // swap the fleet's engine for one that only runs under wires, leaving its wagons —
    // and so the cargo — alone. The settings still say plain rail, where this engine makes
    // no power at all; the route has to be read as electrified because its train is.
    const engineIds = new Set(
      source.entries!.filter((entry) => entry.train.kind === 'engine').map((e) => e.train.id),
    );
    const patched: Snapshot = {
      ...snapshot,
      trains: snapshot.trains.map((t) =>
        route.trainIds.includes(t.id)
          ? {
            ...t,
            consist: t.consist.map((part) =>
              part.catalogueId !== null && engineIds.has(part.catalogueId)
                ? { ...part, catalogueId: 'pinhorse' }
                : part),
          }
          : t,
      ),
    };

    expect(settings.calc.trackType).toBe('RAIL');
    const row = routeRows(patched, settings, 0).find((r) => r.id === route.id)!;
    expect(row.blocker).toBeNull();

    // what the settings would have given: no power at all, and the crawl a train makes on
    // none. The forecast has to stand clear of it, or the track came from the wrong place.
    const meta = activeTrainsMeta(settings.game);
    const statsOn = (trackType: string) =>
      consistStats(row.entries!, null, settings.calc.capacityIndex, meta, settings.game, {
        ...settings.calc,
        trackType,
      });
    const onPlainRail = statsOn('RAIL');
    const onWires = statsOn('ELRL');
    expect(onPlainRail.powerHp).toBe(0);
    expect(onWires.powerHp).toBeGreaterThan(0);
    expect(row.forecast!.loadedSpeedInternal).toBeGreaterThan(
      onPlainRail.balancingSpeedInternal,
    );
  });
});

describe('when the model does not apply', () => {
  async function withRoute(patch: Partial<Snapshot['routes'][number]>, trainPatch?: (t: SnapshotTrain) => SnapshotTrain) {
    const { snapshot, settings } = await londworth();
    const source = routeRows(snapshot, settings, 0).find((row) => row.forecast !== null)!;
    const route = snapshot.routes.find((r) => r.id === source.id)!;
    const trains = trainPatch
      ? snapshot.trains.map((t) => (route.trainIds.includes(t.id) ? trainPatch(t) : t))
      : snapshot.trains;
    const patched: Snapshot = {
      ...snapshot,
      trains,
      routes: snapshot.routes.map((r) => (r.id === route.id ? { ...r, ...patch } : r)),
    };
    return routeRows(patched, settings, 0).find((row) => row.id === route.id)!;
  }

  it('a single station stop has no leg to run', async () => {
    const row = await withRoute({ stops: [{ kind: 'station', stationId: 1, fullLoad: false }] });
    expect(row.blocker).toBe('oneStop');
    expect(row.forecast).toBeNull();
  });

  it('a longer rotation is a different shape, not a longer leg', async () => {
    const row = await withRoute({
      stops: [
        { kind: 'station', stationId: 1, fullLoad: false },
        { kind: 'station', stationId: 2, fullLoad: false },
        { kind: 'station', stationId: 3, fullLoad: false },
      ],
    });
    expect(row.blocker).toBe('multiStop');
  });

  it('no distance without a map size', async () => {
    const row = await withRoute({ legTiles: [] });
    expect(row.blocker).toBe('noDistance');
  });

  it('a fleet of different consists is not one consist repeated', async () => {
    const { snapshot, settings } = await londworth();
    const shared = routeRows(snapshot, settings, 0).find(
      (row) => row.trains.length > 1 && row.forecast !== null,
    )!;
    const [first] = shared.trains;
    const patched: Snapshot = {
      ...snapshot,
      trains: snapshot.trains.map((t) =>
        t.id === first.id ? { ...t, consist: [...t.consist, { catalogueId: null, count: 1 }] } : t,
      ),
    };
    const row = routeRows(patched, settings, 0).find((r) => r.id === shared.id)!;
    expect(row.blocker).toBe('mixedFleet');
    expect(row.consist).toBeNull();
  });

  it('one unmatched vehicle is enough to withhold the forecast', async () => {
    const { snapshot, settings } = await londworth();
    const source = routeRows(snapshot, settings, 0).find((row) => row.forecast !== null)!;
    const route = snapshot.routes.find((r) => r.id === source.id)!;
    // every train of the fleet gets the same foreign wagon, so the fleet stays uniform and
    // the blocker is the vehicle, not the mix
    const patched: Snapshot = {
      ...snapshot,
      trains: snapshot.trains.map((t) =>
        route.trainIds.includes(t.id)
          ? { ...t, consist: [...t.consist, { catalogueId: null, count: 1 }] }
          : t,
      ),
    };
    const row = routeRows(patched, settings, 0).find((r) => r.id === route.id)!;
    expect(row.blocker).toBe('unmatchedVehicle');
    expect(row.forecast).toBeNull();
  });

  it('a consist the catalogue gives no room for this cargo states that, not a loss', async () => {
    const { snapshot, settings } = await londworth();
    const source = routeRows(snapshot, settings, 0).find((row) => row.forecast !== null)!;
    const route = snapshot.routes.find((r) => r.id === source.id)!;
    // the game hauls this cargo, but the catalogue's refit list for these wagons does not
    // hold it — pricing it anyway would state running costs against an income of zero
    const patched: Snapshot = {
      ...snapshot,
      trains: snapshot.trains.map((t) =>
        route.trainIds.includes(t.id)
          ? { ...t, cargo: t.cargo.map((c) => ({ ...c, label: 'PASS' })) }
          : t,
      ),
    };
    const row = routeRows(patched, settings, 0).find((r) => r.id === route.id)!;
    expect(row.blocker).toBe('cargoNotCarried');
    expect(row.forecast).toBeNull();
  });

  it('no cargo the calculator knows means nothing to be paid for', async () => {
    const { snapshot, settings } = await londworth();
    const source = routeRows(snapshot, settings, 0).find((row) => row.forecast !== null)!;
    const route = snapshot.routes.find((r) => r.id === source.id)!;
    const patched: Snapshot = {
      ...snapshot,
      trains: snapshot.trains.map((t) =>
        route.trainIds.includes(t.id)
          ? { ...t, cargo: t.cargo.map((c) => ({ ...c, label: null })) }
          : t,
      ),
    };
    const row = routeRows(patched, settings, 0).find((r) => r.id === route.id)!;
    expect(row.blocker).toBe('noCargo');
  });
});
