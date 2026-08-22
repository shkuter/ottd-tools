/**
 * Перебор связок «локомотив(ы) + вагоны» под задачу:
 * год, дистанция, груз, длина станции -> рейтинг по прибыли в год.
 * Гружёное плечо и порожний обратный ход считаются с разной скоростью.
 */
import type { Cargo, ConsistEntry, Train, TrainsMeta } from '../types';
import { canCarryIn } from '../dataset';
import { balancingSpeed } from './physics';
import { cargoPaymentRate } from './income';
import { ratingPeriods, speedRating, type StationRating } from './rating';
import { introAvailability, type IntroAvailability } from './availability';
import { preferTrain } from './purchase';
import { tripBranches, tripMoney, tripSetup, type TripEconomics } from './trip';
import { flowPerYearFromMonthly, routeStationRating, settleBranchFlows } from './waiting';
import {
  type SupplyAssessment,
  type SupplyTarget,
  assessSupply,
  holdsSupplied,
  supplyWindowDays,
} from './supply';
import {
  cachedSetup,
  createOptimizerCache,
  resetIfStale,
  type OptimizerCache,
} from './optimizeCache';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
  effectiveDayLength,
  engineDaysPerYear,
} from './settings';

/** What the optimizer ranks its output by. */
export type OptimizeGoal = 'profit' | 'transported' | 'supply';

export interface OptimizeParams {
  year: number;
  distanceTiles: number;
  cargo: Cargo;
  economyId: string;
  /** Длина станции в тайлах — лимит длины состава. */
  maxLengthTiles: number;
  /** Линия электрифицирована: включать чисто электрические (OHLE) локомотивы. */
  allowElectric: boolean;
  /** Груз идёт под субсидией — доход умножается (difficulty.subsidy_multiplier). */
  subsidised?: boolean;
  /** Машины, выброшенные из перебора (например, которых в игре ещё может не быть). */
  excludedIds?: readonly string[];
  /**
   * Cargo produced per economy month at the source industry (0 = unlimited).
   * Caps what a train can actually haul, so extra capacity stops paying for itself
   * and the optimizer picks the wagon count that matches the flow.
   */
  productionPerMonth?: number;
  /**
   * What the search ranks by: yearly profit (the default) or cargo hauled per year.
   * The transported goal needs a production flow to have a delivered share at all, so
   * without one it is treated as 'profit' — the engine is the single source of truth here.
   */
  goal?: OptimizeGoal;
  /**
   * Receiving industry the supply goal and the supply column judge against. Absent when the
   * cargo has no consumer in the active economy, which is also when the goal is unavailable.
   */
  supplyTarget?: SupplyTarget | null;
  /** Upper bound on trains per route, used by the transported goal. */
  maxTrains?: number;
  game?: GameSettings;
  calc?: CalcSettings;
}

/** Локомотив требует контактную сеть (единственный источник тяги — OHLE). */
export function isPureElectric(train: Train): boolean {
  const sources = Object.keys(train.power_by_source ?? {});
  return sources.length > 0 && sources.every((s) => s === 'OHLE');
}

/** The losing branch of a row, in the two figures that show why it lost. */
export interface BranchFigures {
  /** Days between visits to the station in that branch. */
  pickupIntervalDays: number;
  /** Cargo one train would carry per trip in that branch. */
  cargoPerTrip: number;
}

export interface OptimizeResult {
  engine: Train;
  engineCount: number;
  wagon: Train;
  wagonCount: number;
  /** Когда локомотив появляется в игре: год выбран, а дата в игре точнее и плавает. */
  engineIntro: IntroAvailability;
  /** То же для вагона. */
  wagonIntro: IntroAvailability;
  capacity: number;
  /** Cargo actually hauled per trip: the capacity, or the production flow share when smaller. */
  cargoPerTrip: number;
  /**
   * Trains of this consist needed to clear the *full* output by capacity (1 when
   * unconstrained). It bounds the fleet sweep; the fleet a row actually needs is usually
   * smaller, because the station only hands over part of that output.
   */
  trainsNeeded: number;
  /** Trains this row actually runs: enough for what the station offers, or the goal's pick. */
  fleetSize: number;
  /** The fleet is capped by the user's limit and cannot clear the whole flow. */
  fleetLimited: boolean;
  /** Days between visits to the station: round trip shared by the fleet. */
  pickupIntervalDays: number;
  /** Station rating this interval settles at; null when no production flow is given. */
  stationRating: StationRating | null;
  /** Cargo hauled over a year by the whole fleet, after the delivered share. */
  hauledPerYear: number;
  /**
   * The loading branch this row won in: true = the consist waits for a full load, false = it
   * leaves with what accumulated. Only meaningful when `branchesDiffer`.
   */
  waitForFullLoad: boolean;
  /**
   * The two loading branches give different numbers on this route, so the full-load order
   * actually decides something. False when the source outruns the fleet — and always false
   * without a stated output, where the branches are indistinguishable.
   */
  branchesDiffer: boolean;
  /** Days of the round trip spent waiting for the load (0 outside the waiting branch). */
  waitDays: number;
  /**
   * How this row leaves the receiving industry: its interval against the supply window, and
   * what that means under the industry's own acceptance rule. Null when no receiving industry
   * was given — the cargo has no consumer in this economy, or none was chosen.
   */
  supply: SupplyAssessment | null;
  /**
   * What the branch that lost would have given: the comparison is the answer the player is
   * after, and words alone do not let them compare. Null when the branches are the same.
   */
  otherBranch: BranchFigures | null;
  lengthTiles: number;
  loadedSpeedInternal: number;
  emptySpeedInternal: number;
  /** Гружёным на подъёме (холм заданной длины: на уклоне часть состава). */
  gradeSpeedInternal: number;
  /** Дни стоянки под погрузку и разгрузку за рейс. */
  loadingDays: number;
  roundTripDays: number;
  tripsPerYear: number;
  incomePerTrip: number;
  runningCostPerYear: number;
  buyCostTotal: number;
  profitPerYear: number;
  paybackYears: number | null;
}

/**
 * How well the receiving industry ends up supplied, as one number to rank by: the conversion
 * share for secondaries, the pool level for primaries and ports. Stepped on purpose — it is
 * what the industry actually gets, and ties on it are settled by profit, so the goal picks
 * the cheapest way to the same result rather than the shortest interval for its own sake.
 *
 * The conversion alone is not enough to rank by. It counts the industry's other inputs as fed,
 * and the sum is capped at 8, so at an industry that needs "any three of five" the four other
 * inputs already reach the ceiling and this route changes nothing — every row scores 1,
 * including the ones that fall out of the window. Hence `supplyHolds` below as the second key:
 * the conversion never contradicts it, it just cannot always see it.
 */
function supplyScore(assessment: SupplyAssessment | null): number {
  if (!assessment) return 0;
  if (assessment.conversion !== null) return assessment.conversion;
  if (assessment.pool) return assessment.pool.level / 2;
  return 0;
}

/** The figures a row is ranked by; which of them lead is up to the goal's `primary`. */
interface RankKeys {
  hauled: number;
  profit: number;
  cost: number;
  /** How well the receiving industry ends up supplied, 0..1. Stepped, not continuous. */
  supply: number;
  /** Whether this route's own input stays inside the window: 1 yes, 0 no. */
  supplyHolds: number;
}

/**
 * What the search goal decides: whether consists shorter than the full station are swept, and
 * what ranking looks at before the shared profit and price tie-breaks. Keeping both answers in
 * one object means the goal is read once, at the top of a search, instead of being re-tested
 * wherever it matters. The fleet sweep is NOT one of those answers: every allowed size is
 * evaluated under both goals, because a bigger fleet shortens the interval, lifts the station
 * rating and can therefore be the more profitable one too.
 */
interface GoalStrategy {
  /** Whether consists shorter than the full station are worth sweeping at all. */
  sweepsShorter(rows: readonly OptimizeResult[]): boolean;
  /** Whether the sweep over shorter consists can stop here. */
  stopsSweep(rows: readonly OptimizeResult[]): boolean;
  /** Orders a pair before the shared tie-breaks: negative = a first, 0 = undecided. */
  primary(a: RankKeys, b: RankKeys): number;
}

/**
 * A consist the station cannot fill even when a single train collects everything it offers.
 * Measured at one train on purpose: what one train gets per trip only falls as the fleet
 * grows (a shorter interval lifts the offered flow, but never in proportion), so a consist
 * left underfilled at one train is underfilled at every fleet size — and a longer one would
 * carry the same cargo for a higher price. Measured against what the station offers rather
 * than the full output: the industry hands over only part of it (ADR-0001).
 *
 * Read off the loading branches rather than off the winning row's load: a row that won in the
 * waiting branch carries a full load by definition and would claim the source keeps up, when
 * in fact it is the wait that makes the branches differ at all. `branchesDiffer` *is* this
 * property: the branches can only differ when what one train gets per trip falls short of the
 * capacity, which is precisely a source that cannot fill the consist.
 */
function sourceCannotFillConsist(rows: readonly OptimizeResult[]): boolean {
  const oneTrain = rows[0];
  return oneTrain != null && oneTrain.branchesDiffer;
}

function goalStrategy(goal: OptimizeGoal): GoalStrategy {
  if (goal === 'supply') {
    return {
      // A shorter consist runs more often, so it holds the window where a full-length one
      // falls out of it: this goal has to see every length, same as the transported one.
      sweepsShorter: () => true,
      stopsSweep: () => false,
      primary: (a, b) => {
        if (a.supply !== b.supply) return a.supply > b.supply ? -1 : 1;
        if (a.supplyHolds !== b.supplyHolds) return a.supplyHolds > b.supplyHolds ? -1 : 1;
        return 0;
      },
    };
  }
  if (goal === 'transported') {
    return {
      // A shorter consist runs more often, so it can haul more than a full-length one: this
      // goal has to see every length.
      sweepsShorter: () => true,
      stopsSweep: () => false,
      primary: (a, b) => (a.hauled === b.hauled ? 0 : a.hauled > b.hauled ? -1 : 1),
    };
  }
  return {
    // Filling the station is optimal unless the industry cannot keep the consist full.
    sweepsShorter: sourceCannotFillConsist,
    stopsSweep: sourceCannotFillConsist,
    primary: () => 0,
  };
}

function isAvailable(train: Train, year: number): boolean {
  if (train.intro_year > year) return false;
  if (train.model_life != null && year >= train.intro_year + train.model_life) return false;
  return true;
}

export function optimizeConsists(
  trains: Train[],
  params: OptimizeParams,
  meta: TrainsMeta,
  topN = 30,
  cache: OptimizerCache = createOptimizerCache(),
): OptimizeResult[] {
  const { year, distanceTiles, cargo, maxLengthTiles } = params;
  const game = params.game ?? DEFAULT_GAME_SETTINGS;
  const calc = params.calc ?? DEFAULT_CALC_SETTINGS;
  const { capacityIndex, trackType } = calc;
  // Payment rides the same inflation clock as prices, so it comes from the shared helper.
  const payment = cargoPaymentRate(cargo, params.economyId, game, calc);
  if (!payment) return [];

  resetIfStale(cache, {
    cargoLabel: cargo.label,
    payment,
    distanceTiles,
    basecostShifts: meta.basecost_shifts,
    game,
    calc,
  });

  const excluded = new Set(params.excludedIds ?? []);
  const engines = trains.filter(
    (t) =>
      t.kind === 'engine' &&
      t.base_track_type === trackType &&
      t.power_hp > 0 &&
      isAvailable(t, year) &&
      !excluded.has(t.id) &&
      (params.allowElectric || !isPureElectric(t)),
  );
  const wagons = trains.filter(
    (t) =>
      t.kind === 'wagon' &&
      t.base_track_type === trackType &&
      isAvailable(t, year) &&
      !excluded.has(t.id) &&
      canCarryIn(game, t, cargo) &&
      (t.capacities[capacityIndex] ?? 0) > 0,
  );

  // Wagons that agree on every number the calculation reads give identical rows, and Iron
  // Horse ships whole families of visual variants: 142 wagons take coal in 2050, but only
  // 14 of them differ here. Sweeping one representative per profile is the same search an
  // order of magnitude cheaper.
  const wagonProfile = (t: Train) =>
    [
      t.capacities[capacityIndex] ?? t.capacities[2],
      t.weight_t, t.length, t.power_hp, t.te_coefficient,
      t.speed_mph, t.speed_internal, t.units.length,
      t.cost_factor, t.running_cost_base, t.running_cost_factor, t.loading_speed,
    ].join('|');
  const representatives = new Map<string, Train>();
  for (const w of wagons) {
    const key = wagonProfile(w);
    const prev = representatives.get(key);
    // The representative is picked by the same tie-break as the winner of a row, so the
    // wagon shown is the one the full sweep would have shown.
    if (!prev || preferTrain(w, prev) < 0) representatives.set(key, w);
  }
  const searchWagons = [...representatives.values()];

  const maxLengthUnits = maxLengthTiles * 16; // тайл = 16 единиц длины (стандартная машина 8 = полтайла)
  // Industry output is stated per economy month, trips are counted per economy year.
  const flowPerYear = flowPerYearFromMonthly(params.productionPerMonth);
  // Without a flow there is no delivered share to rank by, so the transported goal is
  // pointless: fall back to profit rather than leave the tab with a meaningless order.
  // Without a flow there is no interval, and without a receiving industry there is nothing to
  // be supplied: either way the supply goal has no order to impose, so it falls back to profit
  // rather than leaving the tab ranked by nothing.
  const supplyTarget = params.supplyTarget ?? null;
  const requested = params.goal ?? 'profit';
  const goal: OptimizeGoal =
    flowPerYear <= 0 || (requested === 'supply' && !supplyTarget) ? 'profit' : requested;
  const maxTrains = Math.max(1, Math.floor(params.maxTrains ?? 4));
  const strategy = goalStrategy(goal);
  const results: OptimizeResult[] = [];

  // How two candidates are ordered: by the goal first, then by the shared profit and price
  // tie-breaks (wagons of the same capacity differ only in price, so an equal profit picks
  // the cheaper one). The same comparison settles the loading branch of a single row and
  // the one row kept per "engine × number of units".
  // Comparison keys are rounded to whole units — the game counts whole crates and whole
  // pounds anyway, and ties on the delivered share are common because it is quantised by an
  // integer rating. Rounding rather than an "differs by more than X" tolerance matters: a
  // tolerance is not transitive, so which candidate won depended on the order they were
  // swept in, and two equally good rows could beat each other.
  const rank = (r: OptimizeResult): RankKeys => ({
    hauled: Math.round(r.hauledPerYear),
    profit: Math.round(r.profitPerYear),
    cost: Math.round(r.buyCostTotal),
    // Rounded like the rest: the conversion is a multiple of 1/8 and the pool a level, so
    // rounding only guards against float noise in the division.
    supply: Math.round(supplyScore(r.supply) * 1000) / 1000,
    supplyHolds: r.supply && holdsSupplied(r.supply.verdict) ? 1 : 0,
  });
  const better = (a: OptimizeResult, b: OptimizeResult) => {
    const ra = rank(a);
    const rb = rank(b);
    const primary = strategy.primary(ra, rb);
    if (primary !== 0) return primary < 0;
    if (ra.profit !== rb.profit) return ra.profit > rb.profit;
    if (ra.cost !== rb.cost) return ra.cost < rb.cost;
    const wagons = preferTrain(a.wagon, b.wagon);
    if (wagons !== 0) return wagons < 0;
    // Rows that agree on every number above still need one winner, or which of them the
    // output shows would follow the order the vehicles were swept in. A smaller fleet is
    // the cheaper way to the same result; the rest is settled by identifiers.
    if (a.fleetSize !== b.fleetSize) return a.fleetSize < b.fleetSize;
    if (a.wagonCount !== b.wagonCount) return a.wagonCount < b.wagonCount;
    if (a.engine.id !== b.engine.id) return a.engine.id < b.engine.id;
    return a.engineCount < b.engineCount;
  };
  // The rating settles by iterating over every period of the interval, which is the most
  // expensive step of an evaluation — and thousands of candidates share the same answer:
  // the interval only enters as its period count and the speed only as its speed bonus,
  // so the key is built from those two functions rather than from a copy of their bodies.
  const ratingOf = routeStationRating(flowPerYear, game);
  const ratingCache = new Map<string, StationRating>();
  const ratingFor = (pickupIntervalDays: number, maxSpeedInternal: number): StationRating => {
    const key = `${ratingPeriods(pickupIntervalDays, effectiveDayLength(game))}|${speedRating(maxSpeedInternal)}`;
    let cached = ratingCache.get(key);
    if (!cached) {
      cached = ratingOf(pickupIntervalDays, maxSpeedInternal);
      ratingCache.set(key, cached);
    }
    return cached;
  };

  /**
   * All rows this consist can produce: one per allowed fleet size. The setup (capacity,
   * speeds, round trip, price of one consist) is shared by them — only the money and the
   * station rating move with the fleet.
   */
  const evaluate = (
    engine: Train,
    engineCount: number,
    engineLength: number,
    wagon: Train,
    wagonCount: number,
  ): OptimizeResult[] => {
    const entries: ConsistEntry[] = [
      { train: engine, count: engineCount },
      { train: wagon, count: wagonCount },
    ];

    // Physics, timings and the price of one consist do not depend on the load or the fleet,
    // so they are computed once and every candidate below only redoes the money. Trains that
    // outrun their industry keep full-load physics: such a train waits to be filled rather
    // than running light.
    const cacheKey = `${engine.id}|${engineCount}|${wagon.id}|${wagonCount}`;
    const setup = cachedSetup(cache, cacheKey, () =>
      tripSetup({ entries, cargo, payment, distanceTiles, meta, game, calc }),
    );
    const capacity = setup.capacity;
    if (capacity <= 0) return [];
    if (setup.loadedSpeedInternal <= 2) return [];

    const capacityPerYear = capacity * setup.tripsPerYear;
    const trainsNeeded =
      flowPerYear > 0 && capacityPerYear > 0
        ? Math.max(1, Math.ceil(flowPerYear / capacityPerYear))
        : 1;

    const lengthTiles = (engineLength + wagonCount * wagon.length) / 16;
    const loadedPhysics = setup.loadedPhysics;
    const massOnSlope = loadedPhysics.massT * Math.min(calc.hillTiles / lengthTiles, 1);
    const gradeSpeed = balancingSpeed(loadedPhysics, massOnSlope, game.accelerationModel);

    const forFleet = (fleetSize: number): OptimizeResult => {
      // Where both branches settle: the share the station is handed, the load one train gets
      // out of it, and whether the source leaves anything to wait for. Shared with the route
      // income tab so a route reads the same on both.
      const flows = settleBranchFlows({
        physicalRoundTripDays: setup.roundTripDays,
        tripsPerYear: setup.tripsPerYear,
        capacity,
        fleetSize,
        flowPerYear,
        game,
        ratingAt: (interval) => ratingFor(interval, loadedPhysics.maxSpeedInternal),
      });
      const { cargoPerTrip, canWait } = flows;
      const { rating: stationRating, offeredPerYear } = flows.runsWithWhatAccumulated;
      const { rating: waitingRating, offeredPerYear: waitingOffered } = flows.waitsForFullLoad;

      // Both loading branches off the one setup: the expensive half (physics, prices) is
      // already paid for, only the money is done twice — and only when waiting is possible.
      // `offeredPerYear` is the waiting branch's own flow and only that branch reads it, so
      // it travels with the call that needs it rather than in the shared half.
      const money = {
        cargo, payment, distanceTiles, game,
        cargoPerTrip, fleetSize, subsidised: params.subsidised,
      };
      const branches = canWait
        ? tripBranches(setup, { ...money, offeredPerYear: waitingOffered })
        : {
            runsWithWhatAccumulated: tripMoney(setup, money),
            waitsForFullLoad: null,
            differ: false,
          };

      const row = (
        trip: TripEconomics,
        rating: StationRating | null,
        offered: number,
      ): OptimizeResult => {
        // Whichever runs out first: the share the industry hands over, or what the fleet can
        // physically move at this branch's trip count.
        const fleetCapacityPerYear = fleetSize * trip.tripsPerYear * capacity;
        const hauledPerYear =
          flowPerYear > 0 ? Math.min(offered, fleetCapacityPerYear) : fleetCapacityPerYear;

        return {
          engine,
          engineCount,
          wagon,
          wagonCount,
          engineIntro: introAvailability(engine, year, game),
          wagonIntro: introAvailability(wagon, year, game),
          capacity,
          cargoPerTrip: trip.cargoPerTrip,
          trainsNeeded,
          fleetSize,
          // The fleet is the binding constraint only when it cannot move what the station
          // actually offers. `trainsNeeded` measures the full output, but a station handing
          // over 64 % of it needs proportionally fewer trains — flagging by that would call
          // a fleet short while it still clears everything waiting.
          fleetLimited: flowPerYear > 0 && fleetCapacityPerYear < offered - 1e-6,
          // The waiting branch spaces the visits out by exactly the wait it adds.
          pickupIntervalDays: trip.roundTripDays / fleetSize,
          stationRating: rating,
          hauledPerYear,
          waitForFullLoad: trip.waitForFullLoad,
          branchesDiffer: branches.differ,
          waitDays: trip.waitDays,
          // Without a stated output there is no interval to space visits by and no volume to
          // pool: both stay unknown rather than being invented from what the fleet could carry.
          supply: supplyTarget
            ? assessSupply(supplyTarget, {
                pickupIntervalDays: flowPerYear > 0 ? trip.roundTripDays / fleetSize : null,
                roundTripDays: trip.roundTripDays,
                deliveredPerWindow:
                  flowPerYear > 0
                    ? (hauledPerYear * supplyWindowDays(supplyTarget.windowTicks)) /
                      engineDaysPerYear(game)
                    : null,
              })
            : null,
          otherBranch: null,
          lengthTiles,
          loadedSpeedInternal: trip.loadedSpeedInternal,
          emptySpeedInternal: trip.emptySpeedInternal,
          gradeSpeedInternal: gradeSpeed,
          loadingDays: trip.loadingDays,
          roundTripDays: trip.roundTripDays,
          tripsPerYear: trip.tripsPerYear,
          incomePerTrip: trip.incomePerTrip,
          runningCostPerYear: trip.runningCostPerYear,
          buyCostTotal: trip.buyCostTotal,
          profitPerYear: trip.profitPerYear,
          paybackYears: trip.paybackYears,
        };
      };

      // The branch is a dimension of the search, not a setting: the row keeps whichever one is
      // better for the chosen goal, judged by the same comparison that picks between consists.
      // Indistinguishable branches leave the plain one standing, so a route the full-load order
      // does nothing to reads exactly as it did before the branches existed.
      const plain = row(branches.runsWithWhatAccumulated, stationRating, offeredPerYear);
      if (!branches.differ || !branches.waitsForFullLoad) return plain;
      const waiting = row(branches.waitsForFullLoad, waitingRating, waitingOffered);
      const [won, lost] = better(waiting, plain) ? [waiting, plain] : [plain, waiting];
      return {
        ...won,
        otherBranch: {
          pickupIntervalDays: lost.pickupIntervalDays,
          cargoPerTrip: lost.cargoPerTrip,
        },
      };
    };

    // Every allowed fleet size is a candidate under both goals. How much the station hands
    // over depends on the interval, and the interval depends on the fleet, so a bigger fleet
    // hauls more *and* can earn more — stopping at the smallest fleet that clears what is
    // offered would hide the more profitable ones. Without a flow there is nothing to share
    // between trains: the model is one consist, and more of them would only scale the numbers.
    if (flowPerYear <= 0) return [forFleet(1)];
    const rows: OptimizeResult[] = [];
    for (let k = 1; k <= maxTrains; k++) rows.push(forFleet(k));
    return rows;
  };

  for (const engine of engines) {
    for (const engineCount of [1, 2]) {
      const engineLength = engineCount * engine.length;
      if (engineLength >= maxLengthUnits) continue;
      for (const wagon of searchWagons) {
        const maxWagons = Math.floor((maxLengthUnits - engineLength) / wagon.length);
        if (maxWagons <= 0) continue;
        const full = evaluate(engine, engineCount, engineLength, wagon, maxWagons);
        if (!full.length) continue;
        results.push(...full);
        if (!strategy.sweepsShorter(full)) continue;
        for (let wagonCount = 1; wagonCount < maxWagons; wagonCount++) {
          const rows = evaluate(engine, engineCount, engineLength, wagon, wagonCount);
          if (!rows.length) continue;
          results.push(...rows);
          if (strategy.stopsSweep(rows)) break;
        }
      }
    }
  }

  const best = new Map<string, OptimizeResult>();
  for (const r of results) {
    const key = `${r.engine.id}|${r.engineCount}`;
    const prev = best.get(key);
    if (!prev || better(r, prev)) best.set(key, r);
  }
  return [...best.values()]
    .sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0))
    .slice(0, topN);
}
