/**
 * An imported game for the tests to look at — the component tests here and the
 * rendered-page checks, which seed it into the browser (the tab does not exist without a
 * snapshot, and a fresh browser context has none).
 *
 * Small and hand-written rather than a real save: what matters is that every state the
 * lists can render is present — a route with a forecast and one without, a station with a
 * rating and one without, a vehicle the catalogue does not know, a station nobody owns.
 */

import { OWNER_NONE } from '../../../savegame/extract/stnn';
import {
  snapshotSettings,
  SNAPSHOT_SCHEMA_VERSION,
  type SnapshotRecord,
} from '../../../savegame/snapshotStore';

export const GAME_SNAPSHOT: SnapshotRecord = {
  // taken from the store, not repeated: a bumped schema would otherwise turn this fixture
  // into an outdated record and the tab would quietly stop existing for the checks
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  fileName: 'checks.sav',
  savedAt: Date.UTC(2026, 7, 25),
  // партия играна с Iron Horse и FIRS — в ней ходят их машины и грузы (Quicklime и прочие);
  // по умолчанию наборы выключены, поэтому фикстура называет их явно
  settings: snapshotSettings({ trainSet: 'iron_horse', firs: true }, {}),
  snapshot: {
    soldIds: null,
    companies: [
      {
        id: 0,
        name: 'Checks & Co',
        isAi: false,
        // the counts the game's infrastructure window would show for this company
        network: {
          rail: { RAIL: 240, ELRL: 60 },
          signals: 18,
          stations: 12,
          road: { ROAD: 8 },
          tram: {},
          canals: 2,
        },
      },
      {
        id: 1,
        name: '',
        isAi: true,
        network: { rail: { RAIL: 30 }, signals: 2, stations: 3, road: {}, tram: {}, canals: 0 },
      },
    ],
    towns: [
      { id: 0, name: 'Checkford' },
      { id: 1, name: 'Renderbury' },
    ],
    stations: [
      {
        id: 0,
        companyId: 0,
        townId: 0,
        customName: '',
        suffixKey: 'STR_SV_STNAME',
        nameNumber: 0,
        isWaypoint: false,
        goods: [
          { label: 'QLME', slot: 34, rating: 168, waiting: 240 },
          // a cargo the game shows no rating for: the column stays empty here too
          { label: 'GRVL', slot: 1, rating: null, waiting: 0 },
        ],
        // the works next door: what this station's lime is loaded from
        supplierIds: [1],
      },
      {
        id: 1,
        companyId: 0,
        townId: 1,
        customName: 'Renderbury Works',
        suffixKey: null,
        nameNumber: 1,
        isWaypoint: false,
        goods: [{ label: 'QLME', slot: 34, rating: 92, waiting: 60 }],
        supplierIds: [],
      },
      // an oil rig stands on water and belongs to nobody, as in the game
      {
        id: 2,
        companyId: OWNER_NONE,
        townId: 0,
        customName: 'Nobody Rig',
        suffixKey: null,
        nameNumber: 2,
        isWaypoint: false,
        goods: [],
        supplierIds: [],
      },
      // a waypoint is no station: nothing waits on it and the game rates nothing there
      {
        id: 3,
        companyId: 0,
        townId: 0,
        customName: 'Checkford Crossing',
        suffixKey: null,
        nameNumber: 3,
        isWaypoint: true,
        goods: [],
        supplierIds: [],
      },
      // the AI's own station: it belongs in the AI's list, not in this company's
      {
        id: 4,
        companyId: 1,
        townId: 1,
        customName: 'Rival Yard',
        suffixKey: null,
        nameNumber: 4,
        isWaypoint: false,
        goods: [{ label: 'GRVL', slot: 1, rating: 40, waiting: 10 }],
        supplierIds: [],
      },
    ],
    routes: [
      {
        id: 0,
        companyId: 0,
        stops: [
          { kind: 'station', stationId: 0, fullLoad: true },
          { kind: 'station', stationId: 1, fullLoad: false },
        ],
        trainIds: [0, 1],
        legTiles: [96, 96],
      },
      // no forecast: the consist holds a vehicle from a set the catalogue does not know
      {
        id: 1,
        companyId: 0,
        stops: [
          { kind: 'station', stationId: 1, fullLoad: false },
          { kind: 'station', stationId: 0, fullLoad: false },
        ],
        trainIds: [2],
        legTiles: [96, 96],
      },
    ],
    trains: [
      {
        id: 0,
        companyId: 0,
        groupId: 0,
        routeId: 0,
        unitNumber: 1,
        name: '',
        buildYear: 1955,
        profitThisYear: 41_200,
        profitLastYear: 96_400,
        stopped: false,
        consist: [
          { catalogueId: 'haar', count: 1 },
          { catalogueId: 'mineral_covered_hopper_combos_pony_gen_2A', count: 8 },
        ],
        cargo: [{ label: 'QLME', slot: 34, capacity: 240, loaded: 240 }],
      },
      {
        id: 1,
        companyId: 0,
        groupId: 1,
        routeId: 0,
        unitNumber: 2,
        name: 'Old Faithful',
        buildYear: 1951,
        profitThisYear: 28_900,
        profitLastYear: 71_300,
        stopped: true,
        consist: [
          { catalogueId: 'haar', count: 1 },
          { catalogueId: 'mineral_covered_hopper_combos_pony_gen_2A', count: 8 },
        ],
        cargo: [{ label: 'QLME', slot: 34, capacity: 240, loaded: 0 }],
      },
      {
        id: 2,
        companyId: 0,
        groupId: null,
        routeId: 1,
        unitNumber: 3,
        name: '',
        buildYear: 1960,
        profitThisYear: 5_100,
        profitLastYear: 12_000,
        stopped: false,
        consist: [
          { catalogueId: 'haar', count: 1 },
          { catalogueId: null, count: 3 },
        ],
        cargo: [{ label: 'GRVL', slot: 1, capacity: 90, loaded: 45 }],
      },
    ],
    groups: [
      { id: 0, name: 'Ore trains', parent: null, companyId: 0 },
      { id: 1, name: 'Veterans', parent: 0, companyId: 0 },
    ],
    industries: [
      {
        id: 0,
        catalogueId: 'iron_ore_mine',
        townId: 0,
        produced: [{ label: 'IORE', slot: 12, lastMonthProduction: 144, lastMonthTransported: 96 }],
      },
      // a type the catalogue does not know at all
      {
        id: 1,
        catalogueId: null,
        townId: 1,
        produced: [{ label: 'QLME', slot: 34, lastMonthProduction: 80, lastMonthTransported: 80 }],
      },
      // a type only the base game has: FIRS knows no power station, so this one is named
      // through the vanilla set or not at all
      {
        id: 2,
        catalogueId: 'power_station',
        townId: 0,
        produced: [],
      },
    ],
  },
};
