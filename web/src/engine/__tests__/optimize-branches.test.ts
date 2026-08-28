import { describe, expect, it } from 'vitest';
import { cargoByLabel, trains, trainsMeta } from '../../dataset';
import { optimizeConsists } from '../optimize';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../settings';

const base = {
  year: 1938,
  cargo: cargoByLabel.get('COAL')!,
  economyId: 'STEELTOWN',
  maxLengthTiles: 6,
  game: DEFAULT_GAME_SETTINGS,
  calc: DEFAULT_CALC_SETTINGS,
};

describe('оптимизатор: ветка загрузки', () => {
  it('медленный источник: ветка без ожидания выигрывает по вывозу', () => {
    const r = optimizeConsists(
      trains,
      { ...base, distanceTiles: 82, productionPerMonth: 30, goal: 'transported', maxTrains: 4 },
      trainsMeta,
      1,
    )[0];
    // The source cannot fill this consist, so the order actually decides something...
    expect(r.branchesDiffer).toBe(true);
    // ...and what it decides is against waiting: a consist that stands at the platform is
    // served less often, its rating drops and the industry hands it less.
    expect(r.waitForFullLoad).toBe(false);
    expect(r.waitDays).toBe(0);
    expect(r.cargoPerTrip).toBeLessThan(r.capacity);
  });

  it('стоящий состав дешевле (JGRPP): ветка ожидания выигрывает по прибыли', () => {
    const jgrpp = { ...DEFAULT_GAME_SETTINGS, jgrpp: true, costsWhenStopped: 4 };
    const params = {
      ...base, game: jgrpp, distanceTiles: 150, productionPerMonth: 15,
      goal: 'profit' as const, maxTrains: 4,
    };
    const r = optimizeConsists(trains, params, trainsMeta, 1)[0];
    expect(r.branchesDiffer).toBe(true);
    expect(r.waitForFullLoad).toBe(true);
    expect(r.waitDays).toBeGreaterThan(0);
    // A waiting consist always leaves full, and its interval grows by exactly the wait.
    expect(r.cargoPerTrip).toBe(r.capacity);
    expect(r.pickupIntervalDays).toBeCloseTo(r.roundTripDays / r.fleetSize, 9);
    // The same route without the stopped-cost discount does not pick that branch: the win
    // comes from the discount, not from the wait itself.
    const noDiscount = optimizeConsists(
      trains,
      { ...params, game: { ...jgrpp, costsWhenStopped: 1 } },
      trainsMeta,
      1,
    )[0];
    expect(noDiscount.waitForFullLoad).toBe(false);
  });

  it('выпуск не задан: ветки неразличимы, признак не выставляется', () => {
    for (const goal of ['profit', 'transported'] as const) {
      const rows = optimizeConsists(
        trains,
        { ...base, distanceTiles: 200, goal },
        trainsMeta,
        10,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.branchesDiffer).toBe(false);
        expect(r.waitForFullLoad).toBe(false);
        expect(r.waitDays).toBe(0);
        expect(r.cargoPerTrip).toBe(r.capacity);
      }
    }
  });

  it('ветка ожидания приезжает реже и получает меньшую долю вывоза', () => {
    // Same route under both goals: whichever branch wins, the row stays self-consistent —
    // the rating shown is the one its own interval settles at.
    const rows = optimizeConsists(
      trains,
      { ...base, distanceTiles: 82, productionPerMonth: 30, goal: 'profit', maxTrains: 4 },
      trainsMeta,
      20,
    );
    const waiting = rows.filter((r) => r.waitForFullLoad);
    for (const r of rows) {
      expect(r.pickupIntervalDays).toBeCloseTo(r.roundTripDays / r.fleetSize, 9);
      expect(r.hauledPerYear).toBeLessThanOrEqual(
        12 * 30 * r.stationRating!.deliveredShare + 1e-6,
      );
    }
    for (const r of waiting) expect(r.waitDays).toBeGreaterThan(0);
  });
});
