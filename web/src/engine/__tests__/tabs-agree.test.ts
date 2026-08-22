/**
 * The optimizer and the route income tab must settle the same route the same way: one flow
 * model, one delivered share, one interval, one load per trip. The tab has no tests of its
 * own, so this drives `routeWithFlow` — the very function it renders from — and holds the
 * result against the row the optimizer produced. What is not covered here is the tab's own
 * wiring: which arguments the page hands that function.
 */
import { describe, expect, it } from 'vitest';
import { cargoByLabel, trains, trainsMeta } from '../../dataset';
import { optimizeConsists } from '../optimize';
import { routeWithFlow, tripSetup } from '../trip';
import { cargoPaymentRate } from '../income';
import { flowPerYearFromMonthly, routeStationRating } from '../waiting';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../settings';

const cargo = cargoByLabel.get('COAL')!;
const game = DEFAULT_GAME_SETTINGS;
const calc = DEFAULT_CALC_SETTINGS;
const PRODUCTION_PER_MONTH = 30;
const DISTANCE_TILES = 96;

/** What the route income tab computes for a consist carried over with "→": its own code. */
function routeTab(
  entries: { train: (typeof trains)[number]; count: number }[],
  waitForFullLoad: boolean,
  hauled = cargo,
  settings = game,
  productionPerMonth = PRODUCTION_PER_MONTH,
) {
  return routeWithFlow({
    entries,
    cargo: hauled,
    payment: cargoPaymentRate(hauled, 'STEELTOWN', settings, calc),
    distanceTiles: DISTANCE_TILES,
    meta: trainsMeta,
    game: settings,
    calc,
    productionPerMonth,
    waitForFullLoad,
  });
}

describe('обе вкладки считают маршрут одной моделью', () => {
  const rows = optimizeConsists(trains, {
    year: 1960,
    distanceTiles: DISTANCE_TILES,
    cargo,
    economyId: 'STEELTOWN',
    maxLengthTiles: 5,
    allowElectric: false,
    productionPerMonth: PRODUCTION_PER_MONTH,
    game,
    calc,
  }, trainsMeta, 30);

  it('доля вывоза, интервал и груз за рейс совпадают со строкой оптимизатора', () => {
    const row = rows.find((r) => r.fleetSize === 1 && r.stationRating != null);
    expect(row).toBeDefined();
    const tab = routeTab(
      [
        { train: row!.engine, count: row!.engineCount },
        { train: row!.wagon, count: row!.wagonCount },
      ],
      row!.waitForFullLoad,
    );
    expect(tab.rating!.deliveredShare).toBeCloseTo(row!.stationRating!.deliveredShare, 12);
    expect(tab.economics.roundTripDays).toBeCloseTo(row!.pickupIntervalDays, 9);
    expect(tab.economics.cargoPerTrip).toBeCloseTo(row!.cargoPerTrip, 9);
    expect(tab.economics.incomePerTrip).toBe(row!.incomePerTrip);
  });

  it('ветка ожидания: та же строка, те же числа', () => {
    // The waiting branch only ever wins where JGRPP charges less for a standing consist, so
    // that is the game the row has to come from.
    const jgrpp = { ...game, jgrpp: true, costsWhenStopped: 4 };
    const production = 5;
    const waitingRows = optimizeConsists(trains, {
      year: 1960,
      distanceTiles: DISTANCE_TILES,
      cargo,
      economyId: 'STEELTOWN',
      maxLengthTiles: 5,
      allowElectric: false,
      productionPerMonth: production,
      game: jgrpp,
      calc,
    }, trainsMeta, 30);

    const row = waitingRows.find((r) => r.fleetSize === 1 && r.waitForFullLoad);
    expect(row).toBeDefined();
    const tab = routeTab(
      [
        { train: row!.engine, count: row!.engineCount },
        { train: row!.wagon, count: row!.wagonCount },
      ],
      true,
      cargo,
      jgrpp,
      production,
    );
    expect(tab.economics.waitDays).toBeGreaterThan(0);
    expect(tab.rating!.deliveredShare).toBeCloseTo(row!.stationRating!.deliveredShare, 12);
    expect(tab.economics.roundTripDays).toBeCloseTo(row!.pickupIntervalDays, 9);
    expect(tab.economics.cargoPerTrip).toBeCloseTo(row!.cargoPerTrip, 9);
    expect(tab.economics.incomePerTrip).toBe(row!.incomePerTrip);
  });

  it('рейтинг читается от предельной скорости состава, как в игре', () => {
    // A consist whose speed limit clears the 85-unit speed bonus while what it actually
    // settles at does not: `lark` + 20 bolster cars runs at 62 with a limit of 96. The game
    // stores `vcache.cached_max_speed` in the station's `last_speed` (`economy.cpp`), so the
    // bonus follows the limit — reading the settled speed instead would drop it.
    const entries = [
      { train: trains.find((t) => t.id === 'lark')!, count: 1 },
      { train: trains.find((t) => t.id === 'bolster_car_pony_gen_3A')!, count: 20 },
    ];
    // Steel is heavy enough to hold this consist well below its limit.
    const steel = cargoByLabel.get('STEL')!;
    const setup = tripSetup({
      entries, cargo: steel, payment: cargoPaymentRate(steel, 'STEELTOWN', game, calc),
      distanceTiles: DISTANCE_TILES, meta: trainsMeta, game, calc,
    });
    expect(setup.loadedSpeedInternal).toBeLessThan(85);
    expect(setup.loadedPhysics.maxSpeedInternal).toBeGreaterThan(85);

    const tab = routeTab(entries, false, steel);
    const ratingOf = routeStationRating(flowPerYearFromMonthly(PRODUCTION_PER_MONTH), game);
    const ratingAt = (maxSpeedInternal: number) =>
      ratingOf(tab.economics.roundTripDays, maxSpeedInternal);
    expect(tab.rating!.parts.speed).toBe(ratingAt(setup.loadedPhysics.maxSpeedInternal).parts.speed);
    expect(tab.rating!.parts.speed).toBeGreaterThan(ratingAt(setup.loadedSpeedInternal).parts.speed);
  });
});
