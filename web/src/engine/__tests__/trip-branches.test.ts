import { describe, expect, it } from 'vitest';
import { cargoByLabel, trains, trainsMeta } from '../../dataset';
import { tripBranches, tripEconomics, tripSetup } from '../trip';
import { DEFAULT_GAME_SETTINGS, daysPerEconomyYear, effectiveDayLength } from '../settings';
import { transportedGoodsIncome } from '../income';
import { transitPeriodsFromDays } from '../units';

const coal = cargoByLabel.get('COAL')!;
const payment = coal.initial_payment_by_economy.STEELTOWN;
const engine = trains.find(
  (t) => t.kind === 'engine' && t.power_hp > 0 && t.base_track_type === 'RAIL',
)!;
const hopper = trains.find(
  (t) => t.kind === 'wagon' && t.id.startsWith('coal_hopper_car_type_1_pony') && (t.capacities[2] ?? 0) > 0,
)!;
const entries = [
  { train: engine, count: 1 },
  { train: hopper, count: 14 },
];
const jgrpp = { ...DEFAULT_GAME_SETTINGS, jgrpp: true, dayLengthFactor: 5, costsWhenStopped: 4 };

/**
 * Numbers taken off `trip.ts` before the loading branches existed. The branch that runs with
 * what accumulated has to reproduce them exactly, so any drift in the money is a change of
 * arithmetic rather than a change of branch.
 */
const BASELINE = {
  plain: {
      capacity: 224,
      cargoPerTrip: 224,
      loadedSpeedInternal: 72,
      emptySpeedInternal: 72,
      daysLoaded: 38.43843843843844,
      daysEmpty: 38.43843843843844,
      loadingDays: 2.1621621621621623,
      roundTripDays: 79.03903903903904,
      tripsPerYear: 4.617971124620061,
      incomePerTrip: 9630,
      runningCostPerYear: 4385,
      buyCostTotal: 12483,
      profitPerYear: 40086.061930091186,
      paybackYears: 0.31140499712268954,
    },
  capped: {
      capacity: 224,
      cargoPerTrip: 40,
      loadedSpeedInternal: 72,
      emptySpeedInternal: 72,
      daysLoaded: 38.43843843843844,
      daysEmpty: 38.43843843843844,
      loadingDays: 2.1621621621621623,
      roundTripDays: 79.03903903903904,
      tripsPerYear: 4.617971124620061,
      incomePerTrip: 1719,
      runningCostPerYear: 13155,
      buyCostTotal: 37449,
      profitPerYear: 10659.877089665653,
      paybackYears: 3.513079905612175,
    },
  jgrpp: {
      capacity: 224,
      cargoPerTrip: 224,
      loadedSpeedInternal: 72,
      emptySpeedInternal: 72,
      daysLoaded: 96.09609609609609,
      daysEmpty: 96.09609609609609,
      loadingDays: 2.1621621621621623,
      roundTripDays: 194.35435435435434,
      tripsPerYear: 9.390064894932015,
      incomePerTrip: 72231,
      runningCostPerYear: 21742.065822002474,
      buyCostTotal: 12483,
      profitPerYear: 656511.711603832,
      paybackYears: 0.019014131476047136,
    },
} as const;

describe('регрессия: ветка без ожидания считает как до появления веток', () => {
  const cases = [
    { name: 'plain', params: { entries, cargo: coal, payment, distanceTiles: 100, meta: trainsMeta } },
    {
      name: 'capped',
      params: { entries, cargo: coal, payment, distanceTiles: 100, meta: trainsMeta, cargoPerTrip: 40, fleetSize: 3 },
    },
    {
      name: 'jgrpp',
      params: {
        entries, cargo: coal, payment, distanceTiles: 250, meta: trainsMeta,
        subsidised: true, game: jgrpp,
      },
    },
  ] as const;

  for (const c of cases) {
    it(c.name, () => {
      const t = tripEconomics(c.params);
      const want = BASELINE[c.name];
      for (const [key, value] of Object.entries(want)) {
        expect({ [key]: t[key as keyof typeof want] }).toEqual({ [key]: value });
      }
      expect(t.waitForFullLoad).toBe(false);
      expect(t.waitDays).toBe(0);
    });
  }
});

describe('ветки загрузки', () => {
  const setup = tripSetup({ entries, cargo: coal, payment, distanceTiles: 100, meta: trainsMeta });
  const money = { cargo: coal, payment, distanceTiles: 100 };
  const yearDays = daysPerEconomyYear(DEFAULT_GAME_SETTINGS) * effectiveDayLength(DEFAULT_GAME_SETTINGS);
  /** What one train per trip gets when it leaves with what accumulated. */
  const shareOfFlow = (offeredPerYear: number, fleetSize: number) =>
    Math.min(setup.capacity, offeredPerYear / (fleetSize * setup.tripsPerYear));

  it('медленный источник: ветки расходятся кругом, интервалом и грузом', () => {
    const offeredPerYear = 200;
    const b = tripBranches(setup, {
      ...money, fleetSize: 1, offeredPerYear,
      cargoPerTrip: shareOfFlow(offeredPerYear, 1),
    });
    expect(b.differ).toBe(true);
    expect(b.waitsForFullLoad.roundTripDays).toBeGreaterThan(b.runsWithWhatAccumulated.roundTripDays);
    expect(b.waitsForFullLoad.tripsPerYear).toBeLessThan(b.runsWithWhatAccumulated.tripsPerYear);
    expect(b.waitsForFullLoad.cargoPerTrip).toBe(setup.capacity);
    expect(b.runsWithWhatAccumulated.cargoPerTrip).toBeLessThan(setup.capacity);
  });

  it('долгое накопление удешевляет единицу груза', () => {
    // Cargo ages in the wagons while the consist fills up, so the same load on the same leg
    // pays less the longer it waited. Half the wait, as the source trickles in evenly.
    const perUnit = (t: { incomePerTrip: number; cargoPerTrip: number }) =>
      t.incomePerTrip / t.cargoPerTrip;
    const branchesAt = (offeredPerYear: number) =>
      tripBranches(setup, {
        ...money, fleetSize: 1, offeredPerYear,
        cargoPerTrip: shareOfFlow(offeredPerYear, 1),
      });

    const slow = branchesAt(200);
    expect(slow.waitsForFullLoad.waitDays).toBeGreaterThan(0);
    expect(perUnit(slow.waitsForFullLoad)).toBeLessThan(perUnit(slow.runsWithWhatAccumulated));

    // A slower source means a longer wait, which means an older load and a cheaper unit.
    const slower = branchesAt(100);
    expect(slower.waitsForFullLoad.waitDays).toBeGreaterThan(slow.waitsForFullLoad.waitDays);
    expect(perUnit(slower.waitsForFullLoad)).toBeLessThan(perUnit(slow.waitsForFullLoad));
  });

  it('возраст груза: накопленное за рейс стареет всё ожидание, пришедшее по ходу — половину', () => {
    const offeredPerYear = 200;
    const b = tripBranches(setup, {
      ...money, fleetSize: 1, offeredPerYear,
      cargoPerTrip: shareOfFlow(offeredPerYear, 1),
    });
    const w = b.waitsForFullLoad;
    const incomeAtAge = (ageDays: number) =>
      transportedGoodsIncome(
        w.cargoPerTrip,
        100,
        transitPeriodsFromDays(ageDays),
        { currentPayment: payment, transitPeriods: coal.transit_periods },
        DEFAULT_GAME_SETTINGS.cargoAgingRate,
        'modern',
      );

    const physical = setup.roundTripDays;
    const share = (physical + w.waitDays / 2) / (physical + w.waitDays);
    expect(w.incomePerTrip).toBe(incomeAtAge(setup.daysLoaded + w.waitDays * share));
    // Pricing by half the wait would understate the age: the part loaded in one go at the
    // start of the stop waited longer than that, so half pays more than the game does.
    expect(w.incomePerTrip).toBeLessThan(incomeAtAge(setup.daysLoaded + w.waitDays / 2));
  });

  it('быстрый источник: ветки совпадают до последнего знака', () => {
    const offeredPerYear = 1_000_000;
    const b = tripBranches(setup, {
      ...money, fleetSize: 1, offeredPerYear,
      cargoPerTrip: shareOfFlow(offeredPerYear, 1),
    });
    expect(b.differ).toBe(false);
    expect(b.waitsForFullLoad).toEqual({ ...b.runsWithWhatAccumulated, waitForFullLoad: true });
  });

  // At one and the same offered flow the branch only re-spaces the deliveries. On a real
  // route the flows differ — a consist that waits visits less often and is handed less — and
  // that is the optimizer's job to work out (see the loading-branch tests there).
  it('при одном потоке вывоз за год одинаков в обеих ветках', () => {
    for (const fleetSize of [1, 2, 4]) {
      const offeredPerYear = 900;
      const cargoPerTrip = shareOfFlow(offeredPerYear, fleetSize);
      const b = tripBranches(setup, { ...money, fleetSize, offeredPerYear, cargoPerTrip });
      const hauled = (t: { cargoPerTrip: number; tripsPerYear: number }) =>
        t.cargoPerTrip * t.tripsPerYear * fleetSize;
      expect(hauled(b.waitsForFullLoad)).toBeCloseTo(hauled(b.runsWithWhatAccumulated), 6);
      // ...and it is the flow itself, since the fleet outruns this source.
      expect(hauled(b.waitsForFullLoad)).toBeCloseTo(offeredPerYear, 6);
    }
  });

  it('поток не задан: ветка ожидания не удлиняет круг', () => {
    const b = tripBranches(setup, { ...money, fleetSize: 1 });
    expect(b.differ).toBe(false);
    expect(b.waitsForFullLoad.waitDays).toBe(0);
    expect(b.waitsForFullLoad.roundTripDays).toBe(setup.roundTripDays);
    expect(yearDays / setup.roundTripDays).toBeCloseTo(setup.tripsPerYear, 9);
  });
});
