import { describe, expect, it } from 'vitest';
import { cargoByLabel, industriesMeta, industryById, trains, trainsMeta } from '../../dataset';
import {
  orderedInsufficiencies,
  searchConsists,
  STALLED_GRADE_SPEED,
  type ConsistSearch,
  type OptimizeGoal,
  type OptimizeParams,
} from '../optimize';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../settings';
import { holdsSupplied } from '../supply';
import type { SupplyTarget } from '../supply';

/** Steeltown and the Iron Horse roster: both sets are off by default, the goal needs them on. */
const game = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const, firs: true };

const base = {
  economyId: 'STEELTOWN',
  game,
  calc: DEFAULT_CALC_SETTINGS,
} satisfies Partial<OptimizeParams>;

const run = (params: Partial<OptimizeParams>, goal: OptimizeGoal): ConsistSearch =>
  searchConsists(trains, { ...base, ...params, goal } as OptimizeParams, trainsMeta, 20);

const search = (params: Partial<OptimizeParams>, goal: OptimizeGoal) => run(params, goal).rows;

/** The question from the game: salt over 20 tiles of level ground, 396 t per month. */
const saltOnTheLevel = {
  year: 1950,
  distanceTiles: 20,
  cargo: cargoByLabel.get('SALT')!,
  maxLengthTiles: 6,
  productionPerMonth: 396,
  maxTrains: 6,
  calc: { ...DEFAULT_CALC_SETTINGS, hillTiles: 0 },
};

/** A long hill under an early roster: some consists cannot climb it at all. */
const coalUpAHill = {
  year: 1900,
  distanceTiles: 60,
  cargo: cargoByLabel.get('COAL')!,
  maxLengthTiles: 7,
  productionPerMonth: 300,
  maxTrains: 6,
  calc: { ...DEFAULT_CALC_SETTINGS, hillTiles: 10 },
};

/** More output than one train clears, little enough that a few trains do. */
const coalNeedingAFleet = {
  year: 1950,
  distanceTiles: 40,
  cargo: cargoByLabel.get('COAL')!,
  maxLengthTiles: 6,
  productionPerMonth: 1200,
  maxTrains: 4,
};

/** Output no allowed fleet can clear: cargo piles up whatever runs. */
const coalNoFleetClears = {
  year: 1950,
  distanceTiles: 120,
  cargo: cargoByLabel.get('COAL')!,
  maxLengthTiles: 5,
  productionPerMonth: 4000,
  maxTrains: 2,
};

const chlorAlkaliPlant: SupplyTarget = {
  industry: industryById.get('chlor_alkali_plant')!,
  windowTicks: industriesMeta.supply_window_ticks,
  cargoRatio: 8,
  otherRatios: [],
};

/** A tertiary industry: the model gives no verdict on how well it is supplied. */
const generalStore: SupplyTarget = {
  industry: industryById.get('general_store')!,
  windowTicks: industriesMeta.supply_window_ticks,
  cargoRatio: null,
  otherRatios: [],
};

describe('cheapest goal: ranking', () => {
  it('orders rows by yearly running cost', () => {
    const rows = search(saltOnTheLevel, 'cheapest');
    expect(rows.length).toBeGreaterThan(1);
    for (let i = 1; i < rows.length; i++) {
      expect(Math.round(rows[i].runningCostPerYear)).toBeGreaterThanOrEqual(
        Math.round(rows[i - 1].runningCostPerYear),
      );
    }
    // The point of the goal: the cheapest row costs far less to run than the most profitable
    // one, which is what the flat profit ranking hid.
    const byProfit = search(saltOnTheLevel, 'profit');
    expect(rows[0].runningCostPerYear).toBeLessThan(byProfit[0].runningCostPerYear);
  });

  it('settles an equal running cost by profit, then by price', () => {
    const rows = search(saltOnTheLevel, 'cheapest');
    let ties = 0;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      if (Math.round(cur.runningCostPerYear) !== Math.round(prev.runningCostPerYear)) continue;
      ties++;
      expect(Math.round(prev.profitPerYear)).toBeGreaterThanOrEqual(Math.round(cur.profitPerYear));
      if (Math.round(prev.profitPerYear) !== Math.round(cur.profitPerYear)) continue;
      expect(Math.round(prev.buyCostTotal)).toBeLessThanOrEqual(Math.round(cur.buyCostTotal));
    }
    // The loop above proves nothing on an answer with no ties in it.
    expect(ties).toBeGreaterThan(0);
  });

  it('shows the shorter consist for the same engine', () => {
    const cheapest = search(coalNeedingAFleet, 'cheapest');
    const byProfit = search(coalNeedingAFleet, 'profit');
    // Profit only looks at consists shorter than the station where the source cannot fill a
    // full one; the cheapest goal always does, because a shorter consist is a cheaper one.
    // Compared engine by engine, since that is the row a player reads: the same engine comes
    // back on a shorter train.
    const shortened = byProfit.filter((full) => {
      const cheap = cheapest.find(
        (r) => r.engine.id === full.engine.id && r.engineCount === full.engineCount,
      );
      return cheap !== undefined && cheap.lengthTiles < full.lengthTiles;
    });
    expect(shortened.length).toBeGreaterThan(0);
    expect(Math.min(...cheapest.map((r) => r.lengthTiles))).toBeLessThan(
      Math.min(...byProfit.map((r) => r.lengthTiles)),
    );
  });

  it('takes the smallest fleet that is enough', () => {
    const rows = search({ ...coalNeedingAFleet, maxTrains: 6 }, 'cheapest');
    const top = rows[0];
    expect(top.fleetSize).toBeGreaterThan(1);
    // One train fewer and this consist is no longer sufficient: the fleet it is shown with is
    // the smallest that clears the station, not simply the largest allowed.
    const withOneLess = search(
      { ...coalNeedingAFleet, maxTrains: top.fleetSize - 1 },
      'cheapest',
    );
    const sameConsist = withOneLess.find(
      (r) => r.engine.id === top.engine.id && r.wagon.id === top.wagon.id
        && r.wagonCount === top.wagonCount,
    );
    expect(sameConsist).toBeUndefined();
  });

  it('falls back to profit without a production flow', () => {
    const withoutFlow = { ...saltOnTheLevel, productionPerMonth: 0 };
    const cheapest = search(withoutFlow, 'cheapest');
    const byProfit = search(withoutFlow, 'profit');
    expect(cheapest.length).toBeGreaterThan(0);
    expect(cheapest.map((r) => `${r.engine.id}|${r.engineCount}`)).toEqual(
      byProfit.map((r) => `${r.engine.id}|${r.engineCount}`),
    );
  });
});

describe('cheapest goal: what it admits', () => {
  it('drops consists that cannot climb the worst grade', () => {
    const byProfit = search(coalUpAHill, 'profit');
    const cheapest = search(coalUpAHill, 'cheapest');
    expect(byProfit.some((r) => r.gradeSpeedInternal <= STALLED_GRADE_SPEED)).toBe(true);
    expect(cheapest.every((r) => r.gradeSpeedInternal > STALLED_GRADE_SPEED)).toBe(true);
  });

  it('lets the grade drop nothing under the simplified acceleration model', () => {
    const original = { ...game, accelerationModel: 'original' as const };
    const onAHill = search({ ...coalUpAHill, game: original }, 'cheapest');
    const onTheLevel = search(
      { ...coalUpAHill, game: original, calc: { ...DEFAULT_CALC_SETTINGS, hillTiles: 0 } },
      'cheapest',
    );
    // In this model resistance never caps the speed, so the hill changes nothing at all —
    // the same rows come back with or without it.
    expect(onAHill.length).toBeGreaterThan(0);
    expect(onAHill.map((r) => `${r.engine.id}|${r.wagon.id}|${r.wagonCount}|${r.fleetSize}`)).toEqual(
      onTheLevel.map((r) => `${r.engine.id}|${r.wagon.id}|${r.wagonCount}|${r.fleetSize}`),
    );
  });

  it('shows a bigger fleet rather than dropping the consist', () => {
    const oneTrain = search({ ...coalNeedingAFleet, maxTrains: 1 }, 'cheapest');
    const upToFour = search(coalNeedingAFleet, 'cheapest');
    // One train leaves cargo standing, so nothing is sufficient; four trains clear it, and
    // the consists come back with the fleet they need instead of being dropped.
    expect(oneTrain).toHaveLength(0);
    expect(upToFour.length).toBeGreaterThan(0);
    expect(upToFour.every((r) => r.fleetSize > 1)).toBe(true);
  });

  it('drops rows whose fleet leaves cargo standing', () => {
    const byProfit = search(coalNoFleetClears, 'profit');
    expect(byProfit.length).toBeGreaterThan(0);
    expect(byProfit.every((r) => r.fleetLimited)).toBe(true);
    expect(search(coalNoFleetClears, 'cheapest')).toHaveLength(0);
  });

  it('keeps the receiving industry inside its supply window', () => {
    const inWindow = {
      year: 1950,
      distanceTiles: 250,
      cargo: cargoByLabel.get('SALT')!,
      maxLengthTiles: 6,
      productionPerMonth: 300,
      maxTrains: 4,
      supplyTarget: chlorAlkaliPlant,
    };
    const rows = search(inWindow, 'cheapest');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.supply !== null && holdsSupplied(r.supply.verdict))).toBe(true);

    // Far enough out with a single train, every row misses the window: the goal shows none of
    // them, while profit still ranks them.
    const outOfWindow = { ...inWindow, distanceTiles: 400, maxTrains: 1 };
    expect(search(outOfWindow, 'profit').every((r) => r.supply?.verdict === 'misses')).toBe(true);
    expect(search(outOfWindow, 'cheapest')).toHaveLength(0);
  });

  it('applies no window when no receiver is chosen', () => {
    const outcome = run(saltOnTheLevel, 'cheapest');
    expect(outcome.rows.length).toBeGreaterThan(0);
    // Nothing to be supplied, so the window cannot be among the reasons anything was refused.
    expect(outcome.refused).not.toContain('window');
  });

  it('applies no window to a receiver it has no verdict on', () => {
    const rows = search(
      {
        year: 1950,
        distanceTiles: 60,
        cargo: cargoByLabel.get('FOOD')!,
        maxLengthTiles: 6,
        productionPerMonth: 300,
        maxTrains: 4,
        supplyTarget: generalStore,
      },
      'cheapest',
    );
    // A tertiary industry gets no verdict: that is the absence of an answer, not a bad one,
    // and it must not empty the tab.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.supply?.verdict === 'unknown')).toBe(true);
  });

  it('leaves the other goals filtering nothing', () => {
    // The task the goal above empties out still fills up under the older goals, which flag a
    // fleet that cannot keep up rather than dropping it. (That profit keeps stalled consists
    // and rows the fleet cannot clear is asserted by the two tests above.)
    const hauled = search(coalNoFleetClears, 'transported');
    expect(hauled.length).toBeGreaterThan(0);
    expect(hauled.every((r) => r.fleetLimited)).toBe(true);
    const supplied = search(
      { ...coalNoFleetClears, supplyTarget: chlorAlkaliPlant },
      'supply',
    );
    expect(supplied.length).toBeGreaterThan(0);
  });
});

describe('cheapest goal: what it reports refusing', () => {
  const refusals = (params: Partial<OptimizeParams>, goal: OptimizeGoal) =>
    run(params, goal).refused;

  it('names the conditions that emptied the answer', () => {
    // On this route both bite: the shortest consists stall on the hill, and no allowed fleet
    // clears the station.
    expect(refusals(coalNoFleetClears, 'cheapest')).toEqual(['grade', 'backlog']);
  });

  it('reports the reasons in its own order, not the order rows failed in', () => {
    // The sweep visits early, light consists first, so on today's data the two orders agree by
    // accident — which is why the ordering is stated here rather than through a search.
    expect(orderedInsufficiencies(['window', 'backlog', 'grade'])).toEqual([
      'grade',
      'backlog',
      'window',
    ]);
    expect(orderedInsufficiencies(['window', 'grade', 'window'])).toEqual(['grade', 'window']);
  });

  it('says nothing about a grade that cannot bite', () => {
    // Level ground: the grade speed is the loaded speed, so the condition cannot refuse a row
    // and must not be reported as if it had.
    const onTheLevel = { ...coalNoFleetClears, calc: { ...DEFAULT_CALC_SETTINGS, hillTiles: 0 } };
    expect(refusals(onTheLevel, 'cheapest')).not.toContain('grade');
  });

  it('says nothing about a window on a receiver it has no verdict for', () => {
    const atAStore = {
      year: 1950,
      distanceTiles: 60,
      cargo: cargoByLabel.get('FOOD')!,
      maxLengthTiles: 5,
      productionPerMonth: 4000,
      maxTrains: 2,
      supplyTarget: generalStore,
    };
    const reported = refusals(atAStore, 'cheapest');
    expect(reported).toContain('backlog');
    expect(reported).not.toContain('window');
  });

  it('reports nothing under the goals that refuse nothing', () => {
    for (const goal of ['profit', 'transported', 'supply'] as const) {
      expect(refusals({ ...coalNoFleetClears, supplyTarget: chlorAlkaliPlant }, goal)).toEqual([]);
    }
  });
});

describe('cheapest goal: the loading branch', () => {
  // JGRPP can charge a stopped consist less, and a waiting consist stands at the platform:
  // ranking by running cost therefore reaches for the waiting branch on its own.
  const withStoppedDiscount = { ...game, jgrpp: true, costsWhenStopped: 4 };
  const slowSaltRun = {
    year: 1950,
    distanceTiles: 120,
    cargo: cargoByLabel.get('SALT')!,
    maxLengthTiles: 6,
    productionPerMonth: 60,
    maxTrains: 4,
    game: withStoppedDiscount,
  };

  it('reports the window as a reason even while other rows come back', () => {
    const outcome = run({ ...slowSaltRun, supplyTarget: chlorAlkaliPlant }, 'cheapest');
    // An answer is not all-or-nothing: some consists miss the window and are dropped for it,
    // others come back, and the search reports the condition either way.
    expect(outcome.rows.length).toBeGreaterThan(0);
    expect(outcome.refused).toContain('window');
  });

  it('picks the branch among those it admits, not before', () => {
    const withoutReceiver = search(slowSaltRun, 'cheapest');
    // Left to itself the goal takes the waiting branch everywhere: it is the cheaper one.
    expect(withoutReceiver.length).toBeGreaterThan(0);
    expect(withoutReceiver.every((r) => r.branchesDiffer && r.waitForFullLoad)).toBe(true);

    const withReceiver = search({ ...slowSaltRun, supplyTarget: chlorAlkaliPlant }, 'cheapest');
    const backToPlain = withReceiver.filter((r) => r.branchesDiffer && !r.waitForFullLoad);
    // With a receiver in play, waiting stretches the interval out of the window, so those
    // rows come back in the plain branch instead of dropping out of the answer.
    expect(backToPlain.length).toBeGreaterThan(0);
    expect(withReceiver.every((r) => r.supply !== null && holdsSupplied(r.supply.verdict))).toBe(
      true,
    );
    // The branch they turned down is the longer-interval one — the wait is what it costs.
    expect(
      backToPlain.every(
        (r) => r.otherBranch !== null && r.otherBranch.pickupIntervalDays > r.pickupIntervalDays,
      ),
    ).toBe(true);
  });
});

describe('cheapest goal: the salt question from the game', () => {
  it('answers with a shunter rather than a main-line engine', () => {
    const cheapest = search(saltOnTheLevel, 'cheapest');
    const byProfit = search(saltOnTheLevel, 'profit');
    // What the acceptance case asked for: the goal names a shunter ("gronk" in Iron Horse),
    // where ranking by profit puts a main-line vehicle on top.
    expect(cheapest[0].engine.role).toBe('gronk');
    expect(byProfit[0].engine.role).not.toBe('gronk');
    // And the trade it makes: less than half the running cost for a profit still within a
    // fifth of the best row's. These bounds hold the shape of the answer, not exact figures,
    // so a data update moves them without breaking the test.
    expect(cheapest[0].runningCostPerYear).toBeLessThan(byProfit[0].runningCostPerYear / 2);
    expect(cheapest[0].profitPerYear).toBeGreaterThan(byProfit[0].profitPerYear * 0.8);
  });
});
