import { describe, expect, it } from 'vitest';
import {
  SETTLE_PASS_CAP,
  accumulationRoundTrip,
  routeStationRating,
  settleBranchFlows,
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
const stubRating = (rating: number): StationRating => ({
  rating,
  backlog: 0,
  deliveredShare: (rating + 1) / 256,
  parts: { speed: 0, waitTime: 0, waitingCargo: 0, age: 0, statue: 0, swing: 0 },
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
      physicalRating: stubRating(128),
      ratingAt: () => {
        calls++;
        return stubRating(128);
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
      physicalRating: stubRating(200),
      // Never repeats itself, so the equality exit is never reached.
      ratingAt: () => stubRating(200 - ++calls),
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
    const rateRoute = routeStationRating(2000, DEFAULT_GAME_SETTINGS);
    let calls = 0;
    settleWaitingBranch({
      ...settleParams,
      physicalRating: rateRoute({
        pickupIntervalDays: 80,
        maxSpeedInternal: 72,
        visitCapacity: settleParams.capacity,
      }),
      ratingAt: (at) => {
        calls++;
        return rateRoute({ ...at, maxSpeedInternal: 72 });
      },
    });
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(SETTLE_PASS_CAP);
  });
});

describe('ветка ожидания против остатка', () => {
  const game = DEFAULT_GAME_SETTINGS;

  it('удлиняя круг, ветка ожидания не загоняет станцию в остаток и сходится', () => {
    // Ожидание удлиняет интервал, а с ним и приход за интервал: если бы приход перегнал
    // вместимость, ветка ожидания сама породила бы остаток и рейтинг поехал бы вниз по кругу.
    // Она этого не делает — состав ждёт ровно до полной загрузки, — и это проверяется здесь,
    // потому что от сходимости этой прогулки зависит и число, которое видит вкладка.
    const flowPerYear = 300;
    const capacity = 200;
    const rateRoute = routeStationRating(flowPerYear, game);
    let calls = 0;
    const settled = settleWaitingBranch({
      physicalRoundTripDays: 80,
      capacity,
      fleetSize: 1,
      flowPerYear,
      game,
      physicalRating: rateRoute({ pickupIntervalDays: 80, maxSpeedInternal: 96, visitCapacity: capacity }),
      ratingAt: (at) => {
        calls++;
        return rateRoute({ ...at, maxSpeedInternal: 96 });
      },
    });
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(SETTLE_PASS_CAP);
    expect(settled.rating.backlog).toBe(0);
    expect(settled.offeredPerYear).toBeCloseTo(flowPerYear * settled.rating.deliveredShare, 9);
  });
});

describe('settleBranchFlows', () => {
  const game = DEFAULT_GAME_SETTINGS;
  const physicalRoundTripDays = 100;
  const tripsPerYear = daysPerEconomyYear(game) / physicalRoundTripDays;

  /** Обе ветки на одном маршруте, посчитанные настоящим рейтингом станции. */
  const branches = (flowPerYear: number, capacity: number) => {
    const rateRoute = routeStationRating(flowPerYear, game);
    return settleBranchFlows({
      physicalRoundTripDays,
      tripsPerYear,
      capacity,
      fleetSize: 1,
      flowPerYear,
      game,
      ratingAt: (at) => rateRoute({ ...at, maxSpeedInternal: 96 }),
    });
  };

  it('переполненный источник: ждать нечего, ветки не расходятся', () => {
    // Поток много больше того, что состав увозит за визит: на станции стоит постоянный
    // остаток, к каждому приезду лежит больше вместимости.
    const flows = branches(4800, 200);
    const rating = flows.runsWithWhatAccumulated.rating!;
    expect(rating.backlog).toBeGreaterThan(0);
    expect(flows.canWait).toBe(false);
    expect(flows.waitsForFullLoad).toEqual(flows.runsWithWhatAccumulated);
    // Станции отдают ровно то, что увозит визит, поэтому состав уходит полным — и признак
    // ожидания читается по остатку, а не по недобору груза.
    expect(flows.cargoPerTrip).toBeCloseTo(200, 9);
  });

  it('медленный источник: станция пустеет, и ветка ожидания появляется', () => {
    const flows = branches(300, 200);
    expect(flows.runsWithWhatAccumulated.rating!.backlog).toBe(0);
    expect(flows.canWait).toBe(true);
    expect(flows.cargoPerTrip).toBeLessThan(200);
    // Ветка ожидания приезжает реже, поэтому её станции отдают меньше.
    expect(flows.waitsForFullLoad.offeredPerYear).toBeLessThan(
      flows.runsWithWhatAccumulated.offeredPerYear,
    );
  });
});
