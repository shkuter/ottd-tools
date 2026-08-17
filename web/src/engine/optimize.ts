/**
 * Перебор связок «локомотив(ы) + вагоны» под задачу:
 * год, дистанция, груз, длина станции -> рейтинг по прибыли в год.
 * Гружёное плечо и порожний обратный ход считаются с разной скоростью.
 */
import type { Cargo, Train, TrainsMeta } from '../types';
import { canCarryIn } from '../dataset';
import { consistPhysics, type ConsistEntry } from './consist';
import { balancingSpeed } from './physics';
import { buyCost, runningBaseKey, runningCostPerYear } from './costs';
import { transportedGoodsIncome } from './income';
import { daysForDistance, transitPeriodsFromDays } from './units';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
  effectiveDayLength,
  daysPerEconomyYear,
  difficultyPriceFactor,
  loadingTicks,
  subsidyFactor,
  stoppedCostDivisor,
} from './settings';

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
  capacity: number;
  lengthTiles: number;
  loadedSpeedMph: number;
  emptySpeedMph: number;
  /** Гружёным на подъёме (холм заданной длины: на уклоне часть состава). */
  gradeSpeedMph: number;
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

function isAvailable(train: Train, year: number): boolean {
  if (train.intro_year > year) return false;
  if (train.model_life != null && year >= train.intro_year + train.model_life) return false;
  return true;
}

function moneyFor(
  entries: ConsistEntry[],
  meta: TrainsMeta,
  game: GameSettings,
  calc: CalcSettings,
) {
  let buy = 0;
  let running = 0;
  for (const { train, count } of entries) {
    const buyShift =
      train.kind === 'engine'
        ? meta.basecost_shifts.build_engine
        : meta.basecost_shifts.build_wagon;
    const runShift = train.running_cost_base.includes('STEAM')
      ? meta.basecost_shifts.running_steam
      : meta.basecost_shifts.running_diesel;
    buy +=
      count *
      buyCost(
        train.kind,
        train.cost_factor,
        buyShift,
        calc.priceYear,
        game.inflation,
        difficultyPriceFactor(game.constructionCost) *
          (train.kind === 'engine' ? game.basecostLocomotive : game.basecostWagon),
        game.inflationInterest,
        game.inflationFixedDates,
      );
    running +=
      count *
      runningCostPerYear(
        runningBaseKey(train.running_cost_base),
        train.running_cost_factor,
        runShift,
        calc.priceYear,
        game.inflation,
        difficultyPriceFactor(game.vehicleCosts),
        game.inflationInterest,
        game.inflationFixedDates,
      ) *
      effectiveDayLength(game);
  }
  return { buy, running };
}

export function optimizeConsists(
  trains: Train[],
  params: OptimizeParams,
  meta: TrainsMeta,
  topN = 30,
): OptimizeResult[] {
  const { year, distanceTiles, cargo, maxLengthTiles } = params;
  const game = params.game ?? DEFAULT_GAME_SETTINGS;
  const calc = params.calc ?? DEFAULT_CALC_SETTINGS;
  const { capacityIndex, trackType } = calc;
  const payment = cargo.initial_payment_by_economy[params.economyId];
  if (!payment) return [];

  const engines = trains.filter(
    (t) =>
      t.kind === 'engine' &&
      t.base_track_type === trackType &&
      t.power_hp > 0 &&
      isAvailable(t, year) &&
      (params.allowElectric || !isPureElectric(t)),
  );
  const wagons = trains.filter(
    (t) =>
      t.kind === 'wagon' &&
      t.base_track_type === trackType &&
      isAvailable(t, year) &&
      canCarryIn(game, t, cargo) &&
      (t.capacities[capacityIndex] ?? 0) > 0,
  );

  const maxLengthUnits = maxLengthTiles * 16; // тайл = 16 единиц длины (стандартная машина 8 = полтайла)
  const results: OptimizeResult[] = [];

  for (const engine of engines) {
    for (const engineCount of [1, 2]) {
      const engineLength = engineCount * engine.length;
      if (engineLength >= maxLengthUnits) continue;
      for (const wagon of wagons) {
        const wagonCount = Math.floor((maxLengthUnits - engineLength) / wagon.length);
        if (wagonCount <= 0) continue;
        const entries: ConsistEntry[] = [
          { train: engine, count: engineCount },
          { train: wagon, count: wagonCount },
        ];

        const loaded = consistPhysics(entries, cargo, capacityIndex, game);
        if (loaded.stats.capacityForCargo <= 0) continue;
        const empty = consistPhysics(entries, null, capacityIndex, game);

        const loadedSpeed = balancingSpeed(loaded.physics, 0, game.accelerationModel);
        const emptySpeed = balancingSpeed(empty.physics, 0, game.accelerationModel);
        const lengthTiles = (engineLength + wagonCount * wagon.length) / 16;
        const massOnSlope =
          loaded.physics.massT * Math.min(calc.hillTiles / lengthTiles, 1);
        const gradeSpeed = balancingSpeed(loaded.physics, massOnSlope, game.accelerationModel);
        if (loadedSpeed <= 2) continue;

        const daysLoaded = daysForDistance(distanceTiles, loadedSpeed);
        const daysEmpty = daysForDistance(distanceTiles, emptySpeed);
        // стоянки: погрузка на одном конце + разгрузка на другом (вагоны грузятся параллельно)
        const perWagonCapacity = wagon.capacities[capacityIndex] ?? wagon.capacities[2];
        const loadingDays =
          (2 * loadingTicks(perWagonCapacity, wagon.loading_speed ?? 0, game)) / 74;
        const roundTripDays = daysLoaded + daysEmpty + loadingDays;
        // JGRPP: длинный день не меняет рейс в тиках, но календарный год длиннее
        const tripsPerYear = (daysPerEconomyYear(game) * effectiveDayLength(game)) / roundTripDays;

        const incomePerTrip = transportedGoodsIncome(
          loaded.stats.capacityForCargo,
          distanceTiles,
          transitPeriodsFromDays(daysLoaded),
          { currentPayment: payment, transitPeriods: cargo.transit_periods },
          game.cargoAgingRate,
          game.jgrpp ? game.paymentAlgorithm : 'modern',
        ) * (params.subsidised ? subsidyFactor(game.subsidyMultiplier) : 1);
        const { buy, running } = moneyFor(entries, meta, game, calc);
        // на стоянке JGRPP может брать меньше: делим долю времени под погрузкой
        const stoppedShare = roundTripDays > 0 ? loadingDays / roundTripDays : 0;
        const runningEffective =
          running * (1 - stoppedShare + stoppedShare / stoppedCostDivisor(game));
        const profitPerYear = incomePerTrip * tripsPerYear - runningEffective;

        results.push({
          engine,
          engineCount,
          wagon,
          wagonCount,
          capacity: loaded.stats.capacityForCargo,
          lengthTiles,
          loadedSpeedMph: Math.floor((loadedSpeed * 10) / 16),
          emptySpeedMph: Math.floor((emptySpeed * 10) / 16),
          gradeSpeedMph: Math.floor((gradeSpeed * 10) / 16),
          loadingDays,
          roundTripDays,
          tripsPerYear,
          incomePerTrip,
          runningCostPerYear: runningEffective,
          buyCostTotal: buy,
          profitPerYear,
          paybackYears: profitPerYear > 0 ? buy / profitPerYear : null,
        });
      }
    }
  }

  // одна строка на «локомотив × число секций»: лучший вагон для него
  // (вагоны одной вместимости различаются только ценой — при равной прибыли берём дешевле)
  const better = (a: OptimizeResult, b: OptimizeResult) =>
    Math.abs(a.profitPerYear - b.profitPerYear) > 1
      ? a.profitPerYear > b.profitPerYear
      : a.buyCostTotal < b.buyCostTotal;
  const best = new Map<string, OptimizeResult>();
  for (const r of results) {
    const key = `${r.engine.id}|${r.engineCount}`;
    const prev = best.get(key);
    if (!prev || better(r, prev)) best.set(key, r);
  }
  return [...best.values()]
    .sort((a, b) => b.profitPerYear - a.profitPerYear || a.buyCostTotal - b.buyCostTotal)
    .slice(0, topN);
}
