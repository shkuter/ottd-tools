import { describe, expect, it } from 'vitest';
import {
  SETTLE_PASS_CAP,
  accumulationRoundTrip,
  routeStationRating,
  settleWaitingBranch,
} from '../waiting';
import type { StationRating } from '../rating';
import { DEFAULT_GAME_SETTINGS, daysPerEconomyYear, effectiveDayLength } from '../settings';

const base = {
  physicalRoundTripDays: 80,
  capacity: 200,
  fleetSize: 1,
  game: DEFAULT_GAME_SETTINGS,
};

/** Cargo a fleet of `fleetSize` would move over a year at this round trip. */
const hauledPerYear = (roundTripDays: number, capacity: number, fleetSize: number) =>
  (fleetSize * capacity * daysPerEconomyYear(DEFAULT_GAME_SETTINGS)) / roundTripDays;

describe('accumulationRoundTrip', () => {
  it('медленный источник: круг задаёт накопление, а не физика', () => {
    // 200 units per trip against 365 units a year: filling one train takes 365 days.
    const a = accumulationRoundTrip({ ...base, offeredPerYear: 200 });
    expect(a.waitDays).toBeGreaterThan(0);
    expect(a.roundTripDays).toBeCloseTo(365, 9);
    expect(a.roundTripDays).toBeCloseTo(base.physicalRoundTripDays + a.waitDays, 9);
  });

  it('быстрый источник: ожидания нет, круг остаётся физическим', () => {
    const a = accumulationRoundTrip({ ...base, offeredPerYear: 100_000 });
    expect(a.waitDays).toBe(0);
    expect(a.roundTripDays).toBe(base.physicalRoundTripDays);
  });

  it('парк вдвое больше: круг каждого дольше, вывоз за год тот же', () => {
    const one = accumulationRoundTrip({ ...base, offeredPerYear: 200 });
    const two = accumulationRoundTrip({ ...base, fleetSize: 2, offeredPerYear: 200 });
    expect(two.roundTripDays).toBeCloseTo(one.roundTripDays * 2, 9);
    expect(hauledPerYear(two.roundTripDays, base.capacity, 2)).toBeCloseTo(
      hauledPerYear(one.roundTripDays, base.capacity, 1),
      9,
    );
  });

  it('множитель длины дня 5: наполнение впятеро дольше, ожидание растёт быстрее', () => {
    const slow = { ...DEFAULT_GAME_SETTINGS, jgrpp: true, dayLengthFactor: 5 };
    expect(effectiveDayLength(slow)).toBe(5);
    const a = accumulationRoundTrip({ ...base, offeredPerYear: 200 });
    const b = accumulationRoundTrip({ ...base, offeredPerYear: 200, game: slow });
    // The rate is five times lower, so filling the fleet takes five times as long. The
    // physical round trip does not move with the factor, so the wait grows faster than five.
    expect(b.waitDays).toBeCloseTo(a.waitDays * 5 + base.physicalRoundTripDays * 4, 9);
    expect(b.roundTripDays).toBeCloseTo(a.roundTripDays * 5, 9);
  });

  it('поток не задан: ожидание не определено, круг физический, без NaN', () => {
    for (const offeredPerYear of [0, -1]) {
      const a = accumulationRoundTrip({ ...base, offeredPerYear });
      expect(a.waitDays).toBe(0);
      expect(a.roundTripDays).toBe(base.physicalRoundTripDays);
      expect(Number.isNaN(a.roundTripDays)).toBe(false);
    }
  });

  it('пустой состав или пустой парк не роняют круг в NaN', () => {
    const noCapacity = accumulationRoundTrip({ ...base, capacity: 0, offeredPerYear: 200 });
    expect(noCapacity.roundTripDays).toBe(base.physicalRoundTripDays);
    const noFleet = accumulationRoundTrip({ ...base, fleetSize: 0, offeredPerYear: 200 });
    expect(noFleet.roundTripDays).toBe(base.physicalRoundTripDays);
  });
});

/** A rating with only the field the settling walk reads about it. */
const ratingOf = (rating: number): StationRating => ({
  rating,
  deliveredShare: (rating + 1) / 256,
  parts: { speed: 0, waitTime: 0, waitingCargo: 0, age: 0, statue: 0 },
});

describe('settleWaitingBranch', () => {
  const settleParams = {
    physicalRoundTripDays: 80,
    capacity: 200,
    fleetSize: 1,
    flowPerYear: 2000,
    game: DEFAULT_GAME_SETTINGS,
  };

  it('выход — совпадение рейтинга, а не число проходов', () => {
    let calls = 0;
    const settled = settleWaitingBranch({
      ...settleParams,
      physicalRating: ratingOf(128),
      ratingAt: () => {
        calls++;
        return ratingOf(128);
      },
    });
    // The walk starts from the physical rating; one pass shows it does not move, and that
    // is the exit — no further passes are spent.
    expect(calls).toBe(1);
    expect(settled.rating.rating).toBe(128);
  });

  it('предел проходов — страховка: рейтинг, который не устаканивается, не зацикливает расчёт', () => {
    let calls = 0;
    const settled = settleWaitingBranch({
      ...settleParams,
      physicalRating: ratingOf(200),
      // Never repeats itself, so the equality exit is never reached.
      ratingAt: () => ratingOf(200 - ++calls),
    });
    expect(calls).toBe(SETTLE_PASS_CAP);
    // Whatever it stops at is a real rating with a flow behind it, not NaN or the start value.
    expect(settled.rating.rating).toBeLessThan(200);
    expect(settled.offeredPerYear).toBeCloseTo(
      settleParams.flowPerYear * settled.rating.deliveredShare,
      9,
    );
  });

  it('на настоящем маршруте выход по совпадению рейтинга, а не по пределу', () => {
    // The real rating is quantised to 256 steps and waiting only ever lowers it, so the walk
    // settles in a pass or two; the cap must stay a backstop rather than the exit.
    const ratingOf = routeStationRating(2000, DEFAULT_GAME_SETTINGS);
    let calls = 0;
    settleWaitingBranch({
      ...settleParams,
      physicalRating: ratingOf(80, 72),
      ratingAt: (interval) => {
        calls++;
        return ratingOf(interval, 72);
      },
    });
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(SETTLE_PASS_CAP);
  });
});
