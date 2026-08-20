/**
 * Перебор связок «локомотив(ы) + вагоны» под задачу:
 * год, дистанция, груз, длина станции -> рейтинг по прибыли в год.
 * Гружёное плечо и порожний обратный ход считаются с разной скоростью.
 */
import type { Cargo, ConsistEntry, Train, TrainsMeta } from '../types';
import { canCarryIn } from '../dataset';
import { balancingSpeed } from './physics';
import { cargoPaymentRate } from './income';
import { estimateStationRating, ratingPeriods, speedRating, type StationRating } from './rating';
import { introAvailability, type IntroAvailability } from './availability';
import { tripMoney, tripSetup } from './trip';
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
  daysPerEconomyYear,
} from './settings';

/** What the optimizer ranks its output by. */
export type OptimizeGoal = 'profit' | 'transported';

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

/** The three numbers rows are ranked by, rounded to whole units. */
interface RankKeys {
  hauled: number;
  profit: number;
  cost: number;
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
 */
function underfilled(rows: readonly OptimizeResult[]): boolean {
  const oneTrain = rows[0];
  return oneTrain != null && oneTrain.cargoPerTrip < oneTrain.capacity - 1e-9;
}

function goalStrategy(goal: OptimizeGoal): GoalStrategy {
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
    sweepsShorter: underfilled,
    stopsSweep: underfilled,
    primary: () => 0,
  };
}

/**
 * Which of two interchangeable wagons a row should show. The game lists the non-randomised
 * variant as the head of its group of variants, with the randomised one hidden inside; the
 * identifier settles whatever is still tied. Nothing here looks at the order the vehicles
 * arrived in: that order is an accident of the dataset, and letting it decide would change
 * the wagon in every row as soon as the input is shuffled.
 */
function preferWagon(a: Train, b: Train): number {
  if (a.randomised !== b.randomised) return a.randomised ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
    if (!prev || preferWagon(w, prev) < 0) representatives.set(key, w);
  }
  const searchWagons = [...representatives.values()];

  const maxLengthUnits = maxLengthTiles * 16; // тайл = 16 единиц длины (стандартная машина 8 = полтайла)
  // Industry output is stated per economy month, trips are counted per economy year.
  const flowPerYear = Math.max(0, params.productionPerMonth ?? 0) * 12;
  // Without a flow there is no delivered share to rank by, so the transported goal is
  // pointless: fall back to profit rather than leave the tab with a meaningless order.
  const goal: OptimizeGoal = flowPerYear > 0 ? (params.goal ?? 'profit') : 'profit';
  const maxTrains = Math.max(1, Math.floor(params.maxTrains ?? 4));
  const strategy = goalStrategy(goal);
  const results: OptimizeResult[] = [];
  const cargoPerDay = flowPerYear / (daysPerEconomyYear(game) * effectiveDayLength(game));
  // The rating settles by iterating over every period of the interval, which is the most
  // expensive step of an evaluation — and thousands of candidates share the same answer:
  // the interval only enters as its period count and the speed only as its speed bonus,
  // so the key is built from those two functions rather than from a copy of their bodies.
  const ratingCache = new Map<string, StationRating>();
  const ratingFor = (pickupIntervalDays: number, maxSpeedInternal: number): StationRating => {
    const key = `${ratingPeriods(pickupIntervalDays, effectiveDayLength(game))}|${speedRating(maxSpeedInternal)}`;
    let cached = ratingCache.get(key);
    if (!cached) {
      cached = estimateStationRating({
        pickupIntervalDays,
        maxSpeedInternal,
        cargoPerDay,
        jgrpp: game.jgrpp,
        dayLengthFactor: effectiveDayLength(game),
      });
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
      // How often the station is served decides its rating, and the rating decides how
      // much of the output the industry hands over at all.
      const pickupIntervalDays = setup.roundTripDays / fleetSize;
      const stationRating =
        flowPerYear > 0 ? ratingFor(pickupIntervalDays, loadedPhysics.maxSpeedInternal) : null;
      const deliveredShare = stationRating?.deliveredShare ?? 1;
      const offeredPerYear = flowPerYear * deliveredShare;

      // What the station hands over is shared by the fleet: a train beyond what it can fill
      // adds cost without adding cargo. The share cuts the flow here rather than the income
      // later, so a train that finds a full pile waiting still earns on all of it (ADR-0001).
      // Physics stays on a full load either way.
      const cargoPerTrip =
        flowPerYear > 0
          ? Math.min(capacity, offeredPerYear / (fleetSize * setup.tripsPerYear))
          : capacity;

      const trip = tripMoney(setup, {
        cargo, payment, distanceTiles, game,
        cargoPerTrip, fleetSize, subsidised: params.subsidised,
      });

      // Whichever runs out first: the share the industry hands over, or what the allowed
      // fleet can physically move.
      const fleetCapacityPerYear = fleetSize * setup.tripsPerYear * capacity;
      const hauledPerYear =
        flowPerYear > 0 ? Math.min(offeredPerYear, fleetCapacityPerYear) : fleetCapacityPerYear;

      return {
        engine,
        engineCount,
        wagon,
        wagonCount,
        engineIntro: introAvailability(engine, year, game),
        wagonIntro: introAvailability(wagon, year, game),
        capacity,
        cargoPerTrip,
        trainsNeeded,
        fleetSize,
        // The fleet is the binding constraint only when it cannot move what the station
        // actually offers. `trainsNeeded` measures the full output, but a station handing
        // over 64 % of it needs proportionally fewer trains — flagging by that would call
        // a fleet short while it still clears everything waiting.
        fleetLimited: flowPerYear > 0 && fleetCapacityPerYear < offeredPerYear - 1e-6,
        pickupIntervalDays,
        stationRating,
        hauledPerYear,
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

  // One row per "engine × number of units": the best candidate for the chosen goal (wagons
  // of the same capacity differ only in price, so an equal profit picks the cheaper one).
  // Comparison keys are rounded to whole units — the game counts whole crates and whole
  // pounds anyway, and ties on the delivered share are common because it is quantised by an
  // integer rating. Rounding rather than an "differs by more than X" tolerance matters: a
  // tolerance is not transitive, so which candidate won depended on the order they were
  // swept in, and two equally good rows could beat each other.
  const rank = (r: OptimizeResult): RankKeys => ({
    hauled: Math.round(r.hauledPerYear),
    profit: Math.round(r.profitPerYear),
    cost: Math.round(r.buyCostTotal),
  });
  const better = (a: OptimizeResult, b: OptimizeResult) => {
    const ra = rank(a);
    const rb = rank(b);
    const primary = strategy.primary(ra, rb);
    if (primary !== 0) return primary < 0;
    if (ra.profit !== rb.profit) return ra.profit > rb.profit;
    if (ra.cost !== rb.cost) return ra.cost < rb.cost;
    const wagons = preferWagon(a.wagon, b.wagon);
    if (wagons !== 0) return wagons < 0;
    // Rows that agree on every number above still need one winner, or which of them the
    // output shows would follow the order the vehicles were swept in. A smaller fleet is
    // the cheaper way to the same result; the rest is settled by identifiers.
    if (a.fleetSize !== b.fleetSize) return a.fleetSize < b.fleetSize;
    if (a.wagonCount !== b.wagonCount) return a.wagonCount < b.wagonCount;
    if (a.engine.id !== b.engine.id) return a.engine.id < b.engine.id;
    return a.engineCount < b.engineCount;
  };
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
